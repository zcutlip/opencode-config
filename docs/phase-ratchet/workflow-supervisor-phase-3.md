# Workflow supervisor — Phase 3 implementation contract

Status: implemented 2026-11-17. Amendment A2 to the Phase 2 locked tests is accepted: `steer` records `effectiveMode: "steer"`; `enforce` remains `advisory` until Phase 4. Amendment A3 is accepted 2026-11-18: reviewer sessions are archived after use. Session visibility (badge, panel, steering log) was added 2026-11-19 with its own unlocked suite, `supervision.test.ts`. The Phase 3 contract suite passes 24/24 tests. Amendments A4–A8 are proposed 2026-11-21 from the steering-loop diagnosis in a supervised spec-revision session; they are not yet reviewed, accepted, or locked.

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

## Routing model (proposed A4–A8)

Proposed 2026-11-21. Steering queues with `delivery: "queue"` and
`resume: false`, so a steering message is only ever consumed alongside the
user's next prompt — there is no autonomous stretch to steer into. Routing
decides what the builder sees on that prompt. Four layers, deterministic end
to end:

1. **Stage declaration** (deferred). Workflow-definition stage entries gain
   `driven: "user" | "agent"`. User-driven stages run no per-turn automatic
   review (explicit checkpoints only), route findings to the user channel,
   and keep the reassertion hook off; agent-driven stages keep the current
   queue-ride behavior. Blocked on adopting the workflow definition format.
2. **Episode override** (A8). A user-held runtime toggle, `collab` or
   `delegate`, overrides the stage default when the user steps into the
   work. The builder can never flip its own supervision routing.
3. **One-turn influence window** (A4). Whatever the first two layers miss
   is bounded: a delivered report rides exactly the next user prompt, and
   the reassertion hook demotes after that turn.
4. **Boundary review.** Episodes need no eavesdropping supervision; the
   next gate review compares the tree against the stage's exit evidence and
   catches the episode's residue — unrecorded decisions and scope drift.

Rejected alternatives: wall-clock presence inference (doorbell, night-off,
and deliberate handoff are indistinguishable, and consumption coincides with
the user's return anyway); prompt-content classification (puts a model read
inside the deterministic routing path); quiet-window timers (solve a mode
that does not exist until steering gains `resume: true` autonomous
continuation).

## Amendments (A4–A8, proposed)

### A4 — one-turn influence window

Status: proposed 2026-11-21; not yet accepted.

- Original behavior: the `session.context` hook reasserts the unresolved
  report on every model call for the steered session until a later clean
  review clears it.
- Amended behavior: the unresolved report is active through exactly one
  user turn after delivery — the turn that consumes it — and demotes at the
  next prompt admission. Mechanism: a one-ride counter armed when steering
  delivers; each prompt admission consumes the ride, and the admission after
  that clears the unresolved state before the new turn's model calls.
- Reason: a report that survives past the turn it was consumed with competes
  with every later user direction; an overnight pause compounds yesterday's
  snapshot into every model call of the next session.
- Scope: reassertion lifetime only. The report stays in the ledger and
  panel; the synthetic message, dedup, and the attempt limit are unchanged.

### A5 — visible escalation

Status: proposed 2026-11-21; not yet accepted.

- Original behavior: limit-reached returns an escalate decision that
  `index.ts` records with `console.warn` in the host log only.
- Amended behavior: limit-reached also emits the existing `stateUpdated` RPC
  event carrying an escalation payload, and the TUI surfaces it as a toast
  naming the session, attempts, and latest checkpoint.
- Reason: escalation is the user's cue to intercede — the absorbing state of
  the steering loop is the user, so the signal must reach the user, not the
  host log.
- Scope: notification surface only. The limit (3 distinct reports per
  session) is unchanged.

### A6 — steering log as reviewer evidence

Status: proposed 2026-11-21; not yet accepted.

- Original behavior: each review is blind to previously delivered steering;
  a fresh reviewer re-litigates its own influence.
- Amended behavior: automatic evidence gains the observed session's
  `steering.jsonl` entries (delivered texts, timestamps, checkpoint IDs)
  whenever the state root is readable, and the reviewer instruction gains
  one obligation: findings that repeat previously delivered steering are
  reported as "previously steered, still unresolved" rather than as new.
- Reason: the observed loop ran three consecutive reviews over one contract
  amendment; each revision reworded the findings so content-dedup never
  fired, and each fresh-context review manufactured fresh findings on its
  own influence. The log gives reviews a convergence path without breaking
  fresh-context discipline — it is evidence about the session, like the
  diff.
