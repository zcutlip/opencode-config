# workflow-supervisor

Passive workflow checkpoints backed by an independent reviewer. The plugin is
globally installed but inert until a project opts in, and it never edits code,
runs tests, or advances a phase.

## Usage

Enable the workflow in a project by adding `.opencode/workflow.jsonc` at the
repository root:

```jsonc
{
  "enabled": true,
  "mode": "advisory", // off | advisory | steer | enforce
  "workflow": "contract-tests-lock-verify",
  "version": 1,
  "contract": "docs/sync-logging-spec.md",
}
```

- Missing policy, `enabled: false`, or `mode: "off"` is inert.
- `advisory` observes completed turns and writes review reports only.
- `steer` additionally delivers findings to the builder and reasserts them on
  later model calls.
- `enforce` is reserved for Phase 4 deterministic gates; it currently records
  advisory behavior.

Automatic checkpoints fire on every `session.execution.succeeded` in an
enabled project. Explicit checkpoints are available through the `checkpoint`
tool in the `workflow` namespace; the tool returns a checkpoint ID and state
path, not the report itself.

## Semantics

- **Per-project opt-in.** Policy is read from the main repository so worktrees
  share activation; runtime state is written per worktree. Nested repositories
  are separate policy boundaries.
- **Independent reviewer.** The plugin creates a fresh `workflow-reviewer`
  session with no parent, so a review never wakes or reports back to the
  builder. The reviewer is hidden from agent pickers, read-only, and its
  sessions are archived after the report is written or the run fails — they
  stay out of the TUI session list while remaining retrievable by ID or
  `archived=true`.
- **Attributed steering.** In `steer` mode, findings reach the builder as
  synthetic messages with supervisor metadata, not disguised user input.
  Identical reports are deduplicated, steering is bounded per session, and the
  coordinator escalates rather than looping after the limit.
- **Fail-closed configuration.** Malformed policy or an invalid contract path
  produces a TUI toast, a host-log entry, an RPC event, and an `errors.jsonl`
  entry when the state root resolves. Configuration errors never invoke a
  reviewer.
- **Recursion prevention.** Reviewer, plugin-review, and child sessions are
  excluded from automatic review.

## How it works

- `index.ts` — plugin entry; subscribes to execution events, creates reviewer
  sessions, and wires steering.
- `observer.ts` — checkpoint lifecycle, dedup, and event buffering.
- `policy.ts` — policy resolution and validation.
- `evidence.ts` — evidence capture (working diff, status, request, events).
- `reviewer.ts` — independent reviewer session creation and archiving.
- `steering.ts` — steering coordinator and dedup.
- `ledger.ts` — checkpoint persistence.
- `rpc.ts` / `tui.tsx` — configuration-error surface.

The reviewer's behavioral contract lives in `src/agents/workflow-reviewer.md`
and its read-only permission fence in `src/opencode.jsonc`.

## State on disk

- `.opencode/workflow-state/index.jsonl` — checkpoint ledger.
- `.opencode/workflow-state/checkpoints/<id>/` — `checkpoint.json`,
  `evidence.json`, `events.json`, and `report.md` per checkpoint.
- `.opencode/workflow-state/.gitignore` — self-ignores runtime state.

## Limits

- No deterministic phase gates yet; reviewer verdicts are advisory.
- The session-turn diff is unavailable because the plugin context exposes no
  `session.diff`; the working-tree diff is authoritative.
- The event stream is live-only, with no replay or automatic reconnection.
- The reviewer's report is evidence, not approval.

## Tests

- `bun test src/plugins/workflow-supervisor` — contract and steering suites.
- `bun src/plugins/workflow-supervisor/permission-probe.ts` — live probe that
  the workflow policy and runtime-state paths are edit-denied.

## Docs

- `docs/phase-ratchet/workflow-supervisor.md` — overall plan and phase status.
- `docs/phase-ratchet/workflow-supervisor-phase-2.md` — observation contract.
- `docs/phase-ratchet/workflow-supervisor-phase-3.md` — steering contract.
