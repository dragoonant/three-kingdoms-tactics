# RL — Minor battle: Dong Zhuo's Rout (184 AD), `rl-dong-zhuo-rescue`

**Used by:** the roguelike era 1 stop `dong-zhuo-rescue/charge` (`16-roguelike-era1.md` §3 and §4); a win opens the aftermath stop `dong-zhuo-snub`. Not in the campaign arc.

**Source story:** *Romance of the Three Kingdoms* ch. 1: Dong Zhuo, routed by Zhang Jiao, is rescued by the three brothers' charge, then snubs them because they hold no office. Every line of prose is ours.

**Cast liberties / alt-history flags:**
- Dong Zhuo is the novel's figure (shared officer in `officers.json`, kit figure and portrait). He fights here as a **guest the player cannot order** (R2-GUEST-2).
- The rebel host is invented (`invented: true`, ids `dz-*`): Taiping Marshal Gou and five units.

## Objective
- Win: rout the Taiping Marshal (`routCommander`), **or** reach the end of round 8 (`survive 8`) with Dong Zhuo alive or escaped.
- Lose: Liu Bei is routed (`commanderLost`), or **Dong Zhuo is routed** (`unitLost dong-zhuo`). Lose is checked first, so the survive win needs him not to have fallen; an escaped Dong Zhuo is not lost.
- Side order: `han` then `yellow`. `turnLimit 8`. Par 6 rounds.

## Deploy
`deploySlots: 4`, `required: [liu-bei]`, `defaultDeploy: [liu-bei, guan-yu, zhang-fei, jian-yong]`. Starts on the north ridge (the flank charge): (4,1) S, (5,0) S, (6,1) S, (3,0) S.

**Guest:** Dong Zhuo, cavalry 1,600 of 2,400 (mauled), at (12,6) facing W, `guestControl: 'ai'`, hint `flee:west`. At the end of every player phase he rides as far west as he can (R2-GUEST-2) and **escapes when he reaches the west edge**; boxed in, he strikes the weakest rebel next to him.

## Map (16 × 10)
Legend: `.` plain, `h` hill (the ridge), `o` ford (the dry riverbed: slow going, ×1.2 damage taken).

```
   x 0123456789ABCDEF
y0   hhhhhhhhhhhhhhhh
y1   ..hhhhhh.hhhh...
y2   .......oo.......
y3   .......oo.......
y4   .......oo.......
y5   .......oo.......
y6   .......oo.......
y7   .......oo.......
y8   .......oo.......
y9   .......oo.......
```
- **The ridge** (y0–1) along the north edge: the band starts on it, above the plain.
- **The dry riverbed** (x7–8, y2–9) runs across the middle of the plain: cavalry spend 3 per tile, so Dong Zhuo needs a whole move to cross it and so do the rebel riders.
- **The west edge** (x0) is the way out.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | W | breeze |
| 5 | — | calm |

## Officers (stats War/Int/Lead/Cha, Loyalty). `*` invented.
| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing | Hint |
|---|---|---|---|---|---|---|---|---|---|
| (deploy) | Liu Bei + three of the band | han | — | sliders | — | — | — | the ridge | — |
| dong-zhuo | Dong Zhuo (AI guest) | han | cavalry | 1600 / 2400 | 80/58/74/40 | — | thundering-charge | (12,6) W | `flee:west` |
| dz-marshal | Taiping Marshal Gou* (commander) | yellow | infantry | 2600 | 66/60/62/40 | — | mob-rush, yellow-sky-hex | (15,5) W | `pursue:dong-zhuo` |
| dz-horse-a | Rebel Rider Wen* | yellow | cavalry | 2200 | 58/26/44/22 | 40 | mob-rush | (15,3) W | `pursue:dong-zhuo` |
| dz-horse-b | Rebel Rider Que* | yellow | cavalry | 2200 | 57/25/43/20 | 42 | torch-raid | (15,8) W | `advance` |
| dz-spear-a | Rebel Captain Lin* | yellow | infantry | 2400 | 54/30/48/26 | 44 | mob-rush | (14,4) W | `advance` |
| dz-spear-b | Rebel Captain Zang* | yellow | infantry | 2400 | 53/32/47/24 | 46 | mob-rush | (14,7) W | `advance` |
| dz-bowmen | Rebel Bowman Ying* | yellow | archers | 2000 | 46/38/42/26 | 48 | massed-arrows | (15,6) W | `guard:dz-marshal` |

Rebels: the Marshal and 5 units, 13,800 troops at tier scale 1.0. The rebel AI treats Dong Zhuo as a prize (his rout wins them the battle).

## Timeline
| Round | Phase | Kind | Text |
|---|---|---|---|
| 1 | start | message | Dong Zhuo will not take your orders. He rides for the west edge of the plain, and the Taiping Marshal rides after him. |
| 4 | end | message | The rebel host is strung out across the plain. Its flank is open. |

## Intended play
**Save a man who won't take orders.** Unhindered, Dong Zhuo reaches the riverbed in round 1, the far side in round 2 and the west edge in round 3. The rebel riders cut across the band's front to catch him; their zone of control stops him dead. The player chooses between screening him (charging the riders from the ridge) and striking the Marshal while the host's flank is open. Once he is away, holding to the end of round 8 also wins.

## Balance notes (RL1b)
- Bench: greedy player (Liu Bei, Guan Yu, Zhang Fei, Jian Yong; level 3, +2, 1,800 troops each) against the normal AI, 60 games (seeds 7000–7059): **han 28/60 = 47%** (23 by surviving round 8, 5 by routing the Marshal), 6.6 rounds; all 32 losses were Liu Bei routed. Dong Zhuo escaped in every game. At 1,500 troops each (40 games): 35%. The normal AI as the player (20 games): 100% by holding to round 8: a careful player finds this easy once Dong Zhuo is away (a known gap for RL2/RL4 tuning). 0 invariant failures, no stalls.
- Tried and dropped: a sixth rebel unit (a third rider) with Dong Zhuo starting one tile further east lost every game in round 2 (Dong Zhuo caught at once); the sixth rider alone took the greedy player from 47% to 0% (Liu Bei routed by the riders). The spec's 5–6 units is met with 5.

## Rulings
- **Dong Zhuo acts at the end of the player's phase** (R2-GUEST-2), not in a phase of his own: sides stay two per battle, and his flight always follows the player's moves, so the player can open or block the road for him.
- He escapes as soon as he stands on the west edge (no separate escape action). An escape is not a loss and is not counted as routed or retreated.
