# Workflow supervisor — Phase 3 implementation contract

Status: implemented 2026-11-17. Amendment A2 to the Phase 2 locked tests is accepted: `steer` records `effectiveMode: "steer"`; `enforce` remains `advisory` until Phase 4. Amendment A3 is accepted 2026-11-18: reviewer sessions are archived after use. Session visibility (badge, panel, steering log) was added 2026-11-19 with its own unlocked suite, `supervision.test.ts`. The Phase 3 contract suite passes 24/24 tests. Amendments A4–A8 were independently reviewed and accepted 2026-11-21; the Phase 3.1 routing suite passed gate review (SUPPORTS_TRANSITION, no findings), is locked by hash below, and was implemented the same day — the locked suite passes 46/46 with no amendment. Amendments A9 (work-settled checkpoints) and A10 (builder read fence) were accepted and implemented 2026-11-22 from live steering evidence; A9 adds its own unlocked suite, `settle.test.ts`, and A10 amends the permission probe's contract as recorded below. Amendments A11 (live-delivery and visibility batch), A12 (wake on findings), A13 (follow-up scoping, wake frame, no-op review), A14 (severity-gated delivery) and A15 (no-op envelope cue) were implemented 2026-11-22 under user-granted auto mode with the lock ceremony waived by the user; their changes to the previously locked `steering.test.ts`, `routing.test.ts` and `contract.test.ts` are recorded below.

## Locked test baseline

- `steering.test.ts` — SHA-256 `65b26072ba69c4dc3e7de289a783341ee0462275c335794727ecf1eee17f43a5`
- `routing.test.ts` — SHA-256 `9aaca2b543b023721a391dfb5704259ccb485f5dc140cafc77c1549b0f117795` — locked 2026-11-21 after the Phase 3.1 gate review returned SUPPORTS_TRANSITION with no findings; any change requires a recorded amendment.

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

## Routing model (A4–A8)

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

## Amendments (A4–A8)

### A4 — one-turn influence window

Status: accepted 2026-11-21 after independent review.

- Original behavior: the `session.context` hook reasserts the unresolved
  report on every model call for the steered session until a later clean
  review clears it.
- Amended behavior: the unresolved report is active through exactly one
  user turn after delivery — the turn that consumes it — and demotes at the
  next prompt admission. Mechanism: a one-ride counter armed when steering
  delivers; each prompt admission consumes the ride, and the admission after
  that clears the unresolved state before the new turn's model calls. API
  basis: the prompt-admission signal is the documented
  `ctx.session.hook("prompt")` server-plugin hook (Hooks → Sessions →
  Prompt admission); implementation step 1 registers it and confirms it
  fires on prompt admission in the installed host, with a recorded
  amendment if it does not.
- Reason: a report that survives past the turn it was consumed with competes
  with every later user direction; an overnight pause compounds yesterday's
  snapshot into every model call of the next session.
- Scope: reassertion lifetime only. The report stays in the ledger and
  panel; the synthetic message, dedup, and the attempt limit are unchanged.

### A5 — visible escalation

Status: accepted 2026-11-21 after independent review.

- Original behavior: limit-reached returns an escalate decision that
  `index.ts` records with `console.warn` in the host log only.
- Amended behavior: limit-reached also emits a new `escalationRaised` RPC
  event carrying `{sessionID, checkpointID, attempts}`, and the TUI surfaces
  it as a toast naming the session, attempts, and latest checkpoint — the
  same toast pattern as `configurationError`. The event is separate from
  `stateUpdated`, whose schema is badge-shaped (`additionalProperties:
  false`, required `active`/`hasUnresolved`/`limit`) and cannot carry an
  escalation payload; recorded at gate review 2026-11-21 when the originally
  drafted `stateUpdated` carriage was found schema-incompatible.
- Reason: escalation is the user's cue to intercede — the absorbing state of
  the steering loop is the user, so the signal must reach the user, not the
  host log.
- Scope: notification surface only. The limit (3 distinct reports per
  session) is unchanged. The toast notifies the user in-TUI only — it is
  not a session-to-session relay, which stays excluded (Phase 5 scope).

### A6 — steering log as reviewer evidence

Status: accepted 2026-11-21 after independent review.

- Original behavior: each review is blind to previously delivered steering;
  a fresh reviewer re-litigates its own influence.
- Amended behavior: automatic evidence gains the observed session's
  `steering.jsonl` entries (delivered texts, timestamps, checkpoint IDs)
  whenever the state root is readable, and the reviewer instruction gains
  one obligation: findings that repeat previously delivered steering are
  reported as "previously steered, still unresolved" rather than as new.
  An unreadable state root omits the log and provenance records the
  omission — the same rule as the session-turn diff limitation. The
  steering log is context, not evidence identity: it does not feed the
  evidence hash, so a delivery on an otherwise unchanged tree still
  deduplicates, and the log reaches the reviewer on the next evidence
  change.
