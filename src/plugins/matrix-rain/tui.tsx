import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  Rain,
  telemetryFactor,
  paletteFor,
  type Frame,
  type TelemetryMode,
} from "./engine"

// matrix-rain — Phase 2: strip surface + frame loop + per-session telemetry.
//
// Surfaces (per approved plan): v1 = strip + screensaver; v1.1 = panel +
// auto-wake. This file currently implements the strip in session.composer.top:
// 2 rows of calm, sparse trickle while idle, 4 rows of downpour while the
// currently viewed session is generating.

const TICK_MS = 66 // ~15 fps cap
const IDLE_ROWS = 2
const GEN_ROWS = 4
const STREAM_ACTIVE_MS = 2500 // step/delta keep-alive window per session
const DEBUG_LOG = join(homedir(), ".local", "share", "opencode", "matrix-rain-debug.log")

function debug(line: string): void {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // logging must never break the plugin
  }
}

/** Terminal width via the renderer, with a safe fallback for older shapes. */
function termWidth(renderer: unknown): number {
  const r = renderer as { width?: unknown; columns?: unknown } | null
  if (r && typeof r.width === "number") return r.width
  if (r && typeof r.columns === "number") return r.columns
  return 80
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

/**
 * Classify V2 server events into per-session generating/idle transitions.
 * Observed V2 stream events:
 *   session.step.started / streamed, session.reasoning.*, session.text.*,
 *   session.tool.input.*, session.tool.called / progress
 * Observed V2 completion events:
 *   session.execution.succeeded / failed / interrupted, session.idle
 */
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

export default Plugin.define({
  id: "local.matrix-rain",
  setup(context) {
    const palette = paletteFor("matrix") // persisted prefs land in Phase 3
    const speedScale = 1

    let width = termWidth(context.renderer)
    let height = IDLE_ROWS
    const engine = new Rain({ density: 0.85, maxRows: GEN_ROWS })
    engine.resize(Math.max(1, Math.floor(width / 2)), height)

    const [frame, setFrame] = createSignal<Frame | undefined>(undefined)
    const [mode, setMode] = createSignal<TelemetryMode>("idle")

    // Per-session activity map so activity in one session never triggers
    // the 4-row expansion in other open tabs or terminal windows.
    const sessionActivity = new Map<string, { mode: TelemetryMode; updatedAt: number }>()
    let activeSessionID: string | undefined
    let loggedStatusShape = false

    function currentViewedSessionID(): string | undefined {
      try {
        const route = context.ui.router.current() as { type?: string; sessionID?: string } | undefined
        if (route && route.type === "session" && typeof route.sessionID === "string") {
          return route.sessionID
        }
      } catch {
        // ignore if router is not ready during early setup
      }
      return activeSessionID
    }

    function resolveModeForSession(sid: string | undefined, now: number): TelemetryMode {
      if (!sid) return "idle"
      try {
        const rawStatus = context.data.session.status(sid)
        if (!loggedStatusShape && rawStatus !== undefined) {
          loggedStatusShape = true
          debug(`status shape for ${sid}: ${JSON.stringify(rawStatus)}`)
        }
        const fromStatus = readSessionStatus(rawStatus)
        if (fromStatus) return fromStatus
      } catch {
        // fallback to event timestamps below
      }

      // Check the session itself and any child sessions in its family tree.
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

        const sid = currentViewedSessionID()
        const nextMode = resolveModeForSession(sid, now)
        if (nextMode !== mode()) setMode(nextMode)

        const w = termWidth(context.renderer)
        const h = nextMode === "generating" ? GEN_ROWS : IDLE_ROWS
        if (w !== width || h !== height) {
          width = w
          height = h
          engine.resize(Math.max(1, Math.floor(w / 2)), h)
        }

        const factor = telemetryFactor(nextMode, false)
        engine.step(dt, factor, speedScale, now)
        setFrame(engine.frame(factor, palette))
      } catch (error) {
        debug(`tick error: ${String(error)}`)
      }
    }, TICK_MS)

    const slot = context.ui.slot({
      append: "session.composer.top",
      render: (props: unknown) => {
        const p = props as { sessionID?: string } | undefined
        if (p && typeof p.sessionID === "string") {
          activeSessionID = p.sessionID
        }
        const f = frame()
        if (!f) return null
        const visible = mode() === "generating" ? GEN_ROWS : IDLE_ROWS
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
      if (typeof slot === "function") slot()
      else if (slot && typeof slot.dispose === "function") slot.dispose()
    }
  },
})
