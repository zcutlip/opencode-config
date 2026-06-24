# TypeScript-Specific Test Audit Considerations

## Overview

TypeScript adds static typing to JavaScript, which affects how tests are written and audited. Tests in TypeScript often include type assertions, interface validation, and type-safe JSON handling. This document covers TypeScript-specific patterns and considerations for test audits.

## Interface/Type Testing

### The Problem

TypeScript interfaces and types are erased at runtime, but tests often need to verify that data structures conform to expected types. This creates unique testing patterns.

### Interface Validation Patterns

**Pattern 1: Structural Validation**
```typescript
interface UserOutput {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

test("user output has required fields", async () => {
  const result: UserOutput = await fetchUser(1);

  // Validate structure matches interface
  expect(result.id).toBeDefined();
  expect(typeof result.id).toBe("number");
  expect(result.name).toBeDefined();
  expect(typeof result.name).toBe("string");
  expect(result.email).toBeDefined();
  expect(typeof result.email).toBe("string");
});
```

**Pattern 2: Array of Interface Validation**
```typescript
interface Item {
  name: string;
  value: number;
}

test("items array matches interface", async () => {
  const result = await fetchItems();

  expect(Array.isArray(result)).toBe(true);
  expect(result.length).toBeGreaterThan(0);

  // Validate each item has required fields
  for (const item of result) {
    expect(item.name).toBeDefined();
    expect(typeof item.name).toBe("string");
    expect(item.value).toBeDefined();
    expect(typeof item.value).toBe("number");
  }
});
```

**Pattern 3: Nested Interface Validation**
```typescript
interface Config {
  database: {
    host: string;
    port: number;
  };
  features: string[];
}

test("config has nested structure", async () => {
  const config: Config = await loadConfig();

  expect(config.database).toBeDefined();
  expect(config.database.host).toBeDefined();
  expect(typeof config.database.host).toBe("string");
  expect(config.database.port).toBeDefined();
  expect(typeof config.database.port).toBe("number");
  expect(Array.isArray(config.features)).toBe(true);
});
```

### Weak vs. Strong Interface Testing

**Weak (only checks existence):**
```typescript
test("weak interface check", async () => {
  const result = await fetchData();
  expect(result.id).toBeDefined(); // Doesn't check type or value
  expect(result.name).toBeDefined();
});
```

**Strong (validates type and value):**
```typescript
test("strong interface check", async () => {
  const result = await fetchData();
  expect(result.id).toBeDefined();
  expect(typeof result.id).toBe("number");
  expect(result.id).toBeGreaterThan(0);
  expect(result.name).toBeDefined();
  expect(typeof result.name).toBe("string");
  expect(result.name.length).toBeGreaterThan(0);
});
```

## Type Assertions in Tests

### When `as` is Appropriate

Type assertions (`as`) are sometimes necessary in tests when dealing with:
- JSON parsing (unknown type to known type)
- Mock data construction
- Testing edge cases

**Appropriate use:**
```typescript
test("parses JSON output", async () => {
  const stdout = await runScript();
  const result = JSON.parse(stdout) as ScriptOutput;

  expect(result.items).toBeInstanceOf(Array);
});
```

**Overuse (avoid):**
```typescript
test("overly asserted", async () => {
  const result = fetchData() as any; // Loses type safety
  expect(result.whatever).toBe("value");
});
```

### Type Guards in Tests

Consider using type guards for runtime validation:

```typescript
function isUserOutput(obj: unknown): obj is UserOutput {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    typeof obj.id === "number" &&
    "name" in obj &&
    typeof obj.name === "string"
  );
}

test("validates with type guard", async () => {
  const result = await fetchUser(1);
  expect(isUserOutput(result)).toBe(true);
});
```

## Import Patterns

### import.meta Properties

TypeScript tests often use `import.meta` for path resolution:

```typescript
import { join } from "node:path";

// Get current file's directory
const testDir = import.meta.dir;

// Resolve relative paths
const scriptPath = join(testDir, "..", "scripts", "example.ts");
const fixturePath = join(testDir, "fixtures", "example.json");
```

**Note:** `import.meta.dir` is the TypeScript/Bun equivalent of `__dirname` in CommonJS.

### Node Built-in Imports

TypeScript tests use Node.js built-ins with `node:` prefix:

```typescript
import { join, dirname, basename } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
```

### Type-Only Imports

TypeScript allows importing types separately:

```typescript
import type { UserOutput, Config } from "./types";
import { fetchUser, loadConfig } from "./api";
```

## JSON Parsing and Validation

### Type-Safe JSON Handling

Tests often parse JSON output and validate against TypeScript interfaces:

```typescript
interface DiscoveryOutput {
  source: string;
  timestamp: string;
  items: Array<{
    name: string;
    description: string;
    category: string;
  }>;
}

test("parses discovery output", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath]);
  const stdout = await new Response(proc.stdout).text();

  // Parse and validate
  const result: DiscoveryOutput = JSON.parse(stdout);

  expect(result.source).toBeDefined();
  expect(result.timestamp).toBeDefined();
  expect(Array.isArray(result.items)).toBe(true);

  // Validate item structure
  if (result.items.length > 0) {
    const firstItem = result.items[0];
    expect(firstItem.name).toBeDefined();
    expect(firstItem.description).toBeDefined();
    expect(firstItem.category).toBeDefined();
  }
});
```

