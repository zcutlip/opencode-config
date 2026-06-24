# Bun Test Framework Methodology

## Overview

Bun's built-in test runner (`bun:test`) provides a Jest-compatible testing API with native TypeScript support. It's fast, requires zero configuration for most projects, and includes built-in mocking, snapshot testing, and lifecycle hooks.

**Note:** Bun's test API is Jest-compatible. Most patterns in this document also apply to Jest and Vitest. Framework-specific differences are noted where relevant.

## Test Discovery

### File Patterns
- `*.test.ts` - Primary pattern for TypeScript tests
- `*.test.js` - JavaScript tests
- `*.spec.ts` - Alternative pattern (less common)
- `test/*.test.ts` - Tests in test/ directory
- `__tests__/*.ts` - Tests in __tests__ directory

### Function Patterns
- `test("name", () => {})` - Standard test function
- `it("name", () => {})` - Alias for `test()`
- `describe("name", () => {})` - Test grouping

### Configuration Files
- `bunfig.toml` - Bun configuration (optional)
- `package.json` - Test script configuration
- No config required for basic usage

## LSP Discovery Strategy

### Find Test Files
```typescript
// Try LSP workspace symbol search
lsp.workspaceSymbol("test_*")
lsp.workspaceSymbol("*test*")

// Fallback: glob pattern
@explore glob "**/*.test.ts"
@explore glob "**/*.test.js"
```

### Get Test Structure
```typescript
// Try LSP document symbol
lsp.documentSymbol("tests/example.test.ts")

// Returns:
// - describe blocks
// - test/it functions
// - Helper functions
// - Interface definitions
```

### Get Test Metadata
```typescript
// Try LSP hover for type information
lsp.hover(file_path, line, character)

// Fallback: read file content
@explore read file_path
```

## Assertion Patterns

### Standard Assertions
```typescript
import { expect, test } from "bun:test";

test("equality", () => {
  expect(1 + 1).toBe(2);
  expect({ a: 1 }).toEqual({ a: 1 });
  expect([1, 2, 3]).toHaveLength(3);
});

test("truthiness", () => {
  expect(true).toBeTruthy();
  expect(false).toBeFalsy();
  expect(null).toBeNull();
  expect(undefined).toBeUndefined();
  expect("hello").toBeDefined();
});

test("numbers", () => {
  expect(5).toBeGreaterThan(3);
  expect(5).toBeGreaterThanOrEqual(5);
  expect(3).toBeLessThan(5);
  expect(3).toBeLessThanOrEqual(3);
  expect(0.1 + 0.2).toBeCloseTo(0.3);
});

test("strings", () => {
  expect("hello world").toContain("world");
  expect("hello world").toMatch(/world/);
  expect("hello world").toHaveLength(11);
});

test("arrays", () => {
  expect([1, 2, 3]).toContain(2);
  expect([1, 2, 3]).toHaveLength(3);
  expect([1, 2, 3]).toEqual([1, 2, 3]);
});

test("objects", () => {
  expect({ a: 1, b: 2 }).toHaveProperty("a");
  expect({ a: 1, b: 2 }).toHaveProperty("a", 1);
  expect({ a: 1 }).toMatchObject({ a: 1 });
});

test("exceptions", () => {
  expect(() => {
    throw new Error("test");
  }).toThrow();

  expect(() => {
    throw new Error("test message");
  }).toThrow("test message");

  expect(() => {
    throw new Error("test");
  }).toThrow(Error);
});
```

### Negation
```typescript
test("negation", () => {
  expect(1).not.toBe(2);
  expect(null).not.toBeUndefined();
  expect([1, 2]).not.toContain(3);
});
```

### Async Assertions
```typescript
test("async/await", async () => {
  const result = await fetchData();
  expect(result).toBe("data");
});

test("resolves", async () => {
  await expect(Promise.resolve("data")).resolves.toBe("data");
});

test("rejects", async () => {
  await expect(Promise.reject(new Error("fail"))).rejects.toThrow("fail");
});
```

## Lifecycle Hooks

### Basic Hooks
```typescript
import { describe, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

describe("example", () => {
  beforeAll(() => {
    // Runs once before all tests in this describe
  });

  afterAll(() => {
    // Runs once after all tests in this describe
  });

  beforeEach(() => {
    // Runs before each test
  });

  afterEach(() => {
    // Runs after each test
  });

  test("example test", () => {
    // Test code
  });
});
```

### Async Hooks
```typescript
describe("async setup", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupDir(tempDir);
  });

  test("uses temp dir", () => {
    expect(tempDir).toBeDefined();
  });
});
```

## Bun-Specific Patterns

### Subprocess Testing with Bun.spawn

Tests often spawn scripts as subprocesses to test CLI behavior:

```typescript
import { test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

test("script output", async () => {
  const scriptPath = join(import.meta.dir, "..", "scripts", "example.ts");

  const proc = Bun.spawn(["bun", "run", scriptPath, "--arg", "value"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(0);
  expect(stdout).toContain("expected output");
});
```

### Temp Directory Management

Common pattern for tests that need temporary directories:

```typescript
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("file operations", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates file", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "content");
    // Test assertions...
  });
});
```

### JSON Output Parsing

Tests often parse JSON output from spawned scripts:

```typescript
interface ScriptOutput {
  source: string;
  timestamp: string;
  items: Array<{ name: string; value: number }>;
}

test("parses JSON output", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath]);
  const stdout = await new Response(proc.stdout).text();

  const result: ScriptOutput = JSON.parse(stdout);

  expect(result.source).toBeDefined();
  expect(result.items).toBeInstanceOf(Array);
  expect(result.items.length).toBeGreaterThan(0);
});
```

### Path Resolution with import.meta

```typescript
import { join } from "node:path";

// Get directory of current test file
const testDir = import.meta.dir;

// Resolve relative paths
const scriptPath = join(testDir, "..", "scripts", "example.ts");
const fixturePath = join(testDir, "fixtures", "example.json");
```

## Common Bun Issues

### Issue 1: Tests with No Assertions
```typescript
// BAD: No assertions
test("something", async () => {
  const result = await runScript();
  // No assertions - only checks it doesn't crash
});

// GOOD: Has assertions
test("something", async () => {
  const result = await runScript();
  expect(result).toBeDefined();
  expect(result.status).toBe("success");
});
```

### Issue 2: Weak Assertions on Subprocess Output
```typescript
// BAD: Only checks exit code
test("script runs", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath]);
  const exitCode = await proc.exited;
  expect(exitCode).toBe(0); // Doesn't verify output
});

// GOOD: Verifies output content
test("script produces expected output", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath]);
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(0);
  expect(stdout).toContain("expected content");
  expect(JSON.parse(stdout)).toHaveProperty("status", "success");
});
```

### Issue 3: Exception Swallowing in Subprocess Tests
```typescript
// BAD: Doesn't check stderr or exit code
test("script handles error", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath, "--invalid"]);
  const stdout = await new Response(proc.stdout).text();
  // Doesn't verify error handling
});

// GOOD: Verifies error behavior
test("script handles error", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath, "--invalid"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(1);
  expect(stderr).toContain("error");
});
```

### Issue 4: Missing Cleanup in Lifecycle Hooks
```typescript
// BAD: No cleanup
describe("file operations", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-"));
    // No cleanup registered
  });

  // Tests create files but never clean up
});

// GOOD: Proper cleanup
describe("file operations", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });
});
```

### Issue 5: Type-Only Assertions Without Value Checks
```typescript
// BAD: Only checks type
test("output structure", async () => {
  const result = await runScript();
  expect(typeof result.value).toBe("number"); // Doesn't check actual value
});

// GOOD: Checks type and value
test("output structure", async () => {
  const result = await runScript();
  expect(typeof result.value).toBe("number");
  expect(result.value).toBeGreaterThan(0);
  expect(result.value).toBeLessThan(100);
});
```

## Bun-Specific Quality Checks

### Check 1: Test Naming
- Tests should use descriptive names
- Test names should describe expected behavior

**Good:**
```typescript
test("finds themes from fixture", () => {});
test("handles missing fixture file gracefully", () => {});
test("extracts both light and dark theme variants", () => {});
```

**Bad:**
```typescript
test("test1", () => {});
test("works", () => {});
test("basic", () => {});
```

### Check 2: Test Isolation
- Tests should not depend on each other
- Each test should clean up after itself
- Use `beforeEach` for per-test setup

**Good:**
```typescript
describe("isolated tests", () => {
  let tempFile: string;

  beforeEach(async () => {
    tempFile = await createTempFile();
  });

  afterEach(async () => {
    await unlink(tempFile);
  });

  test("test 1", async () => {
    // Uses fresh tempFile
  });

  test("test 2", async () => {
    // Uses fresh tempFile, independent of test 1
  });
});
```

**Bad:**
```typescript
let sharedData: any;

test("test 1", () => {
  sharedData = createData();
});

test("test 2", () => {
  // Depends on test 1 running first
  expect(sharedData).toBeDefined();
});
```

### Check 3: Fixture Usage
- Use fixtures for test data
- Test multiple scenarios (happy path, empty, error)
- Don't hardcode test data in test bodies

**Good:**
```typescript
test("finds items from fixture", async () => {
  const result = await runDiscovery("fixtures/happy-path");
  expect(result.items.length).toBeGreaterThan(0);
});

test("handles empty fixture", async () => {
  const result = await runDiscovery("fixtures/empty");
  expect(result.items).toEqual([]);
});
```

**Bad:**
```typescript
test("finds items", async () => {
  // Hardcoded data in test body
  const data = { items: [{ name: "item1" }, { name: "item2" }] };
  expect(data.items.length).toBe(2);
});
```

## Configuration Analysis

### package.json
```json
{
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch"
  }
}
```

### bunfig.toml (Optional)
```toml
[test]
# Test configuration
root = "test"
preload = ["./setup.ts"]
```

## Cross-Reference: TypeScript-Specific Considerations

For TypeScript-specific audit guidance, see `typescript.md` which covers:

- **Interface/type testing** — Validating output matches TypeScript interfaces
- **Type assertions** — When `as` is appropriate in tests
- **Import patterns** — `import.meta.dir`, Node built-ins
- **JSON parsing** — Type-safe JSON handling in tests
- **Async patterns** — Promise handling with TypeScript types

Always check `typescript.md` before finalizing a TypeScript/Bun audit report.
