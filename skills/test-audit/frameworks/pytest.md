# pytest Framework Methodology

## Test Discovery

### File Patterns
- `test_*.py` - Standard pytest test files
- `*_test.py` - Alternative pattern
- `tests/test_*.py` - Tests in tests/ directory
- `src/*/tests/test_*.py` - Tests in package subdirectories

### Function Patterns
- `def test_*` - Test functions
- `def *_test` - Alternative pattern (less common)

### Class Patterns
- `class Test*` - Test classes
- Must inherit from `object` (no base class required in pytest)

### Configuration Files
- `pytest.ini` - Primary pytest configuration
- `pyproject.toml` - Modern Python project config (section: `[tool.pytest]`)
- `setup.cfg` - Legacy config (section: `[tool:pytest]`)
- `conftest.py` - Shared fixtures and hooks

## LSP Discovery Strategy

### Find Test Files
```python
# Try LSP workspace symbol search
lsp.workspaceSymbol("test_*")

# Fallback: glob pattern
@explore glob "**/test_*.py"
```

### Get Test Structure
```python
# Try LSP document symbol
lsp.documentSymbol("tests/test_example.py")

# Returns:
# - Test classes (class Test*)
# - Test methods (def test_*)
# - Helper functions (non-test functions)
# - Fixture functions (@pytest.fixture)
```

### Get Test Metadata
```python
# Try LSP hover for docstrings
lsp.hover(file_path, line, character)

# Fallback: read file content
@explore read file_path
```

## Assertion Patterns

### Standard Assertions
```python
assert x == y
assert x != y
assert x < y
assert x > y
assert x <= y
assert x >= y
assert x in y
assert x not in y
assert x is y
assert x is not y
assert isinstance(x, Class)
assert callable(x)
```

### Context Managers
```python
# Exception testing
with pytest.raises(ValueError):
    function_that_raises()

# Warning testing
with pytest.warns(UserWarning):
    function_that_warns()

# Deprecation testing
with pytest.deprecated_call():
    deprecated_function()

# Exit code testing
with pytest.raises(SystemExit) as exc_info:
    sys.exit(1)
assert exc_info.value.code == 1
```

### Assertion Helpers
```python
# Approximate comparison
assert x == pytest.approx(y)

# Exception message checking
with pytest.raises(ValueError) as exc_info:
    raise ValueError("error message")
assert "error message" in str(exc_info.value)

# Multiple assertions in one
assert all(x > 0 for x in values)
assert any(x is None for x in items)
```

## Exception Handling Patterns

### Good Patterns
```python
# Using pytest.raises
def test_raises_exception():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test")
    assert str(exc_info.value) == "test"

# Testing exception type only
def test_raises_exception_type():
    with pytest.raises(ValueError):
        raise ValueError("test")

# Testing no exception raised
def test_no_exception():
    function_that_should_not_raise()
```

### Bad Patterns
```python
# Bare except - swallows all exceptions
def test_bad_bare_except():
    try:
        function_that_might_fail()
    except:
        pass  # BAD: swallows all exceptions

# Catching Exception without verification
def test_bad_catch_exception():
    try:
        function_that_might_fail()
    except Exception:
        pass  # BAD: swallows without verification

# Catching SystemExit without checking exit code
def test_bad_system_exit():
    try:
        main()
    except SystemExit:
        pass  # BAD: doesn't verify exit code
```

### Suspicious Patterns
```python
# Try/except without pytest.raises
def test_suspicious_try_except():
    try:
        result = function_that_might_fail()
    except ValueError:
        result = default_value
    assert result is not None  # Weak assertion

# Overly broad exception catching
def test_overly_broad():
    try:
        function_that_might_fail()
    except (ValueError, TypeError, KeyError, AttributeError):
        pass  # Too broad - hard to test properly
```

## Fixture Patterns

### Fixture Definition
```python
import pytest

@pytest.fixture
def sample_data():
    return {"key": "value"}

@pytest.fixture
def temp_file(tmp_path):
    file = tmp_path / "test.txt"
    file.write_text("content")
    return file

@pytest.fixture(scope="session")
def database():
    db = create_database()
    yield db
    db.cleanup()  # Cleanup after all tests
```

### Fixture Usage
```python
def test_with_fixture(sample_data):
    assert sample_data["key"] == "value"

def test_with_multiple_fixtures(sample_data, temp_file):
    assert sample_data["key"] == "value"
    assert temp_file.exists()
```