- Scope: evidence contents and reviewer instructions only. The coordinator's
  dedup and limit rules are unchanged.

### A7 — contract-file routing proxy

Status: proposed 2026-11-21; not yet accepted.

- Original behavior: every findings report in `steer` mode queues one
  attributed synthetic message to the builder.
- Amended behavior: if every file in the checkpoint's working diff is the
  policy's `contract` file, the report routes to the user channel (panel and
  ledger) and no synthetic message is queued; any other diff shape queues as
  before.
- Reason: findings about the artifact the user is actively shaping compete
  with the user's own authorship; findings about housekeeping and
  implementation artifacts are additive. The routing key is the diff's file
  set — deterministic and available before the review runs.
- Scope: routing only — the review still runs and records. Interim proxy
  until workflow-definition stage declarations (`driven`) exist; then
  superseded by layer 1 of the routing model.

### A8 — collab/delegate episode override

Status: proposed 2026-11-21; not yet accepted.

- New behavior: a user-held runtime per-session toggle, `collab`/`delegate`,
  following the auto-approve pattern — in-memory, badge-visible, dies with
  the TUI, never persisted to config.
- `collab` on: the session behaves user-driven regardless of stage — no
  per-turn automatic review (explicit checkpoints remain available and their
  findings route to the panel), no synthetic steering, no reassertion.
- `delegate` (default): the stage's declared behavior; until stage
  declarations exist, the current per-turn review and queue-ride behavior.
- Manual-on; automatic-off at each stage transition once transitions exist
  (Phase 4). Until then the toggle is manual in both directions, and A4's
  one-turn window bounds the cost of forgetting.
- Reason: no deterministic signal distinguishes "the user stepped in" from
  absence or delegation; the only reliable signal is the user declaring it.
- Scope: routing and automatic-trigger suppression only. The builder can
  never flip the toggle — the same authority rule as the policy-file fence.

## Evidence changes

- Automatic evidence now records the latest assistant text from the observed session.
- Proposed A6: automatic evidence also carries the observed session's delivered steering log (`steering.jsonl`).
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

A4–A8 require a Phase 3.1 RED gate before implementation: amendments to any locked test that asserts persistent reassertion, plus a new routing suite (one-ride demotion, escalation event, steering-log evidence, contract-file proxy, collab/delegate toggle). Those tests are written and locked only after A4–A8 are accepted.

The Phase 2 suite remains locked except for amendment A2:

- Test 16 now expects `effectiveMode: "steer"` for `steer` and `"advisory"` for `enforce`.
- Test 17 now expects automatic evidence from a `steer` policy to record `effectiveMode: "steer"`.

## Non-goals

- No automatic remediation.
- No interruption based on reviewer prose.
- No deterministic phase gates.
- No cross-session escalation UI.
- No change to the workflow policy schema.
- No wall-clock presence inference in routing.
- No prompt-content classification in the routing path.
- No `resume: true` autonomous wake.

## Session visibility

Added 2026-11-19. Rendering only — no review, steering, or evidence behavior changed. The locked Phase 2/3 tests are untouched; `supervision.test.ts` (6 tests) is a new unlocked suite.

- `prompt.footer.status` badge: `ws:<mode>` per session, with steering attempts appended when unresolved findings exist. Hidden when the project is not enabled.
- `session.panel` contribution `workflow-supervisor.state`: mode, contract path, the context-hook reassertion verbatim, the steering texts delivered to the builder verbatim, recent checkpoints with verdicts, and the latest report (capped at 20,000 characters for display).
- Openers: clicking the badge (mouse events in the footer slot are unverified — sidebar slot content is the verified precedent) or the palette/slash command `ws`.
- The `session.panel` slot render is not reactive over store updates (verified live 2026-11-19: the panel sat at "Loading…" while the RPC returned correct state and the footer badge updated normally). The panel therefore prefetches its data and opens only after the fetch lands, so the first render is final; `escape` and `q` close it, bound inside the panel contribution. TUI fetch and event outcomes log to `~/.local/share/opencode/workflow-supervisor-debug.log`.
- `steering.jsonl` (per worktree, beside `index.jsonl`): append-only record of every steering message actually delivered — session ID, checkpoint, verbatim text, attempt count, time.
- RPC: `supervisionBadge` (light, in-memory policy plus coordinator view), `supervisionState` (panel detail), and a `stateUpdated` event emitted after checkpoint completions so the badge stays live without polling.
- `SteeringCoordinator.view()` exposes attempts, limit, and unresolved state read-only for badge rendering.
