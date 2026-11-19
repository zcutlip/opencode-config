# Workflow Supervisor — Portable Requirements

Status: drafted 2026-11-19. These requirements are harness-agnostic: they
describe what must exist and what must happen, not which host APIs provide it.
A reference implementation exists for one harness (OpenCode V2, server-plugin
form, Phases 1–3 validated 2026-11-17); this document is what another agent
needs to rebuild the tooling for a different agent harness, or to determine how
much of it that harness can support.

## 1. Purpose

Move routine phase-transition review out of the user's critical path. A
deterministic supervisor observes an agent's work at meaningful checkpoints,
preserves evidence, obtains an independent read-only review, and — in stronger
modes — delivers attributed corrections to the working agent. The user remains
the transition authority until deterministic gates exist.

Threat model: mistakes and over-eager goal pursuit — scope creep, design drift,
tests written after implementation, edits to locked tests, phase skipping — not
a deliberately malicious agent.

## 2. Roles and authority

- **Builder** — the agent session doing project work.
- **Supervisor** — deterministic extension code (plugin, daemon, or external
  client) owned by the host harness. Never a model. Observes events, collects
  evidence, creates reviewers, records state, injects steering. Holds the
  recorded phase and ledger in later phases.
- **Reviewer** — a fresh, read-only agent session created per checkpoint.
  Judges semantic compliance only. Advisory: it cannot edit, run commands,
  approve transitions, or advance a phase.
- **User** — owns the policy, grants phase transitions, receives escalations.

Separation of judgment and authority is mandatory: the reviewer judges
*whether the work matches the agreement*; only deterministic supervisor code
decides *whether a transition is mechanically legal*. Reviewer prose never
directly changes recorded state.

## 3. Modes

- `off` (or absent policy) — no automatic work. Manual review remains
  available everywhere.
- `advisory` — automatic checkpoints and a review ledger; no messages to the
  builder, no gates.
- `steer` — advisory plus attributed findings delivered to the builder and
  reasserted on later model calls.
- `enforce` — steer plus deterministic phase gates (see §8; build last).

Every ledger entry records both `requestedMode` and `effectiveMode`; a mode
whose capabilities are not yet implemented must never be silently claimed
(record `effectiveMode: "advisory"` until they are).

## 4. Host-harness capability requirements

This is the portability core. For each capability: what it is, which mode
needs it, and the fallback when absent.

- **C1 — Turn-completion signal.** The harness exposes when a builder turn
  finishes (execution success/failure/idle event or equivalent callback).
  Needed for: automatic checkpoints (`advisory`+). Fallback: explicit
  checkpoint tool only, or manual review.
- **C2 — Independent session creation.** The supervisor can create a reviewer
  session that (a) runs under a specified read-only role, (b) starts with
  fresh context, (c) is *not* a child that reports back to or wakes the
  builder, and (d) carries metadata the supervisor can recognize. Needed for:
  all automatic review. Fallback: a child subagent reviewer costs independence
  — its completion wakes the builder and couples the two sessions; acceptable
  only for manual on-demand review.
- **C3 — Transcript access.** Read the observed session's messages: at
  minimum the latest user request and latest assistant text; ideally the
  ordered message list. Needed for: evidence.
- **C4 — VCS access.** Working-tree status and diff for the project root
  (harness API or subprocess). Needed for: evidence.
- **C5 — Reviewer permission fence.** The reviewer role denies file writes,
  command execution, network, and delegation; allows read/search only.
  Needed for: review integrity in every mode.
- **C6 — Policy/state write denial.** Agents cannot edit the policy file or
  runtime state. Needed for: `enforce` posture; strongly recommended earlier
  so a builder cannot disable its own supervision.
- **C7 — Attributed message injection.** The supervisor can deliver a message
  into the builder session, queued without waking an idle builder, and
  labeled as supervisor-originated (metadata), never presented as user input.
  Needed for: `steer`. Fallback: report-only advisory.
- **C8 — System-context hook.** The supervisor can append persistent context
  (active contract, unresolved findings) to every model call in the builder
  session, including tool-driven continuations. Needed for: `steer` to remain
  effective beyond the first injected message. Fallback: single-message
  steering only, weaker but usable.
- **C9 — Session visibility control.** Internal reviewer sessions can be
  hidden from pickers/lists and/or archived while remaining retrievable for
  audit. Hygiene; optional but strongly recommended — otherwise every
  checkpoint pollutes the session list.
- **C10 — Tool/command registration.** A `checkpoint` tool or command the
  builder can invoke explicitly. Optional; automatic triggers suffice without
  it.
