# 06 — Xiapi (198 AD)

**Source story:** *Romance of the Three Kingdoms* chapter 19. Lu Bu, driven out of Xuzhou's neighbourhood, holds the walled town of Xiapi against Cao Cao and Liu Bei. Cao Cao's men dig the dykes of the Si and Yi so that the water floods the plain up to the walls; Chen Gong urges Lu Bu to sally and he does not; after two months three of Lu Bu's own captains (Hou Cheng, Song Xian and Wei Xu) tie up Chen Gong and open the gate. Lu Bu is taken and put to death, and Chen Gong and Gao Shun are executed after refusing to serve Cao Cao. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties / alt-history flags**
- **Alt-history (flagged):** Chen Gong and Gao Shun can be swayed and join the campaign roster (`recruitable: true` in `officers.json`). In the novel both die at Xiapi.
- Zhang Liao stands with Lu Bu as in the novel, but is **not** recruitable (he appears again later; in the novel he surrenders to Cao Cao here).
- The betrayal at the gate is a scripted timeline event (round 8): the engine cannot make a named subordinate's treachery conditional, and the historical captains are not individual units here.
- Cao Cao and Xiahou Dun fight as **guests** on the player's side (the player moves them; they earn no XP). Liu Bei's own companions are the deployed officers. Sun Qian and Mi Zhu are on the roster by now (they join after Xuzhou).
- Invented units, flagged `invented: true`: the Xiapi Picket Captain, two Wall Bowmen and Lu Bu's Household Guard.

## Objective
- Win: rout Lu Bu (a retreat counts; Lu Bu has no `retreatAt`).
- Lose: Liu Bei is routed, or round 14 ends (`onTimeout: lu`).
- Side order: `han` (player) then `lu`.
- Par: 11 rounds.

## Map (15 × 12)
Legend: `.` plain, `f` farm, `e` reeds, `T` forest, `h` hill, `v` village, `=` road, `~` river (impassable), `w` water (the moat, impassable), `#` wall, `r` rampart.

```
   x 0123456789ABCDE
y0   ~~~~~~~~~~~~~~~
y1   TT..eeeeeeeeeee
y2   T....fffwwwww..
y3   .hh..fff#r#r#..
y4   .hh..fff#...#..
y5   .hh=====#...#..
y6   .hh..fff#.v.#..
y7   .hh..fff#...#..
y8   .hh..fff#r#r#..
y9   T....fffwwwww..
y10  TT..eeeeeeeeeee
y11  ~~~~~~~~~~~~~~~
```
- **The town** is the walled block x8–12, y3–8. The interior is x9–11, y4–7, with a village at (10,6). The wall tile at (8,5) is the **barred west gate**: it is a wall until round 8 (see Rulings), then it becomes road.
- **Ramparts** (9,3), (11,3), (9,8), (11,8) hold the town's archers (+1 range). Their outer neighbours are moat water, so nobody can climb them from outside; only the interior and the gate lead in.
- **The dyke road** runs along y5 from the Han ridge (x3) to the gate (x7). It never floods.
- **The Han ridge** is the hills at x1–2, y3–8, with forest behind. It never floods.
- Farm belt x5–7 (flammable, 1.0). The reed banks at y1 and y10 are flammable. The interior of the town is plain (flammable 0.5).

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 5 | — | calm |

The east breeze carries a fire lit on the farm belt toward the walls (the walls themselves do not burn). The flood snuffs fire on any tile it covers.

## The flood (timeline, all `end` phase)
Bands are the plain, farm and reeds tiles outside the walls, by distance from the wall block (outermost first). Roads, hills, villages, ramparts and walls never flood; shallows are passable (3 / 4 / 3 move, ×1.25 damage to the occupant, no fire).

| When | Band | Tiles |
|---|---|---|
| end of round 3 | outer | x4–5, y1–10 (18 tiles: the west fields and the banks at the west end) |
| end of round 5 | middle | x6 (y1–10), the reed banks y1 and y10 from x7 east, x14 (33 tiles) |
| end of round 7 | inner | x7 (y2–9) and x13 (y2–9) (15 tiles, the foot of the walls) |
| start of round 8 | — | (8,5) wall → road: the west gate opens |

