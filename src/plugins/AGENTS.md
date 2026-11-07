# src/plugins

- Only live, auto-discovered plugins live here — everything in this directory
  loads into every running TUI (`~/.config/opencode` is a symlink to the
  repo's `./src`, and edits here hot-reload; no restart needed).
- `matrix-rain` used to live here; it is parked in
  `src/plugins-disabled/matrix-rain/` — see that directory's `AGENTS.md` for
  its architecture and dev harnesses.

## nono-sandbox.ts

- Untouched by this repo's change flow: installed and updated by the nono
  utility, and git-ignored (see repo root AGENTS.md). Do not edit it here.

## session-history/

Per-session up/down prompt recall — the built-in history is one global stack,
so an idle session used to walk prompts from every other session and project.

- Shadows `prompt.history.previous`/`next` with keymap priority 10 (the
  built-in layer is priority 1). Outside the composer it returns `false` so
  other panes keep their keys; while the composer is focused it owns ↑/↓ —
  a rejected key falls through to `session.parent` / `session.child.first`,
  which is how down used to open the subagent picker mid-recall
- ↓ is released again at the draft position (nothing recalled), so the
  subagent picker keeps working exactly as it does without the plugin. The
  same applies while the transcript is still empty or not yet loaded — the
  cold-start sync path must not swallow it, which is what made ↓ inert in a
  fresh session whose only prompt was a slash command
- History comes from `data.session.message.list(sessionID)` (user messages with
  `text`), so nothing is stored by the plugin and a new session starts empty
- Reaches the composer through `renderer.currentFocusedRenderable` and the
  `session-pane` ancestor id — host renderable access, **not** plugin API; the
  docs expose no composer access at all. If recall silently stops after an
  OpenCode upgrade, re-probe those two assumptions first
- Recall restores text only: `@file`/`@agent` mention extmarks cannot be
  re-created from a plugin, so a recalled prompt with mentions submits as plain
  text
