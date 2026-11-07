# src/ — the live OpenCode config

`~/.config/opencode` is a symlink to this directory (`../install.sh`), so
everything here IS the running config: edits take effect immediately, and
auto-discovered plugins hot-reload into open TUI windows. No staging copy.

Where things live:

- `opencode.jsonc` — models, agents + their wiring, permissions, plugins,
  providers
- `cli.json` — TUI settings: theme, notifications, tabs, session display
- `agents/` — behavioral contracts (`.md`, model-agnostic); their OpenCode
  wiring lives in `opencode.jsonc`
- `commands/`, `skills/`, `themes/` — as named
- `plugins/` — auto-discovered, all of it loads; see its `AGENTS.md`
- `plugins-disabled/` — parked plugins that do NOT load (currently
  `matrix-rain`)
- `scripts/` — `oc-permissions.py` (saved-approval auditor, symlinked onto PATH
  by `install.sh`)

Machine-local state, present on disk but git-ignored (see `.gitignore`):
`service.json` (shared secret), `plugins/nono-sandbox.ts`, `skills/nono-sandbox`,
`skills/nono-troubleshoot` — installed and updated by the nono utility, kept here
so the config-dir swap doesn't orphan them.

Before pulling anything in from `../archive/`, read `../LEDGER.md` — the port
ledger — for that item's verdict.
