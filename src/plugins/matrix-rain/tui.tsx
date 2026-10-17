import { Plugin } from "@opencode/plugin/tui"
import { createSignal, type Accessor, type Setter } from "solid-js"
import { appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  Rain,
  PALETTES,
  GLYPHS_HALF,
  telemetryFactor,
  paletteFor,
  type Frame,
  type PaletteName,
  type TelemetryFactor,
  type TelemetryMode,
} from "./engine"

// matrix-rain — Phase 3: strip + full-screen screensaver route + /matrix
// settings dialog + persisted preferences via context.storage.store.

const TICK_MS = 66 // ~15 fps cap
const IDLE_ROWS = 2
const GEN_ROWS = 4
const STREAM_ACTIVE_MS = 2500 // step/delta keep-alive window per session
const ROUTE_NAME = "matrix-rain"
const PANEL_NAME = "matrix-rain.panel"
const DEBUG_LOG = join(homedir(), ".local", "share", "opencode", "matrix-rain-debug.log")

const PALETTE_ORDER: readonly PaletteName[] = ["matrix", "korp-red", "theme"]
const SPEED_PRESETS: readonly { label: string; hint: string; value: number }[] = [
  { label: "0.6x · Calm", hint: "slow trickle", value: 0.6 },
  { label: "1.0x · Normal", hint: "default pace", value: 1.0 },
  { label: "1.4x · Fast", hint: "brisk rain", value: 1.4 },
  { label: "1.8x · Overclocked", hint: "max speed", value: 1.8 },
]

interface MatrixPrefs {
  palette: PaletteName
  speed: number
  strip: boolean
}

function debug(line: string): void {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // logging must never break the plugin
  }
}

/** Terminal width via the renderer, with a safe fallback for older shapes. */
function termWidth(renderer: unknown): number {
  const r = renderer as { width?: unknown; _terminalWidth?: unknown; columns?: unknown } | null
  if (r && typeof r.width === "number" && r.width > 0) return r.width
  if (r && typeof r._terminalWidth === "number" && r._terminalWidth > 0) return r._terminalWidth
  if (r && typeof r.columns === "number" && r.columns > 0) return r.columns
  return 80
}

/** Terminal height via the renderer, with a safe fallback. */
function termHeight(renderer: unknown): number {
  const r = renderer as { height?: unknown; _terminalHeight?: unknown; rows?: unknown } | null
  if (r && typeof r.height === "number" && r.height > 0) return r.height
  if (r && typeof r._terminalHeight === "number" && r._terminalHeight > 0) return r._terminalHeight
  if (r && typeof r.rows === "number" && r.rows > 0) return r.rows
  return 24
}

/** Extract sessionID from a V2 server event payload, if session-scoped. */
function eventSessionID(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined
  const d = details as Record<string, unknown>
  if (typeof d.sessionID === "string") return d.sessionID
  for (const key of ["data", "properties", "info", "session"] as const) {
    const sub = d[key]
    if (sub && typeof sub === "object") {
      const s = sub as Record<string, unknown>
      if (typeof s.sessionID === "string") return s.sessionID
      if (key === "session" && typeof s.id === "string") return s.id
    }
  }
  return undefined
}

/** Classify V2 server events into per-session generating/idle transitions. */
function classifyEventType(type: string): TelemetryMode | null {
  if (/^session\.(execution\.(succeeded|failed|interrupted)|idle|deleted|error)$/.test(type)) {
    return "idle"
  }
  if (/^session\.(step\.(started|streamed)|reasoning\.(started|delta)|text\.(started|delta)|tool\.(input|called|progress))/.test(type)) {
    return "generating"
  }
  return null
}

