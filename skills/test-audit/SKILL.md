---
name: test-audit
description: "Audit test suites for quality issues: missing assertions, exception swallowing, trivial tests, and fixture problems. LSP-first methodology with graceful fallback."
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: testing
  lsp-priority: true
---

# Test Audit Skill

## What I Do

I conduct comprehensive audits of test suites to identify quality issues and provide actionable recommendations. My approach prioritizes LSP tools for code comprehension to save tokens and time, with graceful fallback to file reading when needed.

### Audit Scope

I analyze test suites for:

**Critical Issues:**
- Tests with NO assertions
- Exception handling that swallows errors without verification
- Tests that only check "doesn't crash" without validation

**Medium Issues:**
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

### Check Project Constraints Before Recommending

Before suggesting any external tool, library, or pattern change:

1. **Check for dependency policies** — Does the project have a zero-dependency or minimal-dependency policy? Don't recommend `pytest-snapshot`, `hypothesis`, or similar if the project avoids external deps.
2. **Check for design principles** — Does the project have explicit design constraints (e.g., "stdlib only", "no mocking", "real implementations only")? Respect these in recommendations.
3. **Check existing patterns** — Does the project already have a pattern for the issue you're flagging? Don't recommend `conftest.py` if the project intentionally uses module-level helpers.

**Rule:** Every recommendation must be implementable within the project's stated constraints. If the ideal solution requires violating a constraint, offer the best alternative that respects it.

### Within-Tier Prioritization

When multiple issues share a severity level, rank them by impact within that tier:

- **Within Critical:** Tests with no assertions > Tests that always pass > Tests with exception swallowing
- **Within Medium:** Tests checking only type > Tests checking only defaults > Tests with weak substring checks
- **Within Minor:** Missing edge cases > Missing documentation > Naming inconsistencies

Report format for within-tier ranking:
```markdown
### Medium Issues (Should Fix)

1. **test_foo** — Only checks `isinstance()` (highest impact in this tier)
2. **test_bar** — Only checks default value
3. **test_baz** — Weak substring check (lowest impact in this tier)
```

This helps teams know which issues to tackle first within each severity level.

### Framework Support

Currently supports:
- **pytest** (Python) - primary framework
- **Bun** (TypeScript/JavaScript) - primary framework
- **unittest** (Python) - planned
- **Jest** (JavaScript) - planned
- **Vitest** (JavaScript/TypeScript) - planned

Auto-detection based on project configuration files and import statements.

## When to Use Me

Use this skill when you need to:
- Assess test suite quality before refactoring
- Identify flaky or low-value tests
- Review test coverage gaps
- Improve test maintainability
- Prepare for code reviews or audits

## LSP-First Methodology

### Why LSP First?

LSP tools provide structured code information without reading entire files:
- `lsp.workspaceSymbol` - Find test files and test functions
- `lsp.documentSymbol` - Get class/method hierarchy
- `lsp.findReferences` - See what code tests reference
- `lsp.goToDefinition` - Jump to tested code
- `lsp.hover` - Get docstrings and type information
- `lsp.goToImplementation`: Find implementations of interfaces/abstract methods
- `lsp.incomingCalls`/`lsp.outgoingCalls`: Analyze call hierarchy

This saves tokens and time by avoiding unnecessary file reads.

### Discovery Workflow

**Step 1: Find test files (LSP-first)**
```python
# Try LSP first
lsp.workspaceSymbol("test_*")  # or "*test*"

# Fallback to explore if LSP fails
@explore glob "**/test_*.py"
```

**Step 2: Get test structure (LSP-first)**
```python
# Try LSP first
lsp.documentSymbol(file_path)  # Returns class/method hierarchy

# Fallback to explore if LSP fails
@explore grep "^def test_" file_path
```

**Step 3: Analyze test content (explore)**
```python
# LSP can't read test bodies, use explore
@explore read file_path  # Read full file for assertions, try/except
```

### Graceful LSP Failure

If LSP is unavailable or returns errors:
1. Log a warning: "LSP unavailable, falling back to file reading"
2. Continue audit using `@explore` for all operations
3. Note in report: "LSP not available - audit used file reading only"

**Never fail the audit due to LSP issues.**

## Audit Workflow

### Phase 0: Run Tests First (Primary Agent)

**Before any static analysis, run the test suite to establish a baseline.**

