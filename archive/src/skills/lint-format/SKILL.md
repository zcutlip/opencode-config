---
name: lint-format
description: Lint and format code. Python supported. Falls back to pre-commit.
---

## Usage

Note: BASE_DIRECTORY should be the "Base Directory" from your "<skill-content ...>" message.

Execute: `{BASE_DIRECTORY}/scripts/lint-format.sh <operation> <path> [<path>...]`

Operations: `check` | `fix` | `format`

## Behavior

- Python (.py): Run Ruff via `{BASE_DIRECTORY}/scripts/handlers/python.sh`
- Other files: If `.pre-commit-config.yaml` exists in project root, run `pre-commit run --files <path>...` (directories expanded to file lists)
- No pre-commit: Return JSON with `success: true`, `message: "No linter configured for this file type"`

Note: multiple paths are supported but must be the same language group (Python paths together, or non-Python paths together); mixing returns an error. Directories are expanded recursively (Python handler collects `*.py` files; the pre-commit fallback expands to all files).

## Output Format

```json
{
  "success": true|false,
  "language": "python|unknown",
  "operation": "check|fix|format",
  "files": ["file1.py"],
  "issues": [{"file": "x.py", "line": 5, "message": "..."}],
  "message": "human readable summary"
}
```

## Adding Languages

Create handler in `{BASE_DIRECTORY}/scripts/handlers/<name>.sh`. Accepts operation and one or more paths. Returns JSON.
