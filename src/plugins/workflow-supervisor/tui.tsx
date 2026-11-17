import { Plugin } from "@opencode/plugin/tui"
import { WorkflowSupervisorRpc } from "./rpc.ts"

function directoryOf(value: any): string | undefined {
  return typeof value === "string" ? value : value?.directory
}

export default Plugin.define({
  id: "local.workflow-supervisor.tui",
  setup(context) {
    const rpc = context.client.rpc(WorkflowSupervisorRpc)
    const own = directoryOf(context.location ?? context.data.location.default())
    return rpc.events.on("configurationError", (event: any) => {
      if (own === undefined || directoryOf(event.location) !== own) return
      context.ui.toast.show({
        title: "Workflow supervisor configuration",
        message: event.data.message,
        variant: "error",
      })
    })
  },
})
