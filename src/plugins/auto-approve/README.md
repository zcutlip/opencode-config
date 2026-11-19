# auto-approve

Per-session runtime toggle for permission auto-accept. The built-in
"auto accept" is a `session.permissions` edit in `cli.json`; this plugin makes
it a keystroke that outlives neither the tab nor the TUI.

## Usage

- `<leader>tab` (leader is `ctrl+x` by default) or the command palette entry
  **Toggle auto-approve** (group "Permissions") flips the focused session tab
  between prompt and auto-accept.
- The footer badge (`prompt.footer.status`) shows the tab's effective mode:
  `AUTO` or `PROMPT`.
- A TUI restart always returns every tab to the configured starting mode
  (`cli.json` `session.permissions`). The toggle is never written to
  `cli.json`, the database, or saved approvals — restarting is the reset.

## Semantics

- The toggle is keyed by the focused tab's **root session**; child sessions
  (subagents) follow their root, mirroring the built-in autoaccept's
  session + family walk.
- Other TUI windows are separate processes and are unaffected.
- In auto-accept, incoming `permission.asked` events are answered with
  `decision: "once"` — exactly what the built-in mode does. No `"always"`
  approval is ever recorded, and configured deny rules stay final.
- In prompt mode the plugin answers nothing and the host prompt behaves as
  usual.

## How it works

- `mode.ts` — pure decision logic, no SDK imports:
  `effectiveMode` (session override → root override → configured default),
  `toggledMode`, `normalizeMode` (unknown configured value → `"prompt"`, the
  documented default and the safe direction).
- `tui.tsx` — the wiring:
  - `readConfiguredMode` reads the starting mode from
    `~/.config/opencode/cli.json` (or `$XDG_CONFIG_HOME`). No API serves CLI
    settings to plugins. `OPENCODE_CLI_CONFIG_CONTENT` wins over the file
    while set; missing or unparseable input falls back to `"prompt"`. The
    value is refreshed on each toggle and on plugin load.
  - Overrides live in `context.storage.memory` — they survive plugin
    reloads, are discarded when the TUI exits, and are not shared across
    TUI windows.
  - The reply surface is probed at setup (not assumed): the TUI data layer's
    `data.session.permission.reply` first — verified as the working surface
    on 2.3.0 and the same one the built-in autoaccept calls — then
    `client.permission` / `client.session.permission` as fallbacks (the
    generated `client.session.permission` namespace does not exist).

## Fragility notes

The plugin depends on undocumented internals — functionality that works
today but is not part of the plugin API, so OpenCode can change it in any
release without a breaking-change note:

- The `data.session.permission.reply` method: the docs list only
  `list`/`sync`/`invalidate` for the permission data layer; `reply` exists
  because the built-in autoaccept calls it internally (verified on 2.3.0).
- The `prompt.footer.status` slot render receiving a session ID: the slot
  name is documented, the render props are not.

After an OpenCode upgrade, read
`~/.local/share/opencode/auto-approve-debug.log` — every resolution,
approval, and failure lands there — before assuming the toggle logic broke.

## Tests

`bun test src/plugins/auto-approve` (delegate runs to the test agent) covers
the mode resolution in `mode.ts`: inheritance, override precedence, toggle
inversion, and unknown-value fallback.
