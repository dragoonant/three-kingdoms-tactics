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
- **Troop counts:** 6–9 troop figures per side stand in for "troops" (v0.2 keeps this: raising it was tried and left for the instanced pass). How many fall comes from the damage dealt as a fraction of the target's troops, with at least 1.

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

## Revision log
- v0.1 2026-11-01: first direction (scenes A and B).
- v0.2 2026-11-01: bases removed, locomotion animated (owner: "I don't want them on bases. I want their movement on feet and on horse to be animated"). Archers kneel; B3 riders trot, canter and gallop on a distance-driven footfall cycle with hoof dust on the footfalls; rebels stagger back a step (B4, A5) and the flung rebels land and lie flat (B5); the charge's top speed is lowered so the gallop cadence reads.
