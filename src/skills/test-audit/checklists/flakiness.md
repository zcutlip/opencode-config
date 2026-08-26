# Flaky Test Pattern Checklist

> _Examples below are illustrative and shown in Python/pytest. The patterns are language-agnostic — apply each concept in the project's language, using `../frameworks/*.md` for language-specific idioms._

> **Primary detection method.** Flaky tests are reliably detected by static pattern analysis, not by a single test run. A single run cannot distinguish a passing flaky test from a genuinely passing test. This checklist is the primary tool; repeated test runs are optional confirmation only.

## Critical Issues

### Order-Dependent Tests
**Description:** Test results depend on execution order — passing in isolation but failing when run with other tests, or vice versa. Caused by shared mutable state that one test modifies and another reads.
**Severity:** Critical
**Example:**
```python
# test_a.py
shared_data = {}

def test_writes_shared():
    shared_data["key"] = "value"

# test_b.py
from test_a import shared_data

def test_reads_shared():
    assert shared_data["key"] == "value"  # Passes only if test_a ran first
```
**Recommendation:** Isolate tests: use fixtures for setup/teardown, never share mutable module-level state. See `isolation.md`.

### Unmocked External Services in Unit Tests
**Description:** Unit tests make real network/HTTP/database calls. These fail nondeterministically when the service is down, slow, or returns unexpected data.
**Severity:** Critical
**Example:**
```python
def test_fetch_user():
    user = requests.get("https://api.example.com/users/1").json()  # Real HTTP call
    assert user["name"] is not None
```
**Recommendation:** Mock or stub external services in unit tests. Reserve real calls for integration tests that are expected to be environment-dependent.

## Medium Issues

### Fixed Delays with `sleep()`
**Description:** Tests use `time.sleep()` / `setTimeout` / `await sleep()` to wait for async operations instead of polling or callbacks. The delay is either too short (flaky on slow CI) or too long (wastes time).
**Severity:** Medium
**Example:**
```python
def test_async_operation():
    start_async_task()
    time.sleep(2)  # May not be enough on slow CI
    assert task_complete()
```
**Recommendation:** Poll for the expected condition with a timeout, or use framework-provided async testing utilities.

### Unfrozen Time Dependencies
**Description:** Tests depend on `datetime.now()` / `Date.now()` / `time.time()` without freezing or injecting a fixed value. Results vary by when the test runs.
**Severity:** Medium
**Example:**
```python
def test_timestamp():
    result = generate_timestamp()
    assert result.startswith("2024")  # Breaks on Jan 1, 2025
```
**Recommendation:** Inject a fixed clock or use `freezegun` (Python) / `vi.useFakeTimers()` (Vitest) / manual time injection.

### Unseeded Randomness
**Description:** Tests exercise code that uses random number generation without seeding. Output is nondeterministic — the test may pass or fail depending on the random state. (Note: this overlaps with `assertions.md` on weak assertions for unseeded output — the difference is this checklist focuses on the *reliability* risk, not the assertion quality.)
**Severity:** Medium
**Example:**
```python
def test_random_generator():
    result = generate_random_text()
    assert isinstance(result, str)  # Passes, but output varies each run
```
**Recommendation:** Seed the generator for deterministic output. See `assertions.md` for context-aware assertion assessment of unseeded vs. seeded tests.

### Environment-Dependent Tests
**Description:** Tests depend on environment variables, timezone, locale, or OS-specific paths without setting them explicitly.
**Severity:** Medium
**Example:**
```python
def test_config_path():
    path = get_config_path()
    assert path == os.path.expanduser("~/.config/app")  # Different on Windows/CI
```
**Recommendation:** Set environment variables explicitly in the test or fixture. Use `tmp_path` for filesystem paths. Document timezone/locale assumptions.

### Machine-State Filesystem Dependencies
**Description:** Tests read or write to hardcoded paths, home directory, or shared temp directories that may conflict with other processes or test runs. (See also `fixtures.md` for fixture-quality checks on hardcoded paths.)
**Severity:** Medium
**Example:**
```python
def test_output_file():
    write_output("/tmp/test_output.txt")  # May conflict with parallel runs
    assert os.path.exists("/tmp/test_output.txt")
```
**Recommendation:** Use `tmp_path` (pytest) or per-test temp directories. See `fixtures.md`.

## Minor Issues

### Overly Generous Timeouts and Retries
**Description:** Tests use long timeouts or retry loops that mask intermittent failures. A test that "eventually passes" after retries is flaky — the retries hide it.
**Severity:** Minor
**Example:**
```python
@pytest.mark.flaky(reruns=5)  # pytest-rerunfailures — masks flakiness
def test_something():
    result = intermittent_operation()
    assert result is not None
```
**Recommendation:** Fix the root cause instead of retrying. If retries are necessary (e.g., integration tests with eventual consistency), document why and set a maximum.

## Good Patterns

### Seeded Randomness
```python
def test_random_generator():
    result = generate_random_text(seed=42)
    assert result == "expected deterministic output"
```

### Injected Time
```python
def test_timestamp(freezer):
    freezer.move_to("2024-06-15")
    result = generate_timestamp()
    assert result.startswith("2024-06-15")
```

### Polling with Timeout
```python
def test_async_operation():
    start_async_task()
    deadline = time.time() + 5
    while time.time() < deadline:
        if task_complete():
            break
        time.sleep(0.1)
    else:
        pytest.fail("Task did not complete within timeout")
    assert task_result() == "expected"
```

### Explicit Environment
```python
@pytest.fixture
def env_vars(monkeypatch):
    monkeypatch.setenv("API_URL", "http://localhost:8080")
    monkeypatch.setenv("TIMEZONE", "UTC")

def test_with_env(env_vars):
    result = fetch_config()
    assert result["timezone"] == "UTC"
```

## Audit Checklist

For each test, check:
- [ ] No shared mutable state between tests (see `isolation.md`)
- [ ] No real network/HTTP calls in unit tests
- [ ] No `sleep()` with fixed delays for synchronization
- [ ] Time dependencies are frozen or injected
- [ ] Random generators are seeded in tests
- [ ] Environment variables are set explicitly
- [ ] Filesystem operations use temp directories
- [ ] Timeouts and retries are justified, not masking flakiness

## Cross-Reference

- `assertions.md` — context-aware assertion assessment for unseeded vs. seeded tests
- `isolation.md` — test isolation patterns (the order-dependence finding above connects here)
- `fixtures.md` — fixture quality checks for hardcoded paths and cleanup
