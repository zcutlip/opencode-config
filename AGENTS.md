# opencode-config

Personal OpenCode configuration. The V1 config is archived under `archive/` —
see `LEDGER.md` (the port ledger) before resurrecting anything from it.
`src/` is the V2 config, rebuilt gradually as items prove load-bearing.
`~/.config/opencode` is a symlink to `./src` — edits in `src/` are live config.

## Challenge log

- Problems surfaced while building and iterating the workflow supervisor go
  in `docs/phase-ratchet/workflow-supervisor-challenges.md` — the challenge
  plus the resolution that worked, or the open status and direction. Add
  entries as they emerge, not in a retrospective batch.
- Keep entries tight and harness/technology-agnostic: no tool names, file
  formats, or API paths — concepts only (builder/reviewer/supervisor/user).
  The log is written for an agent rebuilding this capability on a different
  harness, so resolutions must read as transferable principles.

## Repo conventions

- Atomic commits — one logical change per commit, `file: description` subject
  format, docs separate and committed last. Full house style:
  `src/skills/git-commit/SKILL.md`; commits are made only by the commit
  subagent (`src/agents/commit.md`)
- Pre-commit hooks enforce trailing-whitespace, end-of-file, and JSON/JSON5
  checks — fix what they flag rather than bypassing them
- Plugin tests use Bun's built-in `bun:test` runner; the V1 dependencies stay
  parked in `archive/`. Workflow-supervisor contract tests:
  `bun test src/plugins/workflow-supervisor`; the live permission fence probe
  is `bun src/plugins/workflow-supervisor/permission-probe.ts` (delegate both
  to the test agent). No general build/lint toolchain is restored.
- `./scripts/ts-parse.ts <path>...` parse-checks TS/TSX — syntax only, it does
  not typecheck; `--git` also parses each file's HEAD version to separate new
  breakage from old
- `scripts/refresh-models.sh` filters `opencode models` output (verify the
  `--refresh` flag still exists on the installed V2 before relying on it)
