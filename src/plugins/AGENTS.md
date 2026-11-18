# src/plugins

- Only live, auto-discovered plugins live here — everything in this directory
  loads into every running TUI (`~/.config/opencode` is a symlink to the
  repo's `./src`, and edits here hot-reload; no restart needed).
- `matrix-rain` used to live here; it is parked in
  `src/plugins-disabled/matrix-rain/` — see that directory's `AGENTS.md` for
  its architecture and dev harnesses.

## auto-approve/

Per-session runtime toggle for permission auto-accept — the built-in
"auto accept" is a cli.json `session.permissions` edit; this keeps the toggle
in memory so it dies with the TUI and the configured starting mode always
wins after restart.

- `<leader>tab` (palette: "Toggle auto-approve", group Permissions) flips the
  focused tab's root session between prompt and autoaccept; children follow
  their root, mirroring the built-in autoaccept's session + family walk
- In autoaccept the plugin answers `permission.asked` with
  `decision: "once"` — no "always" approval is ever saved, deny rules stay
  final, and nothing is written to cli.json or the db
- Footer badge via `prompt.footer.status` shows each tab's effective mode
- Reply surface (verified 2.3.0): `data.session.permission.reply` — the TUI
  data layer the built-in autoaccept itself calls; the generated
  `client.session.permission` namespace does not exist. tui.tsx probes that
  first with `client.permission` fallbacks and logs every outcome to
  `~/.local/share/opencode/auto-approve-debug.log` — read that before
  assuming the toggle logic broke after an upgrade
- Starting mode is read from cli.json on disk (no API serves CLI settings to
  plugins), refreshed on each toggle; `OPENCODE_CLI_CONFIG_CONTENT` wins over
  the file while set; unparseable input falls back to "prompt"
- Mode resolution lives in `mode.ts` (pure, no SDK imports);
  `bun test src/plugins/auto-approve` covers it (delegate to the test agent)

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
  fresh session whose only prompt was a slash command. In that same cold
  state ↑ with a typed draft moves the caret rather than syncing
- History comes from `data.session.message.list(sessionID)` (user messages with
  `text`), so nothing is stored by the plugin and a new session starts empty
- Reaches the composer through `renderer.currentFocusedRenderable` and the
  `session-pane` ancestor id — host renderable access, **not** plugin API; the
  docs expose no composer access at all. If recall silently stops after an
  OpenCode upgrade, re-probe those two assumptions first
- Recall restores text only: `@file`/`@agent` mention extmarks cannot be
  re-created from a plugin, so a recalled prompt with mentions submits as plain
  text
