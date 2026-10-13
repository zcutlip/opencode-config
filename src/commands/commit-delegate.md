---
description: Delegate to the @commit subagent to create a git commit
agent: commit
subagent: true
---

Create a git commit. Use the git-commit skill to determine appropriate commit structure and message. The user explicitly authorized a commit by invoking this command.

If you encounter an error, stop immediately and report up. Failure is acceptable, and reporting preferred.

- If additional text is provided at the end, it determines scope: which files or directories to focus on.
- If no additional end text: scope is project.

### OPTIONAL SCOPE-DETERMINING END TEXT MAY FOLLOW
$ARGUMENTS