/** Read context.data.session.status(sessionID) if it exposes a clear busy/idle state. */
function readSessionStatus(statusVal: unknown): TelemetryMode | null {
  if (!statusVal) return null
  if (typeof statusVal === "string") {
    if (/idle|done|completed|stopped/i.test(statusVal)) return "idle"
    if (/running|busy|generating|executing|pending|working|active/i.test(statusVal)) return "generating"
  }
  if (typeof statusVal === "object") {
    const s = statusVal as Record<string, unknown>
    const kind = s.type ?? s.status ?? s.state
    if (typeof kind === "string") return readSessionStatus(kind)
    if (typeof s.busy === "boolean") return s.busy ? "generating" : "idle"
    if (typeof s.running === "boolean") return s.running ? "generating" : "idle"
  }
  return null
}

function isPaletteName(v: unknown): v is PaletteName {
  return v === "matrix" || v === "korp-red" || v === "theme"
}

/**
 * Full-screen screensaver telemetry factor:
 * unlike the 2-row idle strip, a full-screen saver should look like classic
 * continuous Matrix rain when idle, and surge harder when generating.
 */
function saverTelemetryFactor(mode: TelemetryMode, permissionPending: boolean): TelemetryFactor {
  if (permissionPending) return { speed: 0.12, lenScale: 0.55, density: 0.5, glitch: 1 }
  if (mode === "generating") return { speed: 1.35, lenScale: 1.15, density: 0.88, glitch: 0 }
  return { speed: 0.78, lenScale: 0.95, density: 0.68, glitch: 0 }
}

interface SessionRain {
  readonly sid: string
  readonly engine: Rain
  readonly frame: Accessor<Frame | undefined>
  readonly setFrame: Setter<Frame | undefined>
  readonly mode: Accessor<TelemetryMode>
  readonly setMode: Setter<TelemetryMode>
  width: number
  height: number
}

