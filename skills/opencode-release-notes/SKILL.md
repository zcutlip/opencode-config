---
name: opencode-release-notes
description: Release hightlights for the opencode project. Replacement for webfetch. Use when user asks for opencode release notes or news. Subagent to uses this skill when if requested.
---

# OpenCode Release Highlights

Fetch and display curated release highlights from the OpenCode GitHub repository.

## What I Do

I retrieve the latest releases from the OpenCode project (https://github.com/anomalyco/opencode) and extract key highlights — the most important changes, improvements, and fixes. I provide a condensed summary, not the full verbatim release notes.

## When to Use Me

Use this skill when the user:
- Asks to see OpenCode release notes
- Wants to know what's new in OpenCode
- Mentions "OpenCode changelog" or "OpenCode updates"
- Asks about recent OpenCode releases or versions

## Workflow

1. **Run the helper script** to get release data as JSON
   - Execute: `scripts/fetch-releases.py [--count N]` for latest releases
   - Or: `scripts/fetch-releases.py --tag vX.Y.Z` for a specific release
   - Never: `python3 ./scripts/...`, `python3 -c`, or `bash -c`
   - The script is executable with a proper shebang — run it directly
   - Default is 5 releases; use `--count` flag if user requests a different number

2. **Read the JSON output** — the script outputs the raw GitHub API response as pretty-printed JSON

3. **Do a light summary** — condense the release notes for the user:
   - Highlight new features and major bugfixes
   - Condense/filter out noise from trivial or repetitive bugfixes
   - Keep it concise — a few bullet points per release is plenty
   - Don't lose the substance — just trim the fat

## Script Location

The helper script is at: `scripts/fetch-releases.py`

## Script Output

The script outputs the raw GitHub API response as pretty-printed JSON. Each release object contains:
- `tag_name` — version tag (e.g. "v1.17.13")
- `published_at` — ISO date string
- `body` — full release notes markdown
- Other metadata (URLs, author, etc.)

Read the JSON, extract what you need, and present a light summary to the user.

## Error Handling

If the script fails:
- It will print an error message to stderr
- Common errors: API rate limiting, network issues, repository not found
- Report the error message to the user clearly
