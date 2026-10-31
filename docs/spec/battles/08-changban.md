# 08 — Changban (208 AD)

**Source story:** *Romance of the Three Kingdoms* chapters 41–42. After Liu Cong surrenders Jing Province, Liu Bei will not abandon the tens of thousands of people who followed him from Xiangyang, and the column crawls toward Jiangling. Cao Cao sends his light cavalry after it, and they run it down at the Changban slope. Zhao Yun rides back through the enemy host for Liu Bei's infant son; Zhang Fei takes twenty horsemen to the Changban bridge, sits his horse across the road and roars until Cao's riders will not come on. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties:** the novel scatters the brothers and strategists across the chase; here the player's own company is the column, and the whole roster (Zhuge Liang, Zhao Yun and Guan Ping included) is available to deploy. The geography is stylised: the stream and its bridge lie *behind* the column (north of it), with a long marsh and the road south ahead, which keeps Zhang Fei where the novel puts him, on the bridge facing the pursuit. Zhang He, Xu Chu, Xiahou Yuan and Cao Ren are drawn from Cao Cao's pursuit force; the novel does not place each of them at Changban. The five light-cavalry, bowman and pike captains are invented (`invented: true`, never recruitable). No officer is recruited in an alternate-history way here.

## Objectives
- Win: **escape** — Liu Bei and three other player units (four in all) walk onto the exit zone and take the Escape action. Escaped units are off the board, not routed.
- Lose: Liu Bei is routed, or round 12 ends (`onTimeout: cao`).
- Side order: `han` then `cao` (the enemy side is `cao`, banner token `cao`). `par` 8.
- Cao Cao is the enemy commander (the engine needs exactly one) but routing him does not win this battle. He arrives in round 6 and holds the north edge.

## Map (16 × 14)
Legend: `.` plain, `f` farm, `T` forest, `h` hill, `v` village, `=` road, `~` river, `o` ford, `b` bridge, `e` reeds.

```
   x 0123456789ABCDEF
y0   TT...f..=..f..TT      Cao staging bank; the road and bridge at x8
y1   ~~o~~~~~b~~~~o~~      the stream (impassable); bridge (8,1)-(8,2); fords at x2 and x13
y2   ~~o~~~~~b~~~~o~~
y3   T..ff...=.T..f..      the column's start (bridgehead fields)
y4   ..f...hh=....f..
y5   eeeeeeee=eeeeeee      the marsh: five rows of reeds, a causeway road at x8
y6   eee.eeee=eeee.ee
y7   eeeeee.e=e.eeeee
y8   ee.eeeee=eeeee.e
y9   eeeeeeee=eeeeeee
y10  ..f...T.=..T.f..      firm ground; the exit zone is rows y11-y13, x2..x13
y11  T.f..T..=...f..T
y12  T...v...=...v..T
y13  TT......=.....TT
```
- **The bridge** is two tiles long and one tile wide at (8,1)-(8,2) (terrain `bridge`, listed in `bridges`). A unit standing on the south bridgehead (8,3) can be reached from the bridge by exactly one melee attacker. The two fords (x2 and x13, both stream rows) cost 2/3/2 per tile (6 for cavalry to wade both rows), so going round the plug costs a cavalry unit a whole activation.
- **The marsh** (rows y5-y9) is reeds: cost 2/3/2, defence 0.90, flammability 1.0. The causeway road at x8 runs straight through it at cost 1. Dry islets (`.`) and a hill pair at (6,4)/(7,4) give footing.
- **Exit zone:** every tile in rows y11, y12 and y13 with x from 2 to 13 (36 tiles, including the two villages at (4,12) and (12,12) which heal the unit that stands on them).

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | N | breeze |
| 8 | — | calm |

The breeze blows **toward the pursuers**. Fire set in the marsh runs north (60% per round to the tile directly above a burning reed tile, nothing sideways), away from a column that is moving south. This is the player's rear-guard weapon: reeds behind you can be set alight to stop horses. The round-8 calm ends that: fire spreads 15% in all four directions and the marsh becomes a danger to both sides.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Player: `playerStarts` has six tiles (deploy slots 6); Liu Bei is required, the player picks five more from the roster (Guan Yu, Zhang Fei, Jian Yong, Mi Zhu, Sun Qian, Zhuge Liang, Zhao Yun, Guan Ping at this point of the arc). `defaultDeploy` (sim, tests, quick battle): Liu Bei, Zhang Fei, Guan Yu, Zhao Yun, Zhuge Liang, Guan Ping. Shared officers use the numbers in `14-campaign-battles.md` exactly.

| Start tile (slot) | Facing |
|---|---|
| slot 0, (8,5) | S |
| slot 1, (7,3) | N |
| slot 2, (9,4) | S |
| slot 3, (6,5) | S |
| slot 4, (10,5) | S |
| slot 5, (7,6) | S |

