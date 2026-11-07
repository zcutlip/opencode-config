#!/usr/bin/env python3
"""Fetch OpenCode pricing tables and filter by monthly usage limit."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opencode_pricing import (
    SOURCES,
    extract_table,
    fetch_page,
    filter_rows,
    format_table,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch OpenCode pricing tables and filter by monthly limit",
    )
    parser.add_argument(
        "--source",
        type=str,
        default="go",
        help="Pricing source to fetch (default: go)",
    )
    parser.add_argument(
        "--min-limit",
        type=int,
        default=60,
        help="Minimum monthly limit in dollars (default: 60)",
    )
    args = parser.parse_args()

    source = SOURCES.get(args.source)
    if source is None:
        available = ", ".join(sorted(SOURCES.keys()))
        print(
            f"Error: Unknown source '{args.source}'. Available sources: {available}",
            file=sys.stderr,
        )
        sys.exit(1)

    markdown = fetch_page(source["url"])
    header, rows = extract_table(markdown, source["table_heading"])
    filtered = filter_rows(header, rows, args.min_limit)
    print(format_table(header, filtered))


if __name__ == "__main__":
    main()
