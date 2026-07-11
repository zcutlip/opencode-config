#!/usr/bin/env python3
"""Fetch OpenCode release JSON from GitHub API. No dependencies beyond stdlib."""

import argparse
import json
import sys
import urllib.request
from urllib.error import HTTPError, URLError

API_BASE = "https://api.github.com/repos/anomalyco/opencode/releases"


def build_url(tag: str | None, count: int) -> str:
    if tag:
        return f"{API_BASE}/tags/{tag}"
    return f"{API_BASE}?per_page={count}"


def fetch(url: str) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "opencode-release-notes/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        if e.code == 404:
            print("Error: Release not found", file=sys.stderr)
        elif e.code == 403:
            print("Error: API rate limit exceeded. Try again later.", file=sys.stderr)
        else:
            print(f"Error: HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: Failed to connect to GitHub API - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON response from GitHub API", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(data, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch OpenCode releases as JSON")
    parser.add_argument("--count", "-n", type=int, default=5, help="Number of releases (default: 5)")
    parser.add_argument("--tag", type=str, help="Specific tag to fetch (e.g. v0.21.0)")
    args = parser.parse_args()

    url = build_url(args.tag, args.count)
    fetch(url)


if __name__ == "__main__":
    main()
