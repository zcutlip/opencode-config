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

### Commands

| Command | Description |
|---------|-------------|
| `/docs` | Opens local OpenCode documentation |

### Skills

| Skill | Description |
|-------|-------------|
| `codeberg-integration` | Interact with Codeberg (Forgejo/Gitea) repositories |
| `git-commit` | Guidelines for creating atomic, well-formatted commits |

### Themes

- **cyberpunk** — Neon-themed UI with cyan, pink, and green accents

## Configuration Highlights

- **Permissions**: Bash, edit, and write operations default to `ask` for safety
- **Compaction**: Auto-compaction with context pruning enabled
- **File Watcher**: Ignores `node_modules`, `dist`, `build`, `.git`, and log files
- **MCP**: Forgejo MCP server for Codeberg integration
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
