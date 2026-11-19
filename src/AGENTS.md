# Global Agent Instructions

## Denied Shell Commands

- Denials are configured in `src/opencode.jsonc` — global `permissions` plus
  per-agent `agents.<id>.permissions`. This file documents them; it does not
  change them.
- A denial is evaluated per command segment and kills the entire compound
  call: in `cmd1 && echo "====" && cmd2`, one denied segment aborts the whole
  thing even when the others are allowlisted. Split the call and resubmit
  only the surviving segments.
- When a call is denied, the denied segment is the cause — resubmit the rest
  without it, rather than retrying the compound as-is.

### Denied for every agent

- Shell redirects (`> file`, `>> file`) — write through the edit tool, which
  shows a reviewable diff. Collateral: an allowlisted command whose *args*
  contain `> ` or `>>` (a grep pattern) dies too — glob cannot see quoting.
- `sed`, `perl`, `awk` — in-place editing the edit tool covers.
- Editing `opencode.json*`, `cli.json`, `service.json`, and agent `.md`
  files in `agents/`, `agent/`, `mode/`, `modes/` — the config fence (this
  repo's root `opencode.jsonc` carves out the exception).

### Denied for specific agents

- build: `echo` — hard to audit, so it is not preapproved. Never use it as a
  separator or banner (`cmd && echo "====" && cmd`): the denied segment
  aborts the whole compound, so the other segments lose too. Split into
  separate calls.
- explore: file edits
- test: file reads and edits (shell is the whole job)
- workflow-reviewer: everything except `read`, `glob`, `grep`
- commit: everything except an explicit git/read allowlist; `git commit` asks

### Deny rules match whole command strings

- A deny rule for a bare literal (`"echo"`) matches only that exact string —
  `echo "EXIT_STATUS=$?"` is a different string, misses the deny, and falls
  through to the ask gate. To deny a command with arguments, write the
  trailing wildcard (`"echo *"`) — that form also matches the bare command.
- An agent's deny rules do not apply to other agents: each agent carries its
  own fence. A rule in one agent's `permissions` cannot deny for another.
- A compound command (`cmd1; cmd2`) is checked as separate resources, and
  the whole call takes the strongest outcome: any deny denies, else any ask
  asks.

### Ask-gated, not denied

- Any other shell command falls through to the global ask gate and prompts
  the user — that is a normal approval, not a policy failure.

## Test Execution

- When a task calls for running tests, delegate to the **test subagent**
  with the project's test command — do not run tests yourself.
- Pass the command in plain form from the project root
  (e.g. `./scripts/run-tests.sh -q`): agents already run there, and plain
  forms match permission allowlists — compound `cd <path> && ...` wrappers
  cannot be preapproved and will prompt every time.
