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

In the TUI, supervised sessions show a `ws:<mode>` footer badge (with
steering attempts when unresolved findings exist). The latest review remains
visible as `review:<outcome> <checkpoint-id>` after the badge stops pulsing:
`clean`, `concerns`, `insufficient`, `supports`, `failed`, or `unknown`. The
marker is read from the durable checkpoint for that session and therefore
survives restarts; it reports the review, never grants a transition. Click the
badge or run `/ws` to open the supervisor panel: the reasserted context, the
steering texts delivered to the builder verbatim, recent checkpoints with
verdicts, and the latest report.

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
- `supervision.ts` — steering log, checkpoint summaries, and badge/panel state assembly.
- `ledger.ts` — checkpoint persistence.
- `rpc.ts` / `tui.tsx` — configuration-error surface, plus the footer badge
  and supervisor panel.

The reviewer's behavioral contract lives in `src/agents/workflow-reviewer.md`
and its read-only permission fence in `src/opencode.jsonc`.

## State on disk

- `.opencode/workflow-state/index.jsonl` — checkpoint ledger.
- `.opencode/workflow-state/steering.jsonl` — steering messages delivered,
  verbatim.
- `.opencode/workflow-state/checkpoints/<id>/` — `checkpoint.json`,
  `evidence.json`, `events.json`, and `report.md` per checkpoint.
- `.opencode/workflow-state/.gitignore` — self-ignores runtime state.

## Fragility notes

The badge and panel depend on surfaces where only some behavior is verified:

- `session.panel` render is **not reliably reactive** over store updates
  (verified live 2026-11-19: the panel sat at "Loading…" while the RPC
  returned correct state and the footer badge updated normally). The panel
  therefore prefetches its data and opens only after the fetch lands, so the
  first render is final. If a future OpenCode makes the slot reactive, the
  backstop fetch inside the render is harmless.
- `prompt.footer.status` render receiving a `sessionID` prop: the slot name is
  documented, the render props are not (same assumption the auto-approve
  badge makes).
- Mouse events in footer slot content: `onMouseDown` works in
  `sidebar.content` (probe-verified 2.3.0), but the footer variant is
  unverified. `/ws` or the palette command is the reliable opener.
- Panel scrolling for long report text is host-owned and unverified with
  long content; the report is capped at 20,000 characters and its file path
  is shown so the full text stays reachable.
- Only documented theme tokens are used (`theme.text.base`).

Every fetch, event, and failure is logged to
`~/.local/share/opencode/workflow-supervisor-debug.log` — read that before
assuming this part broke after an OpenCode upgrade.

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
