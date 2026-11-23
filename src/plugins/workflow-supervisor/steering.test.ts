import { describe, expect, test } from "bun:test"
import { hasBlockingOrMajor, hasFindings, SteeringCoordinator, verdictOf } from "./steering.ts"

const report = `Mode: checkpoint

Verdict: CONCERNS

Summary: The checkpoint found one deviation.

Findings:
- Severity: major
  Requirement: Keep implementation out of RED.
  Evidence: test/core/example.test.ts:1
  Deviation: Implementation changed during RED.
  Minimum correction: Revert implementation changes.

Not assessed or missing evidence:
- Turn diff was unavailable.
`

const cleanReport = `Mode: checkpoint

Verdict: NOT_REQUESTED

Summary: No transition was requested.

Findings:
- No findings
`

// A11 — the budget counts unresolved repeats, so burning requires the
// reviewer's "previously steered" marking.
const repeatReport = report + "\nPreviously steered, still unresolved.\n"

function input(overrides: Record<string, any> = {}) {
  return {
    sessionID: "ses_observed",
    requestedMode: "steer",
    checkpointID: "cp-test",
    report,
    contractPath: "/project/A/AGENTS.md",
    reportPath: "/project/A/.opencode/workflow-state/checkpoints/cp-test/report.md",
    ...overrides,
  }
}

