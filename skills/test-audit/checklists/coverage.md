# Test Coverage Gap Checklist

## Medium Issues

### Untested Public Functions
**Description:** Public functions/methods have no tests
**Severity:** Medium
**Example:**
```python
# module.py
def public_function():
    pass

# No test file for this module
```
**Recommendation:** Add tests for all public functions

### Untested Error Paths
**Description:** Error handling code paths are not tested
**Severity:** Medium
**Example:**
```python
def process_data(data):
    if not data:
        raise ValueError("Data cannot be empty")
    return data

# Test only covers happy path, not error case
def test_process_data():
    result = process_data("test")
    assert result == "test"
```
**Recommendation:** Add tests for error conditions

### Untested Edge Cases
**Description:** Edge cases (empty, None, boundary values) are not tested
**Severity:** Medium
**Example:**
```python
def process_list(items):
    return [item.upper() for item in items]

# Test only covers normal case
def test_process_list():
    result = process_list(["a", "b"])
    assert result == ["A", "B"]
```
**Recommendation:** Add tests for empty list, None, single item, etc.

## Minor Issues

### Untested Private Functions
**Description:** Private functions (prefixed with _) have no tests
**Severity:** Minor
**Example:**
```python
def _helper_function():
    pass

# No tests for private function
```
**Recommendation:** Consider testing if function is complex or critical

### Untested Configuration Options
**Description:** Configuration options or flags are not tested
**Severity:** Minor
**Example:**
```python
def process_data(data, verbose=False):
    if verbose:
        print("Processing...")
    return data

# Tests don't cover verbose flag
```
**Recommendation:** Add tests for all configuration options

### Untested Integration Points
**Description:** Integration with external systems not tested
**Severity:** Minor
**Example:**
```python
def save_to_database(data):
    db.insert(data)

# Tests mock database but don't test actual integration
```
**Recommendation:** Add integration tests for external dependencies

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

## Coverage Analysis Techniques

### LSP-Based Discovery
```python
# Find all public functions
lsp.workspaceSymbol("def ")  # Get all function definitions

# Find references to see what's tested
lsp.findReferences(function_symbol)  # See if function is referenced in tests

# Get class structure
lsp.documentSymbol(file_path)  # Get all methods
```

### Manual Analysis
```python
# Find source files
@explore glob "**/*.py"  # Exclude test files

# Find test files
@explore glob "**/test_*.py"

# Compare to find gaps
```

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

## Audit Checklist

### Source Code Analysis
- [ ] All public functions have tests
- [ ] All public methods have tests
- [ ] Error paths are tested
- [ ] Edge cases are tested
- [ ] Configuration options are tested
- [ ] Integration points are tested

### Test Coverage
- [ ] Happy paths are tested
- [ ] Error paths are tested
- [ ] Edge cases are tested
- [ ] Boundary values are tested
- [ ] Invalid inputs are tested
- [ ] Concurrent access is tested (if applicable)

### Coverage Gaps
- [ ] Identify functions with no tests
- [ ] Identify error paths not tested
- [ ] Identify edge cases not tested
- [ ] Identify configuration options not tested
- [ ] Identify integration points not tested

## Coverage Report Template

```markdown
## Coverage Analysis

### Source Files
- Total source files: N
- Files with tests: N
- Files without tests: N

### Functions/Methods
- Total public functions: N
- Functions with tests: N
- Functions without tests: N

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
