import { afterEach, describe, expect, test } from "bun:test"
import { cleanupTemporaryDirectories, temporaryDirectory } from "./contract-support.ts"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { SteeringCoordinator } from "./steering.ts"

afterEach(async () => {
  await cleanupTemporaryDirectories()
})

const findingsReport = `Mode: checkpoint

Verdict: CONCERNS

Findings:
- Severity: major
  Requirement: Keep implementation out of RED.
  Evidence: test/core/example.test.ts:1
  Deviation: Implementation changed during RED.
  Minimum correction: Revert implementation changes.

Not assessed or missing evidence:
- Turn diff was unavailable.
`

function stateRoot(directory: string): string {
  return join(directory, ".opencode", "workflow-state")
}

async function writeCheckpoint(
  directory: string,
  id: string,
  fields: Record<string, any>,
  report?: string,
): Promise<void> {
  const root = stateRoot(directory)
  await mkdir(join(root, "checkpoints", id), { recursive: true })
  await writeFile(join(root, "checkpoints", id, "checkpoint.json"), JSON.stringify({ id, ...fields }, null, 2))
  if (report !== undefined) {
    await writeFile(join(root, "checkpoints", id, "report.md"), report)
  }
  await writeFile(
    join(root, "index.jsonl"),
    `${JSON.stringify({ id, status: fields.status ?? "completed" })}\n`,
    { flag: "a" },
  )
}

