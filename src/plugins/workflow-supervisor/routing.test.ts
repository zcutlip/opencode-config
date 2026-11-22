import { describe, expect, test } from "bun:test"

// Phase 3.1 routing suite — RED gate for amendments A4–A8.
//
// Locks the four routing layers from the phase-3 contract:
//   A4  one-turn influence window (reassertion ride lifetime)
//   A5  visible escalation (user-facing event payload)
//   A6  steering log as reviewer evidence
//   A7  contract-file routing proxy (nonempty guard included)
//   A8  collab/delegate episode override
//
// The one-ride tests fake the prompt-admission signal with
// SteeringCoordinator.promptAdmitted. No current code path consumes prompt
// admissions; the signal has a documented API basis — the server-plugin
// `ctx.session.hook("prompt")` prompt-admission hook — and implementation
// step 1 registers that hook and confirms it fires in the installed host,
// with a recorded amendment if it does not. Wiring-level behaviors with no
// unit-testable surface are pinned by inspection and live runs instead:
//   - A5's escalationRaised RPC registration, emission wiring, and TUI
//     toast branch (a new event separate from badge-shaped stateUpdated).
//   - A6's reviewer-instruction obligation in src/agents/workflow-reviewer.md.
//   - A8's prospective rule: a message already queued still rides the next
//     prompt (there is no inbox-retraction API; collab changes no inbox).
//   - A8's authority rule: the builder can never flip the toggle (the
//     toggle is TUI-held; no tool registration may expose it).
//   - A8's badge episode-mode display and in-memory lifetime (never
//     persisted to config; dies with the TUI).

const findingsReport = `Mode: checkpoint

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

// A11 — budget burns only on reports the reviewer marks as repeats.
const repeatMarkedReport = findingsReport + "\nPreviously steered, still unresolved.\n"

const otherFindingsReport = findingsReport.replace("one deviation", "another deviation")

const cleanReport = `Mode: checkpoint

Verdict: NOT_REQUESTED

Summary: No transition was requested.

