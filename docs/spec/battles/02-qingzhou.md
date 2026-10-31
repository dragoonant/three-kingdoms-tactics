# 02 — Battle 2: Relief of Qingzhou (184 AD)

**Source story:** *Romance of the Three Kingdoms* chapter 1. After Daxing Hill, word comes that Qingzhou is besieged by the Yellow Turbans and its governor Gong Jing cannot hold. Liu Bei, Guan Yu and Zhang Fei go to its relief with Zou Jing. Liu Bei's first push fails; he then feigns a retreat, the rebels chase him, and Guan Yu and Zhang Fei spring from ambush on both flanks while Gong Jing sallies from the gate. The novel is public domain. Every line of prose is ours.

**Cast liberties / alt-history flags:**
- Gong Jing and Zou Jing are the novel's figures. Their stats come from the shared table in `14-campaign-battles.md`.
- Jian Yong fights here as a roster officer (he joined after battle 1: cast liberty from Daxing Hill, flagged there).
- The rebel units are all invented (`invented: true`, ids `qz-*`): a Rebel Chief, two raiders, two captains, two bowmen and a Taiping adept. None is recruitable.
- Mechanically the ambush is an engine reinforcement, not a hidden-unit rule. The arrival is open information (`query.timelinePreview` lists it).

## Objective
- Win: rout the Rebel Chief (`routCommander`).
- Lose: Liu Bei is routed (`commanderLost`), or round 14 ends (`timeout`, `onTimeout: yellow`).
- Side order: `han` (player) then `yellow`. `gateOwner: han` (rebels can never stand on the gate).
- Par 9 rounds.
- After the battle Zou Jing departs (`campaign.json` story).

## Deploy
`deploySlots: 4`, `required: [liu-bei, jian-yong, guan-yu, zhang-fei]`, `defaultDeploy` the same four. The deploy list order is fixed on purpose: slot 0 Liu Bei and slot 1 Jian Yong start on the board; **slot 2 (Guan Yu) and slot 3 (Zhang Fei) are held back and arrive in round 3**. Requiring all four removes the risk of the player's choice order changing who arrives. If an Iron Oath loss removed a brother, the list shifts up (a missing slot simply does not arrive). Zou Jing is a guest (a fixed player-side unit, never in the deploy list, earns no XP).

## Map (16 × 12)
Legend: `.` plain, `f` farm (millet), `T` forest, `h` hill, `#` wall, `G` gate (Han only), `v` village (the city interior), `=` road.

```
   x 0123456789ABCDEF
y0   ..TTThhTTT......
y1   ..ThhhhhTT......
y2   ...Thh..TT......
y3   ....hh..fff.####
y4   ....hh..fff.#vv#
y5   ........fff.#vv#
y6   ============Gvv#
y7   ....hh..fff.#vv#
y8   ....hh..fff.####
y9   ...Thh..TT......
y10  ..ThhhhhTT......
y11  ..TTThhTTT......
```
- **The city** is in the east (x12–15, y3–8): walls, a gate at (12,6) and eight village tiles inside. Rebels cannot enter. Villages heal 5% a phase, so Liu Bei can retreat to the gate to recover.
- **The rebel camp** is the millet at x8–10, y3–8 (18 farm tiles).
- **The pass:** two hill blocks at x4–5 (y3–4 and y7–8) leave a two-tile gap on y5–6. Archers on those hills get +1 range over the road; Zou Jing and Jian Yong shoot from them into the gap.
- **The ridges** are forest and hill at y0–2 and y9–11. Guan Yu enters at **(6,1)** (hill, facing S) and Zhang Fei at **(6,10)** (hill, facing N). The open ground x6–7 between the pass and the millet is the killing ground.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 6 | — | calm |
| 9 | W | breeze |
| 12 | — | calm |

The east breeze carries a fire lit on the camp's western millet edge into the camp. The round-9 westerly breeze would carry any late fire back toward the ridges.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Shared officers use `14-campaign-battles.md` numbers exactly. `*` invented.

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | roster | 72/74/78/98 | — | twin-blades, rally (+ learned) | (2,5) E |
| jian-yong | Jian Yong | han | archers | roster | 40/72/50/80 | — | fire-attack, sow-discord (+ kindling at level 3) | (1,6) E |
| guan-yu | Guan Yu | han | cavalry | roster | 97/75/95/85 | — | crescent-sweep, thundering-charge | arrives round 3 at (6,1) S |
| zhang-fei | Zhang Fei | han | infantry | roster | 98/30/85/45 | — | serpent-thrust, thunder-roar | arrives round 3 at (6,10) N |
| zou-jing | Zou Jing (guest) | han | archers | 2500 | 55/60/70/60 | — | arrow-rain | (2,7) E |
| gong-jing | Gong Jing (guest, reinforcement) | han | infantry | 2000 | 50/55/60/60 | — | twin-blades | arrives round 5 at the gate (12,6) W |
| qz-rebel-chief | Rebel Chief* (commander) | yellow | infantry | 3200 | 62/35/55/30 | — | mob-rush, rebel-war-cry | (11,5) W |
| qz-raider-a | Raider Hu* | yellow | cavalry | 1700 | 55/25/40/20 | 35 | torch-raid | (10,3) W |
| qz-raider-b | Raider Bo* | yellow | cavalry | 1700 | 54/25/40/20 | 38 | mob-rush | (10,8) W |
| qz-spearman-a | Captain Du* | yellow | infantry | 2100 | 50/30/45/25 | 45 | mob-rush | (9,4) W |
| qz-spearman-b | Captain Lei* | yellow | infantry | 2100 | 50/32/44/28 | 42 | mob-rush | (9,7) W |
| qz-bowman-a | Bowman Kuang* | yellow | archers | 1300 | 46/38/40/28 | 50 | massed-arrows | (10,4) W |
| qz-bowman-b | Bowman Ning* | yellow | archers | 1300 | 46/36/40/26 | 48 | massed-arrows | (10,7) W |
| qz-adept | Taiping Adept Shan* | yellow | archers | 1200 | 30/66/38/50 | 55 | yellow-sky-hex | (11,6) W |

