# Cyberpunk Theme

**Inspiration:** Classic cyberpunk and synthwave aesthetics — neon on deep purple-black, the visual language of Blade Runner, Tron: Legacy, and every synthwave album cover from 2015 onwards. The nightclub, not the corporate terminal.

**Aesthetic:** Deep purple-black backgrounds, hot pink and magenta as brand colors, electric cyan as the primary interactive color, neon green for success states, icy blue-white text. Maximum chromatic energy. Where Korp Net is Arasaka, this is After Dark.

## Color Palette

| Name | Hex | Role |
| --- | --- | --- |
| `cyber-black` | `#0d0221` | Main background — deep purple-black, not pure black |
| `cyber-dark` | `#1a0533` | Panel/elevated background |
| `cyber-purple` | `#2d1b4e` | Element/card background |
| `cyber-pink` | `#ff2a6d` | Hot pink — readable accent for emphasis you need to actually see |
| `cyber-magenta` | `#ff00ff` | Pure electric magenta — decorative accent, borders, keywords |
| `cyber-cyan` | `#00ffff` | Bright cyan — primary interactive color, highest contrast against purple-black |
| `cyber-blue` | `#05d9e8` | Teal-cyan — muted/secondary text, desaturated alternative to full cyan |
| `cyber-green` | `#39ff14` | Neon green — success/confirmation |
| `cyber-yellow` | `#f9f002` | Electric yellow — warning |
| `cyber-orange` | `#ff6b35` | Warm orange — secondary warm accent |
| `cyber-white` | `#d1f7ff` | Icy blue-white — primary text, not pure white |

## Theme Token Mapping

### UI Base

| Token | Dark | Light |
| --- | --- | --- |
| `primary` | `#00ffff` | `#00ffff` |
| `secondary` | `#ff00ff` | `#ff00ff` |
| `accent` | `#ff2a6d` | `#ff2a6d` |
| `error` | `#ff2a6d` | `#ff2a6d` |
| `warning` | `#f9f002` | `#f9f002` |
| `success` | `#39ff14` | `#39ff14` |
| `info` | `#00ffff` | `#05d9e8` |

### Text & Background

| Token | Dark | Light |
| --- | --- | --- |
| `text` | `#d1f7ff` | `#0d0221` |
| `textMuted` | `#05d9e8` | `#2d1b4e` |
| `background` | `#0d0221` | `#d1f7ff` |
| `backgroundPanel` | `#1a0533` | `#e0e0e0` |
| `backgroundElement` | `#2d1b4e` | `#cccccc` |

### Borders

| Token | Dark | Light |
| --- | --- | --- |
| `border` | `#ff00ff` | `#2d1b4e` |
| `borderActive` | `#00ffff` | `#ff2a6d` |
| `borderSubtle` | `#2d1b4e` | `#aaaaaa` |

### Syntax Highlighting

| Token | Dark | Light |
| --- | --- | --- |
| `syntaxComment` | `#ff79c6` | `#8b5cf6` |
| `syntaxKeyword` | `#ff00ff` | `#ff00ff` |
| `syntaxFunction` | `#00ffff` | `#05d9e8` |
| `syntaxVariable` | `#39ff14` | `#39ff14` |
| `syntaxString` | `#f9f002` | `#ff6b35` |
| `syntaxNumber` | `#ff6b35` | `#ff6b35` |
| `syntaxType` | `#ff2a6d` | `#ff2a6d` |
| `syntaxOperator` | `#00ffff` | `#05d9e8` |
| `syntaxPunctuation` | `#d1f7ff` | `#0d0221` |

### Markdown

| Token | Dark | Light |
| --- | --- | --- |
| `markdownText` | `#d1f7ff` | `#0d0221` |
| `markdownHeading` | `#ff2a6d` | `#ff00ff` |
| `markdownLink` | `#00ffff` | `#05d9e8` |
| `markdownLinkText` | `#39ff14` | `#39ff14` |
| `markdownCode` | `#39ff14` | `#39ff14` |
| `markdownCodeBlock` | `#39ff14` | `#39ff14` |
| `markdownBlockQuote` | `#f9f002` | `#ff6b35` |
| `markdownEmph` | `#00ffff` | `#05d9e8` |
| `markdownStrong` | `#ff2a6d` | `#ff00ff` |
| `markdownHorizontalRule` | `#ff00ff` | `#2d1b4e` |
| `markdownListItem` | `#00ffff` | `#05d9e8` |
| `markdownListEnumeration` | `#39ff14` | `#39ff14` |
| `markdownImage` | `#f9f002` | `#ff6b35` |
| `markdownImageText` | `#ff6b35` | `#f9f002` |

### Diffs

