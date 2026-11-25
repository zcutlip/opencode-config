import { Plugin } from "@opencode/plugin/tui"

// cache-watch — prompt-cache visibility in the TUI.
//
// OpenCode reports provider cache accounting per request as TokenUsage.Info
// ({ input, output, reasoning, cache: { read, write } }) on assistant messages
// and `session.step.ended`; `session.usage.updated` carries the same shape but
// cumulative for the session. Nothing labels a "cache miss", so this plugin
// derives one from the share of prompt tokens the provider served from cache:
//
//   hit% = read / (read + write + input)
//
// Two surfaces, both per session:
//   - prompt footer: the latest step's ratio, red when low, `CACHE MISS` at 0
//   - sidebar: a sparkline of the last HISTORY_LIMIT steps, one column each,
//     coloured by bucket, with a miss count
//
// Requests OpenCode makes outside the agent loop (title, compaction, generate)
// are deliberately ignored — they have their own prompts and would drown the
// signal. Per-message annotation is not available: the plugin API has no
// message-attached slot.

const HISTORY_LIMIT = 24
const GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const

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
  const sample = {
    read: tokens.cache.read ?? 0,
    write: tokens.cache.write ?? 0,
    input: tokens.input ?? 0,
  }
  if (sample.read + sample.write + sample.input <= 0) return
  return sample
}

function percent(sample: Sample): number {
  return Math.round((sample.read / (sample.read + sample.write + sample.input)) * 100)
}

/** Feedback colour for a step: misses and low ratios are errors. */
function kind(sample: Sample): string {
  if (sample.read === 0) return "error"
  const hit = percent(sample)
  return hit >= 80 ? "success" : hit >= 50 ? "warning" : "error"
}

/** Eighth-block height for the sparkline; a full miss is the floor. */
function level(sample: Sample): number {
  return Math.min(GLYPHS.length - 1, Math.floor(percent(sample) / (100 / GLYPHS.length)))
}

export default Plugin.define({
  id: "local.cache-watch",
  setup(context) {
    // Last HISTORY_LIMIT steps per session. Memory storage: survives plugin
    // reloads, discarded when the TUI exits, never written to disk.
    const [history, setHistory] = context.storage.memory("local.cache-watch.history", {
      initial: {} as Record<string, Sample[]>,
    })

    function record(sessionID: string | undefined, tokens: TokenUsage | undefined): void {
      const sample = fromTokens(tokens)
      if (!sessionID || !sample) return
      setHistory((draft) => {
        const steps = draft[sessionID] ?? []
        draft[sessionID] = [...steps, sample].slice(-HISTORY_LIMIT)
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
        // Transcript not synced yet: no data until the next step ends.
      }
      return
    }

    /** Steps for this session, falling back to the last completed step. */
    function steps(sessionID: string): Sample[] {
      const recorded = history[sessionID]
      if (recorded && recorded.length > 0) return recorded
      const seeded = fromMessages(sessionID)
      return seeded ? [seeded] : []
    }

    function theme(): Theme | undefined {
      return context.theme as Theme | undefined
    }

    context.ui.slot({
      append: "prompt.footer.status",
      render: (props: { sessionID?: string }) => {
        const sessionID = props?.sessionID ?? context.ui.router.current()?.sessionID
        if (!sessionID) return null
        const latest = steps(sessionID).at(-1)
        if (!latest) return null
        const label = latest.read === 0 ? "CACHE MISS" : `CACHE ${percent(latest)}%`
        return <text fg={tokenColor(theme(), kind(latest))}>{label}</text>
      },
    })

    // The sidebar passes no reliable width, so the sparkline is capped at
    // HISTORY_LIMIT columns — under a third of a normal terminal.
    context.ui.slot({
      append: "sidebar.content",
      render: (props: { sessionID?: string }) => {
        const sessionID = props?.sessionID ?? context.ui.router.current()?.sessionID
        if (!sessionID) return null
        const samples = steps(sessionID)
        if (samples.length === 0) return null
        const latest = samples.at(-1) as Sample
        const misses = samples.filter((sample) => sample.read === 0).length
        return (
          <box flexDirection="column">
            <box flexDirection="row">
              <text fg={tokenColor(theme(), kind(latest))}>
                {latest.read === 0 ? "CACHE MISS" : `CACHE ${percent(latest)}%`}
              </text>
              {misses > 0 && (
                <text fg={tokenColor(theme(), "error")}>{`  ${misses} miss${misses === 1 ? "" : "es"}`}</text>
              )}
            </box>
            <box flexDirection="row">
              {samples.map((sample) => (
                <text fg={tokenColor(theme(), kind(sample))}>{GLYPHS[level(sample)]}</text>
              ))}
            </box>
          </box>
        )
      },
    })

    return () => {
      stopStep()
    }
  },
})
