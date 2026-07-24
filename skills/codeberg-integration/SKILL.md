---
name: codeberg-integration
description: |
  Use when interacting with Codeberg repositories - viewing pull requests, issues, comments,
  reviews, or any Gitea/Forgejo-based forge API operations. Triggers on: Codeberg, Forgejo,
  Gitea API, pull request comments, code review on Codeberg.
---

# Codeberg Integration

## Overview

Interact with Codeberg (Forgejo/Gitea) repositories via the REST API. Authenticate with a personal access token stored in `CODEBERG_TOKEN` environment variable.

## Authentication Setup

1. Go to **Codeberg > Settings > Applications > Generate New Token**
2. Name the token descriptively (e.g. `claude-code`)
3. Select required permissions based on usage:
   - **Read-only:** `read:issue`, `read:repository`
   - **Write comments/issues:** `write:issue`
   - **Manage PRs:** `write:issue`, `read:repository`
   - **Manage labels/milestones:** `write:issue`
   - **Manage releases:** `write:repository`
4. Store securely:

```bash
# Add to shell profile (~/.zshrc or ~/.bashrc)
export CODEBERG_TOKEN="your-token-here"
```

**Note:** The `scripts/codeberg-helper.py` script reads the token from the `CODEBERG_TOKEN` environment variable automatically.

**Security rules:**
- NEVER hardcode tokens in skills, scripts, or committed files
- NEVER log or echo the token value
- Use `read:*` scopes unless write access is explicitly needed
- Rotate tokens periodically

## API Base

```
https://codeberg.org/api/v1
```

For self-hosted Forgejo/Gitea instances, replace `codeberg.org` with instance domain.

## Quick Reference

**Helper script:** Use `scripts/codeberg-helper.py` (requires `CODEBERG_TOKEN` env var)

```bash
# Basic usage
scripts/codeberg-helper.py get-repo <owner> <repo>
scripts/codeberg-helper.py list-prs <owner> <repo>
scripts/codeberg-helper.py get-pr <owner> <repo> <index>
scripts/codeberg-helper.py get-comments <owner> <repo> <index>
scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>

# Global options
scripts/codeberg-helper.py --raw <command> ...    # Output raw JSON (no pretty print)
scripts/codeberg-helper.py --dry-run <command> ... # Show what would be sent, don't execute
```

### Read Operations

| Operation | Endpoint |
|-----------|----------|
| Get repo info | `GET /repos/{owner}/{repo}` |
| List PRs | `GET /repos/{owner}/{repo}/pulls?state=open&limit=10` |
| Get single PR | `GET /repos/{owner}/{repo}/pulls/{index}` |
| PR diff | `GET /repos/{owner}/{repo}/pulls/{index}.diff` |
| PR comments | `GET /repos/{owner}/{repo}/issues/{index}/comments` |
| PR reviews | `GET /repos/{owner}/{repo}/pulls/{index}/reviews` |
| Review comments | `GET /repos/{owner}/{repo}/pulls/{index}/reviews/{id}/comments` |
| PR files changed | `GET /repos/{owner}/{repo}/pulls/{index}/files` |
| List issues | `GET /repos/{owner}/{repo}/issues?state=open&type=issues&limit=10` |
| Get issue | `GET /repos/{owner}/{repo}/issues/{index}` |
| Issue comments | `GET /repos/{owner}/{repo}/issues/{index}/comments` |
| Issue timeline | `GET /repos/{owner}/{repo}/issues/{index}/timeline` |
| List labels | `GET /repos/{owner}/{repo}/labels` |
| List milestones | `GET /repos/{owner}/{repo}/milestones` |
| Repo branches | `GET /repos/{owner}/{repo}/branches` |
| File contents | `GET /repos/{owner}/{repo}/raw/{filepath}?ref={branch}` |
| List releases | `GET /repos/{owner}/{repo}/releases` |
| List repo topics | `GET /repos/{owner}/{repo}/topics` |
| Search repos | `GET /repos/search?q={query}&limit=10` |
| User repos | `GET /users/{username}/repos` |
| Org repos | `GET /orgs/{org}/repos` |
| Commit history | `GET /repos/{owner}/{repo}/commits?limit=10` |
| Compare branches | `GET /repos/{owner}/{repo}/compare/{base}...{head}` |

### Write Operations

