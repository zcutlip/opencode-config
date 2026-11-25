# cache-watch

Prompt-cache visibility for the current session.

- Footer badge (`prompt.footer.status`): the latest step's cache hit ratio —
  `CACHE 96%` (green), low ratios in red, `CACHE MISS` when the request read
  nothing from cache
- Sidebar block (`sidebar.content`): the same ratio plus a sparkline of the
  last 24 steps, one eighth-block column per step, coloured by bucket, and a
  miss count when any step read nothing
- Ratio is `read / (read + write + input)` from `TokenUsage.Info`; OpenCode
  does not label misses itself, so this is the plugin's own definition
- Source: `session.step.ended`, one model call's `tokens`, kept per session in
  memory storage — survives plugin reloads, dies with the TUI, writes nothing
  to disk
- `session.usage.updated` is deliberately not consumed: probe-verified (2.4.1)
  it carries cumulative session totals, so recording it would replace the
  latest step's ratio with a lifetime one
- Sessions already in progress when the plugin loads seed the badge from the
  last assistant message's `tokens`; the first finished step replaces that
- Auxiliary requests (`session.usage.recorded`: title, compaction, generate)
  are ignored — their prompts differ and would drown the main-loop signal
- No per-message annotation: the plugin API exposes no message-attached slot,
  so the footer badge and sidebar sparkline are the surfaces
- Colors use `text.feedback.<kind>.base` with fallbacks to muted/base; a host
  that resolves no theme renders the badge in the default color
