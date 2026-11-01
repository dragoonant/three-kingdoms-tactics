# 52 · Crowds for the battle cut-ins (PLAN D22)

Module: `src/client/cutins/crowd.ts` (+ `crowd/` helpers). Demo: figure lab `?view=crowds` (see "Lab"). Tests: `tests/unit/crowds.test.ts`.
This file describes the API and how a scene should use it; it does not change 51 (the cut-in scenes are wired by the scene owner).

## What it is
One `Crowd` is 1 to about 40 troops of **one kind and one side palette** standing in a formation:

| Kind | Default formation | Layout |
|---|---|---|
| infantry | `block` | ranks x files, about 1.5 x sqrt(n) files, last rank short and centred |
| archer | `line` | one rank up to 14 wide, two staggered ranks beyond |
| cavalry | `wedge` | apex first, row r holds r+1 horsemen |
| rebel | `mob` | a jittered grid relaxed so nobody overlaps, no straight lines |

Any kind can take any formation (`formation`, `spacing`, `jitter`, `files`, `seed`). Slots are in the crowd's local space: **+Z forward (toward the enemy), the front rank at z = 0, the middle of the front rank at x = 0**; the crowd is placed with `origin` and turned with `facing` (yaw, 0 faces +Z). **Member 0 is the middle of the front rank (the wedge apex) and members are ordered front first, centre out**, so "the first K" is the front of the formation.

Rendering, the point of the module:

- **Front rank (`frontRankFull`, default 5; 3 for cavalry): full rigs** from `figures.buildTroop(kind, side, variant)`, one `Group` each (`member.rig`), 40-100 draw calls apiece. `frontRankMode: 'hi'` draws them instead as the same geometry merged per joint and instanced (about 12 draw calls for the lot): same picture, no per-rig draw calls, but the scene cannot pose them by hand.
- **Everyone behind: instanced.** The rig is baked once per (kind, side, variant, detail) into one merged geometry per joint (material baked into vertex colours, roughness and metalness per vertex): torso, hips, head, arms (weapon, shield and hands are folded into the arm they hang from), legs, boots, and for cavalry the horse's body, neck, head, tail, four legs and four hooves. Each becomes one `InstancedMesh` per variant (front-faced and double-faced parts separately), so 27 footmen cost about 24 draw calls and 27 riders about 50 (variants = 2). `detail: 'lo'` (default) rebuilds the generated primitives (spheres, lathes, capsules, ...) with fewer segments: about 3.5k triangles per footman and 5.9k per rider against 17.8k and 35.9k for the rig. The weapon arm of an archer carries its arrow as a separate part so it can vanish on the loose.
- **The same clips.** Every frame each member's clip (`locomotion` / `walk` / `run` / `trot` / `canter` / `gallop` / `kneel` / `drawBow` / `stagger` / `stepTurn` / `fallBack` / `fallForward`, from `figures/clips.ts`) is applied with `applyClip` to a joint-only copy of the rig and the instance matrix of every part is `memberMatrix x jointWorldMatrix`. Front rank and instanced ranks are posed by the identical code path, so they cannot drift apart (a test compares joints of an instanced member with a full rig posed with the same clip).
- **Variation (seeded):** 2 troop variants by default (`variants` 1..3: headgear, shield, weapon angle), +-3% size, a small constant head turn, lean and heading wobble, an idle phase offset, and a gait **cycle offset** per member (`cadence` 0 in step .. 1 random; drilled formations 0.3, wedge 0.45, mob 1).
- **No bases, feet on the sand.** The gait phase is **distance driven** (phase = distance / stride, `crowd.march` integrates the distance in closed form), so feet do not skate, exactly as for the heroes (docs/spec/31 "Locomotion"). Falls end lying flat on the sand: the lift of each lying pose is measured once per crowd from the baked geometry.

## Scale and units
All positions and speeds are **world units** (tiles), like the scenes'. The crowd is built at the cut-in miniature scale, `scale = 0.45 / (the infantry rig's height)` (the same number `poseKit.fitFigure` gives the heroes), exported as `crowdScale()`; pass `scale` to override. Speeds that read well: infantry walk 0.4-0.6, run 1.0-1.6; riders walk 0.5-0.8, canter about 1.0, gallop 1.8+ (gaits cross-fade by speed exactly as `locomotion()` does for a single rig).

## API
```ts
import { createCrowd } from '../cutins/crowd'            // scenes under src/client/cutins/scenes use '../crowd'

