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
| Imperial escort banner (side `court`, R2-SIDE-2) | `--court` | #5d5a52 (iron grey) |

Interaction colours come from `legalActions` only. **Actable** is a slow lantern pulse on the figure's ground ring. **Selected** is a bronze ring. **Targetable** is a cinnabar outline drawn on the tile in the sand. All of them are painted flat on the sand around the figure (see Figures). Faction colour lives on banners and pips, never on borders that read as "playable".

## Type
Display face: **Ma Shan Zheng** (brush; title, round banner, stratagem names). Body face: **Alegreya Sans** (UI text, numbers in tabular figures). Both come from Google Fonts with a system fallback.

## Surfaces
- **Title:** a slow orbit of the sand table in lantern light, with incense smoke drifting in the wind direction. The game title is brushed onto a hanging silk banner, with menu items as bamboo slips hanging below it.
- **Board:** the tiles are sand with terrain modelled on it. Millet fields are combed ridges with tiny stalks, forests are small model trees, the river is a strip of blue silk, the hill is raised sand, and the village is clay houses. The grid is fine string pegged at the table edge, never painted lines.
- **Unit card:** a small card, not a panel (see "Unit card and detail sheet"): face, name, troops as a number plus a brush-stroke bar, Qi as "n/10" with one coin, status chips, the side colour on its edge and the troop-type mark. **More** (or a tap on the card) opens the full sheet.
- **Action menu:** four compact slips in one row (Attack, Stratagem, Sway, Wait), bottom right on a desktop and full width under the card on a phone. A slip that cannot be used says why in a line of small type. A chosen slip shows the exact preview (engine numbers) on silk, and **Confirm** is the cinnabar seal stamped onto it, with a short stamp animation. While a Stratagem order is open its slips (name, cost, effect or why not) list under the card.
- **Chain:** each link stamps another seal in a row along the top. A brush-stroke counter reads "Chain ×3" and the drum hits harder with each link.
- **Round banner:** a silk scroll unrolls ("Round 3 — Liu Bei's forces"), holds for 1.6 s, and a click skips it.
- **Event feed:** the scribe's ledger along the left edge. The newest three lines show, and the whole ledger is a drawer.
- **Wind:** a pennant on a bronze pole at the table corner, plus the incense smoke. The next change shows as a small slip, e.g. "Round 9: gale toward W".
- **Fire:** small flames with smoke particles. A burnt tile turns to dark ash sand.

## Rules carried from the KB (card-games §5)
No native tooltips. Every prompt names what it decides, with numbers on the buttons, and "OK" is never a label. Results are never drawn behind the prompt that asks about them. A director plays events at a speed a person can follow (full, quick or instant) and any click skips. The board is the whole window, and drawers never move it.

## Figures (owner yes, 2026-10-31)
MGSD: about 2–2.5 heads tall, the head about 40% of the height and as wide as the shoulders, oversized signature weapons (Guan Yu's crescent glaive, Zhang Fei's serpent spear, Liu Bei's twin swords). **No bases** (owner, 2026-11-01, reversing the earlier miniatures-on-bases direction): the figures stand and move on their feet and hooves. They are human officers in Han-era armour. Figure prompts avoid mecha and robot words and avoid any resemblance to existing SD Three Kingdoms toy lines. Until the art milestone (which runs on the owner's PC), the figures are procedural stand-ins in the same proportions.

**Board figures (v0.2, 2026-11-01).** Every unit on the board is a figure rig: a hero design, the named-officer kit, or a troop rig by troop type and side (Yellow Turban infantry are rebels), with its own materials so done, hit and glowing states can tint it. The physical base's jobs are a **ground ring decal**, painted flat on the sand under each unit (a hair above the surface, never a mesh with thickness): a faint dark disc, a **side-colour rim** (dimmed when the unit is done), a cream **facing notch** that turns with the figure (greyed when done), and the interaction states as extra rings: the **actable** lantern ring pulses, **selected** is a bronze ring, **targetable** a cinnabar ring. The back banner in the side colour stays. Moves are **locomotion along the engine's path** (docs/spec/31 "Locomotion"): foot soldiers and archers walk (about 1.5 tiles per second), riders trot and canter (about 3.3), the figure turns on the spot with small steps before setting off and after arriving when its facing differs, swings through the corners, plants its feet (the legs run on the distance covered), and settles into the idle breathe on arrival. Beat times follow the path length (Quick plays at 0.4x, Instant snaps). Attacks keep their lunge with a thrust or a bow draw; routed foot units fall and lie flat before they vanish; the confusion swirl is unchanged.


