#!/usr/bin/env bun
// Dev harness: settle the question mechanically — do glyphs translate down a
// row each step, or hold their row and merely dim? Compares engine frames.
import {
  Rain,
  telemetryFactor,
  paletteFor,
} from "../engine"

const palette = paletteFor("matrix")
const f = telemetryFactor("generating", false)
const engine = new Rain({ density: 1, maxRows: 4 })
engine.resize(6, 4)

// Warm up so columns are mid-flight.
let now = 0
for (let i = 0; i < 40; i++) { now += 66; engine.step(66, f, 1, now) }

let translated = 0
let held = 0
let fresh = 0
let prev = engine.frame(f, palette)

console.log("per-step, per-column cell changes:")
for (let step = 0; step < 8; step++) {
  now += 66
  engine.step(66, f, 1, now)
  const cur = engine.frame(f, palette)
  for (let c = 0; c < cur.rows[0].length; c++) {
    const before = new Map<number, string>()
    const after = new Map<number, string>()
    for (let r = 0; r < 4; r++) {
      if (prev.rows[r][c]) before.set(r, prev.rows[r][c]!.ch)
      if (cur.rows[r][c]) after.set(r, cur.rows[r][c]!.ch)
    }
    if (before.size === 0 && after.size === 0) continue
    // did the same glyph string appear one row lower?
    let moved = false
    for (const [r, g] of before) if (after.get(r + 1) === g) moved = true
    let same = false
    for (const [r, g] of before) if (after.get(r) === g) same = true
    const line = `  step${step} col${c}: before[${[...before].map(([r, g]) => `${r}:${g}`).join(" ")}] after[${[...after].map(([r, g]) => `${r}:${g}`).join(" ")}] moved=${moved} held=${same}`
    if (before.size || after.size) console.log(line)
    if (moved) translated++
    else if (same) held++
    else if (after.size) fresh++
  }
  prev = cur
}
console.log(`\ntotals: translated=${translated} held-in-place=${held} newly-appeared=${fresh}`)
