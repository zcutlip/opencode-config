import { Plugin } from "@opencode/plugin/tui"
import { appendFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { WorkflowSupervisorRpc } from "./rpc.ts"

// TUI visibility for the workflow supervisor.
//
// - prompt.footer.status badge: `ws:<mode>` plus steering attempts when the
//   session has unresolved findings; hidden when the project is not enabled.
//   The footer slot render is reactive over the badge store, and stateUpdated
//   events keep it live. While a review is in flight the badge pulses
//   base <-> amber on a ~1.2s toggle; the pulse store is a second store read
//   in the same render and proved reactive too (verified live 2026-11-22).
// - session.panel contribution "workflow-supervisor.state": mode, contract,
//   steering texts delivered verbatim, the context-hook reassertion, recent
//   checkpoints with verdicts, and the latest report.
//
// The session.panel slot render proved NOT reactive over store updates
// (verified live 2026-11-19: the badge updated, the panel sat at "Loading…"
// while the server-side RPC returned correct state over HTTP). The panel
// therefore opens only after its data is prefetched, so the first render is
// final; the in-render fetch remains only as a backstop.
//
// Escape (and q) close the panel — bound inside the panel contribution,
// which is the documented pattern for panel-owned keys.
//
// Every fetch and failure lands in the debug sink below; read it before
// assuming this part broke after an OpenCode upgrade.

interface BadgeState {
  sessionID: string
  active: boolean
  mode: string
  hasUnresolved: boolean
  attempts: number
  limit: number
  episodeMode?: "collab" | "delegate"
  reviewing?: boolean
  findingsWaiting?: boolean
}

interface SupervisionDetail {
  active: boolean
  mode?: string
  episodeMode?: "collab" | "delegate"
  contractPath?: string
  hasUnresolved?: boolean
  attempts?: number
  limit?: number
  reassertion?: string | null
  latestReport?: { path: string; text: string; truncated: boolean } | null
  steering?: { sessionID: string; checkpointID: string; text: string; attempts: number; time: number }[]
  checkpoints?: {
    id: string
    status: string
    verdict: string | null
    trigger: string | null
    requestedMode: string | null
    effectiveMode: string | null
    time: number | null
  }[]
}

interface DetailEntry {
  at: number
  state: SupervisionDetail
  error?: string
}

const PANEL_NAME = "workflow-supervisor.state"
const DEBUG_LOG = join(homedir(), ".local", "share", "opencode", "workflow-supervisor-debug.log")

function debug(message: string): void {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Debug sink is best-effort.
  }
}

function directoryOf(value: any): string | undefined {
  return typeof value === "string" ? value : value?.directory
}

function timeLabel(time: number | null | undefined): string {
  return typeof time === "number" ? new Date(time).toLocaleTimeString() : "—"
}

