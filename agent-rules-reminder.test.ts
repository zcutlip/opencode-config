/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "bun:test"
import { AgentRulesReminder } from "./plugins/agent-rules-reminder.ts"

const factoryArgs = {
  client: {} as any,
  project: { id: "test" } as any,
  directory: process.cwd(),
  worktree: process.cwd(),
  serverUrl: new URL("http://localhost:0"),
  $: {} as any,
  experimental_workspace: {
    register: function (): void {
      // no-op
    }
  }
}

describe("AgentRulesReminder", () => {
  it("captures agent name from chat.params", async () => {
    const hooks = await AgentRulesReminder(factoryArgs)
    expect(hooks["chat.params"]).toBeDefined()
    expect(hooks["tool.execute.after"]).toBeDefined()

    await hooks["chat.params"]!(
      {
        sessionID: "ses_test",
        agent: "coder",
        model: {} as any,
        provider: { source: "env" as const, info: {} as any, options: {} },
        message: {} as any,
      },
      {} as any
    )
  })

  it("injects reminder into tool output with agent name", async () => {
    const hooks = await AgentRulesReminder(factoryArgs)
    await hooks["chat.params"]!(
      {
        sessionID: "ses_test",
        agent: "coder",
        model: {} as any,
        provider: { source: "env" as const, info: {} as any, options: {} },
        message: {} as any,
      },
      {} as any
    )

    const output: any = { title: "", output: "ls result here" }
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "ses_test", callID: "call_test", args: {} },
      output
    )

    expect(output.output).toContain("Before tool use, be sure to follow")
    expect(output.output).toContain("coder")
    expect(output.title).toContain("[coder]")
  })

  it("falls back to 'this' when agent is unknown", async () => {
    const hooks = await AgentRulesReminder(factoryArgs)

    const output: any = { title: "", output: "test result" }
    await hooks["tool.execute.after"]!(
      { tool: "bash", sessionID: "ses_test", callID: "call_test", args: {} },
      output
    )

    expect(output.output).toContain("`this`")
  })
})
