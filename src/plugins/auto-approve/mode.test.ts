import { describe, expect, test } from "bun:test"
import { effectiveMode, normalizeMode, toggledMode } from "./mode"

describe("effectiveMode", () => {
  test("falls back to the configured default with no overrides", () => {
    expect(
      effectiveMode({ sessionID: "s1", rootID: "s1", overrides: {}, defaultMode: "prompt" }),
    ).toBe("prompt")
    expect(
      effectiveMode({ sessionID: "s1", rootID: "s1", overrides: {}, defaultMode: "autoaccept" }),
    ).toBe("autoaccept")
  })

  test("a root override propagates to child sessions", () => {
    const overrides = { root: "autoaccept" as const }
    expect(
      effectiveMode({ sessionID: "child", rootID: "root", overrides, defaultMode: "prompt" }),
    ).toBe("autoaccept")
  })

  test("a session override wins over its root override", () => {
    const overrides = { root: "autoaccept" as const, child: "prompt" as const }
    expect(
      effectiveMode({ sessionID: "child", rootID: "root", overrides, defaultMode: "prompt" }),
    ).toBe("prompt")
  })

  test("ignores overrides of unrelated sessions", () => {
    const overrides = { other: "autoaccept" as const }
    expect(
      effectiveMode({ sessionID: "s1", rootID: "s1", overrides, defaultMode: "prompt" }),
    ).toBe("prompt")
  })

  test("a root prompt override beats an autoaccept default", () => {
    const overrides = { root: "prompt" as const }
    expect(
      effectiveMode({ sessionID: "child", rootID: "root", overrides, defaultMode: "autoaccept" }),
    ).toBe("prompt")
  })
})

describe("toggledMode", () => {
  test("inverts both directions", () => {
    expect(toggledMode("prompt")).toBe("autoaccept")
    expect(toggledMode("autoaccept")).toBe("prompt")
  })
})

describe("normalizeMode", () => {
  test("accepts both documented values", () => {
    expect(normalizeMode("prompt")).toBe("prompt")
    expect(normalizeMode("autoaccept")).toBe("autoaccept")
  })

  test("anything else falls back to prompt", () => {
    expect(normalizeMode(undefined)).toBe("prompt")
    expect(normalizeMode(null)).toBe("prompt")
    expect(normalizeMode("yolo")).toBe("prompt")
  })
})
