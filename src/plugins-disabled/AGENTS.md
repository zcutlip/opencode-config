# src/plugins-disabled

Park here for plugins that are written and may return, but are not currently
loaded: nothing under this directory is discovered by OpenCode, so moving a
directory in or out of `src/plugins/` is the enable/disable switch.

## matrix-rain (`matrix-rain/`)

Disabled 2026-10-27, after completing v1 (strip, sidebar widget with
clickable disclosure, full-screen screensaver + auto-activate, session
telemetry: tool-name bursts and permission-glitch).

- `engine.ts` is pure (no JSX/renderer) — surface code lives in `tui.tsx`
- Trail arrays are pre-populated at spawn, never `unshift`ed per step
- One `Rain` engine + frame signal per `sessionID`, never shared across tabs
- Full-width glyphs (2 cells) everywhere except the sidebar block
  (`GLYPHS_HALF`)
- While disabled, edits do NOT hot-reload anywhere — re-enable first
- Re-enable: `mv src/plugins-disabled/matrix-rain src/plugins/`; then edits
  hot-reload in running TUI windows again
- `dev/` harnesses run against `engine.ts` even while the plugin is disabled;
  their no-ask allow rules in the repo-root `opencode.jsonc` were migrated
  along with the directory

## Commands

| Task | Command |
|------|---------|
| Engine stress + invariants | `./src/plugins-disabled/matrix-rain/dev/rain-check.ts` |
| Density/speed tuning | `./src/plugins-disabled/matrix-rain/dev/rain-tune.ts` |
| Text frame dump | `./src/plugins-disabled/matrix-rain/dev/rain-view.ts` |
| Translate-vs-hold check | `./src/plugins-disabled/matrix-rain/dev/motion-classify.ts` |

- No test framework — run `rain-check.ts` after engine changes
