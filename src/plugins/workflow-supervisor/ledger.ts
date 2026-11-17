import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

export interface WorkflowLedger {
  claim(id: string, metadata: any): Promise<boolean>
  writeEvidence(id: string, value: any): Promise<void>
  complete(id: string, result: any): Promise<void>
  fail(id: string, error: any): Promise<void>
  recordError(error: any): Promise<void>
  path(id: string): string
}

export class FileLedger implements WorkflowLedger {
  readonly root: string
  readonly checkpoints: string
  private ready: Promise<void> | undefined

  constructor(worktree: string) {
    this.root = join(worktree, ".opencode/workflow-state")
    this.checkpoints = join(this.root, "checkpoints")
  }

  async init(): Promise<void> {
    this.ready ??= (async () => {
      await mkdir(this.checkpoints, { recursive: true })
      await writeFile(join(this.root, ".gitignore"), "*\n", { flag: "wx" }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      })
    })()
    return this.ready
  }

  path(id: string): string {
    return join(this.checkpoints, id)
  }

  async claim(id: string, metadata: any): Promise<boolean> {
    await this.init()
    const directory = this.path(id)
    try {
      await mkdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
      throw error
    }
    await writeFile(join(directory, "checkpoint.json"), JSON.stringify({ ...metadata, id }, null, 2))
    return true
  }

  async writeEvidence(id: string, value: any): Promise<void> {
    await writeFile(join(this.path(id), "evidence.json"), JSON.stringify(value, null, 2))
  }

  async writeEvents(id: string, events: any[]): Promise<void> {
    await writeFile(join(this.path(id), "events.json"), JSON.stringify(events, null, 2))
  }

  async complete(id: string, result: any): Promise<void> {
    const path = join(this.path(id), "checkpoint.json")
    const current = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...current, ...result, status: "completed" }, null, 2))
    if (typeof result.report === "string") {
      await writeFile(join(this.path(id), "report.md"), result.report)
    }
    await appendFile(
      join(this.root, "index.jsonl"),
      `${JSON.stringify({ id, status: "completed", ...result, report: undefined })}\n`,
    )
  }

  async fail(id: string, error: any): Promise<void> {
    const path = join(this.path(id), "checkpoint.json")
    let current: any = {}
    try {
      current = JSON.parse(await readFile(path, "utf8"))
    } catch {
      current = {}
    }
    const failure = {
      code: error?.code ?? error?.name ?? "review_failed",
      message: error?.message ?? String(error),
    }
    await writeFile(path, JSON.stringify({ ...current, status: "failed", error: failure }, null, 2))
    await appendFile(join(this.root, "index.jsonl"), `${JSON.stringify({ id, status: "failed", error: failure })}\n`)
  }

  async recordError(error: any): Promise<void> {
    await mkdir(this.root, { recursive: true })
    await appendFile(join(this.root, "errors.jsonl"), `${JSON.stringify(error)}\n`)
  }
}
