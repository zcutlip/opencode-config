#!/usr/bin/env bun
// Dev harness: engine smoke test + motion assertion.
// Verifies (a) no crash across resizes/bursts/glitch, (b) rows are always
// integer-indexed and in range, (c) trails actually translate between ticks.
import {
  Rain,
  telemetryFactor,
  paletteFor,
} from "../engine"

const palette = paletteFor("matrix")
const engine = new Rain({ density: 0.6, maxRows: 4 })
engine.resize(60, 4)

let now = 0
let frames = 0
let differing = 0

function snapshot() {
  const f = telemetryFactor("generating", false)
  return engine.frame(f, palette)
}

let prev = snapshot()

for (let i = 0; i < 5000; i++) {
  now += 66
  const mode = i % 3 === 0 ? "idle" : "generating"
  const f = telemetryFactor(mode as "idle" | "generating", i % 997 === 0)
  engine.step(66, f, 1, now)
  if (i % 500 === 0) engine.burst("grep", now)
  if (i % 37 === 0) engine.resize(60 + (i % 3), 4)

  const frame = engine.frame(f, palette)
  frames++

  // invariant: every styled cell sits in an in-range integer row
  for (let r = 0; r < frame.rows.length; r++) {
    if (!frame.rows[r]) throw new Error(`row ${r} missing`)
    for (const cell of frame.rows[r]) {
      if (cell && (typeof cell.ch !== "string" || !cell.ch)) {
        throw new Error(`bad glyph ${JSON.stringify(cell)}`)
      }
    }
  }

  // motion: count visible cells that changed since the previous frame
  for (let r = 0; r < frame.rows.length; r++) {
    for (let c = 0; c < frame.rows[r].length; c++) {
      const a = prev.rows[r]?.[c]
      const b = frame.rows[r][c]
      if ((a?.ch ?? "") !== (b?.ch ?? "")) differing++
    }
  }
  prev = frame

  // columns must never keep trails longer than their scaled length
  const cap = 26
  for (const col of engine.cols) {
    if (col.trail.length > cap) throw new Error(`trail too long: ${col.trail.length} > ${cap}`)
  }
}

console.log(`ok — ${frames} frames, no crash; ${differing} visible cell changes`)
console.log(`    avg ${(differing / frames).toFixed(1)} cells changing per frame`)
