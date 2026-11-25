import { Plugin } from "@opencode/plugin"
import { join, resolve } from "node:path"
import { buildAutomaticEvidence, buildExplicitEvidence, turnChangedFiles, turnTools } from "./evidence.ts"
import { IncidentLog } from "./incidents.ts"
import { FileLedger } from "./ledger.ts"
import { WorkflowObserver, checkpointInputSchema } from "./observer.ts"
import { resolveWorkflowPolicy, titleMuted } from "./policy.ts"
import { runReviewer } from "./reviewer.ts"
import { escalationEvent, SteeringCoordinator, wakeMessage } from "./steering.ts"
import {
  automaticReviewAllowed,
  classifyTurn,
  deliveryPlan,
  EpisodeState,
  HeldWakes,
  MuteState,
  routeReport,
} from "./routing.ts"
import { deferRecord, WorkSettle } from "./settle.ts"
import {
  buildSupervisionState,
  latestSessionReview,
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
  // A16 — a helper's user-held permission prompt is a named wait, not
  // reviewer work: the badge says what is blocked and settlement pauses.
  "permission.v2.asked",
  "permission.v2.replied",
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
          return await badgeForSession(sessionID, policy)
        } catch {
          return supervisionBadgeFromPolicy({
            sessionID,
            policy: null,
            episodeMode: episodes.mode(sessionID),
            muted: mutes.isMuted(sessionID),
          })
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
            reviewing: reviewing.has(sessionID),
            findingsWaiting: waitingFindings.has(sessionID),
            blockedOn: settle.deferState(sessionID).blockedOn,
            muted: mutedFor(sessionID, resolved),
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
          badge = await badgeForSession(sessionID, policy)
        } catch {
          badge = supervisionBadgeFromPolicy({ sessionID, policy: null, episodeMode: episodes.mode(sessionID) })
        }
        await rpc.events.emit("stateUpdated", badge).catch(() => {})
        return { sessionID, mode: episodes.mode(sessionID) }
      },
      supervisionMute: async (input: any) => {
        const sessionID = typeof input?.sessionID === "string" ? input.sessionID : ""
        const muted = input?.muted === true
        if (sessionID !== "") {
          // A16 — user-held mute lever; in-memory, dies with the server.
          if (muted) mutes.mute(sessionID)
          else mutes.unmute(sessionID)
        }
        let badge: any
        try {
          const policy = sessionID === "" ? null : await resolveForSession(sessionID)
          badge = await badgeForSession(sessionID, policy)
        } catch {
          badge = supervisionBadgeFromPolicy({ sessionID, policy: null, episodeMode: episodes.mode(sessionID), muted })
        }
        await rpc.events.emit("stateUpdated", badge).catch(() => {})
        return { sessionID, muted: badge?.muted === true }
      },
      supervisionCheckpoint: async (input: any) => {
        const sessionID = typeof input?.sessionID === "string" ? input.sessionID : ""
        if (sessionID === "") return { sessionID, accepted: false }
        let directory = ctx.location.directory
        try {
          const session = await ctx.session.get({ sessionID })
          directory = session.location?.directory ?? directory
        } catch {
          return { sessionID, accepted: false }
        }
        // Fire-and-forget: the badge shows the reviewing state; the verdict
        // lands on disk and in stateUpdated when the reviewer finishes.
        // Explicit checkpoints remain report-only — findings never steer.
        reviewing.add(sessionID)
        supervisedSessions.add(sessionID)
        void observerFor(directory)
          .explicitCheckpoint(sessionID, {})
          .catch(() => {})
          .finally(() => {
            reviewing.delete(sessionID)
            emitBadge(sessionID)
          })
        return { sessionID, accepted: true }
      },
    })
    const observers = new Map<string, WorkflowObserver>()
    const steering = new SteeringCoordinator({ limit: 3 })
    const episodes = new EpisodeState()
    // A9 — deferred automatic checkpoints, keyed by the observed session.
    const settle = new WorkSettle()
    const pendingRuns = new Map<string, {
      directory: string
      timer: ReturnType<typeof setTimeout>
      paused: boolean
    }>()
    const deferTimeoutMs = 10 * 60 * 1000
    // A11-batch — live supervision state. activeSessions: currently
    // executing (delivery-at-completion picks live vs queued). supervisedSessions:
    // seen in an enabled project (standing context contract). waitingFindings:
    // findings queued into an idle session, cleared at prompt admission.
    // reviewing: a checkpoint, including the reviewer run, is in flight.
    const activeSessions = new Set<string>()
    const supervisedSessions = new Set<string>()
    const waitingFindings = new Set<string>()
    const reviewing = new Set<string>()
    // A16 — user-held mute lever, wakes held while a folder is busy, and
    // the folder each active session belongs to. All in-memory: they die
    // with the server, like the episode override.
    const mutes = new MuteState()
    const heldWakes = new HeldWakes()
    const heldWakeTexts = new Map<string, { text: string; directory: string; checkpointID: string }>()
    const sessionDirs = new Map<string, string>()

    const mutedFor = (sessionID: string, policy: any): boolean =>
      mutes.isMuted(sessionID) || titleMuted(policy?.policy?.muteTitles, policy?.session?.title)

    const siblingActiveIn = (directory: string, exclude: string): boolean => {
      for (const id of activeSessions) {
        if (id === exclude) continue
        const dir = sessionDirs.get(id)
        if (dir === undefined) return true
        if (resolve(dir) === resolve(directory)) return true
      }
      return false
    }

    const badgeForSession = async (sessionID: string, policy: any): Promise<any> => {
      const review = policy?.active && typeof policy.worktree === "string"
        ? await latestSessionReview(policy.worktree, sessionID)
        : null
      return supervisionBadgeFromPolicy({
        sessionID,
        policy,
        view: steering.view(sessionID),
        episodeMode: episodes.mode(sessionID),
        reviewing: reviewing.has(sessionID),
        findingsWaiting: waitingFindings.has(sessionID),
        muted: mutedFor(sessionID, policy),
        blockedOn: settle.deferState(sessionID).blockedOn,
        review,
      })
    }

    const emitBadge = (sessionID: string): void => {
      void resolveForSession(sessionID)
        .then(async (policy: any) => rpc.events.emit("stateUpdated", await badgeForSession(sessionID, policy)))
        .catch(() => {})
    }

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
          // A16 — session title is the declaration the optional muteTitles
          // patterns match (utility sessions such as commit agents).
          title: session.title,
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
        captureEvidence: async (sessionID, trigger, input, policy, options) => {
          const session = await ctx.session.get({ sessionID })
          const messages = await ctx.session.context({ sessionID })
          const request = latestUserRequest(messages)
          const assistantText = latestAssistantText(messages)
          const location = { directory: session.location?.directory ?? directory }
          const status = dataOf(await ctx.vcs.status({ location }))
          const workingDiff = dataOf(await ctx.vcs.diff({ location, mode: "working" }))
          const turnDiff = undefined
          // A16 — the turn's own file writes and tool calls come from the
          // captured step/tool events plus the assistant's message parts;
          // classification is mechanical, never a model call.
          const events = trigger === "execution" ? observer.bufferedEvents(sessionID) : undefined
          const turnFiles = trigger === "execution" ? turnChangedFiles(events) : undefined
          const tools = trigger === "execution" ? turnTools(events, messages) : []
          const turnClass =
            trigger === "execution" ? classifyTurn({ turnFiles, tools }) : undefined
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
              ...(options?.defer === undefined ? {} : { defer: options.defer }),
            },
          }
          if (trigger === "explicit") {
            return {
              ...buildExplicitEvidence({ ...common, input, turnDiff, events: undefined }),
              turnFiles,
              turnClass,
              turnTools: tools,
            }
          }
          return {
            ...buildAutomaticEvidence({
              ...common,
              turnDiff,
              events,
              // A6 — previously delivered steering for this observed session;
              // the reviewer uses it to mark repeats instead of re-litigating.
              steeringLog: await new SteeringLog(directory).list(sessionID),
            }),
            turnFiles,
            turnClass,
            turnTools: tools,
          }
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
            emitBadge(context.sessionID)
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
      const sessionID = event?.sessionID
      if (typeof sessionID !== "string") return
      const lines: string[] = []
      if (supervisedSessions.has(sessionID)) {
        lines.push(
          "Workflow supervisor: every finished turn in this project is independently reviewed. Findings are delivered as soon as each review completes; an idle session is woken to act on them. Present stage-complete only after the reviewer returns clean, or name the findings that remain and why they stand.",
        )
      }
      const reassertion = steering.context(sessionID)
      if (reassertion !== undefined) lines.push(reassertion)
      if (lines.length === 0) return
      event.system.push({ type: "text", text: lines.join("\n") })
    })

    // A4 — one-ride demotion. Prompt admission is the signal; synthetic
    // steering messages never run this hook, so the ride is consumed only by
    // the user's genuine next prompt (documented server-plugin hook,
    // Hooks → Sessions → Prompt admission).
    const promptHook = await ctx.session.hook("prompt", (event: any) => {
      const sessionID = event?.sessionID
      if (typeof sessionID !== "string") return
      steering.promptAdmitted(sessionID)
      // A11-batch — the user's prompt consumes queued findings; the badge
      // drops the waiting marker.
      if (waitingFindings.delete(sessionID)) {
        emitBadge(sessionID)
      }
    })

    // A9 — the post-settle checkpoint runner, shared by the immediate and
    // deferred paths. Collab is re-checked at run time so a flip between
    // defer and run is honored.
    const runExecutionCheckpoint = async (
      sessionID: string,
      directory: string,
      defer?: any,
    ): Promise<void> => {
      // A8 — collab suspends the per-turn automatic trigger; explicit
      // checkpoints are user-requested and unaffected.
      if (!automaticReviewAllowed(episodes.mode(sessionID))) return
      // A16 — a muted session (user lever or declared title) skips the
      // automatic trigger entirely; skips are logged for sweeps. Explicit
      // checkpoints bypass this path and are never muted.
      try {
        const policy = await resolveForSession(sessionID)
        if (mutedFor(sessionID, policy)) {
          void new IncidentLog(directory)
            .record({ kind: "muted_turn_skipped", sessionID })
            .catch(() => {})
          return
        }
      } catch {
        // Configuration errors surface through the observer's own path.
      }
      // A11-batch — the review-in-flight state is visible on the badge for
      // the whole checkpoint, including the reviewer run.
      reviewing.add(sessionID)
      supervisedSessions.add(sessionID)
      emitBadge(sessionID)
      let result: any
      try {
        result = await observerFor(directory).handleExecutionSucceeded(
          sessionID,
          defer === undefined ? undefined : { defer },
        )
      } finally {
        reviewing.delete(sessionID)
        emitBadge(sessionID)
      }
      // A16 — chore turns (no writes, git-family commands only) are not
      // work; the observer skips them before any reviewer is created. The
      // skip is logged so sweeps can see what was not reviewed.
      if (result?.status === "skipped") {
        void new IncidentLog(directory)
          .record({
            kind: "chore_turn_skipped",
            sessionID,
            detail: (result.commands ?? []).join(" | "),
          })
          .catch(() => {})
        return
      }
      if (result?.status !== "completed" || result.trigger !== "execution") {
        if (result?.status === "failed") {
          void new IncidentLog(directory)
            .record({ kind: "review_failed", sessionID, detail: result.checkpointID })
            .catch(() => {})
        }
        return
      }
      // A7/A8 — route before steering. A user-channel report never
      // reaches the builder inbox, consumes no attempt, and sets no
      // reassertion; the ledger and reports on disk already carry it.
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
          // A13 — a wake carries its frame: the builder knows it was woken
          // by the supervisor, fixes, states what changed, and ends the
          // turn without questions to the user or stage-complete claims.
          const active = activeSessions.has(sessionID)
          const siblingActive = siblingActiveIn(directory, sessionID)
          const plan = deliveryPlan({ active, episodeMode: episodes.mode(sessionID), siblingActive })
          const text = plan.resume ? wakeMessage(decision.text) : decision.text
          await new SteeringLog(directory).record({
            sessionID,
            checkpointID: result.checkpointID,
            text,
            attempts: decision.attempts,
            time: Date.now(),
          })
          // A12 — deliver the moment the review completes: live into the
          // running turn when the builder is active; an idle delegate-mode
          // builder is woken to act on its findings. Collab routes to the
          // user channel upstream and never reaches here.
          await ctx.session.synthetic({
            sessionID,
            text,
            delivery: plan.delivery,
            resume: plan.resume,
            metadata: {
              workflowSupervisor: true,
              checkpointID: result.checkpointID,
            },
          })
          if (plan.resume) {
            void new IncidentLog(directory)
              .record({ kind: "findings_wake", sessionID, detail: result.checkpointID })
              .catch(() => {})
          } else if (siblingActive && !active) {
            // A16 — an idle builder with an active sibling: the findings
            // queue with a badge marker, and the wake is held until the
            // folder is quiet so two sessions never edit one tree at once.
            waitingFindings.add(sessionID)
            heldWakes.hold(sessionID, directory)
            heldWakeTexts.set(sessionID, {
              text: decision.text,
              directory,
              checkpointID: result.checkpointID,
            })
            void new IncidentLog(directory)
              .record({ kind: "findings_held_wake", sessionID, detail: result.checkpointID })
              .catch(() => {})
          }
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
          void new IncidentLog(directory)
            .record({ kind: "steering_escalated", sessionID, detail: `${result.checkpointID} attempts=${decision.attempts}` })
            .catch(() => {})
        } else if (decision.action === "report") {
          // A14 — minor-only findings: recorded in the checkpoint ledger,
          // surfaced at the gate, never delivered. The loop ends here.
          void new IncidentLog(directory)
            .record({ kind: "minor_report_only", sessionID, detail: result.checkpointID })
            .catch(() => {})
        }
      }
      emitBadge(sessionID)
    }

    // A16 — the defer timer. A helper blocked on a user-held permission
    // decision pauses the deadline (a user-input wait is unbounded and
    // named on the badge); a genuinely stuck helper is force-run at the
    // deadline with a defer record naming the missing evidence.
    const armDeferTimer = (sessionID: string, directory: string): void => {
      const existing = pendingRuns.get(sessionID)
      if (existing !== undefined) clearTimeout(existing.timer)
      const timer = setTimeout(() => {
        const pending = pendingRuns.get(sessionID)
        if (pending === undefined) return
        const state = settle.deferState(sessionID)
        if (state.blockedOn.length > 0) {
          pending.paused = true
          void new IncidentLog(pending.directory)
            .record({ kind: "defer_paused_user_wait", sessionID, detail: state.blockedOn.join(" | ") })
            .catch(() => {})
          return
        }
        pendingRuns.delete(sessionID)
        settle.clear(sessionID)
        void new IncidentLog(pending.directory)
          .record({
            kind: "defer_deadline_forced",
            sessionID,
            detail: `inFlight=${state.inFlight}`,
          })
          .catch(() => {})
        void runExecutionCheckpoint(sessionID, pending.directory, deferRecord(state, deferTimeoutMs))
      }, deferTimeoutMs)
      pendingRuns.set(sessionID, { directory, timer, paused: false })
    }

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
        const type = (event as any).type as string

        // A9 — work-settle bookkeeping, independent of observer dispatch.
        // Reviewer sessions are parentless and never tracked.
        if (type === "session.execution.started") {
          activeSessions.add(sessionID)
          sessionDirs.set(sessionID, directory)
          void ctx.session
            .get({ sessionID })
            .then((session: any) => {
              if (typeof session?.parentID === "string") settle.trackChild(session.parentID, sessionID)
            })
            .catch(() => {})
        } else if (type === "permission.v2.asked") {
          // A16.1 — the host does not deliver this event to server-plugin
          // subscriptions (verified 2026-11-23, filament: a minute-long
          // prompt produced no incident and no event in checkpoint
          // evidence). The handler stays as a future-proof path: if a
          // later host delivers it, the wait is named generically and the
          // deadline pauses. Nothing below claims a command it cannot hear.
          const resources = (event as any).data?.resources
          const command =
            Array.isArray(resources) && typeof resources[0] === "string"
              ? resources[0]
              : String((event as any).data?.action ?? "permission prompt")
          const parent = settle.childBlocked(sessionID, command)
          if (parent !== undefined) {
            const pending = pendingRuns.get(parent)
            if (pending !== undefined && !pending.paused) {
              clearTimeout(pending.timer)
              pending.paused = true
            }
            void new IncidentLog(directory)
              .record({ kind: "defer_paused_user_wait", sessionID: parent, detail: command })
              .catch(() => {})
            emitBadge(parent)
          }
        } else if (type === "permission.v2.replied") {
          const parent = settle.childUnblocked(sessionID)
          if (parent !== undefined) {
            const pending = pendingRuns.get(parent)
            if (
              pending !== undefined &&
              pending.paused &&
              settle.hasInFlight(parent) &&
              settle.deferState(parent).blockedOn.length === 0
            ) {
              armDeferTimer(parent, pending.directory)
            }
            emitBadge(parent)
          }
        } else if (
          type === "session.execution.succeeded" ||
          type === "session.execution.failed" ||
          type === "session.execution.interrupted"
        ) {
          activeSessions.delete(sessionID)
          const settledParent = settle.childSettled(sessionID)
          if (settledParent !== undefined) {
            const pending = pendingRuns.get(settledParent)
            if (pending !== undefined) {
              pendingRuns.delete(settledParent)
              clearTimeout(pending.timer)
              void runExecutionCheckpoint(settledParent, pending.directory)
            }
          }
          // A16 — a quiet folder releases held wakes: the findings reach
          // their builder only when no other session is editing the tree.
          for (const folder of heldWakes.folders()) {
            if (siblingActiveIn(folder, "")) continue
            for (const heldID of heldWakes.release(folder)) {
              const pending = heldWakeTexts.get(heldID)
              heldWakeTexts.delete(heldID)
              if (pending === undefined) continue
              void ctx.session
                .synthetic({
                  sessionID: heldID,
                  text: wakeMessage(pending.text),
                  delivery: "queue",
                  resume: true,
                  metadata: { workflowSupervisor: true, checkpointID: pending.checkpointID },
                })
                .then(() =>
                  new IncidentLog(pending.directory).record({
                    kind: "findings_wake",
                    sessionID: heldID,
                    detail: `${pending.checkpointID} held-release`,
                  }),
                )
                .catch(() => {})
              waitingFindings.delete(heldID)
            }
          }
        }

        if (type === "session.execution.succeeded") {
          void observer.recordEvent(event).then(async (owned) => {
            if (!owned) return
            // A9 — defer while the observed session has helpers in flight;
            // the deferred capture then sees their posted results in the
            // parent transcript. The deadline force-run bounds a helper
            // that never settles.
            if (settle.hasInFlight(sessionID)) {
              armDeferTimer(sessionID, directory)
              return
            }
            settle.clear(sessionID)
            void runExecutionCheckpoint(sessionID, directory)
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
      for (const pending of pendingRuns.values()) clearTimeout(pending.timer)
      pendingRuns.clear()
    }
  },
})
