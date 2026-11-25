# cache-watch

Prompt-cache visibility for the current session's footer.

- Badge in `prompt.footer.status` shows the latest request's cache hit ratio:
  `CACHE 96%` (green), `CACHE 12%` (red below 50%), or `CACHE MISS` when the
  request read nothing from cache
- Ratio is `read / (read + write + input)` from `TokenUsage.Info`; OpenCode
  does not label misses itself, so this is the plugin's own definition
- Source: `session.step.ended`, one model call's `tokens`, keyed per session in
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
  so the footer badge is the surface
- Colors use `text.feedback.<kind>.base` with fallbacks to muted/base; a host
  that resolves no theme renders the badge in the default color
