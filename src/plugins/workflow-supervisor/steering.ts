import { createHash } from "node:crypto"

export type SteeringDecision =
  | { action: "none"; reason: "mode" | "no-findings" }
  | { action: "steer"; text: string; fingerprint: string; attempts: number }
  | { action: "duplicate"; fingerprint: string; attempts: number }
  | { action: "escalate"; reason: "limit"; fingerprint: string; attempts: number }

export function verdictOf(report: string): string {
  const match = report.match(/^\s*(?:\*\*)?Verdict:(?:\*\*)?\s*([A-Z_]+)/m)
  return match?.[1] ?? "UNKNOWN"
}

export function hasFindings(report: string): boolean {
  const match = report.match(/Findings:\s*\n([\s\S]*?)(?=\n\nNot assessed|$)/i)
  if (!match) return false
  const body = match[1].trim()
  if (body === "") return false
  return !/^-\s*No findings$/im.test(body)
}

function fingerprintOf(report: string): string {
  return createHash("sha256")
    .update(report.replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex")
}

function steeringText(input: {
  checkpointID: string
  report: string
}): string {
  return `Workflow supervisor checkpoint ${input.checkpointID} review:\n\n${input.report}`
}

interface SteeringState {
  attempts: number
  fingerprints: Set<string>
  contractPath?: string
  reportPath?: string
  report?: string
  checkpointID?: string
}

export class SteeringCoordinator {
  private readonly limit: number
  private readonly states = new Map<string, SteeringState>()

  constructor(options: { limit?: number } = {}) {
    this.limit = options.limit ?? 3
  }

  consider(input: {
    sessionID: string
    requestedMode: string
    checkpointID: string
    report: string
    contractPath: string
    reportPath: string
  }): SteeringDecision {
    if (input.requestedMode !== "steer" && input.requestedMode !== "enforce") {
      return { action: "none", reason: "mode" }
    }

    const state: SteeringState = this.states.get(input.sessionID) ?? {
      attempts: 0,
      fingerprints: new Set<string>(),
    }
    this.states.set(input.sessionID, state)
    state.contractPath = input.contractPath
    state.reportPath = input.reportPath

    if (!hasFindings(input.report)) {
      state.report = undefined
      state.checkpointID = undefined
      return { action: "none", reason: "no-findings" }
    }

    const fingerprint = fingerprintOf(input.report)
    if (state.fingerprints.has(fingerprint)) {
      return { action: "duplicate", fingerprint, attempts: state.attempts }
    }
    if (state.attempts >= this.limit) {
      return { action: "escalate", reason: "limit", fingerprint, attempts: state.attempts }
    }

    state.attempts += 1
    state.fingerprints.add(fingerprint)
    state.report = input.report
    state.checkpointID = input.checkpointID
    return {
      action: "steer",
      text: steeringText(input),
      fingerprint,
      attempts: state.attempts,
    }
  }

  context(sessionID: string): string | undefined {
    const state = this.states.get(sessionID)
    if (!state) return undefined
    const contract = state.contractPath
      ? `Active contract: ${state.contractPath}`
      : "Active contract: unavailable"
    if (!state.report || !state.checkpointID) {
      return `Workflow supervisor: ${contract}. No unresolved findings.`
    }
    return [
      `Workflow supervisor: ${contract}.`,
      `Unresolved findings from checkpoint ${state.checkpointID}:`,
      state.report,
    ].join("\n")
  }
}