- **C11 — Permission evaluation hook.** The harness can evaluate an action
  against rules and return allow/deny/ask without performing it, and can deny
  per-path writes for named roles. Needed for: `enforce` gates and test
  locking.
- **C12 — Session interruption.** Stop an active session. Optional; later
  phase. Must be bounded and never triggered by reviewer prose alone.
- **C13 — Session metadata/tagging.** Supervisor-created sessions are marked
  so their own events are ignored (recursion prevention).

### Degradation matrix

What is achievable at each capability tier:

| Capabilities present | Achievable behavior |
| --- | --- |
| C2 (child-only) + C5 + C10 | Manual on-demand review command (Phase-1 equivalent) |
| + C1, C13, C2 (independent), C3, C4 | Automatic advisory checkpoints + ledger |
| + C7 | Steer (single-message delivery) |
| + C8 | Steer (full: reasserted on every model call) |
| + C6, C11 | Enforce (deterministic gates, test locking) |
| + C9 | Session-list hygiene (independent of mode) |

A harness without C2-independent (parentless sessions) cannot support passive
automatic review without waking builders; document that limitation rather
than hiding it.

## 5. Functional requirements

Numbered for traceability. `MUST` / `SHOULD` per RFC 2119.

### Activation and policy (R-ACT)

- **R-ACT-1** — Activation is per-project, decided by a user-owned policy
  file at a documented project-root-relative path (recommended default:
  `.workflow/policy.jsonc`). Absent, `enabled: false`, or `mode: "off"` =
  no automatic work, no state files.
- **R-ACT-2** — The policy is an enforcement boundary, not an agent setting:
  agents MUST be denied edits to it (C6), and cannot enable, disable,
  upgrade, or downgrade their own workflow.
- **R-ACT-3** — Required fields for enabled non-off policies: `enabled`
  (boolean), `mode` (one of the four), a nonempty `workflow` label, integer
  `version` (policy schema version), and `contract` — a path relative to and
  contained within the project worktree. Reject unknown fields, invalid
  types, absolute or escaping contract paths, and unsupported versions.
- **R-ACT-4** — `workflow` is a free-form discipline label (e.g.
  `contract-tests-lock-verify`, `tdd-scaffold-red-green-refactor`); the
  contract path is what supplies the review baseline. A future gate phase may
  pin accepted `workflow` values; do not guess them now.
- **R-ACT-5** — Resolve the policy per *target session's* project, not the
  supervisor's installation location. Subdirectory sessions inherit their
  repository's policy; nested repositories are separate boundaries;
  worktrees/parallel checkouts share policy but keep independent runtime
  state.
- **R-ACT-6** — Malformed policy MUST fail closed: surface a visible
  configuration error, suppress automatic reviews and injection, block gated
  transitions. Malformed is not `off`.
- **R-ACT-7** — Enabling a mature project records an adoption baseline
  (current commit, existing contract/tests, starting design phase, fresh
  test manifest) and never claims retroactive tests-first evidence.

### Observation and checkpoints (R-OBS)

- **R-OBS-1** — Automatic checkpoints trigger on turn completion (C1) in
  enabled projects; explicit checkpoints via tool/command (C10) when
  available. Never per-token or per-tool-call review.
- **R-OBS-2** — Before any work: resolve the target project's policy; if
  absent/off, return without evidence, reviewer, message, state write, or
  gate.
- **R-OBS-3** — Checkpoint identity is deterministic (hash of session ID +
  trigger + evidence hash). Identical checkpoints dedupe: a second claim
  returns `duplicate` and starts no reviewer.
- **R-OBS-4** — Recursion prevention MUST hold: reviewer sessions,
  supervisor-tagged review sessions, and child/sub-agent sessions of the
  observed builder are excluded from automatic review.
- **R-OBS-5** — Evidence above a size limit truncates, and truncation blocks
  review (record `failed: evidence truncated`) rather than reviewing a
  partial packet silently.
- **R-OBS-6** — Observers are scoped per location/project so one project's
  events never produce reviews in another.

### Evidence (R-EVI)

- **R-EVI-1** — Each checkpoint captures, at minimum: working-tree diff and
  status (authoritative change set), the observed session's latest user
  request, latest assistant text, the contract content, requested/effective
  mode, and provenance (trigger, session ID, timestamp).
- **R-EVI-2** — Evidence records completeness flags per source (working diff,
  turn diff, events). An unavailable source sets its flag `false` and is
  recorded as such in provenance — never silently dropped.
- **R-EVI-3** — If turn-scoped diffs are unavailable (capability missing),
  record `chronologyAllowed: false`; the reviewer then MUST NOT claim
  turn-ordered behavior from a whole-tree diff.
