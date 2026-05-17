# Python-Specific Test Audit Considerations

## Nondeterministic Code Testing

### The Problem

Python code that uses `random`, `hashlib` with random seeds, or any nondeterministic source produces unpredictable output. Tests for such code often use "weak" assertions like `isinstance(result, str)` or `len(result) > 0` — not because the test author was lazy, but because stronger assertions are impossible without controlling the randomness.

### Audit Guidance

**Before flagging an assertion as "weak" on nondeterministic code:**

1. Check if the code under test accepts a seed parameter
2. Check if the test sets a seed (e.g., `random.seed(42)`, `--seed hello`)
3. If no seed is used, the recommendation is to **add deterministic test paths**, not to assert more specifically

### Recommended Pattern

```python
# BAD: Testing nondeterministic output without seed
def test_generate_page():
    result = generate()
    assert isinstance(result, str)  # Can't assert more specifically
    assert len(result) > 0          # Same limitation

# GOOD: Seed the generator for deterministic testing
def test_generate_page_deterministic():
    result = generate(seed="test-seed")
    assert result.startswith("# ")
    assert "NAME" in result
    assert len(result) > 100

# GOOD: Verify structure regardless of randomness
def test_generate_page_has_structure():
    result = generate()
    assert isinstance(result, str)
    assert result.count("\n") > 5  # Has multiple lines
    assert result.strip() != ""    # Not empty
```

### When `isinstance()` Is Actually Fine

For nondeterministic code without seeding, these assertions are appropriate:
- `isinstance(result, expected_type)` — Confirms the code didn't crash and returned the right type
- `len(result) > 0` — Confirms output was produced
- `result is not None` — Confirms the function returned something

**The fix is not to assert more specifically. The fix is to seed the generator and then assert specifically.**

## Parameterization Opportunities

### When to Recommend `@pytest.mark.parametrize`

Look for these patterns and recommend parameterization:

1. **Multiple similar test methods** testing the same function with different inputs:
```python
# BEFORE: Separate tests
def test_uppercase_hello():
    assert uppercase("hello") == "HELLO"

def test_uppercase_world():
    assert uppercase("world") == "WORLD"

# AFTER: Parameterized
@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("world", "WORLD"),
])
def test_uppercase(input, expected):
    assert uppercase(input) == expected
```

2. **Edge case gaps** — Tests that only cover happy path:
```python
# BEFORE: Only happy path
def test_uppercase():
    assert uppercase("hello") == "HELLO"

# AFTER: With edge cases
@pytest.mark.parametrize("input,expected", [
    ("hello", "HELLO"),
    ("", ""),                    # Empty string
    ("HELLO", "HELLO"),          # Already uppercase
    ("HeLLo", "HELLO"),          # Mixed case
    ("123", "123"),              # No letters
])
def test_uppercase(input, expected):
    assert uppercase(input) == expected
```

3. **Transform functions** — String transforms (uppercase, lowercase, conjugation, pluralization) are prime candidates:
```python
@pytest.mark.parametrize("input,expected", [
    ("run", "ran"),
    ("merge", "merged"),
    ("check", "checked"),
    ("", ""),                    # Empty
    ("RUN", "RAN"),              # Already uppercase
    ("RuN", "RaN"),              # Mixed case — verify case preservation
])
def test_past_tense(input, expected):
    assert past_tense(input) == expected
```

### Parameterization Audit Checklist

- [ ] Multiple similar test methods that could be combined
- [ ] Transform functions without edge case coverage
- [ ] Tests missing: empty strings, None, already-transformed input, mixed case, Unicode
- [ ] Tests missing: boundary values (0, -1, max int)
- [ ] Tests missing: error cases (invalid types, malformed input)

## Global State and Test Isolation

### The Problem

Python modules can have global state (registries, caches, class-level attributes). Tests that clear global state via helper functions (not fixtures) are fragile:

```python
# PROBLEM: Helper function, not a fixture
def _setup_grammar():
    GrammarRegistry.clear()  # Manual cleanup
    return Grammar()

def test_something():
    g = _setup_grammar()
    # Test code...
```

### Audit Guidance

When you see module-level helpers that clear global state:

1. **Flag it as a medium issue** — Test isolation depends on every test calling the helper
2. **Recommend a conftest.py fixture** with proper scoping:
```python
# conftest.py
@pytest.fixture(autouse=True)
def clear_grammar_registry():
    GrammarRegistry.clear()
    yield
    # Optional: verify cleanup happened
```

