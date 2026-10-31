# 50 — Presentation: "The War-Council Sand Table"

**Concept (owner yes, 2026-10-31):** the battle is played on a sand-table model in a general's command tent at night. Hanging lanterns light the scene and the tent walls sway around the edges. The MGSD figures are the war pieces. Orders are written on bamboo slips and confirmed with a red cinnabar seal. Every surface comes from this one idea (KB README rule 21).

## Must not look like
Mallet-42k, Legion Forge (Starbound palette), Xross Forge (esports broadcast, neon), lorecannae (gold filigree, centred serif menu, star card backs). The gate before the first playable ships: screenshots of the title, the battle select and a mid-battle board, placed beside the last two siblings. If any of them could be mistaken for a sibling, it is not done.

## Palette (CSS tokens in `src/client/theme.css`)
| Role | Token | Value |
|---|---|---|
| Tent night (background) | `--night` | #14100d |
| Lacquer (panels) | `--lacquer` | #3a1410 |
| Silk (text panels) | `--silk` | #efe6d2 |
| Ink (text on silk) | `--ink` | #1b1a17 |
| Bamboo (slips, frames) | `--bamboo` | #c9b27c |
| Bronze (rules, borders) | `--bronze` | #a07a3a |
| Lantern glow (highlights) | `--lantern` | #f2b45a |
| Cinnabar (seal, confirm, damage) | `--cinnabar` | #c8372d |
| Han banner | `--han` | #2f6b5e (jade) |
| Yellow Turban banner | `--yellow` | #d4a72c (ochre) |

Interaction colours come from `legalActions` only. **Actable** is a slow lantern pulse on the figure's base. **Selected** is a bronze ring. **Targetable** is a cinnabar outline drawn on the tile in the sand. Faction colour lives on banners and pips, never on borders that read as "playable".

## Type
Display face: **Ma Shan Zheng** (brush; title, round banner, stratagem names). Body face: **Alegreya Sans** (UI text, numbers in tabular figures). Both come from Google Fonts with a system fallback.

## Surfaces
- **Title:** a slow orbit of the sand table in lantern light, with incense smoke drifting in the wind direction. The game title is brushed onto a hanging silk banner, with menu items as bamboo slips hanging below it.
- **Board:** the tiles are sand with terrain modelled on it. Millet fields are combed ridges with tiny stalks, forests are small model trees, the river is a strip of blue silk, the hill is raised sand, and the village is clay houses. The grid is fine string pegged at the table edge, never painted lines.
- **Officer panel:** a vertical bamboo slip showing the portrait, troops as a number plus a brush-stroke bar, Qi as 10 small bronze coins, then stats and stratagems.
- **Action menu:** slips fanned out from the panel. A chosen slip shows the exact preview (engine numbers) on silk, and **Confirm** is the cinnabar seal stamped onto it, with a short stamp animation.
- **Chain:** each link stamps another seal in a row along the top. A brush-stroke counter reads "Chain ×3" and the drum hits harder with each link.
- **Round banner:** a silk scroll unrolls ("Round 3 — Liu Bei's forces"), holds for 1.6 s, and a click skips it.
- **Event feed:** the scribe's ledger along the left edge. The newest three lines show, and the whole ledger is a drawer.
- **Wind:** a pennant on a bronze pole at the table corner, plus the incense smoke. The next change shows as a small slip, e.g. "Round 9: gale toward W".
- **Fire:** small flames with smoke particles. A burnt tile turns to dark ash sand.

## Rules carried from the KB (card-games §5)
No native tooltips. Every prompt names what it decides, with numbers on the buttons, and "OK" is never a label. Results are never drawn behind the prompt that asks about them. A director plays events at a speed a person can follow (full, quick or instant) and any click skips. The board is the whole window, and drawers never move it.

## Figures (owner yes, 2026-10-31)
MGSD: about 2–2.5 heads tall, the head about 40% of the height and as wide as the shoulders, oversized signature weapons (Guan Yu's crescent glaive, Zhang Fei's serpent spear, Liu Bei's twin swords), and a plain round black base. They are human officers in Han-era armour. Figure prompts avoid mecha and robot words and avoid any resemblance to existing SD Three Kingdoms toy lines. Until the art milestone (which runs on the owner's PC), the figures are procedural stand-ins in the same proportions.
