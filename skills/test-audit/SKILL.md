---
name: test-audit
description: "Audit test suites for quality issues: missing assertions, exception swallowing, trivial tests, fixture problems, and flakiness patterns. Supports pytest (Python) and Bun/Jest/Vitest/node:test (TypeScript/JavaScript)."
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
- Shared mutable state and order-dependent tests (see `checklists/isolation.md`)

**Medium Issues:**
- Tests that only check `is not None` / `len() > 0` / type, without value validation (context-dependent — see Context-Aware Analysis)
- Tests that only check default values or trivial conditions
- Weak assertions that could pass on wrong output
- Fixture quality problems (hardcoded values, no cleanup)
- Flaky test patterns: fixed delays, unfrozen time, unseeded randomness, environment dependencies (see `checklists/flakiness.md`)

**Minor Issues:**
- Misleading test names
- Edge case tests with minimal validation
- Inconsistent assertion patterns
- Missing cleanup, stale snapshots

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

- **Within Critical:** Tests with no assertions > Tests that always pass > Tests with exception swallowing > Order-dependent tests
- **Within Medium:** Tests checking only type > Tests checking only defaults > Tests checking only file existence > Flaky patterns
- **Within Minor:** Missing edge cases > Missing documentation > Naming inconsistencies

Report format for within-tier ranking:
```markdown
### Medium Issues (Should Fix)

1. **test_foo** — Only checks `isinstance()` (highest impact in this tier)
2. **test_bar** — Only checks default value
3. **test_baz** — Only checks file existence (lowest impact in this tier)
```

This helps teams know which issues to tackle first within each severity level.

## When to Use Me

Use this skill when you need to:
- Assess test suite quality before refactoring
- Identify flaky or low-value tests (see `checklists/flakiness.md`)
- Find test isolation problems (see `checklists/isolation.md`)
- Review test coverage gaps (opt-in — see `checklists/coverage.md`)
- Improve test maintainability
- Prepare for code reviews or audits

## When NOT to Use Me

- **Writing new tests** — This skill audits existing tests; it doesn't write them.
- **Chasing coverage percentages** — Coverage is opt-in and secondary to quality (see `checklists/coverage.md`).
- **Replacing CI** — Running the test suite here is a baseline check, not a CI substitute.

## Methodology

### Read the tests, then judge.

Auditing test quality requires reading test bodies — assertions, exception handling, and fixture setup all live inside function bodies. The default workflow is:

1. **Glob for test files** — `glob "**/test_*.py"` / `glob "**/*.test.ts"` etc.
2. **Read each test file** — read the full file; assertion quality depends on context (imports, fixtures, helpers) that targeted reads risk missing.
3. **Evaluate each test** against the checklists in `checklists/`.
4. **Report findings** by severity with specific fixes.

### Heuristic Pre-Scan (Tier 1)

Before deep-reading, run cheap grep patterns across the entire suite to find mechanical issues and prioritize reading order:

- `assert True` / `assert True:` — no-op assertions
- Commented-out asserts — `# assert` patterns
- Bare `except:` — exception swallowing
- Skips without reason — `@pytest.mark.skip` / `.skip()` / `{ skip: true }` without `reason=`
- `sleep(` / `time.sleep` — fixed delays
- `Date.now()` / `datetime.now()` — unfrozen time
- `Mock(return_value` followed by asserting on the mock — mock tautology candidates

These patterns run suite-wide regardless of audit mode — they catch the most egregious issues even before reading begins. Results also set reading priority: files with the most hits get read first.

### Audit Modes

The skill supports two modes. Choose based on the suite size and the user's goal.

**Fix-list mode (default, exhaustive).** Read every test file and produce a complete findings list. The goal is: the user can fix everything.

- Files are read in batches of ~30, worst-first (pre-scan results determine order).
- Per-batch progress notes: "Batch 2/6: 3 Critical, 5 Medium so far."
- Findings accumulate as compact one-liners between batches.
- Resumable: if the user stops early, the partial report covers the worst files; "continue" picks up.
- Full report earns completeness claims: "All N files read."

**Health-check mode (opt-in, sampled).** Quick assessment — not a complete fix list.

- Read: all conftest/setup files + all pre-scan-flagged files + largest files per directory.
- Disclosure is mandatory: "N of M files read, selected by [criteria]."
- No completeness claims — findings read "at least these issues exist."
- Coverage-gap analysis is incompatible with sampled mode; note this in the report.

**Mode selection:**
- ≤30 test files → just run (fix-list; one batch).
- 31–100 files → fix-list mode by default (2–4 batches).
- >100 files → ask the user: "Full batched audit, or sampled health check?"

