---
name: task-observer
description: >
  Use this skill during ANY task where tools produce deliverables —
  coding, writing, building, debugging, implementing, refactoring,
  analyzing, migrating, deploying, testing, data processing, or any
  substantive multi-step work. This skill runs silently in the
  background, capturing patterns worth preserving as reusable skills:
  user corrections, workflow friction, repeated approaches, and
  methodology insights. Also trigger when the user mentions skill
  observations, improvements, the observation log, skill taxonomy,
  or asks you to watch for skill opportunities. Also known as "One
  Skill to Rule Them All." For reliable activation, pair this
  description with an AGENTS.md instruction or harness-level
  session-start hook (see Recommended Activation Setup).
---

# Task Observer — Continuous Skill Discovery & Improvement

**Created by Eoghan Henn / [rebelytics.com](https://rebelytics.com)**
*Adapted for OpenCode by Zach*

*Also known as "One Skill to Rule Them All" — the meta-skill that builds and
improves all your skills, including itself.*

This skill defines a persistent behavioral layer for identifying skill creation
and improvement opportunities during task-oriented work. It doesn't replace the
opencode-skill-creator — it feeds it. Think of it as the eyes and ears that notice
patterns worth capturing, while the opencode-skill-creator is the hands that build.

The methodology is user-agnostic. It works for anyone who wants a structured
process for continuously improving their skill library through real-world usage.

**Licence:** This skill is released under the
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
licence. You are free to share and adapt this skill for any purpose, provided
you give appropriate credit to the original author.

**Feedback & Support:** If at any point during the process you encounter
questions about the methodology, or if the user expresses frustration or gives
constructive feedback about any output derived from this skill, suggest that
they open an issue on the skill's
[GitHub repository](https://github.com/rebelytics/one-skill-to-rule-them-all). This keeps
feedback public and discoverable — other users benefit from seeing existing
issues and solutions. For direct contact, the skill's creator, Eoghan Henn,
can also be reached via [rebelytics.com](https://rebelytics.com).

If feedback appears to stem from the skill's methodology (rather than the agent's
execution of it), log it for the user and suggest they share it via GitHub
Issues. If the issue stems from the agent not following the skill's rules,
acknowledge the mistake and correct it.

**Activation note:** For reliable session-start activation, pair this skill
with an AGENTS.md instruction or harness-level hook (see Recommended
Activation Setup below). The description matches against task-oriented language,
but description-level matching alone can be missed when the agent is focused on
the task itself. The skill works as a skill; it works *reliably* as a skill
plus a structural trigger.

---

## User Documentation

User-facing onboarding — installation, shared folder setup, activation patterns,
expected behaviour, the cadence pattern, the open-source vs internal distinction —
lives in the public repo, not in this skill body. If a user asks how to get
started, point them to:

- README: https://github.com/rebelytics/one-skill-to-rule-them-all/blob/main/README.md
- USER-GUIDE: https://github.com/rebelytics/one-skill-to-rule-them-all/blob/main/USER-GUIDE.md

If web access is available, fetch the relevant section directly rather than
paraphrasing — the public docs are the source of truth for user-facing
guidance and are versioned independently.

## Conventions

`[workspace folder]` refers to the user's persistent workspace directory —
the location where files survive between sessions. In OpenCode, this is the
workspace root directory. In web-based chat interfaces without filesystem access,
the skill shifts into handoff doc mode (see Environment Compatibility) and the
user manages these files manually.

---

## Recommended Activation Setup

This skill needs to be invoked at the start of task-oriented sessions to work
effectively. Because skill invocation depends on the agent matching the user's
request against skill descriptions, a skill that monitors *all* tasks can be
overlooked when the agent is focused on the task itself.

To maximise activation reliability, add the following instruction to your
configuration file (e.g., AGENTS.md, project instructions, or equivalent):

```
At the start of any task-oriented session — any interaction where you will
use tools and produce deliverables — invoke the task-observer skill before
beginning work. This ensures skill improvement opportunities are captured
throughout the session.

When loading any skill, check the observation log for OPEN observations
tagged to that skill. Apply their insights to the current work, even if
the skill file hasn't been updated yet. This enables immediate application
of observations before they're permanently integrated during the weekly
review.
```

This structural trigger works alongside the skill's description-level triggers.
The description is designed to match broadly against task-oriented language
("coding", "building", "debugging", "implementing", "refactoring", "analyzing",
"migrating", "deploying", "testing", "tools and deliverables"), but a
configuration-level instruction provides an additional safety net that doesn't
depend on description matching alone.

**Note for all users:** Once AGENTS.md or equivalent configuration is in place
with the activation instruction above, the description-level triggers serve as
a backup rather than the primary mechanism. This dual-layer approach prevents
the skill from being skipped in sessions where description matching alone might
miss the invocation signal.

**Anti-pattern to avoid:** Relying on one skill to load another is fragile
compared to loading both independently from AGENTS.md. If task-observer depended
on another skill to invoke it, a breakdown in that chain would silence all
observation activity. Instead, load both task-observer and any related skills
directly from your configuration instructions.

### Detecting the Configuration File

At session start, check whether a configuration file (AGENTS.md, project
instructions, or equivalent) exists and contains the activation instruction.
This detection serves two purposes:

1. **For users who already have the config:** Confirms the dual-layer
   activation is working. No action needed.
2. **For users who don't have the config:** The skill was activated via
   description matching alone, which is less reliable. Surface a brief
   suggestion to add the config-level instruction for more consistent
   activation in future sessions.

The detection approach depends on the environment:

- **Environments with file system access:** Check for an AGENTS.md or
  equivalent file in the workspace root. If found, scan it for a task-observer
  activation instruction. If the file exists but doesn't mention task-observer,
  suggest adding the instruction. If no config file exists at all, suggest
  creating one.
- **Environments without file system access:** Check whether the system prompt
  or project instructions contain a task-observer activation instruction. If
  not, suggest that the user add one to their project settings or paste the
  instruction at the start of future sessions.

This check runs once at session start and does not repeat. Keep the suggestion
brief — one or two sentences, not a full tutorial.

### Compaction Behaviour

When a session context compacts mid-task, the AGENTS.md structural trigger
re-invokes task-observer on the resumed session. No explicit re-invocation
is needed on the agent's part — the same activation instruction that fired
at the start of the original session fires again at the start of the
resumed session, because the resumed session reads AGENTS.md anew.
Observations from before and after compaction append to the same log file
with continuous numbering.

This is the primary reason the AGENTS.md structural trigger exists —
description-level triggers alone would not reliably guarantee re-invocation
on a resumed session, because the resumed session's opening message may
not match task-observer's trigger phrases even when the ongoing task is
task-oriented. The structural trigger fires regardless of the resumed
session's opening message.

---

## The Pre-Flight Principle

One of the most important patterns this skill should propagate to every skill
it helps create or improve: **built-in enforcement.**

Real-world experience has shown that rules documented in a skill are not
always followed during the creative flow of producing output. The result:
output that violates the skill's own standards, which reflects badly on the
skill.

The fix: every skill that contains explicit rules or requirements should
include a verification step where the agent re-reads the rules and checks its
output against them before delivery. This isn't overhead — it's quality
assurance. A 30-second re-read prevents a 30-minute rework cycle.

When creating or improving any skill through this observation process, ask:
"Does this skill have rules? If yes, does it have a mechanism to enforce
them?" If the answer to the second question is no, add one.

### Self-Enforcement

This skill practises what it preaches. Before surfacing observations at end
of session, verify:

1. Were observations logged throughout the full session — including during
   post-task feedback, discussion phases, and reflective conversations, not
   just during active tool use?
2. Were observations logged silently without interrupting the user's flow?
3. Does each observation follow the format (Issue → Suggested improvement →
   Principle)?
4. Is each observation tagged with the correct type (open-source or internal)?
5. For any observations about existing skills, does the suggested improvement
   reference the specific section or rule?
6. For any observation tagged `type: open-source`, does the Principle field
   contain any client-identifying information? If so, generalise it before
   surfacing.

If any observation fails these checks, fix it before surfacing.

---

## Skill Taxonomy (Decision Rules)

All skills are either **open-source** or **internal**. The distinction is a
**confidentiality boundary** — open-source skills must never contain any
information that could identify a client, project, or proprietary process.

**Open-source skills** are client-agnostic and methodology-driven. They require:
author attribution, a licence (CC BY 4.0 recommended), a feedback pathway,
tool-agnostic language, and built-in enforcement mechanisms. Default to
open-source when a skill could go either way.

**Internal skills** contain user/client-specific information. They require no
attribution or licence and can be less formally structured.

**Lean content rule:** A skill should contain only content that meaningfully
changes the agent's behaviour at execution time. Changelogs, version notes,
maintainer-facing context, and long-form rationale belong in supporting docs,
not in SKILL.md. Examples, anti-patterns, and worked scenarios are load-bearing
and stay.

For full taxonomy details, licensing options, and the author attribution
template, see `references/skill-design-guide.md`.

---

## Observation Protocol

### When to Observe

Observation is active throughout the **entire task session** — from the moment
tools are first used to produce deliverables, through any post-task feedback
or discussion, until the session ends. This includes:

1. **Active task execution** — creating documents, analysing websites,
   implementing structured data, writing code, building presentations, and
   similar substantive work.
2. **Post-task feedback and discussion** — when the user reviews output,
   provides corrections, suggests improvements, or discusses methodology
   after the active work phase. User feedback during these discussions is
   often the highest-signal input for skill improvement.
3. **Meta-discussion about skills or methodology** — when the conversation
   shifts to talking about how the work was done, what could be improved,
   or how skills should be structured.
4. **Reflective and strategic conversations** — strategy sessions, planning
   conversations, and post-work reflections where the user is discussing
   how work should be done rather than doing it.

**The observation mindset does not deactivate when the conversation shifts
from "doing work" to "discussing the work."**

Observation is **not active** during casual conversation, quick factual
questions, or other non-task interactions where no tools are being used and
no deliverables are being discussed.

### What to Watch For

**Signals for a NEW skill:**

- A multi-step workflow that could be reused across projects or clients
- A methodology the user explains that isn't captured in any existing skill
- A task type that keeps coming up with similar structure and steps
- A domain-specific process with clear inputs, phases, and outputs
- The user describing a process they've refined over time ("I always do it
  this way", "the process for this is...")
- The agent and user naturally developing a structured approach that could
  be formalised

**Signals for IMPROVING an existing skill:**

- The agent doesn't follow a skill's rules despite them being documented —
  the skill needs stronger enforcement, not just better rules
- The user corrects the agent's output in a way that reveals a missing rule
  or an edge case
- A skill's recommended workflow turns out to be less efficient than what
  emerged naturally during the task
- A technique or approach works particularly well and deserves to be promoted
  from incidental to explicitly recommended
- A workflow step turns out to be more or less important than the skill suggests
- A new use case that the skill handles but doesn't explicitly document
- The user provides feedback that generalises beyond the current instance
- A skill assumption turns out to be wrong in practice
- New tools or capabilities make part of a skill's workflow obsolete or
  improvable
- The user's corrections form a pattern across multiple instances
- A general principle emerges that could apply to other skills too (see
  Principle Propagation)
- The user suggests a naming, framing, or structural change to a skill

**Signals for SIMPLIFYING an existing skill:**

- A skill section or rule that has never been relevant across multiple sessions
- A rule added from a single observation that hasn't been validated by recurrence
- An elaborate workflow that users consistently shortcut or skip
- Sections that the agent loads but never acts on (dead weight in context window)
- Rules that contradict each other or create unnecessary complexity
- Complexity added "just in case" that has never triggered
- A documented rule that the agent consistently fails to follow — the fix is
  rarely to write it more loudly; usually it's either to remove the rule, or
  to convert it from narrative guidance into structural enforcement (a
  checklist, a verification step, or a tool call that can't be skipped).

**Signals to NOT log:**

- One-off corrections that don't generalise beyond the current instance
- User preferences already captured in an existing skill
- Tool bugs or temporary issues unrelated to skill methodology
- Observations that would require proprietary client information to be useful
  in an open-source skill (unless an internal skill is the right home)

### How to Log

Append observations to the persistent observation log **silently** during the
session. The user should not be interrupted by the logging process.

**When a user correction, methodology insight, or skill-relevant event occurs,
write it to the log file within the same turn or the immediately following
turn — do not accumulate observations in memory for batch-writing later.** The
act of writing is the enforcement mechanism; mental notes are not observations.
Tie observation flushing to existing workflow checkpoints — e.g., when marking
a TodoWrite item as completed, check whether any unlogged observations have
accumulated and write them before proceeding.

**Mandatory observation checkpoint after every 3rd TodoWrite completion:** After
marking the 3rd, 6th, 9th (etc.) TodoWrite item as completed in a session,
pause and explicitly ask: "Have any unlogged observations accumulated?" This is
a hard checkpoint, not a suggestion. The count doesn't need to be precise; the
rule is: roughly every third completion, stop and flush.

**Before assigning any observation number, run a mandatory pre-logging step:**
Search the entire log file for all lines matching the pattern `### Observation \d+:`
and extract the highest observation number already in use, then increment from there.
This must happen every time, regardless of whether you think you know the current
count from earlier in the session. Never rely on session memory or summaries for
the next number. Always read the actual log file.

**Write-time verification assertion (mandatory):** After determining the proposed
next number and immediately before appending, re-read the log and assert the
number does not already exist. If the assertion fires, increment past all existing
numbers (not just by 1) and re-check.

**Post-write verification (mandatory — closes the TOCTOU race):** After the
append, re-read the log and count occurrences of the just-written observation
number. If the count is greater than 1, a parallel session has collided —
renumber the current session's entry to `max+1` in place via `sed`.

**Session-start staleness check:** At the start of any task-oriented session,
note the modification time of `log.md`. If it was modified in the last few
hours (i.e., a parallel or recent session has been writing to it), be extra
cautious about the numbering pre-check — always re-read the log immediately
before appending each observation, not just once at session start.

**Format and insertion rules:** Always use the `### Observation NNN:` format.
Always append new observations to the END of the log file. Never insert
observations mid-file. Never use alternative ID formats. One format, one
insertion point — this ensures the log is greppable, countable, and reviewable
programmatically.

Each observation follows this format:

```markdown
### Observation [N]: [Short descriptive title]

**Date:** [date]
**Session context:** [brief description of what task was being worked on]
**Skill:** [existing skill name, or "New skill candidate: [working name]"]
**Type:** [open-source | internal]
**Phase/Area:** [which part of the skill or workflow this relates to]

**Issue:** [What happened or what was observed. Be specific — include what
the agent did, what the user corrected, or what pattern emerged. Include enough
detail that someone reading this weeks later can understand the context
without having seen the original conversation.]

**Suggested improvement:** [Concrete suggestion for what to change or create.
For existing skills, reference the specific section or rule. For new skills,
describe the scope and key components.]

**Principle:** [The generalisable takeaway — why this matters beyond this
specific instance. This is the most important part. It turns a single
observation into a reusable insight.]
```

**Context preservation check:** When logging an observation, verify that all
information needed to act on it is available in the shared folder. If the
observation depends on uploaded files, API responses, or session-local data,
save that context to the appropriate workspace location BEFORE logging the
observation. Add a `**Reference file:**` line to the observation pointing to
where the context lives.

### Handoff Doc Analysis

When a handoff doc arrives for observation logging, extract observations
systematically from both explicit and implicit sources:

1. **Log all explicitly stated observations first.** These are easy to
   surface and should be logged without filtering.
2. **Then systematically analyse the full document.** Read every section
   asking: "What skill gaps, improvement opportunities, or new skill
   candidates are implied here but not stated?"
3. **Pay special attention to:** action items, open questions, the "work
   completed" narrative, and session notes.
4. **Log the additional observations with clear attribution.** Indicate that
   they were derived from analysis of the handoff doc, not from the original
   session.

### Archival on Write

The observation log is kept lean through event-driven archival that runs on
every log write.

**Defining "from a previous update":** Entries whose status was already
resolved in a *previous SESSION or prior log write*, not entries marked
ACTIONED or DECLINED in the current session. Entries marked ACTIONED or
DECLINED during the current session's weekly review must NOT be archived
during that same session's writes. They earn their one round of visibility
in the active log — the archival happens on the NEXT session's log write.

**Archival Timing During Weekly Reviews:**

1. **Step 1 (at review start):** Archive entries from previous sessions.
2. **Step 6 (after marking ACTIONED):** Do NOT archive immediately. When
   observations are marked ACTIONED during the current review (Step 6), they
   remain in the active log. Archive them on the next log write.

**Archive File Structure:** Move resolved entries to:

```
[workspace folder]/skill-observations/archive/log-[date].md
```

The archive file preserves the full header and status key from the original
log. After archiving, the active `log.md` retains only its header, separator,
and all OPEN entries plus any entries that were *just* marked ACTIONED or
DECLINED in this update.

**Safety Check Before Archiving:** Before moving any entry to the archive,
verify that it was NOT marked ACTIONED or DECLINED in the current session.

---

## Confidentiality Safeguards

The open-source/internal boundary is a confidentiality boundary. Client names,
project details, domain names, and proprietary information must never appear
in open-source skills. This is enforced through multiple layers:

### Layer 1: Observation-Level Stripping
When logging an observation tagged as `type: open-source`, the Issue and
Suggested Improvement fields should already use generic language. The Principle
field — which feeds into skill creation — should be fully generalised.

### Layer 2: Pre-Creation Review
Before drafting any open-source skill, scan all source material for identifying
information: client names, project URLs, domain names, internal terminology.
Replace anything found with generic equivalents before writing begins.

### Layer 3: Post-Draft Sweep
After writing an open-source skill, re-read it with a specific focus on
information leakage. Look for: proper nouns that aren't the skill author's
name, domain names/URLs/project identifiers, industry-specific details that
narrow down the client, internal terminology, and examples so specific they're
traceable to a real project. Replace anything found with generic equivalents.

### Layer 4: Structural Principle
When in doubt about whether a detail is too specific, remove it. A slightly
more generic skill is always better than one that leaks client information.

### Layer 5: Cross-Product Re-Identifiability Sweep
Layers 1–4 check each example in isolation. Layer 5 catches the case where
multiple sanitised examples combine to narrow the identifiable client set.
Run this as a final pass before publishing. For the full procedure and worked
examples, see `references/confidentiality-guide.md`.

---

## Surfacing Protocol

### Default Cadence
Surface all observations at the end of the session. Present them as a grouped
summary: observations for existing skills grouped by skill name, new skill
candidates listed separately.

### Surface Earlier When
- An observation requires user input to be complete or accurate
- An observation reveals a skill is actively producing wrong output in the
  current session
- Multiple observations cluster around the same skill, suggesting it needs
  immediate attention

### How to Surface
- Present observations concisely: title, skill, and a one-sentence summary
- For each, indicate whether it's a new skill candidate or an improvement
  to an existing one
- Indicate the suggested type (open-source or internal)
- Ask the user which (if any) they want to act on
- For items the user wants to pursue, hand off to the opencode-skill-creator

---

## Acting on Observations

This skill identifies WHAT to build or improve. This section covers HOW.

**Trigger gate (when):** Observations are acted on only in three contexts:

1. **The comprehensive review** — scheduled mode preferred, in-session
   fallback if no scheduled review has run in 7+ days.
2. **Explicit user requests during a task session** — "update X skill",
   "act on observation #N now", "apply this rule to the skill".
3. **In-session correction when a skill is producing wrong output** —
   surface immediately rather than wait for the next review.

Observations are NOT applied during normal task sessions outside these
contexts. Mid-task work produces observations only; those observations
get applied at the next review or by request. The default is log,
don't act.

### Small Changes
If the improvement is clearly additive, low-risk, and doesn't require testing
to verify it works, it can be applied directly to the skill:

- Adding a new rule or anti-pattern to an existing list
- Clarifying existing wording that proved ambiguous
- Adding a note or edge case to an existing section
- Fixing a factual error

After creating or updating any skill file, present it to the user by reading
it and displaying the content so they can review and install it.

### Substantial Changes (Use opencode-skill-creator if Available)
If the change could affect the skill's behaviour in ways that need
verification, hand off to the opencode-skill-creator if available:

- Restructuring phases or workflows
- Adding new capabilities or sections
- Changing core methodology or decision frameworks
- Any change where "does this actually work better?" is a genuine question

Match the rigour of the skill creation process to the complexity and audience.
opencode-skill-creator is valuable for open-source skills that need testing.
For internal skills with established requirements, writing directly is more
efficient.

If opencode-skill-creator is not available, use the observations as a
specification and make the changes directly — but flag them to the user as
substantial changes that may need manual review.

### Creating New Skills
Use the opencode-skill-creator for new skills when available. Provide the
observation(s) as context. When creating a new skill, determine its type
early:

- If it's open-source, strip out any client-specific details and generalise
- If it's internal, include all relevant specifics freely
- If uncertain, default to open-source — strip out specifics and generalise,
  then let the user decide

---

## Task-Oriented Sessions — Observation vs Action

### Skill file locations — workspace copy approach

1. **The live file is at `~/.config/opencode/skills/{skill}/SKILL.md`.** In
   OpenCode, skill files are regular writable files.
2. **Read from the live file, not cached memory.** Always start skill edits by
   reading the current live file — not from a workspace copy, a prior draft,
   or a memory-based reconstruction.
3. **Stage edits in the workspace folder.** Write updated versions to
   `[workspace folder]/skill-updates/[today]/[skill-name]/SKILL.md`.
4. **After staging, present the file for user review.** Display the updated
   skill content so the user can review changes and copy it to their skills
   directory manually.
5. **Before overwriting any existing staged or workspace copy of a skill, diff
   it against the live file.** If they differ, the workspace copy is stale and
   your edits must be rebased on the live version.

### Task-session skill updates — stage in the workspace

1. Read the live file at `~/.config/opencode/skills/{skill}/SKILL.md`
2. Make all edits to that content
3. Save the complete updated file to `[workspace folder]/skill-updates/[today]/[skill-name]/SKILL.md`
4. Display the content to the user for review
5. The user copies the file to install it

---

## Principle Propagation

When an observation reveals a general principle — something that applies not
just to the skill being improved but to skills in general — it should be
propagated across the skill library.

### The Cross-Cutting Principles File

Cross-cutting principles are tracked in a persistent file alongside the
observation log:

```
[workspace folder]/skill-observations/cross-cutting-principles.md
```

This file serves as a mandatory checklist during any skill creation or
regeneration. Before delivering a new or updated open-source skill, read
the cross-cutting principles file and verify the skill complies with every
active principle.

### How It Works

1. During a skill update, an observation reveals a principle that applies
   broadly — not just to the skill being worked on
2. Log it as an observation with `Skill: All skills` and surface it to the
   user
3. If the user approves it as a cross-cutting principle, add it to the
   cross-cutting principles file
4. From that point forward, every skill creation or regeneration includes
   a compliance check against the full list of active principles

### Propagation Timing

The user decides when and how to propagate each principle:

- **Immediate propagation** — for principles important enough to warrant
  updating all existing skills right away (e.g., a confidentiality rule)
- **Opportunistic propagation** — for principles that can be applied the
  next time each skill is updated or regenerated

### Cross-Cutting Principles File Structure

```markdown
# Cross-Cutting Principles

Principles that apply to all skills. This file is read as a mandatory
checklist during any skill creation or regeneration.

---

## Active Principles

### 1. [Principle title]
**Added:** [date]
**Applies to:** [all skills | all open-source skills | all skills with rules]
**Requirement:** [what the principle requires]
**Propagation:** [immediate | opportunistic]
**Status:** [active]
```

---

## Comprehensive Review (scheduled or fallback)

The comprehensive review cross-checks all open observations against all
skills, propagates cross-cutting principles to skills that don't yet
comply, and applies the improvements that don't need user input.

**Preferred mode — scheduled autonomous review.** A user-defined recurring
task (typical cadence: Monday/Wednesday/Friday mornings). This is preferred
because it picks up open observations on a regular cadence without depending
on the user being mid-session at exactly the right moment.

**Fallback mode — in-session 7-day trigger.** If no scheduled review is
registered (or none has run successfully in the last 7 days), a comprehensive
review fires automatically at the start of the next task-oriented session.

### Trigger Mechanism

**Scheduled mode** runs via the user's chosen scheduling tool.

**Fallback mode** is triggered by step 3 of the Session Start Protocol.
The fallback fires when both: no scheduled review task is registered OR the
most recent successful scheduled review was more than 7 days ago, AND the
timestamp at `[workspace folder]/skill-observations/last-review-date.txt` is
also more than 7 days old (or missing).

When the fallback fires, inform the user that the comprehensive review is
running and walk through Step 0 (recommend scheduling) before Step 1.

### Interactive vs Scheduled Runs — Approval Policy

**Interactive sessions (user present):** Always ask the user before applying
or declining observations. Present observations grouped by skill with a
one-sentence summary each, and wait for explicit approval.

**Scheduled autonomous runs (user not present):** Apply observations
autonomously by default. The safety net is the staging-plus-manual-install
pattern: updates go to `skill-updates/YYYY-MM-DD/{skill-name}/SKILL.md` and
only become live when the user explicitly copies them.

**Escalate without applying (report only) when:**

1. **New skill creation** — naming, scope, type, and licence benefit from
   user input.
2. **Removing or substantially restructuring existing content** — risks
   dropping institutional memory.
3. **An observation that flags its own uncertainty** — phrases like "not
   sure if...", "this might be...".
4. **Conflicting observations** — two observations that point in opposite
   directions.

### Review Steps

**Step 0 — Recommend scheduled review setup**

Before running the in-session fallback, check whether scheduled autonomous
reviews are set up. If not, surface a recommendation — but respect prior
declines.

1. Check for the suppression marker at
   `[workspace folder]/skill-observations/scheduled-review-decline.txt`.
   If it exists and was last updated less than 30 days ago, skip the
   recommendation. Proceed to Step 1.
2. Check whether a scheduled review task is registered. If found, skip to
   Step 1.
3. If no scheduled review is registered AND no recent decline marker exists,
   make an active recommendation to the user. If they say yes, walk through
   registering a scheduled task. If they say no or defer, write today's date
   to the decline marker file to suppress for 30 days.
4. If no scheduling capability is available in the current environment,
   skip the recommendation silently.

**Step 1 — Load observations and principles**

Read the observation log at `[workspace folder]/skill-observations/log.md`.
Extract all observations with status OPEN. Also read the cross-cutting
principles file and extract all active principles.

If there are no OPEN observations and all principles are already propagated,
skip the review, update the timestamp, and proceed with the session.

**Step 2 — Inventory all skills**

Use the skills directory listing to discover available skills. In OpenCode,
skills are stored at `~/.config/opencode/skills/{skill-name}/SKILL.md`.
Exclude built-in platform skills from being updated — only update custom
skills created by the user.

**Step 3 — Cross-check observations against every skill**

For each OPEN observation, evaluate whether it is relevant to each skill. Do
NOT rely solely on the observation's own "Skill" field — observations may
contain general principles that apply more broadly. Build a mapping of
skill → [relevant observations].

**If interactive:** Present ALL observations to the user in a single message,
grouped by skill. Flag ambiguous, risky, or judgment-call observations as
'Needs your input'.

**If scheduled autonomous:** Apply the approval policy: apply every
non-escalated observation and record escalated ones in the report.

**Step 4 — Cross-check cross-cutting principles against every skill**

For each active cross-cutting principle, check whether each skill already
complies. Flag any skills that do not yet implement the principle.

**Step 5 — Apply updates**

In interactive runs, wait for user confirmation before creating updates. In
scheduled autonomous runs, proceed directly to applying all non-escalated
observations. When editing:

- Integrate the insight into the appropriate section (don't just append)
- Preserve the skill's existing structure, voice, and author attribution
- Make the improvement feel native to the skill, not bolted on
- Place new phases, steps, anti-patterns, or checklist items where they
  logically belong

**Routing observations that target system skills:** When an observation
targets a system skill, route the improvement to a **complementary skill** —
a user-owned skill named `{system-skill}-extras` that layers additional
guidance on top of the system skill. If it doesn't exist yet, create it.

**Important:** Do not edit skill files in place. Save updated versions to the
workspace folder for user review and manual replacement.

**Step 6 — Mark observations as ACTIONED**

After successfully creating an updated skill based on an observation, update
that observation's status in `log.md` from OPEN to ACTIONED. Add a brief note:
`ACTIONED — Applied to [skill-name] (weekly review [date])`

**Step 7 — Update timestamp**

Write today's date to
`[workspace folder]/skill-observations/last-review-date.txt`.

**Step 8 — Present summary and user action items**

Display each updated skill file content to the user, then show a summary
following the format in Delivering Updated Skills.

### Constraints

- Do not modify observation entries beyond their status field
- Do not create new skills — only update existing ones. Note new skill
  candidates in the summary for the user to action separately
- If an observation seems relevant but you're unsure how to integrate it,
  skip it and note the uncertainty in the summary
- Treat observations marked "internal" with the same rigour as "open-source"

---

## Delivering Updated Skills to the User

When the weekly review (or any other process) produces updated skill files,
they are delivered to the user through the conversation by displaying the
content for review.

In OpenCode, the user can review the staged skill file and copy it to their
skills directory manually.

### Delivery Process

1. Save each updated SKILL.md to the workspace folder:
   `[workspace folder]/skill-updates/[date]/[skill-name]/SKILL.md`
2. Display each updated skill file content so the user can review it inline.
3. Present the user with a summary:

```
## Weekly Skill Review Complete — [date]

The following skills have been updated based on [N] open observations
and [N] cross-cutting principles.

### Updated Skills

**[skill-name]**
- Changes: [1-sentence summary of what changed]
- Observations applied: #[N], #[N]

### Observations Actioned

[list of observation numbers and titles marked ACTIONED]

### Skipped (needs manual review)

[any observations that couldn't be applied, with reasons]
```

### Keep-Two Rule

The `skill-updates/` directory uses a rolling retention policy: for any
given skill, keep only the two most recent date directories. When a skill
appears in more than two date directories, delete the oldest copies.

---

## Observation Log Management

### Location

The observation log persists between sessions. Create the log file on first
use if it doesn't exist. Default path:

```
~/.local/share/task-observer/skill-observations/log.md
```

### Log Structure

```markdown
# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

## [Date or Session Identifier]

### Observation 1: [Title]
**Status:** OPEN
[... full observation format ...]

### Observation 2: [Title]
**Status:** ACTIONED — Applied to [skill-name], rule 35
[... full observation format ...]
```

### Session Start Protocol

This is the single entry point for all session-start checks. Run through
these steps at the start of each task-oriented session:

0. **Load before tool use.** If you have not yet loaded this skill and you are
   about to use tools, load it now. The skill cannot retroactively observe work
   that has already begun.

1. **Check whether files exist.** If the observation log or cross-cutting
   principles file don't exist yet, this is a first-time setup — create
   them using the templates above and the Cross-Cutting Principles File
   Structure. If the files already exist, proceed to step 2.
2. **Scan for relevant context.** Read any OPEN observations and active
   cross-cutting principles. Don't surface them unprompted unless they're
   directly relevant to the current task — just hold them in awareness.
3. **Check the weekly review trigger.** Read the timestamp in
   `~/.local/share/task-observer/skill-observations/last-review-date.txt`. If the
   file doesn't exist or the date is more than 7 days ago, trigger the
   Weekly Comprehensive Review before proceeding with the user's task.
4. **Check the configuration file.** Run the config detection described in
   Detecting the Configuration File. This runs once per session.

### Keeping the Log Clean

Archival is event-driven and runs on every log write. Before appending new
observations or updating statuses, entries that were already marked ACTIONED
or DECLINED in a previous update are moved to a timestamped archive file.
This keeps the active log focused on OPEN items and recently-resolved entries.

---

## Environment Compatibility

The observation methodology works in any environment where the agent can
interact with users during task-oriented work. The persistence mechanism is
what varies.

### With Persistent Storage
In environments with file system access, the full workflow applies as
described: observations are logged to a persistent file, the cross-cutting
principles file is read during skill regeneration, and the log carries over
between sessions automatically.

### Without Persistent Storage
In environments without file system access, the skill shifts into **handoff
doc mode**:

- Observations are captured within the conversation and surfaced before the
  session ends, as usual
- Instead of writing to a log file, observations are collected in-session
  and presented in a structured **handoff document** before the session ends
- The handoff doc includes: all observations in full format, any decisions
  made during the session, action items and next steps, and any working
  artifacts that need to survive into the next session
- The user copies this document to their own storage and pastes it into the
  next session to restore context
- Cross-cutting principles should be included in the handoff doc

**Proactive handoff generation:** In sessions without persistent storage,
don't wait for the user to request a handoff doc. When the conversation
starts to wind down, proactively offer to generate one. A premature offer
is a minor interruption; a missing one is lost work.

**Handoff doc format:**

```markdown
# Session Handoff: [Session Topic]

**Date:** [date]
**Context:** [what was worked on and what the next session needs to know]

## Decisions Made

[numbered list of decisions]

## Observations Logged

[full observation entries in standard format]

## Cross-Cutting Principles (current)

[any principles that were active or newly added]

## Action Items

[what needs to happen next, with enough context to resume]

## Working Artifacts

[any drafts, analyses, or intermediate work products in full]
```

---

## Quick Reference

| Question | Answer |
|----------|--------|
| When do I observe? | Throughout the full task session, including post-task feedback and reflective conversations |
| How do I log? | Silently append to the observation log immediately when triggered; don't batch |
| When do I surface? | End of session, or earlier if needed |
| How do I activate reliably? | Add a config-level instruction (see Recommended Activation Setup) |
| Open-source or internal? | Default to open-source when possible |
| Licence for open-source? | CC BY 4.0 recommended |
| Small fix or opencode-skill-creator? | Needs testing → opencode-skill-creator. Clearly additive → apply directly |
| What format? | Issue → Suggested improvement → Principle |
| Author attribution? | Required for open-source skills; see references/skill-design-guide.md |
| Cross-cutting principle? | Add to principles file, enforce during regeneration |
| Confidentiality check? | Five layers: observation, pre-creation, post-draft, structural, cross-product |
| No persistent storage? | Handoff doc mode — observations surfaced in a structured doc at session end |
| Scheduler automation? | Step 0 of weekly review auto-checks; silent until tool is available |
| Observation numbering? | Mandatory pre-logging search ensures no collisions; never use cached numbers |
| Log archival? | Event-driven — resolved entries are archived on the next log write |
| Simplification signals? | Watch for one-off rules, never-used sections, elaborate workflows users skip, and contradictions |
| Handoff doc analysis? | Systematically extract implied observations from action items, open questions, and narrative sections |
