# RL — Minor battle: The Prison Cart (184 AD), `rl-prison-cart`

**Used by:** the roguelike era 1 stop `lu-zhi-in-chains/free` (`16-roguelike-era1.md` §3 and §4). Not in the campaign arc.

**Source story:** *Romance of the Three Kingdoms* ch. 1: Lu Zhi, Liu Bei's teacher, will not bribe the eunuch envoy Zuo Feng, is reported for cowardice and carried off to the capital in a prison cart. In the novel Zhang Fei wants to free him and Liu Bei stops him. Every line of prose is ours.

**Cast liberties / alt-history flags:**
- **Lu Zhi can be freed** (alt-history, flagged in `16-roguelike-era1.md`): this battle is the "free him" branch. Lu Zhi is not a unit; he is in the cart.
- The escort is invented (`invented: true`, ids `pc-*`): Escort Captain Huo, two halberd sergeants and two crossbow sergeants. Halberds are infantry and crossbows are archers (the engine's troop types).
- The escort fights for a **new side `court`** (R2-SIDE-2), "Imperial Escort", colour token `--court` #5d5a52 (iron grey).

## Objective
- Win: rout Escort Captain Huo (`routCommander`).
- Lose: Liu Bei is routed (`commanderLost`), or round 7 ends: **the cart is through the county gate** (`timeout`, `onTimeout: court`, `turnLimit: 7`).
- Side order: `han` then `court`. Par 5 rounds.
- Freeing Lu Zhi makes the band outlaws: the stop says so (stated flag `outlaw`); nothing in the battle depends on it.

## Deploy
`deploySlots: 3`, `required: [liu-bei]`, `defaultDeploy: [liu-bei, guan-yu, zhang-fei]`. Starts on the west road and the north ridge: (1,4) E, (0,3) E, (3,0) S.

## Map (14 × 8)
Legend: `.` plain, `T` forest, `h` hill, `=` road, `#` wall (the county gate's towers).

```
   x 0123456789ABCD
y0   hhhhTThhhhTThh
y1   h.TT..TT..TT.#
y2   ..T....T....T#
y3   ..............
y4   ==============
y5   ..............
y6   .T..TT...T..T#
y7   hhTThhhhTThhhh
```
- **The road** (y4) runs east–west through a wooded valley; low ridges (hills) on the north and south edges.
- **The county gate** is the east edge: wall towers at (13,1), (13,2) and (13,6) with the gate opening at (13,3)–(13,5). It is flavour: the loss is the round-7 clock.

## Wind schedule
Calm throughout.

## Officers (stats War/Int/Lead/Cha, Loyalty). `*` invented.
| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing | Hint |
|---|---|---|---|---|---|---|---|---|---|
| (deploy) | Liu Bei + two of the band | han | — | sliders | — | — | — | (1,4) E, (0,3) E, (3,0) S | — |
| pc-huo | Escort Captain Huo* (commander, with the cart) | court | infantry | 2200 | 58/44/60/36 | — | twin-blades | (6,4) E | `advance-to:13,4` |
| pc-halberd-a | Halberdier Sergeant Bi* | court | infantry | 2000 | 54/30/52/24 | 40 | mob-rush | (4,3) W | `hold` |
| pc-halberd-b | Halberdier Sergeant Ran* | court | infantry | 2000 | 53/30/54/26 | 45 | mob-rush | (4,5) W | `hold` |
| pc-crossbow-a | Crossbow Sergeant Kang* | court | archers | 1800 | 46/38/44/24 | 35 | massed-arrows | (7,3) W | `guard:pc-huo` |
| pc-crossbow-b | Crossbow Sergeant Fu* | court | archers | 1800 | 45/36/44/26 | 38 | massed-arrows | (7,5) W | `guard:pc-huo` |

Escort: Captain Huo and 4 units, 9,800 troops at tier scale 1.0. Loyalty 35–45 (paid men): a sway-heavy enemy.

## Timeline
| Round | Phase | Kind | Text |
|---|---|---|---|
| 1 | start | message | Captain Huo whips the cart horses east toward the county gate. His halberds turn to hold the road behind him. |
| 5 | end | message | The county gate is in sight. Two more rounds and the cart is through. |

## Intended play
**A target that runs.** Captain Huo walks the cart east every escort phase (`advance-to:13,4`, R2-BEH-1: an order the AI walks at full urgency even though the escort wins on time) while the halberds hold the road behind him and the crossbows keep close to him. A short clock, a fast cavalry chase (Guan Yu round the halberds) and Liu Bei's Charisma against thin loyalty: every swayed sergeant is a halberd that stops blocking the road.

## Balance notes (RL1b)
- Bench: greedy player (Liu Bei, Guan Yu, Zhang Fei; level 3, +2, 1,800 troops each) against the normal AI, 60 games (seeds 7000–7059): **han 32/60 = 53%**, 4.0 rounds; losses: 25 Liu Bei routed, 3 timeouts. The greedy bot swayed 1.9 escort units a game. At 1,500 troops each (40 games): 70%. The normal AI as the player (20 games): 30% (12 timeouts: it is too careful for the clock). 0 invariant failures, no stalls.
- Before the AI honoured `advance-to` at full urgency (Huo stayed put to threaten Liu Bei) the same bench gave 57–77%.

## Rulings
- `court` is the battle's only enemy side; a battle still has exactly two sides (validator). See R2-SIDE-2.
- The county gate is not a `gate` terrain: a court-only gate tile would make Huo unreachable from three sides and the battle unwinnable once he got there. The clock is the gate.
