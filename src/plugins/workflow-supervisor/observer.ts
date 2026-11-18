import { createHash } from "node:crypto"
import { join, resolve } from "node:path"
import { EvidenceTruncatedError } from "./evidence.ts"
import type { WorkflowLedger } from "./ledger.ts"
import { PolicyError } from "./policy.ts"

export const checkpointInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    phase: { type: "string" },
    transition: { type: "string" },
  },
} as const

export function parseCheckpointInput(input: unknown): { phase?: string; transition?: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Checkpoint input must be an object")
  }
  for (const key of Object.keys(input)) {
    if (key !== "phase" && key !== "transition") throw new Error(`Unsupported checkpoint input field: ${key}`)
  }
  const value = input as Record<string, unknown>
  for (const key of ["phase", "transition"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(`Checkpoint input field ${key} must be a string`)
    }
  }
  return {
    ...(typeof value.phase === "string" ? { phase: value.phase } : {}),
    ...(typeof value.transition === "string" ? { transition: value.transition } : {}),
  }
}

function locationPath(location: any): string | null {
  if (typeof location === "string") return resolve(location)
  if (location && typeof location === "object") {
    if (typeof location.directory === "string") return resolve(location.directory)
    if (typeof location.path === "string") return resolve(location.path)
  }
  return null
}

export function canonicalLocationEqual(left: any, right: any): boolean {
  const a = locationPath(left)
  const b = locationPath(right)
  return a !== null && b !== null && a === b
}

export class ConfigurationErrorDispatcher {
  private readonly seen = new Set<string>()
  private readonly emit: (event: any) => Promise<void> | void
  private readonly log: (error: any) => void
  private readonly record: (error: any) => Promise<void> | void

  constructor(options: {
    emit: (event: any) => Promise<void> | void
    log: (error: any) => void
    record: (error: any) => Promise<void> | void
  }) {
    this.emit = options.emit
    this.log = options.log
    this.record = options.record
  }

  async report(input: { fingerprint: string; location: any; code: string; message: string }): Promise<boolean> {
    if (this.seen.has(input.fingerprint)) return false
    this.seen.add(input.fingerprint)
    const error = { ...input }
    await this.emit({
      type: "configurationError",
      location: input.location,
      data: {
        code: input.code,
        message: input.message,
        fingerprint: input.fingerprint,
      },
    })
    this.log(error)
    await this.record(error)
    return true
  }
}

function checkpointID(sessionID: string, trigger: string, hash: string): string {
  return `cp-${createHash("sha256").update(`${sessionID}\0${trigger}\0${hash}`).digest("hex")}`
}

export class WorkflowObserver {
  private readonly location: string
  private readonly resolvePolicy: (sessionID: string) => Promise<any>
  private readonly captureEvidence: (sessionID: string, trigger: string, input: any, policy: any) => Promise<any>
  private readonly runReviewer: (input: any) => Promise<any>
  private readonly ledger: WorkflowLedger
  private readonly notify: (error: any) => Promise<void> | void
  private readonly log: (error: any) => void
  private readonly timeoutMs: number
  private readonly queues = new Map<string, Promise<any>>()
  private readonly events = new Map<string, any[]>()
  private readonly dispatcher: ConfigurationErrorDispatcher

  constructor(options: {
    location: string
    resolvePolicy: (sessionID: string) => Promise<any>
    captureEvidence: (sessionID: string, trigger: string, input: any, policy: any) => Promise<any>
    runReviewer: (input: any) => Promise<any>
    ledger: WorkflowLedger
    notify: (error: any) => Promise<void> | void
    log: (error: any) => void
    timeoutMs: number
  }) {
    this.location = options.location
    this.resolvePolicy = options.resolvePolicy
    this.captureEvidence = options.captureEvidence
    this.runReviewer = options.runReviewer
    this.ledger = options.ledger
    this.notify = options.notify
    this.log = options.log
    this.timeoutMs = options.timeoutMs
    this.dispatcher = new ConfigurationErrorDispatcher({
      emit: async () => {},
      log: (error) => {
        this.log(error)
        void this.notify(error)
      },
      record: async (error) => {
        if (error.code !== "repository_resolution") await this.ledger.recordError(error)
      },
    })
  }

