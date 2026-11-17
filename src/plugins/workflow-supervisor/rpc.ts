import { Rpc } from "@opencode/plugin/rpc"

export const WorkflowSupervisorRpc = Rpc.define({
  id: "workflow-supervisor",
  methods: {},
  events: {
    configurationError: {
      schema: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          fingerprint: { type: "string" },
        },
        required: ["code", "message", "fingerprint"],
        additionalProperties: false,
      },
    },
  },
})
