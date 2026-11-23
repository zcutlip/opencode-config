import { describe, expect, test } from "bun:test"
import { hasFindings, SteeringCoordinator, verdictOf } from "./steering.ts"

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
})
