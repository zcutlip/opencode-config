import type { Plugin } from "@opencode-ai/plugin"

export const AgentRulesReminder: Plugin = async () => {
  let currentAgent = ""

  return {
    // Capture agent name from chat params (fires before tools)
    "chat.params": async (input, _output) => {
      currentAgent = input.agent
    },

    // Inject reminder into every tool result the model sees
    "tool.execute.after": async (_input, output) => {
      const agent = currentAgent || "this"
      output.title = `[${agent}] ${output.title || ""}`
      output.output = `\n**CRITICAL**: You are \`${agent}\`. Before tool use, be sure to follow your agent-specific prompt.\nIf you have \'${agent}.md\' in your system context, consult it before tool use.\n${output.output}`
    },
  }
}
