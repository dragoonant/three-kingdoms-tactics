# 31 — Hero figures (v0.3, 2026-11-01)

The owner asked for unique models of the major generals (2026-11-01). Until the art milestone (M5, Gemini concepts → Hunyuan GLBs on the owner's PC), heroes are **procedural rigs built in three.js**. They follow the project's earlier large-head figure style (KB `local-ai-studios.md`; since replaced for generated art by the house style in tabletop-kb rule 7 and mallet-42k `docs/FIGURE-STYLE.md`, owner 2026-10-31): about 2–2.5 heads tall, the head about 40% of the height and as wide as the shoulders, a small torso, short thick legs with chunky feet, and oversized hands and weapons. **No bases** (owner, 2026-11-01: "I don't want them on bases. I want their movement on feet and on horse to be animated"): boots and hooves stand directly on the ground plane at y = 0, and the figures walk, run and ride. The rig contract (`src/client/figures/rig.ts`) is what the board and the battle cut-ins animate, so a GLB can replace a procedural body later without touching either.

**IP:** every design below comes from the public-domain novel and traditional opera and temple iconography (Guan Yu's red face and long beard, Zhang Fei's serpent spear, Lu Bu's pheasant feathers). We draw our own versions. They must not resemble any video-game character design or any commercial Three Kingdoms figure line: no mecha parts, V-fins or visors, and no text on the figures.

**Silhouette test:** at board scale (about 60 px tall), each hero must be identifiable from its silhouette and two colours alone. The checklist is a contact sheet of all heroes side by side, front and three-quarter views.

## Identity table (one visual clause per hero; the builder follows it literally)
| id | Look | Colours | Signature | Mount |
|---|---|---|---|---|
| liu-bei | **the shortest of the brothers: the 1.0 reference height (novel: 7.5 chi)**; kind round face with a small moustache; **very large earlobes** and **long arms with big hands** (both from the novel); hair in a topknot with a small gold crown pin | jade green robe over light lamellar, cream sleeves, gold trim | **twin swords**, one in each hand, short and broad | — (infantry) |
| guan-yu | **the tallest of the brothers: 1.15x Liu Bei's height on the body (novel: 9 chi against Liu Bei's 7.5), about 2.7 heads so he reads tall and dignified, the same scale on his horse**; **deep red face**, narrow phoenix eyes, **long black beard reaching the belt**, which sways when he moves | green headscarf and long green robe over dark armour, gold belt | **crescent glaive**: a long pole, a wide crescent blade and a dragon-head socket; the tallest weapon in the game | chestnut horse with a dark mane |
| zhang-fei | **1.07x Liu Bei's height and noticeably broader (novel: 8 chi)**; dark ruddy face (not red like Guan Yu's), **round staring eyes**, **bristling black whiskers** fanning out like a tiger's, open shouting mouth | black and deep blue armour, iron studs, **over it a red cape (the `cape` joint, with sway), a red waist sash with hanging ends and a red tassel on the spear** | **serpent spear**: a long pole with a wavy, snake-like blade | — (infantry) |
| zhao-yun | young clean-shaven face, calm | **white and silver** armour, white cape, blue sash | long straight spear with a red tassel | **white horse** |
| zhuge-liang | serene face with a thin beard; **tall black scholar's hat** | white crane robe with black trim | **crane-feather fan** held up | — (archers) |
| lu-bu | fierce face; **two very long pheasant feathers** arching back from a gold headpiece (the tallest silhouette) | red and gold armour, black under-robe | **twin-crescent halberd**: crescent blades on both sides of the spear tip | **red horse** with a flame-coloured mane |
| cao-cao | sharp face, goatee, narrowed eyes | black and deep purple armour, gold edges, black cloak with red lining | straight sword held low; commander's helmet with a small crest | black horse |

Supporting heroes reuse a **named-officer kit**: a generic large-head body with a per-officer palette, headgear and weapon from data. They get unique designs later. This covers Jian Yong, Zou Jing, Mi Zhu, Sun Qian, Guan Ping, Xiahou Dun (eyepatch), Xiahou Yuan, Zhang Liao, Cheng Yuanzhi, Deng Mao, Zhang Bao (Taoist robe and talisman sword), Zhou Yu, Huang Gai, Gan Ning (bells on his belt) and the rest.

