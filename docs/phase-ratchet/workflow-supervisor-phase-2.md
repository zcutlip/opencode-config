# Workflow supervisor — Phase 2 implementation contract

Status: revised proposal ready for user approval before tests and implementation. Two independent contract audits are incorporated; the parentless-reviewer host probe has passed and no plugin implementation exists.

Source: drafted 2026-11-15 from the agreed Phase 2 plan in `workflow-supervisor.md`, the Phase 1 experiments, an independent `workflow-reviewer` contract audit, official OpenCode documentation, and the installed OpenCode v2.3.0 OpenAPI schema and host probe below.

## Scope and authority

Build a globally installed server plugin that automatically observes only projects that opt into a non-off workflow mode. Phase 2 behavior is always passive advisory observation, regardless of the requested future mode.

The plugin may create evidence, review reports, ledger entries, and configuration-error notifications. It must not prompt or message the observed session, interrupt it, change its permissions or phase, or approve a transition. Steering, enforcement, schedules, automatic retries, and recovery after missed events remain later phases.

## Activation and policy schema

Main-repository policy: `.opencode/workflow.jsonc`. Per-worktree runtime state: `.opencode/workflow-state/`.

```jsonc
{
  "enabled": true,
  "mode": "advisory", // off | advisory | steer | enforce
  "workflow": "contract-tests-lock-verify",
  "version": 1, // policy schema version, not workflow progress
  "contract": "docs/sync-logging-spec.md", // active design, relative to the target worktree root
}
```

- Missing policy, `enabled: false`, or `mode: "off"` is inert: no event buffering, evidence, reviews, or runtime state.
- `advisory`, `steer`, and `enforce` all activate Phase 2 observation. Ledger entries record both `requestedMode` and `effectiveMode: "advisory"`; steering and gates are not silently claimed or downgraded.
- For an enabled non-off policy, require a nonempty `workflow`, integer `version: 1`, and a `contract` file relative to the target worktree root, resolved and contained within it. Reject unknown fields, invalid types, unsupported versions, absolute paths, and paths escaping the worktree.
- Off policies require no contract. A policy file with invalid JSONC or an invalid `enabled`/`mode` field is malformed, not off.
- Resolve the observed session's worktree and main repository with `git rev-parse`. Read policy from the main repository so worktrees share activation; read the contract and write state in the target worktree. Nested repositories are separate policy boundaries.
- The required `contract` field is necessary because a generic workflow name supplies no design baseline.

Add global agent edit denies for workflow policy and runtime-state paths in `src/opencode.jsonc`, and document them in `src/AGENTS.md`. Plugin writes do not pass through agent edit permissions. Broad shell remains the accepted cooperative-agent limitation; this is not an adversarial boundary.

## Configuration-error surface

Malformed policy, invalid contract paths, and repository-resolution failures produce:

- a deduplicated RPC `configurationError` event from the server part
- a TUI toast in windows subscribed to the matching location
- a host-log entry
- an `errors.jsonl` entry when the worktree state root is resolvable

Deduplicate notifications by policy-content/error fingerprint until the input changes. Configuration errors never invoke a reviewer. If repository resolution fails before a state root exists, the toast and host log are the diagnostic record. RPC events are live; with no connected TUI, the host log and any resolvable error ledger remain.

No toast or RPC event carries review findings or steers a builder.

## Event ownership and deduplication

Each location instance subscribes to execution, step, and tool events. It handles an event only when the observed session's canonical location equals that instance's canonical location; path-prefix matching is not ownership.

Automatic completion reviews are limited to top-level sessions. Child sessions inherit the policy boundary but do not each trigger an automatic review. An explicit checkpoint always targets the calling tool-context session, so a child session targets itself; the input schema has no session selector. Exclude `workflow-reviewer` and plugin-created review sessions.

Compute an evidence hash from the contract content, current status and diffs, latest user request, and explicit phase/transition input—never from the growing event buffer or timestamps. The persistent checkpoint key is `(observed session ID, trigger kind, evidence hash)`.

Derive the checkpoint directory name deterministically as `cp-<sha256(observed session ID + NUL + trigger kind + NUL + evidence hash)>`; timestamps and UUIDs are not valid claim IDs. Claim that key with atomic checkpoint-directory creation before creating a reviewer. A duplicate event, another location instance, or a plugin reload finds the existing claim at the same path and creates no second reviewer. Serialize new evidence capture per observed session. Failed claims are not automatically retried in Phase 2.

## Evidence

Automatic execution-completion checkpoints collect:

- observed session ID, agent, canonical location, and latest user request
- the session-turn structured diff
- the current working-tree VCS diff and status
- ordered execution, step, and tool events buffered for that session
- active contract content and path, policy version, requested/effective modes, and evidence provenance

An explicit `workflow.checkpoint` collects the current working-tree VCS diff and status. Its optional input is limited to current phase and requested transition with `additionalProperties: false`; it accepts no session selector, reviewer checklist, or method.

Write raw evidence under the checkpoint's project-local state directory. Do not run tests automatically. Existing test claims retain provenance; missing fresh test evidence remains missing.

A truncated current working-tree diff blocks reviewer invocation. A truncated session-turn diff or event-buffer gap is marked and prevents turn-scoped or chronological claims, but does not block review when the complete current VCS diff is available. Evidence-capture failures are failed checkpoints, not empty evidence.

## Independent reviewer

