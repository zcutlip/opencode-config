# Background Workflow Supervisor

Source: drafted on 2026-11-07 from the user's request for an independent background reviewer that critiques and steers other agents, using the OpenCode V2 documentation linked below. Implementation phasing was added on 2026-11-09 from the follow-up staged-rollout discussion. Per-project activation and scope were added on 2026-11-10 from the follow-up opt-in discussion. Related prior work: [Phase Ratchet Prototype](ratchet-prototype.md).

Status: design note for later planning and implementation experiments. No supervisor implementation exists yet.

## Goal

Move routine phase-transition review out of the user's critical path. An independent reviewer should catch deviations before they compound: ignored design decisions, tests written after implementation, premature contract changes, modification of locked tests, and treating the workflow as a checklist rather than a sequence of purposeful stages.

The intended threat model is mistakes and over-eager goal pursuit, not a deliberately malicious agent. The reviewer supplies semantic judgment; deterministic code supplies enforcement.

## Activation and project scope

The supervisor must be **available globally but enabled per project**. Installing its agent, command, and plugin globally does not mean every repository is supervised.

- Global installation provides the reviewer agent, review command, and supervisor implementation.
- A project opts in with a user-owned policy at `.opencode/workflow.jsonc`.
- Runtime state lives separately under `.opencode/workflow-state/`, which is normally ignored by version control.
- No policy file means `off`: no automatic reviews, injected messages, phase gates, or workflow state files. A manual `/workflow-review` remains available in every project.
- The policy is an enforcement boundary, not an agent setting: agents are denied edits to it so they cannot enable, disable, downgrade, or escalate their own workflow.

A project policy can look like:

```jsonc
{
  "enabled": true,
  "mode": "advisory", // off | advisory | steer | enforce
  "workflow": "contract-tests-lock-verify",
  "version": 1
}
```

Modes map onto the implementation phases:

- `off` or no policy file: manual review only; the plugin performs no automatic work.
- `advisory`: automatic reviews and a review ledger, with no messages or gates.
- `steer`: attributed findings are injected and reasserted; phase gates remain advisory.
- `enforce`: findings and deterministic phase/test locks can block transitions.

Policy may be committed for a project-wide posture or ignored for a personal opt-in. Committed policy makes clones inherit the posture; runtime state stays local to each checkout and worktree.

Activation is always evaluated for the **target session's repository**, not for the plugin's installation location or the supervisor session's location:

- A session in a subdirectory inherits its repository's policy.
- A nested repository is a separate policy boundary.
- Child sessions inherit their target project's policy.
- Worktrees share the project policy but keep independent phase and ledger state, so parallel workstreams do not advance each other.

If a policy file exists but is malformed, do not treat it as `off`: surface a visible configuration error, suppress automatic reviews and injection, and block gated transitions until the policy is repaired.

### Adoption in a mature project

A project may enable the workflow after substantial development. Activation records an adoption baseline instead of making historical claims:

- snapshot the current commit, existing contract, and existing tests
- start at the `design` phase
- create a fresh contract and test manifest for the first enforced workstream
- do not claim prior tests-first ordering or charge past work against the new gate

## What OpenCode V2 already provides

- **Read-only reviewer agents:** a subagent can have a separate model, fresh context, and permissions that deny edits and shell access.
- **Background child sessions:** a parent can launch a reviewer asynchronously and receive its result when it finishes. A command with `subagent: true` provides the same behavior manually.
- **Experimental schedules:** the Schedules API can wake a session after a delay, at a time, on an interval, or on a cron expression. It requires `experimental.schedules` and may change without notice.
- **Server plugins and the HTTP API:** these provide the missing cross-session observation, review orchestration, message injection, and enforcement mechanisms.

Stock agents, commands, and schedules do not by themselves provide an autonomous supervisor that watches other sessions and intervenes. That requires a server plugin or external API client.

## Recommended architecture

Keep the **supervisor durable** and invoke a **fresh reviewer per checkpoint**. The supervisor retains workflow and review state; the reviewer avoids accumulating the builder's assumptions or rationalizations.

### 1. Observe meaningful checkpoints

Before collecting evidence or starting any work for a session, resolve that session's project policy. For a session with no policy or `off`, return without creating a reviewer, injecting a message, enforcing a gate, or writing state.

A server plugin handles events including:

- `session.tool.called`, `session.tool.success`, and `session.tool.failed`
- `session.step.ended`
- `session.execution.succeeded`, `session.execution.failed`, and `session.execution.interrupted`
- `session.idle`

Do not review every token or tool call. Trigger reviews at phase-transition requests, test runs, implementation milestones, and execution completion. A periodic schedule can be a fallback, not the primary detector.

### 2. Preserve evidence, not just a final diff

