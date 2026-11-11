# Third-party OpenCode V2 plugin marketplaces — research report

Date: 2026-10-20. All four candidates fetched live this session. No first-party
marketplace exists in OpenCode V2 — the official story is npm/Git as distribution
channels, with discovery left to third-party sites.

## Summary

| Site | Status | Catalog size | Curation model | Freshness | Trusted? |
|---|---|---|---|---|---|
| OpenDock (www.opendock.net) | **Live** (bare opendock.net fails) | 2,581 plugins | Fully automatic: crawls every npm package tagged `opencode-plugin` daily | Daily crawl; "Data updated 2026-10-20 08:16" | Popularity/maintenance signal only, no security audit |
| HOL Registry (hol.org/plugins) | Live | 958 plugins (all agent runtimes) | Ingested from awesome-ai-plugins + PR-gated submit flow, trust scores 0–100, owner-verified badges | Per-plugin "updated" dates, current (Oct 2026) | Security scanner explicitly disclaimed as static fallback scoring; commercial overlay ($200/mo sponsored slots, HOL Guard ads) |
| awesome-opencode (GitHub) | Live | 10.7k stars, 504 commits, 479 PRs | Human-curated: YAML entries in `data/<category>/`, automated validation + maintainer review, README auto-generated | Active, CC0-1.0 | Best signal: public review trail (479 PRs), but nothing indexed beyond what a human merged |
| opencode.cafe | Live, app works | **Unverified — SSR pages render 0 counts / empty feed** | Submissions reviewed by admins, accounts via Clerk, discussions/likes, moderation dashboard | Repo: 25 commits, 199 stars, MIT, Next.js 15 + Convex | Thin; catalog depth unknown without a JS browser |

## 1. OpenDock — www.opendock.net

- **Correct URL is `www.opendock.net`.** Bare `opendock.net` fails with a transport
  error — that is why it "seemed down" earlier. The site itself is alive and
  current.
- Census model, not curation: every npm package with `opencode-plugin` in
  `package.json` keywords is crawled daily; listing requires no PR and no review —
  "listed automatically, the next day." Author-facing submit rule is just the npm
  keyword.
- Scale on 2026-10-20: 2,581 plugins, ~1.37M cumulative GitHub stars across the
  index, ~3.2M monthly npm downloads.
- Ranking is deliberately anti-first-mover: composite of 30-day downloads,
  7-day star velocity, and recent commit activity.
- **Maintenance lamp on every listing** — 1,790 Active / 758 Stale / 33 Archived
  (health sampled on 180 of 2,581). This is the only directory here that flags
  dead plugins at scale.
- 14 categories (largest: Other 449, Tools 366, Agent Orchestration 312,
  Memory & Context 237, Providers 234, UI & Themes 180, Auth 170, Git 145,
  MCP 136, Observability 130, Notifications 110, LSP 84).
- Catalog is V2-era (several listings explicitly say "opencode v2 plugin"; sidebar
  footer/notify tools reference the V2 sidebar API).
- Site source: github.com/qunqin24/opendock. Not affiliated with OpenCode.
- Caveats: no security vetting of any kind — rank is popularity/maintenance, so
  garbage with good growth ranks high. Curated-looking "spotlight" is just the
  top of its own algorithm.

## 2. HOL Registry — hol.org/plugins

- Broadest but least OpenCode-focused: 958 plugins spanning Claude Code, Codex,
  Grok, Kimi Code, DeepSeek Harness, Antigravity CLI, OpenCode, Cursor, and MCP.
  OpenCode is one filter among many.
- Every listing carries a **trust score (0–100)**, observed 84–94 for top items,
  composite of identity, activity, verification signals; "Owner verified" badges.
- Ranking pages split into Featured / Trust / Newest; also daily plugin
  "launches" with community voting.
- Honest security disclosure (their own FAQ): scans are
  "registry-broker-fallback static/catalog scoring, not a live exploit test…
  not a safety guarantee." Security dataset published on HuggingFace
  (HashgraphOnline/hol-plugin-security) with the same disclaimer.
- **Commercial overlay**: sponsored placements from $200/mo inside the ranked
  feed and rails; heavy self-promotion of their own HOL Guard product. Organic
  rank is claimed unaffected by sponsorship.
- Submission: connect GitHub, list a public repo; HOL opens a PR against
  awesome-ai-plugins, which is what it ingests.
- Data-use policy restricts bulk reuse/commercial scraping; browsing and
  attributed answers fine.

## 3. awesome-opencode (github.com/awesome-opencode/awesome-opencode)

- The heavyweight community list: 10.7k stars, 1.0k forks, 504 commits, CC0-1.0.
- Sections: Official repos, Plugins (biggest), Themes, Agents, Projects,
  Resources.
- Modernized workflow: entries are YAML files under `data/plugins|themes|agents|
  projects|resources/` recorded via fork-and-PR; automated YAML validation runs,
  maintainers review content, README is generated from the YAML — list can't drift
  from its data.
- Entry requirements: OpenCode-relevant, public repo, committed within 6 months,
  unique, complete.
- Plugin entries are current V2-era projects (e.g. Magic Context,
  oh-my-opencode-slim, usage quota trackers, context-pruning plugins).
- Only source here with a real public review trail — but by construction it
  contains only what humans chose to list; nothing auto-indexed.

## 4. opencode.cafe

- Community marketplace app (GitHub R44VC0RP/opencode.cafe): Next.js 15 +
  Convex + Clerk, submission forms, admin moderation dashboard, per-extension
  discussion threads, email notifications. MIT, 199 stars, 25 commits.
- Distinct model: discusses extensions rather than merely listing them;
  small-repo feel.
- **Catalog depth unverified from here**: server-rendered pages came back with
  0-extension category counters and an empty "Fresh from the Community" feed;
  data loads client-side via Convex, so a plain HTTP fetch can't see past
  hydration. Treat actual size as unknown; the site is functional (guidelines and
  terms pages are live) but cannot be judged as a discovery surface from text
  alone.
- Comparable negative: it does not index anything automatically and shows no
  trust/security signals beyond site admins' review.

## Cross-cutting assessment

1. **No vetting anywhere.** OpenDock ranks popularity/maintenance; HOL scores
   metadata and explicitly disclaims its scanner; awesome-list is human
   taste without any risk signal; cafe is admin review. For supply-chain
   cautiousness, HOL's disclaimer plus OpenDock's maintenance lamp are the
   only honest signals, and neither is a security audit.
2. **Registry vs list**: OpenDock and HOL are queryable directories with
   per-runtime install commands; awesome-opencode is a list that happens to
   have structured data; opencode.cafe is a forum-shaped marketplace.
3. **Commercial pressure**: HOL sells placement; OpenDock sells nothing
   (observed); awesome-list is neutral CC0; cafe sells nothing (observed).
4. **Relevant finds for this repo's `src/plugins/` work** (from OpenDock
   leaderboard, highest-signal): Magic Context (cortexkit — the plugin whose
   source we have consulted before), tarquinen/opencode-dcp (context pruning),
   ranjithrajv/opencode-usage-quota-tracker and opencode-model-recommender
   (sidebar-foot metrics), opencode/claid-quality trackers — candidates for V2
   TUI-plugin evaluation, not yet adopted.

## Practical take

For day-to-day discovery: **OpenDock first** (breadth + freshness + maintenance
flags), **awesome-opencode second** (verifiable curation), HOL when comparing
cross-runtime/with security-metadata lens, opencode.cafe only as community
discussion. Remember OpenCode's actual install path is unchanged regardless of
which directory you find a plugin through: npm package name or Git spec into the
`plugin` config key, or local files under `plugins/`.
