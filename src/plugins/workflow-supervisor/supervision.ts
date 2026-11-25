import { appendFile, mkdir, readFile, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { SteeringCoordinator, hasFindings, verdictOf } from "./steering.ts"

// Session visibility for the workflow supervisor: the server part records
// steering deliveries and assembles per-session supervision state; the TUI
// part renders it as a footer badge and an on-demand panel over the RPC
// channel. Nothing here changes review or steering behavior — read paths only,
// plus the append-only steering log.

export interface SteeringDelivery {
  sessionID: string
  checkpointID: string
  text: string
  attempts: number
  time: number
}

/** Append-only record of steering messages actually sent to builders. */
export class SteeringLog {
  private readonly file: string

  constructor(worktree: string) {
    this.file = join(worktree, ".opencode", "workflow-state", "steering.jsonl")
  }

  async record(delivery: SteeringDelivery): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await appendFile(this.file, `${JSON.stringify(delivery)}\n`)
  }

  async list(sessionID?: string): Promise<SteeringDelivery[]> {
    let raw: string
    try {
      raw = await readFile(this.file, "utf8")
    } catch {
      return []
    }
    const entries: SteeringDelivery[] = []
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // A malformed line never hides the deliveries around it.
      }
    }
    return sessionID === undefined ? entries : entries.filter((entry) => entry.sessionID === sessionID)
  }
}

export interface CheckpointSummary {
  id: string
  status: string
  verdict: string | null
  trigger: string | null
  requestedMode: string | null
  effectiveMode: string | null
  time: number | null
}

/**
 * The last `limit` checkpoints, oldest first. Summaries come from the ledger
 * index plus each checkpoint's own record; the verdict is read from the
 * checkpoint's report when one exists, so it is null for failed checkpoints.
 */
export async function listCheckpoints(worktree: string, limit = 10): Promise<CheckpointSummary[]> {
  const root = join(worktree, ".opencode", "workflow-state")
  let raw: string
  try {
    raw = await readFile(join(root, "index.jsonl"), "utf8")
  } catch {
    return []
  }
  const entries: { id: string; status: string }[] = []
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue
    try {
      const entry = JSON.parse(line)
      if (typeof entry?.id !== "string") continue
      entries.push({
        id: entry.id,
        status: typeof entry.status === "string" ? entry.status : "unknown",
      })
    } catch {
      // Skip malformed index lines.
    }
  }

  const summaries: CheckpointSummary[] = []
  for (const { id, status } of entries.slice(-limit)) {
    const directory = join(root, "checkpoints", id)
    let record: any = {}
    let time: number | null = null
    try {
      const path = join(directory, "checkpoint.json")
      record = JSON.parse(await readFile(path, "utf8"))
      time = (await stat(path)).mtimeMs
    } catch {
      record = {}
    }
    let verdict: string | null = null
    try {
      verdict = verdictOf(await readFile(join(directory, "report.md"), "utf8"))
    } catch {
      verdict = null
    }
    summaries.push({
      id,
      status: typeof record.status === "string" ? record.status : status,
      verdict,
      trigger: typeof record.trigger === "string" ? record.trigger : null,
      requestedMode: typeof record.requestedMode === "string" ? record.requestedMode : null,
      effectiveMode: typeof record.effectiveMode === "string" ? record.effectiveMode : null,
      time,
    })
  }
  return summaries
}

export interface SessionReview {
  checkpointID: string
  verdict: string
  hasFindings: boolean
}

/**
 * Latest completed or failed review for this observed session, read from the
 * durable ledger. Other sessions in the same folder never overwrite it.
 */
export async function latestSessionReview(
  worktree: string,
  sessionID: string,
): Promise<SessionReview | null> {
  const root = join(worktree, ".opencode", "workflow-state", "checkpoints")
  let raw: string
  try {
    raw = await readFile(join(worktree, ".opencode", "workflow-state", "index.jsonl"), "utf8")
  } catch {
    return null
  }
  const ids = raw
    .split("\n")
    .flatMap((line) => {
      if (line.trim() === "") return []
      try {
        const entry = JSON.parse(line)
        return typeof entry?.id === "string" ? [entry.id] : []
      } catch {
        return []
      }
    })
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index]
    const directory = join(root, id)
    let record: any
    try {
      record = JSON.parse(await readFile(join(directory, "checkpoint.json"), "utf8"))
    } catch {
      continue
    }
    if (record?.observedSessionID !== sessionID) continue
    if (record?.status === "failed") {
      return { checkpointID: id, verdict: "REVIEW_FAILED", hasFindings: false }
    }
    if (record?.status !== "completed") continue
    let report: string
    try {
      report = await readFile(join(directory, "report.md"), "utf8")
    } catch {
      return { checkpointID: id, verdict: "UNKNOWN", hasFindings: false }
    }
    return { checkpointID: id, verdict: verdictOf(report), hasFindings: hasFindings(report) }
  }
  return null
}

