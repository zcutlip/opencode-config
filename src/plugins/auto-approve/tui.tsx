import { Plugin } from "@opencode/plugin/tui"
import { appendFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { effectiveMode, normalizeMode, toggledMode, type PermissionMode } from "./mode"

// auto-approve — per-session runtime toggle for permission auto-accept.
//
// The built-in "auto accept" lives in cli.json `session.permissions`, so
// switching modes means editing config. This plugin keeps the toggle in
// memory storage (survives plugin reloads, discarded when the TUI exits)
// keyed by root session ID: each tab toggles independently, child sessions
// follow their root (mirroring the built-in autoaccept, which walks session +
// family), and quitting restores the configured starting mode for every tab.
//
// While a session's effective mode is autoaccept, incoming permission.asked
// events are answered `decision: "once"` — exactly what the built-in mode
// does — so no "always" approval is ever saved and configured deny rules stay
// final. Manual mode answers nothing and the host prompt behaves as usual.
//
// The footer badge (prompt.footer.status) shows each tab's effective mode.
//
// The reply surface is not documented for plugins. It is probed at setup
// across the known candidates (TUI data layer first, then generated-client
// namespaces) and every outcome — resolution, approvals, failures — goes to
// the debug sink below. If auto mode stops answering after an OpenCode
// upgrade, read that log before assuming the toggle logic broke.

const DEBUG_LOG = join(homedir(), ".local", "share", "opencode", "auto-approve-debug.log")

function debug(message: string): void {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Debug sink is best-effort.
  }
}

function configFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(configHome, "opencode", "cli.json")
}

/**
 * The configured starting mode. No API serves CLI settings to plugins, so
 * this reads cli.json from disk. OPENCODE_CLI_CONFIG_CONTENT stays
 * authoritative over the file while it is set (docs: inline settings win).
 * Missing or unparseable input falls back to "prompt" — the documented
 * default and the safe direction.
 */
async function readConfiguredMode(): Promise<PermissionMode> {
  let fileValue: unknown
  try {
    const raw = await readFile(configFilePath(), "utf8")
    fileValue = (JSON.parse(raw) as { session?: { permissions?: unknown } })?.session?.permissions
  } catch {
    // Missing or unparseable cli.json → documented default.
  }
  const inline = process.env.OPENCODE_CLI_CONFIG_CONTENT
  if (inline) {
    try {
      const inlineValue = (
        JSON.parse(inline) as { session?: { permissions?: unknown } }
      )?.session?.permissions
      if (inlineValue !== undefined) return normalizeMode(inlineValue)
    } catch {
      // Malformed inline settings → fall through to the file value.
    }
  }
  return normalizeMode(fileValue)
}

type ReplyArgs = {
  sessionID: string
  requestID: string
  decision: "once" | "always" | "reject"
}

type ReplyFn = (args: ReplyArgs) => unknown

/**
 * Resolve the permission-reply surface at setup. Candidates, first match
 * wins: the TUI's data layer (what the built-in autoaccept itself calls —
 * `session.permission.reply({sessionID, decision, requestID})`), then the
 * generated-client namespaces, which are tagged `permission` for this
 * endpoint rather than nested under `session`.
 */
function resolveReply(context: unknown): ReplyFn | undefined {
  const ctx = context as {
    data?: { session?: { permission?: Record<string, unknown> } }
    client?: { permission?: Record<string, unknown>; session?: { permission?: Record<string, unknown> } }
  }
  const candidates: [string, unknown][] = [
    ["data.session.permission", ctx.data?.session?.permission],
    ["client.permission", ctx.client?.permission],
    ["client.session.permission", ctx.client?.session?.permission],
  ]
  for (const [name, layer] of candidates) {
    if (layer && typeof (layer as { reply?: unknown }).reply === "function") {
      debug(`reply surface resolved: ${name}.reply`)
      return (args) => (layer as { reply: ReplyFn }).reply(args)
    }
  }
  debug("no reply surface found; auto mode cannot answer requests")
  return
}

export default Plugin.define({
  id: "local.auto-approve",
  setup(context) {
    const reply = resolveReply(context)

    // Runtime overrides keyed by root session ID; never persisted.
    const [overrides, setOverrides] = context.storage.memory("local.auto-approve.overrides", {
      initial: {} as Record<string, PermissionMode>,
    })

    let defaultMode: PermissionMode = "prompt"
    function refreshDefault(): void {
      void readConfiguredMode().then((mode) => {
        defaultMode = mode
        debug(`configured starting mode: ${mode}`)
      })
    }
    refreshDefault()

    /** Root (top-level) session of a tab; `sessionID` itself as fallback. */
    function rootID(sessionID: string): string {
      try {
        return context.data.session.root(sessionID) ?? sessionID
      } catch {
        return sessionID
      }
    }

    // Requests already answered here — the built-in autoaccept keeps the
    // same set so a request is never answered twice.
    const replied = new Set<string>()

    const stopAsked = context.data.on("permission.asked", (event) => {
      try {
        const request = event.data
        const sessionID = request?.sessionID
        if (!sessionID || !request.id || replied.has(request.id)) return
        const mode = effectiveMode({
          sessionID,
          rootID: rootID(sessionID),
          overrides,
          defaultMode,
        })
        if (mode !== "autoaccept") return
        if (!reply) {
          debug(`auto mode but no reply surface (request ${request.id})`)
          return
        }
        replied.add(request.id)
        debug(`auto-approving request ${request.id} for ${sessionID}`)
        try {
          const result = reply({ sessionID, requestID: request.id, decision: "once" })
          void Promise.resolve(result).catch((error: unknown) => {
            replied.delete(request.id)
            debug(`reply rejected for ${request.id}: ${String(error)}`)
          })
        } catch (error) {
          replied.delete(request.id)
          debug(`reply threw for ${request.id}: ${String(error)}`)
        }
      } catch (error) {
        debug(`listener error: ${String(error)}`)
      }
    })

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "local.auto-approve.toggle",
          title: "Toggle auto-approve",
          group: "Permissions",
          bind: "<leader>tab",
          palette: true,
          run: () => {
            const sessionID = context.ui.router.current()?.sessionID
            if (!sessionID) return
            const rid = rootID(sessionID)
            const current = effectiveMode({ sessionID: rid, rootID: rid, overrides, defaultMode })
            setOverrides((draft) => {
              draft[rid] = toggledMode(current)
            })
            // Keep the starting mode fresh for tabs opened later.
            refreshDefault()
          },
        },
      ],
    }))

    context.ui.slot({
      append: "prompt.footer.status",
      render: (props: { sessionID?: string }) => {
        const sessionID = props?.sessionID ?? context.ui.router.current()?.sessionID
        if (!sessionID) return null
        const mode = effectiveMode({
          sessionID,
          rootID: rootID(sessionID),
          overrides,
          defaultMode,
        })
        return <text>{mode === "autoaccept" ? "AUTO" : "PROMPT"}</text>
      },
    })

    return () => stopAsked()
  },
})