**The brothers' relative scale (owner note 2026-11-01).** Guan Yu 1.15, Zhang Fei 1.07, Liu Bei 1.0, applied to the whole body and the horse (`HERO_SCALE` in `heroes.ts`; the figure's parts sit in a scaled child of the rig group, and `rig.bodyScale` tells callers to pass distances divided by it). The lab's `group=brothers` sheet shows the three side by side at that scale.

## Troops (for battle cut-ins and later the board)
Four troops per kit, sharing one body with per-side colours:
- **infantry**: spear and round shield;
- **archer**: bow and quiver;
- **cavalry**: a rider on a short-legged large-head horse;
- **rebel**: Yellow Turban: a yellow headscarf, a ragged tunic and a spear or farm fork.

Side palettes come from the theme tokens (`--han` jade, `--yellow` ochre, `--cao` slate, `--dong` red-black, `--lu` purple).

## Animation joints (contract)
`root, hips, torso, head, armL, armR, handL, handR, legL, legR, weapon` (parented to `handR`), `offhand` (parented to `handL`), optional `cape` and `beard` (secondary sway), and on mounts `horse.{body, neck, head, legFL, legFR, legBL, legBR, tail}`. Optional joints: `footL`, `footR` (the boot hangs from an ankle joint so the sole can stay level on the sand while the leg swings) and, on mounts, `hoofFL`, `hoofFR`, `hoofBL`, `hoofBR` (the hoof hangs from a pastern joint). Rest pose: standing, weapon ready, soles at y = 0. Each joint rotates about its own pivot. Clips are code (keyframes over named joints), not baked files.

## Implementation notes (v0.2, procedural builders landed)
- **Files** (`src/client/figures/`): `kit.ts` (cached geometry and material builder), `parts.ts` (the shared body, faces, hair, helmets), `gear.ts` (capes, beards, glaive, serpent spear, halberd, fan, feathers), `horse.ts`, `heroes.ts` (the seven), `officerKit.ts` (every other officer by id, default look by troop type and side), `troops.ts`, `clips.ts`, `index.ts` (the frozen factory).
- **Scale:** 1 unit = one tile. A foot figure is about 0.85-1.0 tall including its headgear (head 0.36 wide = the shoulders; head about 0.34-0.43 of the height, 2.3-2.7 heads); weapons and feathers rise above that (Guan Yu's glaive tip about 1.7 on foot, Lu Bu's feather tips about 2.0 on foot and 2.3 mounted). There is no base: `rig.footprint` (optional, also `group.userData.ringRadius`) is the radius of the ground ring the board paints under the figure, 0.35 (0.44 mounted). The root sits at y = 0.014 so the soles are on y = 0 (hip height 0.184 above the ground; ankle 0.132 below the hip). The rider's `root` is a child of `mount.joints.body`; `saddleY` is measured from the horse root.
- **Rest pose and clips:** each builder records every joint's rest transform in `userData.rest`. `clips.ts` returns deltas from rest (`idle`, the locomotion clips below, `drawBow`, `swingOverhead`, `thrust`, `kneel`, `stagger`, `fallBack`, `fallForward`, `travel`, `mix`), and `applyClip(rig, clip)` sets rest + delta on every joint (joints the clip does not name return to rest). All clips are pure and exactly at rest at progress 0.
- **Mounts:** `buildHeroRig(id, { mounted })` mounts the four riding heroes unless `mounted: false`; the board mounts a hero only when the unit's troop type is cavalry. `{ own: true }` gives the rig its own materials so the board can tint them (dim, flash, glow).
- **Lab:** `figure-lab.html` shows turntables, officer-kit samples, the troop matrix, variants and horses. Params: `mode=front|threequarter|silhouette`, `rotate=0`, `scale=board` (67 px per tile, a hero about 60 px tall), `group=heroes|officers|troops|variants|horses|all`, `only=<ids>`, `yaw=<radians>`, `clip=drawBow|swing|thrust|fall|walk|gallop&p=<0..1>`, `view=locomotion` (see below), `test=1` (sets `window.__lab.ready`). `tools/shoot-figures.mjs` and `tools/shoot-board.mjs` write the review sheets to `e2e-out/figures/`.

