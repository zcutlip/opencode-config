import { Plugin } from "@opencode/plugin/tui"
import { relative } from "node:path"
import { ProjectConfigRpc } from "./rpc.ts"

// Toast surface for `/init-config`. The command runs on the server with no
// model turn, so nothing in the transcript confirms it worked; this part
// turns the emitted result into a toast that also names the file involved.

function directoryOf(value: any): string | undefined {
  return typeof value === "string" ? value : value?.directory
}

function label(project: string, path: string): string {
  try {
    return relative(project, path) || path
  } catch {
    return path
  }
}

function toastFor(data: { directory: string; status: string; path: string; detail: string }) {
  if (data.status === "created") {
    return {
      title: "Project config created",
      message: `${label(data.directory, data.path)} written.`,
      variant: "success" as const,
    }
  }
  if (data.status === "exists") {
    return {
      title: "Project config skipped",
      message: `${label(data.directory, data.detail)} already exists — nothing written.`,
      variant: "info" as const,
    }
  }
  return {
    title: "Project config failed",
    message: `${label(data.directory, data.path)}: ${data.detail}`,
    variant: "error" as const,
  }
}

export default Plugin.define({
  id: "local.project-config.tui",
  setup(context) {
    const rpc = context.client.rpc(ProjectConfigRpc)
    const own = directoryOf(context.location ?? context.data.location.default())
    const stop = rpc.events.on("configInit", (event: any) => {
      const data = event?.data
      if (typeof data?.status !== "string") return
      // Only the window for the project that changed shows the toast.
      if (own !== undefined && directoryOf(event.location) !== own) return
      context.ui.toast.show({ ...toastFor(data), duration: 8000 })
    })
    return () => stop()
  },
})
