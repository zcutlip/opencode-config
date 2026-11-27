# Workflow supervisor — challenge log

Problems surfaced while building and iterating. Each entry: the challenge,
then the resolution that worked, or the open status and direction. Written to
transfer — no harness names, no file formats, no API paths; builder,
reviewer, supervisor, user only.

## Resolved

**The reviewer becomes a second driver.** While the user actively shapes a
design document with the builder, the reviewer fired after every turn and
sent findings to the builder, competing with the user's own direction.
*Resolution:* a review rides at most one turn of influence, then steps back;
a user-held "I'm driving" override pauses per-turn review entirely and
routes any findings to the user alone. Influence yields to presence.

**Correction loops with no natural end.** Each review produced
freshly-worded findings, so repetition never deduplicated; the builder
revised per findings, and the next review judged the revision. *Resolution:*
repeats are surfaced as repeats, attempts are bounded, and when attempts run
out the user is notified — the loop never continues quietly. The user is the
only reliable end-state for a correction loop; the system's job is to keep it
bounded and visible until the user ends it.

**The reviewer as an expensive generalist.** Given no specific question, the
reviewer treated each checkpoint as an open-ended audit — minutes long and
burning budget. *Resolution:* every review receives the user's actual
request and the changed-file list, and the reviewer owns a stopping rule:
classify every applicable requirement, then stop. Cost is controlled by
scope, not by clocks.

**Internal sessions flooding the user's workspace.** Every review created a
session in the user's list, burying their own work. *Resolution:* reviewer
sessions are hidden from the session list and archived after use —
invisible day-to-day, retrievable for audit. *Correction:* the archive
never actually landed — the call's nested body form was silently ignored
by the host, and the swallowed error hid that for days; the unit test
proved the call was made, not that the host obeyed it. A cleanup action
whose failure mode is silent must be verified against the host's
observable state, not against the call being made. The working form was
found empirically and failures now warn instead of vanishing. *Second
correction, same day:* the empirically-working REST form ALSO no-ops
through the plugin's session wrapper — the wrapper forwards whitelisted
body keys only, and the flat `archived` key is not among them, while the
typed `time.archived` key reaches a server that ignores it. Both known
call forms dead-letter. The plugin now probes the raw SDK client channel
when the context exposes one, falls back to the typed form, GETs the
record afterwards, and logs the host's actual archive state — recording
an incident when unverified.

**Verification evidence goes missing while work is still in flight.** A turn
can end while a background helper is still running the very command the gate
depends on; the checkpoint fires at turn end, the evidence freezes there,
and the helper's output lives where the supervisor deliberately does not
look. *Resolution:* checkpoints defer while helpers are in flight and run
when they settle (a deadline bounds a helper that never does), so the
capture sees the helper's posted result. *Correction, from the user's
account:* a real deferral ran ten minutes with the badge showing
"reviewing" while the actual state was a helper blocked on a permission
prompt the user had not answered — a user-input wait presented as reviewer
activity — and when the deadline forced the checkpoint anyway, the review
ran without the gate's central evidence and filed the builder's honest
claim as "no captured run." Two defects, not one: an input wait must be
named to the user who can end it, never absorbed by a timer; and a forced
capture must record why its evidence is absent rather than review a hollow
gate. The corrected design lands in the A16 contract.

**Supervisor records are about the builder, not for the builder.** Asked
about its own review status, the builder rummaged through the supervisor's
internal records — past reports, attempt counts. Nothing denied it: the
fence blocked edits, not reads. *Resolution:* builder reads on the
supervisor's records are denied; the reviewer keeps access through its own
allow rules. Feedback reaches the builder only through delivered messages;
escalated findings reach the user through the durable record and the
notification, never through a convenience viewer. Questions about the
review system are for the user, not for the builder to investigate.

