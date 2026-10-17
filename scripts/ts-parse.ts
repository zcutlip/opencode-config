#!/usr/bin/env bun
/**
 * ts-parse — parse-check TS/TSX files with the Bun transpiler.
 *
 * Parse-only: reports syntax errors without typechecking. Fast, no
 * dependencies, and does not need a node_modules or a build toolchain —
 * useful in a repo that has neither. For type errors use `bunx tsc --noEmit`.
 *
 * Usage:
 *   bun scripts/ts-parse.ts <path>...        parse files or directories
 *   bun scripts/ts-parse.ts --git <path>...  also parse each file's HEAD
 *                                            version and compare (isolates
 *                                            "my edit broke it" from "it was
 *                                            already broken")
 *
 * Directories are walked recursively for .ts/.tsx/.mts/.cts, skipping
 * node_modules, .git, dist, and build. Exits 0 when everything parses.
 */

import { readdirSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"])
const EXT = /\.(ts|tsx|mts|cts)$/
const FAIL: string[] = []

function walk(path: string, out: string[]): void {
  let st
  try {
    st = statSync(path)
  } catch {
    return
  }
  if (st.isFile()) {
    if (EXT.test(path)) out.push(path)
    return
  }
  if (!st.isDirectory()) return
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue
    walk(join(path, entry), out)
  }
}

function loaderFor(path: string): "ts" | "tsx" {
  return path.endsWith("x") ? "tsx" : "ts"
}

function parseFile(path: string, label = path): boolean {
  let src: string
  try {
    src = readFileSync(path, "utf8")
  } catch (err) {
    FAIL.push(label)
    console.log(`${label}: READ ERROR ${String(err)}`)
    return false
  }
  const t = new Bun.Transpiler({ loader: loaderFor(path) })
  try {
    t.transformSync(src)
    console.log(`${label}: parses ok`)
    return true
  } catch (err) {
    FAIL.push(label)
    console.log(`${label}: PARSE ERROR ${String((err as Error).message ?? err)}`)
    return false
  }
}

function parseGitVersion(path: string): void {
  const proc = Bun.spawnSync(["git", "show", `HEAD:${path}`])
  if (proc.exitCode !== 0) {
    console.log(`${path} @HEAD: not in HEAD (new file)`)
    return
  }
  const src = proc.stdout.toString()
  const t = new Bun.Transpiler({ loader: loaderFor(path) })
  const label = `${path} @HEAD`
  try {
    t.transformSync(src)
    console.log(`${label}: parses ok`)
  } catch (err) {
    FAIL.push(label)
    console.log(`${label}: PARSE ERROR ${String((err as Error).message ?? err)}`)
  }
}

const args = process.argv.slice(2)
const gitCompare = args.includes("--git")
const paths = args.filter((a) => a !== "--git")

if (paths.length === 0) {
  console.log("usage: bun scripts/ts-parse.ts [--git] <path>...")
  process.exit(2)
}

const files: string[] = []
for (const p of paths) walk(p, files)
if (files.length === 0) {
  console.log("no TS/TSX files found")
  process.exit(2)
}

for (const f of files) {
  parseFile(f)
  if (gitCompare) {
    // Show the committed version too, so a worktree-only error is obvious.
    parseGitVersion(f)
  }
}

if (FAIL.length > 0) {
  console.log(`\nFAIL (${FAIL.length}): ${FAIL.join(", ")}`)
  process.exit(1)
}
console.log(`\nok — ${files.length} file(s) parse`)
