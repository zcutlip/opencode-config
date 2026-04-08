#!/usr/bin/env python3
"""
Codeberg API CLI Helper

A read-only CLI tool for interacting with the Codeberg Forgejo API.
Provides commands for fetching PRs, issues, comments, files, and
repository data.

Usage:
    codeberg-helper.py <command> <arguments> [options]

Exit Codes:
    0 - EXIT_SUCCESS
    1 - EXIT_GENERAL
    2 - EXIT_AUTH_FAILED
    3 - EXIT_NOT_FOUND
    4 - EXIT_NETWORK
    5 - EXIT_INVALID_ARGS
    6 - EXIT_RATE_LIMIT
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

import requests

BASE_URL = "https://codeberg.org/api/v1"

# Exit codes
EXIT_SUCCESS = 0
EXIT_GENERAL = 1
EXIT_AUTH_FAILED = 2
EXIT_NOT_FOUND = 3
EXIT_NETWORK = 4
EXIT_INVALID_ARGS = 5
EXIT_RATE_LIMIT = 6


class CodebergError(Exception):
    """Base exception for Codeberg API errors."""

    def __init__(self, message: str, exit_code: int, error_type: str = "general"):
        self.message = message
        self.exit_code = exit_code
        self.error_type = error_type
        super().__init__(message)


def get_token() -> str:
    """Get the CODEBERG_TOKEN from environment."""
    token = os.environ.get("CODEBERG_TOKEN")
    if not token:
        raise CodebergError(
            "CODEBERG_TOKEN environment variable not set",
            EXIT_AUTH_FAILED,
            "auth_failed",
        )
    return token


def make_headers() -> Dict[str, str]:
    """Create request headers with authentication."""
    return {"Authorization": f"token {get_token()}", "Accept": "application/json"}


def handle_response(response: requests.Response) -> Any:
    """Handle API response and raise appropriate errors."""
    status = response.status_code

    if status == 200 or status == 201:
        try:
            return response.json()
        except json.JSONDecodeError:
            return response.text

    elif status == 401 or status == 403:
        raise CodebergError("Authentication failed", EXIT_AUTH_FAILED, "auth_failed")

    elif status == 404:
        raise CodebergError("Resource not found", EXIT_NOT_FOUND, "not_found")

    elif status == 429:
        raise CodebergError("Rate limit exceeded", EXIT_RATE_LIMIT, "rate_limit")

    else:
        try:
            error_data = response.json()
            message = error_data.get("message", response.text)
        except json.JSONDecodeError:
            message = response.text

        raise CodebergError(
            f"API error (HTTP {status}): {message}", EXIT_NETWORK, "network_error"
        )


def output_json(data: Any, pretty: bool = True) -> None:
    """Output data as JSON."""
    if pretty:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(data, ensure_ascii=False))


def output_error(error: CodebergError) -> None:
    """Output error as JSON to stderr."""
    error_obj = {
        "success": False,
        "error": error.error_type,
        "message": error.message,
        "exit_code": error.exit_code,
    }
    print(json.dumps(error_obj, ensure_ascii=False), file=sys.stderr)
    sys.exit(error.exit_code)


def build_url(endpoint: str) -> str:
    """Build full API URL from endpoint."""
    return f"{BASE_URL}/{endpoint.lstrip('/')}"


def fetch_all_pages(
    url: str, params: Optional[Dict] = None, limit: int = 100
) -> List[Dict]:
    """Fetch all pages of a paginated endpoint."""
    all_items = []
    params = params or {}
    params["limit"] = limit
    current_url: Optional[str] = url

    while current_url:
        response = requests.get(current_url, headers=make_headers(), params=params)
        data = handle_response(response)

        if isinstance(data, list):
            all_items.extend(data)
            # Check for pagination link
            link = response.headers.get("Link")
            if link and 'rel="next"' in link:
                # Parse next page URL
                for part in link.split(","):
                    if 'rel="next"' in part:
                        current_url = part.split(";")[0].strip("<> ")
                        break
            else:
                current_url = None
        else:
            return [data]

    return all_items


# ==================== CLI Commands ====================


def cmd_get_pr(owner: str, repo: str, index: int) -> Dict:
    """Get pull request details."""
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}")
    response = requests.get(url, headers=make_headers())
    return handle_response(response)


def cmd_list_prs(
    owner: str, repo: str, state: str = "open", limit: int = 30
) -> List[Dict]:
    """List repository pull requests."""
    url = build_url(f"/repos/{owner}/{repo}/pulls")
    params = {"state": state, "limit": limit}
    return fetch_all_pages(url, params, limit)


def cmd_get_issue(owner: str, repo: str, index: int) -> Dict:
    """Get issue details."""
    url = build_url(f"/repos/{owner}/{repo}/issues/{index}")
    response = requests.get(url, headers=make_headers())
    return handle_response(response)


def cmd_list_issues(
    owner: str, repo: str, state: str = "open", limit: int = 30
) -> List[Dict]:
    """List repository issues."""
    url = build_url(f"/repos/{owner}/{repo}/issues")
    params = {"state": state, "limit": limit}
    return fetch_all_pages(url, params, limit)


def cmd_get_comments(owner: str, repo: str, index: int) -> List[Dict]:
    """Get comments for an issue or PR."""
    # Try issues first, then falls back to try pulls
    url = build_url(f"/repos/{owner}/{repo}/issues/{index}/comments")
    response = requests.get(url, headers=make_headers())

    if response.status_code == 404:
        # Try pull request comments
        url = build_url(f"/repos/{owner}/{repo}/pulls/{index}/comments")
        response = requests.get(url, headers=make_headers())

    return handle_response(response)


def cmd_find_comment(owner: str, repo: str, index: int, comment_id: int) -> Dict:
    """
    Find a specific comment by ID using the timeline API.

    This handles all 3 comment types:
    - Regular issue/PR comments
    - Review body comments (diffs are not comments but part of review)
    - Inline review comments

    Returns the comment object if found, or raises NotFound error.
    """
    timeline = cmd_get_timeline(owner, repo, index)

    # Search timeline events for the comment
    for event in timeline:
        if event.get("type") == "comment":
            comment = event.get("comment", {})
            if comment.get("id") == comment_id:
                return comment

    # Not found in timeline, try regular comments endpoint
    comments = cmd_get_comments(owner, repo, index)
    for comment in comments:
        if comment.get("id") == comment_id:
            return comment

    # If still not found, try review comments specifically
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}/comments")
    params = {"limit": 100}
    review_comments = fetch_all_pages(url, params, limit=100)

    for comment in review_comments:
        if comment.get("id") == comment_id:
            return comment

    # Not found anywhere
    raise CodebergError(
        f"Comment {comment_id} not found in issue/PR {index}",
        EXIT_NOT_FOUND,
        "not_found",
    )


def cmd_get_pr_diff(owner: str, repo: str, index: int) -> str:
    """Get the diff text of a pull request."""
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}.diff")
    response = requests.get(url, headers=make_headers())
    return handle_response(response)


def cmd_list_pr_files(owner: str, repo: str, index: int) -> List[Dict]:
    """List changed files in a pull request."""
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}/files")
    response = requests.get(url, headers=make_headers())
    return handle_response(response)


def cmd_get_timeline(owner: str, repo: str, index: int) -> List[Dict]:
    """Get the full timeline of events for an issue or PR."""
    url = build_url(f"/repos/{owner}/{repo}/issues/{index}/timeline")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_list_labels(owner: str, repo: str) -> List[Dict]:
    """List repository labels."""
    url = build_url(f"/repos/{owner}/{repo}/labels")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_list_milestones(owner: str, repo: str) -> List[Dict]:
    """List repository milestones."""
    url = build_url(f"/repos/{owner}/{repo}/milestones")
    params = {"state": "all", "limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_get_file(owner: str, repo: str, path: str, ref: Optional[str] = None) -> Dict:
    """Get file contents from repository."""
    url = build_url(f"/repos/{owner}/{repo}/raw/{path}")
    params = {"ref": ref} if ref else {}
    response = requests.get(url, headers=make_headers(), params=params)
    return handle_response(response)


def cmd_list_commits(owner: str, repo: str, limit: int = 100) -> List[Dict]:
    """List repository commits."""
    url = build_url(f"/repos/{owner}/{repo}/commits")
    params = {"limit": limit}
    return fetch_all_pages(url, params, limit=limit)


def cmd_get_repo(owner: str, repo: str) -> Dict:
    """Get repository information."""
    url = build_url(f"/repos/{owner}/{repo}")
    response = requests.get(url, headers=make_headers())
    return handle_response(response)


def cmd_get_reviews(owner: str, repo: str, index: int) -> List[Dict]:
    """Get pull request reviews."""
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}/reviews")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_get_review_comments(
    owner: str, repo: str, index: int, review_id: int
) -> List[Dict]:
    """Get inline comments on a review."""
    url = build_url(f"/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}/comments")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_list_branches(owner: str, repo: str) -> List[Dict]:
    """List repository branches."""
    url = build_url(f"/repos/{owner}/{repo}/branches")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def cmd_list_releases(owner: str, repo: str) -> List[Dict]:
    """List repository releases."""
    url = build_url(f"/repos/{owner}/{repo}/releases")
    params = {"limit": 100}
    return fetch_all_pages(url, params, limit=100)


def build_curl_command(
    method: str, url: str, headers: Dict, params: Optional[Dict] = None
) -> str:
    """Build a curl command string for dry-run mode."""
    parts = ["curl", "-X", method]

    for key, value in headers.items():
        parts.extend(["-H", f"{key}: {value}"])

    if params:
        for key, value in params.items():
            parts.extend(["-d", f"{key}={value}"])

    parts.append(url)

    return " ".join(parts)


# ==================== Main CLI ====================


def main():
    parser = argparse.ArgumentParser(
        description="Codeberg API CLI Helper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  codeberg-helper.py get-pr owner repo 123
  codeberg-helper.py list-prs owner repo --state open --limit 50
  codeberg-helper.py get-issue owner repo 45
  codeberg-helper.py find-comment owner repo 1 234
        """,
    )
    parser.add_argument("--raw", action="store_true", help="Output compact JSON")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show curl command without executing"
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # get-pr
    p = subparsers.add_parser("get-pr", help="Get pull request details")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="PR number")

    # list-prs
    p = subparsers.add_parser("list-prs", help="List pull requests")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument(
        "--state", choices=["open", "closed", "all"], default="open", help="PR state"
    )
    p.add_argument("--limit", type=int, default=30, help="Maximum results")

    # get-issue
    p = subparsers.add_parser("get-issue", help="Get issue details")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="Issue number")

    # list-issues
    p = subparsers.add_parser("list-issues", help="List issues")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument(
        "--state", choices=["open", "closed", "all"], default="open", help="Issue state"
    )
    p.add_argument("--limit", type=int, default=30, help="Maximum results")

    # get-comments
    p = subparsers.add_parser("get-comments", help="Get issue/PR comments")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="Issue or PR number")

    # find-comment
    p = subparsers.add_parser("find-comment", help="Find specific comment by ID")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="Issue or PR number")
    p.add_argument("comment_id", type=int, help="Comment ID to find")

    # get-pr-diff
    p = subparsers.add_parser("get-pr-diff", help="Get PR diff text")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="PR number")

    # list-pr-files
    p = subparsers.add_parser("list-pr-files", help="List changed files in PR")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="PR number")

    # get-timeline
    p = subparsers.add_parser("get-timeline", help="Get issue/PR timeline")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="Issue or PR number")

    # list-labels
    p = subparsers.add_parser("list-labels", help="List repository labels")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")

    # list-milestones
    p = subparsers.add_parser("list-milestones", help="List repository milestones")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")

    # get-file
    p = subparsers.add_parser("get-file", help="Get file contents")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("path", help="File path")
    p.add_argument("--ref", help="Branch or commit SHA")

    # list-commits
    p = subparsers.add_parser("list-commits", help="List commits")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("--limit", type=int, default=100, help="Maximum results")

    # get-repo
    p = subparsers.add_parser("get-repo", help="Get repository info")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")

    # get-reviews
    p = subparsers.add_parser("get-reviews", help="Get PR reviews")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="PR number")

    # get-review-comments
    p = subparsers.add_parser(
        "get-review-comments", help="Get inline comments on a review"
    )
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")
    p.add_argument("index", type=int, help="PR number")
    p.add_argument("review_id", type=int, help="Review ID")

    # list-branches
    p = subparsers.add_parser("list-branches", help="List repository branches")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")

    # list-releases
    p = subparsers.add_parser("list-releases", help="List repository releases")
    p.add_argument("owner", help="Repository owner")
    p.add_argument("repo", help="Repository name")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(EXIT_INVALID_ARGS)

    try:
        # Check for dry-run mode
        if args.dry_run:
            headers = make_headers()

            if args.command == "get-pr":
                url = build_url(f"/repos/{args.owner}/{args.repo}/pulls/{args.index}")
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-prs":
                url = build_url(f"/repos/{args.owner}/{args.repo}/pulls")
                params = {"state": args.state, "limit": args.limit}
                print(build_curl_command("GET", url, headers, params))
            elif args.command == "get-issue":
                url = build_url(f"/repos/{args.owner}/{args.repo}/issues/{args.index}")
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-issues":
                url = build_url(f"/repos/{args.owner}/{args.repo}/issues")
                params = {"state": args.state, "limit": args.limit}
                print(build_curl_command("GET", url, headers, params))
            elif args.command == "get-comments":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/issues/{args.index}/comments"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "find-comment":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/issues/{args.index}/timeline"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "get-pr-diff":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/pulls/{args.index}.diff"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-pr-files":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/pulls/{args.index}/files"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "get-timeline":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/issues/{args.index}/timeline"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-labels":
                url = build_url(f"/repos/{args.owner}/{args.repo}/labels")
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-milestones":
                url = build_url(f"/repos/{args.owner}/{args.repo}/milestones")
                print(build_curl_command("GET", url, headers))
            elif args.command == "get-file":
                url = build_url(f"/repos/{args.owner}/{args.repo}/raw/{args.path}")
                params = {"ref": args.ref} if args.ref else {}
                print(build_curl_command("GET", url, headers, params))
            elif args.command == "list-commits":
                url = build_url(f"/repos/{args.owner}/{args.repo}/commits")
                params = {"limit": args.limit}
                print(build_curl_command("GET", url, headers, params))
            elif args.command == "get-repo":
                url = build_url(f"/repos/{args.owner}/{args.repo}")
                print(build_curl_command("GET", url, headers))
            elif args.command == "get-reviews":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/pulls/{args.index}/reviews"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "get-review-comments":
                url = build_url(
                    f"/repos/{args.owner}/{args.repo}/pulls/{args.index}/reviews/{args.review_id}/comments"
                )
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-branches":
                url = build_url(f"/repos/{args.owner}/{args.repo}/branches")
                print(build_curl_command("GET", url, headers))
            elif args.command == "list-releases":
                url = build_url(f"/repos/{args.owner}/{args.repo}/releases")
                print(build_curl_command("GET", url, headers))
            else:
                print(f"# Unknown command: {args.command}", file=sys.stderr)
                sys.exit(EXIT_INVALID_ARGS)

            sys.exit(EXIT_SUCCESS)

        # Execute command
        result = None

        if args.command == "get-pr":
            result = cmd_get_pr(args.owner, args.repo, args.index)
        elif args.command == "list-prs":
            result = cmd_list_prs(args.owner, args.repo, args.state, args.limit)
        elif args.command == "get-issue":
            result = cmd_get_issue(args.owner, args.repo, args.index)
        elif args.command == "list-issues":
            result = cmd_list_issues(args.owner, args.repo, args.state, args.limit)
        elif args.command == "get-comments":
            result = cmd_get_comments(args.owner, args.repo, args.index)
        elif args.command == "find-comment":
            result = cmd_find_comment(
                args.owner, args.repo, args.index, args.comment_id
            )
        elif args.command == "get-pr-diff":
            result = cmd_get_pr_diff(args.owner, args.repo, args.index)
        elif args.command == "list-pr-files":
            result = cmd_list_pr_files(args.owner, args.repo, args.index)
        elif args.command == "get-timeline":
            result = cmd_get_timeline(args.owner, args.repo, args.index)
        elif args.command == "list-labels":
            result = cmd_list_labels(args.owner, args.repo)
        elif args.command == "list-milestones":
            result = cmd_list_milestones(args.owner, args.repo)
        elif args.command == "get-file":
            result = cmd_get_file(args.owner, args.repo, args.path, args.ref)
        elif args.command == "list-commits":
            result = cmd_list_commits(args.owner, args.repo, args.limit)
        elif args.command == "get-repo":
            result = cmd_get_repo(args.owner, args.repo)
        elif args.command == "get-reviews":
            result = cmd_get_reviews(args.owner, args.repo, args.index)
        elif args.command == "get-review-comments":
            result = cmd_get_review_comments(
                args.owner, args.repo, args.index, args.review_id
            )
        elif args.command == "list-branches":
            result = cmd_list_branches(args.owner, args.repo)
        elif args.command == "list-releases":
            result = cmd_list_releases(args.owner, args.repo)
        else:
            print(f"# Unknown command: {args.command}", file=sys.stderr)
            sys.exit(EXIT_INVALID_ARGS)

        output_json(result, pretty=not args.raw)

    except CodebergError as e:
        output_error(e)
    except requests.RequestException as e:
        error = CodebergError(f"Network error: {str(e)}", EXIT_NETWORK, "network_error")
        output_error(error)
    except Exception as e:
        error = CodebergError(f"Unexpected error: {str(e)}", EXIT_GENERAL, "general")
        output_error(error)


if __name__ == "__main__":
    main()
