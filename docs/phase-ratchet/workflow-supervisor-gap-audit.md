# Workflow Supervisor — Gap Audit Against the Companion Design

Status: drafted 2026-11-25. Compares the companion project's three shared
documents (`claude-port/glossary.md`, `workflow-catalog.md`,
`workflow-format.md`) against this repo's requirements
(`workflow-supervisor-requirements.md`), phase docs, and the live plugin
(Phases 1–3, amendments A4–A18). Input to the Phase 4 contract; no code
change proposed by this document alone.

Evaluation criterion (user-stated, memory #641): reduce cognitive load on
the user without compromising output quality. Every adopt/diverge call
below is measured against it.

Not checked: the companion docs cite `claude-code-port.md`, their
requirements document, and `opencode-lessons.md` — none are on disk here.
Two cited lessons (#15 incidents log, #16 supervision ends when the work
ends) are recognizable as ours from the 2026-11-22 rag-mcp sweep, so the
blind spot is narrow; their adapter, approval-surface, and steering
details remain unverifiable until the most recent versions are shared.

## Headline

The companion design is the gate engine we deferred: definitions,
primitives, evaluation order, records, locks. Adopt it as the Phase 4
foundation nearly whole. What we built and they lack is the soft-side
runtime layer (delivery, wakes, episodes, muting, visibility); it lives
around the gate and is unaffected. Three divergences are deliberate and
already settled: the no-config advisory floor, informed advisory, and
`.opencode` paths.

## Decisions settled in review, 2026-11-25→27

Recorded here so they survive outside session storage; note #22 carries
the same list with provenance.

1. **Informed advisory (a2)** — already in §1; settled against the
   project purpose: reduce the user's cognitive load without
   compromising output quality. Inert is a load trap; granting on
   silence is exactly the load this project removes.
2. **Approval surface (f)** — a TUI command in the `/approved` shape
   (`src/commands/approved.md`): one word, no confirmation step, no
   mid-gesture display; rule results and verdict live on the badge and
   report *before* the user decides. Routes to the supervisor's ledger
   record, never to the builder's ears. Approval rules are optional per
   transition — routine clean transitions advance without the user (the
   original motivation). Build with Phase 4; until then `/approved` is
   the right tool.
3. **Definition-authoring skill (g)** — first-class, not exclusive:
   definitions are machine-parsable files, so hand-authoring and
   third-party tooling stay fully valid; the format plus validator are
   the contract. The agent drafts from the nearest built-in; the user
   approves before pins.
4. **Resting state for fluid work (c)** — scope-guard default with
   optional off; enforcement only where work repeats a shape. The
   no-config floor already delivers scope-guard-equivalent review.
5. **Command execution host** — the plugin (deterministic code, no
   model turns) runs the policy-pinned command and persists exit code
   and output as rule evidence; timeout aligned with the companion's
   600 s default, separate from the reviewer budget. Highest-value
   Phase 4 mechanism: it ends the dispatched-run treadmill class.
6. **Judgment-only ask channel (A19)** — built 2026-11-26, not deferred:
   `/ws-review <question>` rides the typed question into the reviewer
   envelope only; the verdict is report-only on the badge and in the
   report; the builder never sees it. The question is hashed evidence
   identity, so distinct questions claim distinct checkpoints.
7. **Shell containment is stage-scoped (i)** — settled 2026-11-27 from a
   filament audit (81 shell calls: ~49 read-only git/grep/ls with tool
   equivalents, ~23 test/check runs the supervisor takes over, 3 `bun -e`
   probes, 2 setup writes). Keep shell in advisory/scaffold; fence it
   only inside enforce stages using the ordering rule, where the
   supervisor runs pinned commands and every write comes through file
   tools. No global neutering.
8. **No dedicated per-stage agents (j)** — settled 2026-11-27. Same
   builder throughout; the supervisor enforces the current stage's
   allowed set per file write via the permission hook. Definitions
   describe all stages; the engine switches the rules as stages change.
9. **Advisory cross-stage help (k)** — settled 2026-11-27. The supervisor
   does the diff-vs-scope check; the user reads the verdict. Badge holds
   `review:concerns` + checkpoint (A18) with attempts while unresolved,
   toast on escalation; informed advisory adds stage rubrics so
   streams-crossed arrives as a finding with files named. The grant comes
   from the verdict, never from a personal diff walk.

Also settled in discussion, informing §4.2: the gate rules run on
**what** (git — unconditional) and **when** (the observed write log —
coverage-bounded); nothing runs on **who** — actor identity routes
delivery (which session gets findings) and never decides a rule.
Unattributed changes default to the stage owner with their origin
disclosed; the user's own out-of-band work is exempt from audit.

**Still open:** the write-event log's strictness (audit §4.3) — proposed
grade: unobserved chronology records `unknown` in advisory (never
"failed"; no contradiction exists, just no proof) and denies only in
enforce, with the authoring step warning shell-heavy projects before a
chronology rule ever denies a cycle. Awaiting the user's verdict.

## 1. Adopt as-is (Phase 4 foundation)

| Item | Their spec | What it closes on our side |
| --- | --- | --- |
| Definition schema: stages, transitions, rules, scope by path role, cycles, start rules, tiers, pins | Format §2, §4–§5 | Our `workflow` field is still a free-form label (R-ACT-4's deliberate deferral); this is what it resolves to. Interchange: their built-ins (`tdd`, `bug-fix`, `scope-guard`, `contract-lock`) drop in unchanged. |
| `run` primitive: engine runs the pinned command, persists exit/duration/output keyed by rule ID, truncation marked | Format §6, §6.1 | The collection half — the treadmill's root cause (four dispatched runs, zero captured results, 2026-11-25). Gate evidence becomes first-hand; the reviewer stops demanding what capture cannot deliver. |
| Evaluation order: implicit scope/lock → all deterministic rules → review only if those passed → approval last | Format §5.4 | Phase 4's gate order, pre-solved. Reviewer spend never fires on an already-denied transition; the user approves with every result in hand. |
| `committed` primitive + deny `git commit` in builder sessions | Format §6, §6.1 | Pairs with our A10 read fence; same project-local deny pattern as the filament test-command fence. Records sign-off and gives later changes a git baseline. |
| Locks: hash manifest at lock time, permission-hook write deny, re-verify at every transition | Format §5.5, §9.2 | R-GAT-4's design, fully specified. We have no lock mechanism today. |
| Stage-entry snapshots for scope and `diff_budget` | Format §9.1 | R-GAT-3 (check which files changed, not just the recorded phase) becomes mechanical instead of reviewer-judged. |
| Hash-chained ledger (`seq`/`prevHash`), state mutex, atomic writes, exclusive-create claims | Format §9.4 | Our `FileLedger` is plain JSONL — no chain, no mutex, no tamper evidence. Also refines our known gap: a killed review leaves an inert `claimed` entry; their claim file makes abandonment explicit. |
| Pins: definition tier/path/hash + policy hash recorded at instance start, re-resolved per event, mismatch fails closed, reload records old→new | Format §2.3 | We re-read policy every event but never detect mid-flight changes. Their rule that a policy edited to `off` is a mismatch (not silent disable) closes a real hole: our own fence blocks agent edits, not user-side mistakes. |
| Instance lifecycle: terminal stage ends supervision; explicit checkpoints still available | Format §9.3 | Encodes our rag-mcp lesson structurally (the reviewer auditing the principal's release work). Today we keep reviewing every turn after the work is done. |
| Informed advisory: rules evaluated non-enforcing, results recorded `enforced: false`, stage rubrics to the reviewer envelope | Format §7 | Already settled as a2 (2026-11-25): definition present in advisory upgrades the mode; grant decisions stop resting on silence and quoted numbers. |
| Approval-surface requirement: no builder tool call, scheduled prompt, cross-session message, or subagent report may produce an approval; every approval recorded with source; override limited to reviewer-failure denials | Format §6.2–§6.3 | The authority rule for Phase 4's `approval` primitive. We have no approval surface today — the user grants by chat. |
| Severity rubric keyed to consequence: blocking = wrongly granted transition or violated lock; major = misleads a transition decision or forces rework; minor = else; only blocking+major delivered | Glossary, §6 | Sharpens our 2026-11-22 rubric by tying `blocking` to transitions/locks; matches our A14 delivery gate. Their finding-`repeats` IDs formalize our "previously steered, still unresolved" convention. |
| Verdict vocabulary and checkpoint-ID formula | Glossary, §9.4 | Identical to ours (`SUPPORTS_TRANSITION | CONCERNS | INSUFFICIENT_EVIDENCE | NOT_REQUESTED`; ID = hash of session+trigger+evidence) — no divergence, confirm and cite theirs. |
| Config-read hardening: containment via realpath at read time, regular-files-only, 1 MiB cap, UTF-8, hash-over-bytes | Format §2.1 | Our policy loader validates shape but not size/encoding/symlink-at-read. Cheap hardening, adopt. |
| Envelope lists which rules were mechanically verified | Format §7 | The reviewer never assumes the gate checked something it did not — same principle as our envelope-completeness flags. |
| `supervision: attended | unattended` (unattended requires enforce; user-needed things escalate) | Format §3.1 | We have no such axis; our wake design implicitly assumes attended. Needed before any autonomous grant. |
| Glossary vocabulary + words-to-avoid table | Glossary | Adopt wholesale for workflow terms (stage, transition, rule, primitive, lock, scope, path/command role, claim, manifest, snapshot, write event, fail closed); prevents translation drift. |

## 2. Deliberate divergences (settled, with reasons)

| Divergence | Theirs | Ours | Reason |
| --- | --- | --- | --- |
| No-config advisory floor | An unresolvable workflow name is a configuration error in every mode | Below `enforce`, a missing definition is not an error: contract-only review, no transitions, user is the entire gate | Memory #641 — config that costs effort without function is disqualified; the zero-load entry must survive |
| Definition required for advisory-with-transitions | Mandatory in every enabled mode | Opt-in by file presence; informed only when provided | Same principle, other side: transitions are what a definition buys |
| State and policy paths | `.workflow/policy.jsonc`, `.workflow/state/` | `.opencode/workflow.jsonc`, `.opencode/workflow-state/` | Continuity with deployed projects (filament, rag-mcp); the Phase 4 delta carries a one-line mapping, not a migration |
| Policy schema | Adds `supervision`, `paths`, `commands` bindings | Same file grows those fields only when a definition requires them | Config-free policies stay exactly as today |

## 3. Ours they lack (soft-side runtime layer — keep, map in the delta)

| Capability | Amendment | Relationship to the gate |
| --- | --- | --- |
| Live delivery + wake-on-findings + wake frame | A11–A13 | Around it — the gate's verdict must reach a builder; their docs specify steering as a requirement (R-STG) but its details live in the missing port doc |
| Severity-gated delivery, budget counts reviewer-marked repeats, re-arm on progress | A11, A14 | Around it — their severity table matches ours; their budget mechanics are unverifiable (missing doc) |
| Episode modes (collab/delegate) + one-ride window | A4, A8 | Orthogonal — collaboration routing, no equivalent in their schema |
| Chore-turn skip + no-op turns judged on claims | A15, A16 | Improvement they should want: their design reviews every turn; ours classifies turns mechanically and spends reviewer time only where it pays |
| Mute (titles + `/ws-mute`), held wakes for busy folders | A16 | Orthogonal — multi-session reality their single-builder model does not address |
| Persistent verdict badge | A18 | Around it — their visibility surface is unknown (missing doc); ours is live-verified |
| Settle/defer honesty, blocked-on-user naming | A9, A16 | Around it — evidence-window timing; their capture model differs (see §4) |

## 4. Open questions for the Phase 4 contract

Theirs (format §12) — carry forward: built-in parameter overridability;
override breadth beyond reviewer failure; `extends`; sanctioned reopening
of locked tests.

Ours — new, from this audit:

1. **Approval surface on OpenCode.** Their §6.3 rule is the requirement;
   the concrete channel (TUI command reachable only by the user, like
   `/ws-review` but for grants) is undesigned.
2. **Command execution host.** Who runs `run` commands — the plugin's
   server process, which environment, what timeout (their 600 s default vs
   our 5-minute reviewer budget) — and how raw output lands in evidence.
3. **Write-event log.** They require a durable hash-chained log for
   `written_before`; we have per-checkpoint captured events (A16 step
   events with `files`) but no durable log. Adopt their `events.jsonl`, or
   derive per-window from existing capture? Their unobserved-path fail-closed
   bites hardest for us: our builders live in shell.
4. **Stage-entry snapshot mechanism.** Their git-tree-object-via-temp-index
   approach needs git access our plugin lacks; nearest equivalent is hashing
   the working-diff file set, or the host `vcs` API. Decide in contract.
5. **Informed-advisory state location.** Extend `.opencode/workflow-state/`
   with `instances/` following their §9 layout, adapted.
6. **Prompt capture.** They record prompts at submit time independent of
   transcripts; we read the transcript's latest user message. Equivalent
   today; note as a porting difference, decide if independence is worth a
   capture step.

## 5. Recommended Phase 4 build order

1. Definition loading, validation, pins; policy `paths`/`commands` bindings.
2. Instance state + stage tracking with stage-entry snapshots.
3. Transition request + deterministic rule evaluation (`changed`, `run`,
   `committed`, `artifact`, `diff_budget`) with per-rule evidence
   persistence — the collection half; kills the treadmill class.
4. Informed advisory (same evaluation code, `enforced: false`, rubrics to
   envelope).
5. `review` + `approval` primitives; approval surface design (§4.1).
6. Locks (manifest, write-deny via C11-equivalent, re-verify).
7. `written_before` + durable write-event log — last, heaviest.

Each step is independently testable and leaves advisory-only projects
untouched.