describe("workflow supervisor steering", () => {
  test("advisory mode never steers", () => {
    const steering = new SteeringCoordinator()
    const decision = steering.consider(input({ requestedMode: "advisory" }))
    expect(decision.action).toBe("none")
    expect(decision.reason).toBe("mode")
    expect(steering.context("ses_observed")).toBeUndefined()
  })

  test("reports without findings do not steer", () => {
    const steering = new SteeringCoordinator()
    const decision = steering.consider(input({ report: cleanReport }))
    expect(decision.action).toBe("none")
    expect(decision.reason).toBe("no-findings")
  })

  test("concerns steer once with attributed queue text", () => {
    const steering = new SteeringCoordinator()
    const decision = steering.consider(input())
    expect(decision.action).toBe("steer")
    expect(decision.attempts).toBe(0)
    expect(decision.text).toContain("Workflow supervisor checkpoint cp-test")
    expect(decision.text).toContain("Verdict: CONCERNS")
    expect(decision.text).toContain("Minimum correction: Revert implementation changes.")
    expect(steering.context("ses_observed")).toContain("/project/A/AGENTS.md")
    expect(steering.context("ses_observed")).toContain("cp-test")
  })

  test("identical reports are deduplicated", () => {
    const steering = new SteeringCoordinator()
    expect(steering.consider(input()).action).toBe("steer")
    const duplicate = steering.consider(input({ checkpointID: "cp-duplicate" }))
    expect(duplicate.action).toBe("duplicate")
    expect(duplicate.attempts).toBe(0)
  })

  test("repeat-carrying reports are bounded and then escalate", () => {
    const steering = new SteeringCoordinator({ limit: 2 })
    expect(steering.consider(input({ checkpointID: "cp-1", report: repeatReport })).action).toBe("steer")
    expect(steering.consider(input({ checkpointID: "cp-2", report: repeatReport.replace("one deviation", "another deviation") })).action).toBe("steer")
    const escalated = steering.consider(input({ checkpointID: "cp-3", report: repeatReport.replace("one deviation", "third deviation") }))
    expect(escalated.action).toBe("escalate")
    expect(escalated.reason).toBe("limit")
    expect(escalated.attempts).toBe(2)
  })

  test("repeat-free reports deliver without burning the budget", () => {
    const steering = new SteeringCoordinator({ limit: 1 })
    expect(steering.consider(input({ checkpointID: "cp-1" })).attempts).toBe(0)
    expect(steering.consider(input({ checkpointID: "cp-2", report: report.replace("one deviation", "another deviation") })).attempts).toBe(0)
  })

  test("a clean review fully re-arms the budget", () => {
    const steering = new SteeringCoordinator({ limit: 2 })
    steering.consider(input({ checkpointID: "cp-1", report: repeatReport }))
    steering.consider(input({ checkpointID: "cp-2", report: repeatReport.replace("one deviation", "second deviation") }))
    expect(steering.consider(input({ checkpointID: "cp-3", report: repeatReport.replace("one deviation", "third deviation") })).action).toBe("escalate")
    steering.consider(input({ checkpointID: "cp-4", report: cleanReport }))
    expect(steering.consider(input({ checkpointID: "cp-5", report: repeatReport.replace("one deviation", "fifth deviation") })).action).toBe("steer")
  })

  test("verdict and finding detection are independent", () => {
    expect(verdictOf(report)).toBe("CONCERNS")
    expect(verdictOf(cleanReport)).toBe("NOT_REQUESTED")
    expect(hasFindings(report)).toBe(true)
    expect(hasFindings(cleanReport)).toBe(false)
    // Bold section markers must not evade detection (sweep finding).
    const boldFindings = report.replace("Findings:", "**Findings:**").replace("Not assessed or missing evidence:", "**Not assessed or missing evidence:**")
    const boldClean = cleanReport.replace("Findings:", "**Findings:**")
    expect(verdictOf(boldFindings)).toBe("CONCERNS")
    expect(hasFindings(boldFindings)).toBe(true)
    expect(hasFindings(boldClean)).toBe(false)
  })

  test("A14 — minor-only findings never steer, wake, or hold state", () => {
    const minorReport = report.replace("- Severity: major", "- Severity: minor")
    const steering = new SteeringCoordinator()
    const decision = steering.consider(input({ report: minorReport, checkpointID: "cp-minor-1" }))
    expect(decision.action).toBe("report")
    // No unresolved state and no ride: the gate settles.
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
  })

  test("A14 — minor-only reports burn no budget and a later major steers freely", () => {
    const minorReport = report.replace("- Severity: major", "- Severity: minor")
    const steering = new SteeringCoordinator()
    steering.consider(input({ report: minorReport, checkpointID: "cp-minor-1" }))
    const second = steering.consider(input({ report: minorReport, checkpointID: "cp-minor-2" }))
    expect(second.action).toBe("report")
    expect(second.attempts).toBe(0)
    expect(steering.consider(input({ checkpointID: "cp-major" })).action).toBe("steer")
  })

  test("A14 — bold severity markers are recognized", () => {
    expect(hasBlockingOrMajor("- **Severity: major**")).toBe(true)
    expect(hasBlockingOrMajor("- **Severity:** blocking")).toBe(true)
    expect(hasBlockingOrMajor("- Severity: minor")).toBe(false)
    expect(hasBlockingOrMajor("- **Severity: minor**")).toBe(false)
  })

  test("heading-form reports parse — the second dead-letter class", () => {
    // Mirrors cp-100c2c882 (sweep 2026-11-22): a CONCERNS report with a
    // markdown-heading Findings section dead-lettered a MAJOR and re-armed
    // the budget. Normalization must carry it through the full decision.
    const headingReport = [
      "Mode: checkpoint",
      "## Verdict: CONCERNS",
      "## Findings",
      "",
      "- Severity: major",
      "  Requirement: evidence provenance.",
      "  Deviation: the gate result exists only as pasted text.",
      "",
      "Not assessed or missing evidence:",
      "- Turn diff was unavailable.",
    ].join("\n")
    expect(verdictOf(headingReport)).toBe("CONCERNS")
    expect(hasFindings(headingReport)).toBe(true)
    expect(hasBlockingOrMajor(headingReport)).toBe(true)
    const steering = new SteeringCoordinator()
    expect(steering.consider(input({ report: headingReport, checkpointID: "cp-heading" })).action).toBe("steer")
  })

  test("clean variants across formats stay clean", () => {
    // "## Findings" heading + undashed "No findings." (cp-ea58e596 form).
    const headingClean = ["## Verdict", "", "Verdict: NOT_REQUESTED", "", "## Findings", "", "No findings."].join("\n")
    expect(verdictOf(headingClean)).toBe("NOT_REQUESTED")
    expect(hasFindings(headingClean)).toBe(false)
    // The original fixtures must keep parsing under normalization.
    expect(verdictOf(report)).toBe("CONCERNS")
    expect(hasFindings(report)).toBe(true)
    expect(hasFindings(cleanReport)).toBe(false)
    expect(hasBlockingOrMajor(report)).toBe(true)
    expect(hasBlockingOrMajor(cleanReport)).toBe(false)
  })
})

