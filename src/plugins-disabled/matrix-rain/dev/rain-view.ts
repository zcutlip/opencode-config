#!/usr/bin/env bun
// Dev harness: render engine frames as text so the strip can be verified without
// a screenshot. Simulates the TUI tick (66ms, 60 engine cols = ~120 cells).
import {
  Rain,
  telemetryFactor,
  paletteFor,
} from "../engine"

const palette = paletteFor("matrix")
const engine = new Rain({ density: 0.6, maxRows: 4 })
engine.resize(60, 4)

let now = 0
function tick(mode: "idle" | "generating", ticks: number) {
  const f = telemetryFactor(mode, false)
  for (let i = 0; i < ticks; i++) {
    now += 66
    engine.step(66, f, 1, now)
  }
}
function show(label: string, visible: number) {
  const f = telemetryFactor("idle", false)
  const frame = engine.frame(f, palette)
  console.log(`\n${label}`)
  frame.rows.slice(0, visible).forEach((row, r) => {
    const line = row.map((c) => (c ? c.ch : "·")).join(" ")
    console.log(`r${r} │${line}│`)
  })
}

// idle, then generating, then back to idle — mirroring a real turn
tick("idle", 200)
show("IDLE (showing 1 row, as the strip does)", 1)
show("IDLE (all 4 world rows, to see what's below the fold)", 4)

tick("generating", 60)
show("GENERATING (4 rows)", 4)

tick("generating", 30)
show("GENERATING +30 ticks later (motion check)", 4)

tick("idle", 400)
show("BACK TO IDLE (4 world rows)", 4)
