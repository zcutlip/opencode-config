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

**Delivered-review history must be first-class, not excavated.** The history
of reviews already delivered to a session was captured in the reviewer's
evidence, yet a fresh reviewer claimed no review had ever been delivered and
re-presented the same findings as new. The capture worked; the judgment
didn't. *Direction:* surface the history in the review's assignment itself —
count and latest delivery named up front — the same lesson as giving the
reviewer the user's request and changed files up front. Do not rely on the
reviewer digging a field out of a large evidence file.

**A user question about the review process is not the review's assignment.**
When the user asked the builder whether a review had arrived, that question
became the checkpoint's user-request cue, and the reviewer answered the
meta-question instead of reviewing the turn's work. *Direction:* the
reviewer owns a fixed assignment — judge this turn's changes against the
agreement. The user's message is a scope cue, never the question; questions
about the review system itself are noted, not adopted.

**Verification evidence goes missing while work is still in flight.** A turn
can end while a background helper is still running the very command the gate
depends on; the checkpoint fires at turn end, the evidence freezes there,
and the helper's output lives where the supervisor deliberately does not
look. The reviewer correctly refused to certify — but a gate review that
cannot see the gate's evidence is a trigger problem, not a reviewer
problem. *Resolution:* checkpoints defer while helpers are in flight and
run when they settle (a deadline bounds a helper that never does), so the
capture sees the helper's posted result.

**Evidence is blind to anything done outside agent sessions.** The
supervisor sees only what happened inside the sessions it watches; anything
the user does outside them never enters the evidence. A reviewer can
therefore assert stale facts about the environment with full confidence.
*Direction:* reviews must treat environment claims as session-scoped
observations, not current facts — what the user may have changed outside is
unknown, not wrong.

**Supervisor records are about the builder, not for the builder.** Asked
about its own review status, the builder rummaged through the supervisor's
internal records — past reports, attempt counts. Nothing denied it: the
fence blocked edits, not reads. *Resolution:* builder reads on the
supervisor's records are denied; the reviewer keeps access through its own
allow rules. Feedback reaches the builder only through delivered messages;
escalated findings reach the user through the durable record and the
notification, never through a convenience viewer. Questions about the
review system are for the user, not for the builder to investigate.

**Steering has no re-arm lever.** Once the per-session budget of distinct
correction messages runs out, the builder hears nothing more — even about
brand-new findings, even after it resolves everything — until the host
restarts. Escalation correctly hands the loop to the user, but the user's
only channel back was relaying findings by hand — reading the report and
becoming its courier, exactly the hand-holding the system exists to remove.
The user is the gate authority, never the report reader. *Direction:* the
budget counts unresolved repeats, not distinct reports — a builder that
resolves what the last review asked re-arms automatically, because progress
is demonstrated trust; escalation fires only when the same finding returns
unresolved, and what reaches the user then is one line, never a novel.
Findings keep flowing to the builder; the user judges transitions.

**Verification evidence is the supervisor's job, never the user's errand.**
A gate verdict hinged on a test run's output; the deferral fix captures a
helper's posted result passively, but when the output was missing anyway,
the guidance on offer was "have the agent run the suite in the foreground
and show you the raw output" — the exact hand-holding the system exists to
remove. Passive capture is not enough: gates need active collection.
*Direction:* at a gate that depends on command results, the supervisor runs
the command the policy pins and attaches the raw output to the checkpoint
itself; the user judges from the verdict, never from an errand.

**The user has no direct review trigger.** Every checkpoint fires either
automatically at turn end or through the agent's own explicit-request
tool; a user who wants a fresh review of an idle tree must spend a
throwaway prompt to make the agent run one. *Direction:* a user-held
review-now command on the focused session — same checkpoint path, no
prompt spent, no agent in the loop.

**A completed review must have a delivery guarantee.** The pipeline
generates verdicts eagerly — every turn, on demand — but delivery has no
guarantee: once the correction budget dies, completed reviews pile up
behind the read fence with no path to the builder, and the reflex on
offer is to trigger another review instead of delivering the one already
finished. Generation is not delivery. *Direction:* every completed
review either reaches the builder through the normal channel or reaches
the user as one line with a pointer to the full text — it never
dead-letters on disk. The budget gates repetition, never delivery.

**Pending findings must not wait on the user's next prompt.** Delivery
queues until the user speaks; an idle builder with findings waiting stays
idle, and nothing tells the user a nudge is needed — the review exists,
the builder cannot see it, and the user finds out only by asking. The
user's next prompt must not be the delivery pump. *Direction:* findings
are delivered the moment the review completes — live into the running
turn when the builder is active, queued behind a one-line "findings
waiting" signal when it is idle. The review-in-flight state rides the
builder's standing context (every finished turn is reviewed, done-claims
are pre-review), so an active builder knows a verdict is coming without
inbox noise. Autonomous wake remains deliberately deferred.

**A stage's verdict must precede its exit.** The finishing turn triggers
the review, but the review completes minutes later and its findings
materialize at the user's next prompt — which is frequently the
transition grant itself. Gates get granted before the stage's verdict
exists, and stage N's findings arrive inside stage N+1, churning new
work for old defects. Worse, silence is ambiguous: a review still
running looks identical to a review that came back clean. *Direction:*
interim — the finishing turn's review state is visible at the point of
decision (pending, concerns, clean), and the grant rule is mechanical:
never grant while pending. Structural — the transition request consumes
the verdict: the next stage does not begin until the reviewer has spoken
on the last one.

**Hide the sessions, not the activity.** Reviewer sessions are hidden
and archived so they do not flood the workspace — right call — but the
activity itself became invisible too: during the minutes-long review
window, neither the user nor the builder can tell a review is running,
so silence reads as clean and done-claims read as vetted. *Direction:*
the review's state is a first-class signal on the user's badge —
reviewing, then the verdict — and the builder's standing context states
the contract: every finished turn is reviewed asynchronously, done-claims
are pre-review, findings arrive with the next user prompt. The plumbing
stays hidden; the process never is.

**The development loop inherited the courier pathology.** Dogfooding
surfaced friction one incident at a time, each costing the user a
description turn — while the evidence of every incident already sat in
the supervisor's own state: deliveries logged, receipts in transcripts,
timeouts and escalations recorded. The user became the transport layer
between the system's failure data and the system's builder. *Direction:*
friction capture is the supervisor's job. It detects its own pathologies
— dead-lettered findings, exhausted budgets, deferred or timed-out
reviews, silence mistaken for clean — and writes an incident log; after a
work session, one word sweeps the evidence instead of the user narrating
it. Planned friction is verified in batches too: before a dogfooding
milestone, the failure points predictable from the design are derived and
checked against live state in one pass, not discovered one user report at
a time.
