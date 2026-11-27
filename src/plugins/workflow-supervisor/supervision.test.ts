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

  test("latest review stays visible per session, including failures", async () => {
    const { latestSessionReview } = await import("./supervision.ts")
    const directory = await temporaryDirectory()
    const cleanReport = "Mode: checkpoint\n\nVerdict: NOT_REQUESTED\n\nFindings:\n- No findings\n"
    await writeCheckpoint(directory, "cp-a-old", { status: "completed", observedSessionID: "ses_a" }, cleanReport)
    await writeCheckpoint(directory, "cp-b", { status: "completed", observedSessionID: "ses_b" }, findingsReport)
    expect(await latestSessionReview(directory, "ses_a")).toEqual({ checkpointID: "cp-a-old", verdict: "NOT_REQUESTED", hasFindings: false })
    await writeCheckpoint(directory, "cp-a-new", { status: "completed", observedSessionID: "ses_a" }, findingsReport)

    expect(await latestSessionReview(directory, "ses_a")).toEqual({ checkpointID: "cp-a-new", verdict: "CONCERNS", hasFindings: true })
    expect(await latestSessionReview(directory, "ses_b")).toEqual({ checkpointID: "cp-b", verdict: "CONCERNS", hasFindings: true })
    expect(await latestSessionReview(directory, "ses_missing")).toBeNull()

    await writeCheckpoint(directory, "cp-a-failed", { status: "failed", observedSessionID: "ses_a" })
    expect(await latestSessionReview(directory, "ses_a")).toEqual({ checkpointID: "cp-a-failed", verdict: "REVIEW_FAILED", hasFindings: false })
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
      review: { checkpointID: "cp-latest", verdict: "CONCERNS", hasFindings: true },
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
      // A16 — badge state now names user-input waits and mute state.
      blocked: false,
      blockedOn: [],
      muted: false,
      review: { checkpointID: "cp-latest", verdict: "CONCERNS", hasFindings: true },
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
      blocked: false,
      blockedOn: [],
      muted: false,
      review: null,
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

describe("workflow supervisor review question channel (/ws-review <question>)", () => {
  test("checkpoint input accepts a question and still rejects unknown fields", async () => {
    const { checkpointInputSchema, parseCheckpointInput } = await import("./observer.ts")
    expect(checkpointInputSchema.properties.question).toEqual({ type: "string" })
    expect(parseCheckpointInput({ question: "okay to transition?" })).toEqual({ question: "okay to transition?" })
    expect(parseCheckpointInput({ phase: "green", question: "ready?" })).toEqual({ phase: "green", question: "ready?" })
    expect(parseCheckpointInput({ phase: "green" })).toEqual({ phase: "green" })
    expect(() => parseCheckpointInput({ banana: 1 })).toThrow()
    expect(() => parseCheckpointInput({ question: 3 })).toThrow()
    expect(() => parseCheckpointInput({ sessionID: "ses_other" })).toThrow()
  })

  test("envelope carries the question as the assignment, marked user-typed and report-only", async () => {
    const { envelope } = await import("./reviewer.ts")
    const base = {
      evidencePath: "/project/A/.opencode/workflow-state/checkpoints/cp-1/evidence.json",
      eventsPath: "/project/A/.opencode/workflow-state/checkpoints/cp-1/events.json",
      provenance: { trigger: "explicit", sessionID: "ses_observed" },
    }
    const text = envelope({ ...base, explicit: true, question: "okay to transition?" })
    expect(text).toContain("User request (typed by the user at the review trigger): okay to transition?")
    expect(text).toContain("Assignment: answer the user's question directly")
    expect(text.toLowerCase()).toContain("report-only")
    expect(text).not.toContain("explicit checkpoint requested by the calling session")
  })

  test("without a question the explicit request line is unchanged", async () => {
    const { envelope } = await import("./reviewer.ts")
    const base = {
      evidencePath: "/project/A/.opencode/workflow-state/checkpoints/cp-1/evidence.json",
      eventsPath: "/project/A/.opencode/workflow-state/checkpoints/cp-1/events.json",
      provenance: { trigger: "explicit", sessionID: "ses_observed" },
    }
    const plain = envelope({ ...base, explicit: true })
    expect(plain).toContain("User request: explicit checkpoint requested by the calling session; no automatic trigger.")
    expect(plain).not.toContain("typed by the user at the review trigger")
    expect(plain).not.toContain("Assignment: answer the user's question directly")
  })

  test("the question is evidence identity: different questions differ, none leaves the hash stable", async () => {
    const { buildExplicitEvidence, evidenceHash } = await import("./evidence.ts")
    const common = {
      session: {},
      policy: { contractPath: "/project/A/docs/contract.md", contractContent: "contract", requestedMode: "advisory", effectiveMode: "advisory" },
      latestUserRequest: "request",
      provenance: { trigger: "explicit", sessionID: "ses_observed" },
    }
    const a = buildExplicitEvidence({ ...common, question: "okay to transition?" })
    const b = buildExplicitEvidence({ ...common, question: "is RED complete?" })
    const sameAgain = buildExplicitEvidence({ ...common, question: "okay to transition?" })
    expect(a.question).toBe("okay to transition?")
    expect(a.hash).not.toBe(b.hash)
    expect(sameAgain.hash).toBe(a.hash)

    const without = buildExplicitEvidence({ ...common })
    expect(without.question).toBeUndefined()

    // Hash stability for existing evidence: a question set to undefined
    // serializes identically to the key being absent.
    const stableFields = {
      latestUserRequest: "request",
      latestAssistantText: undefined,
      turnDiff: undefined,
      workingDiff: [],
      status: [],
      contractPath: "/project/A/docs/contract.md",
      contractContent: "contract",
      requestedMode: "advisory",
      effectiveMode: "advisory",
    }
    expect(evidenceHash({ ...stableFields, question: undefined } as any)).toBe(evidenceHash(stableFields as any))
  })
})
