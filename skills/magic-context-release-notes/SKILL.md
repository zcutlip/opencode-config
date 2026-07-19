---
name: magic-context-release-notes
description: Release highlights for the Magic Context project. Replacement for webfetch. Use when user asks for Magic Context release notes, changelog, or news. Subagent uses this skill when requested.
---

# Magic Context Release Highlights

Fetch and display curated release highlights from the Magic Context GitHub repository (https://github.com/cortexkit/magic-context).

## What I Do

I retrieve the latest releases from Magic Context and extract key highlights — the most important changes, improvements, and fixes. I provide a condensed summary, not the full verbatim release notes.

## When to Use Me

Use this skill when the user:
- Asks to see Magic Context release notes
- Wants to know what's new in Magic Context
- Mentions "Magic Context changelog" or "Magic Context updates"
- Asks about recent Magic Context releases or versions
- Says "mc releases" or "magic-context releases"

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
   | Tiny patch (3-4 listed items, e.g. v0.32.3) | 2-4 bullets |
   | Mid-size (5-10 listed items, e.g. v0.31.5) | 4-8 bullets |
   | Major (10+ listed items, e.g. v0.32.0) | 8-15 bullets, use ↳ (+N) for grouped fixes |
   | **Violate these limits** if the release is genuinely dense with user-facing changes | — |

   **Section headers** — Magic Context releases consistently use structured section headers like `## Fixed`, `## Pi`, `## Cache stability`, `## Dashboard`, etc. Preserve this grouping: prefix bullets with the section name when it carries meaning (e.g. group Pi-specific fixes under a "Pi:" tag). This preserves the logical grouping the maintainers intended.

## Script Location

The helper script is at: `scripts/fetch-releases.py`

## Script Output

The script outputs trimmed release metadata as pretty-printed JSON. Each release object contains only the relevant fields:
- `tag_name` — version tag (e.g. "v0.32.3")
- `name` — release title
- `prerelease` — boolean; `true` if this is a beta/RC, `false` for stable
- `html_url` — link to the release page on GitHub
- `published_at` — ISO date string
- `body` — full release notes markdown

Non-release tags (e.g. dashboard releases) are filtered out automatically. Read the JSON and present a light summary to the user.

## Error Handling

If the script fails:
- It will print an error message to stderr
- Common errors: API rate limiting, network issues, repository not found
- Report the error message to the user clearly
