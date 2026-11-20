# Workflow supervisor — Phase 3 implementation contract

Status: implemented 2026-11-17. Amendment A2 to the Phase 2 locked tests is accepted: `steer` records `effectiveMode: "steer"`; `enforce` remains `advisory` until Phase 4. Amendment A3 is accepted 2026-11-18: reviewer sessions are archived after use. Session visibility (badge, panel, steering log) was added 2026-11-19 with its own unlocked suite, `supervision.test.ts`. The Phase 3 contract suite passes 24/24 tests.

## Locked test baseline

- `steering.test.ts` — SHA-256 `65b26072ba69c4dc3e7de289a783341ee0462275c335794727ecf1eee17f43a5`

## Scope

Phase 3 adds automatic soft steering for projects whose policy requests `steer` or `enforce`:

- `requestedMode: "steer"` records `effectiveMode: "steer"`.
- `requestedMode: "enforce"` still records `effectiveMode: "advisory"` until deterministic gates exist in Phase 4.
- A completed automatic checkpoint with findings sends one attributed synthetic message to the observed session.
- The message uses `delivery: "queue"` and `resume: false`, so it waits for the next turn instead of waking an idle builder.
- A `session.context` hook reasserts the active contract and the latest unresolved findings on every model call for a steered session.
- Findings are deduplicated by report content.
- Steering attempts are bounded per session; after the limit, no further synthetic messages are sent and the coordinator returns an escalation decision.
- Explicit checkpoints remain report-only; they do not steer.
- The reviewer gets a `NOT_REQUESTED` verdict for checkpoints with no requested transition, so clean no-transition checkpoints no longer force a transition verdict.
- `workflow-reviewer` is registered as a hidden agent, so it never appears in agent pickers.
- Reviewer sessions are archived through `session.update` after the report is written or the run fails; archived sessions stay out of the TUI session list while remaining retrievable by ID.

## Evidence changes

- Automatic evidence now records the latest assistant text from the observed session.
- Automatic reviewer envelopes surface the observed session’s latest user request verbatim and a one-line changed-files summary, so the reviewer receives the same scope cue as a manual checkpoint instead of an open-ended audit brief.
- The session-turn diff remains unavailable because the installed plugin context exposes no `session.diff`; provenance records that limitation.
- The working-tree diff and status remain the authoritative change-set evidence.

## Tests

`steering.test.ts` owns the Phase 3 contract:

1. `advisory` never steers.
2. Reports without findings never steer.
3. A `CONCERNS` report steers once with attributed text that contains the reviewer report.
4. Identical reports are deduplicated.
5. Distinct reports are bounded, then escalate.
6. Verdict extraction and finding detection are independent.

The Phase 2 suite remains locked except for amendment A2:

- Test 16 now expects `effectiveMode: "steer"` for `steer` and `"advisory"` for `enforce`.
- Test 17 now expects automatic evidence from a `steer` policy to record `effectiveMode: "steer"`.

## Non-goals

- No automatic remediation.
- No interruption based on reviewer prose.
- No deterministic phase gates.
- No cross-session escalation UI.
- No change to the workflow policy schema.

## Session visibility

Added 2026-11-19. Rendering only — no review, steering, or evidence behavior changed. The locked Phase 2/3 tests are untouched; `supervision.test.ts` (6 tests) is a new unlocked suite.

- `prompt.footer.status` badge: `ws:<mode>` per session, with steering attempts appended when unresolved findings exist. Hidden when the project is not enabled.
- `session.panel` contribution `workflow-supervisor.state`: mode, contract path, the context-hook reassertion verbatim, the steering texts delivered to the builder verbatim, recent checkpoints with verdicts, and the latest report (capped at 20,000 characters for display).
- Openers: clicking the badge (mouse events in the footer slot are unverified — sidebar slot content is the verified precedent) or the palette/slash command `ws`.
- The `session.panel` slot render is not reactive over store updates (verified live 2026-11-19: the panel sat at "Loading…" while the RPC returned correct state and the footer badge updated normally). The panel therefore prefetches its data and opens only after the fetch lands, so the first render is final; `escape` and `q` close it, bound inside the panel contribution. TUI fetch and event outcomes log to `~/.local/share/opencode/workflow-supervisor-debug.log`.
- `supervision.jsonl` (per worktree, beside `index.jsonl`): append-only record of every steering message actually delivered — session ID, checkpoint, verbatim text, attempt count, time.
- RPC: `supervisionBadge` (light, in-memory policy plus coordinator view), `supervisionState` (panel detail), and a `stateUpdated` event emitted after checkpoint completions so the badge stays live without polling.
- `SteeringCoordinator.view()` exposes attempts, limit, and unresolved state read-only for badge rendering.
