# opencode-config

Personal OpenCode configuration. The V1 config is archived under `archive/` —
see `LEDGER.md` (the port ledger) before resurrecting anything from it.
`src/` is the V2 config, rebuilt gradually as items prove load-bearing.
`~/.config/opencode` is a symlink to `./src` — edits in `src/` are live config.

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
