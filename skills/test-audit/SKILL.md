---
name: test-audit
description: "Audit test suites for quality issues: missing assertions, exception swallowing, trivial tests, and fixture problems. Supports pytest (Python) and Bun/Jest/Vitest (TypeScript/JavaScript)."
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: testing
---

# Test Audit Skill

## What I Do

I audit test suites to identify quality issues and provide actionable recommendations. I read the test files, evaluate each test against the checklists in `checklists/`, and report findings by severity with specific fixes.

### Audit Scope

I analyze test suites for:

**Critical Issues:**
- Tests with NO assertions (including `assert True` or commented-out asserts)
- Tests that always pass regardless of correctness (vacuous loop assertions, mock tautology)
- Exception handling that swallows errors without verification
- Skipped or `xfail` tests without a documented reason
- Tests that only check "doesn't crash" without validation

**Medium Issues:**
- Tests that only check `is not None` / `len() > 0` / type, without value validation (context-dependent — see Context-Aware Analysis)
- Tests that only check default values or trivial conditions
- Weak assertions that could pass on wrong output
- Fixture quality problems (hardcoded values, no cleanup)

**Minor Issues:**
- Misleading test names
- Edge case tests with minimal validation
- Inconsistent assertion patterns

## Context-Aware Analysis

**Before flagging issues, understand the code under test.** Not all "weak" assertions are actually weak — context matters.

### Consider the Nature of the Code

| Code Type | Appropriate Assertions | Why |
|-----------|----------------------|-----|
| Random/nondeterministic generators | `isinstance()`, `len() > 0` | Output is unpredictable without seeding. These confirm the code didn't crash and returned the right type. |
| Formatters/renderers | Structural checks (contains sections, headers) | Exact output varies with input. Structure is what matters. |
| Deterministic functions | Exact value assertions | Output is predictable. Assert specific values. |
| CLI wrappers | Exit codes, stdout/stderr content | The contract is the interface, not internal state. |

**Rule:** Before flagging an assertion as "weak," ask: *Could a stronger assertion be written without changing the test setup?* If the code is nondeterministic and the test doesn't seed it, `isinstance()` may be the strongest assertion possible — and that's fine. The recommendation should be to seed the generator, not to assert more specifically.

**Seed check:** Before classifying a test as "nondeterministic, so weak assertions are fine," check whether the test uses a seed, fixed input, or deterministic path. If the test seeds the generator (e.g., `seed=42`, `--seed hello`), the output is deterministic and the assertion should be held to a higher standard.

See `checklists/assertions.md` for the full decision tree and context-aware assessment.

### Check Project Constraints Before Recommending

Before suggesting any external tool, library, or pattern change:

1. **Check for dependency policies** — Does the project have a zero-dependency or minimal-dependency policy? Don't recommend `pytest-snapshot`, `hypothesis`, or similar if the project avoids external deps.
2. **Check for design principles** — Does the project have explicit design constraints (e.g., "stdlib only", "no mocking", "real implementations only")? Respect these in recommendations.
3. **Check existing patterns** — Does the project already have a pattern for the issue you're flagging? Don't recommend `conftest.py` if the project intentionally uses module-level helpers.

**Rule:** Every recommendation must be implementable within the project's stated constraints. If the ideal solution requires violating a constraint, offer the best alternative that respects it.

### Within-Tier Prioritization

When multiple issues share a severity level, rank them by impact within the tier:

- **Within Critical:** Tests with no assertions > Tests that always pass > Tests with exception swallowing
- **Within Medium:** Tests checking only type > Tests checking only defaults > Tests checking only file existence
- **Within Minor:** Missing edge cases > Missing documentation > Naming inconsistencies

Report format for within-tier ranking:
```markdown
### Medium Issues (Should Fix)

1. **test_foo** — Only checks `isinstance()` (highest impact in this tier)
2. **test_bar** — Only checks default value
3. **test_baz** — Only checks file existence (lowest impact in this tier)
```

This helps teams know which issues to tackle first within each severity level.

### Framework Support

