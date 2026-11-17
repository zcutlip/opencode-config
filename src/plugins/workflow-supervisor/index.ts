import { Plugin } from "@opencode/plugin"
import { buildAutomaticEvidence, buildExplicitEvidence } from "./evidence.ts"
import { FileLedger } from "./ledger.ts"
import { WorkflowObserver, checkpointInputSchema } from "./observer.ts"
import { resolveWorkflowPolicy } from "./policy.ts"
import { runReviewer } from "./reviewer.ts"
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

export default Plugin.define({
  id: "local.workflow-supervisor",
  async setup(ctx) {
    const rpc = await ctx.rpc.register(WorkflowSupervisorRpc, {})
    const observers = new Map<string, WorkflowObserver>()

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
          const location = { directory: session.location?.directory ?? directory }
          const status = dataOf(await ctx.vcs.status({ location }))
          const workingDiff = dataOf(await ctx.vcs.diff({ location, mode: "working" }))
          const turnDiff = trigger === "execution"
            ? dataOf(await (ctx.session as any).diff({ sessionID }))
            : undefined
          const common = {
            session: policy.session,
            policy,
            latestUserRequest: request,
            workingDiff,
            status,
            provenance: {
              trigger,
              sessionID,
              source: trigger === "execution"
                ? "session.execution.succeeded"
                : "workflow.checkpoint",
            },
          }
          if (trigger === "explicit") {
            return buildExplicitEvidence({ ...common, input, turnDiff, events: undefined })
          }
          return buildAutomaticEvidence({
            ...common,
            turnDiff,
            events: observer.bufferedEvents(sessionID),
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
          void observer.recordEvent(event).then((owned) => {
            if (owned) void observer.handleExecutionSucceeded(sessionID)
          })
        } else {
          await observer.recordEvent(event)
        }
      }
    })().catch((error) => {
      if (controller.signal.aborted) return
      console.error("[workflow-supervisor] event stream failed", error)
    })

    return () => controller.abort()
  },
})