Slot 1 is next to the bridgehead on purpose: put Zhang Fei there.

Enemy (`cao`). `*` = invented.

| Unit id | Officer | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|
| changban-rider-a | Light Cavalry Captain Hu* | cavalry | 1800 | 72/38/52/35 | 40 | thundering-charge | (5,8) S |
| changban-rider-b | Light Cavalry Captain Mo* | cavalry | 1800 | 70/35/50/32 | 42 | serpent-thrust, thundering-charge | (11,8) S |
| changban-rider-d | Light Cavalry Captain Ren* | cavalry | 1800 | 71/36/51/33 | 41 | thundering-charge | (4,11) N |
| changban-picket | Pike Captain Gui* | infantry | 1800 | 68/42/60/40 | 48 | serpent-thrust, thunder-roar | (8,10) N (on the causeway) |
| changban-bowmen | Bowman Captain Pei* | archers | 1300 | 60/45/48/38 | 45 | massed-arrows | (11,0) S |
| zhang-he | Zhang He | cavalry | 2200 | 90/68/86/60 | — | thundering-charge, crescent-sweep | wave, round 2 |
| changban-rider-c | Tiger Cavalry Captain Yue* | cavalry | 1400 | 76/40/58/38 | 50 | thundering-charge, crescent-sweep | wave, round 2 |
| xu-chu | Xu Chu | infantry | 2400 | 97/32/66/45 | — | serpent-thrust, thunder-roar | wave, round 4 |
| xiahou-yuan | Xiahou Yuan | archers | 2000 | 90/55/85/66 | — | arrow-rain, massed-arrows | wave, round 4 |
| cao-cao | Cao Cao (commander) | cavalry | 3000 | 72/94/98/96 | — | crescent-sweep, fire-attack, thundering-charge | wave, round 6 |
| cao-ren | Cao Ren | infantry | 2400 | 86/62/90/68 | — | serpent-thrust, crescent-sweep | wave, round 6 |

The captains have a Loyalty value so a high-Charisma officer can sway them (Liu Bei 98 against 40-50 is a real option on the causeway, as at Daxing Hill). Named officers are not swayable.

## Stratagems
No battle-local stratagems. The ones that matter here:
| id | Who | Why it matters at Changban |
|---|---|---|
| bridge-roar (Shout, 5 Qi, ring2, provoke + confuse) | Zhang Fei, learned at level 5 | cast from the bridgehead it hits whatever stands on the two bridge tiles and the bank behind them: a confused rider on the bridge blocks it for everyone behind |
| kindling (Fire, 3 Qi, range 1-2) | Jian Yong, level 3 | one reed tile, then the breeze does the rest |
| valley-blaze (Fire, 6 Qi, cross, range 2-4) | Zhuge Liang | five tiles at once: a fire line across the causeway approach |
| thunder-roar (adjacent confuse) | Zhang Fei before level 5 | the poor man's roar: only the tile beside him |