**Steering has no re-arm lever.** The budget counted distinct reports, so
rapid iteration burned it in minutes; afterwards the builder heard nothing
— even about brand-new findings, even after resolving everything — and the
user's only channel back was relaying findings by hand, reading the report
and becoming its courier. *Resolution:* the budget counts repeat-carrying
reports only — findings the reviewer marks "previously steered" burn an
attempt; repeat-free findings deliver freely as progress or new
information; a clean review fully re-arms. Escalation fires only when the
same finding returns unresolved past the limit, and what reaches the user
is one line, never a novel. The user is the gate authority, never the
report reader.

**Delivered-review history must be first-class, not excavated.** The
history of reviews already delivered to a session was captured in the
reviewer's evidence, yet a fresh reviewer claimed no review had ever been
delivered and re-presented the same findings as new. *Resolution:* the
assignment names the history up front — count and latest delivery in the
envelope itself — and repeats must be reported as repeats, never as new.

**A user question about the review process is not the review's assignment.**
When the user asked the builder whether a review had arrived, that question
became the checkpoint's user-request cue, and the reviewer answered the
meta-question instead of reviewing the turn's work. *Resolution:* the
reviewer's assignment is fixed — judge this checkpoint's changes against
the agreement. The user request is a scope cue, never the question;
meta-questions are noted in one line, never adopted.

**Evidence is blind to anything done outside agent sessions.** The
supervisor sees only what happened inside the sessions it watches; anything
the user does outside them never enters the evidence, so a reviewer can
assert stale facts about the environment with full confidence. *Resolution:*
the reviewer treats environment claims as session-scoped observations —
what the user may have changed outside sessions is unknown, not wrong, and
no environment fact is reported as current without in-session evidence.

**The user has no direct review trigger.** Every checkpoint fired either
automatically at turn end or through the agent's own explicit-request tool;
a user who wanted a fresh review of an idle tree had to spend a throwaway
prompt to make the agent run one. *Resolution:* a user-held review-now
command on the focused session — same checkpoint machinery, no prompt spent,
no agent in the loop, fire-and-forget with the verdict landing on disk.

**A completed review must have a delivery guarantee.** The pipeline
generated verdicts eagerly, but delivery had none: once the correction
budget died, completed reviews piled up behind the read fence with no path
to the builder, and the reflex on offer was to trigger another review
instead of delivering the one already finished. Generation is not
delivery. *Resolution:* findings deliver the moment the review completes —
live into the running turn when the builder is active, queued behind a
visible "findings waiting" marker when idle. The budget gates repetition,
never delivery.

**Pending findings must not wait on the user's next prompt.** Delivery
queued until the user spoke; an idle builder with findings waiting stayed
idle, and nothing told the user a nudge was needed. *Resolution:*
delivery-at-completion (previous entry) plus the waiting marker — the
builder is live-delivered when active. An idle delegate-mode builder is
woken to act on its findings the moment they land: the deferral ended
when the repeat-based budget made the wake-loop bounded — fix the
findings and the next review goes clean; repeat them and the budget burns
to escalation. Collab never wakes; its findings belong to the user.

**Hide the sessions, not the activity.** Reviewer sessions were hidden to
stop workspace flooding — right call — but the activity itself became
invisible too: during the minutes-long review window, neither the user nor
the builder could tell a review was running, so silence read as clean and
done-claims read as vetted. *Resolution:* the review state is a first-class
badge signal — reviewing, then the verdict — and the builder's standing
context states the contract: every finished turn is reviewed
asynchronously, done claims are pre-review, findings arrive with the next
prompt. The plumbing stays hidden; the process never is.

**The development loop inherited the courier pathology.** Dogfooding
surfaced friction one incident at a time, each costing the user a
description turn — while the evidence of every incident already sat in the
supervisor's own state. *Resolution:* the supervisor records its own
pathologies — findings queued into idle sessions, exhausted budgets, failed
reviews, deadline-forced deferrals — to an incident log; after a work
session, one word sweeps the evidence instead of the user narrating it.

