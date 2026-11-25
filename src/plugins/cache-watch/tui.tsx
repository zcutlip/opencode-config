import { Plugin } from "@opencode/plugin/tui"

// cache-watch — prompt-cache visibility in the TUI footer.
//
// OpenCode reports provider cache accounting per request as TokenUsage.Info
// ({ input, output, reasoning, cache: { read, write } }) on assistant messages
// and `session.step.ended`; `session.usage.updated` carries the same shape but
// cumulative for the session. Nothing labels a "cache miss", so this plugin
// derives one from the share of prompt tokens the provider served from cache:
//
//   hit% = read / (read + write + input)
//
// The badge shows the latest request's hit ratio, red when it is low and
// `CACHE MISS` when the request read nothing from cache. Requests OpenCode
// makes outside the agent loop (title, compaction, generate) are deliberately
// ignored — they have their own prompts and would drown the signal.
//
// The footer shows the current session only. Per-message annotation is not
// available: the plugin API has no message-attached slot.

type TokenUsage = {
  input?: number
  output?: number
  reasoning?: number
  cache?: { read?: number; write?: number }
}

type Sample = { read: number; write: number; input: number }

type Color = string | { readonly r: number; readonly g: number; readonly b: number; readonly a: number }

type Theme = {
  text?: {
    base?: Color
    muted?: Color
    feedback?: Record<string, Color | { base?: Color } | undefined>
  }
}

/**
 * One feedback colour (`text.feedback.<kind>.base` on 2.0.11; newer hosts may
 * publish the colour directly). Falls back to muted/base, then to the default
 * terminal colour when the host resolves no theme at all.
 */
function tokenColor(theme: Theme | undefined, kind: string): Color | undefined {
  const entry = theme?.text?.feedback?.[kind]
  if (entry && typeof entry === "object" && "base" in entry) return entry.base
  if (entry) return entry as Color
  return theme?.text?.muted ?? theme?.text?.base
}

function fromTokens(tokens: TokenUsage | undefined): Sample | undefined {
  if (!tokens?.cache) return
  return {
    read: tokens.cache.read ?? 0,
    write: tokens.cache.write ?? 0,
    input: tokens.input ?? 0,
  }
}

export default Plugin.define({
  id: "local.cache-watch",
  setup(context) {
    // Latest request per session. Memory storage: survives plugin reloads,
    // discarded when the TUI exits, never written to disk.
    const [samples, setSamples] = context.storage.memory("local.cache-watch.samples", {
      initial: {} as Record<string, Sample>,
    })

    function record(sessionID: string | undefined, tokens: TokenUsage | undefined): void {
      const sample = fromTokens(tokens)
      if (!sessionID || !sample) return
      setSamples((draft) => {
        draft[sessionID] = sample
      })
    }

    // `step.ended` carries one model call's usage. `session.usage.updated` is
    // deliberately not recorded: it carries cumulative session totals, so
    // storing it would overwrite the latest step's ratio with a lifetime one.
    const stopStep = context.data.on("session.step.ended", (event) => {
      try {
        record(event.data?.sessionID, event.data?.tokens)
      } catch {
        // A malformed event must not break the session.
      }
    })

    /** Last assistant message's usage — sessions already in progress at load. */
    function fromMessages(sessionID: string): Sample | undefined {
      try {
        const messages = context.data.session.message.list(sessionID) ?? []
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index] as { type?: string; tokens?: TokenUsage } | undefined
          if (message?.type !== "assistant") continue
          const sample = fromTokens(message.tokens)
          if (sample) return sample
        }
      } catch {
        // Transcript not synced yet: no badge until the next step ends.
      }
      return
    }

    function latest(sessionID: string): Sample | undefined {
      return samples[sessionID] ?? fromMessages(sessionID)
    }

    context.ui.slot({
      append: "prompt.footer.status",
      render: (props: { sessionID?: string }) => {
        const sessionID = props?.sessionID ?? context.ui.router.current()?.sessionID
        if (!sessionID) return null
        const sample = latest(sessionID)
        if (!sample) return null
        const total = sample.read + sample.write + sample.input
        if (total <= 0) return null
        const theme = context.theme as Theme | undefined
        if (sample.read === 0) return <text fg={tokenColor(theme, "error")}>CACHE MISS</text>
        const percent = Math.round((sample.read / total) * 100)
        const kind = percent >= 80 ? "success" : percent >= 50 ? "warning" : "error"
        return <text fg={tokenColor(theme, kind)}>{`CACHE ${percent}%`}</text>
      },
    })

    return () => {
      stopStep()
    }
  },
})
