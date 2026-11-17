import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"

export const workflowModes = ["off", "advisory", "steer", "enforce"] as const
export type WorkflowMode = (typeof workflowModes)[number]

export interface WorkflowPolicy {
  enabled: boolean
  mode: WorkflowMode
  workflow?: string
  version?: number
  contract?: string
}

export interface RepositoryResolution {
  worktree: string
  mainRepository: string
}

export interface ResolvedWorkflowPolicy {
  active: true
  worktree: string
  mainRepository: string
  requestedMode: Exclude<WorkflowMode, "off">
  effectiveMode: "advisory"
  policy: WorkflowPolicy
  contractPath: string
  contractContent: string
}

export class PolicyError extends Error {
  readonly code: string
  readonly fingerprint: string

  constructor(code: string, message: string, options: { fingerprint?: string } = {}) {
    super(message)
    this.name = "PolicyError"
    this.code = code
    this.fingerprint = options.fingerprint ?? fingerprint(code, message)
  }
}

function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex")
}

function policyError(code: string, message: string, source: string): PolicyError {
  return new PolicyError(code, message, { fingerprint: fingerprint(code, message, source) })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Strip JSONC comments and trailing commas without touching string contents. */
export function normalizeJsonc(source: string): string {
  let text = ""
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (lineComment) {
      if (char === "\n") {
        lineComment = false
        text += char
      } else {
        text += " "
      }
      continue
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false
        text += "  "
        index += 1
      } else {
        text += char === "\n" ? "\n" : " "
      }
      continue
    }

    if (inString) {
      text += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      text += char
      continue
    }

    if (char === "/" && next === "/") {
      lineComment = true
      text += "  "
      index += 1
      continue
    }

    if (char === "/" && next === "*") {
      blockComment = true
      text += "  "
      index += 1
      continue
    }

    text += char
  }

  let result = ""
  inString = false
  escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === ",") {
      let lookahead = index + 1
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1
      if (text[lookahead] === "}" || text[lookahead] === "]") continue
    }
    result += char
  }
  return result
}

export function parseWorkflowPolicy(contents: string): WorkflowPolicy {
  let parsed: unknown
  try {
    parsed = JSON.parse(normalizeJsonc(contents))
  } catch (error) {
    throw policyError("invalid_jsonc", `Malformed workflow policy: ${(error as Error).message}`, contents)
  }

  if (!isRecord(parsed)) throw policyError("invalid_policy", "Workflow policy must be an object", contents)

  const allowed = new Set(["enabled", "mode", "workflow", "version", "contract"])
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) throw policyError("invalid_policy", `Unknown policy field: ${key}`, contents)
  }

  if (typeof parsed.enabled !== "boolean") {
    throw policyError("invalid_policy", "Policy field enabled must be a boolean", contents)
  }
  if (typeof parsed.mode !== "string" || !workflowModes.includes(parsed.mode as WorkflowMode)) {
    throw policyError("invalid_policy", "Policy field mode must be off, advisory, steer, or enforce", contents)
  }

  const enabled = parsed.enabled
  const mode = parsed.mode as WorkflowMode
  if (!enabled || mode === "off") return { enabled, mode }

  if (typeof parsed.workflow !== "string" || parsed.workflow.trim() === "") {
    throw policyError("invalid_policy", "Policy field workflow must be a nonempty string", contents)
  }
  if (!Number.isInteger(parsed.version) || parsed.version !== 1) {
    throw policyError("invalid_policy", "Policy field version must be the integer 1", contents)
  }
  if (typeof parsed.contract !== "string" || parsed.contract.trim() === "") {
    throw policyError("invalid_policy", "Policy field contract must be a nonempty string", contents)
  }
  if (parsed.contract.includes("\0") || isAbsolute(parsed.contract)) {
    throw policyError("invalid_policy", "Policy contract must be a relative path", contents)
  }
  if (parsed.contract.split(/[\\/]+/).includes("..")) {
    throw policyError("invalid_policy", "Policy contract must stay within the worktree", contents)
  }

  return {
    enabled,
    mode,
    workflow: parsed.workflow,
    version: parsed.version,
    contract: parsed.contract,
  }
}

export async function resolveRepository(directory: string): Promise<RepositoryResolution> {
  const worktree = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (worktree.exitCode !== 0) {
    const detail = worktree.stderr.toString().trim()
    throw policyError("repository_resolution", `Unable to resolve worktree: ${detail}`, directory)
  }

  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: directory,
    stdout: "pipe",
    stderr: "pipe",
  })
  if (common.exitCode !== 0) {
    const detail = common.stderr.toString().trim()
    throw policyError("repository_resolution", `Unable to resolve main repository: ${detail}`, directory)
  }

  return {
    worktree: worktree.stdout.toString().trim(),
    mainRepository: dirname(common.stdout.toString().trim()),
  }
}

function contained(worktree: string, candidate: string): boolean {
  const path = relative(worktree, candidate)
  return path === "" || (!path.startsWith("..") && !isAbsolute(path))
}

export async function resolveWorkflowPolicy(
  directory: string,
  options: { resolveRepository?: (directory: string) => Promise<RepositoryResolution> } = {},
): Promise<ResolvedWorkflowPolicy | null> {
  let repository: RepositoryResolution
  try {
    repository = await (options.resolveRepository ?? resolveRepository)(directory)
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw policyError("repository_resolution", (error as Error).message, directory)
  }

  const policyPath = join(repository.mainRepository, ".opencode/workflow.jsonc")
  let contents: string
  try {
    contents = await readFile(policyPath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw policyError("policy_read", `Unable to read ${policyPath}: ${(error as Error).message}`, policyPath)
  }

  const policy = parseWorkflowPolicy(contents)
  if (!policy.enabled || policy.mode === "off") return null

  const contractPath = resolve(repository.worktree, policy.contract as string)
  if (!contained(repository.worktree, contractPath)) {
    throw policyError("invalid_contract", "Contract path escapes the worktree", contractPath)
  }

  let contractContent: string
  try {
    contractContent = await readFile(contractPath, "utf8")
  } catch (error) {
    throw policyError("invalid_contract", `Unable to read contract ${contractPath}: ${(error as Error).message}`, contractPath)
  }

  return {
    active: true,
    worktree: repository.worktree,
    mainRepository: repository.mainRepository,
    requestedMode: policy.mode as Exclude<WorkflowMode, "off">,
    effectiveMode: "advisory",
    policy,
    contractPath,
    contractContent,
  }
}
