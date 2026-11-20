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
//   events keep it live.
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
}

interface SupervisionDetail {
  active: boolean
  mode?: string
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
      const children: any[] = [
        <text fg={base}>
          mode: {state.mode ?? "advisory"} · contract: {state.contractPath ?? "unavailable"} · steering{" "}
          {state.attempts ?? 0}/{state.limit ?? 3}
          {state.hasUnresolved ? " · unresolved findings" : " · no unresolved findings"} · esc/q closes
        </text>,
      ]
      if (state.reassertion) {
        children.push(<text fg={base}> </text>)
        children.push(<text fg={base}>Reasserted on every model call:</text>)
        children.push(<text fg={base}>{state.reassertion}</text>)
      }
      for (const delivery of (state.steering ?? []).slice(-3)) {
        children.push(<text fg={base}> </text>)
        children.push(
          <text fg={base}>
            — delivered to builder · checkpoint {delivery.checkpointID} · attempt {delivery.attempts} ·{" "}
            {timeLabel(delivery.time)}
          </text>,
        )
        children.push(<text fg={base}>{delivery.text}</text>)
      }
      children.push(<text fg={base}> </text>)
      children.push(<text fg={base}>Recent checkpoints:</text>)
      for (const checkpoint of state.checkpoints ?? []) {
        children.push(
          <text fg={base}>
            · {checkpoint.id.slice(0, 12)} {checkpoint.status}
            {checkpoint.verdict ? ` · ${checkpoint.verdict}` : ""}
            {checkpoint.effectiveMode ? ` · ${checkpoint.effectiveMode}` : ""} · {timeLabel(checkpoint.time)}
          </text>,
        )
      }
      if (state.latestReport) {
        children.push(<text fg={base}> </text>)
        children.push(<text fg={base}>Latest report: {state.latestReport.path}</text>)
        children.push(<text fg={base}>{state.latestReport.text}</text>)
        if (state.latestReport.truncated) {
          children.push(<text fg={base}>[report truncated for display — open the file above for the rest]</text>)
        }
      }
      return <box>{children}</box>
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
        const label = badge.hasUnresolved
          ? `ws:${badge.mode} ${badge.attempts}/${badge.limit}`
          : `ws:${badge.mode}`
        return (
          <box onMouseDown={() => void openPanel(sessionID)}>
            <text fg={base}>{label}</text>
          </box>
        )
      },
    })

    return () => {
      stopConfig()
      stopUpdated()
    }
  },
})