Findings:
- No findings
`

function steeringInput(overrides: Record<string, any> = {}) {
  return {
    sessionID: "ses_observed",
    requestedMode: "steer",
    checkpointID: "cp-test",
    report: findingsReport,
    contractPath: "/project/A/AGENTS.md",
    reportPath: "/project/A/.opencode/workflow-state/checkpoints/cp-test/report.md",
    ...overrides,
  }
}

const contractDiff = [{ file: "docs/contract.md", additions: 3, deletions: 1, status: "modified" }]
const mixedDiff = [
  { file: "docs/contract.md", additions: 3, deletions: 1, status: "modified" },
  { file: "src/feature.ts", additions: 10, deletions: 0, status: "modified" },
]

describe("A4 — one-turn influence window", () => {
  test("the report stays unresolved through the first prompt admission", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    expect(steering.consider(steeringInput()).action).toBe("steer")
    steering.promptAdmitted("ses_observed")
    expect(steering.context("ses_observed")).toContain("Unresolved findings from checkpoint cp-test")
  })

  test("the second prompt admission demotes the unresolved report", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    steering.consider(steeringInput())
    steering.promptAdmitted("ses_observed")
    steering.promptAdmitted("ses_observed")
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
    expect(steering.context("ses_observed")).not.toContain("Unresolved findings from checkpoint cp-test")
  })

  test("a clean review clears unresolved state regardless of the ride", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    steering.consider(steeringInput())
    expect(steering.consider(steeringInput({ report: cleanReport })).action).toBe("none")
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
  })

  test("a new distinct steer re-arms the ride window", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    steering.consider(steeringInput({ checkpointID: "cp-1" }))
    steering.promptAdmitted("ses_observed")
    steering.promptAdmitted("ses_observed")
    expect(steering.consider(steeringInput({ checkpointID: "cp-2", report: otherFindingsReport })).action).toBe("steer")
    expect(steering.context("ses_observed")).toContain("Unresolved findings from checkpoint cp-2")
    steering.promptAdmitted("ses_observed")
    expect(steering.context("ses_observed")).toContain("Unresolved findings from checkpoint cp-2")
    steering.promptAdmitted("ses_observed")
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
  })

  test("a duplicate does not re-arm the demoted ride", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    steering.consider(steeringInput({ checkpointID: "cp-1" }))
    steering.promptAdmitted("ses_observed")
    steering.promptAdmitted("ses_observed")
    const duplicate = steering.consider(steeringInput({ checkpointID: "cp-1" }))
    expect(duplicate.action).toBe("duplicate")
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
  })
})

describe("A5 — visible escalation", () => {
  test("limit escalation carries a user-facing event payload", async () => {
    const { SteeringCoordinator, escalationEvent } = await import("./steering.ts")
    const steering = new SteeringCoordinator({ limit: 1 })
    expect(steering.consider(steeringInput({ checkpointID: "cp-1", report: repeatMarkedReport })).action).toBe("steer")
    const escalated = steering.consider(steeringInput({ checkpointID: "cp-2", report: repeatMarkedReport.replace("one deviation", "another deviation") }))
    expect(escalated.action).toBe("escalate")
    expect(escalated.attempts).toBe(1)
    const payload = escalationEvent({ sessionID: "ses_observed", checkpointID: "cp-2", attempts: escalated.attempts })
    expect(payload).toEqual({
      sessionID: "ses_observed",
      checkpointID: "cp-2",
      attempts: 1,
    })
  })
})

describe("A6 — steering log as reviewer evidence", () => {
  test("readable steering log entries become automatic evidence", async () => {
    const { buildAutomaticEvidence } = await import("./evidence.ts")
    const steeringLog = [
      { sessionID: "ses_observed", checkpointID: "cp-1", text: "Workflow supervisor checkpoint cp-1 review", attempts: 1, time: 100 },
    ]
    const value = buildAutomaticEvidence({
      session: { id: "ses_observed", agent: "build", location: "/project/A" },
      latestUserRequest: "Implement the contract",
      workingDiff: [],
      status: [],
      policy: {
        contractPath: "/project/A/docs/contract.md",
        contractContent: "Agreed contract",
        requestedMode: "steer",
        effectiveMode: "steer",
      },
      provenance: { trigger: "execution", sessionID: "ses_observed" },
      steeringLog,
    })
    expect(value.steeringLog).toEqual(steeringLog)
    expect(value.completeness.steeringLog).toBe(true)
    expect(value.provenance.steeringLog).toBeUndefined()
  })

  test("an unreadable steering log is omitted and the omission is recorded", async () => {
    const { buildAutomaticEvidence } = await import("./evidence.ts")
    const value = buildAutomaticEvidence({
      session: { id: "ses_observed", agent: "build", location: "/project/A" },
      latestUserRequest: "Implement the contract",
      workingDiff: [],
      status: [],
      policy: {
        contractPath: "/project/A/docs/contract.md",
        contractContent: "Agreed contract",
        requestedMode: "steer",
        effectiveMode: "steer",
      },
      provenance: { trigger: "execution", sessionID: "ses_observed" },
    })
    expect(value.steeringLog).toEqual([])
    expect(value.completeness.steeringLog).toBe(false)
    expect(value.provenance.steeringLog).toBe("unavailable")
  })

  test("the steering log is context, not evidence identity", async () => {
    const { buildAutomaticEvidence } = await import("./evidence.ts")
    const base = {
      session: { id: "ses_observed", agent: "build", location: "/project/A" },
      latestUserRequest: "Implement the contract",
      workingDiff: [],
      status: [],
      policy: {
        contractPath: "/project/A/docs/contract.md",
        contractContent: "Agreed contract",
        requestedMode: "steer",
        effectiveMode: "steer",
      },
      provenance: { trigger: "execution", sessionID: "ses_observed" },
    }
    const withLog = buildAutomaticEvidence({
      ...base,
      steeringLog: [
        { sessionID: "ses_observed", checkpointID: "cp-1", text: "Workflow supervisor checkpoint cp-1 review", attempts: 1, time: 100 },
      ],
    })
    const withoutLog = buildAutomaticEvidence({ ...base })
    expect(withLog.hash).toBe(withoutLog.hash)
  })
})

describe("A7 — contract-file routing proxy", () => {
  test("a nonempty contract-only diff routes findings to the user channel", async () => {
    const { routeReport } = await import("./routing.ts")
    const decision = routeReport({
      episodeMode: "delegate",
      workingDiff: contractDiff,
      contractPath: "/project/A/docs/contract.md",
      worktree: "/project/A",
    })
    expect(decision.channel).toBe("user")
  })

  test("a mixed diff routes to the builder as before", async () => {
    const { routeReport } = await import("./routing.ts")
    const decision = routeReport({
      episodeMode: "delegate",
      workingDiff: mixedDiff,
      contractPath: "/project/A/docs/contract.md",
      worktree: "/project/A",
    })
    expect(decision.channel).toBe("builder")
  })

  test("an empty diff routes to the builder as before", async () => {
    const { routeReport } = await import("./routing.ts")
    const decision = routeReport({
      episodeMode: "delegate",
      workingDiff: [],
      contractPath: "/project/A/docs/contract.md",
      worktree: "/project/A",
    })
    expect(decision.channel).toBe("builder")
  })
})

describe("A8 — collab/delegate episode override", () => {
  test("collab suppresses the per-turn automatic review trigger", async () => {
    const { automaticReviewAllowed } = await import("./routing.ts")
    expect(automaticReviewAllowed("collab")).toBe(false)
    expect(automaticReviewAllowed("delegate")).toBe(true)
  })

  test("collab routes all findings to the user channel regardless of the diff", async () => {
    const { routeReport } = await import("./routing.ts")
    for (const workingDiff of [contractDiff, mixedDiff, []]) {
      const decision = routeReport({
        episodeMode: "collab",
        workingDiff,
        contractPath: "/project/A/docs/contract.md",
        worktree: "/project/A",
      })
      expect(decision.channel).toBe("user")
    }
  })

  test("collab disarms an armed ride without touching attempts", async () => {
    const { SteeringCoordinator } = await import("./steering.ts")
    const steering = new SteeringCoordinator()
    const decision = steering.consider(steeringInput())
    expect(decision.attempts).toBe(0)
    steering.disarm("ses_observed")
    expect(steering.context("ses_observed")).toContain("No unresolved findings")
    expect(steering.consider(steeringInput({ checkpointID: "cp-duplicate" })).action).toBe("duplicate")
  })

  test("delegate keeps the A7 routing rule", async () => {
    const { routeReport } = await import("./routing.ts")
    expect(routeReport({ episodeMode: "delegate", workingDiff: contractDiff, contractPath: "/project/A/docs/contract.md", worktree: "/project/A" }).channel).toBe("user")
    expect(routeReport({ episodeMode: "delegate", workingDiff: mixedDiff, contractPath: "/project/A/docs/contract.md", worktree: "/project/A" }).channel).toBe("builder")
  })
})
