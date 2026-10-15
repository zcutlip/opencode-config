# Node.js Built-in Test Runner Methodology

> This file covers the Node.js built-in test runner (`node:test`) **idioms and syntax**. The *what to look for* (assertion quality, exception handling, fixture quality, coverage) lives in `../checklists/` — apply those checklists using the patterns below.

## Overview

Node.js includes a built-in test runner (`node:test`) with assertion support via `node:assert/strict`. It requires zero external dependencies and is the natural choice for projects that avoid dev-dependencies.

**Not Jest-compatible by default.** Unlike Bun, Jest, and Vitest, `node:test` does not provide `expect()` matchers. Assertions use `node:assert/strict` functions (`strictEqual`, `deepStrictEqual`, `throws`, etc.). Do not apply Bun/Jest assertion idioms to node:test projects.

## Test Discovery

### File Patterns
- `*.test.js` - Primary pattern
- `*.test.ts` - TypeScript tests (requires `tsx`, `ts-node`, or Node 22+ `--experimental-strip-types`)
- `test/*.js` - Tests in test/ directory
- `test/**/*.js` - Tests in test/ subdirectories

### Running Tests
```bash
# Default: discovers and runs all test files
node --test

# Specific files
node --test test/auth.test.js

# With coverage (Node 20+)
node --test --experimental-test-coverage
```

### Configuration
- `package.json` scripts: `"test": "node --test"`
- No separate config file required
- Discovery controlled by `--test` flag and glob patterns

### Auto-Detection
- `node:test` import in test files
- `"node --test"` in package.json scripts
- Absence of Jest/Vitest/Bun config

## Assertion Patterns

### Standard Assertions (`node:assert/strict`)
```javascript
import assert from "node:assert/strict";
import { test } from "node:test";

test("equality", () => {
  assert.strictEqual(1 + 1, 2);                    // Primitive equality (===)
  assert.deepStrictEqual({ a: 1 }, { a: 1 });      // Deep equality
});

test("inequality", () => {
  assert.notStrictEqual(1, 2);
  assert.notDeepStrictEqual({ a: 1 }, { a: 2 });
});

test("truthiness", () => {
  assert.ok(true);           // Truthy
  assert.ok("non-empty");    // Truthy
});
```

### Comparison Assertions
```javascript
test("numbers", () => {
  // No built-in greaterThan/lessThan — use ok() with expressions
  assert.ok(5 > 3, "5 should be greater than 3");
  assert.ok(0.1 + 0.2 - 0.3 < Number.EPSILON, "floating point comparison");
});
```

### String and Collection Assertions
```javascript
test("strings", () => {
  assert.match("hello world", /world/, "should contain 'world'");
  assert.doesNotMatch("hello", /world/);
});

test("arrays", () => {
  assert.ok(Array.isArray([1, 2, 3]));
  assert.strictEqual([1, 2, 3].length, 3);
});
```

### Error Assertions
```javascript
test("throws", () => {
  assert.throws(() => {
    throw new Error("test message");
  }, Error);

  assert.throws(() => {
    throw new Error("test message");
  }, /test message/);  // Regex match on message
});

test("async rejects", async () => {
  await assert.rejects(
    async () => await failingOperation(),
    Error
  );
});

test("does not throw", () => {
  assert.doesNotThrow(() => {
    safeOperation();
  });
});
```

> For what makes these assertions *good* vs *weak* vs *vacuous*, see `../checklists/assertions.md` (includes the context-aware decision tree for nondeterministic code).

## Lifecycle Hooks

```javascript
import { describe, test, before, after, beforeEach, afterEach } from "node:test";

describe("example", () => {
  before(() => {
    // Runs once before all tests in this describe
  });

  after(() => {
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

## Built-in Mocking

```javascript
import { mock, test } from "node:test";
import assert from "node:assert/strict";

test("with mock", (t) => {
  const fn = t.mock.fn();
  fn();
  fn();
  assert.strictEqual(fn.mock.callCount(), 2);
});

test("mock with implementation", (t) => {
  const fn = t.mock.fn((x) => x * 2);
  assert.strictEqual(fn(3), 6);
  assert.strictEqual(fn.mock.calls[0].arguments[0], 3);
});

test("mock date", (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  // Date.now() returns controlled value
});
```

## Skipping and Todo

```javascript
test("skipped test", { skip: "Reason for skipping" }, () => {
  // Not run
});

test("todo test", { todo: "Not yet implemented" }, () => {
  // Not run
});

// Skip without reason — flag this (see ../checklists/assertions.md on skipped tests without reason)
test("bad skip", { skip: true }, () => {});
```

## Subprocess Testing

```javascript
import { spawn } from "node:child_process";
import { join } from "node:path";
import assert from "node:assert/strict";

test("script output", async () => {
  const scriptPath = join(import.meta.dirname, "..", "scripts", "example.js");
  const child = spawn("node", [scriptPath, "--arg", "value"]);

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });

  const exitCode = await new Promise((resolve) => {
    child.on("close", resolve);
  });

  assert.strictEqual(exitCode, 0);
  assert.match(stdout, /expected output/);
});
```

## Temp Directory Management

```javascript
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("file operations", () => {
  let tempDir;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "test-"));
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates file", async () => {
    const filePath = join(tempDir, "test.txt");
    await writeFile(filePath, "content");
    // Test assertions...
  });
});
```

## Key Differences from Jest/Bun/Vitest

| Feature | node:test | Jest/Bun/Vitest |
|---------|-----------|-----------------|
| Assertions | `node:assert/strict` | `expect()` matchers |
| Equality | `strictEqual` / `deepStrictEqual` | `toBe` / `toEqual` |
| Throws | `assert.throws(fn, Error)` | `expect(fn).toThrow()` |
| Mocks | `t.mock.fn()` (per-test) | `jest.fn()` / `mock()` (global) |
| Skip/todo | `{ skip: "reason" }` option | `.skip()` / `.todo()` chain |
| Snapshot | Not built-in | Built-in |
| Coverage | `--experimental-test-coverage` | Built-in or via plugin |

**Important for auditors:** An `assert.strictEqual` call is a strong, specific assertion — equivalent to `expect(x).toBe(y)`. Don't downgrade its quality assessment because it doesn't use the expect-matcher style.

## Cross-Reference

- `../checklists/assertions.md` — assertion quality, context-aware decision tree, vacuous-loop and mock-tautology patterns
- `../checklists/exceptions.md` — exception handling quality
- `../checklists/fixtures.md` — fixture quality (cleanup, duplication, parameterization)
- `../checklists/flakiness.md` — flaky test patterns
- `../checklists/isolation.md` — test isolation patterns
- `typescript.md` — TypeScript-specific: interface validation, type assertions, JSON parsing, async patterns

Always check `typescript.md` before finalizing a TypeScript/node:test audit report.
