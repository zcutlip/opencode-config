# archive/ — retired V1 OpenCode config

Archived wholesale 2026-10 during the V2 migration (strangler-fig approach):
`src/` is rebuilt gradually, and items are pulled out of here only as they
prove load-bearing under V2. The other safety net is git history — `main`
holds the final V1 state, and everything before the migration is intact.

The port ledger — verdicts per archived item, and where each kind of thing
goes when resurrected — lives at the repo root: `../LEDGER.md`.

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
| `archive/src/AGENTS.disabled.md` | V1 global agent instructions, renamed so ambient discovery won't load them (`.md` kept for editor association) |
| `archive/src/plugins/agent-rules-reminder.ts.disabled` + its `.test.ts` | Plugin and test, kept together |
| `archive/{tsconfig.json,eslint.config.mjs}` | V1 plugin-dev toolchain, parked until the first V2 plugin |