**Supervision ends when the work ends.** After the user took the final
gate — ran the suite themselves, cut the release — a review still flagged
their out-of-band verification as an unresolved defect ("no captured
run"): the supervisor auditing its principal's own closing ritual.
Claim-integrity findings exist for builder-asserted results during
supervised stages, not for facts the user verified personally once the
work left the supervised window. *Resolution:* the reviewer treats
out-of-band user verification as recorded fact and stops raising it; the
user's wrap-up turns run under the "I'm driving" override, which suspends
per-turn review entirely. *Direction:* structurally, the stage model ends
supervision at the finish gate — no checkpoint fires for work the user
has taken over.

**Severity keys to consequence, not class.** A false state-claim to the
user — "commit the docs set" with nothing to stage, self-correcting in
seconds — was filed as major because claim integrity is a sensitive
dimension and the finding repeated; the reviewer's instructions named
three severity tiers without ever defining them. Severity is the user's
attention-rationing signal — inflation makes major mean less, which
degrades the channel exactly when it matters. *Resolution:* a
consequence-keyed rubric — blocking is a wrongly-granted gate or a
violated lock; major misleads a gate decision or forces rework; minor is
everything else. A benign instance of a dangerous behavior pattern is
minor unless it could mislead a gate.

**Builder non-compliance is not a rule referendum.** The reviewer's
correction for a repeatedly bypassed delegation rule asked the user to
"decide the mechanism" — run the gate command directly or keep
delegation — after the builder itself proposed the direct-run option as
an exception. The effect: a compliance failure became a rule
negotiation, with the violator's preferred outcome on the menu.
*Resolution:* specified rules apply as written. A builder ignoring a
rule produces a deviation finding, never an open question, and a builder
proposing to legalize its own bypass is itself a finding. Exceptions
originate only from the rule's owner, through config — never
mid-review, never at the builder's initiative.

**A correction loop must not mint new work.** Each re-review after a
delivered finding re-audited the entire stage and surfaced fresh
findings — and new findings cost no budget, so fix-one-get-two ran
unbounded: seven full-scope reviews in fifteen minutes, the heaviest
two minting new findings that guaranteed another cycle. The correction
loop exists to converge, not to discover. *Resolution:* a follow-up
review is scoped by construction — verify the previously delivered
findings (resolved, unresolved, worsened), check the response's own
changes, stop. Findings beyond the response's changes belong to the
next stage checkpoint. A turn that changed nothing is judged on its
claims alone.

**The gate must settle.** A correction loop fired over prose — the
builder's gate report lacked a coverage paragraph — waking it again
and again while the user tried to review the gate; the tree kept
moving, reviews kept running, and the gate could never be approved.
Findings worthy of interrupting are findings that change the gate
decision: severities exist precisely to ration attention, and delivery
had never consulted them. *Resolution:* severity gates delivery —
blocking and major findings wake the builder and steer; minor findings
are recorded for the gate decision and never interrupt anyone. The
loop's absorbing state is: idle builder, nothing blocking or major
outstanding, verdict on record — an approvable gate, whatever minors
remain.

**A woken builder needs to know who woke it.** Delivered findings
arrived as an unattributed request, so the builder treated the wake as
a conversation — asking the user questions, proposing rulings, leaving
questions the user had to interpret. The user was drafted as interpreter
between builder and reviewer, the exact job the system exists to delete.
*Resolution:* the wake message carries its frame: a supervisor-driven
correction turn — fix, state what changed, end the turn, no questions to
the user, no stage-complete claim; the response is re-reviewed
automatically.

**Prose-signal parsers must tolerate the producer's drift.** A CONCERNS
report with bold section markers evaded findings detection and
dead-lettered silently — no delivery, no marker, no incident — while the
verdict parser a few lines away already accepted bold. Half the parsing
tolerated the reviewer's formatting drift; half did not, and the sweep
caught the gap only because a finding failed to arrive. *Resolution:*
findings detection accepts the same bold and plain variants the verdict
parser does, with regression tests pinning both forms. *Second incident,
same day:* a markdown-heading report (`## Findings`) dead-lettered a
major while re-arming the budget — decoration drift is not a one-off,
it is a class. *Final resolution:* all prose-signal parsing runs on a
normalized copy (heading markers and bold stripped), verdict values are
whitelisted rather than pattern-matched, and the regression test drives
the full delivery decision, not just the parser. Deeper lesson
unchanged: the more the supervisor depends on reading reviewer prose, the
more the report needs a machine-readable header.

**Supervision must fit how the user actually works, including concurrent
sessions in one project.** The user deliberately keeps multiple sessions
in one working folder — a work session plus utility sessions such as an
out-of-band commit agent — and every one of them consumed full reviews
per turn, including the utility sessions that were never meant to be
supervised. Worse, a wake could put an idle session to work on the
shared tree while another session was mid-turn in it: two actors, one
set of uncommitted files. The user's own workaround — flipping the
"collab" override on utility sessions each time — was exactly the
babysitting this system exists to remove. *Resolution (A16 contract):*
utility turns are recognized mechanically — a turn that wrote no files
and ran only git-family commands is a chore and skips review; wakes
respect an active folder; a user-held per-session mute lever and
optional per-project title patterns cover the remainder. The unit of
supervision stays the session; the unit of courtesy is what the turn
actually did.

**Claims submitted to a gate review must be reconciled against the
tree.** Twice in one day the reconciliation failed in opposite
directions: a sweep summary called the reviewer model free when the
config pins a paid one (caught by the user), and a test-count breakdown
was asserted as corrected while the file's header still carried the old
numbers (caught by the gate review). The review mechanism working as
designed is the point: a gate verifies against declared interfaces and
captured evidence, never against the narrative accompanying it. The
cost of a sloppy claim is an extra review round; the cost of no review
is a lock on a fiction.

**The observer can die on its first event while everything looks alive.**
The dispatch path threw on every turn-end event, killing the
subscription — but on-demand check-ins take a different path, so they
kept working and nothing looked wrong. The green suite never called
what the runtime path calls, so it stayed green over a dead system.
*Resolution:* the throw was a state object whose internal store and
public listing shared one name, resolved to the store in the
implementation language — renamed, and the listing the dispatcher
calls is now called by the suite. *Lessons that transfer:* guard the
dispatch path so one bad turn can never silence all future turns, and
verify health by the full loop firing — an automatic checkpoint
landing — never by inspection or unit tests alone. (Same outage
confirmed a second silent drop: a host may ignore event subscriptions
it does not declare — never assume delivery, check the host's own
warning channel.)

**The gate has a readable door.** The user holding the grant had no
surface saying what the latest review concluded — transient badge, beta
panel, silence by design, reports on disk. *Resolution (A18):* the
footer badge retains the latest completed or failed review for that
session as `review:<outcome> <checkpoint-id>` — clean, concerns,
insufficient, supports, failed, or unknown — read from the durable
checkpoint, surviving restarts, other sessions filtered out. It reports
the verdict; it never grants a transition. Verified by suite plus a live
host read, with the user confirming the footer line.

## Open

**One agreement slot, two layers.** Projects carry standing rules plus a
per-work design agreement. A single slot forces a choice; the unnamed layer
is only checked by luck. *Direction:* a small named set — standing documents
named once, the work agreement swapped per piece of work.

**One setting, two jobs.** The slot naming the reviewer's baseline also
decided where findings were delivered. Where the layers point at different
documents, both jobs degrade at once. *Direction:* split them — delivery
follows who is driving the work, never which file changed.

**Naming the work agreement must stay one gesture.** The system must never
guess the agreement, so naming it belongs to the user — but the swap between
pieces of work must not become a chore. *Direction:* the pointer lives and
dies with the piece of work; the default is the simplest local, never-shared
note; richer wiring is a per-project choice.

**Verification evidence is the supervisor's job, never the user's errand.**
Passive capture is not enough: gates need active collection. The A16
contract lands the honesty half — a capture forced while a helper is
still blocked records why its evidence is absent, and the user-input
wait is named rather than absorbed. The collection half remains: at a
gate that depends on command results, the supervisor runs the command
the policy pins and attaches the raw output to the checkpoint itself;
the user judges from the verdict, never from an errand. Blocked on the
workflow-definition format's command bindings. *(Live proof, 2026-11-25: a
gate loop in a supervised project dispatched four delegated runs and
captured zero results — every review demanded the output, every correction
dispatched another uncapturable run, until the user interrupted. The loop
is unwinnable by construction until the collection half lands: a finding
whose minimum correction the machinery cannot deliver must be named as a
machinery gap, not a builder failure.)*

