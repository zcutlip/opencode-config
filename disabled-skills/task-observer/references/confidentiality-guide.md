# Confidentiality Guide — Cross-Product Re-Identifiability Sweep

This document contains the detailed Layer 5 confidentiality safeguard.
Read this when creating or publishing open-source skills that contain
multiple worked examples. For Layers 1–4, see the Confidentiality
Safeguards section in SKILL.md.

---

## Layer 5: Cross-Product Re-Identifiability Sweep

Layers 1–4 focus on single-example scrubbing. They do not catch the case
where two or three sanitised examples in the same skill — each fine on its
own — combine to narrow the identifiable client set. A reader who knows
the author's client portfolio (which is often public on a consultant's
website) can triangulate even when each individual example is properly
placeholdered. The failure mode is invisible to the author because they
mentally compartmentalise each example; it's visible to any reader with
adjacent context.

**When to run it:** After every individual example has been sanitised —
as a final pass before the skill ships or before any major public
release. This is the last check, not a substitute for earlier layers.

**What to look for:**

- **Enumerated counts that match a known client count.** "Four builds
  across three verticals" in a skill whose author has four public clients
  across three verticals is functionally a directory. Blur the count
  ("multiple builds") or the verticals ("across regulated, editorial,
  and commerce contexts").
- **Specific numbers in a thin vertical.** Visibility percentages,
  revenue ranges, or geography given in a vertical where only one or two
  candidates plausibly exist. A single real client can be narrowed from
  "vertical × percentage × geography × timing" even when no name appears.
  Replace specific numbers with illustrative ranges.
- **Thinly-disguised placeholder names.** "Northwind Coffee" in a
  specialty-retailer vertical where the only plausible specialty-retail
  client is a coffee roaster reads as the real brand with a thin
  rename. Use the Northwind / Contoso / Fabrikam placeholder family
  explicitly, and make sure the placeholder's vertical is different from
  any real client's vertical.

**How to sweep:**

1. List every worked example in the skill and the fields each one names
   (vertical, geography, numeric range, timing, count).
2. Ask: do any two examples share enough fields that a reader with access
   to the author's public client list could map the set to real clients?
3. Mitigate by blurring counts, widening verticals, dropping specific
   numbers to illustrative ranges, or consolidating similar examples into
   a single composite.

**Why this is a separate layer:** Re-identification risk is combinatorial.
Each additional sanitised example adds a field that narrows the candidate
space. Layers 1–4 check each example in isolation and pass. The cross-
product only emerges when the examples are read together. The author is
the least reliable reader for this check because they know the ground
truth — which is exactly why the sweep has to be a mechanical pass, not
a feeling.