- Create a fresh session at the observed session's location with `agent: "workflow-reviewer"` and **no `parentID`**.
- Use field one exactly as `User request: none — automatic execution-completion checkpoint; no transition requested.` for automatic triggers. Put trigger details in Provenance. Explicit checkpoints identify the explicit request without inventing a user instruction.
- Send only the four-field envelope: request/source, `checkpoint` mode, raw project-local evidence, and provenance.
- Wait for the reviewer agent loop with `session.wait`, then inspect its outcome and final assistant text. An empty report, failed outcome, or five-minute timeout is a failed checkpoint. On timeout, interrupt only the reviewer session.
- Save the report and record reviewer session ID, tokens, cost, and elapsed time. Keep transcripts for inspection and exclude them from automatic review.

The plugin never prompts, messages, interrupts, or updates permissions on the observed session. Reviewer failures produce no builder message or phase decision.

## Ledger layout

```text
<worktree>/.opencode/workflow-state/
  .gitignore
  checkpoints/<checkpoint-id>/
    checkpoint.json
    evidence.json
    events.json
    report.md
  index.jsonl
  errors.jsonl
```

The state `.gitignore` ignores the entire runtime directory. `checkpoint.json` is the persistent claim and records trigger, observed/reviewer sessions, policy and contract provenance, evidence hash and completeness, timestamps, status, deduplication outcome, requested/effective modes, and reviewer usage. `report.md` is present only when a report arrives. `index.jsonl` contains append-only summaries.

The explicit checkpoint tool returns only a checkpoint ID and state path, or `disabled`/a configuration error for an inactive or invalid policy. It never returns findings. Automatic checkpoints produce no builder-visible message.

## Implementation and harness

- `src/plugins/workflow-supervisor/index.ts` — lifecycle and event subscription
- `policy.ts` — JSONC parsing, validation, repository/worktree resolution
- `observer.ts` — ownership, admission, atomic claims, queues, event buffers
- `evidence.ts` — session/VCS evidence and completeness checks
- `reviewer.ts` — independent reviewer lifecycle, timeout, report extraction
- `ledger.ts` — state persistence and diagnostics
- `rpc.ts` / `tui.tsx` — configuration-error notifications only
- `*.test.ts` — pure-module tests with injected clients, clocks, and filesystem boundaries

Use host-provided `@opencode/plugin` and runtime built-ins, with no bundled runtime dependency or package installation. Use the archived `bun:test` precedent without restoring the V1 plugin or its dependencies.

Run contract tests with `bun test src/plugins/workflow-supervisor` through the test subagent. Parse-check with `./scripts/ts-parse.ts src/plugins/workflow-supervisor`. Update root `AGENTS.md` with the test command and `src/plugins/AGENTS.md` with the live plugin architecture.

## Contract tests before implementation

1. Missing/off policies cause no event buffering, evidence or state writes, reviewer creation, or error notification; only session/location and policy discovery reads occur.
2. Project A activation never creates evidence, reviews, or notifications in Project B.
3. Two canonical-location instances claiming the same event concurrently derive the same deterministic checkpoint path, but atomic claiming produces one checkpoint and reviewer; nested locations do not share ownership.
4. Invalid JSONC, unsupported modes/versions, invalid contracts, and repository failures produce the specified visible/persisted diagnostics and no reviewer; off produces none.
5. Reviewer creation uses the target location and `workflow-reviewer` with no `parentID`; the real-host probe below is cited, not replaced by a mock.
6. Across every scenario, spies record zero prompt, synthetic-message, interrupt, permission-update, or phase-transition calls targeting the observed session.
7. Reviewer and child-session completions cause no recursive automatic review.
8. Unchanged evidence is deduplicated across events and reloads; concurrent new evidence for one session is serialized.
9. Truncated working diffs block review; truncated turn diffs and event gaps prohibit the corresponding claims as specified.
10. Explicit checkpoints use working-tree evidence and return no findings; explicit requests in off projects return `disabled` with no side effects.
11. Worktrees share main-repository policy but write separate state; nested repositories resolve independently.
12. Reviewer failure and timeout persist failed checkpoints; timeout interrupts only the reviewer.
13. The runtime state directory is absent from `git status` after initialization.
14. Configuration notifications are location-filtered and fingerprint-deduplicated; no notification contains findings.
15. Agent edit probes deny workflow policy and runtime-state modifications without changing unrelated project files.
16. `steer` and `enforce` policies each produce an observation checkpoint whose `checkpoint.json` records the actual `requestedMode` and `effectiveMode: "advisory"`.
17. Automatic `evidence.json` contains the session-turn diff, current working-tree diff and status, contract content and path, requested/effective modes, and complete evidence provenance.
18. A completed checkpoint records the reviewer session ID, tokens, cost, and elapsed time.
19. An explicit checkpoint in a child session targets the calling tool-context session, and session-selector/checklist input is rejected by the schema.

After these tests and the real integration checks pass, validate 10–20 real advisory checkpoints and record actionable findings, false positives, duplicates, missed deviations, latency, and token use before considering Phase 3.

## Completed pre-lock host probe

On OpenCode v2.3.0, two independent sessions were created in this repository:

- observed: `ses_e1d6fe296ffeZLK7zT54rSAfp9`
- reviewer: `ses_e1d6fe063ffeK6sCdIK1AuPDFV`

The reviewer was created with `agent: "workflow-reviewer"` and no parent, received the minimal envelope through `session.prompt`, and reached `outcome: "succeeded"` after `session.wait` returned. It produced final assistant text in 9.157 seconds using 189 output and 797 reasoning tokens. Its recorded `parentID` is null. The observed session's message list and inbox both remained empty.

This verifies the required parentless lifecycle and absence of automatic builder report delivery on the installed host. It does not verify plugin event ownership, evidence collection, deduplication, timeout handling, or review quality.
