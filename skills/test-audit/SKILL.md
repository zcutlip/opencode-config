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

### Framework Support

Currently supports:
- **pytest** (Python) - primary framework
- **unittest** (Python) - planned
- **Jest** (JavaScript) - planned

Auto-detection based on project configuration files.

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

## Explore Agent Prompt Examples

### Layout Discovery Prompt

Use this prompt for the initial layout discovery:

```
@explore: Discover test suite layout

Find all test files in the project:
- Use LSP: lsp.workspaceSymbol("test_*") to find test functions
- Fallback: glob "**/test_*.py" if LSP unavailable

Return:
- List of all test files with full paths
- Test directory structure
- Total count of test files

Do NOT:
- Read any test files
- Analyze test content
- Count tests or assertions
- Make any quality judgments
```

### Structural Discovery Prompt (Per File)

Use this prompt for each test file (spawn in parallel):

```
@explore: Get structural information for tests/test_file.py

Use LSP to get the test structure:
- lsp.documentSymbol("tests/test_file.py")

Return:
- Test classes with line numbers
- Test methods with line numbers
- Fixture functions with line numbers
- Function signatures (name, parameters, return type if available)

Format as:
```
Class: TestClassName (line N)
  Method: test_method_name (line N)
  Method: test_another_method (line N)

Fixture: fixture_name (line N)
```

Do NOT:
- Read test bodies
- Count assertions
- Analyze test quality
- Identify issues
- Make recommendations
- Explain how tests work
```

### What NOT to Ask Explore Agents

**❌ WRONG - Asks for analysis:**
```
@explore: Analyze tests in test_file.py
- Count assertions in each test
- Identify tests with no assertions
- Check for exception swallowing
- Assess test quality
```

**✅ CORRECT - Asks for structure only:**
```
@explore: Get structural information for tests/test_file.py
- List test classes and methods with line numbers
- List fixture definitions with line numbers
- Return function signatures only
```

**❌ WRONG - Asks for quality judgment:**
```
@explore: Find bad tests in test_file.py
- Identify tests with no assertions
- Find tests that only check is not None
- Locate exception swallowing
```

**✅ CORRECT - Asks for location only:**
```
@explore: Find test functions in tests/test_file.py
- Return list of all test functions with line numbers
- Return function signatures
```

### Redirect When Explore Agent Oversteps

If an explore agent starts providing analysis or quality judgments, use this redirect:

> "You're providing analysis, which is outside your scope. Explore agents should only provide structural information (file paths, line numbers, function signatures). Please return only the structural data and let the primary agent perform the analysis."

Then restate the correct prompt asking for structural information only.

## Framework-Specific Checks

### pytest (Python)

**Test Discovery:**
- Pattern: `test_*.py` files
- Functions: `def test_*`
- Classes: `class Test*`

**Assertion Patterns:**
- `assert` statements
- `pytest.raises()` context managers
- `pytest.warns()` context managers

**Exception Handling:**
- Try/except without pytest.raises = suspicious
- Catching Exception/BaseException = suspicious
- SystemExit swallowing = suspicious (verify argparse exits)

**Fixture Patterns:**
- `@pytest.fixture` decorators
- `conftest.py` files
- `pytest.ini` or `pyproject.toml` [tool.pytest]

### unittest (Python) - Planned

**Test Discovery:**
- Pattern: `test_*.py` files
- Classes: `unittest.TestCase` subclasses
- Methods: `def test_*`

**Assertion Patterns:**
- `self.assert*()` methods
- `self.assertRaises()` context managers

**Exception Handling:**
- Try/except without assertRaises = suspicious

### Jest (JavaScript) - Planned

**Test Discovery:**
- Pattern: `*.test.js`, `*.spec.js` files
- Functions: `test()`, `it()`
- Suites: `describe()`

**Assertion Patterns:**
- `expect()` matchers
- `.toThrow()` for exceptions

## Checklist Reference

### Assertions Checklist

**Critical:**
- [ ] Test has NO assertions
- [ ] Test only checks `is not None` without further validation
- [ ] Test only checks `len() > 0` without content validation

**Medium:**
- [ ] Test only checks default values (e.g., `assert x == 0`)
- [ ] Test only checks file existence (`assert os.path.exists()`)
- [ ] Test only checks type (`assert isinstance(x, str)`)

**Minor:**
- [ ] Weak assertions (`or` conditions that make tests too permissive)
- [ ] Assertions that could pass on wrong output
- [ ] Misleading test names

### Exception Handling Checklist

**Critical:**
- [ ] Bare `except:` clause
- [ ] `except Exception:` without verification
- [ ] Catching SystemExit without checking exit code

**Medium:**
- [ ] Try/except without pytest.raises/assertRaises
- [ ] Exception caught but not re-raised or verified

**Minor:**
- [ ] Overly broad exception catching
- [ ] No error message verification

### Fixture Checklist

**Medium:**
- [ ] Hardcoded output directories
- [ ] No cleanup mechanism
- [ ] Fixture duplication (multiple similar fixtures)

**Minor:**
- [ ] No parameterization
- [ ] Missing docstrings
- [ ] No type hints

## Report Template

```markdown
# Test Suite Audit Report

## Executive Summary

- **Total tests:** N
- **Pass rate:** X%
- **Critical issues:** N
- **Medium issues:** N
- **Minor issues:** N
- **Overall health:** Good/Fair/Poor

## Findings by Severity

### Critical Issues (Must Fix)

1. **test_name** - Issue description
   - File: `path/to/test_file.py`
   - Line: N
   - Recommendation: Specific fix

### Medium Issues (Should Fix)

1. **test_name** - Issue description
   - File: `path/to/test_file.py`
   - Line: N
   - Recommendation: Specific fix

### Minor Issues (Nice to Fix)

1. **test_name** - Issue description
   - File: `path/to/test_file.py`
   - Line: N
   - Recommendation: Specific fix

## Recommendations

### High Priority
1. Fix critical issues
2. Improve exception handling

### Medium Priority
1. Refactor trivial tests
2. Improve fixture quality

### Low Priority
1. Add test documentation
2. Improve test names

## Statistics

### Test Distribution
- Unit tests: N
- Integration tests: N
- End-to-end tests: N

### Assertion Quality
- Tests with no assertions: N
- Tests with weak assertions: N
- Tests with strong assertions: N

### Exception Handling
- Tests with try/except: N
- Tests with proper exception testing: N
- Tests with swallowed exceptions: N

### Fixture Quality
- Total fixtures: N
- Fixtures with cleanup: N
- Fixtures parameterized: N

## Notes

- Framework: pytest/unittest/jest
- LSP available: Yes/No
- Audit method: LSP-first / File-reading only
```

## Best Practices

### When Auditing

1. **Always try LSP first** for structure discovery
2. **Read files selectively** - only when content analysis needed
3. **Be specific** in recommendations - provide code examples
4. **Prioritize** issues by impact and severity
5. **Context matters** - some "trivial" tests are intentional smoke tests

### When Reporting

1. **Be constructive** - focus on improvements, not just problems
2. **Provide examples** - show before/after code
3. **Explain why** - help developers understand the issue
4. **Suggest priorities** - help teams decide what to fix first
5. **Note limitations** - if LSP unavailable, mention it

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

## Limitations

- Cannot execute tests (static analysis only)
- May miss runtime-only issues
- Framework-specific knowledge required for new frameworks
- LSP availability affects performance and accuracy

## Future Enhancements

- Support for more frameworks (unittest, Jest, Mocha, etc.)
- Test coverage analysis integration
- Flaky test detection patterns
- Performance test auditing
- Security test auditing
- Accessibility test auditing
