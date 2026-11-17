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
}

export interface WorkflowEvidence {
  hash: string
  latestUserRequest: string
  turnDiff?: any[]
  workingDiff: any[]
  status: any[]
  events?: any[]
  completeness: EvidenceCompleteness
  chronologyAllowed: boolean
  contractPath: string
  contractContent: string
  requestedMode: string
  effectiveMode: "advisory"
  provenance: Record<string, any>
}

function truncated(items: any[] | undefined): boolean {
  return (items ?? []).some((item) => item?.more === true)
}

function eventsComplete(events: any[] | undefined): boolean {
  const list = events ?? []
  return list.every((event, index) => event?.durable?.seq === index + 1)
}

export function evidenceHash(value: Omit<WorkflowEvidence, "hash">): string {
  const stable = {
    latestUserRequest: value.latestUserRequest,
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
  turnDiff?: any[]
  workingDiff?: any[]
  status?: any[]
  events?: any[]
  policy: any
  provenance: Record<string, any>
}): WorkflowEvidence {
  const workingDiff = input.workingDiff ?? []
  if (truncated(workingDiff)) {
    throw new EvidenceTruncatedError("Working-tree diff is truncated; reviewer invocation is blocked")
  }

  const turnDiff = input.turnDiff ?? []
  const events = input.events ?? []
  const turnDiffComplete = !truncated(turnDiff)
  const eventsAreComplete = eventsComplete(events)
  const value = {
    latestUserRequest: input.latestUserRequest,
    turnDiff,
    workingDiff,
    status: input.status ?? [],
    events,
    completeness: {
      workingDiff: true,
      turnDiff: turnDiffComplete,
      events: eventsAreComplete,
    },
    chronologyAllowed: turnDiffComplete && eventsAreComplete,
    contractPath: input.policy.contractPath,
    contractContent: input.policy.contractContent,
    requestedMode: input.policy.requestedMode,
    effectiveMode: "advisory" as const,
    provenance: input.provenance,
  }
  return { hash: evidenceHash(value), ...value }
}

export function buildExplicitEvidence(input: {
  session: any
  policy: any
  latestUserRequest: string
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
    effectiveMode: "advisory" as const,
    provenance: {
      ...input.provenance,
      phase: input.input?.phase,
      transition: input.input?.transition,
    },
  }
  return { hash: evidenceHash(value), ...value }
}