| Operation | Endpoint | Body |
|-----------|----------|------|
| Comment on issue/PR | `POST /repos/{owner}/{repo}/issues/{index}/comments` | `{"body":"..."}` |
| Create issue | `POST /repos/{owner}/{repo}/issues` | `{"title":"...","body":"..."}` |
| Edit issue | `PATCH /repos/{owner}/{repo}/issues/{index}` | `{"title":"...","body":"...","state":"open\|closed"}` |
| Edit comment | `PATCH /repos/{owner}/{repo}/issues/comments/{id}` | `{"body":"..."}` |
| Delete comment | `DELETE /repos/{owner}/{repo}/issues/comments/{id}` | -- |
| Add labels to issue | `POST /repos/{owner}/{repo}/issues/{index}/labels` | `{"labels":[1, 2]}` |
| | **Note:** Labels must be **integer IDs**, not names. Use `list-labels` to get IDs. | |
| Remove label | `DELETE /repos/{owner}/{repo}/issues/{index}/labels/{id}` | -- |
| Create label | `POST /repos/{owner}/{repo}/labels` | `{"name":"...","color":"#hex","description":"..."}` |
| Assign issue | `POST /repos/{owner}/{repo}/issues/{index}/assignees` | `{"assignees":["username"]}` |
| Submit PR review | `POST /repos/{owner}/{repo}/pulls/{index}/reviews` | `{"body":"...","event":"APPROVED\|REQUEST_CHANGES\|COMMENT"}` |
| Create PR | `POST /repos/{owner}/{repo}/pulls` | `{"title":"...","body":"...","head":"branch","base":"main"}` |
| Update PR | `PATCH /repos/{owner}/{repo}/pulls/{index}` | `{"title":"...","body":"..."}` |
| Merge PR | `POST /repos/{owner}/{repo}/pulls/{index}/merge` | `{"Do":"merge\|rebase\|squash","merge_message_field":"..."}` |
| Create release | `POST /repos/{owner}/{repo}/releases` | `{"tag_name":"v1.0","name":"...","body":"..."}` |
| Create milestone | `POST /repos/{owner}/{repo}/milestones` | `{"title":"...","description":"..."}` |
| Add topic | `PUT /repos/{owner}/{repo}/topics/{topic}` | -- |
| Star repo | `PUT /user/starred/{owner}/{repo}` | -- |

**Pagination:** Add `?page=1&limit=50` (max 50). Check `x-total-count` response header.

> **Note:** The API endpoints listed above are **fully functional NOW**.
> The helper script commands for these operations are what's planned for Phase 2.
> You can use these endpoints directly with curl or other HTTP clients today.

### JSON Payload Tips for curl

When creating issues/comments with complex markdown content, avoid inline JSON escaping issues:

**Don't do this:**
```bash
curl -X POST ... -d '{"title": "Issue", "body": "Line 1\nLine 2 with \"quotes\""}'
```

**Do this instead:**
```bash
# Write JSON to a file
cat > /tmp/payload.json << 'EOF'
{
  "title": "Issue Title",
  "body": "Line 1\nLine 2 with \"quotes\" and [links](http://example.com)"
}
EOF

# Use the file
curl -X POST \
  -H "Authorization: token $CODEBERG_TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/payload.json \
  https://codeberg.org/api/v1/repos/{owner}/{repo}/issues
```

This approach avoids shell escaping nightmares with newlines, quotes, and special characters.

## Helper Script Usage

The `codeberg-helper.py` script wraps common API operations, handling authentication and JSON output automatically. It reads the `CODEBERG_TOKEN` environment variable.

### Script Location

```bash
scripts/codeberg-helper.py  # From skills directory or project root
```

### Global Options

| Option | Description |
|--------|-------------|
| `--raw` | Output raw JSON (no pretty print) |
| `--dry-run` | Show what would be sent, don't execute (useful for write operations) |

### Available Commands (Phase 1 - Read Operations)

