import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const temporaryDirectories: string[] = []

export async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "workflow-supervisor-"))
  temporaryDirectories.push(directory)
  return directory
}

export async function cleanupTemporaryDirectories(): Promise<void> {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
}

export async function writePolicy(directory: string, contents: string): Promise<void> {
  const config = join(directory, ".opencode")
  await mkdir(config, { recursive: true })
  await writeFile(join(config, "workflow.jsonc"), contents)
}

export function policyText(mode = "advisory"): string {
  return `{
    // Policy schema version 1
    "enabled": true,
    "mode": ${JSON.stringify(mode)},
    "workflow": "contract-tests-lock-verify",
    "version": 1,
    "contract": "docs/contract.md",
  }`
}

export function resolution(root: string, overrides: Record<string, any> = {}): Record<string, any> {
  const requestedMode = overrides.requestedMode ?? "advisory"
  return {
    active: true,
    worktree: root,
    mainRepository: root,
    requestedMode,
    effectiveMode: "advisory",
    policy: {
      enabled: true,
      mode: requestedMode,
      workflow: "contract-tests-lock-verify",
      version: 1,
      contract: "docs/contract.md",
    },
    contractPath: join(root, "docs/contract.md"),
    contractContent: "Agreed contract",
    session: {
      id: "ses_observed",
      agent: "build",
      location: root,
    },
    ...overrides,
  }
}

export function evidence(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    hash: "evidence-1",
    latestUserRequest: "Implement the agreed change",
    turnDiff: [{ file: "src/feature.ts", patch: "turn patch", additions: 1, deletions: 0, status: "modified" }],
    workingDiff: [{ file: "src/feature.ts", patch: "working patch", additions: 1, deletions: 0, status: "modified" }],
    status: [{ file: "src/feature.ts", additions: 1, deletions: 0, status: "modified" }],
    events: [{ type: "session.execution.started", durable: { seq: 1 } }],
    completeness: { workingDiff: true, turnDiff: true, events: true },
    chronologyAllowed: true,
    contractPath: "/project/A/docs/contract.md",
    contractContent: "Agreed contract",
    requestedMode: "advisory",
    effectiveMode: "advisory",
    provenance: { trigger: "execution", sessionID: "ses_observed" },
    ...overrides,
  }
}

export class MemoryLedger {
  claims = new Map<string, any>()
  evidence = new Map<string, any>()
  completed = new Map<string, any>()
  failed = new Map<string, any>()
  errors: any[] = []

  async claim(id: string, metadata: any): Promise<boolean> {
    if (this.claims.has(id)) return false
    this.claims.set(id, metadata)
    return true
  }

  async writeEvidence(id: string, value: any): Promise<void> {
    this.evidence.set(id, value)
  }

  async complete(id: string, result: any): Promise<void> {
    this.completed.set(id, result)
  }

  async fail(id: string, error: any): Promise<void> {
    this.failed.set(id, error)
  }

  async recordError(error: any): Promise<void> {
    this.errors.push(error)
  }

  path(id: string): string {
    return join("/memory", id)
  }
}

export async function observerHarness(options: Record<string, any> = {}) {
  const { WorkflowObserver } = await import("./observer.ts")
  const root = options.root ?? "/project/A"
  const ledger = options.ledger ?? new MemoryLedger()
  const reviewerCalls: any[] = []
  const captureCalls: any[] = []
  const notifications: any[] = []
  const logs: any[] = []
  const activeCaptures = { current: 0, maximum: 0 }

  const observer = new WorkflowObserver({
    location: options.location ?? root,
    resolvePolicy: options.resolvePolicy ?? (async () => options.resolution === undefined ? resolution(root) : options.resolution),
    captureEvidence: async (sessionID: string, trigger: string, input: any) => {
      captureCalls.push({ sessionID, trigger, input })
      activeCaptures.current += 1
      activeCaptures.maximum = Math.max(activeCaptures.maximum, activeCaptures.current)
      try {
        if (options.captureEvidence) return await options.captureEvidence(sessionID, trigger, input)
        return options.evidence ?? evidence()
      } finally {
        activeCaptures.current -= 1
      }
    },
    runReviewer: async (input: any) => {
      reviewerCalls.push(input)
      if (options.runReviewer) return options.runReviewer(input)
      return {
        sessionID: "ses_reviewer",
        report: "Mode: checkpoint\nVerdict: CONCERNS",
        usage: {
          tokens: { input: 10, output: 4, reasoning: 3, cache: { read: 0, write: 0 } },
          cost: 0,
          elapsedMs: 25,
        },
      }
    },
    ledger,
    notify: async (error: any) => {
      notifications.push(error)
      if (options.notify) await options.notify(error)
    },
    log: (error: any) => {
      logs.push(error)
      if (options.log) options.log(error)
    },
    timeoutMs: options.timeoutMs ?? 1_000,
  })

  return { observer, ledger, reviewerCalls, captureCalls, notifications, logs, activeCaptures }
}
