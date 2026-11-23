# project-config

Creates a project-local `.opencode/opencode.jsonc` stub, once, in whatever
project the session is in. The file is inert scaffolding — `$schema`,
fill-in prompts for `model` / `default_agent`, and empty containers for
`agents`, `commands`, `permissions`, `plugins`, `providers`, `references`,
and `mcp.servers` — so nothing changes behavior until it is filled in.

## Usage

- `/init-config` — registered by the plugin itself (`ctx.command.transform`),
  so there is no command-file template and no discovery step. It writes, posts
  the result as a synthetic message (visible in the transcript), and emits a
  `configInit` event that the TUI part shows as a toast — created (success),
  skipped (info), or failed (error), naming the file it touched. No model turn.
- Or call the `project_config_init` tool directly; its result comes back to
  the model, which is already in a turn.
- `created: …` — the stub was written at that path.
- `skipped: … already exists (nothing written)` — the project already has an
  OpenCode config; the tool never touches an existing file.
- `info: ancestor config …` — a config in a parent directory also merges in.
  It is reported only; it does not block creation.

## Semantics

- **Create-only.** The existence check covers `opencode.json`,
  `opencode.jsonc`, `.opencode/opencode.jsonc`, and `.opencode/opencode.json`
  in the project itself. Any hit means no write, so a project that already
  has a direct config is never given a `.opencode` one that would override
  its keys.
- The final write uses `wx` (create-only) as well, so a file appearing between
  the check and the write loses the race rather than being clobbered.
- **Target is the session's project**, from
  `session.location.directory` with `ctx.location.directory` as fallback —
  not the server's cwd, so it is right in every window and worktree.
- No permission assert: the tool writes one fixed template at one fixed path
  and cannot write anything else, so it does not go through the `edit` fence
  that guards `.opencode/opencode.jsonc` against agent edits.
- Idempotent — a second run is a no-op skip.

## Checking it by hand

1. In a project with no OpenCode config, run `/init-config` and confirm the
   stub appears at `.opencode/opencode.jsonc` (and OpenCode reloads from it).
2. Run it again: `skipped:` naming that same file, mtime unchanged.
3. In a project that has a root `opencode.json`, run it: `skipped:` naming the
   root file, and no `.opencode/` config is created.

`bun test src/plugins/project-config` covers the decision logic against an
in-memory filesystem (delegate to the test agent).
