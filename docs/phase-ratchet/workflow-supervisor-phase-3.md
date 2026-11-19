# Workflow supervisor — Phase 3 implementation contract

Status: implemented 2026-11-17. Amendment A2 to the Phase 2 locked tests is accepted: `steer` records `effectiveMode: "steer"`; `enforce` remains `advisory` until Phase 4. Amendment A3 is accepted 2026-11-18: reviewer sessions are archived after use. The Phase 3 contract suite passes 24/24 tests.

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
