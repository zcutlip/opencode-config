// Create-only scaffolding for a project-local `.opencode/opencode.jsonc`.
// Pure decision logic over an injectable filesystem, so bun:test runs headless
// and no test ever writes to a real project.

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/** File this plugin creates, relative to the project directory. */
export const TARGET_FILE = join(".opencode", "opencode.jsonc")

/**
 * Any of these in the project means it already configures OpenCode, so the
 * stub is skipped. `.opencode` configs override direct ones during discovery,
 * so writing one next to an existing direct config would silently shadow it.
 */
export const PROJECT_CONFIG_FILES = [
  "opencode.jsonc",
  "opencode.json",
  join(".opencode", "opencode.jsonc"),
  join(".opencode", "opencode.json"),
] as const

/**
 * Inert scaffolding: `$schema`, fill-in prompts for the settings most projects
 * touch, and empty containers for the ones worth discovering. Nothing here
 * changes behavior — arrays are `[]` (rule/entry lists) and maps are `{}`.
 */
export const STUB_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",

  // Default model for this project, in provider/model form.
  // "model": "provider/model",
  // Primary agent when a session does not select one.
  // "default_agent": "build",

  // Specialized agents for this project.
  "agents": {},
  // Named slash commands (prompt templates) for this project.
  "commands": {},
  // Ordered allow/deny/ask rules; the last matching rule wins.
  "permissions": [],
  // Plugins loaded for this project.
  "plugins": [],
  // Provider and model overrides.
  "providers": {},
  // Named local directories or Git repositories for supporting context.
  "references": {},
  // MCP servers available in this project.
  "mcp": {
    "servers": {},
  },
}
`

export type InitIo = {
  exists: (path: string) => boolean
  /** Creates parent directories and must fail rather than overwrite. */
  write: (path: string, content: string) => void
}

export const realIo: InitIo = {
  exists: existsSync,
  write: (path, content) => {
    mkdirSync(dirname(path), { recursive: true })
    // "wx" = create-only; a racing writer loses instead of being clobbered.
    writeFileSync(path, content, { flag: "wx" })
  },
}

export type InitResult =
  | { status: "created"; path: string; ancestors: readonly string[] }
  | { status: "exists"; path: string; existing: string; ancestors: readonly string[] }
  | { status: "failed"; path: string; error: string }

/** First OpenCode config file present in `directory`, if any. */
export function existingProjectConfig(directory: string, io: InitIo = realIo): string | undefined {
  for (const file of PROJECT_CONFIG_FILES) {
    const path = join(directory, file)
    if (io.exists(path)) return path
  }
  return undefined
}

/**
 * Config files in parent directories. Discovery merges those in, so they are
 * reported as information; they never block creating this project's own stub.
 */
export function ancestorConfigs(directory: string, io: InitIo = realIo): string[] {
  const found: string[] = []
  let current = dirname(resolve(directory))
  while (true) {
    const hit = existingProjectConfig(current, io)
    if (hit !== undefined) found.push(hit)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return found
}

/** Create the stub unless the project already has an OpenCode config. */
export function initProjectConfig(directory: string, io: InitIo = realIo): InitResult {
  const root = resolve(directory)
  const target = join(root, TARGET_FILE)
  const ancestors = ancestorConfigs(root, io)
  const existing = existingProjectConfig(root, io)
  if (existing !== undefined) return { status: "exists", path: target, existing, ancestors }
  try {
    io.write(target, STUB_CONFIG)
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code
    if (code === "EEXIST") return { status: "exists", path: target, existing: target, ancestors }
    return { status: "failed", path: target, error: error instanceof Error ? error.message : String(error) }
  }
  return { status: "created", path: target, ancestors }
}

/** Tool-facing summary: one status line, then any ancestor notes. */
export function describeResult(result: InitResult): string {
  const ancestors = result.ancestors.map((path) => `info: ancestor config ${path} also merges into this project`)
  if (result.status === "created") return [`created: ${result.path}`, ...ancestors].join("\n")
  if (result.status === "exists") {
    const line =
      result.existing === result.path
        ? `skipped: ${result.path} already exists (nothing written)`
        : `skipped: ${result.existing} already exists (nothing written)`
    return [line, ...ancestors].join("\n")
  }
  return [`failed: could not create ${result.path}: ${result.error}`, ...ancestors].join("\n")
}