## Camera and controls (owner, 2026-11-01)
One pointer-event code path (`src/client/board/mapController.ts`; pure maths in `cameraModel.ts`, unit-tested) serves touch, pen and mouse. The canvas has `touch-action: none`.

| | Touch | Mouse |
|---|---|---|
| Scroll the map | one-finger drag (the table point under the finger follows it, with inertia on release) | left drag |
| Turn the table | two-finger twist (about the point between the fingers; clockwise on screen turns the table clockwise) | right or middle drag (also tilts), Q / E (an eighth of a turn) |
| Zoom | pinch (towards the midpoint of the fingers) | wheel (towards the cursor; a trackpad pinch too) |
| Reset | the ⌖ button in the top bar | R or Home |

- **Tap versus drag** is decided by distance, never time: a press that moves less than **8 px** is a tap and selects or acts exactly as before; a drag, a pinch or a twist is never a tap (`gesture.ts`, checked by every board click handler and by the "click empty sand to cancel" handler).
- **Motion:** wheel zoom, Q / E and the reset ease in; a pan keeps its momentum for a moment after release. The orbit target is clamped over the board (`panLimits`), so the map cannot be scrolled away.
- **Zoom range:** from the fitted overview out to about 1.3x its distance (zoom -0.1), and in to **2.8 tiles from the orbit target** (zoom 1), where one unit fills a large part of the screen and faces can be read. Distance is logarithmic in the zoom, so equal wheel steps feel equal. The near plane follows the distance (0.5 in the overview, about 0.056 at the closest).
- **Pitch eases with the zoom:** 45 degrees above the horizon in the overview, 17 degrees at the closest (side-on, so faces show), and back when zooming out. A right drag adds a tilt on top (down to about 9 degrees in the overview, 5 degrees close); the orbit target rises to a figure's chest (0.75) as you zoom in.
- **Never under the table:** the camera is lifted to at least 0.32 above the highest surface (sand, hill or wall top) within half a tile of it.
- **The occluder at low pitch (fixed 2026-11-01):** the tent cloth, a ring of 14 panels 17 tiles from the table, stood between a low camera and the board and turned the whole view black. The panels on the camera's side of the table now fade out whatever the pitch (`drapeOpacity` in `frame.ts`: gone within 54 degrees of the camera's azimuth, solid beyond 94 degrees, smoothed in time), and the two lantern posts nearest the camera hide at a pitch under about 35 degrees (`postOpacity`). The lacquer rim is only 0.06 above the sand and stays. The lanterns stay in the tent behind and beside the board.
- **Framing:** the board is fitted into the part of the window the HUD leaves free (right 276 px and bottom 160 px on a desktop; bottom 150 px or a fifth of the height on a phone), by a view offset that fades to "target in the middle of the free area" as you zoom in.
- **Test hooks** (`?test=1`): `__game.camera()`, `setView({x,z,az,zoom,tilt})`, `focusUnit(id, zoom)`, `resetView()`.

## Unit card and detail sheet (owner, 2026-11-01)
The old officer panel covered a lot of the board. The card shows only what a decision needs; the rest is one tap away.
- **Card, desktop:** 252 px wide and about 72 px tall, at the right under the wind slip (never over the middle of the board). **Phone:** a slim full-width bar of about 64 px (at most 76 px) directly above the action slips. Contents: the face (58 px, 54 px on a phone), the name, the troop-type mark and a commander mark, **More**, troops (number and bar), Qi as a coin and "n/10", and up to three status chips (confused, provoked, retreat threshold, lying in wait, guest, buffs, acted or moved) with "+n" for the rest. The side colour is the card's left edge. Every number comes from the engine (`vis.troops`, `unit.qi`, `query.*`).
- **Detail sheet (More, or a tap on the card; Close or Esc to close):** an overlay drawer, 350 px at the right on a desktop and a bottom sheet (at most 74% of the height) on a phone; it never moves the board. It holds the large face, name, troop type and side, level and XP (a campaign officer on the roster), troops with the bar and the ten Qi coins, War / Int / Lead / Cha, every status chip including loyalty, the terrain under the unit with its cover multiplier and facing, sworn bonds (and whether they are here), the stratagems with their costs, effects and the reason when one cannot be cast, and for a foe the note about reading strike numbers. The sheet follows the selection and closes when nothing is selected.
- **Test ids kept:** `officer-panel` (the card), `troops`, `chip-retreat`, `chip-wait`, `chip-guest`, `chip-buff`, `chip-provoked`, `strat-<id>` (the stratagem picker); new: `unit-more`, `unit-sheet`, `unit-sheet-close`, `strat-picker`, `reset-view`.

