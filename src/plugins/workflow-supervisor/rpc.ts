import { Rpc } from "@opencode/plugin/rpc"

export const WorkflowSupervisorRpc = Rpc.define({
  id: "workflow-supervisor",
  methods: {
    supervisionBadge: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          active: { type: "boolean" },
          mode: { type: "string" },
          hasUnresolved: { type: "boolean" },
          attempts: { type: "number" },
          limit: { type: "number" },
          episodeMode: { type: "string", enum: ["collab", "delegate"] },
          reviewing: { type: "boolean" },
          findingsWaiting: { type: "boolean" },
        },
        required: ["sessionID", "active", "hasUnresolved", "attempts", "limit", "episodeMode", "reviewing", "findingsWaiting"],
        additionalProperties: false,
      },
    },
    supervisionState: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          active: { type: "boolean" },
          mode: { type: "string" },
          contractPath: { type: "string" },
          hasUnresolved: { type: "boolean" },
          attempts: { type: "number" },
          limit: { type: "number" },
          reassertion: { type: ["string", "null"] },
          reviewing: { type: "boolean" },
          findingsWaiting: { type: "boolean" },
          latestReport: {
            type: ["object", "null"],
            properties: {
              path: { type: "string" },
              text: { type: "string" },
              truncated: { type: "boolean" },
            },
            required: ["path", "text", "truncated"],
            additionalProperties: false,
          },
          steering: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sessionID: { type: "string" },
                checkpointID: { type: "string" },
                text: { type: "string" },
                attempts: { type: "number" },
                time: { type: "number" },
              },
              required: ["sessionID", "checkpointID", "text", "attempts", "time"],
              additionalProperties: false,
            },
          },
          checkpoints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { type: "string" },
                verdict: { type: ["string", "null"] },
                trigger: { type: ["string", "null"] },
                requestedMode: { type: ["string", "null"] },
                effectiveMode: { type: ["string", "null"] },
                time: { type: ["number", "null"] },
              },
              required: ["id", "status", "verdict", "trigger", "requestedMode", "effectiveMode", "time"],
              additionalProperties: false,
            },
          },
        },
        required: ["active"],
        additionalProperties: false,
      },
    },
    supervisionEpisode: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          mode: { type: "string", enum: ["collab", "delegate"] },
        },
        required: ["sessionID", "mode"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          mode: { type: "string", enum: ["collab", "delegate"] },
        },
        required: ["sessionID", "mode"],
        additionalProperties: false,
      },
    },
    supervisionCheckpoint: {
      input: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
        },
        required: ["sessionID"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          accepted: { type: "boolean" },
        },
        required: ["sessionID", "accepted"],
        additionalProperties: false,
      },
    },
  },
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
    stateUpdated: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          active: { type: "boolean" },
          mode: { type: "string" },
          hasUnresolved: { type: "boolean" },
          attempts: { type: "number" },
          limit: { type: "number" },
          episodeMode: { type: "string", enum: ["collab", "delegate"] },
          reviewing: { type: "boolean" },
          findingsWaiting: { type: "boolean" },
        },
        required: ["sessionID", "active", "hasUnresolved", "attempts", "limit", "episodeMode", "reviewing", "findingsWaiting"],
        additionalProperties: false,
      },
    },
    escalationRaised: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          checkpointID: { type: "string" },
          attempts: { type: "number" },
        },
        required: ["sessionID", "checkpointID", "attempts"],
        additionalProperties: false,
      },
    },
  },
})