  private enqueue(key: string, task: () => Promise<any>): Promise<any> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(key, next.then(
      () => undefined,
      () => undefined,
    ))
    return next
  }

  private async resolve(sessionID: string): Promise<any> {
    try {
      return await this.resolvePolicy(sessionID)
    } catch (error) {
      if (error instanceof PolicyError) {
        await this.dispatcher.report({
          fingerprint: error.fingerprint,
          location: this.location,
          code: error.code,
          message: error.message,
        })
        return { error: true }
      }
      throw error
    }
  }

  private ignored(policy: any, sessionID: string, automatic: boolean): boolean {
    const session = policy.session ?? {}
    if (!canonicalLocationEqual(this.location, session.location)) return true
    if (session.agent === "workflow-reviewer") return true
    if (session.metadata?.workflowSupervisorReview) return true
    if (automatic && session.parentID) return true
    if (session.id && session.id !== sessionID) return true
    return false
  }

  private async process(sessionID: string, trigger: "execution" | "explicit", input?: any): Promise<any> {
    const policy = await this.resolve(sessionID)
    if (policy?.error) return { status: "error" }
    if (!policy) return { status: "disabled" }
    if (this.ignored(policy, sessionID, trigger === "execution")) return { status: "ignored" }

    let evidence: any
    try {
      evidence = await this.captureEvidence(sessionID, trigger, input, policy)
    } catch (error) {
      const id = checkpointID(sessionID, trigger, `error:${(error as Error).message}`)
      if (await this.ledger.claim(id, {
        trigger,
        observedSessionID: sessionID,
        requestedMode: policy.requestedMode,
        effectiveMode: policy.effectiveMode,
        status: "failed",
      })) {
        await this.ledger.fail(id, error)
      }
      return { status: "failed", checkpointID: id }
    }

    const id = checkpointID(sessionID, trigger, evidence.hash)
    const metadata = {
      trigger,
      observedSessionID: sessionID,
      observedAgent: policy.session?.agent,
      requestedMode: policy.requestedMode,
      effectiveMode: policy.effectiveMode,
      evidenceHash: evidence.hash,
      contractPath: evidence.contractPath,
      status: "claimed",
    }
    if (!(await this.ledger.claim(id, metadata))) return { status: "duplicate", checkpointID: id }

    await this.ledger.writeEvidence(id, evidence)
    if ((this.ledger as any).writeEvents && evidence.events) {
      await (this.ledger as any).writeEvents(id, evidence.events)
    }

    try {
      const result = await this.runReviewer({
        client: (this as any).client,
        location: policy.worktree,
        contractPath: evidence.contractPath,
        evidencePath: join(this.ledger.path(id), "evidence.json"),
        eventsPath: join(this.ledger.path(id), "events.json"),
        provenance: evidence.provenance,
        timeoutMs: this.timeoutMs,
        explicit: trigger === "explicit",
        latestUserRequest: evidence.latestUserRequest,
        changedFiles: evidence.workingDiff
          .map((item: any) => (typeof item?.file === "string" ? item.file : undefined))
          .filter((file: any): file is string => typeof file === "string"),
      })
      await this.ledger.complete(id, result)
      if (trigger === "explicit") {
        return { status: "completed", checkpointID: id, statePath: this.ledger.path(id) }
      }
      return {
        status: "completed",
        checkpointID: id,
        trigger,
        requestedMode: policy.requestedMode,
        effectiveMode: policy.effectiveMode,
        contractPath: evidence.contractPath,
        report: result.report,
        reportPath: join(this.ledger.path(id), "report.md"),
      }
    } catch (error) {
      await this.ledger.fail(id, error)
      return { status: "failed", checkpointID: id }
    }
  }

  async handleExecutionSucceeded(sessionID: string): Promise<any> {
    return this.enqueue(
      sessionID,
      () => this.process(sessionID, "execution"),
    )
  }

  async explicitCheckpoint(sessionID: string, input: unknown = {}): Promise<any> {
    let parsed: { phase?: string; transition?: string }
    parsed = parseCheckpointInput(input)
    return this.enqueue(
      sessionID,
      () => this.process(sessionID, "explicit", parsed),
    )
  }

  async recordEvent(event: any): Promise<boolean> {
    const sessionID = event?.data?.sessionID ?? event?.sessionID
    if (typeof sessionID !== "string") return false
    const policy = await this.resolve(sessionID)
    if (!policy || policy.error) return false
    if (this.ignored(policy, sessionID, true)) return false
    const list = this.events.get(sessionID) ?? []
    list.push({ ...event, durable: { seq: list.length + 1 } })
    this.events.set(sessionID, list)
    return true
  }

  bufferedEvents(sessionID: string): any[] {
    return [...(this.events.get(sessionID) ?? [])]
  }
}