describe("workflow supervisor session visibility", () => {
  test("steering log round-trips deliveries and filters by session", async () => {
    const { SteeringLog } = await import("./supervision.ts")
    const directory = await temporaryDirectory()
    const log = new SteeringLog(directory)

    await log.record({ sessionID: "ses_a", checkpointID: "cp-1", text: "first", attempts: 1, time: 100 })
    await log.record({ sessionID: "ses_b", checkpointID: "cp-2", text: "second", attempts: 1, time: 200 })
    await log.record({ sessionID: "ses_a", checkpointID: "cp-3", text: "third", attempts: 2, time: 300 })

    const forA = await log.list("ses_a")
    expect(forA).toHaveLength(2)
    expect(forA.map((entry: any) => entry.text)).toEqual(["first", "third"])
    const all = await log.list()
    expect(all).toHaveLength(3)

    const fresh = new SteeringLog(directory)
    expect(await fresh.list("ses_a")).toHaveLength(2)
  })

  test("checkpoint summaries carry status, verdict, modes, and respect the limit", async () => {
    const { listCheckpoints } = await import("./supervision.ts")
    const directory = await temporaryDirectory()
    await writeCheckpoint(directory, "cp-1", { status: "completed", trigger: "execution", requestedMode: "steer", effectiveMode: "steer" }, findingsReport)
    await writeCheckpoint(directory, "cp-2", { status: "failed", trigger: "execution", requestedMode: "steer", effectiveMode: "steer" })

    const summaries = await listCheckpoints(directory, 10)
    expect(summaries).toHaveLength(2)
    expect(summaries[1].id).toBe("cp-2")
    expect(summaries[1].status).toBe("failed")
    expect(summaries[1].verdict).toBeNull()
    expect(summaries[0].id).toBe("cp-1")
    expect(summaries[0].status).toBe("completed")
    expect(summaries[0].verdict).toBe("CONCERNS")
    expect(summaries[0].trigger).toBe("execution")
    expect(summaries[0].effectiveMode).toBe("steer")

    const newest = await listCheckpoints(directory, 1)
    expect(newest).toHaveLength(1)
    expect(newest[0].id).toBe("cp-2")

    expect(await listCheckpoints(join(directory, "nowhere"), 10)).toEqual([])
  })

  test("report reads cap long text and mark truncation", async () => {
    const { readReportText } = await import("./supervision.ts")
    const directory = await temporaryDirectory()
    const long = "x".repeat(50)
    await mkdir(join(directory, "report"), { recursive: true })
    const path = join(directory, "report", "report.md")
    await writeFile(path, long)

    const capped = await readReportText(path, 10)
    expect(capped?.text).toBe("x".repeat(10))
    expect(capped?.truncated).toBe(true)

    const full = await readReportText(path, 100)
    expect(full?.text).toBe(long)
    expect(full?.truncated).toBe(false)

    expect(await readReportText(join(directory, "report", "missing.md"), 10)).toBeNull()
  })

  test("badge state derives from the resolved policy and coordinator view", async () => {
    const { supervisionBadgeFromPolicy } = await import("./supervision.ts")
    const policy = {
      active: true,
      requestedMode: "steer",
      effectiveMode: "steer",
    }

    const steered = supervisionBadgeFromPolicy({
      sessionID: "ses_observed",
      policy,
      view: { attempts: 2, limit: 3, hasUnresolved: true },
    })
    expect(steered).toEqual({
      sessionID: "ses_observed",
      active: true,
      mode: "steer",
      hasUnresolved: true,
      attempts: 2,
      limit: 3,
      episodeMode: "delegate",
      reviewing: false,
      findingsWaiting: false,
    })

    const collab = supervisionBadgeFromPolicy({
      sessionID: "ses_observed",
      policy,
      view: undefined,
      episodeMode: "collab",
    })
    expect(collab.episodeMode).toBe("collab")

    const fresh = supervisionBadgeFromPolicy({ sessionID: "ses_observed", policy, view: undefined })
    expect(fresh.hasUnresolved).toBe(false)
    expect(fresh.attempts).toBe(0)
    expect(fresh.limit).toBe(3)
    expect(fresh.episodeMode).toBe("delegate")

    expect(supervisionBadgeFromPolicy({ sessionID: "ses_observed", policy: null, view: undefined })).toEqual({
      sessionID: "ses_observed",
      active: false,
      hasUnresolved: false,
      attempts: 0,
      limit: 3,
      episodeMode: "delegate",
      reviewing: false,
      findingsWaiting: false,
    })
  })

  test("supervision state assembles steering, checkpoints, and reassertion", async () => {
    const { buildSupervisionState } = await import("./supervision.ts")
    const inactive = buildSupervisionState({
      sessionID: "ses_observed",
      policy: null,
      view: undefined,
      reassertion: undefined,
      steering: [],
      checkpoints: [],
      latestReport: null,
    })
    expect(inactive).toEqual({ active: false })

    const active = buildSupervisionState({
      sessionID: "ses_observed",
      policy: { active: true, effectiveMode: "steer", contractPath: "/project/A/docs/contract.md" },
      view: { attempts: 1, limit: 3, hasUnresolved: true },
      reassertion: "Workflow supervisor: Active contract: /project/A/docs/contract.md.",
      steering: [{ sessionID: "ses_observed", checkpointID: "cp-1", text: "first", attempts: 1, time: 100 }],
      checkpoints: [{ id: "cp-1", status: "completed", verdict: "CONCERNS", trigger: "execution", requestedMode: "steer", effectiveMode: "steer", time: 100 }],
      latestReport: { path: "/project/A/.opencode/workflow-state/checkpoints/cp-1/report.md", text: findingsReport, truncated: false },
    })
    expect(active.active).toBe(true)
    expect(active.mode).toBe("steer")
    expect(active.episodeMode).toBe("delegate")
    expect(active.contractPath).toBe("/project/A/docs/contract.md")
    expect(active.hasUnresolved).toBe(true)
    expect(active.reassertion).toContain("Active contract")
    expect(active.steering[0].text).toBe("first")
    expect(active.checkpoints[0].verdict).toBe("CONCERNS")
    expect(active.latestReport?.text).toContain("Verdict: CONCERNS")
  })

  test("coordinator view reports attempts, limit, and unresolved findings", async () => {
    const steering = new SteeringCoordinator({ limit: 2 })
    expect(steering.view("ses_observed")).toBeUndefined()

    steering.consider({
      sessionID: "ses_observed",
      requestedMode: "steer",
      checkpointID: "cp-1",
      report: findingsReport,
      contractPath: "/project/A/docs/contract.md",
      reportPath: "/project/A/.opencode/workflow-state/checkpoints/cp-1/report.md",
    })
    const view = steering.view("ses_observed")
    expect(view).toEqual({ attempts: 0, limit: 2, hasUnresolved: true })

    steering.consider({
      sessionID: "ses_clean",
      requestedMode: "steer",
      checkpointID: "cp-2",
      report: "Mode: checkpoint\n\nVerdict: NOT_REQUESTED\n\nFindings:\n- No findings\n",
      contractPath: "/project/A/docs/contract.md",
      reportPath: "/project/A/.opencode/workflow-state/checkpoints/cp-2/report.md",
    })
    expect(steering.view("ses_clean")).toEqual({ attempts: 0, limit: 2, hasUnresolved: false })
  })
})
