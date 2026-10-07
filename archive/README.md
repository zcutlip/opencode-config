# archive/ — retired V1 OpenCode config

Archived wholesale 2026-10 during the V2 migration (strangler-fig approach):
`src/` is rebuilt gradually, and items are pulled out of here only as they
prove load-bearing under V2. The other safety net is git history — `main`
holds the final V1 state, and everything before the migration is intact.

## Warnings

- **Archived instruction files are defused by rename.** `AGENTS.disabled.md`
  (was `AGENTS.md`) was picked up as live instructions by a session running at
  the repo root — ambient AGENTS.md discovery can reach *into* the archive, not
  just sessions started inside it. Any file named exactly `AGENTS.md` under
  `archive/` is a live-instruction hazard; keep the `.disabled` infix when
  adding or restoring such files.
- **Do not start OpenCode sessions inside `archive/src/`** — file-based
  definitions (agents, skills, commands) there would be discovered and loaded
  as if live. `opencode.disabled.jsonc` is renamed so the config itself won't
  load, but the rest of the tree would still be found.
- **`archive/src/` contains untracked, machine-local material on disk.**
  The old `src/.gitignore` (now `archive/src/.gitignore`) ignored several
  externally-managed things — `plugins/nono-sandbox.ts` (removed; nono
  reinstalls it), the `skills/nono-sandbox` and `skills/opencode-docs`
  absolute symlinks, `skills/analyze-usage`, `package.json`/`package-lock.json`,
  `opencode-notifier-state.json`, `disabled-skills/`. They exist here on this
  machine but would not survive a fresh clone.
- The plugin-dev toolchain parked at the archive root (`tsconfig.json`,
  `eslint.config.mjs`) is inert; nothing type-checks or lints the archived
  code until the toolchain is revived.

## Layout

| Path | What it is |
| --- | --- |
| `archive/src/` | The complete V1 config (was `src/`, was `~/.config/opencode` via symlink) |
| `archive/src/opencode.disabled.jsonc` | V1 config, renamed so V2 discovery won't load it (`.jsonc` kept for editor association) |
| `archive/src/plugins/agent-rules-reminder.ts.disabled` + its `.test.ts` | Plugin and test, kept together |
| `archive/{tsconfig.json,eslint.config.mjs}` | V1 plugin-dev toolchain, parked until the first V2 plugin |

## Port ledger