| Token | Dark | Light |
| --- | --- | --- |
| `diffAdded` | `#39ff14` | `#39ff14` |
| `diffRemoved` | `#ff2a6d` | `#ff2a6d` |
| `diffContext` | `#2d1b4e` | `#2d1b4e` |
| `diffHunkHeader` | `#00ffff` | `#00ffff` |
| `diffHighlightAdded` | `#39ff14` | `#39ff14` |
| `diffHighlightRemoved` | `#ff2a6d` | `#ff2a6d` |
| `diffAddedBg` | `#0d3d3d` | `#d0ffd0` |
| `diffRemovedBg` | `#3d0d2d` | `#ffd0d0` |
| `diffContextBg` | `#1a0533` | `#e0e0e0` |
| `diffLineNumber` | `#05d9e8` | `#2d1b4e` |
| `diffAddedLineNumberBg` | `#0d3d3d` | `#d0ffd0` |
| `diffRemovedLineNumberBg` | `#3d0d2d` | `#ffd0d0` |

## Design Notes for Porting

### The Purple-Black Foundation

The 3-tier background system (`#0d0221` → `#1a0533` → `#2d1b4e`) works because these aren't pure black — they have a strong blue-purple undertone. Magenta and cyan borders "pop" against purple-black in a way they can't against pure `#000000`, because the hue continuity creates visual cohesion. Each tier is slightly lighter and more saturated than the last, so panels feel "embedded" in the UI rather than floating on top of it.

When porting to a terminal app with limited color slots, two tiers (`#0d0221` and `#1a0533`) is the minimum. If you need one more, add `#2d1b4e`. If your terminal emulator crushes near-blacks into a uniform `#000000`, prioritize getting `#1a0533` right — it's the most visible background layer and the one users notice.

### Cyan as Primary, Not Pink

Despite being "the pink/purple theme," `cyber-cyan (#00ffff)` is the `primary` color. This is intentional. Cyan has the highest contrast against purple-black backgrounds of any color in the palette. Pink and magenta are lower contrast against the purple backgrounds — they're accents, not workhorses.

If your target app only has one accent slot, use `#00ffff`. It will read as "interactive" and "clickable" while still feeling unmistakably cyberpunk. In terminal-based tools where you may have only one ANSI color to work with beyond the standard 8, cyan is the correct choice.

The hierarchy: Cyan is for interaction and structure (links, borders, primary actions). Pink is for emphasis you need to read (headings, strong text, errors). Magenta is for emphasis you need to feel (borders, keywords, dividers). Each serves a distinct cognitive role.

### The Two-Pink Strategy

`cyber-pink (#ff2a6d)` and `cyber-magenta (#ff00ff)` are not interchangeable. Pink is warmer — it has red mixed in — which makes it readable at small sizes. It's used for labels, status indicators, and text emphasis where legibility matters. Magenta is pure electric — balanced red and blue — which makes it visually striking but harder to parse as text. It's reserved for decorative elements: borders, horizontal rules, and syntax keywords where impact matters more than readability.

When porting to a limited palette where you can only keep one, keep pink and drop magenta. Replace magenta assignments with pink (for emphasis) or cyan (for structure). Swapping them the other way — using magenta where pink appears — makes headings feel harsh and noisy.

### Muted Text That Stays Alive

`textMuted` uses `cyber-blue (#05d9e8)` instead of grey. In a neon-on-dark theme, grey looks dead and disconnected from the rest of the palette — it reads as a mistake, not an intentional design choice. Teal-muted text stays chromatically alive while clearly reading as "less important" than the bright cyan primary.

The shift from `#00ffff` (primary, for interactive elements and body text emphasis) to `#05d9e8` (muted, for secondary labels and metadata) signals information hierarchy without switching hue families. The user's eye stays in the same visual world.

When porting: if your terminal app doesn't have a muted text concept, just use the primary text color (`#d1f7ff`). Do not fall back to ANSI "bright black" grey — it will read as a color error in a neon theme context.

### Warm Breaks in a Cool Palette

The cyberpunk palette is dominated by cool colors (cyan, blue, purple, magenta). Yellow and orange are the warm breaks. Without them, the theme feels sterile and monochromatic.

`cyber-yellow (#f9f002)` anchors warnings and dark-mode string literals. It provides the highest chromatic contrast against purple-black backgrounds, making warning states impossible to miss. `cyber-orange (#ff6b35)` is the "calmer" warm — used in light mode where full yellow would be too aggressive on a light background, and for numbers in syntax highlighting where yellow would overwhelm the surrounding tokens.

When porting: you can drop orange if needed and use yellow everywhere for warm accents, but do not drop the warm accent entirely. A purely cool palette wears out the user's color perception. The warm break is what makes the cool palette feel intentional rather than accidental.

### Syntax Highlighting Rationale

Token assignments follow a semantic hierarchy tuned for dense code reading in a neon terminal:

