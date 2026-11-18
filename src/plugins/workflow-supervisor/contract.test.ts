import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdir, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import {
  MemoryLedger,
  cleanupTemporaryDirectories,
  evidence,
  observerHarness,
  policyText,
  resolution,
  temporaryDirectory,
  writePolicy,
} from "./contract-support.ts"

// Source: approved Phase 2 contract in docs/phase-ratchet/workflow-supervisor-phase-2.md
// (commit 336387e plus pre-lock amendment A1). Eighteen unit tests plus
// permission-probe.ts form the RED gate before plugin implementation.

afterEach(async () => {
  await cleanupTemporaryDirectories()
})

function reviewerClient(overrides: Record<string, any> = {}) {
  const calls = { create: [] as any[], prompt: [] as any[], wait: [] as any[], interrupt: [] as any[], synthetic: [] as any[], update: [] as any[] }
  const client = {
    session: {
      create: async (input: any) => {
        calls.create.push(input)
        return { id: "ses_reviewer" }
      },
      prompt: async (input: any) => {
        calls.prompt.push(input)
        return { id: "msg_prompt", sessionID: input.sessionID }
      },
      wait: overrides.wait ?? (async (input: any) => {
        calls.wait.push(input)
      }),
      get: async () => ({
        id: "ses_reviewer",
        outcome: "succeeded",
        tokens: { input: 10, output: 4, reasoning: 3, cache: { read: 0, write: 0 } },
        cost: 0,
        time: { created: 100, updated: 125 },
      }),
      context: async () => [
        { type: "assistant", content: [{ type: "text", text: "Mode: checkpoint\nVerdict: CONCERNS" }] },
      ],
      interrupt: async (input: any) => {
        calls.interrupt.push(input)
        return { interrupted: true }
      },
      synthetic: async (input: any) => {
        calls.synthetic.push(input)
      },
      update: async (input: any) => {
        calls.update.push(input)
      },
    },
  }
  return { client, calls }
}

function reviewerInput(client: any, overrides: Record<string, any> = {}) {
  return {
    client,
    location: "/project/A",
    contractPath: "/project/A/docs/contract.md",
    evidencePath: "/project/A/.opencode/workflow-state/checkpoints/cp-test/evidence.json",
    eventsPath: "/project/A/.opencode/workflow-state/checkpoints/cp-test/events.json",
    provenance: { trigger: "execution", sessionID: "ses_observed" },
    timeoutMs: 1_000,
    ...overrides,
  }
}

