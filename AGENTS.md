# opencode-config

Personal OpenCode configuration. The V1 config is archived under `archive/` —
see `LEDGER.md` (the port ledger) before resurrecting anything from it.
`src/` is the V2 config, rebuilt gradually as items prove load-bearing.

## Repo conventions

- Atomic commits — one logical change per commit, `file: description` subject
  format, docs separate and committed last. Full house style:
  `archive/src/skills/git-commit/SKILL.md`
- Pre-commit hooks enforce trailing-whitespace, end-of-file, and JSON/JSON5
  checks — fix what they flag rather than bypassing them
- No build/lint/test toolchain at present; it is parked in `archive/` with the
  V1 plugins — revive it there when authoring a V2 plugin
- `scripts/refresh-models.sh` filters `opencode models` output (verify the
  `--refresh` flag still exists on the installed V2 before relying on it)
