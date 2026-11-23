import { createHash } from "node:crypto"

/**
 * The reviewer's report format drifts across sessions — plain, bold, and
 * markdown-heading forms have all been observed. Two dead-letters proved
 * the cost (sweep 2026-11-22): a bold Findings header evaded detection, and
 * a `## Findings` heading dead-lettered a MAJOR while re-arming the budget.
 * All prose-signal parsing runs on a copy with heading markers and bold
 * stripped, so signals match regardless of the decoration chosen.
 */
function normalizedProse(report: string): string {
  return report
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/\*\*/g, "")
}

export type SteeringDecision =
  | { action: "none"; reason: "mode" | "no-findings" }
  | { action: "steer"; text: string; fingerprint: string; attempts: number }
  | { action: "duplicate"; fingerprint: string; attempts: number }
  | { action: "escalate"; reason: "limit"; fingerprint: string; attempts: number }
  | { action: "report"; attempts: number }

export function verdictOf(report: string): string {
  const match = normalizedProse(report).match(
    /^\s*Verdict\b[\s:]*(SUPPORTS_TRANSITION|CONCERNS|INSUFFICIENT_EVIDENCE|NOT_REQUESTED)/m,
  )
  return match?.[1] ?? "UNKNOWN"
}

/**
 * A13 — the wake frame. The marker names the sender; the message tells a
 * woken builder what kind of turn this is: a supervisor-driven correction,
 * not a conversation — fix, state what changed, end the turn. Without the
 * frame the builder conversed with the user, asked questions, and proposed
 * rulings (sweep finding 2026-11-22).
 */
export const WAKE_MARKER = "Workflow supervisor follow-up"

export function wakeMessage(report: string): string {
  return [
    `${WAKE_MARKER}: you were woken to act on the review findings below.`,
    "Fix them, then end your turn with a brief note of what changed — no questions to the user, no stage-complete claim; your response will be re-reviewed automatically.",
    "",
    report,
  ].join("\n")
}

export function isFollowUpRequest(text: unknown): boolean {
  return typeof text === "string" && text.startsWith(WAKE_MARKER)
}

export function hasFindings(report: string): boolean {
  // Format drift is normalized (plain, bold, and ## heading forms have all
  // dead-lettered reports — see normalizedProse). The section may carry a
  // colon or not; the terminator and the no-findings line tolerate trailing
  // punctuation.
  const match = normalizedProse(report).match(/Findings\b[\s:]*\n([\s\S]*?)(?=\n\nNot assessed|\n\nPreviously delivered|$)/i)
  if (!match) return false
  const body = match[1].trim()
  if (body === "") return false
  return !/^(?:-\s*)?No findings[.!]*\s*$/im.test(body)
}
/**
 * A11 — true when the report itself marks findings as repeats of previously
 * delivered steering ("previously steered, still unresolved"), the
 * convention pinned in the reviewer instructions. The budget counts
 * unresolved repeats, not distinct reports.
 */
export function hasRepeats(report: string): boolean {
  return /\bpreviously steered\b/i.test(report)
}

/**
 * A14 — severity gates delivery. Blocking and major findings steer and
 * wake; minor-only reports are recorded and surface at the gate, but they
 * never interrupt the builder — the gate must settle (sweep finding
 * 2026-11-22: a wake loop over a missing prose paragraph kept the RED gate
 * moving under the user's feet). Severity markers drift between plain and
 * bold forms, so the test tolerates both, same lesson as hasFindings.
 */
export function hasBlockingOrMajor(report: string): boolean {
  return /\bseverity\b[\s:]*(blocking|major)\b/i.test(normalizedProse(report))
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

/**
 * A5 — payload for the `escalationRaised` RPC event. A dedicated event: the
 * `stateUpdated` schema is badge-shaped (`additionalProperties: false`) and
 * cannot carry an escalation payload.
 */
export function escalationEvent(input: {
  sessionID: string
  checkpointID: string
  attempts: number
}): { sessionID: string; checkpointID: string; attempts: number } {
  return { sessionID: input.sessionID, checkpointID: input.checkpointID, attempts: input.attempts }
}

interface SteeringState {
  attempts: number
  fingerprints: Set<string>
  /** A4 one-ride window: 1 while a delivered report is active for its consuming turn. */
  ride: number
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
      ride: 0,
    }
    this.states.set(input.sessionID, state)
    state.contractPath = input.contractPath
    state.reportPath = input.reportPath

    if (!hasFindings(input.report)) {
      state.report = undefined
      state.checkpointID = undefined
      state.ride = 0
      // A clean review is demonstrated trust: the budget fully re-arms.
      state.attempts = 0
      state.fingerprints.clear()
      return { action: "none", reason: "no-findings" }
    }

    // A14 — severity gates delivery. Minor-only findings never steer, wake,
    // burn the budget, or hold unresolved state: they are recorded in the
    // checkpoint ledger for the gate decision and nothing else. The gate
    // must settle.
    if (!hasBlockingOrMajor(input.report)) {
      return { action: "report", attempts: state.attempts }
    }

    const fingerprint = fingerprintOf(input.report)
    if (state.fingerprints.has(fingerprint)) {
      return { action: "duplicate", fingerprint, attempts: state.attempts }
    }

    // A11 — the budget counts unresolved repeats, not distinct reports.
    // A repeat-free findings report is progress or new information and
    // delivers freely; only findings the reviewer marks as repeating
    // previously delivered steering burn the budget.
    const carriesRepeats = hasRepeats(input.report)
    if (carriesRepeats) {
      if (state.attempts >= this.limit) {
        return { action: "escalate", reason: "limit", fingerprint, attempts: state.attempts }
      }
      state.attempts += 1
    }

    state.fingerprints.add(fingerprint)
    state.report = input.report
    state.checkpointID = input.checkpointID
    state.ride = 1
    return {
      action: "steer",
      text: steeringText(input),
      fingerprint,
      attempts: state.attempts,
    }
  }

  /**
   * A4 — one-ride window. The first admission after a delivery consumes the
   * ride and keeps the report active through that turn; the admission after
   * that demotes the report to the panel. Unknown sessions are a no-op.
   */
  promptAdmitted(sessionID: string): void {
    const state = this.states.get(sessionID)
    if (!state) return
    if (state.ride > 0) {
      state.ride -= 1
      return
    }
    state.report = undefined
    state.checkpointID = undefined
  }

  /**
   * A8 — collab disarm. Clears the unresolved report and any armed ride for
   * the session without touching attempts or fingerprints: a delivered
   * message's ledger record and dedup history survive the override.
   */
  disarm(sessionID: string): void {
    const state = this.states.get(sessionID)
    if (!state) return
    state.ride = 0
    state.report = undefined
    state.checkpointID = undefined
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

  /** Read-only view for badge/panel rendering: attempts, limit, unresolved state. */
  view(sessionID: string): { attempts: number; limit: number; hasUnresolved: boolean } | undefined {
    const state = this.states.get(sessionID)
    if (!state) return undefined
    return {
      attempts: state.attempts,
      limit: this.limit,
      hasUnresolved: Boolean(state.report && state.checkpointID),
    }
  }
}
