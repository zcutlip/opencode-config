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
 * A16 — turn classification for the automatic trigger. The window is
 * mechanical (the turn's captured step files and tool calls), never a model
 * judgment:
 *
 * - `unknown`: the turn window could not be established (no execution start
 *   in the buffered events) — never treated as a skip.
 * - `work`: files changed, or any tool that is not read-only or shell.
 * - `chore`: no files changed and at least one git-family shell command,
 *   with every other tool read-only — the out-of-band git/commit turn that
 *   was never meant to be supervised.
 * - `no-op`: no files changed and no shell commands at all — the A15 path,
 *   where the turn's claims are still reviewed.
 */
export type TurnClass = "work" | "chore" | "no-op" | "unknown"

const readOnlyTools = new Set(["read", "grep", "glob", "list", "webfetch"])

function isGitFamily(command: string): boolean {
  return /^git(\s|$)/.test(command.trim())
}

export function classifyTurn(input: {
  turnFiles: string[] | undefined
  tools: Array<{ tool: string; command?: string }>
}): TurnClass {
  if (input.turnFiles === undefined) return "unknown"
  if (input.turnFiles.length > 0) return "work"

  const tools = input.tools ?? []
  let gitCommands = 0
  for (const tool of tools) {
    if (tool.tool === "shell") {
      if (typeof tool.command !== "string" || !isGitFamily(tool.command)) return "work"
      gitCommands += 1
      continue
    }
    if (!readOnlyTools.has(tool.tool)) return "work"
  }
  return gitCommands > 0 ? "chore" : "no-op"
}

/**
 * A12 — delivery plan at review completion. An active builder receives
 * findings live (mid-turn). An idle builder in delegate mode is WOKEN to
 * act on them: the agent is the declared driver, so findings are its job,
 * and the repeat-based budget bounds the loop it enters — fix the findings
 * and the next review goes clean (nothing burns); repeat them and the
 * budget burns to escalation. Collab mode never reaches here (its findings
 * route to the user channel upstream). A16 — a wake is held while any
 * other session in the same folder is active: two actors editing one
 * uncommitted tree is the collision the hold exists to prevent.
 */
export function deliveryPlan(input: {
  active: boolean
  episodeMode: EpisodeMode
  siblingActive: boolean
}): { delivery: "steer" | "queue"; resume: boolean } {
  if (input.active) return { delivery: "steer", resume: false }
  // Collab never wakes: the user is driving, so findings wait for them.
  if (input.episodeMode === "collab") return { delivery: "queue", resume: false }
  // A16 — an active sibling in the same folder holds the wake until quiet.
  if (input.siblingActive) return { delivery: "queue", resume: false }
  return { delivery: "queue", resume: true }
}

/**
 * A16 — wakes held while a folder is busy, keyed by folder. The runtime
 * re-offers a held session for waking once the folder has no active turn.
 */
export class HeldWakes {
  private readonly byFolder = new Map<string, Set<string>>()

  hold(sessionID: string, folder: string): void {
    let set = this.byFolder.get(folder)
    if (set === undefined) {
      set = new Set<string>()
      this.byFolder.set(folder, set)
    }
    set.add(sessionID)
  }

  /** Sessions to wake now that the folder is quiet; empties the folder. */
  release(folder: string): string[] {
    const set = this.byFolder.get(folder)
    if (set === undefined) return []
    this.byFolder.delete(folder)
    return [...set]
  }

  folders(): string[] {
    return [...this.byFolder.keys()]
  }
}

/**
 * A16 — the user-held per-session mute lever. In-memory only: dies with
 * the server, like the episode override. Explicit checkpoints ignore it —
 * they are user-demanded by definition.
 */
export class MuteState {
  private readonly muted = new Set<string>()

  mute(sessionID: string): void {
    this.muted.add(sessionID)
  }

  unmute(sessionID: string): void {
    this.muted.delete(sessionID)
  }

  isMuted(sessionID: string): boolean {
    return this.muted.has(sessionID)
  }

  blocksAutomatic(sessionID: string): boolean {
    return this.muted.has(sessionID)
  }
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
