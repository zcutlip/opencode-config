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
