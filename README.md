# OpenCode Config

Personal configuration for [OpenCode](https://opencode.ai) — an AI coding
assistant with a multi-agent architecture.

Rebuilt on the **V2** config schema, strangler-fig style: `src/` is the live
config directory and items move in from `archive/` (the V1 setup) only once
they prove load-bearing under vanilla V2. [`LEDGER.md`](LEDGER.md) is the port
ledger — check it before resurrecting anything from the archive.

## Installation

OpenCode reads its configuration from `~/.config/opencode`. This repo's `src/`
directory is designed to *be* that directory via a symlink, so the repo root
stays free for project-level config.

**One command (recommended):**

```sh
./install.sh             # symlink into place + oc-permissions on PATH
```

**Manual steps:**

1. **Clone** (hosted on Codeberg, not GitHub):
   ```sh
   git clone ssh://git@codeberg.org/zcutlip/opencode-config.git
   cd opencode-config
   ```

2. **Symlink into place** — point OpenCode's config dir at this repo:
   ```sh
   ln -s "$(pwd)/src" ~/.config/opencode
   ```
   > If `~/.config/opencode` already exists as a real directory, move or remove
   > it first (e.g. `mv ~/.config/opencode ~/.config/opencode.bak`).

Restart OpenCode (or start a new session) and the agents, commands, skills,
plugins, and themes load automatically.

## Architecture

Everything below is declared or discovered from `src/`.

### Agents

| Agent | Mode | Role |
|-------|------|------|
| `@plan` | Primary | Planning & orchestration — reads, analyzes, creates implementation plans |
| `@build` | Primary | Implementation — executes approved plans and writes code |
| `@explore` | Subagent | Structure-only code discovery — code-index first, no edits, no semantics |
| `@test` | Subagent | Runs the project's test command and reports raw output — read and edit denied, so it cannot assert from inspection |
| `@commit` | Subagent | The exclusive staging/commit route — atomic commits, fenced shell allowlist |

`title` (hidden) generates session titles. Model picks live in
`src/opencode.jsonc` and change often.

### Commands

| Command | Description |
|---------|-------------|
| `/commit-delegate` | Delegate to the @commit subagent to create a git commit |
| `/oc-permissions` | List and remove OpenCode's saved ("always allow") permissions |
| `/reflect-questions` | Categorize previous questions as decided / recommended / user choice |

### Skills

| Skill | Description |
|-------|-------------|
| `git-commit` | Atomic, well-formatted commits — the commit agent's rulebook |
| `test-audit` | Audit test suites for missing assertions, swallowed exceptions, flakiness |
| `nono-sandbox` | Diagnose nono sandbox denials |
| `nono-troubleshoot` | Host-side triage for nono problems |

The two `nono-*` skills and `plugins/nono-sandbox.ts` are installed and updated
by the nono utility; the repo preserves them in place but does not version them.

### Themes

- **korp-net** — dystopian corporate terminal, void-black with aggressive red accents (live)
- **cyberpunk** — neon UI with cyan, pink, and green accents

### Plugins

Declared in `src/opencode.jsonc`:

- **Magic Context** — anti-compaction with persistent, searchable memory
- **opencode-cmd-provider** — the CommandCode provider integration
- **open-codebase-index** — semantic code search (needs a local `ollama`)

Auto-discovered from `src/plugins/`:

- **session-history** — per-session up-arrow prompt recall (the built-in
  history is one global stack shared by every session and project)

`src/plugins-disabled/` holds parked plugins that do not load — currently
`matrix-rain`.

## Configuration highlights

- **Permissions**: shell asks by default; git reads are allowlisted while a
  `git *` ask catch-all makes every other subcommand prompt. Redirect writes and
  `sed`/`perl`/`awk` are denied outright (edits go through the edit tool).
  Config files and agent `.md` files are edit-denied **by filename** everywhere,
  with a carve-out for this repo in the root `opencode.jsonc` so the migration
  can edit its own config. `oc-permissions` audits the saved-approval store.
- **Compaction**: native auto-compaction is off — Magic Context owns the
  context window.
- **Project rules**: the repo-root `opencode.jsonc` loads after the global
  config and wins on last match; that is how the carve-out above works.
- **Pre-commit**: trailing whitespace, EOF fixer, and JSON/JSON5 validation.

## Project structure

```
├── src/                  # → ~/.config/opencode (live config)
│   ├── opencode.jsonc    # models, agents + wiring, permissions, plugins, providers
│   ├── cli.json          # TUI settings (theme, notifications, tabs)
│   ├── agents/ commands/ skills/ themes/
│   ├── plugins/          # auto-discovered live plugins
│   ├── plugins-disabled/ # parked plugins, not loaded
│   └── scripts/          # oc-permissions.py
├── archive/              # V1 config, kept for reference (see LEDGER.md)
├── scripts/              # ts-parse.ts (syntax check), refresh-models.sh
├── docs/ notes/          # working notes (e.g. phase-ratchet prototype)
├── opencode.jsonc        # project-local rules for hacking on this repo
├── install.sh
├── LEDGER.md             # V1 → V2 port ledger
└── LICENSE
```

## License

MIT
