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

3. **Produce a structured summary** — condense the release notes for the user using these rules:

   **Output format** — one block per release:
   ```
   **vX.Y.Z** (YYYY-MM-DD) — one-sentence theme of this release
   - New: feature or improvement
   - Fixed: user-facing bugfix
   - Changed: behavior change, config change, deprecation
   ↳ (+N more fixes)  ← when there are more than fit comfortably
   ```

   **Trim rules:**
   - **Keep**: user-facing features, behavior changes, breaking changes, config changes, security fixes, performance improvements with measurable impact
   - **Skip**: CI/tooling tweaks, dependency bumps with no user impact, internal refactors that don't change behavior, typo fixes in comments/docs, test-only changes, "under the hood" / "Internal" sections that contain no material facts
   - **When unsure, include it** — better slightly verbose than silently dropped

   **Proportionality** — scale output to release density, not context window size:
   | Release type | Bullet count |
   |---|---|
   | Tiny patch (3-4 listed items) | 2-4 bullets |
   | Mid-size (5-10 listed items) | 4-8 bullets |
   | Major (10+ listed items) | 8-15 bullets, use ↳ (+N) for grouped fixes |
   | **Violate these limits** if the release is genuinely dense with user-facing changes | — |

## Script Location

The helper script is at: `scripts/fetch-releases.py`

## Script Output

The script outputs trimmed release metadata as pretty-printed JSON. Each release object contains only the relevant fields:
- `tag_name` — version tag (e.g. "v1.17.13")
- `name` — release title
- `prerelease` — boolean; `true` if this is a beta/RC, `false` for stable
- `html_url` — link to the release page on GitHub
- `published_at` — ISO date string
- `body` — full release notes markdown

Non-release tags (e.g. PR artifacts) are filtered out automatically. Read the JSON and present a light summary to the user.

## Error Handling

If the script fails:
- It will print an error message to stderr
- Common errors: API rate limiting, network issues, repository not found
- Report the error message to the user clearly
