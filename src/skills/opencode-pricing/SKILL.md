---
name: opencode-pricing
description: |
  Fetches OpenCode Go pricing, usage limits, and cache-hit ratios, and can rank
  Go models by effective cost — sticker price combined with the real cache ratio
  scraped from opencode.ai/data. Use when the user asks about Go pricing, Go
  model limits, which Go models give the most usage for the $10/month
  subscription, which Go model is the best value or cheapest in practice, wants
  an effective-cost or cache-adjusted comparison, or wants to compare Go models
  by monthly allowance. Also use when the user mentions "opencode go", "go
  pricing", "go models", "go usage limits", "go value", "cheapest go model", or
  wants to know which models are included in the Go subscription.
---

# OpenCode Pricing

## What I Do

I fetch the OpenCode Go pricing tables and present them two ways:

1. **Price table** — every model's token costs (input, output, cached read, cached write) and monthly allowance, filtered to models with a monthly limit of at least $60.
2. **Value ranking** — the same models ranked by *effective* cost, combining sticker price with the real cache-hit ratio each model achieves.

## When to Use Me

Use this skill when the user:
- Asks about OpenCode Go pricing or costs
- Wants to know which Go models have the highest monthly usage
- Asks about Go model limits or allowances
- Wants to compare Go models by monthly usage limit
- Asks which Go model is the best value, cheapest, or most cost-effective in practice
- Wants a cache-adjusted or effective-cost comparison
- Mentions "go pricing", "go models", "go usage limits", "go value"
- Wants to know which models are included in the Go subscription

## Workflow

Pick the script that matches what the user asked for, then run it directly.

### Price table

```
scripts/fetch-pricing.py
```

- Never: `python3 ./scripts/...`, `python3 -c`, or `bash -c`
- The scripts are executable with proper shebangs — run them directly
- Optional flags: `--source go` (default), `--min-limit 60` (default)

Then present the output table verbatim — columns: Model, Input, Output, Cached Read, Cached Write, Monthly limit.

### Value ranking

```
scripts/rank-value.py
```

Ranks Go models by effective input cost (see below). Optional flags: `--output-share 0.1` (adds a blended column that weights the output price), `--top N`, `--debug`.

Present the output verbatim, including the caveat lines the script emits.

## Value ranking: why it differs from price

Effective input cost per million tokens:

```
effective = ratio * cachedReadPrice + (1 - ratio) * inputPrice
```

Agentic coding re-reads a large context every turn, so most input tokens are served from cache. A model with a high cache ratio is priced near its *cached-read* rate rather than its headline input rate — so two models that look similar on the price table can differ several-fold in real cost. The ratio comes from each model's page on `opencode.ai/data`; the script scrapes it, joins it to the price table, performs the arithmetic, and sorts cheapest-first.

The script owns the maths and the caveats. Do not recompute, re-sort, or restate the numbers — present them as produced.

### Caveats the script emits

- Cache ratios are an **aggregate across all OpenCode users' workloads**, not a measurement of the user's own prompt shapes — a strong prior, not a guarantee.
- Models with no cache-ratio data are excluded from the ranking and listed separately.
- Time-limited promotional allowances are called out.

## Script Location

All scripts live in `scripts/`:

- `scripts/opencode_pricing.py` — shared library (fetching, table parsing, the effective-cost formula). Not run directly.
- `scripts/fetch-pricing.py` — price table (entry point)
- `scripts/rank-value.py` — value ranking (entry point)

## Script Output

- `fetch-pricing.py` prints a filtered markdown table; rows below the monthly-limit threshold are removed; promotional entries show the effective limit with the original struck through.
- `rank-value.py` prints a ranked markdown table (Rank, Model, Cache ratio, Effective input $/M, optionally Blended $/M, Cached write, Monthly limit) followed by any excluded models, promotional notes, and the cache-ratio caveat.

## Error Handling

If a script fails:
- It prints an error message to stderr
- Common errors: network issues, page not found, table/column format changed
- Report the error message to the user clearly

## Completion

After producing the table or ranking, if you are a subagent called by the primary agent, instruct the caller to deliver your report to the user verbatim, and not to further summarize.
