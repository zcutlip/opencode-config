import { Plugin } from "@opencode/plugin/tui"

// session-history — per-session prompt recall for the TUI composer.
//
// The built-in prompt history is one global 50-entry stack
// (~/.local/state/opencode/prompt-history.jsonl), so up-arrow in an idle
// session walks prompts typed in every other session and project.
//
// This plugin shadows `prompt.history.previous`/`next` (priority 10 beats the
// built-in layer's priority 1) and recalls from the current session's own user
// messages instead. Outside the composer it returns `false` — "rejected",
// continue dispatch — so dialogs, the session list, and the transcript keep
// their built-in keys.
//
// While the composer is focused it consumes ↑/↓, including caret movement
// inside a typed draft: a rejected key falls through to `session.parent` /
// `session.child.first`, so down mid-recall would open the subagent picker
// instead of stepping back. The one exception is ↓ at the draft position
// (nothing recalled): there the key is released, so the subagent picker and
// whatever else owns ↓ behaves exactly as it does without this plugin.
//
// Two host details are load-bearing and not part of the plugin API (the docs
// expose no composer access at all):
//   - the composer is the focused renderable under an ancestor with
//     `id === "session-pane"`
//   - that renderable exposes OpenTUI's TextareaRenderable surface
//     (`plainText`, `setText`, `cursorOffset`)
// Both are verified on 2.2.5 and can change in any release. If recall silently
// stops working after an OpenCode upgrade, re-probe those two assumptions
// before assuming the plugin logic broke.
//
// Recall restores text only: @file/@agent mention metadata lives in host
// extmarks that a plugin cannot re-create, so a recalled prompt containing
// mentions submits as plain text.

const HISTORY_LIMIT = 50
const COMPOSER_ANCESTOR_ID = "session-pane"

type Composer = {
  plainText: string
  setText: (text: string) => void
  cursorOffset: number
  isDestroyed?: boolean
  moveCursorUp?: () => void
  moveCursorDown?: () => void
}

type Cursor = { index: number; entry: string }

export default Plugin.define({
  id: "local.session-history",
  setup(context) {
    const cursors = new Map<string, Cursor>()

    /** The session composer, or undefined when focus is anywhere else. */
    function composer(): Composer | undefined {
      const renderable = context.renderer?.currentFocusedRenderable as
        | (Composer & { id?: string; parent?: unknown })
        | undefined
      if (!renderable || typeof renderable.plainText !== "string") return
      if (typeof renderable.setText !== "function") return
      let node = renderable as { id?: string; parent?: unknown } | undefined
      for (let depth = 0; node && depth < 20; depth += 1) {
        if (node.id === COMPOSER_ANCESTOR_ID) return renderable
        node = node.parent as { id?: string; parent?: unknown } | undefined
      }
      return
    }

    /** This session's own submitted prompts, oldest first. */
    function entries(sessionID: string): string[] {
      const messages = context.data.session.message.list(sessionID) ?? []
      const texts: string[] = []
      for (const message of messages) {
        if (message?.type !== "user") continue
        const text = typeof message.text === "string" ? message.text.trim() : ""
        if (!text) continue
        if (texts.at(-1) === text) continue
        texts.push(text)
      }
      return texts.slice(-HISTORY_LIMIT)
    }

    /**
     * Move `direction` steps through the current session's history.
     * Returns false only when the key belongs to someone else.
     */
    function recall(direction: 1 | -1): boolean | undefined {
      const target = composer()
      if (!target) return false
      const sessionID = context.ui.router.current()?.sessionID
      if (!sessionID) return false

      const history = entries(sessionID)
      // Transcript not loaded in this process yet (first keypress after a
      // restart, before the session view synced): load it, then replay the key.
      // ↓ has nothing to step down through in that state, so it is released
      // straight away instead of waiting on a sync that cannot change it.
      if (history.length === 0) {
        if (direction === -1) return false
        void context.data.session.message
          .sync(sessionID)
          .then(() => {
            if (target.isDestroyed || target.plainText.length > 0) return
            step(target, sessionID, direction, entries(sessionID))
          })
          .catch(() => {})
        return
      }
      return step(target, sessionID, direction, history)
    }

    /** Apply one history step; `undefined` means the key was consumed. */
    function step(
      target: Composer,
      sessionID: string,
      direction: 1 | -1,
      history: string[],
    ): boolean | undefined {
      const cursor = cursors.get(sessionID) ?? { index: 0, entry: "" }
      const text = target.plainText
      const recalled = text.length > 0 && text === cursor.entry

      // A draft the user typed (or edited after a recall) is never replaced:
      // the arrows move the caret and the key is consumed here, because falling
      // through would land on session.parent / session.child.first and open a
      // menu instead of doing nothing.
      if (!recalled && text.length > 0) {
        const multiLine = text.includes("\n")
        if (direction === 1) {
          if (multiLine && typeof target.moveCursorUp === "function") target.moveCursorUp()
          else target.cursorOffset = 0
        } else if (multiLine && typeof target.moveCursorDown === "function") {
          target.moveCursorDown()
        } else {
          target.cursorOffset = text.length
        }
        return
      }

      // Cleared or submitted since the last recall: the draft is current again.
      if (text.length === 0 && cursor.index !== 0) {
        cursor.index = 0
        cursor.entry = ""
        cursors.set(sessionID, cursor)
      }

      // No history in this session yet: ↑ is consumed so it cannot reach the
      // global stack; ↓ keeps its normal meaning.
      if (history.length === 0) {
        if (direction === -1) return false
        cursors.set(sessionID, cursor)
        return
      }

      const index = cursor.index + direction
      if (index < 0) {
        // Back at the draft position: ↓ is no longer ours. Releasing it lets
        // the keymap do whatever it normally does (in the session composer
        // that is the subagent picker).
        cursors.set(sessionID, cursor)
        return false
      }
      if (index > history.length) {
        cursors.set(sessionID, cursor)
        return
      }
      const entry = index === 0 ? "" : (history[history.length - index] ?? "")
      target.setText(entry)
      target.cursorOffset = target.plainText.length
      cursors.set(sessionID, { index, entry })
      return true
    }

    context.keymap.layer(() => ({
      priority: 10,
      commands: [
        {
          id: "local.session-history.previous",
          title: "Previous prompt (this session)",
          group: "Prompt",
          bind: "up",
          run: () => recall(1),
        },
        {
          id: "local.session-history.next",
          title: "Next prompt (this session)",
          group: "Prompt",
          bind: "down",
          run: () => recall(-1),
        },
      ],
    }))
  },
})
