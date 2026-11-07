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

**Note:** The `{BASE_DIRECTORY}/scripts/codeberg-helper.py` script reads the token from the `CODEBERG_TOKEN` environment variable automatically.

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

**Helper script:** Use `{BASE_DIRECTORY}/scripts/codeberg-helper.py` (requires `CODEBERG_TOKEN` env var)

```bash
# Basic usage
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-repo <owner> <repo>
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-prs <owner> <repo>
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-pr <owner> <repo> <index>
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-comments <owner> <repo> <index>
{BASE_DIRECTORY}/scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>

# Global options
{BASE_DIRECTORY}/scripts/codeberg-helper.py --raw <command> ...    # Output raw JSON (no pretty print)
{BASE_DIRECTORY}/scripts/codeberg-helper.py --dry-run <command> ... # Show what would be sent, don't execute
```

## Helper Script Usage

The `codeberg-helper.py` script wraps common API operations, handling authentication and JSON output automatically. It reads the `CODEBERG_TOKEN` environment variable.

### Script Location

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py  # From skills directory or project root
```

### Global Options

| Option | Description |
|--------|-------------|
| `--raw` | Output raw JSON (no pretty print) |
| `--dry-run` | Show what would be sent, don't execute (useful for write operations) |

### Available Commands

#### Read Operations

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

#### Write Operations

| Command | Description |
|---------|-------------|
| `post-comment <owner> <repo> <index> "<body>"` | Post a comment on an issue or PR |
| `create-issue <owner> <repo> "<title>" "<body>" [--labels 1,2,3]` | Create a new issue (labels optional) |
| `close-issue <owner> <repo> <index>` | Close an issue or PR |
| `reopen-issue <owner> <repo> <index>` | Reopen an issue or PR |
| `add-labels <owner> <repo> <index> <id1,id2,...>` | Add labels to an issue or PR (use numeric IDs) |
| `submit-review <owner> <repo> <index> <event> "<body>"` | Submit a PR review (event: APPROVED\|REQUEST_CHANGES\|COMMENT) |
| `create-pr <owner> <repo> "<title>" "<body>" <head> <base>` | Create a new pull request |
| `merge-pr <owner> <repo> <index> [--style merge\|rebase\|squash] [--yes]` | Merge a pull request (requires --yes flag) |

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
{BASE_DIRECTORY}/scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>
```
The timeline event's `type` field tells you what it is (`comment`, `review`, etc.).

## Usage Patterns

### Fetch all comments on a PR

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-comments <owner> <repo> <index>
```

Note: PRs are a type of issue in Gitea/Forgejo, so use `/issues/{index}/comments` for conversation comments.

### Find a specific comment by ID (from `#issuecomment-{id}` URL)

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py find-comment <owner> <repo> <index> <comment_id>
```

This command uses the timeline endpoint to find any comment type (regular, review, inline). It returns the comment's type, author, date, and body.

### Get PR details

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-pr <owner> <repo> <index>
```

### Get PR diff

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-pr-diff <owner> <repo> <index>
```

### Get timeline

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-timeline <owner> <repo> <index>
```

Returns all events (comments, reviews, status changes, etc.) for an issue or PR in chronological order.

### List PR files

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-pr-files <owner> <repo> <index>
```

Lists all files changed in a PR with their status (added, modified, deleted) and additions/deletions counts.

### List PRs

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-prs <owner> <repo> [--state {open,closed,all}]
# --state: open (default), closed, all
```

### List issues

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-issues <owner> <repo> [--state {open,closed,all}]
# --state: open (default), closed, all
```

### Get issue details

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-issue <owner> <repo> <index>
```

### Get file

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-file <owner> <repo> <path> [--ref <branch>]
```

Gets the contents of a file in the repository. Use `--ref` to specify a branch (default: default branch).

### List commits

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-commits <owner> <repo> [--limit N]
```

Lists commits for the repository. Use `--limit` to control the number of results (default: 10).

### Get PR reviews

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-reviews <owner> <repo> <index>
```

Gets all reviews on a pull request. Each review contains the reviewer's feedback, comments, and approval status.

### Get inline review comments

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-review-comments <owner> <repo> <index> <review_id>
```

Gets inline comments (file-specific comments) on a specific review. These are code review comments tied to specific lines of code.

### List branches

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-branches <owner> <repo>
```

Lists all branches in the repository, including protected status and commit information.

### List releases

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-releases <owner> <repo>
```

Lists all releases in the repository, including tag, name, and release notes.

### List labels

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-labels <owner> <repo>
```

### List milestones

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py list-milestones <owner> <repo>
```

### Get repository info

```bash
{BASE_DIRECTORY}/scripts/codeberg-helper.py get-repo <owner> <repo>
```

## Common Mistakes

- **Assuming `#issuecomment-{id}` is always an issue comment** -- it can be a review event. Use `{BASE_DIRECTORY}/scripts/codeberg-helper.py find-comment` to find any comment by ID reliably
- Using `/pulls/{index}/comments` for conversation comments -- use `/issues/{index}/comments` instead
- **Looking only at `/issues/{index}/comments` for PR feedback** -- inline code review comments live under `/pulls/{index}/reviews/{id}/comments`, not the issues endpoint
- Forgetting that PR index and issue index share the same namespace
- Not handling pagination for repos with many comments (default limit is 30)
- Using session cookies instead of API tokens (insecure, fragile, expires)
- **Forgetting `CODEBERG_TOKEN` environment variable** -- the script requires this. Ensure it's exported before running commands
- **Forgetting `--dry-run` for write operations** -- use this flag to preview what will be sent before executing
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