describe("Phase 2 policy and activation", () => {
  test("1. missing/off policies are inert beyond discovery", async () => {
    const { resolveWorkflowPolicy } = await import("./policy.ts")
    for (const contents of [
      '{"enabled":false,"mode":"advisory"}',
      '{"enabled":true,"mode":"off"}',
    ]) {
      const root = await temporaryDirectory()
      await writePolicy(root, contents)
      await expect(resolveWorkflowPolicy(root, {
        resolveRepository: async () => ({ worktree: root, mainRepository: root }),
      })).resolves.toBeNull()
    }

    const { observer, reviewerCalls, captureCalls, ledger, notifications } = await observerHarness({ resolution: null })
    expect((await observer.handleExecutionSucceeded("ses_observed")).status).toBe("disabled")
    expect(await observer.recordEvent({ type: "session.tool.called", data: { sessionID: "ses_observed" } })).toBe(false)
    expect(reviewerCalls).toHaveLength(0)
    expect(captureCalls).toHaveLength(0)
    expect(ledger.claims.size).toBe(0)
    expect(ledger.evidence.size).toBe(0)
    expect(ledger.errors).toHaveLength(0)
    expect(notifications).toHaveLength(0)
  })

  test("2. Project A activation has no Project B side effects", async () => {
    const a = await observerHarness({ root: "/project/A" })
    const b = await observerHarness({ root: "/project/B", resolution: null })
    expect((await a.observer.handleExecutionSucceeded("ses_observed")).status).toBe("completed")
    expect((await b.observer.handleExecutionSucceeded("ses_observed")).status).toBe("disabled")
    expect(a.reviewerCalls).toHaveLength(1)
    expect(b.reviewerCalls).toHaveLength(0)
    expect(b.ledger.claims.size).toBe(0)
    expect(b.notifications).toHaveLength(0)
  })

  test("4. invalid policy, contract, and repository states fail visibly without review", async () => {
    const { parseWorkflowPolicy, PolicyError, resolveWorkflowPolicy } = await import("./policy.ts")
    const valid = {
      enabled: true,
      mode: "advisory",
      workflow: "contract-tests-lock-verify",
      version: 1,
      contract: "docs/contract.md",
    }
    const invalidPolicies = [
      "{ nope",
      JSON.stringify({ ...valid, extra: true }),
      JSON.stringify({ ...valid, workflow: "" }),
      JSON.stringify({ ...valid, version: 2 }),
      JSON.stringify({ ...valid, version: 1.5 }),
      JSON.stringify({ ...valid, enabled: "true" }),
      JSON.stringify({ ...valid, enabled: false, mode: "chaos" }),
      JSON.stringify({ ...valid, enabled: "true", mode: "off" }),
      JSON.stringify({ ...valid, mode: "chaos" }),
      JSON.stringify({ ...valid, mode: 1 }),
      JSON.stringify({ ...valid, contract: "/absolute/contract.md" }),
      JSON.stringify({ ...valid, contract: "../escape.md" }),
      JSON.stringify({ ...valid, contract: undefined }),
    ]
    for (const contents of invalidPolicies) {
      expect(() => parseWorkflowPolicy(contents)).toThrow(PolicyError)
    }

    const root = await temporaryDirectory()
    await writePolicy(root, policyText())
    await expect(resolveWorkflowPolicy(root, {
      resolveRepository: async () => ({ worktree: root, mainRepository: root }),
    })).rejects.toMatchObject({ code: "invalid_contract" })

    const resolvable = await observerHarness({
      resolvePolicy: async () => {
        throw new PolicyError("invalid_jsonc", "malformed policy", { fingerprint: "policy-1" })
      },
    })
    expect((await resolvable.observer.handleExecutionSucceeded("ses_observed")).status).toBe("error")
    expect(resolvable.reviewerCalls).toHaveLength(0)
    expect(resolvable.notifications).toHaveLength(1)
    expect(resolvable.logs).toHaveLength(1)
    expect(resolvable.ledger.errors).toHaveLength(1)

    const preRoot = await observerHarness({
      resolvePolicy: async () => {
        throw new PolicyError("repository_resolution", "git resolution failed", { fingerprint: "repo-1" })
      },
    })
    expect((await preRoot.observer.handleExecutionSucceeded("ses_observed")).status).toBe("error")
    expect(preRoot.reviewerCalls).toHaveLength(0)
    expect(preRoot.notifications).toHaveLength(1)
    expect(preRoot.logs).toHaveLength(1)
    expect(preRoot.ledger.errors).toHaveLength(0)
  })

  test("11. worktrees share main policy but resolve target contracts and state independently", async () => {
    const { resolveWorkflowPolicy } = await import("./policy.ts")
    const { FileLedger } = await import("./ledger.ts")
    const main = await temporaryDirectory()
    const worktree = await temporaryDirectory()
    await writePolicy(main, policyText())
    await mkdir(join(worktree, "docs"), { recursive: true })
    await writeFile(join(worktree, "docs/contract.md"), "Worktree contract")

    const resolved = await resolveWorkflowPolicy(worktree, {
      resolveRepository: async () => ({ worktree, mainRepository: main }),
    })
    expect(resolved.mainRepository).toBe(main)
    expect(resolved.worktree).toBe(worktree)
    expect(resolved.contractContent).toBe("Worktree contract")
    expect(resolved.requestedMode).toBe("advisory")
    expect(new FileLedger(worktree).root).not.toBe(new FileLedger(main).root)

    const nested = await temporaryDirectory()
    await expect(resolveWorkflowPolicy(nested, {
      resolveRepository: async () => ({ worktree: nested, mainRepository: nested }),
    })).resolves.toBeNull()
  })

// Contract test 15 lives in permission-probe.ts: it uses the documented
// session.permission.create evaluation API rather than inspecting rule strings.

  test("16. steer records steering effective behavior and enforce remains advisory", async () => {
    const effectiveModes = { steer: "steer", enforce: "advisory" } as const
    for (const [mode, effectiveMode] of Object.entries(effectiveModes)) {
      const harness = await observerHarness({ resolution: resolution("/project/A", { requestedMode: mode }) })
      expect((await harness.observer.handleExecutionSucceeded("ses_observed")).status).toBe("completed")
      const metadata = [...harness.ledger.claims.values()][0]
      expect(metadata.requestedMode).toBe(mode)
      expect(metadata.effectiveMode).toBe(effectiveMode)
      expect(harness.reviewerCalls).toHaveLength(1)
    }
  })
})

