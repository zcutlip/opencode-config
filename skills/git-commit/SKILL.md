---
name: git-commit
description: Guidelines for creating atomic, well-formatted git commits
---

## When to Commit

- **NEVER commit changes unless the user explicitly asks you to**
- Wait for the user to say "commit this" or similar
- Do not proactively commit after completing work

## Atomic Commits

- Each commit should be independently applicable
- Should be possible to cherry-pick or revert without breaking other things
- Changesets shouldn't depend on downstream commits
- Upstream commits shouldn't depend on the commit
- Commit as few files as possible while not breaking the project
- If a change can reasonably be limited to one file without breaking anything, do that
- If changes to multiple files make them interdependent, commit them together
- Never commit entire files with multiple unrelated significant changes; commit a chunk at a time
- Code is never dependent on documentation, even if they reference the same change
- Documentation updates should be separate commits from code changes

## Commit Style

- Atomic commits (each commit should be independently applicable)
- Single-line commits preferred when possible
- Format: `file.py: description` for single-file changes
- Multi-line format when needed:

  ```
  commit description

  - detail 1
  - detail 2
  ```

- Line length <= 79 characters
- No attribution in commit messages
- Concise descriptions (don't need to be comprehensive)