### LSP as an optional accelerator

LSP tools (`documentSymbol`, `findReferences`, `hover`) can help you navigate large suites, but they are **not required** and **not a substitute for reading test bodies**. Use them opportunistically:

- `lsp.documentSymbol` — get the class/method hierarchy of a large test file before reading it, so you know what's there.
- `lsp.findReferences` — check whether a source function is referenced by any test (for coverage-gap analysis).
- `lsp.hover` — pull docstrings/type info without opening a file.

If LSP is unavailable, continue with file reads alone — the audit is not diminished. Note in the report whether LSP was used.

### Parallelizing file reads for large suites

For suites with many test files, read files in parallel (multiple Read calls in one message) to save wall-clock time. This is the only parallelization worth doing — the audit itself (judging each test) is sequential and done by you, not by subagents.

## Audit Workflow

### Phase 0: Establish a Green Baseline

**Before any static analysis, run the test suite.** A green suite is table stakes — the purpose is not to discover pass/fail (the user likely already knows), but to:

1. **Gate the audit.** If the suite is red — any failures, collection errors, or import breaks — **stop immediately and report**. Auditing a broken suite is premature; fix the red tests first. The report template includes an abort path for this case.

2. **Collection cross-reference.** Compare the runner's reported test count against the number of tests you discover by reading files. A mismatch means silently uncollected tests. Common causes:
   - Misnamed test class (`FooTest` instead of `TestFoo` in pytest)
   - Wrong glob pattern (file doesn't match `test_*.py` / `*.test.ts`)
   - Import error at collection time (test file never loads)
   - Skip marker hiding the test from the count

   `pytest --collect-only -q` is the cheap alternative when a full run is impractical — it gives the count without executing test bodies.

3. **Secondary signals.** `--durations` for slow tests. A suite that can't complete within ~10 minutes is itself a quality finding.

```bash
# pytest
pytest --tb=short -q --durations=10

# Bun
bun test

# node:test
node --test

# Or the project's own test runner
```

**Safety note:** Running the test suite executes repo code (filesystem and network side effects are possible). Use the project's own runner command; be cautious in unfamiliar repos.

**If the suite cannot be run:**
- Note explicitly why (missing dependencies, environment issues, timeout).
- Continue with static analysis but flag "tests were not executed" in the report.

### Phase 1: Discovery

1. **Find test files** — glob for the framework's test file patterns (see the relevant `frameworks/*.md`).
2. **Run heuristic pre-scan** — grep suite-wide for mechanical patterns (see Heuristic Pre-Scan above).
3. **Read each test file** — in batches, worst-first. For large suites, read multiple files in parallel within each batch.
4. **Read `conftest.py` / setup files** if they exist — fixtures and hooks live here.

### Phase 2: Analysis

For each test, evaluate against the checklists:

1. **Assertions** (`checklists/assertions.md`) — count assertions, flag none/vacuous/weak/trivial, apply the context-aware decision tree.
2. **Exception handling** (`checklists/exceptions.md`) — find `try/except` and bare `except:`, check for `pytest.raises`/`toThrow` with verification.
3. **Fixtures** (`checklists/fixtures.md`) — hardcoded paths, missing cleanup, duplication, parameterization.
4. **Isolation** (`checklists/isolation.md`) — shared mutable state, order dependence, global variables, scope mismatches.
5. **Flakiness** (`checklists/flakiness.md`) — sleep delays, unfrozen time, unseeded randomness, environment deps, unmocked external services.
6. **Coverage gaps** (`checklists/coverage.md`) — **opt-in only**; lead with coverage tooling when available. Incompatible with health-check (sampled) mode.

### Phase 3: Reporting

Generate a markdown report using the template below.

## Frameworks & Checklists

### Framework Auto-Detection

| Framework | Detection Signals | Docs |
|-----------|------------------|------|
| **pytest** | `pytest.ini`, `pyproject.toml` `[tool.pytest]`, `conftest.py`, `import pytest` | `frameworks/pytest.md`, `frameworks/python.md` |
| **Bun** | `bunfig.toml`, `bun.lockb`, `import {...} from "bun:test"` | `frameworks/bun.md`, `frameworks/typescript.md` |
| **Jest / Vitest** | `jest.config.*`, `vitest.config.*`, `import {...} from "@jest/globals"` / `"vitest"` | `frameworks/bun.md` (Jest-compatible API), `frameworks/typescript.md` |
| **node:test** | `"node --test"` in package.json scripts, `import {...} from "node:test"`, absence of Bun/Jest/Vitest config | `frameworks/node.md`, `frameworks/typescript.md` |
| **unittest** | `import unittest`, `class Test*(unittest.TestCase)` | Python checklists apply; uses `assertRaises`/`assertEqual` instead of pytest idioms |

### Framework Docs

Examples in the checklists are illustrative and shown in Python/pytest; apply each concept in the project's language, using the framework files for idioms.

- `frameworks/pytest.md` — pytest discovery, markers, configuration, conftest hooks
- `frameworks/python.md` — Python-specific: parameterization, global state, string transforms, snapshot testing, CLI testing
- `frameworks/bun.md` — Bun test runner, subprocess testing, lifecycle hooks (also covers Jest/Vitest)
- `frameworks/node.md` — Node.js built-in test runner: `node:assert/strict` patterns, mocking, subprocess testing
- `frameworks/typescript.md` — TypeScript: interface validation, type assertions, JSON parsing, async patterns

### Checklist Docs

- `checklists/assertions.md` — Assertion quality with context-aware decision tree (includes mock tautology and property-based testing)
- `checklists/exceptions.md` — Exception handling patterns
- `checklists/fixtures.md` — Fixture quality checks
- `checklists/isolation.md` — Test isolation: shared state, order dependence, scope mismatches
- `checklists/flakiness.md` — Flaky test patterns: sleep, time, randomness, environment, network
- `checklists/coverage.md` — Coverage gap analysis (opt-in)

## Report Template

```markdown
# Test Suite Audit Report

## Executive Summary

- **Total tests:** N
- **Suite status:** Green / Red — audit not performed
- **Collection cross-reference:** Runner reported N tests, discovery found M tests (match / mismatch + explanation)
- **Tests executed:** Yes/No (if No, explain why)
- **Audit mode:** Fix-list (exhaustive, N of M files read) / Health-check (sampled, N of M files read, selection: [criteria])
- **Critical issues:** N
- **Medium issues:** N
- **Minor issues:** N
- **Overall health:** Good/Fair/Poor

### Health Rubric

- **Poor:** Suite red/audit aborted, OR ≥1 Critical issue
- **Fair:** 0 Critical, but any Medium issues
- **Good:** 0 Critical, 0 Medium, only scattered Minor

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

**OR, for grouped findings (≥3 tests sharing the same issue):**

1. **[Issue type]** — Issue description *(N tests affected)*
   - Affected tests: `test_a` (line X), `test_b` (line Y), `test_c` (line Z)
   - Impact: Why this matters
   - Recommendation: Single fix with code example

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

- Framework: pytest / Bun / node:test / other
- Audit mode: Fix-list (exhaustive) / Health-check (sampled)
- Files read: N of M (if sampled, describe selection criteria)
- LSP used: Yes/No
- Tests executed: Yes/No
- Issue counts are instances — a single test may contribute multiple findings
```

### Red-Suite Abort Report

If Phase 0 finds the suite is red, produce this abbreviated report instead:

```markdown
# Test Suite Audit Report — Aborted

## Executive Summary

- **Suite status:** Red — audit not performed
- **Failures:** N
- **Collection errors:** N (if any)
- **Recommendation:** Fix the failing tests before running a quality audit.

## Failures

1. **test_name** — Failure description
   - File: `path/to/test_file.py`
   - Error: [truncated error message]
```

## Best Practices

### When Auditing

1. **Run the suite first** — Establish a green baseline; abort if red
2. **Pre-scan with greps** — Catch mechanical issues suite-wide before deep reading
3. **Understand the code under test** — Random generators need different assertion standards than deterministic functions
4. **Check project constraints** — Don't recommend tools that violate dependency policies or design principles
5. **Read full test files** — assertion quality depends on surrounding context (fixtures, helpers, imports)
6. **Be specific** in recommendations — provide code examples
7. **Prioritize** issues by impact and severity, including within-tier ranking
8. **Context matters** — some "trivial" tests are intentional smoke tests

### When Reporting

1. **Be constructive** — focus on improvements, not just problems
2. **Provide examples** — show before/after code
3. **Explain why** — help developers understand the issue
4. **Suggest priorities** — help teams decide what to fix first, including within-tier ranking
5. **Note limitations** — if LSP unavailable or tests couldn't be run, mention it
6. **Respect constraints** — all recommendations must be implementable within project constraints
7. **Group when possible** — ≥3 tests sharing an issue: report once with affected-test list
8. **Disclose sampling** — in health-check mode, always report what was and wasn't read
