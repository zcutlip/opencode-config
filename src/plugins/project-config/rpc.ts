import { Rpc } from "@opencode/plugin/rpc"

/** Server → TUI channel: one event per `/init-config` run, for the toast. */
export const ProjectConfigRpc = Rpc.define({
  id: "project-config",
  methods: {},
  events: {
    configInit: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          directory: { type: "string" },
          status: { type: "string", enum: ["created", "exists", "failed"] },
          path: { type: "string" },
          detail: { type: "string" },
        },
        required: ["sessionID", "directory", "status", "path", "detail"],
        additionalProperties: false,
      },
    },
  },
})
