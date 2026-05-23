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
- use the bash heredoc technique so the user can easily read the commit before approving

## Atomic Commit Workflow

### Step 1: Analyze Changes
Before committing, examine all modified/untracked files:

**A. Understand WHAT changed (not just WHERE)**
- Read the actual diff content carefully, not just filenames
- Look at context lines to understand which section/component is affected
- Verify your understanding matches the actual change before describing it
- If unsure what a change does, examine more context or ask

**B. Group by logical relationship**
- Files that implement ONE feature/fix → One commit
- Independent changes (different features, config vs code, code vs docs) → Separate commits
- When in doubt, err toward MORE commits, not fewer

### Step 2: Determine Commit Order (Dependency-Based)
Commit in this priority order:

1. **Infrastructure/Configuration FIRST**
   - Config file changes that enable other work
   - Dependency additions (package.json, requirements.txt)
   - Build system changes

2. **Core Functionality SECOND**
   - New features, bug fixes
   - Code that other things depend on

3. **Documentation LAST**
   - README updates
   - Comments, docstrings
   - Never mix with code commits

**Why this order:** Later commits can reference earlier ones, but never the reverse.

### Step 3: Pre-Commit Checklist
Before executing `git add` for ANY commit, verify:

- [ ] All files in this commit are logically related to ONE change
- [ ] No independent changes are being batched together "for convenience"
- [ ] Documentation is separate from code
- [ ] Dependencies are committed before things that depend on them
- [ ] Each commit can stand alone (cherry-pick/revert safe)

**If you cannot check all boxes, split the commit.**

### Step 4: Commit Plan Approval (Multi-File Commits)
When more than one file will be in a commit:

1. Present the planned commit to the user:
   - List all files to be included
   - Explain the logical relationship
   - State the commit message

2. Wait for explicit confirmation: "Should I proceed with this commit?"

3. Only after "yes" response, execute `git add` and `git commit`

## Examples

**Scenario A: New Feature with Docs**
```
Modified: feature.py, README.md, config.json
```
✗ BAD - One commit with all files:
```bash
git add feature.py README.md config.json
git commit -m "Add new feature and update docs and config"
```

✓ GOOD - Three atomic commits:
```bash
# 1. Infrastructure first
git add config.json
git commit -m "config.json: Add setting for new feature"

# 2. Core functionality
git add feature.py
git commit -m "feature.py: Implement new feature"

# 3. Documentation last
git add README.md
git commit -m "README.md: Document new feature"
```

**Scenario B: Multiple Independent Fixes**
```
Modified: bugfix1.py, bugfix2.py, unrelated.py
```
✗ BAD - One commit:
```bash
git add .
git commit -m "Fix various bugs"
```

✓ GOOD - Separate atomic commits:
```bash
git add bugfix1.py && git commit -m "bugfix1.py: Fix issue with X"
git add bugfix2.py && git commit -m "bugfix2.py: Fix issue with Y"
git add unrelated.py && git commit -m "unrelated.py: Fix issue with Z"
```

**Scenario C: Config Enables Feature**
```
Modified: settings.json, feature.py
```
✗ BAD - Together:
```bash
git add settings.json feature.py
git commit -m "Add feature with config"
```

✓ GOOD - Config first:
```bash
git add settings.json && git commit -m "settings.json: Add config for feature"
git add feature.py && git commit -m "feature.py: Add feature using new config"
```

## Common Mistakes to Avoid

1. **"It's all related" rationalization**
   - Everything touches the same codebase =/= one logical change
   - Ask: "Could I describe this in one clear sentence?"
   - If the description needs commas, split the commit

2. **Convenience batching**
   - "I'll just commit everything, it's faster"
   - Atomic commits take the same time, just more commands
   - Future you (and teammates) will thank you

3. **Docs-with-code habit**
   - "I updated the README to match my changes"
   - Docs are NEVER dependent on code
   - Separate commit: "README.md: Update for feature X"

4. **Order doesn't matter**
   - It does for bisect, cherry-pick, and revert
   - Commit enablers before enabled
   - Test: "Can I revert this commit without breaking others?"