| Command | Description |
|---------|-------------|
| `get-repo <owner> <repo>` | Get repository information |
| `list-prs <owner> <repo> [--state {open,closed,all}] [--limit N]` | List PRs |
| `get-pr <owner> <repo> <index>` | Get single PR details |
| `get-pr-diff <owner> <repo> <index>` | Get PR diff text |
| `list-pr-files <owner> <repo> <index>` | List changed files in PR |
| `get-comments <owner> <repo> <index>` | Get all comments on PR/issue |
| `find-comment <owner> <repo> <index> <comment_id>` | Find specific comment by ID |
| `get-timeline <owner> <repo> <index>` | Get issue/PR timeline |
| `list-issues <owner> <repo> [--state {open,closed,all}] [--limit N]` | List issues |
| `get-issue <owner> <repo> <index>` | Get issue details |
| `list-labels <owner> <repo>` | List repository labels |
| `list-milestones <owner> <repo>` | List repository milestones |
| `get-file <owner> <repo> <path> [--ref <branch>]` | Get file contents |
| `list-commits <owner> <repo> [--limit N]` | List commits |
| `get-reviews <owner> <repo> <index>` | Get PR reviews |
| `get-review-comments <owner> <repo> <index> <review_id>` | Get inline comments on a review |
| `list-branches <owner> <repo>` | List repository branches |
| `list-releases <owner> <repo>` | List repository releases |

**Note:** Some endpoints in the Read Operations table are documented for reference but not implemented as script commands: topics, search, user-repos, org-repos, and compare. Use the API endpoint directly for these operations.

### Output Format

- **Success:** JSON to stdout (pretty-printed by default, use `--raw` for compact output)
- **Error:** JSON to stderr with error details
- **Exit codes:**
  - `0` - Success
  - `1` - General error
  - `2` - Authentication failed
  - `3` - Resource not found
  - `4` - Network error
  - `5` - Invalid arguments
  - `6` - Rate limit exceeded

## URL Parsing

Codeberg URLs follow this pattern:
```
https://codeberg.org/{owner}/{repo}/pulls/{index}#issuecomment-{comment_id}
https://codeberg.org/{owner}/{repo}/issues/{index}
```

To extract API parameters from a URL:
```bash
# From: https://codeberg.org/FoodiPedia/AllerScrapeApi/pulls/14#issuecomment-11087192
# owner=FoodiPedia  repo=AllerScrapeApi  index=14  comment_id=11087192
```

**Important:** `#issuecomment-{id}` URLs can refer to THREE different things:
1. Regular issue/PR comments → `/issues/{index}/comments`
2. Review body comments → `/pulls/{index}/reviews` (the review itself)
3. Inline review comments → `/pulls/{index}/reviews/{id}/comments`

To reliably find any `#issuecomment-{id}`, use the **find-comment** command which queries the timeline endpoint:
```bash
scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>
```
The timeline event's `type` field tells you what it is (`comment`, `review`, etc.).

## Usage Patterns

### Fetch all comments on a PR

```bash
scripts/codeberg-helper.py get-comments <owner> <repo> <index>
```

Note: PRs are a type of issue in Gitea/Forgejo, so use `/issues/{index}/comments` for conversation comments.

### Find a specific comment by ID (from `#issuecomment-{id}` URL)

```bash
scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>
```

This command uses the timeline endpoint to find any comment type (regular, review, inline). It returns the comment's type, author, date, and body.

### Get PR details

```bash
scripts/codeberg-helper.py get-pr <owner> <repo> <index>
```

### Get PR diff

```bash
scripts/codeberg-helper.py get-pr-diff <owner> <repo> <index>
```

### Get timeline

```bash
scripts/codeberg-helper.py get-timeline <owner> <repo> <index>
```

Returns all events (comments, reviews, status changes, etc.) for an issue or PR in chronological order.

### List PR files

```bash
scripts/codeberg-helper.py list-pr-files <owner> <repo> <index>
```

Lists all files changed in a PR with their status (added, modified, deleted) and additions/deletions counts.

### List PRs

```bash
scripts/codeberg-helper.py list-prs <owner> <repo> [--state {open,closed,all}]
# --state: open (default), closed, all
```

### List issues

```bash
scripts/codeberg-helper.py list-issues <owner> <repo> [--state {open,closed,all}]
# --state: open (default), closed, all
```

### Get issue details

```bash
scripts/codeberg-helper.py get-issue <owner> <repo> <index>
```

### Get file

```bash
scripts/codeberg-helper.py get-file <owner> <repo> <path> [--ref <branch>]
```

Gets the contents of a file in the repository. Use `--ref` to specify a branch (default: default branch).

### List commits

```bash
scripts/codeberg-helper.py list-commits <owner> <repo> [--limit N]
```

Lists commits for the repository. Use `--limit` to control the number of results (default: 10).

### Get PR reviews

```bash
scripts/codeberg-helper.py get-reviews <owner> <repo> <index>
```

Gets all reviews on a pull request. Each review contains the reviewer's feedback, comments, and approval status.

### Get inline review comments

