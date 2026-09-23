#!/usr/bin/env python3
"""Rank OpenCode Go models by effective input cost.

Effective input cost = ratio*cacheRead + (1 - ratio)*input, where the cache
ratio is scraped from the model's page on opencode.ai/data. Stdlib only: all
maths happens in code and nothing is cached to disk.
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from opencode_pricing import (
    SOURCES,
    compute_effective,
    extract_table,
    fetch_page,
    filter_rows,
    parse_price,
    try_fetch_page,
)

DATA_BASE = "https://opencode.ai/data"

# (slug prefix, provider) — used to locate a model's /data page from its name.
PROVIDER_HINTS = (
    ("deepseek", "deepseek"),
    ("glm", "zhipuai"),
    ("kimi", "moonshotai"),
    ("minimax", "minimax"),
    ("mimo", "xiaomi"),
    ("muse-spark", "meta"),
    ("longcat", "meituan"),
    ("qwen", "alibaba"),
    ("hy3", "tencent"),
    ("hy4", "tencent"),
    ("grok", "xai"),
    ("gpt", "openai"),
)

FALLBACK_PROVIDERS = (
    "deepseek",
    "zhipuai",
    "moonshotai",
    "minimax",
    "xiaomi",
    "meta",
    "meituan",
    "alibaba",
    "tencent",
    "qwen",
    "google",
    "openai",
    "nvidia",
    "xai",
    "mistral",
    "cohere",
    "microsoft",
    "stepfun",
    "perplexity",
    "anthropic",
    "inclusionai",
)

CACHE_RATIO_PATTERN = re.compile(r"cacheRatio:([0-9]+(?:\.[0-9]+)?)")
PROMO_PATTERN = re.compile(r"<small>(.*?)</small>")

COLUMN_ALIASES = {
    "model": "model",
    "input": "input",
    "output": "output",
    "cached read": "cached_read",
    "cached write": "cached_write",
    "monthly limit": "monthly_limit",
}

REQUIRED_COLUMNS = ("model", "input", "output", "cached_read")


def normalize(name: str) -> str:
    """Convert a Go display name into the slug form used by opencode.ai/data."""
    slug = re.sub(r"\([^)]*\)", " ", name.lower())
    slug = slug.replace(" ", "-").replace(".", "-")
    return re.sub(r"-+", "-", slug).strip("-")


def candidate_providers(slug: str) -> list[str]:
    """Return data providers to try for a slug, deduped and order-preserving."""
    ordered = [p for prefix, p in PROVIDER_HINTS if slug.startswith(prefix)]
    ordered += [p for p in FALLBACK_PROVIDERS if p not in ordered]
    return list(dict.fromkeys(ordered))


def fetch_cache_ratio(slug: str) -> float | None:
    """Scrape a model's cache ratio from opencode.ai/data, or None on failure."""
    for provider in candidate_providers(slug):
        page = try_fetch_page(f"{DATA_BASE}/{provider}/{slug}")
        match = page and CACHE_RATIO_PATTERN.search(page)
        if match:
            return float(match.group(1)) / 100
    return None


def column_indices(header: list[str]) -> dict[str, int]:
    """Map known column names to their positions, case-insensitively."""
    return {
        COLUMN_ALIASES[col.lower()]: i
        for i, col in enumerate(header)
        if col.lower() in COLUMN_ALIASES
    }


def render_table(scored: list[dict], show_blended: bool) -> str:
    """Render the ranked rows as a markdown table."""
    headings = ["Rank", "Model", "Cache ratio", "Effective input $/M"]
    if show_blended:
        headings.append("Blended $/M")
    headings += ["Cached write", "Monthly limit"]

    lines = [
        "| " + " | ".join(headings) + " |",
        "|" + "|".join("---" for _ in headings) + "|",
    ]
    for rank, item in enumerate(scored, start=1):
        ratio_cell = "—" if item["ratio"] is None else f"{round(item['ratio'] * 100)}%"
        cells = [
            str(rank),
            item["model"],
            ratio_cell,
            f"${item['eff']:.4f}",
        ]
        if show_blended:
            cells.append(f"${item['blended']:.4f}")
        cells += [item["write"], item["limit"]]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def main() -> None:
    """Fetch pricing, score each model, and print the ranked table."""
    parser = argparse.ArgumentParser(description="Rank Go models by effective cost.")
    parser.add_argument("--source", default="go")
    parser.add_argument("--min-limit", type=int, default=60)
    parser.add_argument("--output-share", type=float, default=0.0)
    parser.add_argument("--top", type=int, default=0)
    parser.add_argument("--debug", action="store_true")
    args = parser.parse_args()

    source = SOURCES.get(args.source)
    if source is None:
        known = ", ".join(sorted(SOURCES))
        sys.exit(f"Error: Unknown source '{args.source}' (known: {known})")

    markdown = fetch_page(source["url"])
    header, rows = extract_table(markdown, source["table_heading"])
    rows = filter_rows(header, rows, args.min_limit)

    cols = column_indices(header)
    absent = [name for name in REQUIRED_COLUMNS if name not in cols]
    if absent:
        sys.exit("Error: Missing required column(s): " + ", ".join(absent))

    def cell(row: list[str], key: str) -> str:
        idx = cols.get(key)
        return row[idx] if idx is not None and idx < len(row) else ""

    scored: list[dict] = []
    missing: list[str] = []
    promos: list[tuple[str, str]] = []

    for row in rows:
        model = cell(row, "model")
        monthly = cell(row, "monthly_limit")
        promos += [(model, text) for text in PROMO_PATTERN.findall(monthly)]

        slug = normalize(model)
        input_px = parse_price(cell(row, "input"))
        output_px = parse_price(cell(row, "output"))
        cached_px = parse_price(cell(row, "cached_read"))
        if input_px == 0.0 and output_px == 0.0 and cached_px == 0.0:
            scored.append(
                {
                    "model": model,
                    "ratio": None,
                    "eff": 0.0,
                    "blended": 0.0,
                    "write": cell(row, "cached_write"),
                    "limit": monthly,
                }
            )
            continue
        ratio = fetch_cache_ratio(slug)
        if args.debug:
            print(
                f"{model}: slug={slug} "
                f"providers={candidate_providers(slug)} ratio={ratio}",
                file=sys.stderr,
            )
        if ratio is None:
            missing.append(model)
            continue

        eff, blended = compute_effective(
            input_px or 0.0,
            output_px or 0.0,
            cached_px or 0.0,
            ratio,
            args.output_share,
        )
        scored.append(
            {
                "model": model,
                "ratio": ratio,
                "eff": eff,
                "blended": blended,
                "write": cell(row, "cached_write"),
                "limit": monthly,
            }
        )

    scored.sort(key=lambda item: item["eff"])
    if args.top > 0:
        scored = scored[: args.top]
    print(render_table(scored, args.output_share > 0))

    if missing:
        print("\nNo cache-ratio data (excluded from ranking): " + ", ".join(missing))
    if promos:
        print("\nTime-limited promotions:")
        for model, text in promos:
            print(f"{model} — <small>{text}</small>")
    print(
        "\nNote: cache ratios are an aggregate across all OpenCode users — "
        "a strong prior for agentic workloads, not a guarantee for your "
        "prompt shapes."
    )


if __name__ == "__main__":
    main()
