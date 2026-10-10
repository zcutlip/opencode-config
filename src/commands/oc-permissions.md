---
description: List and remove opencode's saved ("always allow") permissions
---

Manage opencode's saved permissions with the oc-permissions tool:

    /Users/zach/.config/opencode/scripts/oc-permissions.py $ARGUMENTS

An empty argument string means run it bare: the default view — saved rules in
effect for this session's project, plus global.

Present the tool's output faithfully — the table, notices, and warnings are
the deliverable, not material to summarize away.

Removals always go through the gate, in this order:

1. Identify the rule (the user gives a number, an ID, or a description; map
   a description to its number or ID yourself, showing the current table if
   needed).
2. Show the user exactly which rule will be removed and get their explicit
   go-ahead in this conversation.
3. Only then run the tool with `remove <number-or-id> --yes`.

Never pass `--yes` without the user's spoken go-ahead in this conversation.
If $ARGUMENTS is already a removal request, do not run it verbatim — follow
the gate above instead. The tool refuses non-interactive removals without
`--yes` by design; that refusal is the gate working, not a failure.

Scope: this manages only the saved ("always allow") store. Deliberate
permission rules belong in `opencode.jsonc` `permissions` — point the user
there if they want to allow something on purpose.