- **pytest** (Python) — primary; see `frameworks/pytest.md` and `frameworks/python.md`
- **Bun** (TypeScript/JavaScript) — primary; see `frameworks/bun.md` and `frameworks/typescript.md`
- **Jest** and **Vitest** (JavaScript/TypeScript) — Bun's test API is Jest-compatible, so `frameworks/bun.md` and `frameworks/typescript.md` apply. Note any framework-specific differences where relevant.
- **unittest** (Python) — covered via the Python checklists; uses `assertRaises`/`assertEqual` instead of `pytest.raises`/`assert`.

Auto-detection based on project configuration files and import statements.

## When to Use Me

Use this skill when you need to:
- Assess test suite quality before refactoring
- Identify flaky or low-value tests
- Review test coverage gaps (opt-in — see `checklists/coverage.md`)
- Improve test maintainability
- Prepare for code reviews or audits

## Methodology

### Read the tests, then judge.

Auditing test quality requires reading test bodies — assertions, exception handling, and fixture setup all live inside function bodies. The default workflow is:

1. **Glob for test files** — `glob "**/test_*.py"` / `glob "**/*.test.ts"` etc.
2. **Read each test file** — read the full file; assertion quality depends on context (imports, fixtures, helpers) that targeted reads risk missing.
3. **Evaluate each test** against the checklists in `checklists/`.
4. **Report findings** by severity with specific fixes.

### LSP as an optional accelerator

LSP tools (`documentSymbol`, `findReferences`, `hover`) can help you navigate large suites, but they are **not required** and **not a substitute for reading test bodies**. Use them opportunistically:

- `lsp.documentSymbol` — get the class/method hierarchy of a large test file before reading it, so you know what's there.
- `lsp.findReferences` — check whether a source function is referenced by any test (for coverage-gap analysis).
- `lsp.hover` — pull docstrings/type info without opening a file.

If LSP is unavailable, continue with file reads alone — the audit is not diminished. Note in the report whether LSP was used.

### Parallelizing file reads for large suites

For suites with many test files, read files in parallel (multiple Read calls in one message) to save wall-clock time. This is the only parallelization worth doing — the audit itself (judging each test) is sequential and done by you, not by subagents.

## Audit Workflow

### Phase 0: Run Tests First

**Before any static analysis, run the test suite to establish a baseline.**

```bash
# pytest
pytest --tb=short -q

# Bun
bun test

# Or the project's own test runner
```

Record:
- Total tests run
- Pass/fail rate
- Any failures (these are critical issues to investigate)
- Test execution time

**Cross-reference counts:** Compare the runner's reported test count against the number of tests you discover by reading files. A mismatch usually means a test is collected but not run (e.g., skipped, or a class not matching the `Test*` pattern), or a discovery miss.

**Why this matters:**
- Static analysis alone produces reports like "Pass rate: Unknown" which is unhelpful
- A failing test is a higher-priority finding than any static analysis issue
- Running tests reveals flaky tests, slow tests, and runtime-only issues

**If tests cannot be run:**
- Note explicitly why (missing dependencies, environment issues)
- Continue with static analysis but flag "tests were not executed" in the report

### Phase 1: Discovery

1. **Find test files** — glob for the framework's test file patterns (see the relevant `frameworks/*.md`).
2. **Read each test file** in full. For large suites, read multiple files in parallel.
3. **Read `conftest.py` / setup files** if they exist — fixtures and hooks live here.

### Phase 2: Analysis

For each test, evaluate against the checklists:

1. **Assertions** (`checklists/assertions.md`) — count assertions, flag none/vacuous/weak/trivial, apply the context-aware decision tree.
2. **Exception handling** (`checklists/exceptions.md`) — find `try/except` and bare `except:`, check for `pytest.raises`/`toThrow` with verification.
3. **Fixtures** (`checklists/fixtures.md`) — hardcoded paths, missing cleanup, duplication, parameterization.
4. **Coverage gaps** (`checklists/coverage.md`) — **opt-in only**; lead with coverage tooling when available.

### Phase 3: Reporting

Generate a markdown report using the template below.

## Framework-Specific Guidance