(The sim and quick battle build entries at level 1 with each officer's base stratagems, so Zhang Fei carries thunder-roar there. The campaign deploy adds bridge-roar once he reaches level 5; the integration test builds that entry explicitly.)

## Reinforcements and timeline
All enemy waves enter on the north edge (the Cao bank), where the stream is between them and the column.
| Round (cao phase) | Units | Entry tiles |
|---|---|---|
| 2 | Zhang He, Tiger Cavalry Captain Yue | (6,0), (10,0) |
| 4 | Xu Chu, Xiahou Yuan | (7,0), (9,0) |
| 6 | Cao Cao (commander, holds), Cao Ren | (8,0), (6,0) |

Total enemy: five at the start (four in the marsh and on the causeway, one bowman on the far bank) plus six in waves.

| Round | Phase | Timeline item |
|---|---|---|
| 1 | start | message: Cao Cao's light riders have covered three hundred li; the bridge is the only dry crossing |
| 5 | start | message: dust on the northern road, the infantry and bowmen are coming up behind the horse |
| 6 | start | message: a great banner on the far bank; Cao Cao has come to see the chase |
| 10 | start | message: the light is going; whoever is still on the road at nightfall is on their own |

## enemyBehaviour
| Unit | Hint | Why |
|---|---|---|
| changban-rider-a, -b, -d | ambush:3 | light riders lying in the reeds and the farms of the south bank; they spring when a Han unit comes within three tiles or one of them is attacked. Open information, shown as "Lying in wait" |
| changban-picket | hold | a pike line planted on the causeway exit that the column must break or wade around |
| changban-bowmen | advance | covers the bridge from the far bank (range 2-3) |
| zhang-he, changban-rider-c, xu-chu, xiahou-yuan, cao-ren | advance | the pursuit |
| cao-cao | hold | he watches from the north edge. The player cannot reach him, and does not need to |

## Intended play
Changban is the one battle in the campaign you win by leaving. The company starts on the south bank of the stream, just past the bridge, with a marsh between it and the road south and light cavalry already lying in the reeds. Nobody can simply walk the causeway: a pike line holds its southern end and the ambush riders pounce on whoever comes within three tiles, so the first two rounds are about cutting a way through, kill the picket and the nearest rider with Guan Yu or Zhao Yun, screen Liu Bei (infantry, four movement) so that he is never the first unit within three tiles of an ambusher, and keep him off the exposed edge of the reeds.

Behind the column the real clock is running. Zhang He and the Tiger Captain arrive on the far bank in round 2 and can cross the bridge in the same enemy phase unless something stands in the way. Zhang Fei on the bridgehead (8,3) is that something: one rider at a time can fight him from the bridge, and bridge-roar (level 5) confuses and provokes everything within two tiles, so the confused rider on the bridge becomes a cork. The fords at x2 and x13 are the way round: they cost a cavalry unit a whole activation to wade, which is roughly the time the roar buys. Xu Chu and Xiahou Yuan (round 4) are slow and archers shoot across the stream, so the plug is worth most in rounds 2-5.

The breeze runs north. Zhuge Liang's valley-blaze or Jian Yong's kindling, cast from the firm ground at the south end into the marsh behind the column, burns the reeds the pursuers must wade through, and the fire cannot spread south toward you; the round-8 calm ends that safety. Four of six units must reach the exit zone, so losing two is survivable, but every unit you leave behind in the marsh is a unit routed (and, with the Iron Oath on, a unit lost). A fast player escapes in round 3; a careful one takes the whole company out by round 6.

## Balance notes
- `npm run sim -- --battle changban --games 100` (random policy both sides): winners cao=97 han=3, avgRounds 10.69, invariantFailures=0. A random walker has very little chance of crossing a marsh, so the Han random win rate comes from a deliberately short run (the exit zone is three rows deep) and a wide exit; see Rulings.
- `tools/ai-bench.ts --battle changban --games 30 --pairs normal:normal,random:normal,normal:random --jobs 4` (the stock bench crashes on non-`yellow` enemy sides; I ran a local copy with the seat table keyed by the real enemy side id): normal(han) vs normal(cao) 0% (25 of 30 timeouts, 11.5 rounds), random(han) vs normal(cao) 0%, normal(cao) vs random(han) 100%. **These numbers are not meaningful yet:** the current AI only treats units named in `escape.units` as wanting to escape (so only Liu Bei, never the three others), and a traced game shows Han units standing on exit tiles for ten rounds without using Escape. Re-run once the objective-aware AI lands; I expect the win rate to rise sharply.
- A scripted runner (every unit steps toward the nearest exit tile, escapes when it can, ignores fights) against the stock AI as Cao: 20/20 wins in 3 rounds with three ambushers; with a fourth ambusher the same runner lost 20/20 (Liu Bei is first to arrive and is caught in the open), which is why the data has three. A real player should land between those: the difficulty is Liu Bei's exposure, not distance.
- Because a pure runner wins, the intended difficulty comes from the player trying to bring the whole company out and from stronger AI play; if playtests find it too soft, add a fourth ambusher on the east flank (12,11) and deploySlots 7.

## Rulings
- **Geometry reversed from the brief's sketch.** The brief puts the river and bridge in the south-middle with the exit beyond them. A random-policy run of that layout never produced a Han win in 100 games (a random walker does not cross a one-tile bridge), failing the "each side wins at least once" gate, and the novel stands Zhang Fei facing the pursuit on the bridge. So the stream is in the north, the column starts just south of it, Cao's waves enter on the far bank, and the exit is the south of the map. The bridge, the one-tile choke, the fords and the marsh are all as briefed.
- **Exit zone is rows y11-y13 (x2..x13), not only the last row**, for the same reason; the label in the data says "Get Liu Bei and three more off the south edge".
- **deploySlots 6, not 7:** with Liu Bei plus three needed from six units, the player can afford to lose only two; a seventh unit made the escape too loose in scripted-runner testing.
- **`escape.units: ["liu-bei"]`, `count: 4`** as briefed: Liu Bei must be one of the four, any three others count.
- Marsh and causeway: the causeway road (x8, y5-y9) is deliberately cost-1, so the column is a line along it unless it wades; `bridges` lists both bridge tiles for the client.
- Wave entry tiles on the north bank can be blocked by a unit that has not moved (the engine shifts an arrival to the nearest free tile); the integration test relies on this for Cao Ren in round 6.