## Locomotion (v0.3, 2026-11-01)
Everything that moves is animated on its feet or on a horse, by pure clips in `clips.ts` with the foot solver and gait tables in `gait.ts` (unit-tested in `tests/unit/locomotion.test.ts`).

**Foot contact, no skating.** Every gait clip takes the **distance travelled** (rig units, tiles of the figure's own scale), never the time: cycle phase = distance / stride length. A figure that speeds up, slows down or stops keeps its feet where they were put. Inside a clip each foot is solved from its place on the ground: in stance it is pinned to a fixed world point while the hips move over it, in swing it follows a lifted arc. The legs are rigid pieces pivoting at the hip (person) or shoulder / hip (horse) with the boot or hoof on an ankle joint that keeps it level; the solver finds the swing angle that puts the foot's contact point where it should be and slides the leg joint a hair into the hips so the sole sits exactly on y = 0 (stance) or on the lifted arc (swing). The tests carry a figure along its path and measure the lowest vertex of every boot and hoof: planted feet drift under 2 cm of a tile in mid-stance, and nothing sinks.

**Gaits** (stride = distance per full cycle, two steps; duty = share of the cycle a foot is down):
| Gait | Stride | Duty | Notes |
|---|---|---|---|
| walk (foot) | 0.37 | 0.54 | alternating legs, arms counter-swing (the weapon arm nearly still), hips bob, slight lean, head steady |
| run (foot) | 0.62 | 0.40 | flight phase with a hop, forward lean 0.24, arms pump |
| horse walk | 0.38 | 0.72 | four-beat lateral: hind-left, fore-left, hind-right, fore-right |
| trot | 0.66 | 0.44 | two beats, diagonal pairs (fore-left + hind-right, fore-right + hind-left), suspension between |
| canter | 0.94 | 0.34 | three beats: hind-left, then hind-right with fore-left, then fore-right, then suspension |
| gallop | 1.45 | 0.22 | four beats: hind-left, hind-right, fore-left, fore-right, then a long suspension; body pitch, neck and head bob, tail streaming |

The short legs of the large-head body cap the stride, so the cadence is quick: a march at 1.5 tiles per second steps about four times a second. `gaitBlend(mounted, speed)` picks the gait from the speed (foot: walk, run from about 1.7 tiles per second; mounted: walk, trot from 1.05, canter from 2.2, gallop from 4.2) and cross-fades over 14% either side; `locomotion(rig, distance, speed, time)` returns the blended clip, idling when the speed is near zero.

**The rider** is seated astride: the thighs fall around the barrel, the seat follows the horse's bob and pitch, the legs grip with a small counter-swing, the torso leans into the gait, the weapon arm keeps its pose, and the cape and beard stream with the speed.

**Other clips:** `stepTurn(angle)` (small alternating steps while turning on the spot, feet planted as the body turns), `kneel(p)` (archers: one knee on the sand, rear shin lying on it), `stagger(p)` + `staggerShift(p)` (hit and reeling back one step on a planted foot; the caller moves the figure by the shift), `fallBack(p)` and `fallForward(p)` (fall about the heels and end lying flat on the sand, on the back or the face), `drawBow`, `swingOverhead`, `thrust`.

**On the board** a unit is a rig (hero, officer kit or troop by type and side) and walks (foot) or trots and canters (riders) along the engine's path, turning with `stepTurn` at the start and end and swinging through corners; the base's jobs (side colour, facing, actable, selected, targetable, done) are a flat ground ring decal on the sand (50-presentation.md).

**Lab "Locomotion" view:** `figure-lab.html?view=locomotion&gait=walk|run|trot|canter|gallop&t=<seconds>&lanes=0,1,2,3,4&bare=1` shows a hero, an infantryman, an archer, a cavalry rider and a mounted hero side-on on a treadmill strip (the stripes slide back at the gait's speed, so a planted foot stays on its stripe). `t` freezes the frame (`window.__lab.setT(t)` moves it); `bare=1` hides skirts and robes so the legs can be judged. `tools/shoot-locomotion.mjs` writes an 8-phase contact sheet per gait.
