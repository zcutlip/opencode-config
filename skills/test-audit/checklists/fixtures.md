# Fixture Quality Checklist

> _Examples below are illustrative and shown in Python/pytest. The patterns are language-agnostic — apply each concept in the project's language, using `../frameworks/*.md` for language-specific idioms._

## Medium Issues

### Hardcoded Output Directories
**Description:** Fixtures use hardcoded directory paths that may cause conflicts
**Severity:** Medium
**Example:**
```python
@pytest.fixture
def output_dir():
    return "test_output"  # BAD: hardcoded path
```
**Recommendation:** Use tmp_path fixture or parameterize output directories

### No Cleanup Mechanism
**Description:** Fixtures create resources but don't clean them up
**Severity:** Medium
**Example:**
```python
@pytest.fixture
def database():
    db = create_database()
    return db  # BAD: no cleanup
```
**Recommendation:** Use yield and cleanup code

### Fixture Duplication
**Description:** Multiple fixtures with similar functionality
**Severity:** Medium
**Example:**
```python
@pytest.fixture
def crawler():
    return Crawler(output_dir="test_output")

@pytest.fixture
def crawler_with_images():
    return Crawler(output_dir="test_output_images", download_images=True)

@pytest.fixture
def crawler_with_frontmatter():
    return Crawler(output_dir="test_output_frontmatter", frontmatter=True)
```
**Recommendation:** Consolidate into parameterized fixture

## Minor Issues

### No Parameterization
**Description:** Fixtures could be parameterized but aren't
**Severity:** Minor
**Example:**
```python
@pytest.fixture
def sample_data():
    return {"key": "value"}  # Could be parameterized for different data sets
```
**Recommendation:** Use params or indirect parameterization

### Missing Docstrings
**Description:** Fixtures lack documentation
**Severity:** Minor
**Example:**
```python
@pytest.fixture
def sample_data():  # BAD: no docstring
    return {"key": "value"}
```
**Recommendation:** Add docstrings explaining fixture purpose

### No Type Hints
**Description:** Fixtures lack type annotations
**Severity:** Minor
**Example:**
```python
@pytest.fixture
def sample_data():  # BAD: no type hint
    return {"key": "value"}
```
**Recommendation:** Add type hints for better IDE support

## Good Patterns

### Using tmp_path for Temporary Files
```python
@pytest.fixture
def temp_file(tmp_path):
    file = tmp_path / "test.txt"
    file.write_text("content")
    return file
```

### Proper Cleanup with yield
```python
@pytest.fixture
def database():
    db = create_database()
    yield db
    db.cleanup()  # Cleanup after test
```

### Parameterized Fixtures
```python
@pytest.fixture(params=["a", "b", "c"])
def letter(request):
    return request.param
```

### Consolidated Fixtures
```python
@pytest.fixture
def crawler(request):
    config = {
        "output_dir": "test_output",
        "download_images": False,
        "frontmatter": False,
    }
    if request.param == "images":
        config["download_images"] = True
    elif request.param == "frontmatter":
        config["frontmatter"] = True
    return Crawler(**config)
```

## Framework-Specific Patterns

### pytest (Python)
```python
# Good: Using tmp_path
@pytest.fixture
def temp_file(tmp_path):
    file = tmp_path / "test.txt"
    file.write_text("content")
    return file

# Good: Using yield for cleanup
@pytest.fixture
def database():
    db = create_database()
    yield db
    db.cleanup()

# Good: Parameterized fixture
@pytest.fixture(params=["a", "b", "c"])
def letter(request):
    return request.param

# Good: Fixture with scope
@pytest.fixture(scope="session")
def shared_resource():
    resource = create_resource()
    yield resource
    resource.cleanup()
```

### unittest (Python)
```python
# Good: setUp and tearDown
class TestSomething(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.temp_file.write(b"content")
        self.temp_file.close()

    def tearDown(self):
        os.unlink(self.temp_file.name)
```

### Jest (JavaScript)
```javascript
// Good: beforeEach and afterEach
beforeEach(() => {
  tempFile = createTempFile();
});

afterEach(() => {
  cleanupTempFile(tempFile);
});
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
- [ ] Fixtures are properly scoped (function, class, module, session)
- [ ] Fixtures have cleanup code where needed
- [ ] Fixtures are parameterized where appropriate
- [ ] No duplicate fixtures
- [ ] Fixtures are well-documented
- [ ] Fixtures use tmp_path for temporary files
- [ ] Fixtures don't leave resources behind after tests

## Audit Checklist

For each fixture, check:
- [ ] Not using hardcoded paths (use tmp_path or parameterize)
- [ ] Has cleanup mechanism if needed (yield or tearDown)
- [ ] Not duplicated with other fixtures (consolidate if similar)
- [ ] Parameterized if multiple configurations needed
- [ ] Has docstring explaining purpose
- [ ] Has type hints for better IDE support
- [ ] Uses appropriate scope (function, class, module, session)
- [ ] Doesn't leave resources behind after tests
