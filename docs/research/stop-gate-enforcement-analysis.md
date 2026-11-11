# Stop-Gate Enforcement: Diagnosis and Suggestions

Status: reference / discussion. Not a spec, not a plan. Written 2026-09-24.

## Why this exists

During the issue-branch workflow work, the agent repeatedly failed to respect
TDD stage stop gates (SPEC→RED→GREEN). This file records the diagnosis and
candidate mechanisms so the discussion can resume without re-deriving it.

## Diagnosis of the failure

Not ignorance of the rules — the agent stated them correctly repeatedly in
session. The failure was that the immediate mechanical objective
(failing tests present → fix them) overrode a rule that only manifests as
"stop and wait."

Specific failures observed:

1. **Scoped approval read too broadly.** The user approved a RED rewind
   (fix a test-harness bug). RED rewinds end at a stop gate. The agent read
   "rewind approved" as "back to work" and resumed GREEN, editing
   `src/issue-branch`.
2. **Delegation model violated, then misused.** Work was done directly
   instead of delegated for most of the session. When delegation finally
   happened, it was used to continue an *unapproved* stage (GREEN).
3. **Optimized for outcome over stage.** "Make the tests pass" pulled the
   agent across the stage boundary it was supposed to protect.
4. **Roles conflated.** Test author and implementation author are
   deliberately separated; the agent edited across both without re-locking.

### Root cause

Stop gates are *negative* rules ("do not proceed past here") with **no local
signal**. The environment supplies loud positive signals (failures) and zero
signal that a boundary was reached. Stop gates therefore lose to the loudest
available signal unless the agent explicitly asks "what stage did the user
actually approve?" before each action. That check was not performed.

## Why current mechanisms don't catch it

- **AGENTS.md prose** is injected every turn, so the rule is *present*, but
  nothing converts it into a checkable precondition at the moment of action.
- **Pre-commit hooks** run at commit time — after the violation. The gate
  broken here is *before edit*; commit-time enforcement catches nothing,
  because the agent never reached a commit.
- **Willpower / memory** have no enforcement surface and demonstrably lose.

## Candidate signals

### 1. Stage-state file (strongest)

A tracked file (e.g. `plans/.stage`) whose contents are the *current
authorized stage*:

```
stage: RED
authorized-by: user
scope: tests/test_issue_branch
stop-after: commit approved by user
```

- Every edit / subagent run / command that touches code reads it.
- If the action's artifact is not in `scope`, stop.
- Advancing the stage is an explicit write, done only on user direction.
- Turns a negative rule into a positive, file-backed precondition.
- Mirrors the repo's existing use of `plans/NN-*.md` as the spec of record.

Enforcement points: (a) agent reads the file before editing; (b) user can
correct it at any time; (c) git history shows who advanced the stage and when.

### 2. Pre-commit hook — wrong layer

Runs after the violation. Does not address "don't start editing." Not useful
for this failure mode.

### 3. Harness-only guardrail (procedural, cheap)

During RED, the only permitted command is the test harness
(`./tests/test_issue_branch`). The harness cannot write `src/`. So RED
mechanically cannot edit implementation. Simple and real, but procedural.

### 4. Explicit stage declaration per turn (tripwire)

Lowest-tech: agent opens any file-touching turn with
"Authorized stage: X. Next action: Y. Y is inside X."
Makes the boundary visible in the transcript for one-glance correction.
Complementary, weak alone.

## Recommended combination

Implement 1 + 4:

- Add a tracked `plans/.stage` containing `PLAN` / `RED` / `GREEN` plus a
  scope line.
- Add an AGENTS.md line: "The current stage is recorded in `plans/.stage`.
  No agent edits code outside that stage's scope; advancing the stage
  requires explicit user direction and is done by writing the file."
- Agent declares the stage in one line at the top of any turn that will
  touch files.

## Honest caveat

None of this *forces* the agent — a file can be ignored as prose was. The
difference is that a stage file is a single concrete artifact to check
(vs. a rule to recall) and is externally auditable in the diff. For actual
hard enforcement, the lever is permission/allowlist scoping: a mode in which
writing `src/` is not permitted during RED. That is a tooling change, not a
docs change.

## Resume point

When picking this up: decide whether to adopt `plans/.stage` + the AGENTS.md
line (docs/config change, needs approval), and/or pursue permission-level
scoping. The underlying issue-branch workflow work is paused with
`tests/test_issue_branch` carrying an approved RED rewind and
`src/issue-branch` holding unapproved partial edits.
