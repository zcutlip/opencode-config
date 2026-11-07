# Korp Net Theme

**Inspiration:** [Korp Net](https://github.com/pdanzma/korp-net) by pdanzma — a dystopian corporate terminal CSS theme for Kagi Search, built in the style of Cyberpunk 2077's brutalist UI.

**Aesthetic:** Void black backgrounds, aggressive corporate red as the sole brand color, sterile white text, muted grey subtext. No neon, no purple, no cyan. Arasaka terminal, not a nightclub.

## Color Palette

| Name | Hex | Role |
|---|---|---|
| `korp-black` | `#050505` | Main background — absolute void black |
| `korp-terminal` | `#0A0A0A` | Panel/elevated background — barely lighter |
| `korp-dark` | `#0E0E17` | Element/card background — slight purple undertone |
| `korp-dark-elevated` | `#16162a` | Elevated element background |
| `korp-red` | `#ff003c` | **Primary brand color.** The one that matters. |
| `korp-red-bright` | `#FF3B45` | Brighter red for accents, active states |
| `korp-red-dim` | `#801020` | Dimmed red (legacy — no longer used in foreground) |
| `korp-white` | `#e5e5e5` | Primary text |
| `korp-grey` | `#a0a0a0` | Muted/secondary text |
| `korp-grey-dark` | `#666666` | Deeper muted text (light mode) |
| `korp-amber` | `#ff9500` | Warning/caution color |
| `korp-cyan` | `#00d4ff` | Info color (legacy — no longer used in markdown) |
| `korp-green` | `#39ff14` | Success/confirmation color |

## Theme Token Mapping

### UI Base
| Token | Dark | Light |
|---|---|---|
| `primary` | `#ff003c` | `#ff003c` |
| `secondary` | `#a0a0a0` | `#666666` |
| `accent` | `#FF3B45` | `#FF3B45` |
| `error` | `#ff003c` | `#ff003c` |
| `warning` | `#ff9500` | `#ff9500` |
| `success` | `#39ff14` | `#39ff14` |
| `info` | `#00d4ff` | `#00d4ff` |

### Text & Background
| Token | Dark | Light |
|---|---|---|
| `text` | `#e5e5e5` | `#050505` |
| `textMuted` | `#a08888` | `#886666` |
| `background` | `#050505` | `#f0f0f0` |
| `backgroundPanel` | `#0A0A0A` | `#e0e0e0` |
| `backgroundElement` | `#0E0E17` | `#cccccc` |

### Borders
| Token | Dark | Light |
|---|---|---|
| `border` | `#cc1540` | `#cc3344` |
| `borderActive` | `#ff003c` | `#ff003c` |
| `borderSubtle` | `#16162a` | `#bbbbbb` |

### Syntax Highlighting
| Token | Dark | Light |
|---|---|---|
| `syntaxComment` | `#a0a0a0` | `#888888` |
| `syntaxKeyword` | `#ff003c` | `#ff003c` |
| `syntaxFunction` | `#00d4ff` | `#0088aa` |
| `syntaxVariable` | `#e5e5e5` | `#111111` |
| `syntaxString` | `#ff9500` | `#cc7700` |
| `syntaxNumber` | `#FF3B45` | `#FF3B45` |
| `syntaxType` | `#FF3B45` | `#FF3B45` |
| `syntaxOperator` | `#ff003c` | `#ff003c` |
| `syntaxPunctuation` | `#a0a0a0` | `#888888` |

### Markdown
| Token | Dark | Light |
|---|---|---|
| `markdownText` | `#e5e5e5` | `#111111` |
| `markdownHeading` | `#ff003c` | `#ff003c` |
| `markdownLink` | `#ff003c` | `#ff003c` |
| `markdownLinkText` | `#FF3B45` | `#FF3B45` |
| `markdownCode` | `#ff003c` | `#ff003c` |
| `markdownCodeBlock` | `#ff003c` | `#ff003c` |
| `markdownBlockQuote` | `#a0a0a0` | `#666666` |
| `markdownEmph` | `#ff003c` | `#ff003c` |
| `markdownStrong` | `#ff003c` | `#ff003c` |
| `markdownHorizontalRule` | `#801020` | `#cc8899` |
| `markdownListItem` | `#FF3B45` | `#FF3B45` |
| `markdownListEnumeration` | `#ff9500` | `#cc7700` |
| `markdownImage` | `#ff9500` | `#cc7700` |
| `markdownImageText` | `#a0a0a0` | `#666666` |

### Diffs
| Token | Dark | Light |
|---|---|---|
| `diffAdded` | `#39ff14` | `#228822` |
| `diffRemoved` | `#ff003c` | `#ff003c` |
| `diffContext` | `#a0a0a0` | `#666666` |
| `diffHunkHeader` | `#ff9500` | `#ff9500` |
| `diffHighlightAdded` | `#39ff14` | `#44cc44` |
| `diffHighlightRemoved` | `#FF3B45` | `#FF3B45` |
| `diffAddedBg` | `#051a05` | `#d0ffd0` |
| `diffRemovedBg` | `#1a0508` | `#ffd0d5` |
| `diffContextBg` | `#0A0A0A` | `#e0e0e0` |
| `diffLineNumber` | `#801020` | `#666666` |
| `diffAddedLineNumberBg` | `#051a05` | `#d0ffd0` |
| `diffRemovedLineNumberBg` | `#1a0508` | `#ffd0d5` |

## Design Notes for Porting

### The Red Visibility Problem

Assigning red to low-surface-area tokens (agent labels, dialog chrome, diff views) makes a theme that *technically* uses red but doesn't *feel* red in normal use. The fix: move red onto high-frequency tokens that dominate the viewport.

**High-impact red targets** (the tokens you're staring at all day):
- Inline code and code blocks — constant in chat/agent output
- Links and emphasis — apps show these frequently
- Borders — anchor every panel in the UI
- Muted/secondary text — tints the entire header/status area

**Keep neutral:**
- Primary body text — readability killer if tinted
- Comments — need to stay subtle
- Punctuation — noise if colored

### What Makes It "Korp Net" vs Generic Dark

| Element | Korp Net | Generic dark theme |
|---|---|---|
| Dominant accent | Red only (no blue/green/purple competition) | Usually 2-3 accent colors |
| Background depth | 3 tiers of near-black (`#050505` → `#0A0A0A` → `#0E0E17`) | Often 2 tiers, lighter |
| Borders | Red, visible even on black (`#cc1540`) | Grey or body-color, low contrast |
| Text tones | White + warm reddish-grey (`#a08888`) | White + cool grey |
| Energy | Aggressive, corporate, brutalist | Calm, neutral, coder-aesthetic |