export default Plugin.define({
  id: "local.matrix-rain",
  setup(context) {
    const [prefs, updatePrefs] = context.storage.store("prefs", {
      initial: {
        palette: "matrix" as PaletteName,
        speed: 1.0,
        strip: true,
      } satisfies MatrixPrefs,
    })

    function activePaletteName(): PaletteName {
      return isPaletteName(prefs.palette) ? prefs.palette : "matrix"
    }

    function activeSpeed(): number {
      const s = Number(prefs.speed)
      return Number.isFinite(s) && s >= 0.2 && s <= 3 ? s : 1.0
    }

    function isStripEnabled(): boolean {
      return prefs.strip !== false
    }

    const sessionActivity = new Map<string, { mode: TelemetryMode; updatedAt: number }>()
    const sessionRains = new Map<string, SessionRain>()

    // Dedicated full-screen screensaver engine & state
    const saverEngine = new Rain({ density: 0.88, maxRows: 200 })
    const [saverFrame, setSaverFrame] = createSignal<Frame | undefined>(undefined)
    const [saverMode, setSaverMode] = createSignal<TelemetryMode>("idle")
    let saverWidth = 0
    let saverHeight = 0
    let saverReturnSessionID: string | undefined

    // Sidecar panel engine & state (SessionRain-like, but width-bound to panel).
    const panelEngine = new Rain({ density: 0.88, maxRows: 200 })
    const [panelFrame, setPanelFrame] = createSignal<Frame | undefined>(undefined)
    const [panelMode, setPanelMode] = createSignal<TelemetryMode>("idle")
    let panelWidth = 0
    let panelHeight = 0
    let panelSessionID: string | undefined
    let panelOpen = false
    let panelForceFullscreen = false

    // Narrow sidebar block (sidebar.content) — stacks with other sidebar plugins.
    const SIDEBAR_ROWS = 6
    const sidebarEngine = new Rain({ density: 0.88, maxRows: SIDEBAR_ROWS, glyphs: GLYPHS_HALF })
    const [sidebarFrame, setSidebarFrame] = createSignal<Frame | undefined>(undefined)
    const [sidebarMode, setSidebarMode] = createSignal<TelemetryMode>("idle")
    let sidebarWidth = 0
    let sidebarSessionID: string | undefined

    function stepSidebarNow(now: number, dt: number): void {
      const sid = currentViewedSessionID() ?? sidebarSessionID
      if (sid) sidebarSessionID = sid
      const nextMode = resolveModeForSession(sid, now)
      if (nextMode !== sidebarMode()) setSidebarMode(nextMode)
      // The sidebar is narrow; the host may pass width via slot props. Until
      // mounted, fall back to a conservative sidebar estimate.
      const cols = Math.max(8, sidebarWidth > 0 ? sidebarWidth : 28)
      if (sidebarEngine.width !== cols || sidebarEngine.rows !== SIDEBAR_ROWS) {
        sidebarEngine.resize(cols, SIDEBAR_ROWS)
      }
      const factor = saverTelemetryFactor(nextMode, false)
      sidebarEngine.step(dt, factor, activeSpeed(), now)
      setSidebarFrame(sidebarEngine.frame(factor, paletteFor(activePaletteName())))
    }

    function openSidePanel(): void {
      const sid = currentViewedSessionID()
      if (sid) panelSessionID = sid
      panelOpen = true
      stepPanelNow(Date.now(), TICK_MS)
      context.ui.panel.open(PANEL_NAME, {
        ...(panelForceFullscreen ? { presentation: "fullscreen" as const } : {}),
      })
    }

    function currentViewedSessionID(): string | undefined {
      try {
        const route = context.ui.router.current() as
          | { type?: string; name?: string; sessionID?: string; data?: { sessionID?: string } }
          | undefined
        if (route?.type === "session" && typeof route.sessionID === "string") {
          return route.sessionID
        }
        if (route?.type === "plugin" && route.name === ROUTE_NAME) {
          const fromData = route.data?.sessionID
          if (typeof fromData === "string") return fromData
          return saverReturnSessionID
        }
      } catch {
        // ignore
      }
      return undefined
    }

    function isSaverActive(): boolean {
      try {
        const route = context.ui.router.current() as { type?: string; name?: string } | undefined
        return route?.type === "plugin" && route?.name === ROUTE_NAME
      } catch {
        return false
      }
    }

    function stepPanelNow(now: number, dt: number): void {
      const sid = currentViewedSessionID() ?? panelSessionID
      if (sid) panelSessionID = sid
      const nextMode = resolveModeForSession(sid, now)
      if (nextMode !== panelMode()) setPanelMode(nextMode)
      // Panel owns its height; the slot reports it via render props. Until
      // mounted, fall back to a medium-height sidecar estimate.
      const cols = Math.max(8, Math.floor(termWidth(context.renderer) / 4))
      const rows = Math.max(8, termHeight(context.renderer) - 10)
      if (cols !== panelWidth || rows !== panelHeight) {
        panelWidth = cols
        panelHeight = rows
        panelEngine.resize(Math.max(1, Math.floor(cols / 2)), rows)
      }
      const factor = saverTelemetryFactor(nextMode, false)
      panelEngine.step(dt, factor, activeSpeed(), now)
      setPanelFrame(panelEngine.frame(factor, paletteFor(activePaletteName())))
    }

    function stepSaverNow(now: number, dt: number): void {
      const w = termWidth(context.renderer)
      const fullRows = Math.max(4, termHeight(context.renderer) - 2)
      if (w !== saverWidth || fullRows !== saverHeight) {
        saverWidth = w
        saverHeight = fullRows
        saverEngine.resize(Math.max(1, Math.floor(w / 2)), fullRows)
      }
      const viewedSid = currentViewedSessionID() ?? saverReturnSessionID
      const nextSaverMode = resolveModeForSession(viewedSid, now)
      if (nextSaverMode !== saverMode()) setSaverMode(nextSaverMode)
      const factor = saverTelemetryFactor(nextSaverMode, false)
      saverEngine.step(dt, factor, activeSpeed(), now)
      setSaverFrame(saverEngine.frame(factor, paletteFor(activePaletteName())))
    }

    function openScreensaver(): void {
      const sid = currentViewedSessionID()
      if (sid) saverReturnSessionID = sid
      stepSaverNow(Date.now(), TICK_MS)
      context.ui.router.navigate({
        type: "plugin",
        name: ROUTE_NAME,
        data: sid ? { sessionID: sid } : undefined,
      })
    }

    function closeScreensaver(): void {
      const sid = currentViewedSessionID() ?? saverReturnSessionID
      if (sid) {
        context.ui.router.navigate({ type: "session", sessionID: sid })
      } else {
        context.ui.router.navigate({ type: "home" })
      }
    }

    async function cyclePalette(): Promise<void> {
      const cur = activePaletteName()
      const next = PALETTE_ORDER[(PALETTE_ORDER.indexOf(cur) + 1) % PALETTE_ORDER.length]
      await updatePrefs((draft) => {
        draft.palette = next
      })
      context.ui.toast.show({
        title: "Matrix Rain",
        message: `Palette: ${next}`,
        variant: "info",
        duration: 1800,
      })
    }

    async function adjustSpeed(delta: number): Promise<void> {
      const cur = activeSpeed()
      const next = Math.round(Math.max(0.4, Math.min(2.4, cur + delta)) * 10) / 10
      await updatePrefs((draft) => {
        draft.speed = next
      })
      context.ui.toast.show({
        title: "Matrix Rain",
        message: `Speed: ${next.toFixed(1)}x`,
        variant: "info",
        duration: 1800,
      })
    }

    async function openSettingsDialog(): Promise<void> {
      const curPalette = activePaletteName()
      const curSpeed = activeSpeed()
      const stripOn = isStripEnabled()
      const choice = await context.ui.dialog.select({
        title: `Matrix Rain (${curPalette} · ${curSpeed.toFixed(1)}x · strip ${stripOn ? "ON" : "OFF"})`,
        options: [
          {
            title: "Full-Screen Screensaver",
            value: "surface:saver",
            category: "Surface",
            description: "q/esc to exit",
          },
          {
            title: stripOn ? "Hide Composer Strip" : "Show Composer Strip",
            value: "surface:strip",
            category: "Surface",
            description: stripOn ? "currently ON" : "currently OFF",
          },
          {
            title: "Open Side Panel",
            value: "surface:panel",
            category: "Surface",
            description: "rain beside chat (f big)",
          },
          {
            title: "Matrix Green",
            value: "palette:matrix",
            category: "Palette",
            description: curPalette === "matrix" ? "classic · active" : "classic green",
          },
          {
            title: "Korp Red",
            value: "palette:korp-red",
            category: "Palette",
            description: curPalette === "korp-red" ? "crimson · active" : "crimson/blood",
          },
          {
            title: "Theme Cyan",
            value: "palette:theme",
            category: "Palette",
            description: curPalette === "theme" ? "cyan · active" : "teal/cyan",
          },
          ...SPEED_PRESETS.map((preset) => {
            const active = Math.abs(curSpeed - preset.value) < 0.05
            return {
              title: preset.label,
              value: `speed:${preset.value}`,
              category: "Speed",
              description: active ? `${preset.hint} · active` : preset.hint,
            }
          }),
        ],
      })

      if (!choice) return
      if (choice === "surface:saver") {
        openScreensaver()
        return
      }
      if (choice === "surface:strip") {
        const next = !isStripEnabled()
        await updatePrefs((draft) => {
          draft.strip = next
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Composer strip ${next ? "enabled" : "hidden"}`,
          variant: "info",
          duration: 2000,
        })
        return
      }
      if (choice === "surface:panel") {
        openSidePanel()
        return
      }
      if (choice.startsWith("palette:")) {
        const next = choice.slice("palette:".length)
        if (isPaletteName(next)) {
          await updatePrefs((draft) => {
            draft.palette = next
          })
          context.ui.toast.show({
            title: "Matrix Rain",
            message: `Palette set to ${next}`,
            variant: "success",
            duration: 2000,
          })
        }
        return
      }
      if (choice.startsWith("speed:")) {
        const val = Number(choice.slice("speed:".length))
        if (Number.isFinite(val) && val > 0) {
          await updatePrefs((draft) => {
            draft.speed = val
          })
          context.ui.toast.show({
            title: "Matrix Rain",
            message: `Speed set to ${val.toFixed(1)}x`,
            variant: "success",
            duration: 2000,
          })
        }
      }
    }

    async function handleSlashCommand(rawArg?: string): Promise<void> {
      const arg = (rawArg ?? "").trim().toLowerCase()
      if (!arg) {
        await openSettingsDialog()
        return
      }
      if (arg === "saver" || arg === "screensaver" || arg === "full" || arg === "fullscreen") {
        openScreensaver()
        return
      }
      if (arg === "panel" || arg === "side" || arg === "sidecar") {
        openSidePanel()
        return
      }
      if (arg === "strip" || arg === "toggle") {
        const next = !isStripEnabled()
        await updatePrefs((draft) => {
          draft.strip = next
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Composer strip ${next ? "enabled" : "hidden"}`,
          variant: "info",
          duration: 2000,
        })
        return
      }
      if (isPaletteName(arg)) {
        await updatePrefs((draft) => {
          draft.palette = arg
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Palette set to ${arg}`,
          variant: "success",
          duration: 2000,
        })
        return
      }
      const num = Number(arg.replace(/x$/, ""))
      if (Number.isFinite(num) && num >= 0.3 && num <= 3) {
        await updatePrefs((draft) => {
          draft.speed = num
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Speed set to ${num.toFixed(1)}x`,
          variant: "success",
          duration: 2000,
        })
        return
      }
      await openSettingsDialog()
    }

    function getSessionRain(sid: string): SessionRain {
      let existing = sessionRains.get(sid)
      if (existing) return existing
      const w = termWidth(context.renderer)
      const h = IDLE_ROWS
      const engine = new Rain({ density: 0.85, maxRows: GEN_ROWS })
      engine.resize(Math.max(1, Math.floor(w / 2)), h)
      const [frame, setFrame] = createSignal<Frame | undefined>(undefined)
      const [mode, setMode] = createSignal<TelemetryMode>("idle")
      existing = { sid, engine, frame, setFrame, mode, setMode, width: w, height: h }
      sessionRains.set(sid, existing)
      return existing
    }

    function resolveModeForSession(sid: string | undefined, now: number): TelemetryMode {
      if (!sid || sid === "__default__") return "idle"
      try {
        const rawStatus = context.data.session.status(sid)
        const fromStatus = readSessionStatus(rawStatus)
        if (fromStatus) return fromStatus
      } catch {
        // fallback to event timestamps below
      }

      let family: readonly string[] = [sid]
      try {
        const fam = context.data.session.family(sid)
        if (Array.isArray(fam) && fam.length > 0) family = fam
      } catch {
        // ignore
      }

      for (const id of family) {
        const entry = sessionActivity.get(id)
        if (entry && entry.mode === "generating" && now - entry.updatedAt <= STREAM_ACTIVE_MS) {
          return "generating"
        }
      }
      return "idle"
    }

    const seen = new Set<string>()
    const stopListen = context.data.listen((event: unknown) => {
      const details = (event as { details?: { type?: string } })?.details
      const type = details?.type ?? ""
      if (!type) return
      const sid = eventSessionID(details)
      if (!seen.has(type)) {
        seen.add(type)
        if (seen.size <= 100) debug(`event ${type} sid=${sid ?? "none"}`)
      }
      if (!sid) return
      const next = classifyEventType(type)
      if (next) {
        sessionActivity.set(sid, { mode: next, updatedAt: Date.now() })
      }
    })

    let last = Date.now()
    const timer = setInterval(() => {
      try {
        const now = Date.now()
        const dt = Math.min(200, now - last)
        last = now

        if (isSaverActive()) {
          stepSaverNow(now, dt)
          return
        }

        if (panelOpen) {
          stepPanelNow(now, dt)
        }

        stepSidebarNow(now, dt)

        if (!isStripEnabled()) return

        const w = termWidth(context.renderer)
        const palette = paletteFor(activePaletteName())
        const speedScale = activeSpeed()
        const viewedSid = currentViewedSessionID()

        for (const state of sessionRains.values()) {
          const targetSid = state.sid === "__default__" ? (viewedSid ?? "__default__") : state.sid
          const prevMode = state.mode()
          const nextMode = resolveModeForSession(targetSid, now)
          if (nextMode !== prevMode) {
            state.setMode(nextMode)
            if (prevMode === "generating" && nextMode === "idle") {
              state.engine.thinOffscreen(0.4)
            }
          }

          const h = nextMode === "generating" ? GEN_ROWS : IDLE_ROWS
          if (w !== state.width || h !== state.height) {
            state.width = w
            state.height = h
            state.engine.resize(Math.max(1, Math.floor(w / 2)), h)
          }

          const factor = telemetryFactor(nextMode, false)
          state.engine.step(dt, factor, speedScale, now)
          state.setFrame(state.engine.frame(factor, palette))
        }
      } catch (error) {
        debug(`tick error: ${String(error)}`)
      }
    }, TICK_MS)

    context.keymap.layer(() => ({
      mode: "global",
      priority: 20,
      commands: [
        {
          id: "matrix-rain.settings",
          title: "Matrix Rain: Settings & Screensaver",
          group: "Matrix Rain",
          palette: true,
          slash: { name: "matrix", aliases: ["rain"], arguments: true },
          run: async (input) => {
            await handleSlashCommand(input)
          },
        },
        {
          id: "matrix-rain.screensaver",
          title: "Matrix Rain: Open Screensaver",
          group: "Matrix Rain",
          palette: true,
          run: () => {
            openScreensaver()
          },
        },
        {
          id: "matrix-rain.sidecar",
          title: "Matrix Rain: Open Side Panel",
          group: "Matrix Rain",
          palette: true,
          run: () => {
            openSidePanel()
          },
        },
        {
          id: "matrix-rain.saver.exit.q",
          title: "Exit Matrix Screensaver",
          bind: "q",
          enabled: () => isSaverActive(),
          run: () => closeScreensaver(),
        },
        {
          id: "matrix-rain.saver.exit.esc",
          title: "Exit Matrix Screensaver",
          bind: "escape",
          enabled: () => isSaverActive(),
          run: () => closeScreensaver(),
        },
        {
          id: "matrix-rain.saver.palette",
          title: "Cycle Matrix Palette",
          bind: "p",
          enabled: () => isSaverActive(),
          run: () => {
            void cyclePalette()
          },
        },
        {
          id: "matrix-rain.saver.faster",
          title: "Increase Matrix Speed",
          bind: "=",
          enabled: () => isSaverActive(),
          run: () => {
            void adjustSpeed(0.2)
          },
        },
        {
          id: "matrix-rain.saver.slower",
          title: "Decrease Matrix Speed",
          bind: "-",
          enabled: () => isSaverActive(),
          run: () => {
            void adjustSpeed(-0.2)
          },
        },
      ],
      bindings: [
        "matrix-rain.saver.exit.q",
        "matrix-rain.saver.exit.esc",
        "matrix-rain.saver.palette",
        "matrix-rain.saver.faster",
        "matrix-rain.saver.slower",
      ],
    }))

    /**
     * Panel contribution component. The keymap layer is created inside the
     * component (per the session.panel docs pattern) so its bindings are
     * active while the panel owns input, and disposed with the panel.
     */
    function MatrixPanel(panel: {
      sessionID?: unknown
      width?: unknown
      toggleFullscreen?: () => void
      close?: () => void
    }) {
      context.keymap.layer(() => ({
        mode: "global",
        priority: 50,
        commands: [
          {
            id: "matrix-rain.panel.exit.q",
            title: "Close Matrix Side Panel",
            bind: "q",
            run: () => {
              panelOpen = false
              if (typeof panel.close === "function") panel.close()
              else context.ui.panel.close()
            },
          },
          {
            id: "matrix-rain.panel.exit.esc",
            title: "Close Matrix Side Panel",
            bind: "escape",
            run: () => {
              panelOpen = false
              if (typeof panel.close === "function") panel.close()
              else context.ui.panel.close()
            },
          },
          {
            id: "matrix-rain.panel.fullscreen",
            title: "Toggle Matrix Panel Fullscreen",
            bind: "f",
            run: () => {
              if (typeof panel.toggleFullscreen === "function") panel.toggleFullscreen()
              else {
                panelForceFullscreen = !panelForceFullscreen
                context.ui.panel.open(PANEL_NAME, {
                  ...(panelForceFullscreen ? { presentation: "fullscreen" as const } : {}),
                })
              }
            },
          },
          {
            id: "matrix-rain.panel.palette",
            title: "Cycle Matrix Palette",
            bind: "p",
            run: () => {
              void cyclePalette()
            },
          },
          {
            id: "matrix-rain.panel.faster",
            title: "Increase Matrix Speed",
            bind: "=",
            run: () => {
              void adjustSpeed(0.2)
            },
          },
          {
            id: "matrix-rain.panel.slower",
            title: "Decrease Matrix Speed",
            bind: "-",
            run: () => {
              void adjustSpeed(-0.2)
            },
          },
        ],
        bindings: [
          "matrix-rain.panel.exit.q",
          "matrix-rain.panel.exit.esc",
          "matrix-rain.panel.fullscreen",
          "matrix-rain.panel.palette",
          "matrix-rain.panel.faster",
          "matrix-rain.panel.slower",
        ],
      }))

      return (
        <box
          flexDirection="column"
          backgroundColor={PALETTES[activePaletteName()].bg}
          onUnmount={() => {
            panelOpen = false
          }}
        >
          <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
            <text fg={PALETTES[activePaletteName()].bright}>
              {(() => {
                const statusLabel = panelMode() === "generating" ? "GENERATING" : "IDLE"
                const sid = panelSessionID
                let title = "panel"
                if (sid) {
                  try {
                    title = context.data.session.get(sid)?.title ?? sid.slice(0, 12)
                  } catch {
                    title = sid.slice(0, 12)
                  }
                }
                return `[ MATRIX // ${statusLabel} · ${title} ]`
              })()}
            </text>
            <text fg={PALETTES[activePaletteName()].mid}>
              {`palette:${activePaletteName()} (p) · ${activeSpeed().toFixed(1)}x (-/=) · f big · q close`}
            </text>
          </box>
          <box flexDirection="column">
            {(() => {
              const f = panelFrame()
              if (!f) return null
              return f.rows.map((row) => (
                <box flexDirection="row">
                  {row.map((cell) => (
                    <text fg={cell ? cell.fg : undefined}>{cell ? cell.ch : "  "}</text>
                  ))}
                </box>
              ))
            })()}
          </box>
        </box>
      )
    }

    const unregisterPanel = context.ui.slot({
      append: "session.panel",
      render: (props: unknown) => {
        const p = props as {
          name?: unknown
          sessionID?: unknown
          width?: unknown
          presentation?: unknown
          toggleFullscreen?: () => void
          close?: () => void
          focus?: () => void
        }
        if (p?.name !== PANEL_NAME) return null
        if (typeof p.sessionID === "string" && p.sessionID) panelSessionID = p.sessionID
        panelOpen = true
        // Adapt the engine to the host-owned panel size when reported.
        const cols = typeof p.width === "number" && p.width > 0 ? Math.floor(p.width) : 0
        if (cols > 0) {
          const rows = Math.max(4, termHeight(context.renderer) - 8)
          if (cols !== panelWidth || rows !== panelHeight) {
            panelWidth = cols
            panelHeight = rows
            panelEngine.resize(Math.max(1, Math.floor(cols / 2)), rows)
            stepPanelNow(Date.now(), TICK_MS)
          }
        }

        return (
          <MatrixPanel
            sessionID={p.sessionID}
            width={p.width}
            toggleFullscreen={p.toggleFullscreen}
            close={p.close}
          />
        )
      },
    })

    const unregisterSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props: unknown) => {
        const p = props as { sessionID?: unknown; width?: unknown } | undefined
        if (typeof p?.sessionID === "string" && p.sessionID) sidebarSessionID = p.sessionID
        const cols = typeof p?.width === "number" && p.width > 0 ? Math.floor(p.width) : 0
        if (cols > 0 && cols !== sidebarWidth) {
          sidebarWidth = cols
          sidebarEngine.resize(cols, SIDEBAR_ROWS)
          stepSidebarNow(Date.now(), TICK_MS)
        }
        return (
          <box flexDirection="column">
            <text fg={PALETTES[activePaletteName()].bright}>
              {`▶ Matrix Rain · ${sidebarMode() === "generating" ? "GENERATING" : "IDLE"}`}
            </text>
            <box flexDirection="column">
              {(() => {
                const f = sidebarFrame()
                if (!f) return null
                return f.rows.map((row) => (
                  <box flexDirection="row">
                    {row.map((cell) => (
                      <text fg={cell ? cell.fg : undefined}>{cell ? cell.ch : " "}</text>
                    ))}
                  </box>
                ))
              })()}
            </box>
          </box>
        )
      },
    })

    const unregisterRoute = context.ui.router.register({
      name: ROUTE_NAME,
      render: ({ data }) => {
        const d = data as { sessionID?: string } | undefined
        if (d && typeof d.sessionID === "string") {
          saverReturnSessionID = d.sessionID
        }

        return (
          <box flexDirection="column" backgroundColor={PALETTES[activePaletteName()].bg}>
            <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
              <text fg={PALETTES[activePaletteName()].bright}>
                {(() => {
                  const statusLabel = saverMode() === "generating" ? "GENERATING" : "IDLE"
                  const sid = saverReturnSessionID
                  let title = "no session"
                  if (sid) {
                    try {
                      title = context.data.session.get(sid)?.title ?? sid.slice(0, 12)
                    } catch {
                      title = sid.slice(0, 12)
                    }
                  }
                  return `[ MATRIX // ${statusLabel} · ${title} ]`
                })()}
              </text>
              <text fg={PALETTES[activePaletteName()].mid}>
                {`palette:${activePaletteName()} (p) · speed:${activeSpeed().toFixed(1)}x (-/=) · q/esc exit`}
              </text>
            </box>
            <box flexDirection="column">
              {(() => {
                const f = saverFrame()
                if (!f) return null
                return f.rows.map((row) => (
                  <box flexDirection="row">
                    {row.map((cell) => (
                      <text fg={cell ? cell.fg : undefined}>{cell ? cell.ch : "  "}</text>
                    ))}
                  </box>
                ))
              })()}
            </box>
          </box>
        )
      },
    })

    const slot = context.ui.slot({
      append: "session.composer.top",
      render: (props: unknown) => {
        if (!isStripEnabled()) return null
        const p = props as { sessionID?: string } | undefined
        const sid =
          (p && typeof p.sessionID === "string" ? p.sessionID : currentViewedSessionID()) ??
          "__default__"
        const state = getSessionRain(sid)
        const f = state.frame()
        if (!f) return null
        const visible = state.mode() === "generating" ? GEN_ROWS : IDLE_ROWS
        return (
          <box flexDirection="column" backgroundColor={f.bg}>
            {f.rows.slice(0, visible).map((row) => (
              <box flexDirection="row">
                {row.map((cell) => (
                  <text fg={cell ? cell.fg : undefined}>{cell ? cell.ch : "  "}</text>
                ))}
              </box>
            ))}
          </box>
        )
      },
    })

    return () => {
      clearInterval(timer)
      stopListen()
      sessionRains.clear()
      panelOpen = false
      unregisterPanel()
      unregisterSidebar()
      unregisterRoute()
      if (typeof slot === "function") slot()
      else if (slot && typeof slot.dispose === "function") slot.dispose()
    }
  },
})