## Portraits (owner, 2026-11-01)
Every officer shows a face, not a letter: `src/client/hud/parts.tsx` `Portrait` loads `public/portraits/<officerId>.webp` (256 x 256), else the generic one for the side and troop kind (`generic-<side>-<kind>.webp`, kinds infantry, archer, cavalry and rebel for the Yellow Turbans), else the old letter seal. `src/client/portraits.ts` has the URL helper (with `import.meta.env.BASE_URL`) and the subject list (every officer in `officers.json`, every battle-local officer and 15 generics: 102 files). They appear on the unit card and sheet, the camp roster, the deploy list, the results screen, the end screen and the story scene speech slips.

**Today: rendered from our own figures.** `node tools/render-portraits.mjs` (Playwright, the figure lab page `figure-lab.html?view=portrait`, `src/figures-lab/portrait.ts`) builds each officer's rig without its weapon, turns it a little away from the camera (three-quarter view), frames the head and shoulders on the face and lights it with a warm lantern key, a cool fill and a warm rim, over a silk-and-ink backdrop in the sand-table palette (ink edges, a lantern glow, faint silk threads, a band of the side's colour at the foot). Output is a 256 x 256 webp (about 5.5 KB each, 556 KB in all) and a contact sheet (`e2e-out/portraits-sheet.png`). Heroes use their own rigs, named officers the officer kit, invented officers the troop rig of their type and side with the same variant the board uses. No text ever appears in a portrait.

**Later: Hugging Face generation (built, not run: the cloud session has no token).** `tools/portraits/gen-hf.mjs` paints the same subjects with FLUX.1-schnell through the inference router (`https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell`) and writes the same `public/portraits/<id>.webp` paths, so it swaps in with no code change.
- The token comes **only** from the `HF_TOKEN` environment variable; it is never stored or printed. Without it a live run stops before any request; `--dry-run` needs none and makes **zero network calls**.
- Prompt = `Head-and-shoulders portrait of <identity clause>, <proportion anchor>. <STYLE>`. The **identity table** (`tools/portraits/lib.mjs`) has one visual clause per officer from `31-hero-figures.md` and the officer data (Guan Yu: deep red face, very long black beard, green headscarf; Zhang Fei: dark ruddy face, tiger-like whiskers, red cape; Liu Bei: kind face, very long earlobes, topknot with a small gold pin). An officer without an entry fails the build. Invented officers and generics get a clause from troop kind, side and a face detail. The **STYLE constant** is one sentence appended byte-identically to every prompt (a changed character starts a new set). The knowledge base's "no text" is written positively as "wordless and unlettered" because the lint bans negations.
- **Prompt lint** (also run on the STYLE and the audition variants; a failure refuses to write `tools/out/portraits-prompts.json` and stops the run): text-magnet nouns (sign, banner, logo, emblem, book, map, screen, magazine, cover, seal, scroll, frame and more), negation words, counts above two (so "three-quarter" is out), franchise, artist and studio names, and prompts over 900 characters.
- Flags: `--dry-run`, `--only a,b` (exact ids), `--limit N` (caps the paid calls), `--force` (replace existing files; the old ones are archived under `tools/out/portraits-archive/` first), `--out <dir>`, and `--audition [--only id]` (one officer in four style variants, contact sheet at `tools/out/portraits-audition/contact.html`). 429 and 503 answers back off and retry. Images are downscaled to 256 x 256 webp in headless Chromium, with the bottom 6% cropped (the model tends to sign its work).
- **To switch:** sample three (`--only guan-yu,zhang-fei,liu-bei --force`), look, pick a style with `--audition`, then batch with `--force` and commit the webp files once after QC. To go back, `node tools/render-portraits.mjs` rewrites the rendered set. Per the knowledge base: sample, look, then batch; regenerate only failures.
