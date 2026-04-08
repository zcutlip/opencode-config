# OpenCode Config

Personal configuration for [OpenCode](https://opencode.ai) — an AI coding assistant with multi-agent architecture.

## Overview

This repository contains the configuration, custom agents, commands, skills, and themes that power my OpenCode setup. It implements a structured multi-agent workflow with strict delegation rules and customized permissions.

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
├── agents/              # Custom agent definitions
├── commands/            # Custom slash commands
├── skills/              # Reusable skill workflows
├── themes/              # UI theme configurations
├── opencode.json        # Main OpenCode configuration
├── AGENTS.md            # Global agent instructions
└── .pre-commit-config.yaml
```

## License

MIT