- Reason: the observed loop ran three consecutive reviews over one contract
  amendment; each revision reworded the findings so content-dedup never
  fired, and each fresh-context review manufactured fresh findings on its
  own influence. The log gives reviews a convergence path without breaking
  fresh-context discipline — it is evidence about the session, like the
  diff. Deliberate consequence: a reworded repeat still burns an attempt
  and escalates at the limit — a repeat means steering failed, and the
  user, not another review round, is the absorbing state (made visible by
  A5).
- Scope: evidence contents and reviewer instructions only. The coordinator's
  dedup and limit rules are unchanged.

### A7 — contract-file routing proxy

Status: accepted 2026-11-21 after independent review.

- Original behavior: every findings report in `steer` mode queues one
  attributed synthetic message to the builder.
- Amended behavior: if the checkpoint's working diff is nonempty and every
  file in it is the policy's `contract` file, the report routes to the user
  channel (ledger and reports on disk — the panel is an optional viewer, not
  the channel) and no synthetic message is queued; an empty
  or mixed diff queues as before — the routing rationale (user-authored
  shaping) applies only to actual contract-file edits. Path forms:
  `vcs.diff` returns worktree-relative files and the policy contract path
  is absolute (both verified from live checkpoint evidence), so the routing
  key normalizes each diff file against the worktree before comparison.
- Reason: findings about the artifact the user is actively shaping compete
  with the user's own authorship; findings about housekeeping and
  implementation artifacts are additive. The routing key is the diff's file
  set — deterministic and available before the review runs.
- Scope: routing only — the review still runs and records. Interim proxy
  until workflow-definition stage declarations (`driven`) exist; then
  superseded by layer 1 of the routing model.

### A8 — collab/delegate episode override

Status: accepted 2026-11-21 after independent review.

- New behavior: a user-held runtime per-session toggle, `collab`/`delegate`,
  following the auto-approve pattern — in-memory, badge-visible, dies with
  the TUI, never persisted to config.
- `collab` on: the session behaves user-driven regardless of stage — no
  per-turn automatic review (explicit checkpoints remain available and their
  findings route to the panel), no synthetic steering, no reassertion.
  Switching to `collab` is prospective: a message already queued still rides
  the next prompt — the user is present to override it — and any armed A4
  ride is disarmed.
- `delegate` (default): the stage's declared behavior; until stage
  declarations exist, the current per-turn review and queue-ride behavior.
- Manual-on; automatic-off at each stage transition once transitions exist
  (Phase 4). Until then the toggle is manual in both directions, and A4's
  one-turn window bounds the cost of forgetting.
- Reason: no deterministic signal distinguishes "the user stepped in" from
  absence or delegation; the only reliable signal is the user declaring it.
- Scope: routing and automatic-trigger suppression only. The builder can
  never flip the toggle — the same authority rule as the policy-file fence.

### A9 — work-settled checkpoints

