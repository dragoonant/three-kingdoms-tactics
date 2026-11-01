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

Reject and re-roll anything that fails. Do not name any game, studio, toy line or franchise in a prompt. Avoid mecha, robot, visor and V-fin words.

## Shared style sentence (byte-identical in every prompt)
`Single collectible tabletop miniature figure, super-deformed proportions: the head is about 40 percent of the total height and as wide as the shoulders, the whole figure about two and a half heads tall, tiny torso, short stubby legs with big chunky boots, short arms with oversized hands, oversized weapon. Crisp hand-painted miniature finish with fine sculpted detail, ancient Chinese Han-dynasty armour and robes. Full body, front three-quarter view, standing on a plain round black base. Plain white background, even soft studio lighting, no shadows, no text, no lettering, no logos.`

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