Every flood has a ledger message ("The first tide…", "The second tide…", "The third tide: Xiapi is an island. Only the dyke road is dry."); round 1 carries a message announcing all three. The gate opening is also open information (`query.timelinePreview`), and the pre-battle scene hints at it.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Shared officers use the numbers of 14-campaign-battles.md. `*` = invented (battle-local ids).

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | roster | 72/74/78/98 | — | twin-blades, rally | start 0: (2,5) E |
| (deploy 1–4) | roster choice: guan-yu, zhang-fei, jian-yong, mi-zhu, sun-qian | han | roster | roster | per table | — | per table | starts 1–4: (3,4) E, (3,6) E, (2,3) E, (2,7) E |
| cao-cao | Cao Cao (guest) | han | cavalry | 2800 | 72/94/98/96 | — | crescent-sweep, fire-attack, thundering-charge | (3,2) E |
| xiahou-dun | Xiahou Dun (guest) | han | cavalry | 2400 | 92/58/88/70 | — | thundering-charge, serpent-thrust | (3,8) E |
| lu-bu | Lu Bu (commander) | lu | cavalry | 4400 | 100/28/90/40 | — | thundering-charge, crescent-sweep, thunder-roar | (10,5) W |
| chen-gong | Chen Gong | lu | archers | 2300 | 52/92/75/64 | 45 (recruitable) | fire-attack, sow-discord | (9,3) N, rampart |
| gao-shun | Gao Shun | lu | infantry | 3400 | 86/50/88/55 | 50 (recruitable) | crescent-sweep, thunder-roar | (9,5) W, inside the gate |
| zhang-liao | Zhang Liao | lu | cavalry | 3600 | 93/78/94/76 | — (not swayable) | thundering-charge, crescent-sweep | (7,3) W, outside the north-west wall |
| xiapi-picket | Xiapi Picket Captain* | lu | infantry | 2800 | 62/35/55/30 | 75 | twin-blades | (7,8) W, outside the south-west wall |
| xiapi-bowman-n | Wall Bowman* | lu | archers | 2000 | 50/40/45/30 | 80 | massed-arrows | (11,3) N, rampart |
| xiapi-bowman-s | Wall Bowman* | lu | archers | 2000 | 50/40/45/30 | 80 | massed-arrows | (9,8) S, rampart |
| xiapi-guard | Lu Bu's Household Guard* | lu | infantry | 3400 | 74/30/70/30 | 85 | crescent-sweep | (10,4) W |

Deploy: `deploySlots` 5, `required` liu-bei, `defaultDeploy` liu-bei, guan-yu, zhang-fei, jian-yong, mi-zhu. The roster at this point is Liu Bei, Guan Yu, Zhang Fei, Jian Yong, Mi Zhu and Sun Qian (Zou Jing left after Qingzhou, Zhao Yun after Xuzhou), so one of the three support officers sits out. Eight enemy units, two guests and five deployed: seven on the Han side.

## Stratagems
No battle-local stratagems. The enemy uses the shared set (twin-blades, crescent-sweep, thundering-charge, thunder-roar, massed-arrows, fire-attack, sow-discord). Chen Gong's **Fire Attack** (int 92) is the only enemy fire and is a real threat to a Han line standing on the farm belt.

## Timeline and reinforcements
No reinforcements. See the flood table above. Round 1 `start` message is part of `state.opening`.

## enemyBehaviour (per enemy unit)
| Unit | Hint | Why |
|---|---|---|
| lu-bu | `pursue:liu-bei` | when the gate opens he goes for the commander down the dyke |
| chen-gong | `hold` | stays on his rampart and burns the farm belt |
| gao-shun | `advance` | the first through the gate |
| zhang-liao | `advance` | the sortie: rounds 1–3 he rides at the Han camp |
| xiapi-picket | `guard:7,8` | holds the south-west outpost |
| xiapi-bowman-n, xiapi-bowman-s | `hold` | rampart archers |
| xiapi-guard | `guard:10,5` | keeps beside Lu Bu |

## Intended play (a design check, not a script)
Water is the second enemy of everyone, and the player is meant to work out the timetable. For three rounds the field is dry and Zhang Liao rides out of the north-west corner at the Han camp: meet him on the ridge, kill him before the water slows the cavalry (shallows cost cavalry 4 per tile, so after round 3 a horseman moves one tile). Fire is a two-round window: a farm tile burning under the east breeze spreads toward the town, but the outer farms flood at the end of round 3 and the middle ones at the end of round 5, which puts any fire there out. The town cannot be stormed: the moat shuts the ramparts and the gate is barred, so until round 8 the only way to hurt the garrison is across the wall (archers, Fire Attack over the wall onto the interior plain, and sway, which works at range 2 over a wall). Chen Gong (Loyalty 45) and Gao Shun (Loyalty 50) are recruitable: Mi Zhu, Jian Yong and Liu Bei can reach them from the dyke end. Do it before round 8 and the Han line gets stronger for later battles.