describe("A13 — wake frame and follow-up scoping", () => {
  test("a wake message carries the marker, the frame, and the report", async () => {
    const { wakeMessage, WAKE_MARKER } = await import("./steering.ts")
    const text = wakeMessage("Verdict: CONCERNS\n\nFindings:\n- one deviation")
    expect(text.startsWith(WAKE_MARKER)).toBe(true)
    expect(text).toContain("no questions to the user")
    expect(text).toContain("re-reviewed automatically")
    expect(text).toContain("Verdict: CONCERNS")
  })

  test("only wake messages are follow-up requests", async () => {
    const { isFollowUpRequest, wakeMessage } = await import("./steering.ts")
    expect(isFollowUpRequest(wakeMessage("report"))).toBe(true)
    // The live-delivery text (active builder) and queued legacy text are
    // plain reviews, not follow-up requests.
    expect(isFollowUpRequest("Workflow supervisor checkpoint cp-1 review:\n\nreport")).toBe(false)
    expect(isFollowUpRequest("Continue with the GREEN phase.")).toBe(false)
    expect(isFollowUpRequest(undefined)).toBe(false)
  })

  test("the reviewer envelope scopes a follow-up review, and only a follow-up", async () => {
    const { envelope } = await import("./reviewer.ts")
    const { wakeMessage } = await import("./steering.ts")
    const base = {
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
    }
    const followUp = envelope({ ...base, latestUserRequest: wakeMessage("report") })
    expect(followUp).toContain("Assignment: follow-up review")
    expect(followUp).toContain("Do not re-audit unchanged ground")
    const normal = envelope({ ...base, latestUserRequest: "Continue with the GREEN phase." })
    expect(normal.includes("Assignment: follow-up review")).toBe(false)
    const explicit = envelope({ ...base, explicit: true, latestUserRequest: wakeMessage("report") })
    expect(explicit.includes("Assignment: follow-up review")).toBe(false)
  })

  test("A15 — a no-op turn is marked in the envelope with its claims inlined", async () => {
    const { envelope } = await import("./reviewer.ts")
    const { turnChangedFiles } = await import("./evidence.ts")
    const base = {
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
      latestUserRequest: "Give me your RED gate report.",
    }
    const noopEvents = [
      { type: "session.execution.started", data: { sessionID: "ses_observed" }, durable: { seq: 1 } },
      { type: "session.step.ended", data: { sessionID: "ses_observed", files: [] }, durable: { seq: 2 } },
      { type: "session.step.ended", data: { sessionID: "ses_observed", files: [] }, durable: { seq: 3 } },
    ]
    expect(turnChangedFiles(noopEvents)).toEqual([])
    const text = envelope({ ...base, turnNoop: true, latestAssistantText: "RED is locked: 31 tests failing." })
    expect(text).toContain("Assignment: no-op turn")
    expect(text).toContain("Turn claims (assistant, verbatim):")
    expect(text).toContain("31 tests failing")
    // A turn that changed files, or whose window is unknown, is not marked.
    const normal = envelope({ ...base, turnNoop: false, latestAssistantText: "x" })
    expect(normal.includes("Assignment: no-op turn")).toBe(false)
    const workEvents = [
      { type: "session.execution.started", data: { sessionID: "ses_observed" }, durable: { seq: 1 } },
      { type: "session.step.ended", data: { sessionID: "ses_observed", files: ["src/core/state.ts"] }, durable: { seq: 2 } },
    ]
    expect(turnChangedFiles(workEvents)).toEqual(["src/core/state.ts"])
    expect(turnChangedFiles([{ type: "session.step.ended", data: { files: [] } }])).toBeUndefined()
    // A follow-up marker takes precedence over the no-op marker.
    const { wakeMessage } = await import("./steering.ts")
    const both = envelope({
      ...base,
      latestUserRequest: wakeMessage("report"),
      turnNoop: true,
      latestAssistantText: "fixed it",
    })
    expect(both).toContain("Assignment: follow-up review")
    expect(both.includes("Assignment: no-op turn")).toBe(false)
  })
})
