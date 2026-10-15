# Test Isolation Checklist

> _Examples below are illustrative and shown in Python/pytest. The patterns are language-agnostic — apply each concept in the project's language, using `../frameworks/*.md` for language-specific idioms._

## Critical Issues

### Shared Mutable State Between Tests
**Description:** Tests share and mutate module-level or global state (dicts, lists, registries, class attributes). One test's modifications persist into the next test, making results order-dependent.
**Severity:** Critical
**Example:**
```python
# BAD: Global mutable state
cache = {}

def test_set_value():
    cache["key"] = "value"
    assert cache["key"] == "value"

def test_read_value():
    assert cache["key"] == "value"  # Fails if test_set_value hasn't run
```
**Recommendation:** Use fixtures to provide fresh state per test:
```python
@pytest.fixture
def cache():
    return {}

def test_set_value(cache):
    cache["key"] = "value"
    assert cache["key"] == "value"

def test_read_value(cache):
    # Gets a fresh empty cache — independent of test_set_value
    assert "key" not in cache
```

### Tests That Must Run in Sequence
**Description:** Tests are designed to run in a specific order — each test depends on state set up by the previous one. Any reordering or parallel execution breaks the suite.
**Severity:** Critical
**Example:**
```python
created_id = None

def test_create():
    global created_id
    created_id = create_resource()

def test_update():
    update_resource(created_id)  # Depends on test_create

def test_delete():
    delete_resource(created_id)  # Depends on test_create
```
**Recommendation:** Each test should set up its own world. Combine create→update→delete into a single test if the sequence is the behavior under test, or use fixtures to provide pre-created resources.

## Medium Issues

### Module-Level Helpers That Clear Global State
**Description:** Tests call helper functions (not fixtures) to reset global state (registries, caches, singletons). Isolation depends on every test remembering to call the helper — if one forgets, state leaks.
**Severity:** Medium
**Example:**
```python
def _reset_registry():
    Registry.clear()

def test_something():
    _reset_registry()  # Must remember this
    result = Registry.lookup("key")
    assert result is None
```
**Recommendation:** Use an `autouse` fixture to guarantee cleanup:
```python
@pytest.fixture(autouse=True)
def reset_registry():
    Registry.clear()
    yield
    Registry.clear()  # Also cleans up after the test
```

### Fixture Scope Mismatches
**Description:** Fixtures use a broader scope than needed (e.g., `scope="session"` for a fixture that modifies state per test), causing state to leak between tests.
**Severity:** Medium
**Example:**
```python
@pytest.fixture(scope="session")
def database():
    db = create_database()
    yield db
    db.cleanup()  # Only runs once — test_a's data is visible to test_b
```
**Recommendation:** Use the narrowest scope that works. If tests modify the fixture's state, use `scope="function"` (the default) to get a fresh instance per test.

### Tests That Rely on Execution Order Within a File
**Description:** Tests within a class or module assume they run top-to-bottom. While pytest runs tests in discovery order by default, this is not guaranteed — parallel runners, randomization flags, and collection changes can reorder them.
**Severity:** Medium
**Example:**
```python
class TestWorkflow:
    def test_step_1(self):
        self.data = setup()

    def test_step_2(self):
        process(self.data)  # Depends on test_step_1 having run
```
**Recommendation:** Use `setUp`/`beforeEach` for per-test setup. If the sequence matters, test it as one method.

## Minor Issues

### Missing Cleanup After Test
**Description:** Test creates resources (files, database entries, processes) but doesn't clean them up. While this doesn't directly cause test failure, it can cause failures in subsequent runs or parallel processes.
**Severity:** Minor
**Example:**
```python
def test_file_creation():
    with open("/tmp/test_output.txt", "w") as f:
        f.write("test")
    assert os.path.exists("/tmp/test_output.txt")
    # No cleanup — file persists
```
**Recommendation:** Use `yield` fixtures or `addCleanup`/`afterEach` for teardown. Use `tmp_path` for temporary files.

### Test Order Assuming Alphabetical Discovery
**Description:** Test names are numbered or ordered assuming alphabetical discovery (`test_a_first`, `test_b_second`).
**Severity:** Minor
**Example:**
```python
def test_a_create():
    create_record()

def test_b_update():
    update_record()  # Name-based ordering is fragile
```
**Recommendation:** Don't encode execution order in test names. Each test should be independently runnable.

## Good Patterns

### Fixture-Based Fresh State
```python
@pytest.fixture
def user():
    return create_test_user()

def test_update_username(user):
    user.username = "new_name"
    assert user.username == "new_name"

def test_delete_user(user):
    # Fresh user — unaffected by test_update_username
    delete_user(user.id)
    assert not user_exists(user.id)
```

### Autouse for Global Cleanup
```python
@pytest.fixture(autouse=True)
def reset_global_state():
    GlobalRegistry.clear()
    yield
    GlobalRegistry.clear()
```

### Self-Contained Tests
```python
def test_create_and_verify():
    user = create_user("test")
    assert user.username == "test"
    # Complete within one test — no dependencies

def test_delete_and_verify():
    user = create_user("test")  # Own setup
    delete_user(user.id)
    assert not user_exists(user.id)
    # Complete within one test — no dependencies
```

## Audit Checklist

For each test, check:
- [ ] No shared mutable module-level or global state
- [ ] No dependencies on other tests' side effects
- [ ] No reliance on execution order (within file or across files)
- [ ] Global state reset is guaranteed (autouse fixture, not manual helper calls)
- [ ] Fixtures use the narrowest appropriate scope
- [ ] Each test sets up its own world or uses fresh fixtures
- [ ] Resources created in tests are cleaned up

## Cross-Reference

- `flakiness.md` — order-dependent tests as a flakiness source
- `fixtures.md` — fixture quality (cleanup, scope, parameterization)
- `../frameworks/pytest.md` — pytest-specific isolation idioms and `autouse`
- `../frameworks/bun.md` — Bun-specific isolation idioms