```bash
scripts/codeberg-helper.py get-review-comments <owner> <repo> <index> <review_id>
```

Gets inline comments (file-specific comments) on a specific review. These are code review comments tied to specific lines of code.

### List branches

```bash
scripts/codeberg-helper.py list-branches <owner> <repo>
```

Lists all branches in the repository, including protected status and commit information.

### List releases

```bash
scripts/codeberg-helper.py list-releases <owner> <repo>
```

Lists all releases in the repository, including tag, name, and release notes.

### List labels

```bash
scripts/codeberg-helper.py list-labels <owner> <repo>
```

### List milestones

```bash
scripts/codeberg-helper.py list-milestones <owner> <repo>
```

### Get repository info

```bash
scripts/codeberg-helper.py get-repo <owner> <repo>
```

### Post a comment on a PR/issue

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `POST /repos/{owner}/{repo}/issues/{index}/comments`
- Body: `{"body":"Your comment text here"}`
- Use: `scripts/codeberg-helper.py post-comment <owner> <repo> <index> "<text>"` (Phase 2)

### Create an issue

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `POST /repos/{owner}/{repo}/issues`
- Body: `{"title":"...","body":"...","labels":[...]}`
- Use: `scripts/codeberg-helper.py create-issue <owner> <repo> "<title>" "<body>"` (Phase 2)

### Close or reopen an issue/PR

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `PATCH /repos/{owner}/{repo}/issues/{index}`
- Body: `{"state":"closed"}` or `{"state":"open"}`
- Use: `scripts/codeberg-helper.py close-issue` or `scripts/codeberg-helper.py reopen-issue` (Phase 2)

### Submit a PR review

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `POST /repos/{owner}/{repo}/pulls/{index}/reviews`
- Body: `{"body":"...","event":"APPROVED|REQUEST_CHANGES|COMMENT"}`
- Use: `scripts/codeberg-helper.py submit-review <owner> <repo> <index> <event> "<body>"` (Phase 2)

Valid `event` values: `APPROVED`, `REQUEST_CHANGES`, `COMMENT`

### Create a PR

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `POST /repos/{owner}/{repo}/pulls`
- Body: `{"title":"...","body":"...","head":"branch","base":"main"}`
- Use: `scripts/codeberg-helper.py create-pr <owner> <repo> "<title>" "<body>" <head> <base>` (Phase 2)

### Add labels to an issue/PR

**Coming in Phase 2.** First list labels to get IDs:
```bash
scripts/codeberg-helper.py list-labels <owner> <repo>
```
Then use: `scripts/codeberg-helper.py add-labels <owner> <repo> <index> <label_id,...>` (Phase 2)

### Merge a PR

**Coming in Phase 2.** Use the API endpoint table above for reference:
- `POST /repos/{owner}/{repo}/pulls/{index}/merge`
- Body: `{"Do":"merge|rebase|squash","merge_message_field":"..."}`
- Use: `scripts/codeberg-helper.py merge-pr <owner> <repo> <index> <style>` (Phase 2)

Valid `Do` values: `merge`, `rebase`, `squash`

## Common Mistakes

- **Assuming `#issuecomment-{id}` is always an issue comment** -- it can be a review event. Use `scripts/codeberg-helper.py find-comment` to find any comment by ID reliably
- Using `/pulls/{index}/comments` for conversation comments -- use `/issues/{index}/comments` instead
- **Looking only at `/issues/{index}/comments` for PR feedback** -- inline code review comments live under `/pulls/{index}/reviews/{id}/comments`, not the issues endpoint
- Forgetting that PR index and issue index share the same namespace
- Not handling pagination for repos with many comments (default limit is 30)
- Using session cookies instead of API tokens (insecure, fragile, expires)
- **Forgetting `CODEBERG_TOKEN` environment variable** -- the script requires this. Ensure it's exported before running commands
- **Forgetting `--dry-run` for write operations** -- use this flag to preview what will be sent before executing (Phase 2)
- Using positional arguments for optional parameters (e.g., `list-issues owner repo all`) instead of flags (e.g., `list-issues owner repo --state all`)

## Response Fields (Comment Object)

Key fields in a comment response:
- `id` - Comment ID (matches `#issuecomment-{id}` in URLs)
- `body` - Markdown content
- `user.login` - Author username
- `user.full_name` - Author display name
- `created_at` / `updated_at` - Timestamps
- `html_url` - Direct link to comment on web UI
- `assets` - Attached files
