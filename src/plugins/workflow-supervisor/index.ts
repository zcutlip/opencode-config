import { Plugin } from "@opencode/plugin"
import { join } from "node:path"
import { buildAutomaticEvidence, buildExplicitEvidence } from "./evidence.ts"
import { FileLedger } from "./ledger.ts"
import { WorkflowObserver, checkpointInputSchema } from "./observer.ts"
import { resolveWorkflowPolicy } from "./policy.ts"
import { runReviewer } from "./reviewer.ts"
import { escalationEvent, SteeringCoordinator } from "./steering.ts"
import { automaticReviewAllowed, EpisodeState, routeReport } from "./routing.ts"
import {
  buildSupervisionState,
  listCheckpoints,
  readReportText,
  SteeringLog,
  supervisionBadgeFromPolicy,
} from "./supervision.ts"
import { WorkflowSupervisorRpc } from "./rpc.ts"

const observedEventTypes = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.step.started",
  "session.step.ended",
  "session.step.failed",
  "session.tool.called",
  "session.tool.success",
  "session.tool.failed",
] as any[]

function dataOf(result: any): any[] {
  if (Array.isArray(result)) return result
  if (Array.isArray(result?.data)) return result.data
  return []
}

function latestUserRequest(messages: any[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.type !== "user") continue
    if (typeof message.text === "string" && message.text.trim() !== "") return message.text
    for (const part of message.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim() !== "") return part.text
    }
  }
  return "User request unavailable"
}

function latestAssistantText(messages: any[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.type !== "assistant") continue
    if (typeof message.text === "string" && message.text.trim() !== "") return message.text
    for (const part of message.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim() !== "") return part.text
    }
  }
  return undefined
}

