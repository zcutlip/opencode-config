# src/plugins

## matrix-rain (`matrix-rain/`)

- `engine.ts` is pure (no JSX/renderer) — surface code lives in `tui.tsx`
- Trail arrays are pre-populated at spawn, never `unshift`ed per step
- One `Rain` engine + frame signal per `sessionID`, never shared across tabs
- Full-width glyphs (2 cells) everywhere except the sidebar block
  (`GLYPHS_HALF`)
- Edits hot-reload into running TUI windows — no restart needed

## Commands

| Task | Command |
|------|---------|
| Engine stress + invariants | `./src/plugins/matrix-rain/dev/rain-check.ts` |
| Density/speed tuning | `./src/plugins/matrix-rain/dev/rain-tune.ts` |
| Text frame dump | `./src/plugins/matrix-rain/dev/rain-view.ts` |
| Translate-vs-hold check | `./src/plugins/matrix-rain/dev/motion-classify.ts` |

- No test framework — run `rain-check.ts` after engine changes
