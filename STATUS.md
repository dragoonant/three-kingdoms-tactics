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
- **Audio system built, no files:** the adaptive music system (beds per mood, the cut-in charge overlay with full/short fades, stingers, volume settings, `sounds.html` audition page) is in `src/client/audio/` and silent until `public/audio/manifest.json` lists files (brief and Audio Studio prompts: `docs/spec/60-audio.md`). **Not verified by ear.** The in-game cut-in integration (calling `audio.cutinStart/End/Skip`) is not built yet.
- **Figures and music files:** figures are procedural stand-ins, and there are no music files. Both are milestones M5 and M6 and need a session on the owner's PC with its GPU and studios. M5 batch 1 is started: Gemini concepts for Liu Bei, Guan Yu and Zhang Fei are approved in `art/hero-concepts/` (2026-10-31); Hunyuan GLBs are next.
- **Animations not checked frame by frame:** reinforcement arrival, terrain changes and escape were not watched under headless rendering.
- **Click picking:** clicking a figure between two others can select the neighbour.
- **Stale branch:** a `wip/engine-v2` backup branch is still on the remote. The git proxy refused the delete, so it can be deleted by hand.

## Next
M5 art and M6 audio on the owner's PC; a human playtest pass on battles 3–9; M7 polish.
