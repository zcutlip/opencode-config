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
invisible day-to-day, retrievable for audit.

**Verification evidence goes missing while work is still in flight.** A turn
can end while a background helper is still running the very command the gate
depends on; the checkpoint fires at turn end, the evidence freezes there,
and the helper's output lives where the supervisor deliberately does not
look. *Resolution:* checkpoints defer while helpers are in flight and run
when they settle (a deadline bounds a helper that never does), so the
capture sees the helper's posted result.

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

**Prose-signal parsers must tolerate the producer's drift.** A CONCERNS
report with bold section markers evaded findings detection and
dead-lettered silently — no delivery, no marker, no incident — while the
verdict parser a few lines away already accepted bold. Half the parsing
tolerated the reviewer's formatting drift; half did not, and the sweep
caught the gap only because a finding failed to arrive. *Resolution:*
findings detection accepts the same bold and plain variants the verdict
parser does, with regression tests pinning both forms. Deeper lesson for
the report format: the more the supervisor depends on reading reviewer
prose, the more the report needs a machine-readable header.

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
Passive capture is not enough: gates need active collection. *Direction:* at
a gate that depends on command results, the supervisor runs the command the
policy pins and attaches the raw output to the checkpoint itself; the user
judges from the verdict, never from an errand. Blocked on the
workflow-definition format's command bindings.

**A stage's verdict must precede its exit — structurally.** The interim is
landed: the review-in-flight state is visible on the badge, so the grant
rule "never grant while pending" is mechanically checkable. The structural
fix remains: the transition request consumes the verdict — the next stage
does not begin until the reviewer has spoken on the last one. *Direction:*
the planned transition-request design.