- `frameworks/pytest.md` — pytest discovery, markers, configuration, conftest hooks
- `frameworks/python.md` — Python-specific: parameterization, global state, string transforms, snapshot testing, CLI testing
- `frameworks/bun.md` — Bun test runner, subprocess testing, lifecycle hooks (also covers Jest/Vitest)
- `frameworks/typescript.md` — TypeScript: interface validation, type assertions, JSON parsing, async patterns

## Checklist Reference

Examples in the checklists are illustrative and shown in Python/pytest; apply each concept in the project's language, using the `frameworks/*.md` files for idioms.

- `checklists/assertions.md` — Assertion quality with context-aware decision tree
- `checklists/exceptions.md` — Exception handling patterns
- `checklists/fixtures.md` — Fixture quality checks
- `checklists/coverage.md` — Coverage gap analysis (opt-in)

## Report Template

```markdown
# Test Suite Audit Report

## Executive Summary

- **Total tests:** N
- **Pass rate:** X% (N passed, M failed)
- **Tests executed:** Yes/No (if No, explain why)
- **Critical issues:** N
- **Medium issues:** N
- **Minor issues:** N
- **Overall health:** Good/Fair/Poor

## Context

- **Project constraints:** [e.g., zero external dependencies, stdlib only, no mocking]
- **Code characteristics:** [e.g., random text generator, deterministic formatter, CLI wrapper]
- **Assertion assessment:** [e.g., "Weak assertions on random output are expected without seeding; recommendations focus on adding deterministic test paths"]

## Findings by Severity

### Critical Issues (Must Fix)

1. **test_name** — Issue description
   - File: `path/to/test_file.py`
   - Line: N
   - Impact: Why this matters
   - Recommendation: Specific fix with code example

### Medium Issues (Should Fix)

1. **test_name** — Issue description *(highest impact in tier)*
   - File: `path/to/test_file.py`
   - Line: N
   - Impact: Why this matters
   - Recommendation: Specific fix with code example

### Minor Issues (Nice to Fix)

1. **test_name** — Issue description
   - File: `path/to/test_file.py`
   - Line: N
   - Recommendation: Specific fix

## Recommendations

### High Priority
1. [Specific, actionable items respecting project constraints]

### Medium Priority
1. [Specific, actionable items]

### Low Priority
1. [Specific, actionable items]

## Notes

- Framework: pytest / Bun / other (see framework-specific docs)
- LSP used: Yes/No
- Tests executed: Yes/No
```

## Best Practices

### When Auditing

1. **Always run tests first** — Establish baseline pass rate before static analysis
2. **Understand the code under test** — Random generators need different assertion standards than deterministic functions
3. **Check project constraints** — Don't recommend tools that violate dependency policies or design principles
4. **Read full test files** — assertion quality depends on surrounding context (fixtures, helpers, imports)
5. **Be specific** in recommendations — provide code examples
6. **Prioritize** issues by impact and severity, including within-tier ranking
7. **Context matters** — some "trivial" tests are intentional smoke tests

### When Reporting

1. **Be constructive** - focus on improvements, not just problems
2. **Provide examples** - show before/after code
3. **Explain why** - help developers understand the issue
4. **Suggest priorities** - help teams decide what to fix first, including within-tier ranking
5. **Note limitations** - if LSP unavailable or tests couldn't be run, mention it
6. **Respect constraints** - all recommendations must be implementable within project constraints

### Common Patterns

**Good test:**
```python
def test_user_authentication():
    user = authenticate("user", "pass")
    assert user is not None
    assert user.username == "user"
    assert user.is_authenticated is True
```

**Bad test (no assertions):**
```python
def test_user_authentication():
    user = authenticate("user", "pass")
    # No assertions - only checks it doesn't crash
```

**Bad test (vacuous loop — passes on empty collection):**
```python
def test_all_items_valid():
    items = get_items()
    for item in items:        # If items is empty, this passes trivially
        assert item.valid
```

**Bad test (mock tautology — tests the mock, not the code):**
```python
def test_process():
    mock = Mock(return_value=42)
    assert mock() == 42   # Just confirms the mock returned what you configured
```

**Bad test (exception swallowing):**
```python
def test_user_authentication():
    try:
        user = authenticate("user", "pass")
    except Exception:
        pass  # Swallows all exceptions
```
