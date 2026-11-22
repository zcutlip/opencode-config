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