const crowd = createCrowd({
  kind: 'infantry', side: 'han', count: 28,
  formation: 'block',                 // default by kind
  seed: 7,                            // everything below is a pure function of it
  origin: [x, 0, z], facing: yaw,     // front-rank middle, and which way it faces
  frontRankFull: 5,                   // rigs in the front (default 5, cavalry 3)
  frontRankMode: 'rig',               // or 'hi' (instanced at full detail)
  // optional: spacing (multiplier or {x,z} rig units), jitter, files, variants, detail, cadence, scale, castShadow
})
group.add(crowd.group)                // an Object3D; add it where the troops should stand
// each frame, with the scene time:
crowd.update(t)
// ... commands (below) ...
crowd.dispose()                       // when the scene is torn down
```

| | |
|---|---|
| `crowd.group` | `Group` holding the full rigs and the instanced meshes (positioned at `origin`, yawed by `facing`) |
| `crowd.members[i]` | `{ index, full, detail: 'rig'/'hi'/'lo', variant, rig (full rigs only), slot, position (crowd-local, live), heading, state, height, scale }`; `state` is `idle`, `turn`, `march`, `kneel`, `stagger`, `down`, `flung`, `fled` |
| `crowd.frontRank` | indices of the front rank (middle first); `crowd.select('front' | 'rear' | 'full' | 'instanced' | 'all')` |
| `crowd.pick(n, seed, from?)` | n members from a selection, the same every time: for "N of them fall" |
| `crowd.positionOf(i, out?, world?)` | ground position of a member (for arrows and impacts) |
| `crowd.jointPosition(i, 'head' \| 'handR' \| 'weapon' \| 'h:body' ..., out?, world?)` | where a joint is after the last update (release point of an arrow, impact height) |
| `crowd.update(t, dt?)` | pose everything at scene time `t` (a no-op if `t` and the commands did not change) |
| `crowd.stats()` | members, full, instanced, draw calls, triangles |

### Commands
Every command takes `{ members?: MemberSel, at?: number }` in its options: who (default everyone; the fallen and routed ignore later orders) and the scene time it happens (default: the time of the last `update`). `MemberSel` is `'all' | 'front' | 'rear' | 'full' | 'instanced' | number[]`.

| Command | Effect |
|---|---|
| `march(dir \| waypoints, speed, { ramp?, gait? })` | `[x, z]` marches straight along that direction for ever; `[[x,z], ...]` steers the formation's centre through the waypoints (crowd-local), the whole formation turning and keeping its shape. Members first turn on the spot (`stepTurn`) if they face elsewhere, then speed up over `ramp` (0.5 s). Gait follows the speed unless `gait` forces one |
| `halt({ decel? })` | slow to a stop (0.4 s) and stand |
| `face([x, z])` | turn on the spot |
| `kneel()` / `stand()` | down on one knee (alternating legs per member; infantry and archers, not riders) / back up |
| `draw(p?)` / `loose()` | archers. `draw(p)` **holds** the draw at p (0..1; call it every frame to drive it from the scene, repeats do not pile up), `draw()` draws fully over `dur` (0.9 s). `loose()` snaps the string hand forward, the arrow leaves the bow and stays gone until the next `draw` |
| `stagger(members?, { hold?, dur? })` | hit and reeling back one step (`stagger` clip, the body moves back by `staggerShift`), recovers after `hold` (0.5 s, `Infinity` to stay) |
| `fall(members, 'back' \| 'forward' \| 'fling', impulse?, { apex?, dur? })` | `back` / `forward`: `fallBack` / `fallForward`, sliding by `impulse` (a distance, default 0.2 / 0.12, away from where it faces, or a vector `[x, z]` whose length is the distance) and lying flat. `fling`: a ballistic, tumbling body (apex 0.7, default distance 1.5, a whole somersault, a little seeded scatter) that lands, slides a little and lies flat on its back. Riders: the horse topples onto its side and the rider is thrown from the seat; a flung rider cartwheels |
| `flee(members?, { dir?, speed? })` | turn and run away (default straight back, speed 1.5 with +-15% per member); routed members keep running until the scene ends |

### Determinism, scrubbing and the scene's "pure function of t"
The scene calls `crowd.update(t)` every frame; commands are **events on the crowd's own timeline**, so the picture is a pure function of (seed, commands, t):

- Evaluating at `t` uses only commands with `at <= t`; `update` can jump to any `t`, forwards or back.
- A command identical to the one already running for the same members (the scene calling `march(...)` every frame) is ignored.
- Issuing a command at a time earlier than the latest recorded one drops the later ones (the scene replays them as it goes), so scrubbing a scene back and forth stays consistent. Alternatively a scene may schedule all its commands up front with explicit `at` in ascending order (the lab does this) and only call `update(t)`.
- Position is integrated in closed form from the commands; `dt` is never used.

## How a scene should use it
1. **Build in the scene's setup:** `createCrowd({ kind, side, count, seed, origin, facing })` per side, `add(crowd.group)`. Use the unit's troop kind and side palette (docs/spec/51); `count` about 20-30 per side (cavalry 14-20: a rider is twice a footman). Seed from the event id so the same event looks the same.
2. **Hero and officers stay your own rigs** (Puppet / `fitFigure`). The crowd's front rank is the "full rig" tier of D22; the hero stands in front of or inside it. Keep crowd members clear of the hero's path: members are not avoided.
3. **Per frame:** `crowd.update(t)`. For beats, call commands with the beat time: advancing troops `march([0, 1], 0.6, { at: cue.start })`; archers `kneel({ members: 'front' })`, then `draw(p)` or `draw()`, then `loose()` at the volley cue, and read `crowd.jointPosition(i, 'weapon', v, true)` for each arrow's start; the shock `stagger('front')`, then the plan's N falls with `fall(crowd.pick(n, seed, 'front'), 'back')` and `'fling'` for the hardest hit, the rest of a routed unit `flee('all')`.
4. **Targets for arrows and impacts:** `crowd.positionOf(i, v, true)` (ground) and `jointPosition(i, 'torso', v, true)` (chest) in world space.
5. **Particles** (dust, hoof dust) stay the scene's: footfalls are not exposed per member; use `members[i].state === 'march'` and `speed` from `crowd.frame(i).speed` to emit dust from marching members.
6. **Budget:** 2 crowds of 30 (one cavalry) with `frontRankFull` 3 as rigs is about 500 draw calls per pass (shadow pass doubles it); with `frontRankMode: 'hi'` about 150 per pass. Each instanced variant costs its own draw calls: `variants: 1` halves them. Shadows from the instanced meshes cost another pass: pass `castShadow: false` for crowds out of the key light's frame.
7. **Dispose** with the scene: `crowd.dispose()` frees the instance buffers and releases the shared baked geometry (reference counted); `disposeCrowds()` frees every cache (tests, hot reload).

## Lab
Figure lab (`figure-lab.html`): `?view=crowds&scene=infantry|archers|cavalry|rebels|all|perf&cam=side|three|front&t=<s>&zoom=<k>&n=<members>&full=<rigs>&mode=rig|hi&detail=lo|hi&shadow=0|1`. Each scene is scripted with timed commands (infantry stand, march, run, halt; archers kneel front, draw, loose, draw, loose; cavalry walk, canter, gallop, some thrown; rebels stagger, fall back / forward / fling, flee). With `t` the frame is frozen (and `window.__lab.setT(s)` moves it); without it the scene plays. `tools/shoot-crowds.mjs` takes contact sheets (`--times 0,1,2`) and perf numbers (`--perf`).

## Known limits
- One kind and one side palette per crowd; build a crowd per kind (cavalry in front of infantry, say).
- Members do not avoid each other: formation spacing keeps them apart while marching straight; hard turns of a path rotate the formation rigidly (outer members travel farther without a longer stride).
- A footman's spear butt and a rider's lance reach below the sand by design (as on the board rigs); falls are lifted by the body, not the weapon.
- Clips are those of `figures/clips.ts`; the cavalry stagger and topple and the flung-body pose are crowd-local (`crowd/motion.ts`) because the rig clips have none.
- Software GL (SwiftShader) is bound by triangles, not draw calls: 2 crowds x 30 (infantry block + cavalry wedge, `frontRankMode: 'hi'`, 3 full-detail in front) measured 0.50 s per frame at 1280x720 without shadows and 0.83 s with the shadow pass (an empty lab frame is about 0.10 s); the crowd update itself is about 1 ms of CPU per frame for 60 members. On a real GPU the same scene is a few hundred thousand triangles per pass.
