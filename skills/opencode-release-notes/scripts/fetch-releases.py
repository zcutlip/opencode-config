#!/usr/bin/env python3
"""
Fetch and summarize OpenCode release highlights from GitHub.
Zero dependencies - uses only Python stdlib.
"""

import argparse
import json
import re
import sys
import urllib.request
from datetime import datetime
from urllib.error import HTTPError, URLError


def fetch_releases(count: int = 5) -> list:
    """Fetch releases from GitHub API."""
    url = f"https://api.github.com/repos/anomalyco/opencode/releases?per_page={count}"

    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "opencode-release-notes/1.0"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except HTTPError as e:
        if e.code == 404:
            print("Error: Repository not found", file=sys.stderr)
        elif e.code == 403:
            print("Error: API rate limit exceeded. Try again later.", file=sys.stderr)
        else:
            print(f"Error: HTTP {e.code} - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except URLError as e:
        print(f"Error: Failed to connect to GitHub API - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: Invalid JSON response from GitHub API", file=sys.stderr)
        sys.exit(1)


def format_date(date_str: str) -> str:
    """Format ISO date string to readable format."""
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        return dt.strftime("%B %d, %Y")
    except (ValueError, AttributeError):
        return date_str


def extract_highlights(body: str) -> list:
    """Extract key highlights from release notes body."""
    if not body:
        return []

    highlights = []

    # Look for common highlight sections
    section_patterns = [
        r'##\s*(?:Highlights|What\'s New|Summary|Overview)\s*\n(.*?)(?=##|\Z)',
        r'##\s*(?:Core|Major Changes|Breaking Changes)\s*\n(.*?)(?=##|\Z)',
    ]

    for pattern in section_patterns:
        match = re.search(pattern, body, re.IGNORECASE | re.DOTALL)
        if match:
            section_content = match.group(1).strip()
            # Extract bullet points from this section
            bullets = re.findall(r'[-*]\s*(.+?)(?=\n[-*]|\n\n|\Z)', section_content, re.DOTALL)
            for bullet in bullets:
                # Clean up the bullet point
                clean = bullet.strip().replace('\n', ' ')
                if clean and len(clean) > 10:  # Filter out very short items
                    highlights.append(clean)
            if highlights:
                break

    # If no sections found, extract top-level bullet points
    if not highlights:
        bullets = re.findall(r'[-*]\s*(.+?)(?=\n[-*]|\n\n|\Z)', body, re.DOTALL)
        for bullet in bullets[:5]:  # Limit to first 5 bullets
            clean = bullet.strip().replace('\n', ' ')
            if clean and len(clean) > 10:
                highlights.append(clean)

    return highlights[:5]  # Max 5 highlights per release


def format_release(release: dict) -> str:
    """Format a single release as highlights."""
    tag = release.get('tag_name', 'unknown')
    date = format_date(release.get('published_at', ''))
    body = release.get('body', '').strip()

    highlights = extract_highlights(body)

    if not highlights:
        return f"""## {tag} ({date})

_No significant highlights in this release._"""

    highlights_text = '\n'.join(f"- {h}" for h in highlights)

    return f"""## {tag} ({date})

{highlights_text}"""


def main():
    parser = argparse.ArgumentParser(
        description="Fetch OpenCode release highlights from GitHub"
    )
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=5,
        help="Number of releases to fetch (default: 5)"
    )
    args = parser.parse_args()

    releases = fetch_releases(args.count)

    if not releases:
        print("No releases found.", file=sys.stderr)
        sys.exit(0)

    # Header
    print("# OpenCode Release Highlights\n")

    # Format each release with separator
    formatted = []
    for release in releases:
        formatted.append(format_release(release))

    print("\n\n---\n\n".join(formatted))


if __name__ == "__main__":
    main()