3. **Explain the benefit** — `autouse=True` ensures cleanup runs even if a test forgets to call the helper, and pytest guarantees teardown runs even on test failure

### Global State Patterns to Watch For

- `Registry.clear()` or similar singleton reset patterns
- Module-level mutable state (dicts, lists) that tests modify
- Class-level attributes that persist between tests
- `importlib` re-imports to reset module state

## String Transform Testing

### Case Transformation Tests

For `uppercase`, `lowercase`, `titlecase` transforms, test these edge cases:

| Input | Expected (uppercase) | Why |
|-------|---------------------|-----|
| `""` | `""` | Empty string |
| `"hello"` | `"HELLO"` | Normal case |
| `"HELLO"` | `"HELLO"` | Already uppercase |
| `"HeLLo"` | `"HELLO"` | Mixed case |
| `"123"` | `"123"` | No letters |
| `"héllo"` | `"HÉLLO"` | Unicode (if supported) |

### Conjugation Tests

For verb conjugation (past tense, past participle, etc.):

1. **Test case preservation** — Does `past("MERGE")` return `"MERGED"` or `"MERGed"`? Mixed-case output like `"MERGed"` is almost certainly a bug.
2. **Test irregular verbs** — `run → ran`, `write → wrote`, `check → checked`
3. **Test empty input** — Should return `""` or raise an error
4. **Test already-conjugated** — `past("ran")` — what happens?

### Suspicious Patterns

- **Mixed-case output from case-transforming functions** — `past("MERGE") == "MERGed"` suggests the transform doesn't handle uppercase input correctly
- **Expected values that look wrong** — If a test expects `"MERGed"`, this may be documenting a bug rather than intentional behavior. Flag for investigation.

## Snapshot Testing Without External Dependencies

### The Problem

The skill might recommend `pytest-snapshot` for snapshot testing, but many Python projects avoid external dependencies.

### Native Pattern

Projects often implement snapshot testing natively:

```python
def test_output_snapshot():
    result = generate(seed="hello")
    snapshot_path = Path(__file__).parent / "snapshots" / "seed_hello.md"

    if not snapshot_path.exists():
        snapshot_path.write_text(result)
        pytest.fail(f"Snapshot created at {snapshot_path}. Review and re-run.")

    expected = snapshot_path.read_text()
    assert result == expected
```

### Audit Guidance

- **Don't recommend `pytest-snapshot`** unless the project already uses external test dependencies
- **Evaluate the native pattern** — The "create if missing, then fail" pattern is functional but can be confusing. Check if there's a regeneration script.
- **Recommend improvements within constraints** — Suggest a `conftest.py` fixture for snapshot management, or a `--update-snapshots` flag, without adding dependencies.

## CLI Testing Patterns

### argparse Exit Code Testing

CLI functions that use `argparse` call `sys.exit()` on error. Tests must handle this:

```python
# GOOD: Verify exit code
def test_invalid_args():
    with pytest.raises(SystemExit) as exc_info:
        main(["--invalid-flag"])
    assert exc_info.value.code == 2  # argparse uses exit code 2

# BAD: Swallows exit without checking
def test_invalid_args():
    try:
        main(["--invalid-flag"])
    except SystemExit:
        pass  # Doesn't verify exit code
```

### stdout/stderr Testing

```python
# GOOD: Capture and verify output
def test_stdout(capsys):
    main(["--help"])
    captured = capsys.readouterr()
    assert "usage:" in captured.out.lower()

# GOOD: Verify stderr for seed printing
def test_seed_in_stderr(capsys):
    main(["--seed", "hello"])
    captured = capsys.readouterr()
    assert "seed: hello" in captured.err.lower()
```

## conftest.py Patterns

### When to Recommend conftest.py

- Multiple test files share setup/teardown logic
- Module-level helpers clear global state
- Tests create temporary files/directories without cleanup
- Multiple tests use the same fixture data

### Recommended Patterns

```python
# Autouse fixture for global state cleanup
@pytest.fixture(autouse=True)
def reset_global_state():
    yield
    GlobalRegistry.clear()

# Shared test data
@pytest.fixture
def sample_grammar():
    return {
        "verb": ["run", "check", "merge"],
        "noun": ["index", "stash", "branch"],
    }

# Temporary file with cleanup
@pytest.fixture
def temp_output(tmp_path):
    return tmp_path / "output.md"
```

## Type-Only Assertion Assessment

See `../checklists/assertions.md` for the complete context-aware assertion assessment, including the decision tree for when type-only assertions are appropriate vs. weak.