Quiet items only — things that won't announce themselves when missing. Loud
things (commands you'd type, plugins that fail visibly) don't need tracking;
browse `archive/src/commands/` and `archive/src/skills/` when curious.
Verdicts: **superseded** (V2 does it natively), **candidate** (port when
convenient), **dead** (meaningless in V2), **parked** (decided to revisit),
**reference** (kept as a lookup, not to port).

| Item | Verdict / notes |
| --- | --- |
| git-commit skill | **parked** — deliberately not resurrected; vanilla commit experiment. Resurrect: copy `archive/src/skills/git-commit/` → `~/.config/opencode/skills/git-commit/` |
| humanizer skill | **dead** — never used; always meant to fork it. Upstream: github.com/Aboudjem/humanizer-skill. Symlink dropped along with the submodule |
| nono-sandbox plugin | **reference** — externally managed; the nono utility installs and updates its own copy, so it was removed, not archived |
| agent-rules-reminder + test | **parked** — idea seed: agent-identity enforcement via tool-result injection; never worked in V1 (wrong hook?). Revisit only if V2 agents misbehave |
| DCP / Magic Context stack (`dcp.jsonc`, `tui-preferences.jsonc`, `compaction:{auto:false,prune:false}`) | **superseded** — V2 native compaction (`keep.tokens`, `buffer`, provider checkpoints). But `dcp.jsonc` holds real knowledge: Deepseek degrades on large context (reliable attention past ~300k, position bias); port that as V2 compaction tuning if using those models |
| `@mohak34/opencode-notifier` + `opencode-notifier.json` | **superseded** — V2 `attention.*` (notifications, sound, per-event incl. `subagent_done`). The one preference worth porting: ghostty as the notification system |
| permissions wall (`opencode.disabled.jsonc`) | **reference** — symptom catalog of obnoxious V1 behaviors, not a port list. If V2 agents act up, find the specific behavior here and write one narrow V2 `permissions` rule for it |
| LSP (`lsp: true`, `lsp` permissions, "try LSP tools first" in `agents/plan.md`) | **dead** — LSP removed in V2; replace with project lint/typecheck (the `@lint` agent and `lint-format` skill pattern) |
| `hook/hooks.md.disabled` + `hook/inspect-bash.sh` | **dead** — V1 `hooks` mechanism has no V2 equivalent; plugins + `permissions`/`policies` own this now |
| `tui.json` | **ported (partially)** — notifications preference lives in `src/cli.json` `attention.notifications`. TUI plugin entries remain parked: audit each plugin before porting any |
| themes (`themes/cyberpunk.json`, `themes/korp-net.json`) | **candidate — needs conversion, not copying** — files are V1-format (`defs` + `theme` maps); V2 requires the new structure (`base`/modes, hue scales, semantic tokens). Also unknown which theme was actually in use — V1 `tui.json` never named one |
| `AGENTS.md` global instructions (casual tone, delegation etiquette) | **candidate** — defused as `AGENTS.disabled.md` after ambient pickup. Port the content to `~/.config/opencode/AGENTS.md` when the vanilla tone starts to grate |
| agent prompts (`agents/*.md`) | **candidate** — Tier 3: port by rewriting, never verbatim. Strip the LSP line from `plan.md`; re-examine "delegate everything" now that background subagents are native; consider V2 default agents raw first |
| watcher ignore list | **candidate** — trivially portable; node_modules/dist/build/.git/*.log |
| `small_model` → V2 `agents.title.model` | **ported** — `agents.title.model` in `src/opencode.jsonc`, was `opencode-go/longcat-2.5-preview-free` |
| model picks (`opencode.disabled.jsonc`) | **reference** — default + title models ported to `src/opencode.jsonc`; per-agent models ride with the agents (Tier 3). Final V1 choices: glm-5.3-flash (default), mimo-v2.6-pro (plan), deepseek-v4.1-flash (build/coder), longcat-2.5-preview-free (commit/lint/task-rabbit/title) |
| `nativ` provider | **ported** — V2 shape in `src/opencode.jsonc`: `package`, `settings.baseURL`, model `capabilities`, `compatibility.reasoningField` (from V1 `interleaved.field`) |
| commented-out plugin experiments (ponytail, better-hashline, runtime-fallback, @angdrew/hashline, froggy) | **parked** — never adopted; maybe interesting under V2, maybe not |
| external plugins (session-manager, codebase-index, skill-creator, cc-safety-net, cmd-provider, notifier, magic-context) | **parked** — audit each for a V2-native equivalent before re-adding any |
| stop-gate / TDD enforcement (`commands/tdd-continue.md`, root analysis doc) | **parked** — separate future discussion |
| `scripts/refresh-models.sh` (repo root) | **candidate** — kept live; verify `opencode models --refresh` flag on installed V2 before relying on it |

## Resurrection mechanics (V2)

| Kind | Destination |
| --- | --- |
| Skills | `~/.config/opencode/skills/<id>/` (copy the whole dir, not just SKILL.md) |
| Agents | `~/.config/opencode/agents/<name>.md` (or project `.opencode/agents/`) |
| Commands | `~/.config/opencode/commands/<name>.md` |
| Plugins | `opencode plugin add <pkg>` or local path/file in `plugins` config; V2 plugin API differs from V1 — porting required, not just copying |
| Themes | theme files + `cli.json` `theme.name` |
| Config fields | `~/.config/opencode/opencode.jsonc` — V2 shapes: `permissions` array, `agents`, `providers`, `mcp.servers`; see the V1→V2 migration guide |
