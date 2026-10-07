# Port ledger — V1 → V2 migration

Every archived item that won't announce itself when missing, with its
verdict. When something in vanilla V2 annoys you, check here first — the old
config may already solve it, V2 may do it natively, or the row says where the
old implementation is buried.

Quiet items only — things that won't announce themselves when missing. Loud
things (commands you'd type, plugins that fail visibly) don't need tracking;
browse `archive/src/commands/` and `archive/src/skills/` when curious.
Verdicts: **superseded** (V2 does it natively), **ported** (already moved
into the V2 config), **candidate** (port when convenient), **dead**
(meaningless in V2), **parked** (decided to revisit), **reference** (kept as
a lookup, not to port).

| Item | Verdict / notes |
| --- | --- |
| git-commit skill | **parked** — deliberately not resurrected; vanilla commit experiment. Resurrect: copy `archive/src/skills/git-commit/` → `~/.config/opencode/skills/git-commit/` |
| humanizer skill | **dead** — never used; always meant to fork it. Upstream: github.com/Aboudjem/humanizer-skill. Symlink dropped along with the submodule |
| nono-sandbox plugin | **reference** — externally managed; the nono utility installs and updates its own copy, so it was removed, not archived |
| agent-rules-reminder + test | **parked** — idea seed: agent-identity enforcement via tool-result injection; never worked in V1 (wrong hook?). Revisit only if V2 agents misbehave |
| DCP / Magic Context stack (`dcp.jsonc`, `tui-preferences.jsonc`, `compaction:{auto:false,prune:false}`) | **superseded** — V2 native compaction (`keep.tokens`, `buffer`, provider checkpoints). But `dcp.jsonc` holds real knowledge: Deepseek degrades on large context (reliable attention past ~300k, position bias); port that as V2 compaction tuning if using those models |
| `@mohak34/opencode-notifier` + `opencode-notifier.json` | **superseded** — V2 `attention.*` (notifications, sound, per-event incl. `subagent_done`). The one preference worth porting: ghostty as the notification system |
| permissions wall (`archive/src/opencode.disabled.jsonc`) | **reference** — symptom catalog of obnoxious V1 behaviors, not a port list. If V2 agents act up, find the specific behavior here and write one narrow V2 `permissions` rule for it |
| LSP (`lsp: true`, `lsp` permissions, "try LSP tools first" in `agents/plan.md`) | **dead** — LSP removed in V2; replace with project lint/typecheck (the `@lint` agent and `lint-format` skill pattern) |
| `hook/hooks.md.disabled` + `hook/inspect-bash.sh` | **dead** — V1 `hooks` mechanism has no V2 equivalent; plugins + `permissions`/`policies` own this now |
| `tui.json` | **ported (partially)** — notifications preference lives in `src/cli.json` `attention.notifications`. TUI plugin entries remain parked: audit each plugin before porting any |
| themes (`archive/src/themes/cyberpunk.json`, `korp-net.json`) | **candidate — needs conversion, not copying** — files are V1-format (`defs` + `theme` maps); V2 requires the new structure (`base`/modes, hue scales, semantic tokens). Also unknown which theme was actually in use — V1 `tui.json` never named one. Reference material: `notes/korp-net-notes.md` |
| `AGENTS.md` global instructions (casual tone, delegation etiquette) | **candidate** — defused as `archive/src/AGENTS.disabled.md` after ambient pickup. Port the content to `~/.config/opencode/AGENTS.md` when the vanilla tone starts to grate |
| agent prompts (`archive/src/agents/*.md`) | **candidate** — Tier 3: port by rewriting, never verbatim. Strip the LSP line from `plan.md`; re-examine "delegate everything" now that background subagents are native; consider V2 default agents raw first |
| watcher ignore list | **candidate** — trivially portable; node_modules/dist/build/.git/*.log |
| `small_model` → V2 `agents.title.model` | **ported** — `agents.title.model` in `src/opencode.jsonc`, was `opencode-go/longcat-2.5-preview-free` |
| model picks (`archive/src/opencode.disabled.jsonc`) | **reference** — default + title models ported to `src/opencode.jsonc`; per-agent models ride with the agents (Tier 3). Final V1 choices: glm-5.3-flash (default), mimo-v2.6-pro (plan), deepseek-v4.1-flash (build/coder), longcat-2.5-preview-free (commit/lint/task-rabbit/title) |
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

Archive warnings and layout map: `archive/README.md`.