- **R-EVI-4** — Tests-first ordering cannot be inferred from a final diff;
  chronological evidence is required wherever a gate depends on it.
- **R-EVI-5** — The reviewer envelope MUST carry: the user request verbatim
  (or an explicit unavailable marker), the review mode
  (`checkpoint` — current working-tree changes only, or `full` — explicit
  base-to-HEAD audit), the changed-file list, evidence paths, and provenance.
  Default mode: `checkpoint`; `full` only on explicit request.

### Reviewer (R-REV)

- **R-REV-1** — One fresh reviewer per checkpoint (C2): fresh context,
  read-only fence (C5), optionally a distinct model. The independence
  properties that matter are fresh context, separate evidence, no write
  authority, and inability to advance its own verdict — a different model is
  optional.
- **R-REV-2** — The reviewer MUST be evidence-bound: review only what is
  supplied or readable in-project; never treat the builder's summary as
  proof; never infer chronological behavior from a final diff; report
  missing evidence as unknown rather than guessing.
- **R-REV-3** — The reviewer MUST be scoped: identify the phase/transition/
  contract first, investigate only evidence that can support or contradict
  the applicable requirements, report minor findings only when they affect
  contract or test integrity, group related symptoms into one finding, and
  stop once every applicable requirement is classified
  supported/contradicted/unknown. No hard finding-count cap.
- **R-REV-4** — The reviewer MUST NOT implement fixes, invent alternative
  designs, run tests, edit files, or advance phases.
- **R-REV-5** — Reviewer runs are bounded by a configurable deadline
  (reference default: 5 minutes). On timeout, interrupt the reviewer session
  only (never the builder), record `failed: timeout`. The deadline is a
  backstop; the scope rules above are the primary cost control.
- **R-REV-6** — Reviewer failure (error, empty report, non-success outcome)
  records a failed checkpoint; it never fabricates a verdict and never steers.
- **R-REV-7** — Reviewer sessions are archived after completion, failure, or
  timeout (C9) and remain retrievable for audit by ID or archived-listing
  flag.

### Report and verdicts (R-REP)

- **R-REP-1** — Every report states `Mode: checkpoint | full` and one
  verdict: `SUPPORTS_TRANSITION | CONCERNS | INSUFFICIENT_EVIDENCE |
  NOT_REQUESTED` (`NOT_REQUESTED` for clean no-transition checkpoints).
- **R-REP-2** — Each finding carries: Severity (major/minor), Requirement
  (the contract rule), Evidence (`path:line` or specific supplied output),
  Deviation, and Minimum correction. Reports with no findings say so
  explicitly rather than manufacturing issues.
- **R-REP-3** — Every report lists unknown or unverifiable items separately.
- **R-REP-4** — Verdicts are advisory in all implemented modes; no report
  text directly changes phase state.

### Ledger and state (R-LED)

- **R-LED-1** — Per-worktree runtime state under a documented project-local
  directory (recommended: `.workflow/state/`), self-ignored by version
  control via a generated ignore file. Policy may be committed; state never.
- **R-LED-2** — An append-only ledger (JSONL) records every checkpoint:
  id, session, trigger, requested/effective mode, status
  (completed/failed/duplicate), reviewer session ID, usage (tokens, cost,
  elapsed), and paths.
- **R-LED-3** — Each checkpoint directory holds `checkpoint.json`,
  `evidence.json`, `events.json` (ordered, with sequence numbers), and
  `report.md`.
- **R-LED-4** — State and ledger survive supervisor reloads and host
  restarts; a crashed or restarted supervisor resumes from disk without
  duplicating in-flight checkpoints (dedup by claim).

### Steering (R-STG) — `steer` mode only

- **R-STG-1** — A completed checkpoint with findings sends exactly one
  attributed message to the builder (C7): queued delivery that does not wake
  an idle builder, labeled with supervisor metadata (never disguised as user
  input), referencing the checkpoint ID and report.
- **R-STG-2** — Reports without findings send nothing. `NOT_REQUESTED`
  clean checkpoints send nothing.
- **R-STG-3** — Identical reports are deduplicated by content; distinct
  reports are bounded (reference default: 3 distinct unresolved reports per
  session), after which the supervisor stops injecting and records an
  escalation for the user.
- **R-STG-4** — When C8 exists, a system-context hook reasserts the active
  contract path and unresolved findings on every model call in the steered
  session, including tool-driven continuations.
- **R-STG-5** — Explicit/manual checkpoints never steer; they are
  report-only.
- **R-STG-6** — Reviewer failure or timeout never produces a steering message.

