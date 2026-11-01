# Hero concept prompts: Gemini batch 1 (Liu Bei, Guan Yu, Zhang Fei)

These are for **Gemini via Claude in Chrome on the owner's PC** (evilaegis), the M5 pipeline: concept PNG → Hunyuan GLB. The rules come from the KB (`local-ai-studios.md`, `card-games.md` §7, README rule 13):
- one chat for the three brothers;
- generate a base figure first, then make variants by editing that image;
- never paste from the clipboard; add reference images only through the hidden file input;
- about 30 images per evening.

The designs come from `docs/spec/31-hero-figures.md`, and the procedural figures in `figure-lab.html` are the pose and colour reference.

**Gate for each image, measured from the image itself:**
- the head is about 35–40% of the figure's height and about as wide as the shoulders;
- the figure is about 2–2.5 heads tall;
- there is exactly one figure, on a round black base, against a plain white background;
- there is no text, logo or watermark;
- the weapon is in the hand, with no duplicate weapons, missing limbs or fused parts.

Reject and re-roll anything that fails. Do not name any game, studio, product line or franchise in a prompt. Avoid mecha, robot, visor and V-fin words, and the owner's banned proportion labels (see the global CLAUDE.md 'Image prompts'): describe the figure only in measurements and materials.

## Shared style sentence (byte-identical in every prompt)
`Single collectible tabletop miniature figure, serious and highly detailed: the head is about 40 percent of the total height and as wide as the shoulders, the whole figure about two and a half heads tall, compact torso, short thick legs with big heavy boots, short arms with oversized hands, oversized weapon. Crisp hand-painted miniature finish with fine sculpted detail, ancient Chinese Han-dynasty armour and robes. Full body, front three-quarter view, standing on a plain round black base. Plain white background, even soft studio lighting, no shadows, no text, no lettering, no logos.`

## 1. Liu Bei
`[STYLE] The subject: a kind, gentle young warlord with a round friendly face, a small neat moustache, very large earlobes and noticeably long arms with big hands. Hair tied in a topknot with a small gold crown pin. Jade-green robe over light lamellar armour with cream sleeves and gold trim. He holds a short broad straight sword in each hand, one raised, one low.`

## 2. Guan Yu
`[STYLE] The subject: a towering, dignified general with a deep red face, narrow upswept eyes and a long flowing black beard in several strands that reaches down to his belt. Green headscarf and long green robe over dark armour, gold belt. He holds a huge long-handled crescent glaive upright beside him, the wide curved blade above his head and a dragon-head socket where the blade meets the pole; the glaive is the tallest thing in the image.`

## 3. Zhang Fei
`[STYLE] The subject: a fierce, loud warrior with a dark ruddy face, round staring eyes, a wide open shouting mouth and bristling black whiskers that fan out like a tiger's. Black and deep blue armour with iron studs. He grips a long spear with a wavy, snake-like blade at the tip, held diagonally across his body.`

## After the base images
- Edit variants are made from the approved base image ("keep everything, change only …"), not by re-prompting from scratch.
- Approved PNGs go to `art/hero-concepts/<officer-id>.png`; the masters never enter the repo.
- Then run Hunyuan (`--style 0.2 --avoid` if the style reference turns things blue; `--nocut` for Guan Yu's long robe), decimate to about 10k faces, and finalise to the rig contract in `src/client/figures/rig.ts`. Named joints or sockets are needed so the cut-ins can animate the GLB; until then the procedural rig stays the fallback (PLAN D19).

## Batch 1 results (2026-10-31, run on the owner's PC)
One Gemini chat ("Han-Dynasty Miniature Figure Generation", Pro mode), one prompt per officer, each standalone with the shared style sentence above. All three passed the gate on the first roll, so no re-rolls were needed.

| Officer | Gate check (measured from the image) | Repo file |
|---|---|---|
| liu-bei | head about 37% of height, about 2.6 heads tall, shoulders as wide as the head; twin broad swords, one raised, one low; topknot with gold pin; jade robe, cream sleeves, gold trim; one figure, black base, white background, no text | `art/hero-concepts/liu-bei.png` |
| guan-yu | head about 37%; beard in strands to the belt; green headscarf and robe over dark armour, gold belt; glaive upright with dragon socket, blade above the head, tallest thing in frame | `art/hero-concepts/guan-yu.png` |
| zhang-fei | head about 40%; open shouting mouth, whiskers fanned out; black and deep blue studded armour; serpent spear held diagonally, one weapon only | `art/hero-concepts/zhang-fei.png` |

- `art/hero-concepts/contact-batch1.jpg` is the FYI contact sheet.
- The repo PNGs are square 1536 px crops (figure bounding box plus 10%, resampled) of the full-size downloads, ready for Hunyuan.
- The full-size masters (2752x1536 JPG from Gemini's "Download full size image" button, about 2.2 MB each) and the in-page export bundle live outside the repo in `../three-kingdoms-tactics-masters/hero-concepts/`.
- Export notes: the in-page `img` elements are `blob:` URLs at 1024x572 only; `fetch` on them is blocked, but canvas `drawImage` works. The download button gives the 2752x1536 original, so prefer it for masters. Two download clicks within a few seconds of each other dropped the second; wait for the "Downloading full size" toast to clear before the next click.
- Next: edit variants from these bases in the same chat ("keep everything, change only ..."), then Hunyuan per the section above (`--nocut` for Guan Yu's robe).
