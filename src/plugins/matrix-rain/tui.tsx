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
const DEBUG_LOG = join(homedir(), ".local", "share", "opencode", "matrix-rain-debug.log")

const PALETTE_ORDER: readonly PaletteName[] = ["matrix", "korp-red", "theme"]

/**
 * Auto-activate return keys: every letter/digit/space/enter except q (exit),
 * p (palette) and -/=/ (speed), which stay live as menu keys.
 */
const AUTO_RETURN_BINDS: readonly { id: string; bind: string }[] = [
  ..."abcdefghijklmnorstuvwxyz",
  ..."0123456789",
  "space",
  "enter",
  "up",
  "down",
  "left",
  "right",
  "backspace",
  "tab",
].map((bind) => ({ id: `matrix-rain.activate.return.${bind}`, bind }))

/**
 * Keystroke observer for auto-activate: same printable key set, but every
 * command's `run` returns false so keyboard dispatch continues — the key
 * still reaches the composer. Used purely as a "user is present" signal;
 * composer keystrokes generate no server events, so this is the only way
 * typing can reset the idle timer. Disabled unless auto-activate is on.
 */
const INPUT_OBSERVER_BINDS: readonly { id: string; bind: string }[] = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  "space",
  "enter",
].map((bind) => ({ id: `matrix-rain.input.${bind}`, bind }))

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
  sidebarOpen?: boolean
  autoActivate?: boolean
  autoActivateMinutes?: number
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

