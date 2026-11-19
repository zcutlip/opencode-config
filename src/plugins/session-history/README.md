# session-history

Per-session ↑/↓ prompt recall for the TUI composer. The built-in history is
one global 50-entry stack (`~/.local/state/opencode/prompt-history.jsonl`)
shared by every session and every project, so ↑ in an idle session walked
prompts typed anywhere else. This plugin recalls only from the focused
session's own transcript.

## Usage

- `↑` walks back through this session's prompts (newest first), `↓` walks
  forward and returns to the empty draft at the bottom.
- A draft you typed is never replaced: with text in the composer the arrows
  move the caret instead — line by line on a multi-line draft, to start/end on
  a single-line one.
- `↓` at the draft position is handed back to whatever normally owns it, so
  the subagent picker still opens exactly as it does without the plugin.
- Outside the composer both keys are untouched: dialogs, the session list, and
  the transcript keep their built-in bindings.
- The window is the 50 most recent prompts of the session, matching the
  built-in cap. Consecutive duplicates collapse to one entry.

## Semantics

- History is the focused session's user messages, read from
  `data.session.message.list(sessionID)` (rows of type `user` with a non-empty
  `text`). The plugin stores no history of its own — a new session starts
  empty, and recall after a restart reads the same transcript.
- The transcript lives in `~/.local/share/opencode/opencode.db`
  (`session_message`, prompt text inline in `data.text`), so history survives
  quitting, rebooting, and resuming. Only the position within the stack is
  per-process, and it starts at the draft.
- No reads at setup and no polling: the message store is an in-memory array, so
  a keypress costs a filter over already-loaded messages. The one exception is
  a session whose transcript has not been loaded in this process yet — then
  `↑` on an empty composer syncs it once and replays the key, `↑` on a draft
  just moves the caret, and `↓` is released immediately (there is nothing
  below the draft to step to).
- Recall restores **text only**. `@file` / `@agent` mention metadata lives in
  host extmarks that a plugin cannot re-create, so a recalled prompt containing
  mentions submits as plain text.

## How it works

- Two commands, `local.session-history.previous` / `.next`, are registered in a
  keymap layer at priority 10; the built-in layer is priority 1 and layers sort
  priority-descending, so this layer wins the `↑`/`↓` binding.
- A command's `run()` returning `false` means "rejected — continue dispatch",
  and `undefined` means "consumed". That distinction is load-bearing:
  - rejected mid-recall would fall through to `session.parent` (↑) or
    `session.child.first` (↓), which is how ↓ used to open the subagent picker
    instead of stepping back;
  - so the plugin consumes both keys while the composer is focused, except at
    the draft position where ↓ is deliberately released;
  - ↑ at the oldest entry is consumed rather than released, because releasing
    it would jump to the parent session.
- The composer is reached through `renderer.currentFocusedRenderable`, accepted
  only when it sits under an ancestor with `id === "session-pane"` and exposes
  OpenTUI's `TextareaRenderable` surface (`plainText`, `setText`,
  `cursorOffset`, optional `moveCursorUp`/`moveCursorDown`).

## Fragility notes

The plugin depends on undocumented internals — functionality that works today
but is not part of the plugin API, so OpenCode can change it in any release
without a breaking-change note:

- **Composer access.** The plugin API exposes no composer surface at all
  (`context.ui` is only dialog/toast/format/router/panel/tabs/model/slot); the
  focused renderable and its ancestor chain are host internals.
- **`session-pane` ancestor id**, and the `TextareaRenderable` members above.
- **Keymap fall-through order.** The ↓ release relies on the built-in
  `prompt.history.next` rejecting an empty composer and the key then reaching
  `session.child.first`.

Verified on 2.3.0 (2026-11-17): composer found under `session-pane`, both
commands registered, ↑ recalled the newest prompt, ↓ returned to an empty
draft, and ↓ at the draft position opened the subagent picker. If recall
silently stops working after an upgrade, re-probe those three assumptions
before assuming the recall logic broke.

## Checking it by hand

No test suite — the behaviour is keymap dispatch inside a live TUI. After an
upgrade, open a session with at least two prompts and check four things:

1. ↑ steps back through that session's prompts only, ↓ returns to the empty
   draft.
2. With text typed, ↑/↓ move the caret and leave the text alone.
3. From the empty draft, ↓ opens the subagent picker (and `escape` closes it) —
   the key must still reach its normal owner.
4. In a brand-new session, ↑ does nothing and ↓ still opens the picker.
