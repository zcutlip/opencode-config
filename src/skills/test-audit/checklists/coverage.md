# Test Coverage Gap Checklist

> _Examples below are illustrative and shown in Python/pytest. The patterns are language-agnostic — apply each concept in the project's language, using `../frameworks/*.md` for language-specific idioms._

> **Opt-in.** Coverage-gap analysis is **not** part of the default test audit — it requires reading source files as well as test files, which is a larger scope. Run it only when explicitly requested, or when the audit surfaces signs of missing tests (e.g. a public function referenced nowhere in the test suite).

## Prefer coverage tooling over manual cross-referencing

Manual "enumerate source functions → find references → diff against tests" is slow and error-prone. Always prefer real coverage tooling when the project supports it — it gives ground truth, including line/branch coverage that manual analysis can't.

### pytest (Python)

```bash
# If pytest-cov is installed
pytest --cov=<package> --cov-report=term-missing

# The --cov-report=term-missing output lists uncovered line numbers per file,
# which is exactly the "untested code" list you'd otherwise build by hand.
```

### Bun / Jest / Vitest (TypeScript/JavaScript)

```bash
# Bun
bun test --coverage

# Jest (if configured)
jest --coverage

# Vitest
vitest run --coverage
```

Coverage tooling output is the primary input. Use the categories below to interpret what the tool reports as uncovered.

## Coverage Categories

### Unit Coverage
- Public functions/methods
- Private functions (if complex)
- Error handling
- Edge cases
- Configuration options

### Integration Coverage
- External system interactions
- Database operations
- API calls
- File I/O operations

### End-to-End Coverage
- Complete workflows
- User scenarios
- Multi-step processes

## Issues to Flag (when running this analysis)

### Medium Issues

#### Untested Public Functions
**Description:** Public functions/methods have no tests
**Severity:** Medium
**Recommendation:** Add tests for all public functions

#### Untested Error Paths
**Description:** Error handling code paths are not tested (coverage tool shows the `raise`/`except` branch as uncovered)
**Severity:** Medium
**Recommendation:** Add tests for error conditions

#### Untested Edge Cases
**Description:** Edge cases (empty, None, boundary values) are not tested
**Severity:** Medium
**Recommendation:** Add tests for empty list, None, single item, boundary values, etc.

### Minor Issues

#### Untested Private Functions
**Description:** Private functions (prefixed with `_`) have no tests
**Severity:** Minor
**Recommendation:** Consider testing if function is complex or critical

#### Untested Configuration Options
**Description:** Configuration options or flags are not tested
**Severity:** Minor
**Recommendation:** Add tests for all configuration options

#### Untested Integration Points
**Description:** Integration with external systems not tested
**Severity:** Minor
**Recommendation:** Add integration tests for external dependencies

## Manual Fallback (when no coverage tool is available)

If the project has no coverage tooling and adding one would violate its constraints, fall back to a manual cross-reference:

1. **Find source files** — `glob "**/*.py"` (exclude test files)
2. **Find test files** — `glob "**/test_*.py"`
3. **Use `lsp.findReferences`** on each public function symbol to check whether it's referenced from any test file.
4. **Diff** to find functions with no test references.

This is approximate — a reference is not a test, and a test may reference a function without meaningfully exercising it. Prefer the coverage tool when possible, and note in the report that coverage was assessed manually.

## Good Patterns

### Testing Happy Path
```python
def test_process_data_success():
    result = process_data("test")
    assert result == "PROCESSED: test"
```

### Testing Error Paths
```python
def test_process_data_empty():
    with pytest.raises(ValueError) as exc_info:
        process_data("")
    assert "cannot be empty" in str(exc_info.value)
```

### Testing Edge Cases
```python
def test_process_list_empty():
    result = process_list([])
    assert result == []

def test_process_list_single():
    result = process_list(["a"])
    assert result == ["A"]

def test_process_list_none():
    with pytest.raises(TypeError):
        process_list(None)
```

### Testing Configuration Options
```python
def test_process_data_verbose():
    with patch("builtins.print") as mock_print:
        process_data("test", verbose=True)
        mock_print.assert_called_once_with("Processing...")
```

## Audit Checklist (when running this analysis)

### Source Code Analysis
- [ ] All public functions have tests
- [ ] All public methods have tests
- [ ] Error paths are tested
- [ ] Edge cases are tested
- [ ] Configuration options are tested
- [ ] Integration points are tested

### Coverage Gaps
- [ ] Identify functions with no tests
- [ ] Identify error paths not tested
- [ ] Identify edge cases not tested
- [ ] Identify configuration options not tested
- [ ] Identify integration points not tested

## Coverage Report Template

```markdown
## Coverage Analysis

- **Method:** coverage tool / manual cross-reference (specify which)
- **Tool:** [e.g., pytest-cov, bun test --coverage, n/a]

### Coverage Gaps

**Untested Functions:**
1. `module.function_name()` - Description
2. `module.Class.method_name()` - Description

**Untested Error Paths:**
1. `module.function_name()` - Error condition not tested

**Untested Edge Cases:**
1. `module.function_name()` - Edge case not tested

**Untested Configuration:**
1. `module.function_name()` - Option not tested
```

## Best Practices

### When to Test Private Functions
- Function is complex (> 20 lines)
- Function has critical business logic
- Function is used by multiple public functions
- Function has error handling that needs testing

### When to Skip Testing
- Trivial getters/setters
- Simple data transformations
- Framework boilerplate code
- Generated code

### Coverage Targets
- Unit tests: 80%+ line coverage
- Integration tests: All critical paths
- End-to-end tests: Key user workflows
