// Pure mode resolution for the auto-approve TUI plugin. No SDK imports, so
// bun:test runs it headless.

export type PermissionMode = "prompt" | "autoaccept"

/** Runtime overrides keyed by root session ID. Never persisted. */
export type Overrides = Readonly<Record<string, PermissionMode>>

export type ModeInput = {
  /** The session making the request, or being rendered. */
  sessionID: string
  /** The root (top-level) session of that tab; may equal `sessionID`. */
  rootID: string
  overrides: Overrides
  /** The configured starting mode (cli.json `session.permissions`). */
  defaultMode: PermissionMode
}

/**
 * A session's effective mode: its own override, else its root's override
 * (auto-approve propagates down to subagents), else the configured default.
 */
export function effectiveMode(input: ModeInput): PermissionMode {
  return input.overrides[input.sessionID] ?? input.overrides[input.rootID] ?? input.defaultMode
}

/** Toggle target: the inverse of the current mode. */
export function toggledMode(current: PermissionMode): PermissionMode {
  return current === "autoaccept" ? "prompt" : "autoaccept"
}

/**
 * Normalizes an unknown configured value to the documented default ("prompt")
 * — the safe direction: unknown means ask.
 */
export function normalizeMode(value: unknown): PermissionMode {
  return value === "autoaccept" ? "autoaccept" : "prompt"
}
