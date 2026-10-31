# 03 — Battle 3: Guangzong (184 AD)

**Source story:** *Romance of the Three Kingdoms* chapters 1–2. The imperial army besieges the Yellow Turban stronghold of Guangzong, where Zhang Jiao and his brothers Zhang Liang and Zhang Bao hold out. Liu Bei serves in the imperial push under Lu Zhi. Zhang Jiao dies of illness during the siege. The novel is public domain. Every line of prose is ours.

**Cast liberties / alt-history flags:**
- **Zhang Bao's storm sorcery is set here, at Guangzong.** The novel sets his sorcery at Yangcheng (a sibling stronghold), and has Zhang Jiao himself using sorcery against Lu Zhi at Guangzong. The game moves the storm to this battle because the arc needs a "the enemy owns the wind" lesson. Flagged in `officers.json` (`note` on `zhang-bao`).
- Zhang Jiao does not appear as a unit. The timeline names him ("lies sick behind the palisade") and the post scene reports his death.
- Two imperial guests (`gz-imperial-spears`, `gz-imperial-bows`) represent the regular army beside Liu Bei. They are invented (`invented: true`) and exist to keep the ratio sane with only four roster officers.
- All other rebels (`gz-*`) are invented, none recruitable.

## Objective
- Win: rout Zhang Liang (`routCommander`).
- Lose: Liu Bei is routed (`commanderLost`), or round 15 ends (`timeout`, `onTimeout: yellow`).
- Side order: `han` then `yellow`. No gate (the palisade is rampart tiles with a two-tile gap).
- Par 11 rounds. No story joins or departures.

## Deploy
`deploySlots: 4`, `required: [liu-bei]`, `defaultDeploy: [liu-bei, guan-yu, zhang-fei, jian-yong]`. Starts on the west edge at (2,6) Liu Bei, (2,5), (2,7), (1,6) in deploy order. The two imperial guests stand at (2,3) and (2,9).

## Map (15 × 12)
Legend: `.` plain, `f` farm (millet), `T` forest, `h` hill, `r` rampart (palisade), `v` village (the rebel tents), `=` road, `~` river, `o` ford, `b` bridge, `e` reeds.

```
   x 0123456789ABCDE
y0   TT.TTT.~Thhr...
y1   TT.TTT.~Thhr...
y2   .......oThhr...
y3   ...fff.~ff.r...
y4   ...fff.~ff.r.v.
y5   ...fffe~ef.=.v.
y6   =======b=====v=
y7   ...fffe~ef.r.v.
y8   ...fff.~ff.r...
y9   ...fff.off.r...
y10  ...TTT.~TTTr...
y11  ...TTT.~.TTr...
```
- **The river** runs the whole height at x=7. It is crossed only at the ford (7,2), the bridge (7,6) and the ford (7,9). The river is not flammable, so a fire on one bank cannot jump the water.
- **Two millet belts:** the Han belt (x3–5, y3–9) is the army's own supply field; the rebel belt (x8–9, y3–9) is the enemy's. Reeds at (6,5), (6,7), (8,5), (8,7) flank the bridge approaches.
- **The palisade** is a rampart line at x=11. Infantry and archers can climb it (cost 2); cavalry cannot. The only gap for horsemen is (11,5) and (11,6). Archers on a rampart get +1 range and the height bonus.
- **The altar:** the hill at x9–10, y0–2, north of the camp and outside the palisade. Zhang Bao stands on (10,1). It is reachable across the north ford (7,2).
- **The camp** is x12–14, with tents (villages) along x=13. Zhang Liang stands at (13,5) on a village (def 0.85, heals), 11 tiles from the Han line.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 6 | — | calm |
| 10 | W | breeze |

Fire lit in the Han belt under the opening east breeze runs toward the river and the bridge crossers. **Zhang Bao's `call-the-storm` overrides this with a west gale for two rounds**: fire in the Han belt then runs back through the player's own millet at certainty (gale downwind × farm).

## Officers (stats War/Int/Lead/Cha, Loyalty)
Shared officers use `14-campaign-battles.md` numbers exactly. `*` invented.

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | roster | 72/74/78/98 | — | twin-blades, rally | (2,6) E |
| guan-yu | Guan Yu | han | cavalry | roster | 97/75/95/85 | — | crescent-sweep, thundering-charge | (2,5) E |
| zhang-fei | Zhang Fei | han | infantry | roster | 98/30/85/45 | — | serpent-thrust, thunder-roar | (2,7) E |
| jian-yong | Jian Yong | han | archers | roster | 40/72/50/80 | — | fire-attack, sow-discord | (1,6) E |
| gz-imperial-spears | Imperial Captain Ren* (guest) | han | infantry | 1800 | 60/40/62/50 | — | twin-blades | (2,3) E |
| gz-imperial-bows | Imperial Crossbow Captain Shi* (guest) | han | archers | 1500 | 52/48/55/50 | — | arrow-rain | (2,9) E |
| zhang-liang | Zhang Liang (commander) | yellow | infantry | 3000 | 80/60/72/66 | — | crescent-sweep, rebel-war-cry | (13,5) W |
| zhang-bao | Zhang Bao | yellow | archers | 1600 | 70/78/62/60 | — | yellow-sky-hex, call-the-storm | (10,1) W |
| gz-guard | Altar Warden Pei* | yellow | infantry | 1800 | 58/34/52/30 | 50 | mob-rush, rebel-war-cry | (9,2) W |
| gz-vanguard-a | Captain Zhou* | yellow | infantry | 1800 | 52/30/46/26 | 42 | mob-rush | (8,4) W |
| gz-vanguard-b | Captain Qin* | yellow | infantry | 1800 | 52/32/46/26 | 44 | mob-rush | (8,8) W |
| gz-horse | Raider Meng* | yellow | cavalry | 1500 | 56/26/42/22 | 38 | torch-raid | (9,6) W |
| gz-bowman-a | Palisade Archer Yan* | yellow | archers | 1300 | 48/38/42/28 | 50 | massed-arrows | (11,4) W (on the palisade) |
| gz-bowman-b | Palisade Archer Feng* | yellow | archers | 1300 | 48/36/42/28 | 48 | massed-arrows | (11,7) W (on the palisade) |

