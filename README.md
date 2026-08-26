# OpenCode Config

Personal configuration for [OpenCode](https://opencode.ai) — an AI coding assistant with multi-agent architecture.

## Overview

This repository contains the configuration, custom agents, commands, skills, and themes that power my OpenCode setup. It implements a structured multi-agent workflow with strict delegation rules and customized permissions.

## Installation

OpenCode reads its configuration from `~/.config/opencode`. This repo's `src/` directory is designed to *be* that directory via a symlink — the repo root stays free for project-level config when hacking on this repo itself.

**One command (recommended):**

```sh
./install.sh             # symlink + submodule init
```

**Manual steps:**

1. **Clone** (hosted on Codeberg, not GitHub):
   ```sh
   git clone ssh://git@codeberg.org/zcutlip/opencode-config.git
   cd opencode-config
   ```

2. **Initialize submodules** — the `humanizer` skill lives in a git submodule and will be
   empty otherwise:
   ```sh
   git submodule update --init --recursive
   ```

3. **Symlink into place** — point OpenCode's config dir at this repo:
   ```sh
    ln -s "$(pwd)/src" ~/.config/opencode
   ```
   > If `~/.config/opencode` already exists as a real directory, move or remove it first
   > (e.g. `mv ~/.config/opencode ~/.config/opencode.bak`).

Restart OpenCode (or start a new session) and the agents, commands, skills, and themes load
automatically.

## Architecture

### Agents

| Agent | Mode | Role |
|-------|------|------|
| `@plan` | Primary | Planning & orchestration — reads, analyzes, and creates implementation plans |
| `@build` | Primary | Implementation — executes approved plans and writes code |
| `@explore` | Subagent | File search & discovery — finds code, reads files, maps structure |
| `@coder` | Subagent | Code editing — targeted single-purpose code modifications |
| `@lint` | Subagent | Code quality — runs linting & verification after changes |
| `@commit` | Subagent | Git commits — creates atomic, well-formatted commits |
| `@task-rabbit` | Subagent | Task execution — runs scripts & lightweight chores, skill-use specialist |

### Commands

| Command | Description |
|---------|-------------|
| `/analyze-usage` | Analyze OpenCode model and agent usage patterns from logs |
| `/commit-delegate` | Delegate to the @commit subagent to create a git commit |
| `/oc-docs` | Browse and read OpenCode documentation via helper script |
| `/reflect-questions` | Reflect on previous questions and categorize as decided/recommended/user choice |
| `/retry` | Retry after provider interruption |
| `/search-session` | Find a session by searching its title, content, or description |
| `/tdd-continue` | Continue TDD cycle after stop gate |

### Skills

| Skill | Description |
|-------|-------------|
| `analyze-usage` | Interpret model and agent usage to recommend cost-saving configurations |
| `codeberg-integration` | Interact with Codeberg (Forgejo/Gitea) repositories |
| `git-commit` | Guidelines for creating atomic, well-formatted commits |
| `humanizer` | Detect AI writing patterns and rewrite text with voice profiles |
| `lint-format` | Lint and format code. Python supported. Falls back to pre-commit |
| `magic-context-release-notes` | Release highlights for the Magic Context project |
| `nono-sandbox` | Diagnose and resolve permission denials in the nono sandbox |
| `opencode-docs` | Offline documentation for OpenCode features and configuration |
| `opencode-release-notes` | Release highlights for the OpenCode project |
| `opencode-skill-creator` | Create, test, evaluate, optimize, and package OpenCode skills |
| `test-audit` | Audit test suites for quality issues and flakiness patterns |

### Themes

- **cyberpunk** — Neon-themed UI with cyan, pink, and green accents
- **korp-net** — Dystopian corporate terminal with void-black backgrounds and aggressive red accents

### Plugins

`src/plugins/` contains `agent-rules-reminder.ts` and `nono-sandbox.ts`, loaded via `@opencode-ai/plugin` (`src/package.json`).

## Configuration Highlights

- **Permissions**: Bash defaults to `deny` (allowlisted commands only), `edit` and `external_directory` default to `ask`
- **Compaction**: Built-in auto-compaction and pruning disabled (`auto: false`, `prune: false`); dynamic context compression via DCP (`dcp.jsonc`)
- **File Watcher**: Ignores `node_modules`, `dist`, `build`, `.git`, and log files
- **Pre-commit**: Trailing whitespace, EOF fixer, JSON/YAML validation, and more

## Project Structure

```
├── AGENTS.md            # Project dev setup (Bun/lint/typecheck)
├── eslint.config.mjs
├── tsconfig.json
├── install.sh
├── src/
│   ├── AGENTS.md        # Global agent instructions
│   ├── opencode.jsonc
│   ├── agents/
│   ├── commands/
│   ├── skills/
│   ├── plugins/
│   ├── themes/
│   ├── hook/
│   ├── tui.json
│   └── ...
└── ...
```

## License

MIT