- **Keywords (`#ff00ff`)** — Structural. Keywords define program control flow. They get the most electric color because they carry the most cognitive weight.
- **Functions (`#00ffff`)** — Interactive. Functions are "things you call" — they share the primary interactive color with clickable UI elements. In code, they feel actionable.
- **Variables (`#39ff14`)** — Distinct but subordinate. Green is warm enough to stand out from the cool palette but not so prominent that every variable reference fights for attention.
- **Strings (`#f9f002` / `#ff6b35`)** — The warm break. String literals are the one place the palette goes warm, making them instantly distinguishable from surrounding tokens. Yellow in dark mode, orange in light mode for readability.
- **Types (`#ff2a6d`)** — Important enough to notice, not important enough for magenta. Type annotations need to be visible but secondary to the code they annotate.
- **Comments (`#ff79c6` dark / `#8b5cf6` light)** — Chromatic but subordinate. These are one-off values, not in the main defs. Dark mode uses a soft pink that's clearly present but not distracting. Light mode uses a muted purple. In both cases, comments stay chromatically alive while reading as ancillary.
- **Operators (`#00ffff`)** — Same family as functions. Structural but less prominent than keywords. In a terminal, operators are often single characters and don't need to scream.
- **Punctuation (`#d1f7ff`)** — Body text color. Nearly invisible. Punctuation should not compete with meaningful tokens for attention.

When porting syntax highlighting to another terminal app: if you can only assign 4-5 token colors, prioritize keywords, strings, comments, and functions. Drop variables first (use body text color). Drop types second (use the same color as keywords or functions, whichever feels calmer in your app).

### Diff Backgrounds and Tinted Context

Diff backgrounds are intentionally tinted:

- `#0d3d3d` (green-tinted) for added lines
- `#3d0d2d` (pink-tinted) for removed lines

These are not neutral grays. In a neon theme, neutral gray diff backgrounds would look like dead zones — patches of un-themed space breaking the visual continuity. Tinted backgrounds extend the color language into the diff gutter, making line modifications feel like part of the UI rather than glitches overlaid on it.

When porting diff views: tint your backgrounds toward your accent colors. Added lines → tint toward your success/highlight color. Removed lines → tint toward your error color. Even a subtle 10-15% tint is enough to feel intentional.

### What Makes It "Cyberpunk" vs Generic Dark

| Element | Cyberpunk | Generic dark theme |
| --- | --- | --- |
| Dominant accent | Cyan + magenta + pink (3 neon accents) | Usually 1-2 accent colors |
| Background depth | 3 tiers of deep purple (`#0d0221` → `#1a0533` → `#2d1b4e`) | Often 2 tiers, neutral black |
| Borders | Magenta, electric, visible | Grey or body-color, low contrast |
| Text tones | Icy blue-white + teal-muted | White + cool grey |
| Energy | Neon, chromatic, nightclub | Calm, neutral, coder-aesthetic |
| Warm breaks | Yellow/orange for strings and warnings | Often none or blue-tinted |

## Quick Port Checklist

For porting this palette to another terminal-based app.

### Minimum viable palette (5 colors)

| # | Role | Hex |
| --- | --- | --- |
| 1 | Background | `#0d0221` |
| 2 | Text | `#d1f7ff` |
| 3 | Primary/accent | `#00ffff` |
| 4 | Error/accent2 | `#ff2a6d` |
| 5 | Success | `#39ff14` |

### If you have 8+ color slots, add

| # | Role | Hex |
| --- | --- | --- |
| 6 | Muted text | `#05d9e8` |
| 7 | Borders | `#ff00ff` |
| 8 | Warning | `#f9f002` |

### Hues that must stay accurate

Leave these exactly as they are, or the theme loses its identity:

- **Cyan (`#00ffff`)** — Shift this toward teal or blue and the theme reads as "purple-themed" instead of "cyberpunk." Cyan is the primary — changing its hue changes the entire feel.
- **Pink (`#ff2a6d`)** — Shift toward red and you get Korp Net territory. Shift toward purple and you lose the warmth that makes it readable at small sizes.

### Hues you can shift slightly

- **Backgrounds** — As long as they stay in the blue-purple range (`hue 260-280`), exact values don't matter much. If your terminal crushes `#0d0221` to black, start at `#1a0310` or something visibly dark-purple.
- **Yellow/orange** — Any warm accent works here. `#ffe600`, `#ffcc00`, even `#ffaa00` — just keep it warm.
- **Green** — Any neon green works. `#39ff14` isn't sacred; `#00ff41`, `#3cff00` are fine.

### What NOT to do

- **Don't use grey for muted text.** Use a desaturated version of the primary or accent color instead. Grey in a neon theme reads as an error.
- **Don't use pure `#000000` for backgrounds.** The purple undertone is load-bearing. Pure black kills the neon effect.
- **Don't swap pink and magenta.** They serve different roles — pink is readable text emphasis, magenta is decorative impact. Swapping them degrades both.
- **Don't add blue as a primary accent.** Cyan (`#00ffff`) is already the cool primary. Adding blue creates chromatic confusion between "clickable" and "informational."
- **Don't drop the warm accent.** Yellow/orange is the palette's release valve. Without it, prolonged use feels like staring at a blue LED.
