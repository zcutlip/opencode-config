/**
 * matrix-rain engine — pure state machine, zero rendering.
 *
 * Tuned against the design demo (~/.opencode/plan/matrix-rain-demo.html) and
 * corrected against observed TUI behaviour: a trail is stored as offsets from
 * its head (`trail[0]` is the head, `trail[k]` sits k rows above it) and drawn
 * at `head - k`. The demo stored cells at absolute rows instead, which holds
 * glyphs still and only reads as rain when the viewport is tall; on a four-row
 * strip it looks frozen.
 *
 * Design notes:
 * - Logical cell grid; the renderer picks the glyph pool and paint.
 * - Terminal surfaces cannot express sub-cell jitter, so the demo's glitch
 *   jitter becomes heavier glyph substitution on the glitch ramp.
 * - No clock inside: callers pass `dt` and the telemetry factor, so the engine
 *   is deterministic given the same inputs.
 */

/** Full-width katakana pool (demo look) — occupies 2 terminal cells. */
export const GLYPHS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ZΩ"

/** Half-width katakana pool — 1 terminal cell, for dense/wide layouts. */
export const GLYPHS_HALF = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ZΩ"

export type PaletteName = "matrix" | "korp-red" | "theme"

export interface Palette {
  head: string
  bright: string
  mid: string
  dim: string
  bg: string
  glitch: string
  glitchMid: string
}

export const PALETTES: Record<PaletteName, Palette> = {
  matrix: {
    head: "#d8ffd8",
    bright: "#00ff41",
    mid: "#00b32d",
    dim: "#0a3d0a",
    bg: "#020a02",
    glitch: "#ff4d4d",
    glitchMid: "#b0121f",
  },
  "korp-red": {
    head: "#ffe0e6",
    bright: "#ff2740",
    mid: "#b0121f",
    dim: "#3d0a0f",
    bg: "#0a0203",
    glitch: "#ffcc00",
    glitchMid: "#b8860b",
  },
  theme: {
    head: "#ccfbf1",
    bright: "#2dd4bf",
    mid: "#0d9488",
    dim: "#08302b",
    bg: "#020a09",
    glitch: "#f97316",
    glitchMid: "#c2410c",
  },
}

export const PALETTE_NAMES: PaletteName[] = ["matrix", "korp-red", "theme"]

export type TelemetryMode = "idle" | "generating"

export interface TelemetryFactor {
  /** head-advance rate multiplier */
  speed: number
  /** trail length multiplier */
  lenScale: number
  /** fraction of columns active in this mode */
  density: number
  /** 1 while a permission decision is pending, else 0 */
  glitch: number
}

/**
 * Telemetry -> visual mapping (the event design).
 *   idle          calm, sparse trickle (low density, unhurried step, no shimmer)
 *   generating    full-speed downpour, high density, long trails
 *   permission    near-frozen, red/amber ramp + substitution glitch
 */
export function telemetryFactor(mode: TelemetryMode, permissionPending: boolean): TelemetryFactor {
  if (permissionPending) return { speed: 0.12, lenScale: 0.55, density: 0.5, glitch: 1 }
  if (mode === "generating") return { speed: 1.25, lenScale: 1.15, density: 0.85, glitch: 0 }
  return { speed: 0.35, lenScale: 0.7, density: 0.4, glitch: 0 }
}

export function paletteFor(name: PaletteName): Palette {
  return PALETTES[name] ?? PALETTES.matrix
}

export interface Column {
  /** logical column index */
  x: number
  /** continuous head position, in rows (may be negative / fractional) */
  y: number
  speed: number
  /** trail length in rows (before lenScale) */
  len: number
  /** ms accumulator */
  acc: number
  active: boolean
  /** trail glyphs by offset from the head: trail[0] is the head */
  trail: string[]
  /** tool-name glyphs while bursting */
  seed: string[] | null
  burstUntil: number
}

export interface StyledCell {
  ch: string
  fg: string
}

export interface Frame {
  bg: string
  glitch: boolean
  /** rows[r][c] is null for empty cells */
  rows: (StyledCell | null)[][]
}

export interface RainOptions {
  /** fraction of columns active at once */
  density?: number
  /** truncate the world below this many rows (the strip does this) */
  maxRows?: number
  /** glyph pool; defaults to the full-width demo pool */
  glyphs?: string
}

/** ms per row of head advance at speed 1 (demo constant) */
const BASE_INTERVAL = 110
/** column speed multiplier while bursting (demo constant) */
const BURST_BOOST = 3
/** burst duration in ms (demo constant) */
const BURST_MS = 1400
/** probability a dormant column wakes on any step (demo constant) */
const WAKE_CHANCE = 0.005
/** mid-trail glyph mutation rate (subtle shimmer without obscuring translation) */
const MUTATION_CHANCE = 0.04
/** glyph substitution rate while glitching — stands in for cell jitter */
const GLITCH_MUTATION_CHANCE = 0.08

export class Rain {
  readonly density: number
  readonly maxRows: number
  readonly glyphs: string
  cols: Column[] = []
  rows = 0
  /** logical columns — set by resize() */
  width = 0

  constructor(opts: RainOptions = {}) {
    this.density = opts.density ?? 1
    this.maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY
    this.glyphs = opts.glyphs ?? GLYPHS
  }

