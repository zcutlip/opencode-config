# Phase Ratchet Prototype — Write-up

Source: designed and tested interactively with the user in this session (2026-10-25 – 2026-10-27). Prototype lives in scratch dir `/private/var/folders/d4/2v43w97j6nb7l56kvm59ngmw0000gq/opencode/ratchet-prototype` (temp — re-creatable from this note).

## Idea

A one-way phase gate for OpenCode work: FOO → BAR (linear for now; branching deferred as unbounded complexity). The agent path moves forward only. The user ("god" — owns the machine, drives the agent) keeps a manual override outside tool permissions for emergencies (e.g. blocking FOO work discovered during BAR).

Threat model agreed: mistakes and over-eager goal pursuit, not active malice. Prompt injection is a secondary concern. Shell lockdown against a determined adversary is out of scope — OpenCode docs state shell runs with full user authority and directory inference is best-effort.

## How it works

- Phase file: `<project>/.opencode/phase`, content `FOO` or `BAR`. Per-project by construction (resolves via `ctx.location.directory`), so project A locking BAR never hoses project B.
- Advance script: `scripts/ratchet-advance.sh BAR`. Sole writer. Checks current on disk, allows only FOO→BAR, refuses repeats/skips/unknown (exit 1 + reason). Atomic write via tmp+mv. No `--force` — the user's hand-edit is the force path.
- Privilege split: nobody (not even the auditor) gets direct `edit` on the phase file (static deny for all). Only `audit-foo` may execute the advance script, and only with the `BAR` arg. The auditor decides *when*; the script decides *whether*.
- Enforcement sits under agent identity: a `permission.evaluate` hook reads the phase file per check and flips `allow`/`ask` to `deny` regardless of which agent issued the call. Separate narrow agents alone can't do this — `build` could otherwise just bypass the foo worker.
- `build` is an orchestrator in the prototype: direct `edit` on `foo/**` and `bar/**` denied, `shell *` set to `ask`, so phase writes must go through the narrow workers (shell limited to ls/cat). The hook stays underneath as the uniform backstop, including over `build` itself.

## Prototype layout

- `opencode.jsonc`: top-level deny on `.opencode/phase` edits; agents `foo-worker` (edit foo/**, narrow shell), `bar-worker` (mirror), `audit-foo` (no edits, shell only ls/cat + advance script with BAR), `build` (deny direct phase edits, shell ask).
- `.opencode/plugins/ratchet/index.ts`: self-contained server plugin (no deps). Denies direct phase-file writes through tools; in BAR denies `edit` touching `foo/` and non-read-only shell touching `foo/`; read-only shell (ls/cat/head/tail/grep/rg/glob/file/stat/readlink) still allowed.
- `foo/notes.txt`, `bar/notes.txt`: phase work areas.

## Test sequence and evidence

All run by the user from a fresh session rooted in the prototype dir (starting phase FOO):

1. `foo-worker` appends to `foo/notes.txt` → allowed (baseline).
2. `build` asked directly to touch `foo/` → unable (delegation forced). User added `shell * ask` to build so it can't route around the edit denial via shell unprompted.
3. Open question answered: in FOO, `bar-worker` editing `bar/` allows — the prototype freezes only the *old* phase after advancing, not the *future* phase beforehand. A `bar/` append at 19:07 (mtime) therefore proved future-open, not BAR-allow, since the flip came later. Strict mirror (deny `bar/` in FOO) deferred; `touchesBar` helper already in plugin for it.
4. `audit-foo` runs `./scripts/ratchet-advance.sh BAR` → `advanced FOO->BAR` (phase mtime 19:15:31).
5. `foo-worker` appends to `foo/` in BAR → denied ("foo/ frozen in BAR").
6. Direct edit of `.opencode/phase` → denied by static config rule (explicit deny is final, so the hook's nicer "script-owned" message never fires — expected, fine).
7. `./scripts/ratchet-advance.sh FOO` via `audit-foo` → blocked at the permission gate (`shell` denied; only the BAR arg is allowlisted). Outer layer holds before the script runs.
8. Re-run `./scripts/ratchet-advance.sh BAR` in BAR → script refuses: `already BAR, no repeat advance`, exit 1. Inner layer holds.
9. Shell bypass attempt from `build`: `echo test >> foo/notes.txt` → initially SUCCEEDED (foo/notes.txt:3 `test`). Root cause: the plugin's `touchesFoo` regex `/(^|\/)foo\//` only matched at string start or after `/`, missing space/redirect-prefixed relative paths. Fixed to `/(^|[\s\/"'`=:.])foo\//` (+ `touchesBar` twin), cleaned the test line, re-parsed ok, restarted session. Retry → denied: `Phase is BAR: shell touching foo/ is blocked`. Both layers now hold on edit and shell.
10. User hand-edits `.opencode/phase` back to FOO → `foo-worker` append allows again. God-mode override confirmed; agent path stays one-way.

## Known limits

- Broad-shell agents can likely still obfuscate paths past the substring hook (`$VAR`, interpreter-internal opens). Fine for mistakes, not for malice — accepted.
- The temporary `opencode.jsonc` write allow used during setup is a project-scoped saved approval (this repo's git is clean; no versioned rule changed). Remove it from the TUI permissions list when done tinkering so the global config-edit fence is fully closed again.
- Plugin edits require a fresh session (or service restart) to reload.

## Next

- BAZ chain (second auditor, `audit-bar`, same pattern), and/or the strict FOO-freezes-bar mirror if ordering needs teeth.
- Rebuild script from this note if the temp dir gets reaped.