### Parametrized Fixtures
```python
@pytest.fixture(params=["a", "b", "c"])
def letter(request):
    return request.param

def test_with_parametrized_fixture(letter):
    assert len(letter) == 1
```

## Common pytest Issues

### Issue 1: Tests with No Assertions
```python
# BAD: No assertions
def test_something():
    result = calculate_something()
    # No assertions - only checks it doesn't crash

# GOOD: Has assertions
def test_something():
    result = calculate_something()
    assert result is not None
    assert result > 0
```

### Issue 2: Weak Assertions
```python
# BAD: Only checks not None
def test_something():
    result = calculate_something()
    assert result is not None

# GOOD: Validates actual value
def test_something():
    result = calculate_something()
    assert result is not None
    assert result == expected_value
```

### Issue 3: Trivial Tests
```python
# BAD: Only checks file existence
def test_file_exists():
    assert os.path.exists("file.txt")

# GOOD: Validates file content
def test_file_exists():
    assert os.path.exists("file.txt")
    with open("file.txt") as f:
        content = f.read()
    assert "expected content" in content
```

### Issue 4: Exception Swallowing
```python
# BAD: Swallows SystemExit from argparse
def test_cli_version():
    try:
        main(["--version"])
    except SystemExit:
        pass  # Doesn't verify it was the expected exit

# GOOD: Verifies exit code
def test_cli_version(capsys):
    with pytest.raises(SystemExit) as exc_info:
        main(["--version"])
    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "version" in captured.out.lower()
```

## pytest-Specific Quality Checks

### Check 1: Test Naming
- Tests should start with `test_`
- Test names should be descriptive
- Test names should describe what is being tested, not how

**Good:**
```python
def test_user_authentication_with_valid_credentials():
    pass

def test_user_authentication_with_invalid_credentials():
    pass
```

**Bad:**
```python
def test_auth_1():
    pass

def test_auth_2():
    pass
```

### Check 2: Test Isolation
- Tests should not depend on each other
- Tests should clean up after themselves
- Tests should be runnable in any order

**Good:**
```python
def test_create_user():
    user = create_user("test")
    assert user.username == "test"
    # Cleanup happens automatically via fixture

def test_delete_user():
    user = create_user("test")
    delete_user(user.id)
    assert not user_exists(user.id)
```

**Bad:**
```python
def test_create_user():
    global user_id
    user_id = create_user("test")

def test_delete_user():
    # Depends on test_create_user running first
    delete_user(user_id)
```

### Check 3: Test Independence
- Tests should not share state
- Tests should not use global variables
- Tests should not modify shared resources

**Good:**
```python
def test_with_fixture(sample_data):
    # Each test gets fresh data
    assert sample_data["key"] == "value"

def test_with_another_fixture(sample_data):
    # Independent from previous test
    assert sample_data["key"] == "value"
```

**Bad:**
```python
global_data = {}

def test_modify_global():
    global_data["key"] = "value"

def test_read_global():
    # Depends on previous test
    assert global_data["key"] == "value"
```

## pytest Configuration Analysis

### pytest.ini
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

### pyproject.toml
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --tb=short"
```

### setup.cfg
```ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts = -v --tb=short
```

## conftest.py Analysis

### Common Patterns
```python
# Shared fixtures
@pytest.fixture
def client():
    app = create_app()
    with app.test_client() as client:
        yield client

# Hooks
def pytest_configure(config):
    # Run before all tests
    pass

def pytest_collection_modifyitems(config, items):
    # Modify test collection
    pass

def pytest_runtest_setup(item):
    # Run before each test
    pass

def pytest_runtest_teardown(item):
    # Run after each test
    pass
```

### Quality Checks
- Are fixtures properly scoped?
- Is there cleanup code?
- Are fixtures parameterized where appropriate?
- Are there duplicate fixtures?
- Are fixtures well-documented?

## pytest Markers

### Common Markers
```python
@pytest.mark.slow
def test_slow_operation():
    pass

@pytest.mark.integration
def test_integration():
    pass

@pytest.mark.skip(reason="Not implemented yet")
def test_not_implemented():
    pass

@pytest.mark.skipif(sys.version_info < (3, 8), reason="Requires Python 3.8+")
def test_python38_feature():
    pass

@pytest.mark.xfail(reason="Known issue")
def test_known_failure():
    pass
```

### Quality Checks
- Are markers used appropriately?
- Are skip reasons documented?
- Are xfail reasons documented?
- Are slow tests marked?
- Are integration tests marked?