  /** Fit the grid to a surface. Existing columns keep their state. */
  resize(cols: number, rows: number): void {
    const width = Math.max(1, Math.floor(cols))
    const rowCount = Math.max(0, Math.floor(rows))
    // Set the world size first so new columns scatter across the real height.
    this.rows = rowCount
    this.width = width
    const old = this.cols
    this.cols = []
    for (let i = 0; i < width; i++) this.cols.push(old[i] ?? this.newCol(i, true, 0.4))
  }

  newCol(x: number, scattered: boolean, activeDensity = this.density): Column {
    // Trails scale with the surface: a 26-row trail in a 4-row strip would
    // spend almost all its life above the fold.
    const maxLen = Math.max(3, Math.min(26, this.rows * 2))
    const len = rand(maxLen * 0.45, maxLen)
    const initLen = Math.max(1, Math.ceil(len * 1.2))
    const trail: string[] = []
    for (let i = 0; i < initLen; i++) trail.push(this.randomGlyph())
    const spawnGap = Math.max(6, maxLen)
    return {
      x,
      y: scattered ? rand(-spawnGap, this.rows) : rand(-1 - spawnGap, -1),
      speed: rand(0.45, 1.35),
      len,
      acc: rand(0, 200),
      active: Math.random() < activeDensity,
      trail,
      seed: null,
      burstUntil: 0,
    }
  }

  /**
   * Tool-call visual: 1-3 columns restart at 3x speed with the tool name
   * as their falling glyphs. `now` is any monotonic ms clock the caller owns.
   */
  burst(seed: string, now: number): void {
    const glyphs = seed.split("")
    const n = 1 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const col = this.cols[Math.floor(Math.random() * this.cols.length)]
      if (!col) return
      col.seed = glyphs
      col.burstUntil = now + BURST_MS
      col.y = -1
      const initLen = Math.max(1, Math.ceil(col.len * 1.2))
      col.trail = []
      for (let i = 0; i < initLen; i++) {
        col.trail.push(glyphs[seedIndex(i, glyphs.length)])
      }
      col.active = true
    }
  }

  /** Advance heads and age trails by `dt` ms. */
  step(dt: number, factor: TelemetryFactor, speedScale: number, now: number): void {
    const global = factor.speed * speedScale
    const limit = Math.min(this.rows, this.maxRows)
    const targetDensity = Math.min(this.density, factor.density)
    const allowMutation = factor.speed > 0.5
    const wakeChance = allowMutation ? 0.04 : WAKE_CHANCE
    for (const col of this.cols) {
      if (!col.active) {
        if (Math.random() < wakeChance) col.active = Math.random() < targetDensity
        continue
      }
      const boost = now < col.burstUntil ? BURST_BOOST : 1
      const interval = BASE_INTERVAL / (col.speed * global * boost)
      const effLen = Math.max(1, Math.round(col.len * factor.lenScale))
      col.acc += dt
      while (col.acc >= interval) {
        col.acc -= interval
        col.y += 1
        const bursting = col.seed !== null && now < col.burstUntil
        while (col.trail.length < effLen) {
          const i = col.trail.length
          col.trail.push(
            bursting ? col.seed![seedIndex(i, col.seed!.length)] : this.randomGlyph(),
          )
        }
        if (col.trail.length > effLen) col.trail.length = effLen
        // occasional glyph mutation in the tail during high-speed generation;
        // suppressed in calm 2-row idle so drops don't wiggle in place
        if (allowMutation && col.trail.length > 2 && Math.random() < MUTATION_CHANCE) {
          const k = 1 + Math.floor(Math.random() * (col.trail.length - 1))
          col.trail[k] = this.randomGlyph()
        }
        if (col.y - effLen > limit) Object.assign(col, this.newCol(col.x, false, targetDensity))
      }
    }
  }

  /** Snapshot the grid for a renderer. No side effects. */
  frame(factor: TelemetryFactor, palette: Palette): Frame {
    const glitch = factor.glitch > 0
    const rowCount = Math.min(this.rows, this.maxRows)
    const rows: (StyledCell | null)[][] = []
    for (let r = 0; r < rowCount; r++) rows.push(new Array(this.cols.length).fill(null))
    for (const col of this.cols) {
      if (!col.active) continue
      const effLen = Math.max(1, col.len * factor.lenScale)
      const head = Math.floor(col.y)
      for (let k = 0; k < col.trail.length; k++) {
        const row = head - k
        const line = rows[row]
        if (!line || col.x >= line.length) continue
        const ratio = Math.min(1, k / effLen)
        const isHead = k === 0
        const ch =
          glitch && !isHead && Math.random() < GLITCH_MUTATION_CHANCE
            ? this.randomGlyph()
            : col.trail[k]
        line[col.x] = { ch, fg: styleFor(palette, ratio, isHead, glitch) }
      }
    }
    return { bg: glitch ? "#0a0102" : palette.bg, glitch, rows }
  }

  randomGlyph(): string {
    return this.glyphs[Math.floor(Math.random() * this.glyphs.length)]
  }
}

/**
 * Offset -> colour ramp. Head is near-white, then bright, mid, dim — the
 * flicker-free 4-stage ramp that gave the demo its depth.
 */
export function styleFor(palette: Palette, ratio: number, isHead: boolean, glitch: boolean): string {
  if (glitch) {
    if (isHead) return palette.glitch
    return ratio < 0.5 ? palette.glitchMid : palette.dim
  }
  if (isHead) return palette.head
  if (ratio < 0.12) return palette.bright
  if (ratio < 0.5) return palette.mid
  return palette.dim
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Non-negative modulo, so burst seeds keep cycling for rising rows. */
function seedIndex(row: number, length: number): number {
  return ((row % length) + length) % length
}
