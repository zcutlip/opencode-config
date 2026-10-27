#!/usr/bin/env bun
// Dev harness: tune strip density by measurement (visible glyphs, motion) and
// eyeball one frame per candidate.
import {
  Rain,
  telemetryFactor,
  paletteFor,
} from "../engine"

const palette = paletteFor("matrix")
const COLS = 60
const ROWS = 4

function measure(density: number, mode: "idle" | "generating") {
  const engine = new Rain({ density, maxRows: ROWS })
  engine.resize(COLS, ROWS)
  const f = telemetryFactor(mode, false)
  let now = 0
  let cells = 0
  let changes = 0
  let samples = 0
  let prev = engine.frame(f, palette)
  for (let i = 0; i < 900; i++) {
    now += 66
    engine.step(66, f, 1, now)
    const frame = engine.frame(f, palette)
    if (i > 200) {
      let occupied = 0
      for (const row of frame.rows) for (const cell of row) if (cell) occupied++
      cells += occupied
      for (let r = 0; r < frame.rows.length; r++)
        for (let c = 0; c < frame.rows[r].length; c++)
          if ((prev.rows[r]?.[c]?.ch ?? "") !== (frame.rows[r][c]?.ch ?? "")) changes++
      samples++
    }
    prev = frame
  }
  return {
    glyphs: (cells / samples).toFixed(1),
    motion: (changes / samples).toFixed(1),
    last: prev,
  }
}

for (const mode of ["idle", "generating"] as const) {
  console.log(`\n=== ${mode} ===`)
  for (const density of [0.6, 0.75, 0.85, 0.95]) {
    const m = measure(density, mode)
    console.log(`density ${density}: ${m.glyphs} glyphs/frame visible, ${m.motion} cells changing/frame`)
  }
}

console.log("\n=== sample frame, generating, density 0.85 ===")
const sample = measure(0.85, "generating")
sample.last.rows.forEach((row, r) => {
  console.log(`r${r} │${row.map((c) => (c ? c.ch : "·")).join(" ")}│`)
})
