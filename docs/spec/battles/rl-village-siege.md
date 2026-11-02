# RL — Minor battle: A Village Under Siege (184 AD), `rl-village-siege`

**Used by:** the roguelike era 1 stop `village-under-siege/break` (`16-roguelike-era1.md` §3 and §4). Not in the campaign arc.

**Source story:** none directly; a road incident in the spirit of *Romance of the Three Kingdoms* ch. 1 (the Yellow Turbans plunder the countryside of Youzhou). Every line of prose is ours.

**Cast liberties / alt-history flags:**
- Every enemy officer is invented (`invented: true`, ids `vs-*`): Raider Chief Tang, Raider Lu, Raider Captains Pan and Ji, Torchbearer Hou. None is recruitable.
- The village militia ("Elder Qiu's Militia", `vs-militia`) is an invented guest.

## Objective
- Win: rout the Raider Chief (`routCommander`).
- Lose: Liu Bei is routed (`commanderLost`), the militia is routed (`unitLost vs-militia`), or round 10 ends (`timeout`, `onTimeout: yellow`).
- Side order: `han` then `yellow`. Par 7 rounds.

## Deploy
`deploySlots: 3`, `required: [liu-bei]`, `defaultDeploy: [liu-bei, guan-yu, zhang-fei]`. The band enters from the south-west: starts (1,6) E, (0,7) E, (1,8) E. Troops come from the run's deploy sliders (RL-DEPLOY-2); enemy troops are at tier scale 1.0 and the run layer passes `enemyTroopScale` (RL-MOD-2).

**Guest:** the village militia, infantry 600, on the village at (8,4) facing W. It is an **AI-moved guest** (`guestControl: 'ai'`, hint `hold`, R2-GUEST-2): the elders hold their houses and take no orders from a stranger; it never moves and strikes a raider who reaches it. (Ruling below.)

## Map (12 × 10)
Legend: `.` plain, `f` farm (millet), `T` forest, `#` wall (the cart barricade), `=` road (the cart gap), `v` village, `~` river (the stream).

```
   x 0123456789AB
y0   TT..ffffffTT
y1   T...ffffffff
y2   ....ffffffff
y3   ....ff#####f
y4   ....ff=vvv#f
y5   ....ff=vvv#f
y6   ....ff#####f
y7   ....ffffffff
y8   ...fffffff..
y9   ~~~~~~~~~~~~
```
- **The village** (x7–9, y4–5): six village tiles (heal 5% a phase) behind a cart barricade of walls, with a **two-tile gap on the west** at (6,4)–(6,5).
- **The ring of millet** round the barricade (x4–5 and x11, y1–2 and y7–8): flammable.
- **The threshing floor** is the farm at (4,4)–(4,5), directly in front of the gap. It is **burning from round 1** (timeline `ignite`), under a breeze toward the east (toward the houses): the fire creeps to (5,4)–(5,5) and anyone who comes to the gap goes through smoke.
- **The stream** along the south edge is impassable.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 4 | — | calm |
| 7 | E | breeze |

## Officers (stats War/Int/Lead/Cha, Loyalty). `*` invented.
| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing | Hint |
|---|---|---|---|---|---|---|---|---|---|
| (deploy) | Liu Bei + two of the band | han | — | sliders | — | — | — | (1,6), (0,7), (1,8) E | — |
| vs-militia | Elder Qiu's Militia* (AI guest) | han | infantry | 600 | 34/40/72/50 | — | mob-rush | (8,4) W | `hold` |
| vs-raider-chief | Raider Chief Tang* (commander) | yellow | infantry | 2200 | 64/34/56/30 | — | mob-rush, rebel-war-cry | (9,0) S | `guard:6,2` |
| vs-raider-horse | Raider Lu* | yellow | cavalry | 1800 | 56/25/42/22 | 38 | mob-rush | (11,8) W | `advance` |
| vs-raider-spear-a | Raider Captain Pan* | yellow | infantry | 1800 | 52/28/46/24 | 42 | mob-rush | (6,0) S | `advance` |
| vs-raider-spear-b | Raider Captain Ji* | yellow | infantry | 1800 | 51/30/45/26 | 44 | mob-rush | (9,8) W | `advance` |
| vs-raider-torch | Torchbearer Hou* | yellow | infantry | 1600 | 48/36/40/24 | 40 | torch-raid | (8,1) S | `advance` |

Rebels: the chief and 4 units, 9,200 troops at tier scale 1.0. The rebel AI treats the militia as a prize (its rout wins them the battle, `unitLost`).

## Timeline
| Round | Phase | Kind | Text / tiles |
|---|---|---|---|
| 1 | start | ignite | (4,4), (4,5): the threshing floor |
| 1 | start | message | The threshing floor in front of the cart gap is burning, and the breeze is carrying it toward the houses. |
| 3 | end | message | The elders shout from the carts: the raiders are at the gap. |

## Intended play
1. **Rounds 1–2:** the band crosses the stubble from the south-west while the raiders come round the barricade from the north and the south-east toward the gap. The fire in front of the gap slows both.
2. **The gap:** whoever holds (5,3)–(5,6) and the gap tiles decides whether the militia lives. The militia's village heals it 5% a phase, but two raiders at the gap will kill it in a few rounds.
3. **The chief** waits behind his men north of the barricade (`guard:6,2`). Breaking through to him while the gap holds is the win.

## Balance notes (RL1b)
- Bench: greedy player (Liu Bei, Guan Yu, Zhang Fei; level 3, +2 stat bonus, 1,800 troops each) against the normal AI, 60 games (seeds 7000–7059): **han 42/60 = 70%**, 8.1 rounds average; losses: 5 Liu Bei routed, 6 militia routed, 7 timeouts. At 1,500 troops each (40 games): 65%. The normal AI as the player (20 games): 60%. `ai-bench` normal vs random 100% from both seats. 0 invariant failures, no stalls. The easiest of the four on purpose: it is a village stop, often met in an early tier (tier 1 scale 0.85 makes it easier, the mid tiers' 1.05–1.2 harder).
- First draft (militia player-controlled, raiders one tile from the gap) lost 30/30 in round 1: the greedy bot walked the 600-man militia out to fight and the raiders reached the gap in round 1. The raiders now start 3–4 tiles further out and the militia is AI-held.

## Rulings
- **The militia is an AI-moved guest** (R2-GUEST-2, hint `hold`): spec 16 lists it only as a guest; holding it in the houses keeps the "break in fast or the militia dies" pressure on the player rather than letting the militia leave the village, and a run's greedy bench cannot suicide it.
- The "two farm tiles inside the ring" are read as the threshing floor at (4,4)–(4,5), the inner edge of the ring in front of the gap; burning tiles inside the walls would not threaten anyone (village tiles do not burn).
