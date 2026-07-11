# Bun Test Framework Methodology

> This file covers Bun-specific **idioms and syntax**. The *what to look for* (assertion quality, exception handling, fixture quality, coverage) lives in `../checklists/` — apply those checklists using the patterns below.

## Overview

Bun's built-in test runner (`bun:test`) provides a Jest-compatible testing API with native TypeScript support. It's fast, requires zero configuration for most projects, and includes built-in mocking, snapshot testing, and lifecycle hooks.

**Bun's test API is Jest-compatible.** Most patterns in this document also apply to **Jest** and **Vitest** — `test`/`it`/`describe`/`expect`, the matchers (`toBe`, `toEqual`, `toThrow`, …), and the lifecycle hooks (`beforeAll`/`afterAll`/`beforeEach`/`afterEach`) are the same. Note framework-specific differences where relevant (e.g. Bun's `Bun.spawn` subprocess API, `import.meta.dir`).

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

> For what makes these assertions *good* vs *weak* vs *vacuous*, see `../checklists/assertions.md` (includes the context-aware decision tree for nondeterministic code).

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

### JSON Parsing Error Handling

When a script is expected to emit *invalid* JSON (e.g. on an error path), assert that parsing *does* throw — and verify the error path itself (exit code / stderr):

```typescript
test("emits invalid JSON on error path", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath, "--invalid"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  expect(exitCode).toBe(1);                       // error path taken
  expect(stderr).toContain("error");              // error reported
  expect(() => JSON.parse(stdout)).toThrow();     // stdout is not valid JSON
});
```

Conversely, when a script is expected to emit *valid* JSON, assert that parsing does not throw and then validate the parsed structure (see the example above).

### Path Resolution with import.meta

```typescript
import { join } from "node:path";

// Get directory of current test file
const testDir = import.meta.dir;

// Resolve relative paths
const scriptPath = join(testDir, "..", "scripts", "example.ts");
const fixturePath = join(testDir, "fixtures", "example.json");
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

## Cross-Reference

- `../checklists/assertions.md` — assertion quality, context-aware decision tree, vacuous-loop and mock-tautology patterns
- `../checklists/exceptions.md` — exception handling (the `toThrow` patterns above, evaluated for quality)
- `../checklists/fixtures.md` — fixture quality (cleanup, duplication, parameterization)
- `typescript.md` — TypeScript-specific: interface validation, type assertions, JSON parsing, async patterns

Always check `typescript.md` before finalizing a TypeScript/Bun audit report.