```bash
# Run all tests and capture pass/fail rate
pytest --tb=short -q

# Or for Bun projects
bun test

# Or use the project's test runner if available
```

Record:
- Total tests run
- Pass/fail rate
- Any failures (these are critical issues to investigate)
- Test execution time

**Cross-reference counts:** After running tests, compare the reported test count against your structural discovery counts. If they differ, re-examine the files in question — LSP discovery can miss module-level test functions or miscount nested classes.

**Why this matters:**
- Static analysis alone produces reports like "Pass rate: Unknown" which is unhelpful
- A failing test is a higher-priority finding than any static analysis issue
- Running tests reveals flaky tests, slow tests, and runtime-only issues

**If tests cannot be run:**
- Note explicitly why (missing dependencies, environment issues)
- Continue with static analysis but flag "tests were not executed" in the report

### Phase 1: Discovery (Explore Agents - Structural Only)

**IMPORTANT:** Explore agents MUST only provide structural information. They should NOT perform any analysis, quality judgments, or semantic understanding.

**Step 1: Discover test layout (single explore agent)**
```
@explore: Find all test files in the project
- Use LSP: lsp.workspaceSymbol("test_*") to find test functions
- Fallback: glob "**/test_*.py"
- Return: List of test files with paths
```

**Step 2: Parallel structural discovery (multiple explore agents)**
```
For EACH test file, spawn a separate @explore agent:

@explore: Get structural information for tests/test_file.py
- Use LSP: lsp.documentSymbol("tests/test_file.py")
- Return:
  * Test classes and their line numbers
  * Test methods and their line numbers
  * Fixture functions and their line numbers
  * Function signatures only (no body content)

Do NOT:
- Read test bodies
- Count assertions
- Analyze quality
- Make recommendations
```

**Step 3: Get test content (primary agent reads selectively)**
```
Primary agent reads test files ONLY when needed for analysis:
- Read specific test functions (not entire files)
- Focus on specific lines identified by explore agents
- Use targeted reads to minimize context
```

### Phase 2: Analysis (Primary Agent - NOT Explore)

**IMPORTANT:** Only the primary agent performs analysis. Explore agents are forbidden from semantic analysis.

For each test:

1. **Check assertions:**
   - Primary agent reads test body (targeted read)
   - Count assertions per test
   - Identify tests with no assertions
   - Flag weak assertions (is not None, len > 0 without content check)
   - Check for default value checks only

2. **Check exception handling:**
   - Primary agent searches for try/except blocks
   - Identify bare `except:` or `except Exception:`
   - Check if exceptions are verified (pytest.raises, assertRaises)
   - Flag swallowed exceptions without validation

3. **Check test quality:**
   - Primary agent analyzes test patterns
   - Identify trivial tests (file existence, type checks only)
   - Check for meaningful assertions vs. trivial conditions
   - Verify test names match actual behavior

4. **Check fixtures** (if conftest.py exists):
   - Primary agent reads conftest.py
   - Identify hardcoded values
   - Check for cleanup mechanisms
   - Look for fixture duplication
   - Assess parameterization opportunities

### Phase 3: Reporting (Primary Agent)

Generate markdown report with:

1. **Executive Summary**
   - Total tests count
   - Pass rate (if available)
   - Critical issues count
   - Overall health assessment

2. **Findings by Severity**
   - Critical (must fix)
   - Medium (should fix)
   - Minor (nice to fix)

3. **Recommendations**
   - Prioritized action items
   - Specific code improvements
   - Best practices suggestions

4. **Statistics**
   - Tests by category
   - Assertion coverage
   - Exception handling quality

## Explore Agent Boundaries

**Explore Agents MUST:**
- Use LSP tools for structure discovery (workspaceSymbol, documentSymbol)
- Return structural information only (file paths, line numbers, signatures)
- Provide lists of functions, classes, test names
- Report where code is located

**Explore Agents MUST NOT:**
- Read entire test files into context
- Count assertions or analyze test content
- Judge test quality or identify issues
- Make recommendations
- Explain how code works
- Perform semantic analysis

**If Explore Agent is Asked to Analyze:**
Use this redirect:
> "I only find and list code — I don\'t analyze test quality. The primary agent should perform the analysis. I can locate the test structure if you\'d like?"

## Parallelization Strategy

### Why Parallelize?

