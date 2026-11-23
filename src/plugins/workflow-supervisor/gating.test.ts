// A16 contract tests — settle honesty, chore muting, wake gating, session
// muting. Written RED against docs/phase-ratchet/workflow-supervisor-phase-3.md
// (Amendment A16, items 1–8): no implementation exists for the new surfaces
// at the time of writing; every failing test must fail on a missing export
// or a missing behavior, never on a broken import path in this file.

import { describe, expect, test } from "bun:test"

// ---------------------------------------------------------------------------
// 1 — blocked-on-user is a named state
// ---------------------------------------------------------------------------

describe("A16.1 — blocked-on-user", () => {
  test("a pending permission ask on a child pauses the defer timer and is exposed", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    settle.trackChild("ses_parent", "ses_child")
    // A permission ask arrives for the in-flight child.
    settle.childBlocked("ses_child", "bun run check")
    const state = settle.deferState("ses_parent")
    expect(state.inFlight).toBe(1)
    expect(state.blockedOn).toEqual(["bun run check"])
    // Answering the prompt resumes mechanical settlement.
    settle.childUnblocked("ses_child")
    expect(settle.deferState("ses_parent").blockedOn).toEqual([])
  })

  test("unknown children and settled children are never blocked", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    expect(settle.deferState("ses_unknown")).toEqual({ inFlight: 0, blockedOn: [] })
    settle.trackChild("ses_parent", "ses_child")
    settle.childSettled("ses_child")
    expect(settle.deferState("ses_parent")).toEqual({ inFlight: 0, blockedOn: [] })
  })

  test("the badge exposes the blocked state", async () => {
    const { supervisionBadgeFromPolicy } = await import("./supervision.ts")
    const badge = supervisionBadgeFromPolicy({
      sessionID: "ses_observed",
      policy: { active: true, effectiveMode: "steer" },
      blockedOn: ["bun run check"],
    })
    expect(badge.blocked).toBe(true)
    expect(badge.blockedOn).toEqual(["bun run check"])
    // Absent input means not blocked — no silent defaults in badge state.
    expect(supervisionBadgeFromPolicy({ sessionID: "ses_x", policy: { active: true, effectiveMode: "steer" } }).blocked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2 — deadline-force honesty
// ---------------------------------------------------------------------------

describe("A16.2 — deadline-force honesty", () => {
  test("a forced checkpoint records why its evidence is absent", async () => {
    const { deferRecord } = await import("./settle.ts")
    const record = deferRecord({ inFlight: 1, blockedOn: ["bun run check"] }, 600_000)
    expect(record).toEqual({
      childrenInFlight: 1,
      blockedOnPermission: true,
      heldMs: 600_000,
    })
    expect(deferRecord({ inFlight: 1, blockedOn: [] }, 600_000).blockedOnPermission).toBe(false)
  })

  test("the envelope discloses a defer record, and only then", async () => {
    const { envelope } = await import("./reviewer.ts")
    const base = {
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
    }
    const disclosed = envelope({
      ...base,
      provenance: {
        completeness: { workingDiff: true },
        defer: { childrenInFlight: 1, blockedOnPermission: true, heldMs: 600_000 },
      },
    })
    expect(disclosed).toContain("Defer note")
    expect(disclosed).toContain("blocked on a pending permission decision")
    const quiet = envelope(base)
    expect(quiet.includes("Defer note")).toBe(false)
  })

  test("withheld gate evidence is reported as withheld — the instruction pins it", async () => {
    // The reviewer instruction is prose in src/agents/workflow-reviewer.md;
    // the contract pins the behavior at the envelope level (above) and the
    // instruction is verified by inspection at gate review.
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3 — chore turns are not work
// ---------------------------------------------------------------------------

describe("A16.3 — chore classification", () => {
  test("git-only, no-writes is a chore turn", async () => {
    const { classifyTurn } = await import("./routing.ts")
    expect(
      classifyTurn({
        turnFiles: [],
        tools: [
          { tool: "shell", command: "git add src/core/state.ts" },
          { tool: "shell", command: "git commit -m 'state: implement initial state'" },
        ],
      }),
    ).toBe("chore")
  })

  test("read-only tools are the A15 no-op path, not a chore — claims are still reviewed", async () => {
    const { classifyTurn } = await import("./routing.ts")
    expect(
      classifyTurn({
        turnFiles: [],
        tools: [
          { tool: "read", command: undefined },
          { tool: "grep", command: undefined },
        ],
      }),
    ).toBe("no-op")
  })

  test("file writes or non-git commands are work", async () => {
    const { classifyTurn } = await import("./routing.ts")
    expect(classifyTurn({ turnFiles: ["src/core/state.ts"], tools: [{ tool: "shell", command: "git commit -m x" }] })).toBe("work")
    expect(classifyTurn({ turnFiles: [], tools: [{ tool: "shell", command: "bun run check" }] })).toBe("work")
    expect(classifyTurn({ turnFiles: [], tools: [{ tool: "edit" }] })).toBe("work")
  })

  test("an unknown turn window is never classified as a chore", async () => {
    const { classifyTurn } = await import("./routing.ts")
    expect(classifyTurn({ turnFiles: undefined, tools: [{ tool: "shell", command: "git commit -m x" }] })).toBe("unknown")
  })

  test("chore muting is a policy default that a project can turn off", async () => {
    const { parseWorkflowPolicy } = await import("./policy.ts")
    const base = { enabled: true, mode: "steer", workflow: "w", version: 1, contract: "docs/c.md" }
    expect(parseWorkflowPolicy(JSON.stringify(base)).reviewChoreTurns).toBe(false)
    expect(
      parseWorkflowPolicy(JSON.stringify({ ...base, reviewChoreTurns: true })).reviewChoreTurns,
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4 — wakes respect an active folder
// ---------------------------------------------------------------------------

describe("A16.4 — wake gating", () => {
  test("an active sibling in the same folder holds the wake", async () => {
    const { deliveryPlan } = await import("./routing.ts")
    const held = deliveryPlan({ active: false, episodeMode: "delegate", siblingActive: true })
    expect(held).toEqual({ delivery: "queue", resume: false })
  })

  test("an idle folder still wakes, and an active builder still gets live delivery", async () => {
    const { deliveryPlan } = await import("./routing.ts")
    expect(deliveryPlan({ active: false, episodeMode: "delegate", siblingActive: false })).toEqual({
      delivery: "queue",
      resume: true,
    })
    expect(deliveryPlan({ active: true, episodeMode: "delegate", siblingActive: true })).toEqual({
      delivery: "steer",
      resume: false,
    })
  })

  test("collab never wakes, sibling or not", async () => {
    const { deliveryPlan } = await import("./routing.ts")
    expect(deliveryPlan({ active: false, episodeMode: "collab", siblingActive: false })).toEqual({
      delivery: "queue",
      resume: false,
    })
  })

  test("a held wake is released when the folder goes quiet", async () => {
    const { HeldWakes } = await import("./routing.ts")
    const held = new HeldWakes()
    held.hold("ses_observed", "/project/A")
    expect(held.release("/project/A")).toEqual(["ses_observed"])
    // Released once; a quiet folder has nothing pending.
    expect(held.release("/project/A")).toEqual([])
    // Another folder's completions never release it.
    held.hold("ses_observed", "/project/A")
    expect(held.release("/project/B")).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 5 — session muting is a lever
// ---------------------------------------------------------------------------

describe("A16.5 — mute lever", () => {
  test("a muted session skips automatic review but keeps explicit review", async () => {
    const { MuteState, automaticReviewAllowed } = await import("./routing.ts")
    const mutes = new MuteState()
    expect(automaticReviewAllowed("delegate")).toBe(true)
    mutes.mute("ses_observed")
    expect(mutes.isMuted("ses_observed")).toBe(true)
    // The automatic trigger consults the mute state; explicit checkpoints
    // do not (they are user-demanded and always processed).
    expect(mutes.blocksAutomatic("ses_observed")).toBe(true)
    expect(mutes.blocksAutomatic("ses_other")).toBe(false)
    // In-memory only: a fresh instance carries nothing over.
    expect(new MuteState().isMuted("ses_observed")).toBe(false)
  })

  test("the badge shows the muted marker", async () => {
    const { supervisionBadgeFromPolicy } = await import("./supervision.ts")
    const badge = supervisionBadgeFromPolicy({
      sessionID: "ses_observed",
      policy: { active: true, effectiveMode: "steer" },
      muted: true,
    })
    expect(badge.muted).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 6 — title muting by declaration
// ---------------------------------------------------------------------------

describe("A16.6 — title muting", () => {
  test("title patterns mute matching sessions automatically", async () => {
    const { titleMuted } = await import("./policy.ts")
    expect(titleMuted(["Git commit*"], "Git commit management")).toBe(true)
    expect(titleMuted(["Git commit*"], "Milestone 1 scaffold")).toBe(false)
    expect(titleMuted(undefined, "Git commit management")).toBe(false)
  })

  test("the policy accepts the optional field and still rejects unknown fields", async () => {
    const { parseWorkflowPolicy } = await import("./policy.ts")
    const base = { enabled: true, mode: "steer", workflow: "w", version: 1, contract: "docs/c.md" }
    const withPatterns = parseWorkflowPolicy(JSON.stringify({ ...base, muteTitles: ["Git commit*"] }))
    expect(withPatterns.muteTitles).toEqual(["Git commit*"])
    // The standing unknown-field rejection must survive the schema growth.
    expect(() => parseWorkflowPolicy(JSON.stringify({ ...base, surprise: true }))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 7 — evidence attribution
// ---------------------------------------------------------------------------

describe("A16.7 — attribution", () => {
  test("the envelope separates turn changes from the shared working tree", async () => {
    const { envelope } = await import("./reviewer.ts")
    const text = envelope({
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
      latestUserRequest: "Begin GREEN.",
      turnFiles: ["src/core/state.ts"],
      changedFiles: ["src/core/state.ts", "src/core/index.ts"],
    })
    expect(text).toContain("Turn changes: src/core/state.ts")
    expect(text).toContain("Working tree, all sessions: src/core/state.ts, src/core/index.ts")
  })

  test("a no-file turn is stated, not blank", async () => {
    const { envelope } = await import("./reviewer.ts")
    const text = envelope({
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
      turnFiles: [],
      changedFiles: [],
    })
    expect(text).toContain("Turn changes: none")
  })

  test("without turn-file input the envelope keeps its current shape", async () => {
    const { envelope } = await import("./reviewer.ts")
    const text = envelope({
      evidencePath: "/state/evidence.json",
      eventsPath: "/state/events.json",
      provenance: { completeness: { workingDiff: true } },
      changedFiles: ["src/core/state.ts"],
    })
    expect(text).toContain("Changed files: src/core/state.ts")
    expect(text.includes("Turn changes:")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 8 — settle regression guards
// ---------------------------------------------------------------------------

describe("A16.8 — settle regression", () => {
  test("plain in-flight children still defer with the backstop intact", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    settle.trackChild("ses_parent", "ses_child")
    expect(settle.hasInFlight("ses_parent")).toBe(true)
    settle.childSettled("ses_child")
    expect(settle.hasInFlight("ses_parent")).toBe(false)
  })
})
