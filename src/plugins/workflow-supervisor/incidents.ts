import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"

// The supervisor's own incident log: pathologies it detected in its own
// operation, written for post-session sweeps. Distinct from the checkpoint
// ledger (outcomes of reviewed work) and the steering log (messages
// delivered) — this records supervision health: findings dead-lettered into
// an idle session, exhausted budgets, failed or deadline-forced reviews.

export interface Incident {
  kind: string
  sessionID: string
  detail?: string
  time: number
}

export class IncidentLog {
  private readonly file: string

  constructor(worktree: string) {
    this.file = join(worktree, ".opencode", "workflow-state", "incidents.jsonl")
  }

  async record(incident: Omit<Incident, "time">): Promise<void> {
    try {
      await mkdir(dirname(this.file), { recursive: true })
      await appendFile(this.file, `${JSON.stringify({ ...incident, time: Date.now() })}\n`)
    } catch {
      // Best-effort: a failed incident write must never break supervision.
    }
  }

  async list(): Promise<Incident[]> {
    let raw: string
    try {
      raw = await readFile(this.file, "utf8")
    } catch {
      return []
    }
    const entries: Incident[] = []
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // A malformed line never hides the incidents around it.
      }
    }
    return entries
  }
}
