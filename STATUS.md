# STATUS (rewrite, don't append)

**2026-11-01 (overnight build), the campaign is playable.** Live: https://dragoonant.github.io/three-kingdoms-tactics/

## What exists
- **Campaign "Liu Bei's Rise", 9 battles:** Daxing Hill → Relief of Qingzhou → Guangzong → Hulao Gate → Defence of Xuzhou → Xiapi → Bowang Slope → Changban → Red Cliffs.
  - Before and after each battle there are scenes, and the game opens with a prologue and closes with an epilogue.
  - Between battles: camp (Drill and Muster, a choice of 3 stratagems), deploy, results (XP, level-ups, new stratagems, joins, departures and recruits). The game autosaves, and a lost battle can be retried.
  - Iron Oath is an option.
- **Skirmish:** Daxing Hill on its own.
- **Engine:** facing arcs, counters, linked stratagem chains with sworn-brother bonds, fire and wind, sway, and objectives:
  - rout the commander or listed units, survive, hold, escape, protect;
  - retreat thresholds, reinforcements, scripted terrain, wind and fire;
  - walls, gates, ramparts, flood shallows, reeds, ship decks and bridges;
  - wind, buff and provoke stratagems.
- **Enemy AI:** a utility AI in a worker that understands objectives, behaviour hints (ambush, guard, hold, pursue) and timeline changes. `?bot=random|easy|normal` overrides its strength.

- **Board UX (2026-11-01, D26):** touch controls (one-finger scroll, two-finger twist to rotate, pinch to zoom), mouse (drag scrolls, right-drag or Q/E turns, wheel zooms to the cursor), a close zoom to 2.8 tiles with the pitch easing side-on, the tent cloth that blocked a low camera now fades, a small unit card (252 x 72 desktop, 64 px phone bar) with a More detail sheet, and face portraits (rendered from our own figures; `tools/portraits/gen-hf.mjs` is built for Hugging Face generation once an `HF_TOKEN` exists). See `docs/spec/50-presentation.md`.

## Verified (2026-11-01)
- typecheck; 472 unit tests; `validate:data`; sim `--all` (11 battles × 30 games, 0 invariant failures); build; e2e 9/9 (incl. a campaign through battle 2 with save, Continue and retry, the proving ground, phone layouts).
- Every battle renders in a real browser with 0 page errors (screenshots checked: Red Cliffs fleet, Hulao wall and gate).
- The live Pages build loads with 0 errors and shows the campaign entry.
- AI bench, normal (Han) vs normal (enemy), Han win % on holdout seeds:

  | Battle | Han win % |
  |---|---|
  | Qingzhou | 75 |
  | Guangzong | 65 |
  | Hulao Gate | 40 |
  | Xuzhou | 53 |
  | Xiapi | 55 |
  | Bowang Slope | 55 |
  | Changban | 53 |
  | Red Cliffs | 60 |

  Daxing Hill is 63% on the dev seeds. A random Han player loses 100% everywhere.

## Not verified / known gaps
- **No human has played the campaign end to end.** Battles 3–9 were exercised by the AI bench and render checks, not by a person. Balance is AI-vs-AI only.
- **The AI misses some intended plays:** it never casts Borrow the Wind or baits Lu Bu, and about half of its Hulao Gate games time out.
- **Audio system built, batch 1 files in:** the adaptive music system (beds per mood, the cut-in charge overlay with full/short fades, stingers, volume settings, `sounds.html` audition page) is in `src/client/audio/`. Batch 1 (10 cues x 2 takes, generated on the owner's PC 2026-11-01, commit `b74545c`) is in `public/audio/`, with the manifest on take a and both takes playable on `sounds.html` (brief, prompts and measurements: `docs/spec/60-audio.md`). The listening pass to pick takes and prune to the 5 MB budget is still to do. **Not verified by ear.** The cut-ins now call `audio.cutinStart/End/Skip` (full for stratagems and chains, short for attacks).
- **Battle cut-ins (v0.3):** every stratagem and chain plays a full scene and every normal attack a 2.4-2.7 s short one, with the two settings in the Sound panel; scenes A, A′, B, C, D, R, W and the shorts are on `cinema.html`. Looked at on contact sheets and in real battles in headless Chromium only: **timing, feel and the music are not verified by a person.** Since v0.4 every scene has instanced ranks behind its rigged front rank: about 20-30 troops a side in full scenes and 10-15 in short ones (docs/spec/51 "More troops: as built"). Since 2026-11-01 (D30) cut-ins no longer freeze at the start. They render in one persistent canvas that warms up behind the battle intro ("Preparing the field…"); the next scene is prebuilt from the order preview or the AI's choice, and an e2e guard (`tests/e2e/cutin-warm.spec.ts`) fails if a cut-in compiles a shader or creates a WebGL context after warm-up. Since 2026-11-02 (D32) cut-ins have quality tiers for phones: each figure draws as a few skinned meshes instead of about 100 parts, Auto starts phones at Medium and steps down if frames run slow, and there is a "Cut-in quality" setting and an on-screen `?perf=hud` meter. The peak is now 50-203 draw calls a frame at Low, down from 1,170-3,507. Since D33, Medium and Low also drop the page-drawn overlay filters (the charge's turbulence-filtered speed lines, the depth-of-field and whip-pan blurs), which made the charge drop to a few fps on the owner's iPhone even at Low. Not yet measured on a real GPU or phone.
- **Roguelike "Roads to War", era 1 (RL1, 2026-11-02):** playable from the title screen ("Roads to War: Yellow Turbans"): peach-garden prologue, the road with rice / soldiers / Renown / day and the Guangzong forecast, 20 dilemma stops with exact costs, hidden echoes and stated-odds gambles, deploy sliders with the live rice cost and the Hungry rule, seven battles (Daxing Hill, Qingzhou, Guangzong and the four new `rl-*` minor battles), wounds and falls (Iron Oath), autosave and Continue, an Annals list. Code: `src/run/`, `src/client/run/`, `src/data/eras/era1.json`, `src/engine/guests.ts`. **Not yet played by a person.** Gaps: tiredness and Zhang Fei's sulk are shown but not applied in battle; Liao Hua is not an officer yet; most Guangzong finale effects are shown, not applied; balance is from the paper sim and AI bench only.
- **Figures and music files:** figures are procedural stand-ins, and music batch 1 is in but not yet listened to. These are milestones M5 and M6 and need a session on the owner's PC with its GPU and studios. M5 batch 1 is started: Gemini concepts for Liu Bei, Guan Yu and Zhang Fei are approved in `art/hero-concepts/` (2026-10-31); Hunyuan GLBs are next.
- **Animations not checked frame by frame:** reinforcement arrival, terrain changes and escape were not watched under headless rendering.
- **Click picking:** clicking a figure between two others can select the neighbour.
- **Stale branch:** a `wip/engine-v2` backup branch is still on the remote. The git proxy refused the delete, so it can be deleted by hand.

## Next
M5 art and M6 audio on the owner's PC; a human playtest pass on battles 3–9; M7 polish.
