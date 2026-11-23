// A9 — work-settle tracking. Pure state, no SDK imports, no timers.
//
// A turn can end while a background helper (child session) is still running
// the command a gate depends on; checkpoints that fire at turn end freeze
// evidence before the helper's result exists. The wiring in index.ts tracks
// child sessions from execution events and defers the observed session's
// automatic checkpoint until the last in-flight child settles (or a
// deadline passes). The deferred capture then sees the helper's posted
// result in the parent transcript.

export interface DeferState {
  inFlight: number
  blockedOn: string[]
}

export interface DeferRecord {
  childrenInFlight: number
  blockedOnPermission: boolean
  heldMs: number
}

export class WorkSettle {
  private readonly childrenOf = new Map<string, Set<string>>()
  private readonly parentOf = new Map<string, string>()
  // A16 — per-child pending-prompt text, set while the helper blocks on a
  // permission decision the user must answer.
  private readonly blocked = new Map<string, string>()

  /** Record a helper session as in flight for its parent. */
  trackChild(parentID: string, childID: string): void {
    let set = this.childrenOf.get(parentID)
    if (set === undefined) {
      set = new Set<string>()
      this.childrenOf.set(parentID, set)
    }
    set.add(childID)
    this.parentOf.set(childID, parentID)
  }

  /** A9 decision at parent turn completion: are helpers still in flight? */
  hasInFlight(parentID: string): boolean {
    return (this.childrenOf.get(parentID)?.size ?? 0) > 0
  }

  /**
   * A16 — the helper raised a permission prompt; name it for the badge and
   * return the parent whose checkpoint is now waiting on a user decision.
   * Unknown helpers are a no-op: only tracked children can block a defer.
   */
  childBlocked(childID: string, command: string): string | undefined {
    const parentID = this.parentOf.get(childID)
    if (parentID === undefined) return undefined
    this.blocked.set(childID, command)
    return parentID
  }

  /** A16 — the prompt was answered; return the parent that was blocked. */
  childUnblocked(childID: string): string | undefined {
    const parentID = this.parentOf.get(childID)
    if (parentID === undefined) return undefined
    this.blocked.delete(childID)
    return parentID
  }

  /** A16 — the defer facts for the badge and for a forced-capture record. */
  deferState(parentID: string): DeferState {
    const set = this.childrenOf.get(parentID)
    if (set === undefined) return { inFlight: 0, blockedOn: [] }
    const blockedOn: string[] = []
    for (const child of set) {
      const command = this.blocked.get(child)
      if (command !== undefined) blockedOn.push(command)
    }
    return { inFlight: set.size, blockedOn }
  }

  /**
   * Settle a finished helper. Returns the parent session ID when that was
   * the parent's last in-flight helper — the signal to run the deferred
   * checkpoint — and undefined otherwise. Unknown helpers are a no-op.
   */
  childSettled(childID: string): string | undefined {
    const parentID = this.parentOf.get(childID)
    if (parentID === undefined) return undefined
    this.blocked.delete(childID)
    this.parentOf.delete(childID)
    const set = this.childrenOf.get(parentID)
    if (set === undefined) return undefined
    set.delete(childID)
    if (set.size === 0) {
      this.childrenOf.delete(parentID)
      return parentID
    }
    return undefined
  }

  /** Drop all tracking for a parent (deadline force-run, or checkpoint done). */
  clear(parentID: string): void {
    for (const child of this.childrenOf.get(parentID) ?? []) {
      this.blocked.delete(child)
      this.parentOf.delete(child)
    }
    this.childrenOf.delete(parentID)
  }
}

/**
 * A16 — the forced-capture record: why a checkpoint ran before its evidence
 * settled. Carried into provenance and disclosed in the reviewer envelope,
 * so a hollow gate is named rather than reviewed as if it were complete.
 */
export function deferRecord(state: DeferState, heldMs: number): DeferRecord {
  return {
    childrenInFlight: state.inFlight,
    blockedOnPermission: state.blockedOn.length > 0,
    heldMs,
  }
}
