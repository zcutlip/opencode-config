# Exception Handling Quality Checklist

> _Examples below are illustrative and shown in Python/pytest. The patterns are language-agnostic — apply each concept in the project's language, using `../frameworks/*.md` for language-specific idioms._

## Critical Issues

### Bare `except:` Clause
**Description:** Catches all exceptions without any filtering
**Severity:** Critical
**Example:**
```python
def test_something():
    try:
        result = risky_operation()
    except:
        pass  # BAD: swallows ALL exceptions
```
**Recommendation:** Use specific exception types or pytest.raises

### `except Exception:` Without Verification
**Description:** Catches broad Exception class without validating
**Severity:** Critical
**Example:**
```python
def test_something():
    try:
        result = risky_operation()
    except Exception:
        pass  # BAD: swallows without verification
```
**Recommendation:** Use pytest.raises context manager with verification

### Catching SystemExit Without Checking Exit Code
**Description:** Catches SystemExit (often from argparse) without verifying exit code
**Severity:** Critical
**Example:**
```python
def test_cli_version():
    try:
        main(["--version"])
    except SystemExit:
        pass  # BAD: doesn't verify it was the expected exit
```
**Recommendation:** Use pytest.raises and verify exit code

## Medium Issues

### Try/Except Without pytest.raises/assertRaises
**Description:** Manual exception handling instead of framework tools
**Severity:** Medium
**Example:**
```python
def test_raises_exception():
    try:
        raise ValueError("test")
    except ValueError:
        pass  # Should use pytest.raises
```
**Recommendation:** Use pytest.raises context manager

### Exception Caught But Not Re-raised or Verified
**Description:** Exception is caught but not validated or re-raised
**Severity:** Medium
**Example:**
```python
def test_something():
    try:
        result = risky_operation()
    except ValueError as e:
        result = default_value  # Exception caught but not verified
    assert result is not None
```
**Recommendation:** Verify exception was expected or use pytest.raises

## Minor Issues

### Overly Broad Exception Catching
**Description:** Catches multiple exception types that should be tested separately
**Severity:** Minor
**Example:**
```python
def test_something():
    try:
        result = risky_operation()
    except (ValueError, TypeError, KeyError, AttributeError):
        pass  # Too broad - hard to test properly
```
**Recommendation:** Test each exception type separately

### No Error Message Verification
**Description:** Exception is caught but message is not verified
**Severity:** Minor
**Example:**
```python
def test_raises_exception():
    with pytest.raises(ValueError):
        raise ValueError("test message")  # Message not verified
```
**Recommendation:** Verify exception message contains expected text

## Good Patterns

### Using pytest.raises with Verification
```python
def test_raises_exception():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test message")
    assert str(exc_info.value) == "test message"
```

### Using pytest.raises with Message Check
```python
def test_raises_exception_with_message():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test message")
    assert "test message" in str(exc_info.value)
```

### Testing No Exception Raised
```python
def test_no_exception():
    # This test will fail if an exception is raised
    result = function_that_should_not_raise()
    assert result is not None
```

### Testing Multiple Exception Types
```python
def test_raises_specific_exception():
    with pytest.raises(ValueError):
        raise ValueError("test")

def test_raises_another_exception():
    with pytest.raises(TypeError):
        raise TypeError("test")
```

## Framework-Specific Patterns

### pytest (Python)
```python
# Good: Using pytest.raises
def test_raises_exception():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test")
    assert str(exc_info.value) == "test"

# Good: Using pytest.raises with match
def test_raises_exception_with_match():
    with pytest.raises(ValueError, match="test message"):
        raise ValueError("test message")

# Good: Testing no exception
def test_no_exception():
    result = function_that_should_not_raise()
    assert result is not None
```

### unittest (Python)
```python
# Good: Using assertRaises
def test_raises_exception(self):
    with self.assertRaises(ValueError) as cm:
        raise ValueError("test")
    self.assertEqual(str(cm.exception), "test")

# Good: Using assertRaisesRegex
def test_raises_exception_with_message(self):
    with self.assertRaisesRegex(ValueError, "test message"):
        raise ValueError("test message")
```

### Jest (JavaScript)
```javascript
// Good: Using toThrow
test("raises exception", () => {
  expect(() => riskyOperation()).toThrow();
});

// Good: Using toThrow with message
test("raises exception with message", () => {
  expect(() => riskyOperation()).toThrow("test message");
});
```

## Audit Checklist

For each test with exception handling, check:
- [ ] No bare `except:` clauses
- [ ] No `except Exception:` without verification
- [ ] SystemExit exceptions verify exit code
- [ ] Uses pytest.raises/assertRaises instead of manual try/except
- [ ] Exception messages are verified when relevant
- [ ] Exception types are specific, not overly broad
- [ ] Each exception type is tested separately
- [ ] Tests that should not raise exceptions don't catch them
