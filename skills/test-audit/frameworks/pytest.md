# pytest Framework Methodology

> This file covers pytest-specific **idioms and syntax**. The *what to look for* (assertion quality, exception handling, fixture quality, coverage) lives in `../checklists/` — apply those checklists using the patterns below.

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
- `pyproject.toml` - Modern Python project config (section: `[tool.pytest.ini_options]`)
- `setup.cfg` - Legacy config (section: `[tool:pytest]`)
- `conftest.py` - Shared fixtures and hooks

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

> For what makes these assertions *good* vs *weak* vs *vacuous*, see `../checklists/assertions.md` (includes the context-aware decision tree for nondeterministic code).

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

> For fixture quality checks (hardcoded paths, cleanup, duplication, parameterization), see `../checklists/fixtures.md`.

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
- Are skip reasons documented? (A skip with no `reason=` is a Critical finding — see `../checklists/assertions.md`)
- Are xfail reasons documented?
- Are slow tests marked?
- Are integration tests marked?

## Cross-Reference: Python-Specific Considerations

For Python-specific audit guidance, see `python.md` which covers:

- **Parameterization opportunities** — When to recommend `@pytest.mark.parametrize`
- **Global state and conftest.py patterns** — Converting module-level helpers to fixtures
- **String transform testing** — Edge cases for case/conjugation transforms
- **Snapshot testing without external deps** — Native pytest snapshot patterns
- **CLI testing patterns** — argparse exit codes, capsys usage

Always check `python.md` before finalizing a Python/pytest audit report.