/** Extract a tool name from a session.tool.* event payload, defensively. */
function eventToolName(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined
  const d = details as Record<string, unknown>
  for (const key of ["tool", "toolName", "name"] as const) {
    const v = d[key]
    if (typeof v === "string" && v) return v
  }
  for (const key of ["data", "properties", "info"] as const) {
    const sub = d[key]
    if (sub && typeof sub === "object") {
      const s = sub as Record<string, unknown>
      for (const k2 of ["tool", "toolName", "name"] as const) {
        const v = s[k2]
        if (typeof v === "string" && v) return v
      }
    }
  }
  return undefined
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
        sidebarOpen: true,
        autoActivate: false,
        autoActivateMinutes: 10,
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

    /** Disclosure state of the sidebar block (header always visible). */
    function isSidebarOpen(): boolean {
      return prefs.sidebarOpen !== false
    }

    /** Click/command toggle for the sidebar disclosure. Persisted so the
     * collapsed state survives restarts (mirrors the native MCP section). */
    async function toggleSidebarOpen(): Promise<void> {
      const next = !isSidebarOpen()
      await updatePrefs((draft) => {
        draft.sidebarOpen = next
      })
    }

    function isAutoActivateEnabled(): boolean {
      return prefs.autoActivate === true
    }

    function autoActivateMinutes(): number {
      const m = Number(prefs.autoActivateMinutes)
      return Number.isFinite(m) && m >= 0.1 && m <= 120 ? m : 10
    }

    function formatIdleMinutes(m: number): string {
      return m < 1 ? `${Math.round(m * 60)}s` : `${m} min`
    }

    const sessionActivity = new Map<string, { mode: TelemetryMode; updatedAt: number }>()
    /** per-session last activity timestamp (any server event carrying the sid) */
    const viewedActivityAt = new Map<string, number>()
    let prevViewedSid: string | undefined
    /** true only while the screensaver was auto-activated (changes return keys) */
    let autoActivateEngaged = false
    /** last keystroke seen by the pass-through observer (0 = none yet) */
    let lastKeystrokeAt = 0
    /** cap for one-time observer diagnostics in the debug log */
    let keystrokeLogs = 0
    /** when the saver was auto-activated; guards the external-dismissal check */
    let autoActivateAt = 0
    /** sessionIDs with a permission prompt pending; cleared on permission.replied */
    const pendingPermissions = new Set<string>()
    const sessionRains = new Map<string, SessionRain>()

    // Dedicated full-screen screensaver engine & state
    const saverEngine = new Rain({ density: 0.88, maxRows: 200 })
    const [saverFrame, setSaverFrame] = createSignal<Frame | undefined>(undefined)
    const [saverMode, setSaverMode] = createSignal<TelemetryMode>("idle")
    const [saverPending, setSaverPending] = createSignal(false)
    const [autoActivateUp, setAutoActivateUp] = createSignal(false)
    let saverWidth = 0
    let saverHeight = 0
    let saverReturnSessionID: string | undefined

    // Narrow sidebar block (sidebar.content) — stacks with other sidebar plugins.
    const SIDEBAR_ROWS = 6
    const sidebarEngine = new Rain({ density: 0.88, maxRows: SIDEBAR_ROWS, glyphs: GLYPHS_HALF })
    const [sidebarFrame, setSidebarFrame] = createSignal<Frame | undefined>(undefined)
    const [sidebarMode, setSidebarMode] = createSignal<TelemetryMode>("idle")
    const [sidebarPending, setSidebarPending] = createSignal(false)
    let sidebarWidth = 0
    let sidebarPropsDumped = false
    let sidebarSessionID: string | undefined

    function stepSidebarNow(now: number, dt: number): void {
      const sid = currentViewedSessionID() ?? sidebarSessionID
      if (sid) sidebarSessionID = sid
      const { mode: nextMode, permissionPending } = resolveSessionState(sid, now)
      if (nextMode !== sidebarMode()) setSidebarMode(nextMode)
      if (permissionPending !== sidebarPending()) setSidebarPending(permissionPending)
      // The host passes no width in sidebar.content props (verified by dump:
      // {sessionID} only). The sidebar tracks ~1/3 of terminal width in the
      // host layout, so derive the estimate from the terminal size.
      const cols = Math.max(8, sidebarWidth > 0 ? sidebarWidth : Math.floor(termWidth(context.renderer) / 3))
      if (sidebarEngine.width !== cols || sidebarEngine.rows !== SIDEBAR_ROWS) {
        sidebarEngine.resize(cols, SIDEBAR_ROWS)
      }
      const factor = saverTelemetryFactor(nextMode, permissionPending)
      sidebarEngine.step(dt, factor, activeSpeed(), now)
      setSidebarFrame(sidebarEngine.frame(factor, paletteFor(activePaletteName())))
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

    function stepSaverNow(now: number, dt: number): void {
      const w = termWidth(context.renderer)
      const fullRows = Math.max(4, termHeight(context.renderer) - 2)
      if (w !== saverWidth || fullRows !== saverHeight) {
        saverWidth = w
        saverHeight = fullRows
        saverEngine.resize(Math.max(1, Math.floor(w / 2)), fullRows)
      }
      const viewedSid = currentViewedSessionID() ?? saverReturnSessionID
      const { mode: nextSaverMode, permissionPending: saverPermission } = resolveSessionState(
        viewedSid,
        now,
      )
      if (nextSaverMode !== saverMode()) setSaverMode(nextSaverMode)
      if (saverPermission !== saverPending()) setSaverPending(saverPermission)
      const factor = saverTelemetryFactor(nextSaverMode, saverPermission)
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

    /** Phase 6 auto-activate: open the saver after idle, with any-key return. */
    function openScreensaverAuto(): void {
      autoActivateEngaged = true
      autoActivateAt = Date.now()
      setAutoActivateUp(true)
      openScreensaver()
      debug("auto-activate engaged")
    }

    function closeScreensaver(): void {
      debug(
        `saver close via handler sid=${currentViewedSessionID() ?? saverReturnSessionID ?? "none"} engaged=${autoActivateEngaged}`,
      )
      autoActivateEngaged = false
      setAutoActivateUp(false)
      const sid = currentViewedSessionID() ?? saverReturnSessionID
      // Returning counts as activity so the timer restarts clean.
      if (sid) viewedActivityAt.set(sid, Date.now())
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
            title: isAutoActivateEnabled() ? "Disable Auto-Activate" : "Enable Auto-Activate",
            value: "activate:toggle",
            category: "Surface",
            description: `${formatIdleMinutes(autoActivateMinutes())} idle → screensaver`,
          },
          {
            title: isSidebarOpen() ? "Collapse Sidebar Block" : "Expand Sidebar Block",
            value: "sidebar:toggle",
            category: "Surface",
            description: isSidebarOpen() ? "▸ collapse" : "▶ expand",
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
      if (choice === "sidebar:toggle") {
        const next = !isSidebarOpen()
        await updatePrefs((draft) => {
          draft.sidebarOpen = next
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Sidebar block ${next ? "expanded" : "collapsed"}`,
          variant: "info",
          duration: 2000,
        })
        return
      }
      if (choice === "activate:toggle") {
        const next = !isAutoActivateEnabled()
        await updatePrefs((draft) => {
          draft.autoActivate = next
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: next ? `Auto-activate ON · ${formatIdleMinutes(autoActivateMinutes())}` : "Auto-activate OFF",
          variant: "success",
          duration: 2200,
        })
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
      if (arg === "status") {
        // Read-only snapshot: a plain alert dialog, nothing selectable.
        await context.ui.dialog.alert({
          title: "Matrix Rain — current settings",
          message: [
            `Palette: ${activePaletteName()}`,
            `Speed: ${activeSpeed().toFixed(1)}x`,
            `Composer strip: ${isStripEnabled() ? "ON" : "OFF"}`,
            `Sidebar block: ${isSidebarOpen() ? "expanded" : "collapsed"}`,
            `Auto-activate: ${isAutoActivateEnabled() ? `ON · ${formatIdleMinutes(autoActivateMinutes())} idle` : "OFF"}`,
          ].join("\n"),
        })
        return
      }
      if (arg === "help" || arg === "?") {
        // Self-documenting cheat sheet: every shorthand is a row; picking one
        // runs it. Stays open until dismissed, unlike a toast.
        const choice = await context.ui.dialog.select({
          title: "/matrix shorthands — pick one to run",
          options: [
            { title: "/matrix saver", value: "h:saver", category: "Surface", description: "full-screen screensaver" },
            { title: "/matrix strip", value: "h:strip", category: "Surface", description: "show/hide composer strip" },
            { title: "/matrix sidebar", value: "h:sidebar", category: "Surface", description: "collapse/expand sidebar block" },
            { title: "/matrix activate [n]", value: "h:activate", category: "Surface", description: "auto screensaver after n idle (default 10)" },
            { title: "/matrix <palette>", value: "h:palette", category: "Palette", description: "matrix | korp-red | theme — pick in dialog" },
            { title: "/matrix status", value: "h:status", category: "Help", description: "show all current settings" },
            { title: "/matrix", value: "h:dialog", category: "Help", description: "settings dialog — all options as rows" },
          ],
        })
        if (!choice) return
        const mapped: Record<string, string> = {
          "h:saver": "saver",
          "h:strip": "strip",
          "h:sidebar": "sidebar",
          "h:activate": "activate",
          "h:status": "status",
          "h:palette": "",
          "h:dialog": "",
        }
        await handleSlashCommand(mapped[choice] ?? "")
        return
      }
      if (arg === "saver" || arg === "screensaver" || arg === "full" || arg === "fullscreen") {
        openScreensaver()
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
      if (arg === "sidebar" || arg === "disclose") {
        const next = !isSidebarOpen()
        await updatePrefs((draft) => {
          draft.sidebarOpen = next
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: `Sidebar block ${next ? "expanded" : "collapsed"}`,
          variant: "info",
          duration: 2000,
        })
        return
      }
      if (arg === "activate" || arg.startsWith("activate ")) {
        const parts = arg.split(/\s+/)
        const mins = Number(parts[1])
        const setMinutes = parts.length > 1 && Number.isFinite(mins)
        const next = setMinutes ? true : !isAutoActivateEnabled()
        await updatePrefs((draft) => {
          draft.autoActivate = next
          if (setMinutes && mins >= 0.1 && mins <= 120) draft.autoActivateMinutes = mins
        })
        context.ui.toast.show({
          title: "Matrix Rain",
          message: next
            ? `Auto-activate ON · ${formatIdleMinutes(autoActivateMinutes())}`
            : "Auto-activate OFF",
          variant: "success",
          duration: 2200,
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

    function isSubagentSession(sid: string): boolean {
      try {
        const root = context.data.session.root(sid)
        return typeof root === "string" && root.length > 0 && root !== sid
      } catch {
        return false
      }
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

    function resolveSessionState(
      sid: string | undefined,
      now: number,
    ): { mode: TelemetryMode; permissionPending: boolean } {
      if (!sid || sid === "__default__") return { mode: "idle", permissionPending: false }
      let fromStatus: TelemetryMode | null = null
      try {
        fromStatus = readSessionStatus(context.data.session.status(sid))
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

      const permissionPending = family.some((id) => pendingPermissions.has(id))
      if (fromStatus) return { mode: fromStatus, permissionPending }

      for (const id of family) {
        const entry = sessionActivity.get(id)
        if (entry && entry.mode === "generating" && now - entry.updatedAt <= STREAM_ACTIVE_MS) {
          return { mode: "generating", permissionPending }
        }
      }
      return { mode: "idle", permissionPending }
    }

    const seen = new Set<string>()
    let toolPayloadsLogged = 0
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
      viewedActivityAt.set(sid, Date.now())

      if (type === "permission.asked") {
        pendingPermissions.add(sid)
        return
      }
      if (type === "permission.replied" || type === "session.deleted") {
        pendingPermissions.delete(sid)
        // fall through: permission.replied is also activity
      }

      const next = classifyEventType(type)
      if (next) {
        sessionActivity.set(sid, { mode: next, updatedAt: Date.now() })
      }

      if (type === "session.tool.called") {
        let tool = eventToolName(details)
        const d = (details as { data?: Record<string, unknown> })?.data
        const assistantID =
          typeof d?.assistantMessageID === "string" ? d.assistantMessageID : undefined
        if (!tool && sid && assistantID) {
          try {
            const msg = context.data.session.message.get(sid, assistantID)
            const content = (msg as unknown as { content?: unknown[] } | null)?.content ?? []
            for (const part of content) {
              const p = part as Record<string, unknown>
              if (p.type !== "tool") continue
              const t = p.name ?? p.tool
              if (typeof t === "string" && t) {
                tool = t
                break
              }
            }
            if (!tool && toolPayloadsLogged < 3) {
              debug(`tool.called message=${JSON.stringify(msg).slice(0, 1200)}`)
            }
          } catch (error) {
            debug(`tool message lookup error: ${String(error)}`)
          }
        }
        if (toolPayloadsLogged < 3) {
          toolPayloadsLogged++
          debug(`tool.called payload=${JSON.stringify(details).slice(0, 1200)} tool=${tool ?? "none"}`)
        }
        if (tool) {
          const now = Date.now()
          sessionRains.get(sid)?.engine.burst(tool, now)
          if ((currentViewedSessionID() ?? sidebarSessionID) === sid) {
            sidebarEngine.burst(tool, now)
          }
          if (isSaverActive() && saverReturnSessionID === sid) saverEngine.burst(tool, now)
        }
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

        const viewedNow = currentViewedSessionID()
        if (viewedNow && viewedNow !== prevViewedSid) {
          viewedActivityAt.set(viewedNow, now)
          prevViewedSid = viewedNow
        }
        // If the saver is gone while still engaged, some path other than
        // closeScreensaver dismissed it (host-native escape, route change).
        // Clear the engagement and restart the idle clock so the saver
        // cannot instantly re-fire off the stale timestamp.
        if (autoActivateEngaged && !isSaverActive() && now - autoActivateAt > 1000) {
          autoActivateEngaged = false
          setAutoActivateUp(false)
          const clearSid = viewedNow ?? saverReturnSessionID
          if (clearSid) viewedActivityAt.set(clearSid, now)
          debug("auto-activate cleared on external dismissal")
        }
        if (isAutoActivateEnabled() && viewedNow) {
          // Keystrokes count as activity: typing in the composer produces no
          // server events, so the pass-through observer is the only signal.
          const lastActivity = Math.max(viewedActivityAt.get(viewedNow) ?? now, lastKeystrokeAt)
          if (now - lastActivity >= autoActivateMinutes() * 60_000) {
            const state = resolveSessionState(viewedNow, now)
            if (state.mode === "idle") {
              debug(
                `auto-activate trigger sid=${viewedNow} idleFor=${Math.round((now - lastActivity) / 1000)}s`,
              )
              openScreensaverAuto()
            }
          }
        }

        if (isSidebarOpen()) stepSidebarNow(now, dt)

        if (!isStripEnabled()) return

        const w = termWidth(context.renderer)
        const palette = paletteFor(activePaletteName())
        const speedScale = activeSpeed()
        const viewedSid = currentViewedSessionID()

        for (const state of sessionRains.values()) {
          const targetSid = state.sid === "__default__" ? (viewedSid ?? "__default__") : state.sid
          const prevMode = state.mode()
          const { mode: nextMode, permissionPending } = resolveSessionState(targetSid, now)
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

          const factor = telemetryFactor(nextMode, permissionPending)
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
        // Phase 6 auto-activate: any non-menu key returns to the session.
        ...AUTO_RETURN_BINDS.map(({ id, bind }) => ({
          id,
          title: "Return from Screensaver (auto)",
          bind,
          enabled: () => isSaverActive() && autoActivateEngaged,
          run: () => closeScreensaver(),
        })),
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
     * Keystroke observer (Phase 6 fix): pass-through layer so typing resets
     * the auto-activate idle timer. Commands only run while auto-activate is
     * enabled and the screensaver is NOT up (the auto-return binds own keys
     * while the saver is active); each returns false to continue dispatch.
     */
    const noteKeystroke = (): void => {
      lastKeystrokeAt = Date.now()
      if (keystrokeLogs < 5) {
        keystrokeLogs++
        debug(`input observed: ${new Date().toISOString()}`)
      }
    }
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: INPUT_OBSERVER_BINDS.map(({ id, bind }) => ({
        id,
        title: "Matrix Rain: input observer",
        bind,
        enabled: () => isAutoActivateEnabled() && !isSaverActive(),
        run: (): boolean => {
          noteKeystroke()
          return false
        },
      })),
    }))

    /**
     * Panel contribution removed (2026-10-18): the session.panel slot is a
     * host takeover surface (50/50 split, displaces other panel content) —
     * redundant with the sidebar block and the screensaver. `/matrix panel`
     * no longer exists.
     */

    const unregisterSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (props: unknown) => {
        const p = props as { sessionID?: unknown; width?: unknown } | undefined
        if (!sidebarPropsDumped) {
          sidebarPropsDumped = true
          try {
            debug(`sidebar slot props=${JSON.stringify(props)}`)
          } catch { /* non-serializable */ }
        }
        if (typeof p?.sessionID === "string" && p.sessionID) sidebarSessionID = p.sessionID
        const cols = typeof p?.width === "number" && p.width > 0 ? Math.floor(p.width) : 0
        if (cols > 0 && cols !== sidebarWidth) {
          sidebarWidth = cols
          sidebarEngine.resize(cols, SIDEBAR_ROWS)
          stepSidebarNow(Date.now(), TICK_MS)
        }
        return (
          <box flexDirection="column">
            <box
              flexDirection="row"
              onMouseDown={() => void toggleSidebarOpen()}
            >
              <text fg={PALETTES[activePaletteName()].bright}>
                {`${isSidebarOpen() ? "▼" : "▶"} Matrix Rain · ${sidebarPending() ? "⚠ PERMISSION" : sidebarMode() === "generating" ? "GENERATING" : "IDLE"}`}
              </text>
            </box>
            {isSidebarOpen() && (
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
            )}
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
                  const statusLabel = saverPending() ? "⚠ PERMISSION" : saverMode() === "generating" ? "GENERATING" : "IDLE"
                  const sid = saverReturnSessionID
                  let title = "no session"
                  if (sid) {
                    try {
                      title = context.data.session.get(sid)?.title ?? sid.slice(0, 12)
                    } catch {
                      title = sid.slice(0, 12)
                    }
                  }
                  const autoMark = autoActivateUp() ? " · AUTO" : ""
                  return `[ MATRIX // ${statusLabel}${autoMark} · ${title} ]`
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
        if (sid !== "__default__" && isSubagentSession(sid)) return null
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
      unregisterSidebar()
      unregisterRoute()
      if (typeof slot === "function") slot()
      else if (slot && typeof slot.dispose === "function") slot.dispose()
    }
  },
})