Status: accepted and implemented 2026-11-22, from live steering evidence
(challenge log: "Verification evidence goes missing while work is still in
flight").

- Challenge: a turn can end while a background helper still runs the
  command a gate depends on; the checkpoint fired at turn end, evidence
  froze there, and the helper's output was never seen — so a gate review
  could not see the gate's own evidence.
- New behavior: an automatic checkpoint defers while the observed session
  has in-flight child sessions, and runs when the last child settles or a
  10-minute deadline passes. The deferred capture then sees the helper's
  posted result in the parent transcript. Explicit checkpoints run
  immediately; reviewer sessions are parentless and never block anything.
- Scope: trigger timing only. Deferral is in-memory and best-effort — a
  host restart mid-deferral simply skips that checkpoint; a helper that
  never settles is bounded by the deadline force-run. `settle.test.ts` is
  a new unlocked suite covering the pure tracking.

### A10 — builder reads denied on supervisor records

Status: accepted and implemented 2026-11-22, from live steering evidence
(challenge log: "Supervisor records are about the builder, not for the
builder").

- Challenge: asked about its own review status, the builder read the
  supervisor's internal records — past reports and attempt counts —
  because the fence blocked edits but not reads.
- New behavior: agent `read` on `.opencode/workflow-state/**` is denied
  globally; `workflow-reviewer` keeps access because its agent-level read
  allows load after global rules and win by last-match. The user's own
  reads are unaffected — user file access never passes through agent tool
  permissions. Escalated findings reach the user through the durable
  channel (reports on disk plus the escalation toast); the panel is an
  optional viewer, never the channel.
- Probe amendment: `permission-probe.ts` now also evaluates `read` for the
  build agent — the state path must deny and an unrelated file must allow.
  The phase-2 lock hash for the probe records the pre-A10 baseline and is
  superseded by this recorded amendment per the ledger convention.

### A11 — live-delivery and visibility batch

Status: accepted and implemented 2026-11-22 under user-granted auto mode;
the user waived the lock ceremony for this batch, and the previously locked
`steering.test.ts` / `routing.test.ts` were amended directly with the
changes recorded here.

- Re-arm on demonstrated progress: the budget counts repeat-carrying
  reports only — findings the reviewer marks "previously steered" burn an
  attempt; repeat-free findings deliver freely; a clean review fully
  re-arms (attempts and fingerprints cleared). Escalation fires only when
  the same finding returns unresolved past the limit. Amends the bounded /
  escalate tests to pin the repeat-based accounting.
- Delivered-review history surfaced in the reviewer envelope: count and
  latest checkpoint named up front; repeats must be marked, never presented
  as new.
- Reviewer fixed assignment and session-scoped evidence
  (`src/agents/workflow-reviewer.md`): the user request is a scope cue,
  never the question; meta-questions about the review process are noted,
  not adopted; environment claims are session-scoped observations —
  unknown, not wrong.
- Delivery-at-completion: findings deliver the moment the review completes
  — live into the running turn (`delivery: "steer"`) when the builder is
  active, queued behind a "findings waiting" badge marker when idle; the
  marker clears at prompt admission.
- Review-state visibility: the badge shows `reviewing` for the whole
  checkpoint including the reviewer run, then the verdict; the builder's
  standing context states the contract — every finished turn is reviewed,
  done claims are pre-review.
- User-held review-now trigger: the `ws-review` palette/slash command fires
  an explicit checkpoint for the focused session — no prompt spent, no
  agent in the loop; report-only by design.
- Friction incident log: `incidents.jsonl` records supervision health —
  findings queued into idle sessions, exhausted budgets, failed reviews,
  deadline-forced deferrals — for post-session sweeps.

### A12 — wake on findings

Status: accepted and implemented 2026-11-22; same user-granted auto-mode
batch as A11, lock ceremony waived.

The user's involvement model: present at the clean gate (review and
commit) and at escalation — nothing in between. An idle delegate-mode
session is woken (`resume: true`) the moment findings land, and the agent
works them autonomously; the next review judges the fix — clean resolves
with nothing burned, repeats burn toward escalation, which reaches the
user as one line. Collab mode never wakes: its findings route to the user
channel, because the user is the declared driver. The standing context
raises the done-bar to match: stage-complete is presented only after the
reviewer returns clean, or with the remaining findings named and why they
stand. Wakes are incident-logged for sweeps.

### A13 — follow-up scoping, wake frame, no-op review

Status: accepted and implemented 2026-11-22; same user-granted auto-mode
batch, lock ceremony waived.

From the first live wake loop (filament, 2026-11-22): seven full-scope
reviews in fifteen minutes, two of them 224s/244s re-audits minting new
findings each pass — a correction loop that discovered instead of
converging — plus two reviews of conversational no-op turns, and a woken
builder that conversed with the user instead of acting.

- Follow-up reviews: when the request under review is the supervisor's
  own delivered findings (marker: `Workflow supervisor follow-up`), the
  envelope pins the assignment — verify each previously delivered finding
  (resolved / unresolved / worsened), check the response's own changes,
  stop. No re-audit of unchanged ground; new findings beyond the
  response's changes belong to the next stage checkpoint, not this one.
  A genuine-fix re-review should run near the 52s shape observed once,
  not the 224s audit.
- Wake frame: the wake message declares who woke the builder and what
  kind of turn it is — fix, state what changed, end the turn; no
  questions to the user, no stage-complete claim; the response is
  re-reviewed automatically.
- No-op turns: a turn whose captured steps changed no files is judged
  on its claims alone — done-claims and gate claims — not the working
  tree.
- Standing-rule rulings (from the same loop): specified rules apply as
  written; builder non-compliance is a deviation, never an open rule
  question; a builder proposing to legalize its own bypass is itself a
  finding; exceptions originate only from the rule's owner, through
  config.

### A14 — severity gates delivery

Status: accepted and implemented 2026-11-22; same user-granted auto-mode
batch, lock ceremony waived.

From the second live wake loop (filament, RED gate, 2026-11-22): the
A13 follow-up scoping held for the first two reviews (68-75s, the
designed shape), but the next two still ran full depth (242s, 248s,
66k-122k input) and each verified the corrections while minting
minor-only findings — a missing coverage paragraph, an abridged raw
output — which woke the builder again. The user sat at the RED gate
unable to approve a moving target; a fifth review was starting when
they killed the session.

- Minor-only findings never steer, wake, burn the budget, or hold
  unresolved state: they are recorded in the checkpoint ledger for the
  gate decision (`action: "report"`, incident `minor_report_only`).
  Blocking and major findings keep the full delivery machinery. The
  gate must settle — an idle builder with nothing blocking or major
  outstanding is an approvable state, not a moving target.
- Severity markers are recognized in both plain and bold report forms
  (same drift lesson as the findings parser).
- The reviewer instruction pins the consequence: severity gates
  delivery, so severities must be marked accurately.
- Session hygiene correction (same batch): the reviewer-session archive
  call now sends the flat `archived: true` form the host honors — the
  nested `time.archived` body silently no-ops (verified empirically
  2026-11-22: every reviewer session since the 11-18 hygiene work stayed
  unarchived, which is what re-polluted the user's session list). Archive
  failures warn instead of vanishing; the straggler sessions were
  batch-archived the same day. Amends the A3 archive assertions in
  locked `contract.test.ts` tests 6 and 12 (original: the nested
  `{ sessionID, time: { archived: <number> } }` call shape; new:
  `{ sessionID, archived: true }`; reason: the original shape never
  reached the host's archive field). *Second correction, post-sweep:*
  the flat form ALSO no-ops through the plugin's session wrapper — the
  wrapper forwards whitelisted body keys only. The archive now probes
  the raw SDK client channel (`ctx.client.session.update`, flat body
  verbatim) when the context exposes one, falls back to the typed form,
  then GETs the record and logs the host's actual archive state,
  recording an incident when unverified. The mock models the SDK channel
  as an explicit A1-style assumption, confirmed live by the probe's
  channel log at the next reviewer run.

### A15 — no-op envelope cue

Status: accepted and implemented 2026-11-22; same user-granted auto-mode
batch, lock ceremony waived.

From the first post-A14 live run: a report-only turn (the user asked for
the RED gate report; the steps changed no files) still consumed a 243s,
89k-input review because the envelope never said it was a no-op — its
Changed-files line listed the whole working-tree diff, which reads like a
substantive review, and the reviewer had to reconstruct no-op-ness from
the events after already paying for the full evidence read.

- Mechanical no-op detection: the turn window starts at the last
  `execution.started` event; `step.ended` events carry each step's
  files. `turnChangedFiles` returns [] for a positively-established
  no-op turn, undefined for unknown — and unknown is never treated as
  no-op.
- The envelope marks the no-op with its assignment ("judge only the
  claims") and inlines the turn's claims (the latest assistant text),
  so the review verifies claims by spot-checking the tree instead of
  re-reading the evidence. A follow-up marker takes precedence when both
  apply.
- The reviewer instruction matches: a marked no-op turn is judged on its
  inlined claims only; a silent envelope means unknown and the review
  proceeds normally.

## Evidence changes

- Automatic evidence now records the latest assistant text from the observed session.
- Amendment A6: automatic evidence also carries the observed session's delivered steering log (`steering.jsonl`).
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

A4–A8 require a Phase 3.1 RED gate before implementation. The locked
suite pins no reassertion lifetime — `steering.test.ts` asserts only that
reassertion exists immediately after a steer, so the current
persists-until-clean-review lifetime is untested behavior and A4 amends no
locked test. The new routing suite (one-ride demotion, escalation event,
steering-log evidence, contract-file proxy, collab/delegate toggle) pins
that lifetime in both directions; its one-ride tests fake the
prompt-admission signal, which no current code path consumes (the context
hook at `index.ts` fires per model call with no lifetime state) but which
has a documented API basis (A4). Not unit-testable — pinned by inspection
and live runs instead: A5's `escalationRaised` RPC registration, emission
wiring, and TUI toast branch; A6's reviewer-instruction obligation in
`src/agents/workflow-reviewer.md`; A8's badge episode-mode display,
in-memory toggle lifetime, and absence of any builder-facing toggle
surface. The routing suite is the Phase 3.1 RED gate; lock follows the
gate review.

The Phase 2 suite remains locked except for amendment A2:

- Test 16 now expects `effectiveMode: "steer"` for `steer` and `"advisory"` for `enforce`.
- Test 17 now expects automatic evidence from a `steer` policy to record `effectiveMode: "steer"`.

## Non-goals

- No automatic remediation.
- No interruption based on reviewer prose.
- No deterministic phase gates.
- No session-to-session escalation relay; in-TUI user notification (proposed A5) is not a relay.
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