describe("Phase 2 ownership, claims, and explicit checkpoints", () => {
  test("3. concurrent location instances share one atomic deterministic claim", async () => {
    const { FileLedger } = await import("./ledger.ts")
    const expectedID = `cp-${createHash("sha256").update("ses_observed\0execution\0evidence-1").digest("hex")}`
    const root = await temporaryDirectory()
    const ledger = new FileLedger(root)
    const a = await observerHarness({ root, ledger })
    const b = await observerHarness({ root, ledger })
    const [first, second] = await Promise.all([
      a.observer.handleExecutionSucceeded("ses_observed"),
      b.observer.handleExecutionSucceeded("ses_observed"),
    ])
    expect([first.status, second.status].sort()).toEqual(["completed", "duplicate"])
    expect(a.reviewerCalls.length + b.reviewerCalls.length).toBe(1)
    expect(first.checkpointID ?? second.checkpointID).toBe(expectedID)
    expect(await readdir(join(root, ".opencode/workflow-state/checkpoints"))).toEqual([expectedID])

    const nested = await observerHarness({ location: root, root: join(root, "nested") })
    expect((await nested.observer.handleExecutionSucceeded("ses_observed")).status).toBe("ignored")
    expect(nested.reviewerCalls).toHaveLength(0)
  })

  test("6. no execution path mutates the observed session", async () => {
    const { runReviewer } = await import("./reviewer.ts")
    const { client, calls } = reviewerClient()
    await runReviewer(reviewerInput(client))
    expect(calls.create).toHaveLength(1)
    expect(calls.prompt.every((call) => call.sessionID === "ses_reviewer")).toBe(true)
    expect(calls.wait.every((call) => call.sessionID === "ses_reviewer")).toBe(true)
    expect(calls.interrupt).toHaveLength(0)
    expect(calls.synthetic).toHaveLength(0)
    expect(calls.update).toHaveLength(0)

    const harness = await observerHarness()
    const result = await harness.observer.handleExecutionSucceeded("ses_observed")
    expect(result.status).toBe("completed")
    expect(result.builderMessage).toBeUndefined()
  })

  test("7. reviewer, plugin-review, and child completions do not recurse", async () => {
    for (const session of [
      { id: "ses_reviewer", agent: "workflow-reviewer", location: "/project/A" },
      { id: "ses_plugin_review", agent: "build", location: "/project/A", metadata: { workflowSupervisorReview: true } },
      { id: "ses_child", parentID: "ses_parent", agent: "build", location: "/project/A" },
    ]) {
      const harness = await observerHarness({ resolution: resolution("/project/A", { session }) })
      expect((await harness.observer.handleExecutionSucceeded(session.id)).status).toBe("ignored")
      expect(harness.reviewerCalls).toHaveLength(0)
    }
  })

  test("8. unchanged evidence deduplicates across reloads and new evidence is serialized", async () => {
    const ledger = new MemoryLedger()
    const first = await observerHarness({ ledger })
    const second = await observerHarness({ ledger })
    expect((await first.observer.handleExecutionSucceeded("ses_observed")).status).toBe("completed")
    expect((await second.observer.handleExecutionSucceeded("ses_observed")).status).toBe("duplicate")
    expect(first.reviewerCalls.length + second.reviewerCalls.length).toBe(1)

    let release: (() => void) | undefined
    let markStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => { markStarted = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    let sequence = 0
    const concurrent = await observerHarness({
      captureEvidence: async () => {
        sequence += 1
        markStarted?.()
        await gate
        return evidence({ hash: `evidence-${sequence}` })
      },
    })
    const one = concurrent.observer.handleExecutionSucceeded("ses_observed")
    const two = concurrent.observer.handleExecutionSucceeded("ses_observed")
    await started
    await Promise.resolve()
    expect(concurrent.activeCaptures.maximum).toBe(1)
    release?.()
    await Promise.all([one, two])
    expect(concurrent.activeCaptures.maximum).toBe(1)
  })

  test("10. explicit checkpoints return no findings and off returns disabled", async () => {
    const { buildExplicitEvidence } = await import("./evidence.ts")
    const policy = resolution("/project/A")
    const explicitEvidence = buildExplicitEvidence({
      session: policy.session,
      policy,
      latestUserRequest: "Implement the agreed change",
      workingDiff: evidence().workingDiff,
      status: evidence().status,
      turnDiff: evidence().turnDiff,
      events: evidence().events,
      input: { phase: "implementation", transition: "verify" },
      provenance: { trigger: "explicit", sessionID: "ses_observed" },
    })
    expect(explicitEvidence.workingDiff).toHaveLength(1)
    expect(explicitEvidence.status).toHaveLength(1)
    expect(explicitEvidence.turnDiff).toBeUndefined()
    expect(explicitEvidence.events).toBeUndefined()

    const harness = await observerHarness({ captureEvidence: async () => explicitEvidence })
    const result = await harness.observer.explicitCheckpoint("ses_observed", { phase: "implementation", transition: "verify" })
    expect(result.status).toBe("completed")
    expect(result.checkpointID).toBeString()
    expect(result.statePath).toBeString()
    expect(result.report).toBeUndefined()
    expect(result.findings).toBeUndefined()
    expect(harness.captureCalls[0]).toMatchObject({
      sessionID: "ses_observed",
      trigger: "explicit",
      input: { phase: "implementation", transition: "verify" },
    })
    const captured = [...harness.ledger.evidence.values()][0]
    expect(captured.workingDiff).toHaveLength(1)
    expect(captured.status).toHaveLength(1)
    expect(captured.turnDiff).toBeUndefined()
    expect(captured.events).toBeUndefined()

    const off = await observerHarness({ resolution: null })
    expect((await off.observer.explicitCheckpoint("ses_observed", {})).status).toBe("disabled")
    expect(off.ledger.claims.size).toBe(0)
    expect(off.reviewerCalls).toHaveLength(0)
  })

  test("19. explicit child checkpoints target caller context and reject extra input", async () => {
    const { checkpointInputSchema, parseCheckpointInput } = await import("./observer.ts")
    expect(checkpointInputSchema.additionalProperties).toBe(false)
    expect(checkpointInputSchema.properties.sessionID).toBeUndefined()
    expect(checkpointInputSchema.properties.checklist).toBeUndefined()
    expect(() => parseCheckpointInput({ sessionID: "ses_other" })).toThrow()
    expect(() => parseCheckpointInput({ checklist: ["review everything"] })).toThrow()

    const child = { id: "ses_child", parentID: "ses_parent", agent: "build", location: "/project/A" }
    const harness = await observerHarness({ resolution: resolution("/project/A", { session: child }) })
    expect((await harness.observer.explicitCheckpoint(child.id, { phase: "design" })).status).toBe("completed")
    expect(harness.captureCalls[0].sessionID).toBe("ses_child")
  })
})

describe("Phase 2 evidence and reviewer lifecycle", () => {
  test("5. reviewer is parentless, targeted, and receives exact automatic attribution", async () => {
    const { runReviewer } = await import("./reviewer.ts")
    const { client, calls } = reviewerClient()
    const result = await runReviewer(reviewerInput(client))
    expect(result.sessionID).toBe("ses_reviewer")
    expect(calls.create[0].agent).toBe("workflow-reviewer")
    expect(calls.create[0].location).toEqual({ directory: "/project/A" })
    expect(Object.hasOwn(calls.create[0], "parentID")).toBe(false)
    expect(calls.prompt[0].text).toStartWith("User request: none — automatic execution-completion checkpoint; no transition requested.")
    expect(calls.prompt[0].text).toContain("Mode: checkpoint")
    expect(calls.prompt[0].text).toContain(reviewerInput(client).evidencePath)
  })

  test("9. working truncation blocks review; turn/event gaps only prohibit those claims", async () => {
    const { buildAutomaticEvidence, EvidenceTruncatedError } = await import("./evidence.ts")
    const base = {
      session: { id: "ses_observed", agent: "build", location: "/project/A" },
      latestUserRequest: "Implement",
      turnDiff: evidence().turnDiff,
      workingDiff: evidence().workingDiff,
      status: evidence().status,
      events: evidence().events,
      policy: resolution("/project/A"),
      provenance: { trigger: "execution", sessionID: "ses_observed" },
    }
    expect(() => buildAutomaticEvidence({
      ...base,
      workingDiff: [{ ...base.workingDiff[0], more: true }],
    })).toThrow(EvidenceTruncatedError)

    const limited = buildAutomaticEvidence({
      ...base,
      turnDiff: [{ ...base.turnDiff[0], more: true }],
      events: [{ type: "session.tool.called", durable: { seq: 4 } }],
    })
    expect(limited.completeness).toMatchObject({ workingDiff: true, turnDiff: false, events: false })
    expect(limited.chronologyAllowed).toBe(false)

    const harness = await observerHarness({ evidence: limited })
    expect((await harness.observer.handleExecutionSucceeded("ses_observed")).status).toBe("completed")
    expect(harness.reviewerCalls).toHaveLength(1)

    const blocked = await observerHarness({
      captureEvidence: async () => { throw new EvidenceTruncatedError("working diff truncated") },
    })
    expect((await blocked.observer.handleExecutionSucceeded("ses_observed")).status).toBe("failed")
    expect(blocked.reviewerCalls).toHaveLength(0)
    expect(blocked.ledger.failed.size).toBe(1)
  })

  test("12. reviewer failure persists and timeout interrupts only the reviewer", async () => {
    const failure = await observerHarness({
      runReviewer: async () => { throw new Error("reviewer failed") },
    })
    expect((await failure.observer.handleExecutionSucceeded("ses_observed")).status).toBe("failed")
    expect(failure.ledger.failed.size).toBe(1)

    const { runReviewer, ReviewerTimeoutError } = await import("./reviewer.ts")
    const { client, calls } = reviewerClient({
      wait: async (input: any) => {
        calls.wait.push(input)
        await new Promise(() => {})
      },
    })
    await expect(runReviewer(reviewerInput(client, { timeoutMs: 5 }))).rejects.toBeInstanceOf(ReviewerTimeoutError)
    expect(calls.interrupt).toEqual([{ sessionID: "ses_reviewer", resume: false }])
    expect(calls.synthetic).toHaveLength(0)
    expect(calls.update).toHaveLength(0)
  })

  test("17. automatic evidence contains both diffs, status, contract, modes, and provenance", async () => {
    const { buildAutomaticEvidence } = await import("./evidence.ts")
    const policy = resolution("/project/A", { requestedMode: "steer" })
    const value = buildAutomaticEvidence({
      session: { id: "ses_observed", agent: "build", location: "/project/A" },
      latestUserRequest: "Implement the contract",
      turnDiff: evidence().turnDiff,
      workingDiff: evidence().workingDiff,
      status: evidence().status,
      events: evidence().events,
      policy,
      provenance: { trigger: "execution", sessionID: "ses_observed", source: "session.execution.succeeded" },
    })
    expect(value.turnDiff).toHaveLength(1)
    expect(value.workingDiff).toHaveLength(1)
    expect(value.status).toHaveLength(1)
    expect(value.contractPath).toBe(policy.contractPath)
    expect(value.contractContent).toBe("Agreed contract")
    expect(value.requestedMode).toBe("steer")
    expect(value.effectiveMode).toBe("steer")
    expect(value.provenance.source).toBe("session.execution.succeeded")

    const harness = await observerHarness({ evidence: value })
    await harness.observer.handleExecutionSucceeded("ses_observed")
    expect([...harness.ledger.evidence.values()][0]).toBe(value)
  })

  test("18. completed checkpoints record reviewer identity and measured usage", async () => {
    const { runReviewer } = await import("./reviewer.ts")
    const { client } = reviewerClient()
    const harness = await observerHarness({
      runReviewer: async () => runReviewer(reviewerInput(client)),
    })
    const result = await harness.observer.handleExecutionSucceeded("ses_observed")
    const completed = harness.ledger.completed.get(result.checkpointID)
    expect(completed.sessionID).toBe("ses_reviewer")
    expect(completed.report).toContain("Mode: checkpoint")
    expect(completed.usage).toEqual({
      tokens: { input: 10, output: 4, reasoning: 3, cache: { read: 0, write: 0 } },
      cost: 0,
      elapsedMs: 25,
    })
  })
})

describe("Phase 2 persistence and diagnostics", () => {
  test("13. initialized runtime state is invisible to git status", async () => {
    const { FileLedger } = await import("./ledger.ts")
    const root = await temporaryDirectory()
    expect(Bun.spawnSync(["git", "init", "-q"], { cwd: root }).exitCode).toBe(0)
    const ledger = new FileLedger(root)
    await ledger.init()
    const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root, stdout: "pipe" })
    expect(status.stdout.toString()).toBe("")
  })

  test("14. configuration notifications are filtered, deduplicated, and finding-free", async () => {
    const { ConfigurationErrorDispatcher, canonicalLocationEqual } = await import("./observer.ts")
    const emitted: any[] = []
    const logged: any[] = []
    const persisted: any[] = []
    const dispatcher = new ConfigurationErrorDispatcher({
      emit: async (event: any) => { emitted.push(event) },
      log: (error: any) => { logged.push(error) },
      record: async (error: any) => { persisted.push(error) },
    })
    const input = {
      fingerprint: "policy-error-1",
      location: "/project/A",
      code: "invalid_jsonc",
      message: "Malformed policy",
    }
    await dispatcher.report(input)
    await dispatcher.report(input)
    await dispatcher.report({ ...input, fingerprint: "policy-error-2" })
    expect(emitted).toHaveLength(2)
    expect(logged).toHaveLength(2)
    expect(persisted).toHaveLength(2)
    expect(emitted[0].type).toBe("configurationError")
    expect(emitted[0].data.findings).toBeUndefined()
    expect(canonicalLocationEqual(emitted[0].location, "/project/A")).toBe(true)
    expect(canonicalLocationEqual(emitted[0].location, "/project/A/nested")).toBe(false)
  })
})
