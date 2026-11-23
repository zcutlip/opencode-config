import { Plugin } from "@opencode/plugin"
import { describeResult, initProjectConfig } from "./init.ts"
import { ProjectConfigRpc } from "./rpc.ts"

export default Plugin.define({
  id: "local.project-config",
  async setup(ctx) {
    const rpc = await ctx.rpc.register(ProjectConfigRpc, {})

    /** The session's project, not the server's cwd. */
    const projectDirectory = async (sessionID: string): Promise<string> => {
      const session = await ctx.session.get({ sessionID })
      return session.location?.directory ?? ctx.location.directory
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "project",
        description: "Project-local OpenCode configuration",
      })
      editor.add({
        name: "config_init",
        description:
          "Create a stub .opencode/opencode.jsonc in the current project. Create-only: when the project already has an OpenCode config file (opencode.json(c) or .opencode/opencode.json(c)) nothing is written and the existing file is reported. Config files in parent directories are reported as information.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async (_input: unknown, context: any) => {
          const directory = await projectDirectory(context.sessionID)
          return { content: describeResult(initProjectConfig(directory)) }
        },
      })
    })

    // Registered here rather than as a command file: the write runs directly,
    // with no discovery/template step. The report goes back as a synthetic
    // message — appended to the transcript without starting a model turn —
    // and the TUI part turns configInit into a toast, since nothing else in
    // the transcript confirms that the command ran.
    await ctx.command.transform((editor) => {
      editor.add({
        name: "init-config",
        description: "Create a stub .opencode/opencode.jsonc in the current project",
        execute: async ({ sessionID }: any) => {
          const directory = await projectDirectory(sessionID)
          const result = initProjectConfig(directory)
          await ctx.session.synthetic({
            sessionID,
            text: describeResult(result),
            metadata: { projectConfig: true },
          })
          await rpc.events
            .emit("configInit", {
              sessionID,
              directory,
              status: result.status,
              path: result.path,
              detail: result.status === "exists" ? result.existing : result.status === "failed" ? result.error : "",
            })
            .catch(() => {})
        },
      })
    })
  },
})