### JSON Parsing Error Handling

Tests should handle JSON parsing errors:

```typescript
test("handles malformed JSON", async () => {
  const proc = Bun.spawn(["bun", "run", scriptPath, "--invalid"]);
  const stdout = await new Response(proc.stdout).text();

  expect(() => JSON.parse(stdout)).not.toThrow();
});
```

## Async Patterns

### Async Test Functions

TypeScript tests commonly use `async/await`:

```typescript
test("async operation", async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});
```

### Promise Rejection Testing

```typescript
test("handles rejection", async () => {
  await expect(fetchInvalidUser()).rejects.toThrow("User not found");
});
```

### Concurrent Operations

```typescript
test("parallel operations", async () => {
  const [user, config] = await Promise.all([
    fetchUser(1),
    loadConfig(),
  ]);

  expect(user).toBeDefined();
  expect(config).toBeDefined();
});
```

## Optional Field Testing

### Testing Optional Properties

TypeScript interfaces often have optional fields. Tests should verify both presence and absence:

```typescript
interface User {
  id: number;
  name: string;
  email?: string; // Optional
}

test("user without email", async () => {
  const user = await fetchUser(1);
  expect(user.id).toBeDefined();
  expect(user.name).toBeDefined();
  // email may or may not be present
});

test("user with email", async () => {
  const user = await fetchUserWithEmail();
  expect(user.email).toBeDefined();
  expect(typeof user.email).toBe("string");
});
```

### Nullish Coalescing in Tests

```typescript
test("handles optional field", async () => {
  const result = await fetchData();
  const value = result.optionalField ?? "default";
  expect(value).toBeDefined();
});
```

## Enum Testing

### Testing Enum Values

```typescript
enum Status {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
}

test("status is valid enum", async () => {
  const result = await fetchStatus();
  expect(Object.values(Status)).toContain(result.status);
});
```

## Generic Type Testing

### Testing Generic Functions

Generic types are erased at runtime, but tests can verify behavior:

```typescript
function wrap<T>(value: T): { value: T } {
  return { value };
}

test("wrap preserves type", () => {
  const result = wrap(42);
  expect(result.value).toBe(42);
  expect(typeof result.value).toBe("number");

  const stringResult = wrap("hello");
  expect(stringResult.value).toBe("hello");
  expect(typeof stringResult.value).toBe("string");
});
```

## Common TypeScript Test Issues

### Issue 1: Type-Only Assertions Without Runtime Checks

```typescript
// BAD: Only TypeScript type check, no runtime validation
test("output type", async () => {
  const result: UserOutput = await fetchUser(1);
  // TypeScript ensures result matches UserOutput at compile time
  // But no runtime assertions!
});

// GOOD: Runtime validation
test("output type", async () => {
  const result: UserOutput = await fetchUser(1);
  expect(result.id).toBeDefined();
  expect(typeof result.id).toBe("number");
  expect(result.name).toBeDefined();
});
```

### Issue 2: Overly Permissive Types

```typescript
// BAD: any type loses safety
test("flexible output", async () => {
  const result: any = await fetchData();
  expect(result.whatever).toBeDefined(); // No type safety
});

// GOOD: Specific type
test("typed output", async () => {
  const result: DataOutput = await fetchData();
  expect(result.specificField).toBeDefined();
});
```

### Issue 3: Missing Null Checks

```typescript
// BAD: Assumes non-null
test("nested access", async () => {
  const result = await fetchData();
  expect(result.nested.field).toBe("value"); // May throw if nested is null
});

// GOOD: Null-safe access
test("nested access", async () => {
  const result = await fetchData();
  expect(result.nested).toBeDefined();
  expect(result.nested?.field).toBe("value");
});
```

### Issue 4: Ignoring Type Errors in Tests

```typescript
// BAD: @ts-ignore hides issues
test("ignoring types", async () => {
  // @ts-ignore
  const result = someUntypedFunction();
  expect(result).toBeDefined();
});

// GOOD: Proper typing
test("properly typed", async () => {
  const result: TypedOutput = typedFunction();
  expect(result.field).toBeDefined();
});
```

## TypeScript Test Quality Checklist

For each TypeScript test, check:

- [ ] Interface fields validated at runtime (not just compile-time)
- [ ] Type assertions (`as`) used appropriately, not to bypass type checking
- [ ] Optional fields handled correctly
- [ ] Null/undefined checks where needed
- [ ] Array types validated (both array-ness and element types)
- [ ] JSON parsing has error handling
- [ ] Async operations properly awaited
- [ ] No `any` types unless absolutely necessary
- [ ] No `@ts-ignore` comments hiding type issues

## Cross-Reference: Framework-Specific Patterns

For test runner-specific patterns (Bun, Jest, Vitest), see:

- `bun.md` — Bun test runner specifics
- `jest.md` — Jest patterns (when created)
- `vitest.md` — Vitest patterns (when created)

Always check the appropriate framework documentation before finalizing a TypeScript test audit.