**A stage's verdict must precede its exit — structurally.** The interim is
landed: the review-in-flight state is visible on the badge, so the grant
rule "never grant while pending" is mechanically checkable. The structural
fix remains: the transition request consumes the verdict — the next stage
does not begin until the reviewer has spoken on the last one. *Direction:*
the planned transition-request design.

**A transition question must not travel through the builder.** The only
way to pose a transition question to the reviewer was a message typed to
the builder — and a builder reads a stage request as authorization to
start it (observed 2026-11-25: the builder began the next stage on
receipt). The reviewer can judge a transition without any machinery; what
was missing was a channel that asks the reviewer without instructing the
builder. *Direction:* a judgment-only request surface — the question rides
in the review envelope, the verdict lands with the user, the builder is
never told — with full transition machinery arriving separately in the
gate design.

**Shell writes are invisible to the supervisor.** Any write through a
shell or subprocess bypasses the tool-observation path: no write event,
no timestamp, no actor. State rules (what changed) still hold — the
version-control diff sees every change unconditionally — but chronology
rules (what came first) lose their ground, and actor attribution for
delivery loses its address. *Lessons that transfer:* run state rules on
the tree, chronology only on the observed log, and nothing on the actor;
an unobserved path records `unknown`, never a guessed verdict. A
guarantee that degrades to honesty is weakened at the edge; one that
guesses is rotten at the core.