export default Plugin.define({
  id: "local.workflow-supervisor.tui",
  setup(context) {
    const rpc = context.client.rpc(WorkflowSupervisorRpc)
    const own = directoryOf(context.location ?? context.data.location.default())
    const base = context.theme.text.base

    const [badges, updateBadges] = context.storage.memory("local.workflow-supervisor.badges", {
      initial: {} as Record<string, BadgeState>,
    })
    const [details, updateDetails] = context.storage.memory("local.workflow-supervisor.details", {
      initial: {} as Record<string, DetailEntry>,
    })
    // Pulse while a review is in flight: a slow (~1.2s) toggle the footer
    // render reads, so the reviewing badge alternates base <-> amber.
    // Writes happen only while some badge is reviewing — no re-renders,
    // no timer cost, when nothing is under review.
    const PULSE_COLOR = "#fbbf24"
    const [pulse, updatePulse] = context.storage.memory("local.workflow-supervisor.pulse", {
      initial: { on: false },
    })
    const pulseTimer = setInterval(() => {
      const anyReviewing = Object.values(badges).some((badge: any) => badge?.reviewing)
      if (!anyReviewing) return
      updatePulse((draft) => {
        draft.on = !draft.on
      })
    }, 1200)
    const badgeInflight = new Set<string>()
    const detailInflight = new Set<string>()

    async function refreshBadge(sessionID: string): Promise<void> {
      if (sessionID === "" || badgeInflight.has(sessionID)) return
      badgeInflight.add(sessionID)
      try {
        const badge = (await rpc.supervisionBadge({ sessionID })) as BadgeState
        debug(`badge ${sessionID}: active=${badge?.active} mode=${badge?.mode}`)
        updateBadges((draft) => {
          draft[sessionID] = badge
        })
      } catch (error) {
        debug(`badge ${sessionID} failed: ${String(error)}`)
      } finally {
        badgeInflight.delete(sessionID)
      }
    }

    async function refreshDetail(sessionID: string): Promise<void> {
      if (sessionID === "" || detailInflight.has(sessionID)) return
      detailInflight.add(sessionID)
      try {
        const state = (await rpc.supervisionState({ sessionID })) as SupervisionDetail
        debug(`state ${sessionID}: active=${state?.active} checkpoints=${state?.checkpoints?.length ?? 0}`)
        updateDetails((draft) => {
          draft[sessionID] = { at: Date.now(), state }
        })
      } catch (error) {
        debug(`state ${sessionID} failed: ${String(error)}`)
        updateDetails((draft) => {
          draft[sessionID] = {
            at: Date.now(),
            state: { active: false },
            error: String((error as any)?.message ?? error),
          }
        })
      } finally {
        detailInflight.delete(sessionID)
      }
    }

    async function openPanel(sessionID: string): Promise<void> {
      // The panel slot render is not reliably reactive, so the data (or a
      // stored error) must already be in the store before the first render.
      await Promise.race([refreshDetail(sessionID), new Promise((resolve) => setTimeout(resolve, 3_000))])
      context.ui.panel.open(PANEL_NAME)
    }

    const stopConfig = rpc.events.on("configurationError", (event: any) => {
      if (own === undefined || directoryOf(event.location) !== own) return
      context.ui.toast.show({
        title: "Workflow supervisor configuration",
        message: event.data.message,
        variant: "error",
      })
    })

    const stopUpdated = rpc.events.on("stateUpdated", (event: any) => {
      const badge = event?.data
      if (typeof badge?.sessionID !== "string") return
      debug(`stateUpdated ${badge.sessionID}: active=${badge.active} mode=${badge.mode ?? "?"}`)
      updateBadges((draft) => {
        draft[badge.sessionID] = badge
      })
    })

    // A5 — user-facing escalation toast; the badge alone does not interrupt.
    const stopEscalation = rpc.events.on("escalationRaised", (event: any) => {
      const data = event?.data
      if (typeof data?.sessionID !== "string") return
      debug(`escalationRaised ${data.sessionID}: attempts=${data.attempts} checkpoint=${String(data.checkpointID).slice(0, 12)}`)
      context.ui.toast.show({
        title: "Workflow supervisor escalation",
        message: `Steering limit reached (${data.attempts} distinct unresolved reports). Latest checkpoint ${String(data.checkpointID).slice(0, 12)} — open /ws to review and decide.`,
        variant: "error",
      })
    })

    const SupervisorPanel = (props: { sessionID?: string; close?: () => void }) => {
      const sessionID = props.sessionID
      // Panel-owned keys: active only while the panel owns input.
      context.keymap.layer(() => ({
        commands: [
          {
            id: "local.workflow-supervisor.panel.close",
            bind: "escape",
            run: () => props.close?.(),
          },
          {
            id: "local.workflow-supervisor.panel.close.alt",
            bind: "q",
            run: () => props.close?.(),
          },
        ],
      }))
      if (!sessionID) return <text fg={base}>No session selected.</text>
      const entry = details[sessionID]
      if (entry === undefined) {
        void refreshDetail(sessionID)
        return <text fg={base}>Loading workflow supervisor state…</text>
      }
      if (entry.error !== undefined) {
        return <text fg={base}>Workflow supervisor state unavailable: {entry.error}</text>
      }
      const state = entry.state
      if (!state.active) {
        return <text fg={base}>Workflow supervisor is not enabled for this project.</text>
      }

      // One <text> element, not one per block: the host panel gives each
      // top-level child its own scroll region, so multiple children render as
      // indistinguishable side-by-side subpanels. A single element is a
      // single scroll region; separator banners mark message boundaries.
      const lines: string[] = [
        `mode: ${state.mode ?? "advisory"} · episode: ${state.episodeMode ?? "delegate"} · contract: ${state.contractPath ?? "unavailable"} · steering ${state.attempts ?? 0}/${state.limit ?? 3}${state.hasUnresolved ? " · unresolved findings" : " · no unresolved findings"} · esc/q closes`,
      ]
      if (state.reassertion) {
        lines.push("", "──────── reasserted on every model call ────────", state.reassertion)
      }
      for (const delivery of (state.steering ?? []).slice(-3)) {
        lines.push(
          "",
          `══════ delivered to builder · checkpoint ${delivery.checkpointID.slice(0, 12)} · attempt ${delivery.attempts} · ${timeLabel(delivery.time)} ══════`,
          delivery.text,
        )
      }
      lines.push("", "──────── recent checkpoints ────────")
      for (const checkpoint of state.checkpoints ?? []) {
        lines.push(
          `· ${checkpoint.id.slice(0, 12)} ${checkpoint.status}${checkpoint.verdict ? ` · ${checkpoint.verdict}` : ""}${checkpoint.effectiveMode ? ` · ${checkpoint.effectiveMode}` : ""} · ${timeLabel(checkpoint.time)}`,
        )
      }
      if (state.latestReport) {
        lines.push("", `──────── latest report · ${state.latestReport.path} ────────`)
        if (state.hasUnresolved && state.reassertion) {
          // The reassertion above already carries the unresolved report
          // verbatim — printing it twice doubles the panel for nothing.
          lines.push("[full text shown above in the reassertion — open the file for the raw report]")
        } else {
          lines.push(state.latestReport.text)
          if (state.latestReport.truncated) {
            lines.push("[report truncated for display — open the file above for the rest]")
          }
        }
      }
      return <text fg={base}>{lines.join("\n")}</text>
    }

    context.ui.slot({
      append: "session.panel",
      render: (panel: any) => {
        if (panel?.name !== PANEL_NAME) return null
        return <SupervisorPanel sessionID={panel.sessionID} close={() => panel.close?.()} />
      },
    })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "local.workflow-supervisor.open",
          title: "Open workflow supervisor panel",
          group: "Workflow",
          palette: true,
          slash: { name: "ws" },
          run: () => {
            const sessionID = context.ui.router.current()?.sessionID
            if (!sessionID) return
            void openPanel(sessionID)
          },
        },
        {
          id: "local.workflow-supervisor.toggle-collab",
          title: "Toggle workflow supervisor collab mode",
          group: "Workflow",
          palette: true,
          slash: { name: "ws-collab" },
          run: () => {
            const sessionID = context.ui.router.current()?.sessionID
            if (!sessionID) return
            // User-held episode override (A8): collab routes findings to the
            // user channel and suspends the per-turn automatic review; the
            // server disarms any armed reassertion ride on the flip.
            const next = badges[sessionID]?.episodeMode === "collab" ? "delegate" : "collab"
            void rpc
              .supervisionEpisode({ sessionID, mode: next })
              .then((result: any) => {
                debug(`episode ${sessionID}: ${result?.mode ?? next}`)
                void refreshBadge(sessionID)
              })
              .catch((error) => debug(`episode ${sessionID} failed: ${String(error)}`))
          },
        },
        {
          id: "local.workflow-supervisor.review-now",
          title: "Request workflow supervisor review now",
          group: "Workflow",
          palette: true,
          slash: { name: "ws-review" },
          run: () => {
            const sessionID = context.ui.router.current()?.sessionID
            if (!sessionID) return
            // User-held review trigger: same checkpoint machinery, no prompt
            // spent, no agent in the loop. Fire-and-forget — the badge shows
            // the reviewing state and the verdict lands on disk.
            void rpc
              .supervisionCheckpoint({ sessionID })
              .then((result: any) => debug(`checkpoint requested ${sessionID}: accepted=${result?.accepted}`))
              .catch((error) => debug(`checkpoint request ${sessionID} failed: ${String(error)}`))
          },
        },
      ],
    }))

    context.ui.slot({
      append: "prompt.footer.status",
      render: (props: { sessionID?: string }) => {
        const sessionID = props?.sessionID ?? context.ui.router.current()?.sessionID
        if (!sessionID) return null
        const badge = badges[sessionID]
        if (badge === undefined) {
          void refreshBadge(sessionID)
          return null
        }
        if (!badge.active) return null
        const parts = [`ws:${badge.mode}`]
        if (badge.hasUnresolved) parts.push(`${badge.attempts}/${badge.limit}`)
        if (badge.episodeMode === "collab") parts.push("collab")
        if (badge.reviewing) parts.push("reviewing")
        if (badge.findingsWaiting) parts.push("findings")
        const label = parts.join(" ")
        const glow = badge.reviewing && pulse.on ? PULSE_COLOR : base
        return (
          <box onMouseDown={() => void openPanel(sessionID)}>
            <text fg={glow}>{label}</text>
          </box>
        )
      },
    })

    return () => {
      stopConfig()
      stopUpdated()
      stopEscalation()
      clearInterval(pulseTimer)
    }
  },
})
