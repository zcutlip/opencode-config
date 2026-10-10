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
| Magic Context (`@cortexkit/opencode-magic-context`) | **ported (live 2026-10)** — anti-compaction + persistent memory (historian compartments, decay rendering, `ctx_expand` paging, capture/consolidate/recall), mutually exclusive with native compaction. Live via `opencode.jsonc` `plugins` + `compaction.auto: false`, and its `tui-preferences.jsonc` is versioned in `src/`. Baseline experiment shortened by choice — adopted before a formal vanilla comparison |
| DCP (`dcp.jsonc`) | **dead** — legacy plugin, unused for months; maintenance fell behind and Magic Context was its replacement. `dcp.jsonc` is its orphaned config |
| `magic-context-release-notes` skill | **candidate** — follows Magic Context; its releases are substantial enough that curation pays if the plugin returns |
| `opencode-session-manager` plugin | **parked** — V1-only; its resurrection rationale is the archaeology need (recalling decisions from past sessions), which V2 has no native tool for |
| `/search-session` command | **candidate — needs adaptation** — wraps the V1-only session-manager plugin's tools; as a V2 port it becomes a session-DB query command, and a probe for whether transcript archaeology suffices before adopting Magic Context |
| `@mohak34/opencode-notifier` + `opencode-notifier.json` | **superseded** — V2 `attention.*` (notifications, sound, per-event incl. `subagent_done`). The one preference worth porting: ghostty as the notification system |
| permissions wall (`archive/src/opencode.disabled.jsonc`) | **reference** — symptom catalog of obnoxious V1 behaviors, not a port list. If V2 agents act up, find the specific behavior here and write one narrow V2 `permissions` rule for it |
| LSP (`lsp: true`, `lsp` permissions, "try LSP tools first" in `agents/plan.md`) | **dead** — LSP removed in V2; replace with project lint/typecheck (the `@lint` agent and `lint-format` skill pattern) |
| `hook/hooks.md.disabled` + `hook/inspect-bash.sh` | **dead** — V1 `hooks` mechanism has no V2 equivalent; plugins + `permissions`/`policies` own this now |
| `tui.json` (`archive/src/tui.json`) | **resolved (2026-10)** — held exactly two plugin entries, both now live in `opencode.jsonc` `plugins`: `@cortexkit/opencode-magic-context@latest` (`0f0d574`) and `opencode-cmd-provider` (added via `opencode plugin add`; GOAT plan, authenticated). No settings or theme ever lived in it |
| themes (`archive/src/themes/cyberpunk.json`, `korp-net.json`) | **candidate — needs conversion, not copying** — files are V1-format (`defs` + `theme` maps); V2 requires the new structure (`base`/modes, hue scales, semantic tokens). The live theme is the built-in `matrix` (V2-era choice, 2026-10) — a snapshot, not a verdict; the V1 themes are convertible whenever actually wanted. Reference material: `notes/korp-net-notes.md` |
| `AGENTS.md` global instructions (casual tone, delegation etiquette) | **candidate** — defused as `archive/src/AGENTS.disabled.md` after ambient pickup. Port the content to `~/.config/opencode/AGENTS.md` when the vanilla tone starts to grate |
| agent prompts (`archive/src/agents/*.md`) | **candidate** — Tier 3: port by rewriting, never verbatim. Strip the LSP line from `plan.md`; re-examine "delegate everything" now that background subagents are native; consider V2 default agents raw first |
| watcher ignore list | **candidate** — trivially portable; node_modules/dist/build/.git/*.log |
| `small_model` → V2 `agents.title.model` | **ported** — `agents.title.model` in `src/opencode.jsonc`, was `opencode-go/longcat-2.5-preview-free` |
| model picks (`archive/src/opencode.disabled.jsonc`) | **reference** — default + title models ported to `src/opencode.jsonc`; per-agent models ride with the agents (Tier 3). Final V1 choices: glm-5.3-flash (default), mimo-v2.6-pro (plan), deepseek-v4.1-flash (build/coder), longcat-2.5-preview-free (commit/lint/task-rabbit/title) |
| `nativ` provider | **ported** — V2 shape in `src/opencode.jsonc`: `package`, `settings.baseURL`, model `capabilities`, `compatibility.reasoningField` (from V1 `interleaved.field`) |
| commented-out plugin experiments (ponytail, better-hashline, runtime-fallback, @angdrew/hashline, froggy) | **parked** — never adopted; maybe interesting under V2, maybe not |
| external plugins (the V1 list) | **mixed — per-item verdicts (audited 2026-10)** — V2-ready: `cc-safety-net`. Actively maintained, real capability gap: `open-codebase-index` (V2 has no native semantic search; MCP route available). V1-only: `opencode-session-manager`. Unverified: `opencode-skill-creator`. Resolved: `@mohak34/opencode-notifier` superseded; `@cortexkit/opencode-magic-context` and `opencode-cmd-provider` ported (live — the latter on the GOAT plan) |
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
