import { describe, expect, test } from "bun:test"

// A9 — work-settle tracking. The wiring in index.ts defers an automatic
// checkpoint while the observed session has in-flight helper sessions and
// runs it when the last helper settles; these tests pin the pure state.

describe("A9 — work-settle tracking", () => {
  test("a parent with an in-flight helper is deferred", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    expect(settle.hasInFlight("ses_parent")).toBe(false)
    settle.trackChild("ses_parent", "ses_child")
    expect(settle.hasInFlight("ses_parent")).toBe(true)
  })

  test("settling the last helper returns the parent", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    settle.trackChild("ses_parent", "ses_child_a")
    settle.trackChild("ses_parent", "ses_child_b")
    expect(settle.childSettled("ses_child_a")).toBeUndefined()
    expect(settle.childSettled("ses_child_b")).toBe("ses_parent")
    expect(settle.hasInFlight("ses_parent")).toBe(false)
  })

  test("unknown helpers are a no-op", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    expect(settle.childSettled("ses_unknown")).toBeUndefined()
    expect(settle.hasInFlight("ses_parent")).toBe(false)
  })

  test("clear drops all tracking for a parent", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    settle.trackChild("ses_parent", "ses_child")
    settle.clear("ses_parent")
    expect(settle.hasInFlight("ses_parent")).toBe(false)
    expect(settle.childSettled("ses_child")).toBeUndefined()
  })

  test("a re-tracked helper re-arms the parent", async () => {
    const { WorkSettle } = await import("./settle.ts")
    const settle = new WorkSettle()
    settle.trackChild("ses_parent", "ses_child")
    settle.childSettled("ses_child")
    expect(settle.hasInFlight("ses_parent")).toBe(false)
    settle.trackChild("ses_parent", "ses_child")
    expect(settle.hasInFlight("ses_parent")).toBe(true)
  })
})
