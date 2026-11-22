import { resolve } from "node:path"

// Phase 3.1 routing (amendments A7/A8). Pure decisions only — no SDK imports.
// The wiring in index.ts owns the episode state and calls these per checkpoint.

export type EpisodeMode = "delegate" | "collab"

/**
 * A8 — collab suspends the per-turn automatic review trigger; delegate keeps
 * it. Explicit checkpoints are unaffected: they are user-requested by
 * definition and remain report-only.
 */
export function automaticReviewAllowed(mode: EpisodeMode): boolean {
  return mode !== "collab"
}

/**
 * A7/A8 — routing key for a completed findings report.
 *
 * - `collab` routes everything to the user channel: the user is present and
 *   steering the work, so findings must not compete with their direction.
 * - `delegate` applies the contract-file proxy: a nonempty working diff in
 *   which every file is the policy's contract file means the user is shaping
 *   their own artifact, so findings go to the user. An empty or mixed diff
 *   queues to the builder as before — the nonempty guard keeps clean-tree
 *   reports from being diverted by a vacuous all-of-nothing match.
 *
 * Path forms: `vcs.diff` returns worktree-relative files while the policy's
 * contract path is absolute (both verified from live checkpoint evidence),
 * so each diff file is resolved against the worktree before comparison.
 */
export function routeReport(input: {
  episodeMode: EpisodeMode
  workingDiff: any[]
  contractPath: string
  worktree: string
}): { channel: "user" | "builder" } {
  if (input.episodeMode === "collab") return { channel: "user" }

  const files = (input.workingDiff ?? [])
    .map((item) => (typeof item?.file === "string" ? item.file : undefined))
    .filter((file): file is string => typeof file === "string")
  if (files.length === 0) return { channel: "builder" }

  const contract = resolve(input.contractPath)
  const everyFileIsContract = files.every((file) => resolve(input.worktree, file) === contract)
  return everyFileIsContract ? { channel: "user" } : { channel: "builder" }
}

/**
 * A12 — delivery plan at review completion. An active builder receives
 * findings live (mid-turn). An idle builder in delegate mode is WOKEN to
 * act on them: the agent is the declared driver, so findings are its job,
 * and the repeat-based budget bounds the loop it enters — fix the findings
 * and the next review goes clean (nothing burns); repeat them and the
 * budget burns to escalation. Collab mode never reaches here (its findings
 * route to the user channel upstream).
 */
export function deliveryPlan(input: {
  active: boolean
  episodeMode: EpisodeMode
}): { delivery: "steer" | "queue"; resume: boolean } {
  if (input.active) return { delivery: "steer", resume: false }
  // Collab never wakes: the user is driving, so findings wait for them.
  if (input.episodeMode === "collab") return { delivery: "queue", resume: false }
  return { delivery: "queue", resume: true }
}

/**
 * A8 — user-held runtime episode state, one mode per session. In-memory
 * only: never persisted to config and it dies with the server process. The
 * builder has no surface to flip it; only the TUI RPC does.
 */
export class EpisodeState {
  private readonly modes = new Map<string, EpisodeMode>()

  mode(sessionID: string): EpisodeMode {
    return this.modes.get(sessionID) ?? "delegate"
  }

  setCollab(sessionID: string): void {
    this.modes.set(sessionID, "collab")
  }

  setDelegate(sessionID: string): void {
    this.modes.set(sessionID, "delegate")
  }
}
