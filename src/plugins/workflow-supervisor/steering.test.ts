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
    expect(decision.attempts).toBe(1)
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
    expect(duplicate.attempts).toBe(1)
  })

  test("distinct reports are bounded and then escalate", () => {
    const steering = new SteeringCoordinator({ limit: 2 })
    expect(steering.consider(input({ checkpointID: "cp-1" })).action).toBe("steer")
    expect(steering.consider(input({ checkpointID: "cp-2", report: report.replace("one deviation", "another deviation") })).action).toBe("steer")
    const escalated = steering.consider(input({ checkpointID: "cp-3", report: report.replace("one deviation", "third deviation") }))
    expect(escalated.action).toBe("escalate")
    expect(escalated.reason).toBe("limit")
    expect(escalated.attempts).toBe(2)
  })

  test("verdict and finding detection are independent", () => {
    expect(verdictOf(report)).toBe("CONCERNS")
    expect(verdictOf(cleanReport)).toBe("NOT_REQUESTED")
    expect(hasFindings(report)).toBe(true)
    expect(hasFindings(cleanReport)).toBe(false)
  })
})