For each review, assemble:

- the agreed design and the rationale for each workflow stage
- the current contract and phase version
- the ordered tool/event history
- the target session's context
- the current VCS diff
- actual test commands and outcomes
- the locked test manifest and any later changes

Tests-first cannot be inferred from a final diff. The evidence must show test creation and a failing test run before implementation edits.

### 3. Request an independent review

The supervisor creates or prompts a separate read-only reviewer session, optionally using a different model from the builder. The reviewer receives the evidence and returns a structured verdict containing:

- the target session and reviewed phase
- findings ordered by severity
- evidence references for every finding
- whether the requested transition is semantically acceptable
- required corrections or items needing user judgment

The reviewer cannot edit code, modify tests, advance its own review target, or grant itself additional authority.

### 4. Inject critique with clear provenance

Use `session.synthetic` to send findings to the builder:

- `delivery: "steer"` while the builder is active
- `delivery: "queue"` when the correction should wait

Label messages as coming from `workflow-supervisor`, and include the review ID and evidence references. Do not present generated critique as a genuine user prompt.

A `session.context` hook can also add the active contract, current phase, and unresolved findings to subsequent model calls, including tool-driven continuations. This keeps steering effective after the initial review message instead of relying on the builder to remember it.

Severe deviations can trigger `session.interrupt`, followed by corrective steering. Interruption prevents further work; it does not undo existing changes.

## Authority and phase transitions

The reviewer is an advisor and semantic judge. The supervisor plugin is the workflow authority.

A transition should follow this sequence:

1. The builder calls a custom `workflow.request_transition` tool.
2. The supervisor validates the required mechanical and chronological evidence.
3. A fresh reviewer evaluates design fidelity and process compliance.
4. The supervisor validates the structured verdict.
5. Only the supervisor updates the phase and writes the review-ledger entry.
6. Missing evidence, reviewer failure, or an ambiguous verdict blocks the transition or escalates to the user.

An initial phase sequence to experiment with:

`design agreed → tests written and failing → contract/tests locked → implementation → verification`

Workflow policy belongs to the project; phase and evidence state belong to the workstream or worktree, not to whichever agent happens to request a transition. All participating primary and child sessions in an enabled project must be subject to the same enforcement backstop.

The existing phase-ratchet prototype already demonstrates a useful privilege split: an auditor decides *when* to request advancement, while deterministic code decides *whether* that advancement is legal. The supervisor should preserve that split.

## Test and contract locking

At the locking transition:

- hash the agreed contract and record its version
- record a manifest and hashes for locked test files
- deny direct `edit` operations on locked tests for every participating agent
- apply the same rule through `permission.evaluate` as a uniform backstop
- verify the manifest again at later transitions

An `edit` deny does not prevent modification through `shell`. For the cooperative-agent prototype, combine narrow shell permissions with manifest verification and explicit bypass tests. A genuine adversarial boundary requires an external test authority or OS sandbox because shell runs with the host user's authority.

## Implementation phases

Build in order: `review → observe → steer → enforce → harden`. Each phase should remain useful independently, and each new source of authority should be validated only after the preceding behavior is understood.

### Phase 1 — On-demand independent review

The smallest useful slice requires no plugin:

- add a read-only `workflow-reviewer` subagent with its own model and fresh context
- add a `/workflow-review` command using `subagent: true`
- keep the command globally available; manual review does not activate automatic supervision
- supply the agreed design, current diff, and relevant test output
- require evidence-backed findings and corrections; prohibit the reviewer from implementing fixes
- keep the user as the phase-transition authority

Immediate win: a second reviewer checks design drift, scope creep, questionable implementation choices, and test-contract changes without the user rereading everything.

Limit: this reviews the supplied evidence; it cannot prove tests-first ordering from a final diff alone. Use it at the current manual gates before automating any behavior.

### Phase 2 — Automatic observation, passive reporting

Introduce a small globally installed server plugin that is inert unless the target session's project policy enables `advisory` or stronger:

- resolve and validate the target project's policy before doing any automatic work
- handle execution-completion events and explicit checkpoint requests
- collect session context, ordered events, and the VCS diff
- invoke the same fresh reviewer automatically
- record findings in a per-worktree review ledger, but do not inject them or block anything

This separates whether the reviewer finds real deviations from whether its output should affect another agent.

Run it across a representative set of real checkpoints—10–20 initially—and record actionable findings, false positives, duplicates, and missed deviations. Implementation advances to Phase 3 only when that evidence shows the findings are sufficiently reliable and specific for the user's tolerance. Each project independently promotes itself from `advisory` to `steer`; implementation availability does not activate steering.

### Phase 3 — Automatic soft steering

Once review quality is acceptable, and only for projects configured as `steer` or `enforce`:

- inject findings using attributed synthetic messages with `delivery: "steer"` or `delivery: "queue"`
- reassert unresolved findings and the active contract through a `session.context` hook
- deduplicate findings and bound correction attempts
- escalate disagreement, contract changes, and repeated unresolved findings to the user

The supervisor now handles routine corrections while the user remains outside the normal feedback loop. There is still no hard enforcement to debug alongside the steering behavior.

### Phase 4 — Deterministic phase gates

Integrate the existing phase-ratchet approach, gated to projects configured as `enforce`:

- add `workflow.request_transition`
- verify chronological evidence for tests-first ordering
- hash the contract and locked-test manifest
- apply uniform permission backstops across workers and orchestrators
- fail closed when evidence is missing or the reviewer fails
- let the reviewer judge semantic compliance while plugin code decides whether a transition is mechanically legal

Run the shell-bypass experiments in this phase. Direct edit denies alone do not make tests immutable against shell writes.

### Phase 5 — Reliability and stronger intervention

Add only after the core loop works:

- persistent recovery and resynchronization after event-stream interruption
- scheduled fallback reviews for missed checkpoints
- cross-session and workstream coordination without weakening activation boundaries
- automatic interruption for narrowly defined, deterministic severe violations, still gated by project mode
- metrics covering review latency, correction frequency, repeat findings, and blocked transitions, segmented by project and mode

### Defer until the phased evidence justifies them

- continuous token- or tool-call review
- LLM evaluation inside every permission check
- automatic interruption based solely on reviewer prose
- cron-driven self-review in the builder's session
- automatic remediation of reviewer findings

The recommended first experiment is Phase 1's reviewer agent and command. Phase 2 should be the first plugin implementation.

## Acceptance experiments

- Project A is enabled and Project B is unconfigured: work in B creates no reviewer session, synthetic message, gate, or workflow-state directory.
- `/workflow-review` in an `off` project produces only the requested manual review; no automatic behavior follows.
- An agent in an enabled project tries to edit `.opencode/workflow.jsonc` to enable, disable, downgrade, or escalate its workflow: the edit is denied; the broad-shell residual limitation is recorded separately.
- An enabled but malformed policy produces a visible error, does not behave as `off`, suppresses automatic action, and blocks gated transitions.
- Enabling a mature project starts at `design` from an adoption baseline and makes no retroactive tests-first claim.
- Projects A and B run concurrently without leaking policy, mode, phase, or review state; separate worktrees share policy but not phase state.
- A global plugin update changes implementation, not project policies; existing `off` projects remain inert.
- Implementation begins before a failing test run: transition denied, with the missing evidence identified.
- Builder requests a transition without review: deterministic gate denies it.
- Reviewer times out, fails, or returns malformed output: transition remains blocked.
- Reviewer attempts to edit code or advance a phase: its permissions deny both actions.
- Locked test is edited through file tools by any worker or orchestrator: uniform backstop denies it.
- Locked test is modified through shell: bypass is either denied by the narrow shell policy or detected by manifest verification; record the residual limitation explicitly.
- Critique arrives during active work: it is attributed to the supervisor and influences the next model call.
- The same event is delivered twice: no duplicate phase advance or critique storm occurs.
- Reviewer and builder disagree repeatedly or the contract must change: escalation reaches the user instead of looping autonomously.
- An external API client reconnects after a failure: it resynchronizes state rather than assuming the live event stream replayed missed events.

## Limits and design cautions

- A reviewer message alone is soft steering; the builder can ignore it. Permissions and deterministic transition checks provide the teeth.
- A reviewer can be wrong. Escalate ambiguous judgments and contract changes rather than treating model output as infallible.
- Scheduled self-review in the builder's own session is not independent review.
- Continuous token-by-token review would add cost and latency while producing mostly noise.
- External event subscriptions are live-only, with no replay or automatic reconnection; durable supervisor state and resynchronization are required for unattended operation.
- A globally installed plugin still loads in every project; its inertness must be proven by side-effect-free tests, not assumed from there being no policy file.
- Broad shell can edit or delete a local workflow policy. Filename-based denies and validation cover cooperative mistakes, not a determined agent with unrestricted shell.
- Schedules and some instruction/session APIs are experimental; keep the core gate independent of them.

## OpenCode V2 sources

- [Agents](https://opencode.ai/docs/agents/)
- [Commands — background child sessions](https://opencode.ai/docs/commands/#background)
- [Server plugins — sessions, events, hooks, permissions, and tools](https://opencode.ai/docs/build/plugins/server/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [JavaScript client — event-stream behavior](https://opencode.ai/docs/build/client/#stream-events)
- [API and experimental Schedules API](https://opencode.ai/docs/api/)