At round 8 the gate opens and Lu Bu, who has been pacing inside, comes down the dyke after Liu Bei. The dyke is one tile wide and the ground either side is shallows: the unit at (7,5) can only be reached from (8,5), and Han units standing in the water take ×1.25 damage. Put Guan Yu or Zhang Fei at (7,5), the archers behind them on the road, and keep Liu Bei back and out of Lu Bu's reach (6 move plus a strike). Lu Bu has no `retreatAt`: he must be routed, so plan a chain (Volley → Strike → Strike) and bring Cao Cao's Crescent Sweep.

## Rulings
- **The barred gate is a wall tile, not a `gate` tile.** A unit swayed while it stands on a gate its new side does not own ends up on a tile it cannot enter; the invariant check in `tools/sim.ts` caught this on a Xiapi gate (a Wall Bowman swayed while on the gate tile). The effect is identical for play: nothing passes (8,5) until the timeline turns it into road at the start of round 8. `gateOwner` is therefore not set. (Engine follow-up: a swayed unit on a foreign gate should be shifted or refused.)
- Floods run at the **end** phase so a unit caught in the first band can still step out in that round; the gate opens at the **start** of round 8 so Lu Bu's side can act on it at once.
- The moat (`water`) sits directly outside every rampart so the rampart archers cannot be escaladed. Without it a normal-AI Han army climbed the ramparts in round 2 and routed Lu Bu by round 4; with it the siege lasts until the gate opens.
- Invented units' Loyalty is 75–85 so a sway attempt is a long shot; Chen Gong and Gao Shun keep their shared-table Loyalty (45 and 50) because they are the intended recruits.
- Lu Bu has 4400 troops since the campaign-balance pass (3600 before; above the 3000 ceiling of earlier commanders) because the walls give the Han side free ranged turns; this was the lever used to bring the AI win rate into range.
- Three battle-local officer records (`xiapi-picket`, `xiapi-bowman`, `xiapi-guard`) cover the four invented units; ids are prefixed `xiapi-`.

## Balance notes
- `npm run sim -- --battle xiapi --games 100` (random policy both sides): winners lu=94 han=6, reasons timeout=73 commander=27, avgRounds 12.94, 0 invariant failures; both sides win.
- AI bench, 30 games per direction, seeds 5000–5029, budget 300 ms (a locally patched copy of `tools/ai-bench.ts`, because the committed bench hard-codes the enemy seat as `yellow` and crashes on `lu`): `normal(han)` vs `normal(lu)` 25/30 = 83%, average 11.1 rounds, 3 timeouts; `random(han)` vs `normal(lu)` 0/30; `normal(han)` vs `random(lu)` 30/30. With the first troop numbers and the 8-unit enemy `normal(han)` won 97–100%, so the garrison was thickened (Gao Shun, Zhang Liao, the picket, the Household Guard and Chen Gong gained 400–600 troops each, the bowmen 300); a second north picket that fitted the design was dropped to stay at 8 units.
- The normal AI sways freely (about 2 attempts per game) and spends rounds 1–7 shooting across the walls; both are why the Han win rate is at the top of the target range. Re-bench once the AI becomes objective-aware.
- **Campaign-balance pass (AI v2, battles 2-9).** With the improved AI the bench (normal vs normal, roster officers at 2000 troops) had Han at **87%** / 11.4 rounds, above the 40-65% wanted for battle 6. Change, all in `xiapi.json` and troops only, a roughly +20-25% garrison: Lu Bu 3600 -> 4400, Gao Shun and the Household Guard 2800 -> 3400, Zhang Liao 3000 -> 3600, the picket 2200 -> 2800, the wall bowmen 1600 -> 2000, Chen Gong 1900 -> 2300. The flood timeline, the walls/moat and the round-8 gate are untouched.
  Result (normal vs normal, 30 games): seeds 5000-5029 **87% -> 57%**, 11.2 rounds (7 timeouts); holdout seeds 7000-7039 **55%**, 11.6 rounds. random(han) 0%. 0 fallbacks / illegal / invariants. No test changed.