No battle-local stratagems: every stratagem used is in `stratagems.json` (Daxing Hill's rebel set).

## Reinforcements
| Round | Side | Who | Entry tile | Notes |
|---|---|---|---|---|
| 3 | han | deploy slot 2 (Guan Yu) | (6,1) | Qi 4, ready to act the moment the round-3 Han phase begins |
| 3 | han | deploy slot 3 (Zhang Fei) | (6,10) | same |
| 5 | han | Gong Jing (fixed unit, 2000) | (12,6), then (13,6) if the gate tile is taken | "sallies from the gate"; ready to act |

## Timeline
| Round | Phase | Kind | Text |
|---|---|---|---|
| 1 | start | message | Qingzhou holds its gate shut. Liu Bei is too few to break the siege, so he must make the rebels come to him. |
| 2 | end | message | Horns sound on both ridges at dawn. Guan Yu and Zhang Fei are coming down. |
| 4 | end | message | Behind the rebel camp the bar of the Qingzhou gate is being lifted. |

## Enemy behaviour
| Unit | Hint | Why |
|---|---|---|
| qz-rebel-chief | `pursue:liu-bei` | The chief takes the bait and chases the commander out of the camp into the pocket. |
| qz-raider-a, qz-raider-b | `advance` | Cavalry sweeps toward the nearest foe and arrives first, so Liu Bei meets it before the chief. |
| qz-spearman-a, qz-spearman-b | `advance` | The rebel line follows the chief west. |
| qz-bowman-a, qz-bowman-b, qz-adept | `guard:12,6` | The siege is still on: the shooters stay near the gate until they are drawn off, and Gong Jing's sally meets them. |

## Intended play (a design check, not a script)
This is the "do not charge forward" battle. Daxing Hill rewards striking early; here the player starts with three units against eight, and the correct reading of the briefing is that Guan Yu and Zhang Fei are *not* there yet.
1. **Rounds 1–2: bait.** Keep Liu Bei out of the rebels' reach, draw the chief and the raiders west, and fight in the pass where the hill archers dominate. Liu Bei's `rally` and the village at the gate keep him alive. Losing Zou Jing or Jian Yong early is acceptable; losing Liu Bei is not.
2. **Round 3: the horns.** Guan Yu arrives at (6,1) and Zhang Fei at (6,10), behind the pursuing column, with full Qi. A Volley→Strike→Strike chain on the chief while he is on the open ground at x6–7 is the win. Guan Yu (cavalry) can reach the road from the north ridge in one move; Zhang Fei gets to the millet's edge.
3. **Round 5: the gate.** Gong Jing comes out at (12,6) behind the camp, hitting the bowmen and adept. Surviving enemy units then sit between two forces.
4. **Fire** is available but optional: Jian Yong can light the camp millet under the east breeze. The ridges are forest and hill and also flammable, so burning the camp too early risks the very ridges the brothers arrive on.

## Balance notes
- `npm run sim -- --battle qingzhou --games 100` (random policy): han 17, yellow 83, avg 13.0 rounds, 0 invariant failures; the round-3 and round-5 reinforcements fire (294 `reinforced` events over the 100 games).
- `ai-bench --games 30` (seeds 5000–5029), normal(han) vs normal(yellow): han 18/30 = 60%, average 7.0 rounds, 0 timeouts. random(han) vs normal: 0%. normal(han) vs random(yellow): 100%. Within the aim (35–85%, ≥ 5 rounds).
- First draft (14 wide, weaker chief) gave 93% / 6.5 rounds, and a draft with stronger troops but the camp 2 tiles closer gave 100% / 4.3 rounds because the pursuing chief ran into Zou Jing's Arrow Rain in round 3. Widening the map by two tiles delayed contact until the brothers had landed and gave the current numbers. Not tuned further.

## Rulings
- **Fixed deploy order:** `required` lists all four roster officers in the order Liu Bei, Jian Yong, Guan Yu, Zhang Fei so that slots 2 and 3 are the brothers (R2-SLOT-1 uses deploy-list indices). If an officer is fallen (Iron Oath) the list shifts up and the missing slot just does not arrive.
- **Gong Jing is a fixed reinforcement unit** (not a guest start) because the brief has him sally in round 5; his entry list has a fallback tile inside the gate.
- Rebel Chief's `loyalty` is `null` (cannot be swayed, R-SWAY-1: a commander); captains have 35–55 so Liu Bei's Charisma 98 can sway them.
- Data: the generic bench tool `tools/ai-bench.ts` initialised the invariant unit count from `s.units.length`; with reinforcements this reports false failures. Fixed in this commit (a one-line change to `unitBudget(s)`, as `tools/sim.ts` does).
- Existing tests that depended on the stub content were adjusted minimally: `campaign.test.ts` (`C-DEP-2` uses battle index 2; `C-RES-5` expectation includes Jian Yong) and `v2-data.test.ts` (stub flags need only agree between battle and scene; the id collision probe uses `gz-guard`).
