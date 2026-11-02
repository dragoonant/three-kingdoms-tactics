# 51 — Battle cut-ins: "The Table Comes Alive" (v0.2 direction, 2026-11-01)

The owner asked (2026-11-01) for cinematic attack scenes in the spirit of the early-2000s tactics games: archers loosing fire arrows, cavalry charging and riding over troops. This document is the **director's shot list** for the first two scenes. The owner reviews them on the cinema page (`cinema.html`) and gives notes by beat id (e.g. "B4: hold the brace longer"). Revisions are logged at the bottom.

## Concept
When a big action resolves, the camera **dives from the war-council view into the sand table**, and the war pieces come alive at miniature eye level. This is the sand table's own idea (50-presentation), not a cut to a realistic battlefield:
- The soldiers are MGSD figures **without bases** (owner decision 2026-11-01, reversing v0.1's miniatures on bases): boots and hooves stand on the sand, and every moving troop walks, runs or gallops with the locomotion clips (docs/spec/31 "Locomotion"), the leg cycle driven by the distance covered so the feet never skate.
- The ground is the table's sand with that tile's terrain modelled on it.
- The sky is the dark tent, with hanging lanterns as warm bokeh.
- Calligraphy and the cinnabar seal frame the moment.

At the end the camera rises back out to the table, and the board shows the result.

## Rules for every cut-in
- **Length:** 5–8 s for stratagems; a 2–3 s short form for normal attacks (a later pass).
- **Skipping:** any click skips to the result.
- **Setting:** "Battle scenes: Always / Stratagems and chains / Off", default "Stratagems and chains".
- **Determinism:** each scene is a pure function of time t, so the review page can scrub, loop and slow it down. Randomness, such as which rebel falls which way, comes from a seed.
- **Numbers:** they come from the engine event being shown (damage, routs, ignited tiles); the scene never invents results. On the review page they come from a sample event.
- **Hit-stop:** every impact freezes for 0.12–0.18 s and then releases. This is the single biggest "feel" lever.
- **Camera:** one lens per shot with ease-in-out moves; no camera roll except a single whip-pan per scene; shake only on impacts, decaying in 0.3 s.
- **Overlays:**
  - the stratagem name brushes in top-left with the officer's name under it;
  - a "Loose!" or "Charge!" call-out appears once, in cinnabar brush text;
  - the damage number is painted as a cinnabar brush stroke;
  - the seal stamps at the end.
- **Troop counts:** about 20–30 troops per side in a full scene and 10–15 in a short one (v0.4, D22; see "More troops: as built"): the rigged front rank acts, instanced ranks fill in behind. How many fall comes from the damage dealt as a fraction of the target's troops, with at least 1.

---

## Scene A — "Fire Arrows over the Millet" (Jian Yong, *Fire Attack*; 7.0 s)
**Setup:**
- **Han:** Jian Yong (named-officer kit, archer) with 6 Han archers kneeling in a line beside an iron brazier, on plain sand.
- **Rebels:** 7 Yellow Turban rebels standing in a millet field (combed ridges, tall stalks).
- **Wind:** a breeze blows toward the rebels' far side.

| Beat | Time | Shot | Action | Overlay / sound cue (sound comes in M6) |
|---|---|---|---|---|
| A1 | 0.0–0.7 | **Dive.** From the board camera, push down and in toward Jian Yong's tile; the table edge falls out of frame and the depth of field shallows | The pieces wake: a small bounce as they lift from rest | "Fire Attack — Jian Yong" brushes in · *whoosh down* |
| A2 | 0.7–1.9 | **Low, behind the archers**, at shoulder height, slow dolly left to right along the line | Each archer, kneeling on one knee, dips an arrow into the brazier; the tips catch one after another, staggered 0.08 s; Jian Yong stands behind with one hand raised | *crackle, brazier roar* |
| A3 | 1.9–2.6 | **Medium close, side-on** to the line | All draw together, the bows bend, the burning tips shake; Jian Yong's hand drops | "Loose!" call-out · *creak, then release* |
| A4 | 2.6–4.0 | **Tilt up and track the volley**: the arrows climb across the dark tent sky against the lantern bokeh; **0.5× slow motion at the apex (3.1–3.5)** | 18 fire arrows with ember trails, rising in a fan, peaking, then turning down | *rising hiss* |
| A5 | 4.0–5.6 | **Reverse shot from the rebel side**, low in the millet, looking back up at the falling arrows | The arrows thud into the ridges and shields; **flames burst along the ridges and run downwind**; rebels throw up their arms and stagger back a step; N rebels fall about their heels and lie flat (N from damage); embers drift downwind | Hit-stop on the first impact · *thuds, then a whump of fire* |
| A6 | 5.6–7.0 | **Rise to a wide shot** of the burning field, then pull up and out to the table | The fire keeps spreading in the wind direction; survivors back away | "−420" painted in cinnabar · seal stamps · *drum hit* |

## Scene B — "Thundering Charge" (Guan Yu; 7.0 s)
**Setup:**
- **Han:** Guan Yu on his chestnut horse leads 3 Han cavalry in a wedge on open sand.
- **Rebels:** 7 Yellow Turban spearmen stand in a ragged line ahead.
- **Light:** lantern backlight raises dust motes.

| Beat | Time | Shot | Action | Overlay / sound cue |
|---|---|---|---|---|
| B1 | 0.0–0.6 | **Dive** into Guan Yu's tile (as A1) | The pieces wake | "Thundering Charge — Guan Yu" brushes in · *whoosh down* |
| B2 | 0.6–1.6 | **Hero shot**: low front three-quarter on Guan Yu, the camera slowly circling 20° | His horse half-rears; he raises the crescent glaive overhead; his beard and robe sway; dust motes in the backlight | *horse whinny, war drum* |
| B3 | 1.6–3.0 | **Ground-level tracking beside the hooves**: the camera matches the riders' speed, then lets them pull ahead | The wedge goes from trot through canter to gallop (footfall order per gait, leg cycle on the distance covered), a puff of dust kicked up at every hoofbeat; brush-stroke speed lines streak past | "Charge!" call-out · *hoofbeats building* |
| B4 | 3.0–3.6 | **Front view of the rebel line** with the camera shaking more and more | The rebels flinch and stagger back a step on a planted foot; one drops his spear, turns on the spot and runs; the spear tips waver | *shouts* |
| B5 | 3.6–4.4 | **Impact**: a hit-stop freeze for 0.15 s with an ink-splash flash, then the release | The wedge **ploughs through**: rebels are flung back in tumbling arcs as loose-limbed bodies, land, slide a little and lie flat on the sand; Guan Yu's **crescent sweep** leaves an arc trail that knocks two more aside | *crash, bodies, steel* |
| B6 | 4.4–5.8 | **A single whip-pan** to follow the riders out of the far side of the line | The riders wheel round in an arc and Guan Yu raises the glaive again; the fallen rebels lie flat; dust settles | *hoofbeats fading* |
| B7 | 5.8–7.0 | **Pull up and out** to the table | The survivors regroup | "−1,060" painted · seal stamps · *drum hit* |

## Review page (`cinema.html`, deployed to Pages)
- A **scene picker** (A, B), a **gallery** of hero turntables, play and pause, restart, and speed (0.25×, 0.5×, 1×).
- A **timeline scrubber with beat markers A1… / B1…** and the beat list beside it; the current beat is highlighted. Clicking a beat jumps to it.
- A **free camera** toggle for looking around a paused moment.
- Sample numbers for the overlays (damage, falls).

## Integration plan (after the owner's notes)
1. The presentation director gets a `cutin` beat type keyed by stratagem tag: Fire and Volley use scene A's grammar, Charge uses B's, Strike gets a duel variant, Shout a shockwave variant. In a chain, the links play back to back with a seal between them.
2. Shorter normal-attack variants for each troop matchup.
3. Add the setting, and respect the speed modes (Instant skips cut-ins; Quick plays them at 1.5×).

## Owner notes on v0.1 (2026-11-01)
- "I like it so far!!"
- **More troops on screen**: the current 6–9 per side is interim. For v0.2, aim for about 20–30 per side using instanced troop rigs, with the hero and the front rank at full detail.
- **Music**: a high-energy orchestral charge layer plays during each cut-in and is removed after it (PLAN D21, docs/spec/60-audio.md).
- **Frequency**: full scenes for stratagems and chains; 2–3 s short versions for normal attacks (PLAN D20).

---

# v0.3 direction: cut-ins inside real battles (2026-11-01)
The owner asked for cut-ins in actual battles (PLAN D20): **full scenes for stratagems and chains, 2–3 s short scenes for every normal attack**. The charge music layer plays over both (D21). The figures stay procedural (D25). Every number shown comes from the engine event being presented.

## Which scene plays (by stratagem tag)
| Tag | Stratagems (examples) | Scene |
|---|---|---|
| Fire | Fire Attack, Torch Raid, Kindling, Valley Blaze, Fire Ships | **A**, Fire Arrows: the caster's troop kind looses or throws fire; the target tile's terrain burns if the event ignites it |
| Volley | Arrow Rain, Massed Arrows | **A′**: scene A without the brazier and fire; plain arrows, same arc and slow motion |
| Charge | Thundering Charge, Lone Rider | **B**, Thundering Charge |
| Strike | Twin Blades, Crescent Sweep, Serpent Thrust, Mob Rush, Green Dragon Cleave | **C**, Duel Strike (below) |
| Shout | Thunder Roar, Rebel War Cry, Bridge Roar | **D**, Thunder Roar (below) |
| Ruse | Sow Discord, Yellow Sky Hex, Envoy's Tongue | **R**, a 3 s short: the caster gestures and ink-smoke drifts over the targets, which turn dizzy (brush spirals) |
| Command | Call the Storm, Borrow the Wind | **W**, a 3 s short: banners whip round, the incense smoke swings, and a wind-arrow brush stroke shows the new direction |
| Command | Rally, banners, Eight Trigrams, Supply Train | no cut-in (board effect only) |

**The scene is built from the event:**
- The caster appears as their hero rig, or the officer kit, mounted if cavalry.
- The caster's troops use their kind and side palette.
- The defenders use their kind and side palette, standing on the target tile's terrain: millet, forest, hill slope, village, shallows, ship deck or plain sand.
- Damage, falls and routs come from the event: falls = max(1, round(damage / defender troops before × front-rank count)); if the unit was routed, everyone falls or flees.

## Scene C: "Duel Strike" (6.0 s)
| Beat | Time | Shot | Action |
|---|---|---|---|
| C1 | 0.0–0.6 | Dive into the caster's tile | The pieces wake; the title brushes in |
| C2 | 0.6–1.6 | Medium shot tracking beside the hero | The hero goes from walk to run toward the enemy front rank, weapon drawn back, their own troops advancing behind |
| C3 | 1.6–2.4 | Low close-up, **0.5× slow motion 1.9–2.2** | The wind-up for the weapon: twin swords cross, the glaive goes overhead, the spear is drawn back; call-out "Strike!" |
| C4 | 2.4–3.4 | Impact, **0.14 s hit-stop** | The weapon's own trail: twin blades leave an X of two slashes, the glaive a wide arc that hits three, the spear a straight piercing line. The front rank is knocked back and N fall |
| C5 | 3.4–4.8 | Wide | Both lines crash together and the hero's troops pour in; dust |
| C6 | 4.8–6.0 | Pull out | Damage painted, seal |

## Scene D: "Thunder Roar" (6.0 s)
| Beat | Time | Shot | Action |
|---|---|---|---|
| D1 | 0.0–0.6 | Dive | — |
| D2 | 0.6–1.8 | Slow push-in on the hero's face | A deep breath, chest swelling |
| D3 | 1.8–2.6 | Front, camera shake | **ROAR**: mouth wide open, ink-brush shockwave rings expanding across the sand, dust lifting, the lantern bokeh shuddering |
| D4 | 2.6–4.0 | Reverse shot as the rings hit the enemy line | Weapons dropped, rebels stagger and cover their ears, N fall, brush spirals over the confused ones (from the event's confused list) |
| D5 | 4.0–5.0 | Wide | Enemy horses rear (if cavalry); the survivors back away |
| D6 | 5.0–6.0 | Pull out | Damage plus a "Confused ×N" slip, seal |

## Chains
Links play back to back, separated by a 0.4 s seal-stamp interstitial that adds a seal to the chain row. **Links 2 and later skip their dive beat and start at the action beat**, at about 60% of their length, so a 4-link chain stays under about 18 s. The charge music layer plays straight through the chain.

## Short scenes for normal attacks (2.4–3.0 s)
There is no title slip, only a small troop-kind slip. The dive is 0.3 s.
- **S-melee** (infantry attacker):
  - 0.3–1.2: the front rank runs in.
  - 1.2–1.8: the clash, with a 0.10 s hit-stop; N fall.
  - 1.8–2.4: **if there's a counter event**, the defenders shove back and M attackers fall; otherwise the attackers press on.
  - 2.4–2.7: pull out, showing the damage and counter numbers.
- **S-cavalry:** the riders canter in, ride through, then wheel round; then the numbers.
- **S-archer:** the archers loose, the arrows land and N fall; then the numbers. There's never a counter.
- **Facing pays off:** when the arc is side or rear, the camera shows the hit from that side and the call-out reads "**Flank!**" or "**Rear!**". This makes the facing rule visible.

## Settings and pacing
- **Battle scenes:** "Full and short" (default) / "Stratagems and chains only" / "Off".
- **Enemy scenes:** "Same as mine" (default) / "Stratagems only" / "Off".
- **Speed:** Quick plays scenes at 1.5×; Instant skips them.
- **Skipping:** any click skips the current scene and sends `audio.cutinSkip()`.
- **Board sync:** the board result (troop bars, routs, fire) appears as the camera rises back out, never behind a scene that is still playing.

## More troops (D22)
(Built in v0.4: see "More troops: as built" below.) About **20–30 troops per side** on screen. The hero and front rank are full rigs; the ranks behind use instanced, lower-detail troops sharing the same clips (or simplified ones). Formations follow troop kind: the infantry block, the archer line, the cavalry wedge.

## v0.3 as built (2026-11-01)
Code: `src/client/cutins/plan.ts` (pure event to scene mapping, settings rules, falls formula, chain timing), `scenes/act.ts` + `ActWorld.tsx` (scenes C, D, R, W and the shorts), `scenes/fireArrows.ts` (A and A′) and `scenes/thunderingCharge.ts` (B), all parameterised by the plan; `player.ts` and `CutinLayer.tsx` (the in-game player); `presentation/beats.ts` + `director.ts` (the `cutin` beat); `settings.ts` plus the Sound panel (the two settings).
- **Which events a scene stands in for:** from the start of the batch to the first end-of-phase or world event (round or phase start, battle end, fire spread, terrain change, reinforcement). The scene shows the numbers; the board beats (floaters, seals) for the same events run as the camera rises out, and their events are committed at `resultAt` (A 5.9 s, B 6.0, C 5.1, D 5.2, R/W 2.5, shorts just before their pull-out).
- **Dive:** the in-game scene starts from a high view over the sand table and cross-fades in over 0.25 s (it is not a literal camera dive from the board). The layer fades out over the last 0.35 s into the board, which now shows the result.
- **Beat ids:** A1–A6, A′ is V1–V6, B1–B7, C1–C6, D1–D6, R1–R4, W1–W4, melee SM1–SM5, cavalry SC1–SC5, archers SA1–SA5.
- **Short scenes** use 5 troops per side and no hero; the slip reads "Infantry · Officer". Counter: defenders shove back and M attackers fall (M from the counter damage by the same formula); S-archer has none. Side and rear hits turn the defenders away, the camera moves behind the attackers and the call-out reads Flank! or Rear!.
- **Chains:** link 1 plays from 0; links 2+ start at the end of their dive beat at 1/0.6 speed; each non-final link ends at the start of its pull-out, then a 0.4 s interstitial stamps a seal into the chain row (double rim for a bonded link). One `audio.cutinStart` for the whole chain, one `cutinEnd` after the last link, `cutinSkip` on a click.
- **Falls:** `max(1, round(damage / troops before x front))` with front = 7 for A, A′, B, C, D, 5 for the shorts, 4 for R; everyone when routed; none for zero damage. C stages 13 defenders (7 in the front rank).
- **Known limits:** the shooters in A and A′ are always archers in the caster's palette; R and W hide the caster's weapon while he gestures; the hill is a backdrop mound, not a slope the figures stand on. (v0.3 stood a mounted defender in A, A′ and B down as a foot soldier and kept 5–13 troops a side; both are fixed in v0.4 below.)

## More troops: as built (v0.4, 2026-11-01)
The owner asked for "more troops on screen" (D22). Every scene keeps its rigged front-rank figures as the hero-level actors that do the close-up acting; behind them stand **instanced ranks** from the crowd module (docs/spec/52), which run the same clips.
- **Code:** `scenes/ranks.ts` (`spawnRanks`: a crowd at the cut-in scale behind a front rank; `CrowdSet`; `CrowdScript` applies commands in time order; the quality profile); `scenes/actRanks.ts` (the ranks of C, D, R, W and the shorts, scripted from each scene's cues and tracks); A, A′ and B script theirs in `FireArrowsWorld.tsx` and `ThunderingChargeWorld.tsx`. `ActPlan.ranks` (act.ts) says where each crowd stands. Every command is scheduled up front at story time, so a scene is still a pure function of t (scrubbing and capture are exact).
- **Troops per side** (front rigs + ranks, sample plans): A and A′ 25 (6 kneeling archers, Jian Yong, 18 standing archers) against 25 (7 + 18); B 20 riders (Guan Yu, 3 rigs, a squadron of 16) against 25; C 25 against 29; D 23 against 25; R 19 against 24; W 23 (no defenders); S-melee and S-archer 13 against 13; S-cavalry 12 against 13; a mounted defender in A, A′ or B is 17 riders (7 rigs, 10 instanced). Cavalry ranks are smaller (a rider is twice a footman). The background battle adds about 30-37 more a side in full scenes and 14-16 in short ones (docs/spec/52 "Scenes").
- **What the ranks do:** A/A′: the standing archers draw and loose with the kneeling line and each looses one more arrow (a flaming tip in A) into the defenders' ranks; the defenders reel as the arrows land, the plan's share of them falls and the rest back away at the pull-out. B: the squadron gallops with the wedge on the leader's speed profile and reins in short of the line; behind the line, whoever a wedge horse reaches is flung while the plan's falls last, the rest of the lane dashes aside and stands, everyone else reels. C: the hero's troops follow and pour in on the same tracks as the front rank; the defenders' ranks reel back as the shock reaches them. D: the ranks behind the hero surge forward after the roar; the rings reach each defender at ring speed, they reel, the share falls and the survivors back away. R: the defenders reel under the smoke; W: the caster's ranks kneel while the wind is called and stand again (riders' horses shy instead). Shorts: the ranks follow the front rank in and out; S-cavalry's riders rein in short of the line while the wedge rides through the defenders' ranks; S-archer's ranks loose one arrow each.
- **Falls in the ranks:** the same share as the front rank (the plan's falls / front-rank count) in full scenes and half that share in short ones, at least one when anyone fell, none when the attack did no damage; when the unit was routed the survivors flee.
- **Mounted defenders (review fix):** A, A′ and B now show a cavalry defender as riders: the whole side is one cavalry crowd whose first rank (7) are full rigs, standing where the foot line would. Horses rear when hit, topple when they fall, and are flung onto their side by the charge.
- **Short scenes lead with the hero (review fix):** when the attacker is a named officer with a hero design (`figures.heroIds()`), his own figure (mounted for cavalry) takes the middle of the front rank or the wedge's apex.
- **Quality:** `?crowd=full` (default: 2 troop variants, crowd shadows), `?crowd=lite` (also chosen by `?shadows=0`: 60% of the ranks, one variant, no crowd shadows) and `?crowd=off` (front ranks only). Ranks are instanced at `lo` detail; the front ranks stay full rigs.
- **Draw calls** (headless renderer, shadow pass included, max over the beats): see the table in docs/spec/52 "Scenes". The rigged front ranks dominate (40–100 calls a rig per pass); the ranks add about 25–55 calls per crowd per pass.

## The battle around it (v0.4, owner 2026-11-01, PLAN D27)
Owner: "It would be cool to see troops to be fighting each other from each side around the stratagem move, so it doesn't look like it's an isolated battle, it's happening inside of a larger war." Inside the cut-in scenes only (the board is unchanged).
- Every scene has a **background battle** (`scenes/melee.ts`, API in docs/spec/52 "Scenes"): knots of both sides' troops in the cut-in's two palettes (Yellow Turbans as rebels, the others as infantry) duel in the mid and far ground on a ring 1.2-8 tiles round the featured action: pairs and threes and fours thrusting and lunging, blocking and giving a step, about one knot in three losing a man; a few rider duels; troops running past; a low dust haze at every knot; one or two banners leaning in the sand. It fights for the whole scene.
- It keeps out of the scene's lanes: every figure's track (and the ground the flung land on), every rank's path over the whole scene, the props (brazier line, altar, banner poles, scene A's millet field) and the near part of every camera's view (`lensClear`, 3 tiles). Runners take only lines that stay clear for the whole scene.
- Size: full scenes ask for 22 knots, 3 rider duels, 4 runners and 2 banners (A, B, C, D, R, W); short scenes 10, 1, 2 and 1. How many fit depends on the lanes: see the members per side in docs/spec/52 "Scenes". About 80 draw calls (four instanced crowds, one variant, no shadow pass).

## Review fixes (2026-11-01)
- **Lantern bokeh:** the large red and white orbs read as balloons. The lanterns are now 30 small, dim, warm points 13–31 tiles away (size 0.22–0.52, opacity 0.12–0.28, amber or pale only).
- **Set dressing out of the lens:** `stage/lens.ts` samples the camera over the whole scene and returns ground discs over the near part of every low shot's view (reach 2.2 tiles, 1.0 for millet); trees, houses, rocks and stalks are kept out of them (water ignores them). This fixes the tree in front of the lens in Arrow Rain on forest.
- **S-cavalry on millet:** the stalks along every figure's track are thinned by half and cut to half height (the action lane); the flank camera now holds the clash from about 2.4 tiles (it was 3.2) and sits on the left, outside the wedge, which wheels away to the right.
- **Scene A:** Jian Yong stands at the right end of the kneeling line (the standing ranks are behind it); A2 dollies in the aisle between the kneeling line and the standing ranks; A3 looks along that aisle; A4 tilts up from it; A5 and A6 look over the heads of the defenders' ranks. Landed arrows are drawn at two thirds of their flight size so they no longer read as spears.
- **C:** the second rank of defenders gives 0.3 tiles of ground (was 0.65) so it does not walk into the ranks behind.
- **Capture at a real 30 fps:** `tools/shoot-battle-cutins.mjs --fps 30` steps the in-game cut-in clock by exactly 1/30 s per frame (it stepped 0.25-0.3 s before), and the store's cut-in watchdog (120 s of wall time) no longer skips a cut-in that a test or tool is stepping by hand (`player.manual`), which software GL at 30 fps would otherwise trip.

## Performance: warm-up and reuse (owner 2026-11-01, PLAN D30)
Owner: "when starting a cutscene, the game slows down tremendously, probably from loading all the models in the scene. Preload the models before fighting so it's smooth, or figure out a more efficient way to stop the slow down."

**What it was (measured).** `tools/perf/cutin-hitch.mjs` plays Daxing Hill (seed 5) in headless Chromium with `?perf=1&cutins=all`. It lets each cut-in run on the wall clock and reads `window.__perf` (`src/client/cutins/perf.ts`): marks, frame times, long tasks, `renderer.info` and WebGL contexts. The numbers below are from software GL (SwiftShader), so compare the ratios. A steady cut-in frame is about 0.8–1.9 s there, and the GPU sets that pace (the main-thread draw is 10–50 ms).
- **Before**, every cut-in mounted a new R3F `<Canvas>`, which meant a new WebGL context:
  - creating the context and renderer took 1.0–2.4 s;
  - building the world in JS took 70–200 ms;
  - the first draw took 1.9–3.1 s, linking 9–10 shader programs from scratch;
  - more programs compiled mid-scene as arrows and FX appeared (2–5 s spikes);
  - the lazy scene chunk loaded on the first cut-in (70 ms).

  Trigger to the first frame on screen was 3.3–5.9 s (3–6 steady frames), as one long task of 3.2–4.9 s.
- **After**:
  - no long task (over 50 ms) at the start of a prebuilt cut-in;
  - the first draw is 8–50 ms of main thread;
  - no program is compiled (21 programs from the warm-up, unchanged);
  - no WebGL context is created (2 for the whole battle);
  - geometry and texture counts return to the warm baseline after every cut-in.

  The first frame is on screen 1.5–2.1 s after the trigger (1.1–2.2 steady frames). Most of that is the board's last frame still in the GPU queue; the cut-in's own first frame takes one steady frame. Without a prebuild (an order confirmed without its preview), the world is built at the start: one 120–140 ms task.

**How (code):**
- **One persistent canvas** (`CutinLayer.tsx`, mounted by `App` on the briefing, deploy, battle and end screens when battle scenes are on). It is hidden (`visibility: hidden`, `.co-idle`) and idle (`frameloop="never"`) between cut-ins. It holds *slots* (`prep.ts`, `CutinView.tsx`): each is a world in its own group, and only the active one is visible and animates (`useCutinFrame` in `stage/slot.ts` gates every cut-in `useFrame`). When the battle unloads, the canvas and everything in it are freed.
- **Warm-up** (`prep.warmItems`, one item per idle callback, behind the intro and the first turn, with a "Preparing the field…" note while it runs):
  - one sample world per scene the battle's units can play (their attacks and stratagems), built from the battle's own officers and troops, cycling through the battle's terrains;
  - then a gallery (`WarmGallery.tsx`): every officer's figure (mounted when he rides or charges), every troop kind × palette as a crowd, and the remaining grounds.

  Each item is mounted hidden. Then:
  1. `renderer.compileAsync(slot, camera, slot)` runs with the slot's own lights;
  2. one draw of the slot goes to the canvas inside a 1×1 scissor, with every hidden object shown, nothing culled and a 16×16 shadow map. This compiles the shadow-pass programs and uploads the shared buffers and textures. The same colour space and tone mapping are used as for a real frame, which a render target would not give;
  3. the item is dropped.

  The warm-up pauses while a cut-in plays and runs again on `webglcontextrestored`.
- **One light rig.** Every world has the stage's hemisphere light and three directional lights (one shadow) plus exactly `POINT_LIGHTS` = 3 point lights (`PadLights`, intensity 0 where a scene has fewer). So the program set is the same for every scene and one warm-up covers it.
- **Reuse.**
  - Shared caches are kept: the figure kit's geometry, the stage's sky, table and textures, the ground's geometry, the arrow props and the spiral texture (`gpu.keep`).
  - Crowd bakes are pinned for the battle (`pinBakes`), so a scene no longer re-bakes its ranks.
  - Programs are pinned (`gpu.pinPrograms`), so disposing a scene's last material of a kind never deletes a program.
  - When a slot unmounts, its own geometry, textures and instance buffers are released (`gpu.collect` / `release`); kept ones never are.
- **Prebuild.**
  - When the player's order preview is open (`prebuildHook.ts`), the order's cut-in is planned from a speculative engine step (the engine is pure), and its world is built, compiled and drawn once in a hidden slot. Its key is the link plan (`planKey`), so confirming finds it.
  - The enemy's cut-in is built the same way as soon as the AI's choice is known, before the move is applied (`PREBUILD_WAIT_MS`, at most 4 s).
  - All links of a chain are prebuilt (at most `MAX_NEXT` = 4 worlds).
  - Unused prebuilds are dropped when the next sequence ends.
- **Start.** The link's world is shown and its clock started in the same task (`activateSlot`, which does not wait for R3F's own commit). The board's frameloop is paused in that task too. The first wall-clock frame is drawn by the next animation frame; a draw outside it would let a second frame queue behind it on a busy GPU. Stepped by hand (tests, capture tools), it draws at once as before.
- **Determinism.** Scenes are still a pure function of t. The review page and the capture tools use the single-world path of `CutinView` (no slots) and are unchanged apart from the shared caches and the padding lights, which add nothing to the picture.

**Memory** (Daxing Hill, measured):
- the warm pool holds 90 kit geometries (about 1.0 MB of vertex data) and 12 pinned crowd bakes (2.4 MB);
- 21 shader programs;
- the cut-in canvas's drawing buffer: w × h × (samples × 8 + 4) bytes, about 33 MB at 1280×720 with 4× MSAA, or about 27 MB on a 390×844 phone at DPR 1.5. Before, the buffer existed only during a cut-in, so the peak is unchanged; it is now held between cut-ins;
- JS heap after the warm-up: see the report.

The pool is capped by the battle's units, at most 4 prebuilt worlds plus the live one, and it is freed when the battle unloads.

**Guards.**
- `tests/e2e/cutin-warm.spec.ts`: after the warm-up, a short attack, a full stratagem, a chain and an enemy cut-in, prebuilt and built at start, create no shader link, no program and no WebGL context, and leave the geometry and texture counts at the warm baseline. A prebuilt cut-in played on the wall clock has no long task over 1.5 steady frames in its first second, its first frame takes no more than 1.5 steady frames, and trigger to first frame on screen stays within 2.5 steady frames (the extra is the board's last frame, still queued on the software GPU).
- `tests/unit/cutins-warm.test.ts`: bake pinning, the GPU sweep and kept resources, program pinning, the slot registry (prebuilt hand-over, the `MAX_NEXT` cap), the warm list and the purity of the speculative plan.

**Still slow in software GL.** Mid-scene frames can take 2–5 s when the GPU falls behind on heavy frames: the command buffer fills, and a plain `uniformMatrix4fv` or `drawElements` blocks. That is throughput (about 2,500–4,000 draw calls per frame, shadow pass included), not compile or upload, and it was there before. The warm-up itself blocks for about 2.5–5 s per new set of programs under SwiftShader, which has no `KHR_parallel_shader_compile`; it runs behind the intro and the first turn.

## Performance: per-frame budgets and quality tiers (owner 2026-11-02, PLAN D32)
Owner, after D30: "I tested It on my iPhone duo, still a ton of slowdown. It is using the new code". Asked where: the whole cut-in plays choppy (not the start, not the board, not the warm-up). D30 fixed the start; what was left was the cost of every frame, which a phone's GPU and Safari's WebGL could not sustain.

**What it was (measured).** `tools/perf/cutin-frame.mjs` opens every scene on the review page (cinema.html, with a mounted defender, the heaviest target) and reads, at each beat's midpoint: draw calls and triangles of the main pass and of the shadow pass (the shadow map's `render` is wrapped), the shadow casters, programs, textures and materials, the draw-producing objects in view by group (tagged roots: `userData.perf` on the stage, the ranks and the melee; rig groups named `figure`; horses), and the main-thread JS of one frame split into scene update (every `useFrame`) and render submit (`gl.render`), at 1x and under a 4x CPU throttle (CDP `Emulation.setCPUThrottlingRate`). The GPU is drained before each timed frame, so the submit is not waiting on the last one. Draw calls, triangles and JS ms do not depend on the GPU; SwiftShader's frame rate is not a gate.
- **Before:** 1,170–3,500 draw calls a frame at the peak beat (C 3,507, A′ 2,627, B 2,455), about half of them in the shadow pass, because everything cast a shadow (1,142 casters in A). The procedural figures were the cost: a mounted hero is about 110 meshes, a foot troop about 45, and each mesh was one draw in the main pass and one in the shadow pass. In A, the rigged first rank of mounted defenders alone was 657 draws in view, the archers and Jian Yong 280. Render submit was 4–16 ms of JS per frame on the desktop CPU and 22–102 ms at 4x throttle, which is most of a phone's frame on its own.

**The cuts (every tier).** No visible change at High: the contact sheets of every scene's beats (`tools/render-cutins.mjs --beats-only`) are the same before and after, mean absolute difference under 0.03 of 255 and no pixel off by more than 24.
- **Figures are a handful of draws** (`figures/compact.ts`, applied to every rig a cut-in builds: `cutins/casters.ts` `cutinRig`, the formations, the crowds' rigged first rank). The body is one `SkinnedMesh` per face side whose bones are the rig's own joint objects; every vertex follows exactly one joint with weight 1, the same transform parenting gave it. The weapon and off-hand joints (the scenes hide them) and the `arrow` node (the crowd finds it by name) are one merged mesh per (joint, face side) under that joint. The materials are baked into per-vertex colour, roughness, metalness and emissive, so every figure shares four materials (`figureMaterial`). A mounted hero goes from about 110 draws to 4–5, a foot troop from about 45 to 5–7, and the triangle count does not change. The joint contract is untouched: the joints are the same objects, still driven by the clips (a unit test poses a hero and a troop and compares every vertex's bounds with the uncompacted rig). Merged geometry is cached by its sources (geometry ids, materials, bones, relative transforms), so copies of a design share one upload; it is kept (`gpu.keep`) when its sources are. Each figure's skeleton owns a bone texture, freed with the slot (`gpu.collect` now gathers skeletons).
- **Culling still works.** A skinned figure's culling sphere follows its joints (recomputed when three asks: the joints' positions in the mesh's frame, each padded by the reach of the parts it carries). Merged meshes have their own bounding spheres.
- **Arrows are one draw each** (`props.ts`): shaft, head and rag are one baked geometry per length; each arrow keeps its own material, whose emissive intensity is its glow (the rag's colour is a per-vertex emissive mask).
- **Static dressing is merged** (`Ground.tsx` `Static`, `compact.ts` `mergeStatic`): the trees, tufts, rocks, houses, fences and deck planks of a ground are one draw per material with the same materials; the originals stay mounted and hidden. The water ripples and the millet move and are not merged.
- **The drawing buffer is not preserved** outside `?test=1` and `?preserve=1` on both canvases (the cut-in canvas and the board). On phones, iOS above all, preserving it costs a full-buffer copy every frame. The tests and the capture tools run with `?test=1`.

**Quality tiers** (`cutins/quality.ts` owns them; the settings panel's "Cut-in quality: Auto / High / Medium / Low" row and `?quality=auto|high|medium|low` choose; `?crowd=` still overrides the crowd profile):

| | High (desktop) | Medium (phone start) | Low (phone) |
|---|---|---|---|
| Pixel ratio cap | 1.5 | 1.25 | 1 |
| MSAA | on | on | off |
| Shadow type, key light's map | PCF, 1536 | PCF, 1024 | basic, 1024 |
| Shadow casters | everything | the figures and the stage dressing | the named officers (caster, hero) |
| Instanced ranks (`crowd`) | full (2 variants, shadows) | lite (60%, 1 variant, no shadows) | lite |
| Background melee | full | lite (half the knots, no riders) | off |
| Figure detail | full | full | low (fewer segments on generated primitives, as the instanced ranks) |
| Particles drawn | all | 60% | 40% |
| Overlay effects (page compositor, PLAN D33) | full: SVG turbulence on speed lines, ink and titles; depth-of-field backdrop blur; whip-pan blur on the canvas | lite: no CSS, SVG or backdrop filter anywhere in the cut-in frame; speed lines are plain ragged shapes moved by a transform | lite |
| Draw-call budget a frame, shadows included (peak) | 800 (not gated) | 500 | 300 |

- **Auto** (the default): the starting tier comes from the device (iOS, or touch with a screen whose shorter side is 820 px or less: Medium; otherwise High) and from a remembered step-down. After the warm-up it watches the board's frames for a second and starts one tier lower if their median is over 25 ms. During a cut-in it steps down one tier, live, when the median of the last 15 frame intervals is over 25 ms (intervals over 400 ms are pauses, not frames), and remembers the step in localStorage (`tkt.cutinQuality.auto.v1`, in try/catch). It never steps up mid-scene; a manual choice is never stepped. In `?test=1` the default is High with no live stepping unless the page asks for `?quality=auto`.
- **A tier change never creates a WebGL context and never meets a new shader program.** MSAA and the shadow-map type are a context attribute and part of every program key, so they are fixed when the cut-in canvas is created (the tier at mount). Everything else follows the live tier: pixel ratio (R3F `setDpr`), the shadow map's size (no program depends on it: a new size takes a new map), who casts (`casterPolicy.ts`; each mesh's built value is kept in `userData.cast0`, and the warm-up draws every possible caster once, so the shadow-pass programs exist whatever the tier), particle share. Crowd density, melee and figure detail apply to the next world built.

**Per-frame numbers after** (cinema.html, mounted defender, peak beat; `tools/perf/cutin-frame.mjs --quality high,medium,low`):

| Scene | Before: calls (of which shadow), triangles | High | Medium | Low |
|---|---|---|---|---|
| A | 2,380 (1,142), 1,236k | 542 (223), 1,236k | 289 (79), 685k | 203 (6), 153k |
| A′ | 2,627 (1,230), 1,218k | 502 (204), 1,219k | 259 (68), 664k | 182 (4), 144k |
| B | 2,455 (1,154), 1,351k | 409 (165), 1,352k | 192 (23), 753k | 145 (5), 169k |
| C | 3,507 (1,686), 1,747k | 508 (203), 1,747k | 345 (129), 1,416k | 196 (5), 191k |
| D | 1,919 (1,013), 1,151k | 368 (149), 1,210k | 206 (75), 877k | 111 (5), 143k |
| R | 1,170 (537), 896k | 308 (103), 896k | 147 (29), 545k | 98 (5), 135k |
| W | 400 (113), 464k | 171 (37), 464k | 77 (5), 197k | 50 (5), 73k |
| S-melee | 1,729 (790), 821k | 348 (137), 821k | 212 (63), 664k | 127 (5), 95k |
| S-cavalry | 2,215 (1,073), 1,028k | 426 (177), 1,028k | 251 (77), 854k | 154 (5), 126k |
| S-archer | 1,763 (822), 743k | 380 (157), 758k | 220 (63), 612k | 130 (0), 89k |

Main-thread JS of one frame (median over the beats, desktop CPU; render submit in brackets): before 5–22 ms (4–16); High 6–16 ms (4–11); Low 4–10 ms (3–6). At a 4x CPU throttle the peak beat went from 26–114 ms to 25–68 ms at High and 20–59 ms at Low; what is left is spread over the scene logic, the crowds' pose evaluation and three's per-object work, with no single hot spot (CPU profile of A at Low).

**On-screen HUD.** `?perf=hud` shows, top left: fps and frame ms (median and p95 of the animation-frame intervals over the last second), the draw calls and triangles of the last frame of whichever canvas drew last (`cutin` or `board`, shadow pass included), and the cut-in tier (with "(auto)" and the number of live step-downs). It is plain DOM (`cutins/hud.ts`); the renderers register themselves.

**Guards.**
- `tests/e2e/cutin-budget.spec.ts`: every scene type (A, A′, B, C, D, R, W and the three shorts), mounted defender, at the phone viewport (390 x 844), at Low and Medium: every beat's draw calls, shadow pass included, are at or under the tier's budget.
- `tests/e2e/cutin-quality.spec.ts`: with frames forced slow (`window.__cutinQuality.inflate(ms)`: every measured interval reads as a 60 fps frame plus ms), Auto steps High to Medium to Low, remembers it across a reload, and creates no WebGL context; frames that read as 60 fps never step. The settings row sets and remembers a manual tier and `?quality=` overrides it. `?perf=hud` shows its numbers on the board and in a cut-in.
- `tests/unit/cutins-quality.test.ts`: the tier selection (device, remembered step, warm-up check), the governor, the tier table's order, compaction (draws, joint identity, posed bounds equal to the uncompacted rig, a hidden weapon, the culling sphere, shared geometry), the static merge, the one-draw arrow and the caster policy.
- `tests/e2e/cutin-warm.spec.ts` (D30) still holds: no program, shader link or WebGL context during a cut-in, and geometry and texture counts back at the warm baseline (the warm-up gallery now also builds every troop variant as a compacted rig, so each variant's merged geometry is uploaded behind the intro).

**Known gaps.** Not yet measured on a real phone: the gate is draw calls and JS ms, not fps. The instanced ranks are still one InstancedMesh per (variant, joint, face side), 37–100 draws per scene; they and the background melee are not culled per crowd (`frustumCulled` is off on their instanced meshes, as before). A skinned figure updates its bone texture every frame (one small upload per figure on screen). At Low only the named officers cast, so a short scene whose caster is not a named officer (S-archer's sample) has no shadow at all. A live step-down changes crowd density, melee and figure detail only for the next world built (a prebuilt world keeps the tier it was built at). The board's own figures are not compacted (the owner did not report the board as slow).

## Revision log
- v0.1 2026-11-01: first direction (scenes A and B).
- v0.2 2026-11-01: bases removed, locomotion animated (owner: "I don't want them on bases. I want their movement on feet and on horse to be animated"). Archers kneel; B3 riders trot, canter and gallop on a distance-driven footfall cycle with hoof dust on the footfalls; rebels stagger back a step (B4, A5) and the flung rebels land and lie flat (B5); the charge's top speed is lowered so the gallop cadence reads.
- v0.3 2026-11-01: in-battle integration direction: scenes C (Duel Strike) and D (Thunder Roar), the R and W shorts, short normal-attack scenes, chains, settings, crowd sizes.
- v0.3 as built 2026-11-01: scenes A′ (V), C, D, R, W and the three short attack scenes, plan mapping, chains, settings and the in-game player; see "v0.3 as built".
- v0.4 2026-11-01: the background battle around every scene (owner: "inside of a larger war"); instanced ranks in every scene (about 20–30 a side, 10–15 in the shorts), mounted defenders as riders in A, A′ and B, the hero in the front rank of a short scene, small lantern bokeh, set dressing kept out of the lens, the millet action lane and a closer S-cavalry camera; see "More troops: as built" and "Review fixes".
- v0.5 2026-11-01: cut-ins start without a hitch (PLAN D30): one persistent cut-in canvas per battle, warm-up behind the intro, shared caches, pinned bakes and programs, prebuilt worlds for previewed orders and the AI's choice; see "Performance: warm-up and reuse".
- v0.6 2026-11-02: cut-ins hold a phone frame budget (PLAN D32): figures drawn as a skinned body plus their weapon (a handful of draws instead of about 50-110), one-draw arrows, merged set dressing, no preserved drawing buffer outside tests, quality tiers (Auto / High / Medium / Low) with per-tier draw-call budgets, and `?perf=hud`; see "Performance: per-frame budgets and quality tiers".
- v0.7 2026-11-02: lite overlays at Medium and Low (PLAN D33). The overlays are drawn by the page compositor, outside the WebGL draw-call budget, and on iPhone the charge's full-screen turbulence-filtered speed lines, the depth-of-field backdrop blur and the whip-pan blur dropped the scene to a few fps even at Low. Guard: `tests/e2e/cutin-overlay-lite.spec.ts` (no filter of any kind in the cut-in frame at Medium/Low, every beat of every scene).