Parallelizing explore agents provides several benefits:
- **Faster discovery:** Multiple agents work simultaneously
- **Smaller context:** Each agent handles a single file
- **Cost effective:** Primary agent (expensive model) doesn't read entire files
- **Focused scope:** Each explore agent has a clear, limited task

### Discovery Phase Parallelization

**Step 1: Layout Discovery (1 explore agent)**
```
@explore: Discover test suite layout
- Find all test files
- Identify test directories
- Return list of files for parallel processing
```

**Step 2: Parallel Structural Discovery (N explore agents)**
```
For each test file, spawn a separate explore agent:

Agent 1: @explore tests/unit/test_toc_parser.py
Agent 2: @explore tests/unit/test_section_filter.py
Agent 3: @explore tests/integration/test_crawl_workflow.py
... and so on

Each agent returns:
- Test classes with line numbers
- Test methods with line numbers
- Function signatures
- Fixture definitions
- NO test body content
```

All explore agents run in parallel for maximum speed.

### Analysis Phase (Primary Agent Only)

The primary agent receives structural information from all explore agents, then:

1. **Prioritize files:** Start with largest/most complex test files
2. **Targeted reads:** Read only specific test functions (not entire files)
3. **Analyze incrementally:** Process one test at a time
4. **Build report:** Accumulate findings as you go

### Example Workflow

```
# Primary agent orchestrates
primary → @explore (layout discovery)
  ↓
primary receives list of 8 test files
  ↓
primary spawns 8 parallel explore agents
  ↓
primary receives structural data from all 8 agents
  ↓
primary analyzes each test (targeted reads)
  ↓
primary generates audit report
```

### Context Management

**Explore agent context (small):**
- Single file path
- LSP documentSymbol result
- Function signatures
- Line numbers

**Primary agent context (incremental):**
- Structural summaries from explore agents
- Targeted test function reads
- Accumulated findings
- Report generation

This approach keeps individual agent contexts small while allowing comprehensive analysis.

### When to Use Parallelization

**Use parallelization when:**
- More than 3 test files
- Test files are large (> 500 lines)
- Multiple test modules
- Time is a concern

**Skip parallelization when:**
- 1-2 small test files
- Simple test suite
- Quick audit needed

## Framework-Specific Guidance

See `frameworks/pytest.md` for detailed pytest methodology, assertion patterns, exception handling, and fixture analysis.
See `frameworks/python.md` for Python-specific considerations including nondeterministic code testing, parameterization, and global state patterns.
See `frameworks/bun.md` for Bun test runner methodology, subprocess testing patterns, and lifecycle hook usage.
See `frameworks/typescript.md` for TypeScript-specific considerations including interface validation, type assertions, and JSON parsing patterns.

## Checklist Reference

Detailed checklists are available in the `checklists/` directory:
- `checklists/assertions.md` — Assertion quality assessment with decision tree
- `checklists/exceptions.md` — Exception handling patterns
- `checklists/fixtures.md` — Fixture quality checks
- `checklists/coverage.md` — Coverage gap analysis

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

## Statistics

### Test Distribution
| File | Tests | Classes |
|------|-------|---------|
| `test_file.py` | N | N |
| **Total** | **N** | **N** |

### Assertion Quality
- Tests with no assertions: N
- Tests with weak assertions: N (list: test_a, test_b)
- Tests with strong assertions: N (~X%)

### Exception Handling
- Tests with try/except: N
- Tests with proper exception testing: N
- Tests with swallowed exceptions: N

### Fixture Quality
- Total fixtures: N
- Fixtures with cleanup: N
- Fixtures parameterized: N
- Parameterization opportunities: N

## Notes

- Framework: pytest / Bun / other (see framework-specific docs)
- LSP available: Yes/No
- Audit method: LSP-first / File-reading only
- Tests executed: Yes/No
```

## Best Practices

### When Auditing

1. **Always run tests first** — Establish baseline pass rate before static analysis
2. **Understand the code under test** — Random generators need different assertion standards than deterministic functions
3. **Check project constraints** — Don't recommend tools that violate dependency policies or design principles
4. **Read files selectively** — Only when content analysis needed
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

**Bad test (trivial):**
```python
def test_user_authentication():
    user = authenticate("user", "pass")
    assert user is not None  # Only checks not None
```

**Bad test (exception swallowing):**
```python
def test_user_authentication():
    try:
        user = authenticate("user", "pass")
    except Exception:
        pass  # Swallows all exceptions
```
