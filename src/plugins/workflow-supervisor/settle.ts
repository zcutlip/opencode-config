// A9 — work-settle tracking. Pure state, no SDK imports, no timers.
//
// A turn can end while a background helper (child session) is still running
// the command a gate depends on; checkpoints that fire at turn end freeze
// evidence before the helper's result exists. The wiring in index.ts tracks
// child sessions from execution events and defers the observed session's
// automatic checkpoint until the last in-flight child settles (or a
// deadline passes). The deferred capture then sees the helper's posted
// result in the parent transcript.

export class WorkSettle {
  private readonly childrenOf = new Map<string, Set<string>>()
  private readonly parentOf = new Map<string, string>()

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
   * Settle a finished helper. Returns the parent session ID when that was
   * the parent's last in-flight helper — the signal to run the deferred
   * checkpoint — and undefined otherwise. Unknown helpers are a no-op.
   */
  childSettled(childID: string): string | undefined {
    const parentID = this.parentOf.get(childID)
    if (parentID === undefined) return undefined
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
      this.parentOf.delete(child)
    }
    this.childrenOf.delete(parentID)
  }
}