export default Plugin.define({
  id: "local.workflow-supervisor",
  async setup(ctx) {
    const rpc = await ctx.rpc.register(WorkflowSupervisorRpc, {
      supervisionBadge: async (input: any) => {
        const sessionID = typeof input?.sessionID === "string" ? input.sessionID : ""
        if (sessionID === "") return supervisionBadgeFromPolicy({ sessionID, policy: null })
        try {
          const policy = await resolveForSession(sessionID)
          return supervisionBadgeFromPolicy({ sessionID, policy, view: steering.view(sessionID), episodeMode: episodes.mode(sessionID) })
        } catch {
          return supervisionBadgeFromPolicy({ sessionID, policy: null, episodeMode: episodes.mode(sessionID) })
        }
      },
      supervisionState: async (input: any) => {
        const sessionID = typeof input?.sessionID === "string" ? input.sessionID : ""
        if (sessionID === "") return { active: false }
        try {
          const resolved = await resolveForSession(sessionID)
          if (!resolved) return { active: false }
          const directory = resolved.worktree
          const [deliveries, checkpoints] = await Promise.all([
            new SteeringLog(directory).list(sessionID),
            listCheckpoints(directory, 10),
          ])
          let latestReport: { path: string; text: string; truncated: boolean } | null = null
          for (let index = checkpoints.length - 1; index >= 0; index -= 1) {
            const summary = checkpoints[index]
            if (summary.status !== "completed") continue
            const path = join(directory, ".opencode", "workflow-state", "checkpoints", summary.id, "report.md")
            const report = await readReportText(path)
            if (report) {
              latestReport = { path, ...report }
              break
            }
          }
          return buildSupervisionState({
            sessionID,
            policy: resolved,
            view: steering.view(sessionID),
            episodeMode: episodes.mode(sessionID),
            reassertion: steering.context(sessionID),
            steering: deliveries,
            checkpoints,
            latestReport,
          })
        } catch {
          return { active: false }
        }
      },
      supervisionEpisode: async (input: any) => {
        const sessionID = typeof input?.sessionID === "string" ? input.sessionID : ""
        const mode = input?.mode === "collab" ? "collab" : "delegate"
        if (sessionID !== "") {
          if (mode === "collab") {
            episodes.setCollab(sessionID)
            // A8 — collab disarms any armed ride; attempts and fingerprints
            // survive so the delivered-message ledger and dedup stay intact.
            steering.disarm(sessionID)
          } else {
            episodes.setDelegate(sessionID)
          }
        }
        let badge: any
        try {
          const policy = sessionID === "" ? null : await resolveForSession(sessionID)
          badge = supervisionBadgeFromPolicy({ sessionID, policy, view: steering.view(sessionID), episodeMode: episodes.mode(sessionID) })
        } catch {
          badge = supervisionBadgeFromPolicy({ sessionID, policy: null, episodeMode: episodes.mode(sessionID) })
        }
        await rpc.events.emit("stateUpdated", badge).catch(() => {})
        return { sessionID, mode: episodes.mode(sessionID) }
      },
    })
    const observers = new Map<string, WorkflowObserver>()
    const steering = new SteeringCoordinator({ limit: 3 })
    const episodes = new EpisodeState()

    const resolveForSession = async (sessionID: string) => {
      const session = await ctx.session.get({ sessionID })
      const directory = session.location?.directory ?? ctx.location.directory
      const policy = await resolveWorkflowPolicy(directory)
      if (!policy) return null
      return {
        ...policy,
        session: {
          id: session.id,
          parentID: session.parentID,
          agent: session.agent,
          location: directory,
          metadata: session.metadata,
        },
      }
    }

    const observerFor = (directory: string): WorkflowObserver => {
      const existing = observers.get(directory)
      if (existing) return existing

      let observer: WorkflowObserver
      const ledger = new FileLedger(directory)
      observer = new WorkflowObserver({
        location: directory,
        resolvePolicy: resolveForSession,
        captureEvidence: async (sessionID, trigger, input, policy) => {
          const session = await ctx.session.get({ sessionID })
          const messages = await ctx.session.context({ sessionID })
          const request = latestUserRequest(messages)
          const assistantText = latestAssistantText(messages)
          const location = { directory: session.location?.directory ?? directory }
          const status = dataOf(await ctx.vcs.status({ location }))
          const workingDiff = dataOf(await ctx.vcs.diff({ location, mode: "working" }))
          const turnDiff = undefined
          const common = {
            session: policy.session,
            policy,
            latestUserRequest: request,
            latestAssistantText: assistantText,
            workingDiff,
            status,
            provenance: {
              trigger,
              sessionID,
              source: trigger === "execution"
                ? "session.execution.succeeded"
                : "workflow.checkpoint",
              turnDiff: trigger === "execution"
                ? "unavailable: plugin context exposes no session.diff"
                : undefined,
            },
          }
          if (trigger === "explicit") {
            return buildExplicitEvidence({ ...common, input, turnDiff, events: undefined })
          }
          return buildAutomaticEvidence({
            ...common,
            turnDiff,
            events: observer.bufferedEvents(sessionID),
            // A6 — previously delivered steering for this observed session;
            // the reviewer uses it to mark repeats instead of re-litigating.
            steeringLog: await new SteeringLog(directory).list(sessionID),
          })
        },
        runReviewer: (input) => runReviewer({ ...input, client: ctx }),
        ledger,
        notify: async (error) => {
          await rpc.events.emit("configurationError", {
            code: String(error.code ?? "configuration_error"),
            message: String(error.message ?? "Workflow supervisor configuration error"),
            fingerprint: String(error.fingerprint ?? error.code ?? "configuration_error"),
          })
        },
        log: (error) => console.error("[workflow-supervisor]", error),
        timeoutMs: 5 * 60 * 1_000,
      })
      observers.set(directory, observer)
      return observer
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "workflow",
        description: "Passive workflow checkpoints backed by an independent reviewer",
      })
      editor.add({
        name: "checkpoint",
        description:
          "Request an independent review of the current working-tree changes. Returns only the checkpoint ID and state path.",
        input: checkpointInputSchema as any,
        options: { codemode: false },
        execute: async (input: any, context: any) => {
          const session = await ctx.session.get({ sessionID: context.sessionID })
          const directory = session.location?.directory ?? ctx.location.directory
          const result = await observerFor(directory).explicitCheckpoint(context.sessionID, input)
          if (result.status === "disabled") return { content: "disabled" }
          if (result.status === "error") return { content: "configuration_error" }
          if (result.status === "completed") {
            const resolved = await resolveForSession(context.sessionID).catch(() => null)
            if (resolved) {
              await rpc.events
                .emit(
                  "stateUpdated",
                  supervisionBadgeFromPolicy({
                    sessionID: context.sessionID,
                    policy: resolved,
                    view: steering.view(context.sessionID),
                  }),
                )
                .catch(() => {})
            }
          }
          if (result.checkpointID) {
            return {
              content: JSON.stringify({
                checkpointID: result.checkpointID,
                statePath: result.statePath,
              }),
            }
          }
          return { content: result.status }
        },
      })
    })

    const contextHook = await ctx.session.hook("context", (event: any) => {
      const text = steering.context(event.sessionID)
      if (text === undefined) return
      event.system.push({ type: "text", text })
    })

    // A4 — one-ride demotion. Prompt admission is the signal; synthetic
    // steering messages never run this hook, so the ride is consumed only by
    // the user's genuine next prompt (documented server-plugin hook,
    // Hooks → Sessions → Prompt admission).
    const promptHook = await ctx.session.hook("prompt", (event: any) => {
      const sessionID = event?.sessionID
      if (typeof sessionID !== "string") return
      steering.promptAdmitted(sessionID)
    })

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({
        types: observedEventTypes,
        signal: controller.signal,
      })) {
        const sessionID = (event as any).data?.sessionID
        if (typeof sessionID !== "string") continue
        const directory = (event as any).location?.directory ?? ctx.location.directory
        const observer = observerFor(directory)
        if ((event as any).type === "session.execution.succeeded") {
          void observer.recordEvent(event).then(async (owned) => {
            if (!owned) return
            // A8 — collab suspends the per-turn automatic trigger; explicit
            // checkpoints are user-requested and unaffected.
            if (!automaticReviewAllowed(episodes.mode(sessionID))) return
            const result = await observer.handleExecutionSucceeded(sessionID)
            if (result?.status !== "completed" || result.trigger !== "execution") return
            // A7/A8 — route before steering. A user-channel report never
            // reaches the builder inbox, consumes no attempt, and sets no
            // reassertion; the ledger and panel already carry it.
            const routing = routeReport({
              episodeMode: episodes.mode(sessionID),
              workingDiff: result.workingDiff ?? [],
              contractPath: result.contractPath,
              worktree: result.worktree,
            })
            if (routing.channel === "builder") {
              const decision = steering.consider({
                sessionID,
                requestedMode: result.requestedMode,
                checkpointID: result.checkpointID,
                report: result.report,
                contractPath: result.contractPath,
                reportPath: result.reportPath,
              })
              if (decision.action === "steer") {
                await new SteeringLog(directory).record({
                  sessionID,
                  checkpointID: result.checkpointID,
                  text: decision.text,
                  attempts: decision.attempts,
                  time: Date.now(),
                })
                await ctx.session.synthetic({
                  sessionID,
                  text: decision.text,
                  delivery: "queue",
                  resume: false,
                  metadata: {
                    workflowSupervisor: true,
                    checkpointID: result.checkpointID,
                  },
                })
              } else if (decision.action === "escalate") {
                console.warn(
                  "[workflow-supervisor] steering limit reached",
                  { sessionID, checkpointID: result.checkpointID, attempts: decision.attempts },
                )
                // A5 — user-facing escalation; the TUI toasts it.
                await rpc.events
                  .emit(
                    "escalationRaised",
                    escalationEvent({
                      sessionID,
                      checkpointID: result.checkpointID,
                      attempts: decision.attempts,
                    }),
                  )
                  .catch(() => {})
              }
            }
            await rpc.events
              .emit(
                "stateUpdated",
                supervisionBadgeFromPolicy({
                  sessionID,
                  policy: { active: true, effectiveMode: result.effectiveMode },
                  view: steering.view(sessionID),
                  episodeMode: episodes.mode(sessionID),
                }),
              )
              .catch(() => {})
          })
        } else {
          await observer.recordEvent(event)
        }
      }
    })().catch((error) => {
      if (controller.signal.aborted) return
      console.error("[workflow-supervisor] event stream failed", error)
    })

    return () => {
      void contextHook.dispose()
      void promptHook.dispose()
      controller.abort()
    }
  },
})
