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

1. **Run the helper script**
   - Execute: `scripts/fetch-releases.py [--count N]`
   - Never:
      - `python3 ./scripts/...`
      - `python3 -c`
      - `bash -c`
   - Default is 5 releases; use `--count` flag if user requests a different number
   - The script is executable and has a proper shebang line

2. **Display the output**
   - Very lightly summarize the output without losing meaning. Just filter out some of the noise
   - The script handles all API interaction, parsing, and formatting

## Script Location

The helper script is at: `scripts/fetch-releases.py`

## Output Format

The script produces markdown with curated highlights:

```
# OpenCode Release Highlights

## vX.Y.Z (Month DD, YYYY)
- Key highlight 1
- Key highlight 2
- Key highlight 3

---

## vX.Y.Z (Month DD, YYYY)
- Key highlight 1
- Key highlight 2
```

## Error Handling

If the script fails:
- It will print an error message to stderr
- Common errors: API rate limiting, network issues, repository not found
- Report the error message to the user clearly