### Configuration errors (R-ERR)

- **R-ERR-1** — Malformed policy, invalid contract path, and
  repository-resolution failures surface through every available channel:
  a visible UI notification, a host log, and an error ledger entry when the
  state root resolves.
- **R-ERR-2** — Errors dedupe by content fingerprint until the input changes.
- **R-ERR-3** — Configuration errors never invoke a reviewer and never
  inject messages.

## 6. Enforcement gates (future phase; requirements pinned now)

Build only after steering is validated. Requires C6 + C11.

- **R-GAT-1** — A `request_transition` tool lets the builder request a phase
  change; only deterministic supervisor code grants it and updates recorded
  phase.
- **R-GAT-2** — Mechanical legality at minimum: chronological evidence that
  tests were written and failing before implementation, the contract hash,
  a locked-test manifest with hashes, and the reviewer verdict. Fail closed
  on missing evidence, hash mismatch, reviewer failure, or ambiguity; the
  denial names the missing item.
- **R-GAT-3** — Gates check *which files changed under the current phase*, not
  only the recorded phase — otherwise an agent implements early while
  leaving the phase untouched.
- **R-GAT-4** — At the lock transition: hash the contract, record the test
  manifest, deny direct writes to locked tests for every participating role,
  and re-verify at later transitions.
- **R-GAT-5** — A write-deny does not stop command execution; combine narrow
  command permissions with manifest verification. A genuine adversarial
  boundary needs an external test authority or OS sandbox — document this
  honestly as the cooperative-agent limit.
- **R-GAT-6** — All participating primary and child sessions in an enabled
  project face the same enforcement backstop; gates belong to the project,
  phase state to the worktree.

## 7. Data model (recommended concrete shapes)

Policy:

```jsonc
{
  "enabled": true,
  "mode": "advisory", // off | advisory | steer | enforce
  "workflow": "contract-tests-lock-verify",
  "version": 1, // policy schema version
  "contract": "docs/contract.md" // relative to worktree root
}
```

Checkpoint directory:

```
<state>/checkpoints/<checkpoint-id>/
  checkpoint.json   // verdict, usage, reviewer session id, status, modes
  evidence.json     // captured evidence + completeness flags
  events.json       // ordered events with seq numbers
  report.md         // reviewer output verbatim
```

Ledger entry (one JSONL line):

```jsonc
{
  "id": "<checkpoint-id>",
  "sessionID": "ses_builder",
  "trigger": "execution | explicit",
  "requestedMode": "steer",
  "effectiveMode": "steer",
  "status": "completed | failed | duplicate",
  "reviewerSessionID": "ses_reviewer",
  "usage": { "tokens": {...}, "cost": 0, "elapsedMs": 205000 }
}
```

## 8. Non-goals

- No per-token or per-tool-call review.
- No model evaluation inside every permission check.
- No automatic remediation of findings.
- No interruption based solely on reviewer prose.
- No cron-driven self-review inside the builder's session.
- No retroactive tests-first claims for pre-existing work.
- The reviewer never implements fixes.

## 9. Acceptance criteria

Validate each mode before adding authority to the next.

- **Manual review** — reports conform to R-REP; the reviewer performs no
  writes; every finding cites evidence.
- **Advisory** — run 10–20 real checkpoints in an enabled project; every
  completed checkpoint has a verdict, evidence, and ledger entry; record
  actionable findings, false positives, duplicates, and missed deviations;
  implementation proceeds only when the user judges the findings reliable.
- **Steer** — a findings checkpoint delivers one attributed queued message;
  the builder acts on it without user relay; a clean `NOT_REQUESTED`
  checkpoint sends nothing; identical reports dedupe; the limit escalates;
  with C8, later model calls carry the reasserted context.
- **Hygiene** — reviewer sessions are absent from the session picker after
  use and retrievable by ID or archived flag.
- **Enforce** (when built) — a legal transition passes; an illegal one is
  denied naming the missing evidence; a hash mismatch is denied; reviewer
  failure blocks; a builder cannot edit policy or state; locked-test edits
  are denied for every role.

## 10. Porting guidance

- Start at the highest achievable row of the degradation matrix; do not
  emulate missing capabilities with prompts.
- The supervisor is deterministic code; keep it that way. All judgment goes
  through the reviewer; all authority goes through the supervisor; the user
  holds the policy.
- Keep evidence on disk inside the project, never in host-private caches —
  reviewer fences commonly deny out-of-project reads.
- Hot-reload changed supervisor code where the harness allows it; never
  require a host restart for a supervisor change unless the harness has no
  live-reload surface.
