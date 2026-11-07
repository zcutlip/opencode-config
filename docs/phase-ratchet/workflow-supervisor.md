# Background Workflow Supervisor

Source: drafted on 2026-11-07 from the user's request for an independent background reviewer that critiques and steers other agents, using the OpenCode V2 documentation linked below. Related prior work: [Phase Ratchet Prototype](ratchet-prototype.md).

Status: design note for later planning and implementation experiments. No supervisor implementation exists yet.

## Goal

Move routine phase-transition review out of the user's critical path. An independent reviewer should catch deviations before they compound: ignored design decisions, tests written after implementation, premature contract changes, modification of locked tests, and treating the workflow as a checklist rather than a sequence of purposeful stages.

The intended threat model is mistakes and over-eager goal pursuit, not a deliberately malicious agent. The reviewer supplies semantic judgment; deterministic code supplies enforcement.

## What OpenCode V2 already provides

- **Read-only reviewer agents:** a subagent can have a separate model, fresh context, and permissions that deny edits and shell access.
- **Background child sessions:** a parent can launch a reviewer asynchronously and receive its result when it finishes. A command with `subagent: true` provides the same behavior manually.
- **Experimental schedules:** the Schedules API can wake a session after a delay, at a time, on an interval, or on a cron expression. It requires `experimental.schedules` and may change without notice.
- **Server plugins and the HTTP API:** these provide the missing cross-session observation, review orchestration, message injection, and enforcement mechanisms.

Stock agents, commands, and schedules do not by themselves provide an autonomous supervisor that watches other sessions and intervenes. That requires a server plugin or external API client.

## Recommended architecture

Keep the **supervisor durable** and invoke a **fresh reviewer per checkpoint**. The supervisor retains workflow and review state; the reviewer avoids accumulating the builder's assumptions or rationalizations.

### 1. Observe meaningful checkpoints

A server plugin subscribes to events including:

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

Phase state should belong to the project or workstream, not to whichever agent happens to request a transition. All participating primary and child sessions must be subject to the same enforcement backstop.

The existing phase-ratchet prototype already demonstrates a useful privilege split: an auditor decides *when* to request advancement, while deterministic code decides *whether* that advancement is legal. The supervisor should preserve that split.

## Test and contract locking

At the locking transition:

- hash the agreed contract and record its version
- record a manifest and hashes for locked test files
- deny direct `edit` operations on locked tests for every participating agent
- apply the same rule through `permission.evaluate` as a uniform backstop
- verify the manifest again at later transitions

An `edit` deny does not prevent modification through `shell`. For the cooperative-agent prototype, combine narrow shell permissions with manifest verification and explicit bypass tests. A genuine adversarial boundary requires an external test authority or OS sandbox because shell runs with the host user's authority.

## Suggested implementation slices

1. **Observer:** subscribe to events and persist an evidence ledger; perform reviews only when manually triggered.
2. **Reviewer:** add fresh read-only reviewer sessions and structured verdicts; do not steer or enforce yet.
3. **Steering:** inject attributed synthetic critiques and reassert unresolved findings through the context hook; deduplicate repeated findings.
4. **Transition gate:** add `workflow.request_transition` and integrate the existing ratchet's deterministic phase checks.
5. **Test lock:** add contract/test manifests, uniform edit denies, and shell-bypass probes.
6. **Fallback scheduling:** experiment with `experimental.schedules` for missed-checkpoint checks after event-driven review is reliable.

Each slice should remain usable independently so observation, judgment, steering, and enforcement can be evaluated separately.

## Acceptance experiments

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
- Schedules and some instruction/session APIs are experimental; keep the core gate independent of them.

## OpenCode V2 sources

- [Agents](https://opencode.ai/docs/agents/)
- [Commands — background child sessions](https://opencode.ai/docs/commands/#background)
- [Server plugins — sessions, events, hooks, permissions, and tools](https://opencode.ai/docs/build/plugins/server/)
- [Permissions](https://opencode.ai/docs/permissions/)
- [JavaScript client — event-stream behavior](https://opencode.ai/docs/build/client/#stream-events)
- [API and experimental Schedules API](https://opencode.ai/docs/api/)
