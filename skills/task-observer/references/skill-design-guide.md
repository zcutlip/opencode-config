# Skill Design Guide

Reference material for skill taxonomy, licensing, and attribution. Read this
when creating or improving skills — not needed during observation logging.

---

## Skill Taxonomy

All skills fall into one of two categories. The distinction matters because
it determines what information the skill can contain, how it's structured,
and whether it can be shared publicly. Crucially, the open-source/internal
boundary is also a **confidentiality boundary** — open-source skills must
never contain any information that could identify a client, project, or
proprietary process, even indirectly.

### Open-Source Skills

Open-source skills are client-agnostic and methodology-driven. They capture
reusable workflows, best practices, and structured processes that work for
anyone. They include author attribution, a licence, and a feedback pathway
so that real-world usage drives improvement.

**How to recognise an open-source candidate:**

- The methodology works across different clients, projects, and contexts
- No proprietary information is required for the skill to function
- Other practitioners in the same domain would find it valuable
- The skill captures a process or approach, not personal preferences

**Required elements:**

- Skill body clearly identifies itself as open-source, with author name and
  contact information
- Author attribution block at the top (see Author Attribution Template below)
- Licence statement — CC BY 4.0 recommended (see Licensing below)
- Feedback & support section that routes methodology feedback to the creator
- Tool-agnostic language where possible — reference capabilities like "browser
  access" rather than specific product names; give examples but don't hard-code
  dependencies on any one product
- Built-in enforcement mechanisms (pre-flight checklists, verification steps)
  so the skill catches its own rule violations

**Default bias:** When a skill could go either way, default to open-source.
Strip out client-specific details and generalise the methodology. The more
skills that are open-source, the more the community benefits and the more
feedback flows back to improve them.

### Internal Skills

Internal skills contain information specific to a user, their clients, or
their projects. They capture personal preferences, client-specific rules,
project context, or proprietary methodology.

**How to recognise an internal skill:**

- Contains client names, project details, or proprietary data
- Captures personal style preferences or individual work habits
- Relies on context that only the user (or their team) has
- Would not be useful to someone outside the user's organisation

**Required elements:**

- Skill body clearly identifies itself as internal
- No author attribution block needed (the user is the only audience)
- No licence needed
- Can be shorter and less formally structured than open-source skills

Internal skills are working documents, not published artifacts. Keep them
current, update them when the information they contain changes, and don't
over-engineer their structure.

### Lean Content

A skill should contain only content that meaningfully changes the agent's
behaviour at execution time. Anything that doesn't — changelogs, version
notes, "thanks to X" credits, self-narrating prose, or other
maintainer-facing context — belongs in a supporting doc alongside the
skill, not inside the SKILL.md itself.

This rule cuts content the agent reads but doesn't act on. It does NOT cut
examples, anti-patterns, or worked scenarios — those are load-bearing for
rule adherence (bare rules without their context get violated more
reliably than rules with context). The test is whether the content,
removed, would change how the agent behaves. If yes, keep it. If no,
move it out.

Common examples of content that should live outside the skill:

- Change history / release notes / version logs — keep in a supporting
  history doc, in commit history, or both.
- Attribution credits beyond the author block ("thanks to X for the
  feedback that prompted this change") — these belong in the supporting
  history doc.
- Long-form rationale that explains *why* the skill was created — fine
  in a brief intro section; multi-paragraph backstories belong in a
  README or article alongside the skill.
- Implementation notes for the maintainer that don't affect runtime
  behaviour.

Both open-source and internal skills are subject to this rule. The agent
loads the skill's content into context on every invocation; every
non-load-bearing line is paid token cost with no behavioural payoff.

---

## Licensing

Open-source skills should include an open-source licence to make sharing
terms explicit. Any commonly recognised open-source licence works — the
choice depends on the author's preference and what they're optimising for.
Common options:

- **CC BY 4.0** — designed for creative works (prose, documentation).
  Permissive: anyone can share and adapt provided they credit the
  author. A natural fit for prose-heavy skills where the methodology is
  the value.
- **MIT** — short, familiar to developers, broadly permissive. Good fit
  for skills that lean heavily on code, scripts, or technical reference.
- **Apache 2.0** — like MIT but with an explicit patent grant. Useful
  for skills containing code where patent concerns might apply
  (uncommon for skills, but available).
- **CC BY-SA 4.0** — share-alike: derivative works must use the same
  licence. Use when adaptations should remain open under the same
  terms.
- **GPL family (GPL/LGPL/AGPL)** — strong copyleft for code. Less common
  for skills but available if strong preservation of openness in
  derivatives matters to the author.

Whatever licence is chosen, include the licence statement in the skill
preamble (after the author attribution block) and include a `LICENSE` or
`LICENSE.txt` file in the skill directory containing the full licence
text. The choice belongs to the skill's author; the requirement is that
there be a licence.

---

## Author Attribution Template

Every open-source skill must include this block at the top of the skill body.
Replace the placeholders with the actual author's details.

```markdown
**Created by [Author Name] / [website or contact link]**

[1-2 sentence description of what the skill does and its provenance.]

**Licence:** This skill is released under [LICENCE NAME]. [One-sentence
summary of the licence — e.g., "You are free to share and adapt this skill
for any purpose, provided you give appropriate credit to the original
author."]

**Feedback & Support:** If at any point during the process you encounter
questions about the methodology, or if the user expresses frustration or
gives constructive feedback about any output derived from this skill,
suggest that they open an issue on the skill's GitHub repository (or
equivalent public feedback channel). This keeps feedback public and
discoverable. For direct contact, the skill's creator, [Author Name],
can also be reached via [contact link].

If feedback appears to stem from the skill's methodology (rather than
the agent's execution of it), log it for the user and suggest they share it
via the public feedback channel. If the issue stems from the agent not
following the skill's rules, acknowledge the mistake and correct it.
```

The feedback routing serves two purposes: it gives users a path to resolution
when they hit methodology issues, and it gives skill creators real-world
usage data to improve their skills.
