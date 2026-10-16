# Port ledger — V1 → V2 migration

Every archived item that won't announce itself when missing, with its
verdict, sorted into what's still open and what's settled. When something in
vanilla V2 annoys you, check here first — the old config may already solve
it, V2 may do it natively, or the row says where the old implementation is
buried.

Quiet items only — things that won't announce themselves when missing. Loud
things (commands you'd type, plugins that fail visibly) don't need tracking;
browse `archive/src/commands/` and `archive/src/skills/` when curious.

Verdicts: **ported** (live in the V2 config), **candidate** (port when
convenient), **parked** (deliberately deferred), **superseded** (V2 does it
natively), **dead** (meaningless in V2), **reference** (kept as a lookup,
not to port).

Sections: **Pending** = work or a decision outstanding. **Complete** =
settled — ported, superseded, dead, or externally managed — kept for the
record; consult before re-litigating.

## Pending

### Tier 1 — mechanics

| Item | Verdict / notes |
| --- | --- |
| watcher ignore list | **candidate** — trivially portable; node_modules/dist/build/.git/*.log |
| `autoupdate` → `update` | **candidate** — V1 had `true`; V2 default is `"notify"`; decide if `"auto"` is wanted back |
| `scripts/refresh-models.sh` (repo root) | **candidate** — kept live; verify `opencode models --refresh` exists on installed V2 before relying on it |

### Tier 2 — assets (plugins, skills, commands, themes)

| Item | Verdict / notes |
| --- | --- |
| cc-safety-net | **candidate** — V2-ready (explicit `opencode/v2` entry point, `npx cc-safety-net@latest install --opencode`). A guardrail (blocks destructive git/fs commands, secret access), not a behavior-modifier — masks nothing; add on first tremor |
| open-codebase-index | **candidate** — actively maintained; the one real capability gap (V2 has no native semantic search). Plugin or `opencode mcp add`; needs an embedding provider (the `nativ` server could feed it) |
| context-introspection skill | **candidate** — port as-is, zero adaptation; audits the agent's own injected context (provenance, verbatim quoting) — nothing native even tries. Already earned it once: the `AGENTS.disabled.md` possession incident |
| codeberg-integration skill | **candidate** — port as-is; Forgejo API helper scripts for your hosting choice |
| opencode-pricing skill | **candidate** — port for the value-ranking half (cache-ratio-adjusted effective cost); the price-table half is superseded by `/models` costs and the cmd-provider panel |
| opencode-release-notes skill | **candidate** — low priority; your own trim rules over GitHub releases; port whenever |
| lint-format skill | **parked** — the after-edit half is superseded by V2's native `formatter` config; remaining value is on-demand lint checks — revisit on friction |
| magic-context-release-notes skill | **candidate** — follows Magic Context, which is now live, so release curation pays |
| /search-session command | **candidate — needs adaptation** — wraps the V1-only session-manager plugin; a V2 port is a session-DB query command. The adopt-Magic-Context question it was meant to probe is answered (MC live); remaining use is direct transcript archaeology |
| opencode-session-manager plugin | **parked** — V1-only, no V2 port; Magic Context (live) now covers some of the archaeology need — revisit on residual friction |
| opencode-skill-creator (plugin + skill) | **parked** — V1-era plugin API, unverified for V2; the skill depends on the plugin's tools. Revisit when next building skills |
| agent-rules-reminder + test | **parked** — idea seed: agent-identity enforcement via tool-result injection; never worked in V1 (wrong hook?). Revisit only if V2 agents misbehave |
| commented-out plugin experiments (ponytail, better-hashline, runtime-fallback, @angdrew/hashline, froggy) | **parked** — never adopted; maybe interesting under V2, maybe not |
| themes (`archive/src/themes/cyberpunk.json`, `korp-net.json`) | **candidate — needs conversion, not copying** — V1-format (`defs` + `theme` maps) → V2 structure (`base`/modes, hue scales, semantic tokens). Live theme is built-in `matrix` (2026-10) — a snapshot, not a verdict. Reference: `notes/korp-net-notes.md` |

### Tier 3 — judgment (rewrite, never verbatim)

| Item | Verdict / notes |
| --- | --- |
| `AGENTS.md` global instructions (casual tone, delegation etiquette) | **candidate** — defused as `archive/src/AGENTS.disabled.md` after ambient pickup. Port the content to `src/AGENTS.md` when the vanilla tone grates |
| agent prompts (`archive/src/agents/*.md`) | **candidate** — port by rewriting, never verbatim. Strip the LSP line from `plan.md`; re-examine "delegate everything" now that background subagents are native. (`commit.md`: done, 2026-10 — the first agent port; see Complete Tier 2) |
| per-agent model picks | **candidate** — ride with the agent ports. Final V1 choices: mimo-v2.6-pro (plan), deepseek-v4.1-flash (build/coder), longcat-2.5-preview-free (commit/lint/task-rabbit); V2 IDs come from the cmd-provider catalog (e.g. `xiaomi/mimo-v2.6-pro`, `deepseek/deepseek-v4.1-flash`) |
| stop-gate / TDD enforcement (`commands/tdd-continue.md`, root analysis doc) | **parked** — separate future discussion |

## Complete

### Tier 1 — mechanics

| Item | Verdict / notes |
| --- | --- |
| `small_model` → V2 `agents.title.model` | **ported** — `agents.title.model` in `src/opencode.jsonc`, `opencode/big-pickle` (2026-10-11 — the opencode-go free tier shuts off at the Go limit and `-preview` models evaporate; was `opencode-go/longcat-2.5-preview-free`) |
| `nativ` provider | **ported** — V2 shape in `src/opencode.jsonc`: `package`, `settings.baseURL`, model `capabilities`, `compatibility.reasoningField` (from V1 `interleaved.field`) |
| model picks (default + title) | **ported** — default `opencode-go/glm-5.3-flash` (switched 2026-10 from V1's `commandcode/z-ai/glm-5.3-flash`); title `opencode/big-pickle` (2026-10-11 — Go free-tier shutoff + preview evaporation; was `opencode-go/longcat-2.5-preview-free`) |
| permissions wall (`archive/src/opencode.disabled.jsonc`) | **ported (2026-10); catalog stays reference** — live posture: shell `ask` as the fallback; git allowlisted for reads only (status/diff/log/show/ls-files/blame/rev-parse/cat-file/rev-list/describe/grep) with a `git *` catch-all deny — every unallowlisted git subcommand, mutating or future, is denied, and saved "always allow" approvals never override a configured deny; `oc-permissions` audits the saved-approval accumulator. The archive remains the symptom catalog — if V2 agents act up, find the behavior and write one narrow rule |
| config edit fence | **ported (2026-10-11)** — global `edit` denies in `src/opencode.jsonc`, anchored on **filenames not paths**: `opencode.json*` / `cli.json` (bare + `**/` forms — covers `.json` siblings, `.opencode/` nesting, and canonicalized `~/.config` edits), `service.json` (secret), and agent-definition `.md` in **all four discovery dirs** (`agents/`, `agent/`, `mode/`, `modes/`, bare + `**/`). Rationale, verified by probe (2026-10-11): agent frontmatter permissions **override** config fences when present (fm allow beat a live config deny — write succeeded), and config governs when frontmatter is silent (neutral probe: fm absent + cfg deny → write tool withheld, no file); so any writable agent `.md` is a fence override and all discovery dirs are locked. Repo-root `opencode.jsonc` carves the read/write exception for this repo (5 repo-relative allows; project rules append after globals, last-match wins). Deliberately still denied in-repo: shadow `opencode.json`, `.opencode/**` forms. Live evidence: `.opencode/agents/*.md` write `permission.rejected`; carve-out paths (`opencode.jsonc`, `src/opencode.jsonc`, `src/agents/*.md`) probe-verified tweak/revert; the singular-dir gap found + closed the same day. Deny-side firing in other projects is only observable there (carve-out always wins here, by construction). TUI and manual writes are unaffected — they never pass through agent tool permissions. Adjacent unfenced surfaces, left open on purpose: skills/commands `.md` are prompt-injection surfaces but carry no permission rules — gated tools still enforce |
| LSP (`lsp: true`, `lsp` permissions, "try LSP tools first" in `agents/plan.md`) | **dead** — LSP removed in V2; replace with project lint/typecheck (the `@lint` agent and `lint-format` skill pattern) |
| `hook/hooks.md.disabled` + `hook/inspect-bash.sh` | **dead** — V1 `hooks` mechanism has no V2 equivalent; plugins + `permissions`/`policies` own this now |

### Tier 2 — assets

| Item | Verdict / notes |
| --- | --- |
| Magic Context (`@cortexkit/opencode-magic-context`) | **ported (live 2026-10)** — anti-compaction + persistent memory (historian compartments, decay rendering, `ctx_expand` paging, capture/consolidate/recall), mutually exclusive with native compaction. Live via `opencode.jsonc` `plugins` + `compaction.auto: false`; its `tui-preferences.jsonc` is versioned in `src/`. Baseline experiment shortened by choice |
| commit workflow (`git-commit` skill + `commit` subagent + `/commit-delegate`) | **ported (live 2026-10)** — `src/skills/git-commit/` is the source of truth: atomic-commit rules; staging and committing split so the staged diff (`git diff --cached`) is reviewed between add and commit; compound stage+commit one-liners split; `git commit -a/--all/--patch/--include` forbidden. `src/agents/commit.md` is harness-agnostic role/workflow only (no permissions in Markdown — portable across harnesses); its OpenCode wiring lives in `opencode.jsonc` `agents.commit`: mode, cheap permuting model, `steps: 18`, and the fence — denied-everything-first shell ordering then allowlist (status/diff/log/add, commit→ask), edit/subagent/other-skills denied, git-commit skill allowed only here. `/commit` (src/commands/commit-delegate.md) carries commit authorization into the delegation. Push deny is subsumed by the global `git *` catch-all. Main-session verification (2026-10-11): direct `git add .`, compound `git add && git commit`, and unallowlisted `git tag -l` all denied, no prompt leaked. The config fence governs file-based agents whose `.md` is silent on permissions — proven by a neutral probe (write tool withheld), after the commit agent's own polite refusal was correctly rejected as evidence (refusal is prompt discipline, not a permission event) |
| commit dogfood (2026-10-14, three runs) | **fences updated the same day** — run 1: `git -C <path>`-prefixed commands match no prefix allowlist → denied; run 2: a bare zero-arg `git status` matches no `git status *` pattern either, and absent `git restore --staged` left a mixed index unsplittable → the test-audit port + LEDGER row landed as one commit (`3be6e0c`, docs-last split sacrificed); run 3: the commit landed agent-made — the ask gate reached `autoaccept` rather than a human (undetermined whether it fired honestly; `cli.json` flipped back to `prompt` 2026-10-15). Fixes applied: bare-form exact-literal reads (`git status`/`git diff`/`git log`) and `git restore --staged *` allow in the commit agent fence, bare reads also globally; agent prompt gained plain-forms rule, mixed-index report check, restore-based splitting, and subject/body via separate `-m` verified with `git log -1`. Still formally unobserved: the `git commit` ask reaching a human — next real `/commit` under `prompt` mode answers it |
| opencode-cmd-provider | **ported (live 2026-10)** — the CommandCode integration: auth (Host connection / `COMMANDCODE_API_KEY`), full `[CMD]` catalog, reasoning-effort levels, retries, prompt caching, `cmd_plan_summary` tool, Rates & usage panel. GOAT plan detected. Not to be confused with CommandCode's "Provider" — their pay-as-you-go service, not an integration |
| test-audit skill | **ported (2026-10-14)** — `src/skills/test-audit/` verbatim from archive except V1-isms removed: no LSP section, report line, or limitation note (LSP dead in V2; `checklists/coverage.md` manual fallback now greps for function names instead of `lsp.findReferences`); frontmatter trimmed to `name` + `description` (harness-agnostic). All 6 checklists + 5 framework guides untouched. Flakiness/fixtures/isolation checklists survive intact |
| `tui.json` (`archive/src/tui.json`) | **resolved (2026-10)** — held exactly two plugin entries, both now live: Magic Context (`0f0d574`) and cmd-provider. No settings or theme ever lived in it |
| `@mohak34/opencode-notifier` + `opencode-notifier.json` | **superseded** — V2 `attention.*` (notifications, sound, per-event incl. `subagent_done`), live in `src/cli.json`. One preference possibly still worth taking: ghostty as the notification system |
| nono-sandbox plugin | **reference** — externally managed by the nono utility (installs and updates its own copy); preserved untracked in `src/plugins` + `src/skills` so the config swap didn't orphan it |
| humanizer skill | **dead** — never used; always meant to fork it. Upstream: github.com/Aboudjem/humanizer-skill. Symlink dropped along with the submodule |
| DCP (`dcp.jsonc`) | **dead** — legacy plugin, unused for months; maintenance fell behind and Magic Context was its replacement. `dcp.jsonc` is its orphaned config |

### Tier 3 — judgment

_(nothing yet — Tier 3 work hasn't started; everything judgment-shaped is still in Pending.)_

## Resurrection mechanics (V2)

| Kind | Destination |
| --- | --- |
| Skills | `~/.config/opencode/skills/<id>/` (copy the whole dir, not just SKILL.md) |
| Agents | `~/.config/opencode/agents/<name>.md` (or project `.opencode/agents/`) |
| Commands | `~/.config/opencode/commands/<name>.md` |
| Plugins | `opencode plugin add <pkg>` or local path/file in `plugins` config; V2 plugin API differs from V1 — porting required, not just copying |
| Themes | theme files + `cli.json` `theme.name` |
| Config fields | `~/.config/opencode/opencode.jsonc` — V2 shapes: `permissions` array, `agents`, `providers`, `mcp.servers`; see the V1→V2 migration guide |

Archive warnings and layout map: `archive/README.md`.