/** Read a report for display, capped to keep the RPC payload bounded. */
export async function readReportText(
  path: string,
  cap = 20_000,
): Promise<{ text: string; truncated: boolean } | null> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return null
  }
  if (text.length > cap) return { text: text.slice(0, cap), truncated: true }
  return { text, truncated: false }
}

export interface BadgeState {
  sessionID: string
  active: boolean
  mode: string
  hasUnresolved: boolean
  attempts: number
  limit: number
  episodeMode: "collab" | "delegate"
  reviewing: boolean
  findingsWaiting: boolean
  // A16 — a helper blocked on a user-held permission decision is named on
  // the badge instead of looking like reviewer work.
  blocked: boolean
  blockedOn: string[]
  muted: boolean
  review: SessionReview | null
}

/** Badge data for one session: policy-derived mode plus coordinator view. */
export function supervisionBadgeFromPolicy(input: {
  sessionID: string
  policy: any
  view?: { attempts: number; limit: number; hasUnresolved: boolean }
  episodeMode?: "collab" | "delegate"
  reviewing?: boolean
  findingsWaiting?: boolean
  blockedOn?: string[]
  muted?: boolean
  review?: SessionReview | null
}): BadgeState {
  const view = input.view
  const episodeMode = input.episodeMode ?? "delegate"
  const blockedOn = Array.isArray(input.blockedOn) ? input.blockedOn.filter((line) => typeof line === "string") : []
  const common = {
    sessionID: input.sessionID,
    hasUnresolved: view?.hasUnresolved ?? false,
    attempts: view?.attempts ?? 0,
    limit: view?.limit ?? 3,
    episodeMode,
    reviewing: input.reviewing ?? false,
    findingsWaiting: input.findingsWaiting ?? false,
    blocked: blockedOn.length > 0,
    blockedOn,
    muted: input.muted === true,
    review: input.review ?? null,
  }
  if (!input.policy?.active) return { ...common, active: false }
  return {
    ...common,
    active: true,
    mode: typeof input.policy.effectiveMode === "string" ? input.policy.effectiveMode : "advisory",
  }
}

/** Full panel state for one session. Inactive policies collapse to `{active:false}`. */
export function buildSupervisionState(input: {
  sessionID: string
  policy: any
  view?: { attempts: number; limit: number; hasUnresolved: boolean }
  episodeMode?: "collab" | "delegate"
  reviewing?: boolean
  findingsWaiting?: boolean
  blockedOn?: string[]
  muted?: boolean
  reassertion?: string
  steering: SteeringDelivery[]
  checkpoints: CheckpointSummary[]
  latestReport: { path: string; text: string; truncated: boolean } | null
}): any {
  if (!input.policy?.active) return { active: false }
  const blockedOn = Array.isArray(input.blockedOn) ? input.blockedOn.filter((line) => typeof line === "string") : []
  return {
    active: true,
    mode: typeof input.policy.effectiveMode === "string" ? input.policy.effectiveMode : "advisory",
    episodeMode: input.episodeMode ?? "delegate",
    reviewing: input.reviewing ?? false,
    findingsWaiting: input.findingsWaiting ?? false,
    blocked: blockedOn.length > 0,
    blockedOn,
    muted: input.muted === true,
    contractPath: typeof input.policy.contractPath === "string" ? input.policy.contractPath : "",
    hasUnresolved: input.view?.hasUnresolved ?? false,
    attempts: input.view?.attempts ?? 0,
    limit: input.view?.limit ?? 3,
    reassertion: input.reassertion ?? null,
    steering: input.steering,
    checkpoints: input.checkpoints,
    latestReport: input.latestReport,
  }
}
