import { createHash } from "node:crypto"

export class EvidenceTruncatedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvidenceTruncatedError"
  }
}

export interface EvidenceCompleteness {
  workingDiff: boolean
  turnDiff: boolean
  events: boolean
  steeringLog: boolean
}

export interface WorkflowEvidence {
  hash: string
  latestUserRequest: string
  latestAssistantText?: string
  turnDiff?: any[]
  workingDiff: any[]
  status: any[]
  events?: any[]
  steeringLog?: any[]
  completeness: EvidenceCompleteness
  chronologyAllowed: boolean
  contractPath: string
  contractContent: string
  requestedMode: string
  effectiveMode: "advisory" | "steer"
  provenance: Record<string, any>
}

function truncated(items: any[] | undefined): boolean {
  return (items ?? []).some((item) => item?.more === true)
}

/**
 * A15 — mechanically establish whether the turn under review changed files.
 * The turn window starts at the session's last execution.started event;
 * step.ended events carry the files each step wrote. Returns the union of
 * those files, [] for a positively-established no-op turn, or undefined
 * when the window cannot be established (unknown, never silently no-op).
 */
export function turnChangedFiles(events: any[] | undefined): string[] | undefined {
  const list = events ?? []
  let start = -1
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const event = list[index]
    if (event?.type === "session.execution.started" && typeof event?.data?.sessionID === "string") {
      start = index
      break
    }
  }
  if (start === -1) return undefined
  const files = new Set<string>()
  for (const event of list.slice(start)) {
    const stepFiles = event?.data?.files
    if (!Array.isArray(stepFiles)) continue
    for (const file of stepFiles) {
      if (typeof file === "string" && file.trim() !== "") files.add(file)
    }
  }
  return [...files]
}

function eventsComplete(events: any[] | undefined): boolean {
  const list = events ?? []
  return list.every((event, index) => event?.durable?.seq === index + 1)
}

export function evidenceHash(value: Omit<WorkflowEvidence, "hash">): string {
  const stable = {
    latestUserRequest: value.latestUserRequest,
    latestAssistantText: value.latestAssistantText,
    turnDiff: value.turnDiff,
    workingDiff: value.workingDiff,
    status: value.status,
    events: value.events,
    contractPath: value.contractPath,
    contractContent: value.contractContent,
    requestedMode: value.requestedMode,
    effectiveMode: value.effectiveMode,
  }
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex")
}

export function buildAutomaticEvidence(input: {
  session: any
  latestUserRequest: string
  latestAssistantText?: string
  turnDiff?: any[]
  workingDiff?: any[]
  status?: any[]
  events?: any[]
  steeringLog?: any[]
  policy: any
  provenance: Record<string, any>
}): WorkflowEvidence {
  const workingDiff = input.workingDiff ?? []
  if (truncated(workingDiff)) {
    throw new EvidenceTruncatedError("Working-tree diff is truncated; reviewer invocation is blocked")
  }

  const turnDiff = input.turnDiff ?? []
  const events = input.events ?? []
  const turnDiffComplete = input.turnDiff !== undefined && !truncated(turnDiff)
  const eventsAreComplete = eventsComplete(events)
  // A6 — the steering log is context, not evidence identity: it never feeds
  // the evidence hash. Unavailable means the caller could not read it, not
  // that no deliveries exist; provenance records the omission either way.
  const steeringLog = input.steeringLog ?? []
  const steeringLogComplete = input.steeringLog !== undefined
  const value = {
    latestUserRequest: input.latestUserRequest,
    latestAssistantText: input.latestAssistantText,
    turnDiff,
    workingDiff,
    status: input.status ?? [],
    events,
    steeringLog,
    completeness: {
      workingDiff: true,
      turnDiff: turnDiffComplete,
      events: eventsAreComplete,
      steeringLog: steeringLogComplete,
    },
    chronologyAllowed: turnDiffComplete && eventsAreComplete,
    contractPath: input.policy.contractPath,
    contractContent: input.policy.contractContent,
    requestedMode: input.policy.requestedMode,
    effectiveMode: (input.policy.effectiveMode ?? "advisory") as "advisory" | "steer",
    provenance: steeringLogComplete
      ? input.provenance
      : { ...input.provenance, steeringLog: "unavailable" },
  }
  return { hash: evidenceHash(value), ...value }
}

export function buildExplicitEvidence(input: {
  session: any
  policy: any
  latestUserRequest: string
  latestAssistantText?: string
  workingDiff?: any[]
  status?: any[]
  turnDiff?: any[]
  events?: any[]
  input?: any
  provenance: Record<string, any>
}): WorkflowEvidence {
  const workingDiff = input.workingDiff ?? []
  if (truncated(workingDiff)) {
    throw new EvidenceTruncatedError("Working-tree diff is truncated; reviewer invocation is blocked")
  }

  const value = {
    latestUserRequest: input.latestUserRequest,
    latestAssistantText: input.latestAssistantText,
    workingDiff,
    status: input.status ?? [],
    completeness: {
      workingDiff: true,
      turnDiff: false,
      events: false,
    },
    chronologyAllowed: false,
    contractPath: input.policy.contractPath,
    contractContent: input.policy.contractContent,
    requestedMode: input.policy.requestedMode,
    effectiveMode: (input.policy.effectiveMode ?? "advisory") as "advisory" | "steer",
    provenance: {
      ...input.provenance,
      phase: input.input?.phase,
      transition: input.input?.transition,
    },
  }
  return { hash: evidenceHash(value), ...value }
}
