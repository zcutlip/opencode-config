# Assertions Quality Checklist

## Critical Issues

### Test with NO Assertions
**Description:** Test function has no assert statements or validation
**Severity:** Critical
**Example:**
```python
def test_something():
    result = calculate_something()
    # No assertions - only checks it doesn't crash
```
**Recommendation:** Add assertions to validate expected behavior

### Test Only Checks `is not None`
**Description:** Test only verifies value is not None without further validation
**Severity:** Critical
**Example:**
```python
def test_something():
    result = calculate_something()
    assert result is not None  # Only checks not None
```
**Recommendation:** Add assertions to validate actual value or properties

### Test Only Checks `len() > 0`
**Description:** Test only verifies collection is non-empty without content validation
**Severity:** Critical
**Example:**
```python
def test_something():
    items = get_items()
    assert len(items) > 0  # Only checks length
```
**Recommendation:** Validate actual content of collection

## Medium Issues

### Test Only Checks Default Values
**Description:** Test only checks that value equals default (0, "", [], etc.)
**Severity:** Medium
**Example:**
```python
def test_something():
    result = calculate_something()
    assert result == 0  # Only checks default value
```
**Recommendation:** Validate meaningful non-default values

### Test Only Checks File Existence
**Description:** Test only verifies file exists without checking content
**Severity:** Medium
**Example:**
```python
def test_file_created():
    create_file("test.txt")
    assert os.path.exists("test.txt")  # Only checks existence
```
**Recommendation:** Validate file content or properties

### Test Only Checks Type
**Description:** Test only verifies type without checking value
**Severity:** Medium
**Example:**
```python
def test_something():
    result = calculate_something()
    assert isinstance(result, str)  # Only checks type
```
**Recommendation:** Validate actual value or properties

## Minor Issues

### Weak Assertions with `or` Conditions
**Description:** Test uses `or` conditions that make assertions too permissive
**Severity:** Minor
**Example:**
```python
def test_something():
    result = calculate_something()
    assert result is not None or result == ""  # Too permissive
```
**Recommendation:** Use specific assertions for each expected value

### Assertions That Could Pass on Wrong Output
**Description:** Test assertions are so broad they could pass on incorrect output
**Severity:** Minor
**Example:**
```python
def test_something():
    result = calculate_something()
    assert "test" in str(result).lower()  # Too broad
```
**Recommendation:** Use more specific assertions

### Misleading Test Names
**Description:** Test name doesn't match what is actually being tested
**Severity:** Minor
**Example:**
```python
def test_user_authentication():
    # Actually tests user creation, not authentication
    user = create_user("test")
    assert user.username == "test"
```
**Recommendation:** Rename test to match actual behavior

## Good Patterns

### Multiple Specific Assertions
```python
def test_user_authentication():
    user = authenticate("user", "pass")
    assert user is not None
    assert user.username == "user"
    assert user.is_authenticated is True
    assert user.last_login is not None
```

### Context Manager for Exceptions
```python
def test_raises_exception():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test message")
    assert str(exc_info.value) == "test message"
```

### Collection Content Validation
```python
def test_get_items():
    items = get_items()
    assert len(items) == 3
    assert items[0]["name"] == "item1"
    assert all("id" in item for item in items)
```

## Audit Checklist

For each test, check:
- [ ] Has at least one assertion
- [ ] Assertions validate actual behavior, not just existence
- [ ] Assertions check meaningful values, not just defaults
- [ ] Assertions are specific enough to fail on wrong output
- [ ] Test name matches actual behavior
- [ ] Multiple assertions validate different aspects
- [ ] Exception tests verify exception type and message
- [ ] Collection tests validate content, not just length

## Context-Aware Assertion Assessment

**Not all "weak" assertions are actually weak.** Before flagging an assertion as weak, consider the context.

### When Type-Only Assertions Are Appropriate

| Assertion | Context | Verdict |
|-----------|---------|---------|
| `isinstance(result, str)` | Nondeterministic output, no seed | Appropriate — confirms code didn't crash and returned correct type |
| `len(result) > 0` | Random generator without seed | Appropriate — confirms output was produced |
| `result is not None` | Function that may return None | Appropriate — confirms function returned something |
| `isinstance(result, str)` | Deterministic function with known input | Weak — should assert specific value |
| `len(result) > 0` | Deterministic function with known input | Weak — should assert specific length or content |

### Decision Tree

```
Is the code under test nondeterministic?
├── Yes → Is a seed or fixed input used in the test?
│         ├── Yes → Assert specific values (deterministic output)
│         └── No → Type/length assertions are appropriate
│                  Recommendation: Add seeded test path
└── No → Is the input known and fixed?
         ├── Yes → Assert specific values
         └── No → Structural assertions (contains sections, headers)
```

### Strengthening Assertions

**For nondeterministic code:**
1. Add a seed parameter to make output deterministic
2. Assert specific values for the seeded output
3. Keep the unseeded test for structural validation (type, non-empty)

**For deterministic code:**
1. Assert specific expected values
2. Assert structural properties (sections, format, keywords)
3. Use `pytest.raises` with `match` for error paths

### Common Misclassifications

❌ **Incorrect:** "test_generate only checks `isinstance(result, str)` — weak assertion"
✅ **Correct:** "test_generate uses `isinstance(result, str)` which is appropriate for unseeded random output. Recommendation: add a seeded test path with specific assertions."

❌ **Incorrect:** "test_format only checks `len(output) > 0` — trivial assertion"
✅ **Correct:** "test_format uses `len(output) > 0` which confirms output was produced. For stronger validation, assert structural properties like section headers or keyword presence."