**Detection without containment is a wall, not autopilot.** A gate that
compares the tree at transition time catches out-of-scope work after it
is done but cannot prevent it: the work is wasted, the transition is
refused, and the user returns to clean up. This is the cooperative-agent
limit — without OS-level containment or a fenced shell, enforcement can
deny the grant but never stop the write. *Direction:* contain writes only
where the ordering guarantee matters (the supervisor runs pinned commands
itself; file writes come through observed tools), and leave the shell
alone everywhere else; an audit of real builder transcripts showed most
shell use is read-only or test runs with tool equivalents, with setup and
exploratory probes the only true loss. Name the posture honestly:
detection-only enforcement is safer than nothing, but it is not
autopilot.

**One builder, switching rules — not one agent per stage.** Per-stage
agents multiply configuration and invite drift between who the builder is
and what it may do. *Direction:* a single builder identity with the
engine enforcing the current stage's allowed set on every file write; the
definition describes all stages, the engine switches the rules as stages
change. No dedicated agents, no user-managed permission juggling.

**Advisory must not recreate the manual diff walk.** If checking
scope-crossing still means the user re-reading trees, supervision added
cost without removing any. *Direction:* the supervisor does the
diff-vs-scope check every checkpoint and the user reads one durable
verdict (clean/concerns plus checkpoint, with attempts while unresolved
and a toast on escalation); with stage rubrics present, streams-crossed
arrives as a finding with files named. The grant comes from the verdict,
never from a personal diff walk.

**A required definition prices out casual work.** Failing closed on an
unresolvable workflow name in every mode makes even the lightest review
cost a definition file written, validated, and pinned before anything
runs — effort without function for work with no repeating shape. Most
projects live at that end. *Direction:* below enforcement, a missing
definition is not an error: contract-only review with no transitions, the
user as the whole gate, scope-guard as the default resting state with off
optional. A provided definition upgrades the mode (stage rubrics,
recorded non-enforcing results, requestable transitions) but never gates
the floor. Reserve the hard error for the mode where transitions are
mechanized.