Zhang Liang and Zhang Bao have `loyalty: null` in `officers.json` (they cannot be swayed).

## Stratagems
No battle-local stratagems. The signature one already ships in `stratagems.json`:

| id | Name | Tag | Cost | Range | Area | Power | Effect | Follows |
|---|---|---|---|---|---|---|---|---|
| call-the-storm | Call the Storm | Command | 6 | 0–0 | self | 0 | wind: toward-target, gale, 2 rounds | — |
| yellow-sky-hex | Yellow Sky Hex | Ruse | 4 | 2–3 | single | 0.6 | confuse | Volley, Strike |

Per R2-STRAT-1: the caster picks one of the four neighbouring tiles as the direction. The gale holds through the next full round and the schedule resumes after it. A wind equal to the current wind is not castable. Qi 6 means Zhang Bao can first cast it in round 3 (he gains 2 Qi per phase from 0).

## Reinforcements
None. Every unit is on the board from round 1.

## Timeline
| Round | Phase | Kind | Text |
|---|---|---|---|
| 1 | start | message | Zhang Jiao lies sick behind the palisade. His brothers keep the camp, and Zhang Bao keeps the wind. |
| 4 | end | message | Black cloud gathers over the rebel altar. If fire burns on the plain, Zhang Bao will notice. |

## Enemy behaviour
| Unit | Hint | Why |
|---|---|---|
| zhang-liang | `hold` | The commander stays behind the palisade and makes the player come to him. |
| zhang-bao | `guard:10,1` | He stays on his altar, where he can see the plain. |
| gz-guard | `guard:zhang-bao` | A bodyguard for the sorcerer. |
| gz-vanguard-a, gz-vanguard-b, gz-horse | `advance` | The only sortie: they cross the river and the Han millet, so the player's fire has someone to burn. |
| gz-bowman-a, gz-bowman-b | `hold` | They shoot from the palisade over the gap. |

## Intended play (a design check, not a script)
Daxing Hill taught "light the millet when they cross". Guangzong teaches the other half: **whoever holds the wind decides who burns.**
1. The three sortie units cross the bridge and the fords into the Han millet. Under the opening east breeze the player can burn them with Jian Yong's Fire Attack (Qi 5 from round 3).
2. But once any fire burns on the plain, Zhang Bao can answer from the altar with a west gale. The same fire then spreads back through the Han belt toward the player's own line. Players who lit the belt and then stood in it, or behind it on plain tiles, are punished.
3. The counters: stand on road, village, ford or bridge tiles (flammability 0) when the sky darkens; keep the fire on the rebel belt across the river; or **silence Zhang Bao** — the altar is across the north ford with only Altar Warden Pei guarding him, and Guan Yu or a flanking archer line can reach it. Killing the sorcerer ends the storm threat.
4. Zhang Liang sits deep behind the palisade (11 tiles from the Han start). Cavalry can only enter the camp by the two-tile gap, so the final push is an infantry and archer job (rampart cost 2) or a Thundering Charge through the gap.

## Balance notes
- `npm run sim -- --battle guangzong --games 100` (random policy): han 2, yellow 98, avg 14.6 rounds, 0 invariant failures.
- `ai-bench --games 30` (seeds 5000–5029), normal(han) vs normal(yellow): han 14/30 = 47%, average 12.0 rounds, 9 timeouts. random(han) vs normal: 0%. normal(han) vs random(yellow): 100%. Within the aim.
- **Known gap:** the current utility AI never casts `call-the-storm` (Command stratagems other than heals score zero in `src/ai/evaluate.ts`; confirmed over a sample of normal-vs-normal games). The numbers above are therefore without the storm. When the AI is made objective-aware it should value a wind cast when (a) burning tiles exist on its side's front, (b) the reversed wind would burn more enemy than friendly value. Re-run the bench after that change; the Han win rate is expected to drop.
- Not tuned further.

## Rulings
- **Imperial guests** (`gz-imperial-*`) are invented fixed player-side units. Brief 14 lists no guests for battle 3; they were added so the Han line is not four units against eight. They never earn campaign XP.
- **Zhang Bao is a ranged altar guard**, not a sortie unit: `guard:10,1`. The AI's behaviour reading only draws him toward a tile.
- **Fire is bank-bound** by design: the river tiles (and fords and the bridge) have flammability 0 and spread only goes to orthogonal neighbours, so a fire cannot cross the river.
- Existing tests that depended on the Qingzhou/Guangzong stubs were adjusted minimally (see the Qingzhou spec).
