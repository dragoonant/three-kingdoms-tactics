# 09 — Red Cliffs (208 AD)

**Source story:** *Romance of the Three Kingdoms* chapters 46–50. Cao Cao's northern army, newly arrived on the Yangtze, chains its ships bow to stern so that men who cannot stand on a rolling deck can fight on a steady one. Zhou Yu, Zhuge Liang and the old general Huang Gai wait for the one thing the plan needs, a south-east wind in the dead of winter, which Zhuge Liang calls up from a platform on the south bank. Huang Gai's fire ships, flying a flag of surrender, close on the fleet and set the whole chain alight. Cao Cao escapes north by the Huarong road with a handful of men. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties:**
- Cai Mao (Cao Cao's fleet admiral) is executed by Zhou Yu's trick *before* the battle in the novel (ch. 45). He is here because the campaign brief names him; flagged as a liberty.
- Cao Ren was at Jiangling, not on the river, and Zhang Liao and Xu Chu fought elsewhere on the retreat; here they command landing parties from the fleet.
- The engine's wind has four cardinal directions. The novel's **south-east** wind (blowing toward the north-west) is modelled as a wind **toward N**: straight up the river into the fleet, which is what matters for the fire. The brief calls it "toward NW"; the closest cardinal is chosen and logged under Rulings.
- Pang Tong's chain scheme is not shown; the fleet is simply already chained. Huang Gai's "bitter flesh" ruse is not a mechanic.
- Four fleet captains are invented (`invented: true`, never recruitable).

## Objectives
- Win: **rout Cao Cao** — his troops fall to 50% or below and he leaves the field (`retreatAt 0.5`, which counts as routed), or he is routed outright.
- Lose: Liu Bei is routed, or round 14 ends (`onTimeout: cao`).
- Side order: `han` then `cao` (banner token `cao`). `par` 12.
- Guests (fixed Han units, never from the roster, no campaign XP): Zhou Yu (archers, 2200) and Gan Ning (cavalry, 2200). **Huang Gai** arrives in round 5 as a Han reinforcement.

## Map (16 × 13)
Legend: `.` plain, `T` forest, `h` hill, `v` village, `w` water (impassable), `d` deck, `s` shallows, `e` reeds.

```
   x 0123456789ABCDEF
y0   wwwwwwwwwwwwwwww      open river
y1   wwwwddddddddwwww      the chained fleet: 48 deck tiles, one 4-connected region
y2   wwwddddddddddwww
y3   wwwddddddddddwww
y4   wwwddddddddddwww
y5   wwwddddddddddwww
y6   ssseesssssseesss      the strip: shallows, with reed landings at x3-4 and x11-12
y7   eeeeeeeeeeeeeeee      the reed beds of the south shore
y8   .T....hh....T...      the allied shore: hills at (6,8)/(7,8)
y9   ...T......T.....
y10  ..h..........h..
y11  .....v....v.....
y12  T..............T
```
- **The fleet** is decks (cost 1/2/1, flammable 1.0). A burnt-out deck becomes water, and a unit left on it is pushed to the nearest free passable tile. The fleet is connected by construction (a test checks it).
- **The strip** (y6) is shallows (cost 3/4/3, defence 1.25: whoever stands there takes 25% more) except four reed landings at (3,6),(4,6),(11,6),(12,6). Shallows do not burn, so the fleet's fire cannot reach the shore across them; the reed landings and the reed beds behind them (y7, flammability 1.0) can carry it. Cavalry that wades the strip has just cost itself two-thirds of a move.
- **The allied shore** (y8-y12): two hills at (6,8)/(7,8) give archers +1 range (an archer on a hill reaches rows y5-y6 from y8), two villages (heal 5%) at (5,11)/(10,11), forest at the corners.
- Enemy units start on decks. The player starts on the shore at y9-y11. `playerStarts`: (8,11), (7,10), (9,10), (6,10), (10,10), (8,9), all facing N.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | S | breeze |
| 5 | N | gale |

Rounds 1–4: a breeze toward the **south shore**. Fire on the fleet is carried the wrong way: from a lit deck it can spread only to the tile south of it (60%) and then dies at the strip; and fire at the landing reeds runs down onto the Han reed beds and camp. Round 5: the south-east wind arrives, modelled as a gale toward N: 100% to the tile downwind and 30% to each side, per burning tile, every round. A fire set on the south edge of the fleet runs north one row a round and fans sideways. Burn-out takes two rounds a tile, so the row nearest the shore sinks first.
Zhuge Liang at level 7 knows **borrow-the-wind** (Command, 6 Qi, gale toward a chosen direction for 3 rounds): cast in rounds 2–4 it brings the gale forward, at the cost of his action, a real choice.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Player: `deploySlots` 6, required **Liu Bei and Zhuge Liang**, `defaultDeploy` Liu Bei, Zhuge Liang, Guan Yu, Zhang Fei, Zhao Yun, Guan Ping. With the guests the player side starts with 8 units. Shared officers use the numbers in `14-campaign-battles.md` exactly. `*` = invented.

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|
| zhou-yu | Zhou Yu (guest) | han | archers | 2200 | 76/96/96/90 | — | fire-attack, massed-arrows | (6,8) N, on the hill |
| gan-ning | Gan Ning (guest) | han | cavalry | 2200 | 94/62/82/55 | — | thundering-charge, twin-blades | (10,9) N |
| huang-gai | Huang Gai (reinforcement) | han | infantry | 1800 | 80/68/82/72 | — | serpent-thrust, fire-ships | round 5, entry (9,6) N |
| cao-cao | Cao Cao (commander, retreatAt 0.5) | cao | cavalry | 3000 | 72/94/98/96 | — | crescent-sweep, fire-attack, thundering-charge | (7,3) S |
| cai-mao | Cai Mao | cao | archers | 2000 | 66/70/74/40 | — | arrow-rain, massed-arrows | (7,2) S |
| cao-ren | Cao Ren | cao | infantry | 2400 | 86/62/90/68 | — | serpent-thrust, crescent-sweep | (4,4) S |
| xu-chu | Xu Chu | cao | infantry | 2400 | 97/32/66/45 | — | serpent-thrust, thunder-roar | (11,4) S |
| zhang-liao | Zhang Liao | cao | cavalry | 2400 | 93/78/94/76 | — | thundering-charge, crescent-sweep | (9,5) S |
| red-cliffs-marine-a | Fleet Marine Captain Bai* | cao | infantry | 1800 | 68/38/55/36 | 42 | mob-rush, twin-blades | (6,4) S |
| red-cliffs-marine-b | Fleet Marine Captain Ge* | cao | infantry | 1800 | 66/40/58/38 | 46 | twin-blades | (8,3) S |
| red-cliffs-crossbow | Crossbow Captain Shen* | cao | archers | 1500 | 58/44/50/36 | 44 | massed-arrows | (7,5) S |
| red-cliffs-reserve | Fleet Reserve Captain Dai* | cao | infantry | 1800 | 64/42/54/34 | 40 | mob-rush | round 4, entry (8,1) S |

Enemy start: 8 units, all on deck tiles; plus one reserve captain in round 4. Cao Cao's bond list is empty; he cannot be swayed (Loyalty null, and he is a commander). The four invented captains can.

## Stratagems
No battle-local stratagems: everything is in the shared table. The ones that decide this battle:
| id | Tag | Cost | Range | Area | Power | Stat | Effect | Used by |
|---|---|---|---|---|---|---|---|---|
| fire-ships | Fire | 4 | 1–1 | cross | 1.2 | war | ignite | Huang Gai (arrives with 4 Qi, so he can cast at once) |
| fire-attack | Fire | 5 | 1–3 | single | 1.0 | int | ignite | Zhou Yu (int 96), Cao Cao (!) |
| valley-blaze | Fire | 6 | 2–4 | cross | 1.1 | int | ignite | Zhuge Liang |
| kindling | Fire | 3 | 1–2 | single | 0.6 | int | ignite | Jian Yong (if deployed, level 3) |
| borrow-the-wind | Command | 6 | self | wind toward a chosen neighbour, gale, 3 rounds | — | — | wind | Zhuge Liang, level 7 |
| massed-arrows, arrow-rain | Volley | 3 | 2–3 | single / cross | 1.1 / 1.0 | war | — | open a Volley→Fire chain |

## Reinforcements and timeline
| Round | Side | Units | Entry |
|---|---|---|---|
| 4 | cao | Fleet Reserve Captain Dai | (8,1) on the northern edge of the fleet |
| 5 | han | Huang Gai | (9,6), then (8,6) or (10,6): shallows tiles beside the fleet's southern deck row |

Huang Gai appears ready to act with 4 Qi, standing in the shallows beside a deck tile of the chain, so `fire-ships` (range 1) reaches it the moment he arrives.

| Round | Phase | Timeline item |
|---|---|---|
| 1 | start | message: the chained fleet, and the north-west wind that would blow every spark back at us |
| 4 | end | message: pennants sagging on the flagship; the air goes still, then stirs from the south-east |
| 5 | start | message: the south-east wind has come, a true gale; Huang Gai's fire ships slip their moorings |
| 10 | start | message: whatever has not burned is cut loose or sunk |

## enemyBehaviour
| Unit | Hint | Why |
|---|---|---|
| cao-cao | hold | the flagship stays at the centre of his own fleet |
| cai-mao | guard:cao-cao | the admiral stays by the flagship |
| red-cliffs-marine-b | guard:cao-cao | the commander's guard |
| red-cliffs-crossbow | hold | covers the southern deck row |
| cao-ren, xu-chu, zhang-liao, red-cliffs-marine-a, red-cliffs-reserve | advance | the landing parties: they wade the strip and fight on the reed beds in rounds 2–5 |

## Intended play
Red Cliffs rewards patience and then punishes hesitation. For four rounds the wind is wrong and the fleet is out of reach, so the fight is on the shore: Cao Ren, Xu Chu and Zhang Liao land at the reed landings, wade the strip (where they take 25% more damage and move at a third of their speed) and meet the Han line on the reed beds. Zhou Yu on the hill (6,8) reaches the landing at (4,6) and the strip with his bow; Gan Ning breaks the first wave. The temptation is Zhuge Liang's valley-blaze or Zhou Yu's fire-attack in round 3 or 4: lit early the fire either does nothing (the breeze carries it south, onto the strip, where there is nothing to burn) or, if it catches the landing reeds, runs down onto the Han reed beds. The honest play is to keep Qi in reserve (Zhou Yu 6 Qi from round 3, Zhuge Liang 6 Qi, Huang Gai 4 at arrival) and hold the shore.

In round 5 the gale arrives. Huang Gai appears in the shallows beside the fleet; his fire-ships ignites a five-tile cross. Zhou Yu and Zhuge Liang add a second and a third source in the same phase (the integration test lights three points in round 5 and the fleet is down to a third of its decks by round 10). From then on the fire runs north a row a round, fans out sideways, confuses half of what it touches, and sinks the decks behind it so that nothing on the fleet can retreat south. The Han job is to keep the fires fed, to kill what stumbles ashore, and to get a bow or a fire stratagem within reach of the flagship at (7,3): a unit on the strip at (7,6) is three tiles from it. Cao Cao breaks at 1,500 troops, and fire alone does not get him there before round 12: Zhou Yu's bow, Huang Gai's fire ships and Gan Ning's blade must finish him.

Zhuge Liang at level 7 can shorten the whole waiting game with borrow-the-wind (see Wind), but it costs him a round of Qi and his action; the wind he borrows is still only a gale, not an excuse to stop defending. The thing to learn is the same thing the earlier fire battles taught, now at scale: a fire is a clock, and the wind is its hand.

## Balance notes
- `npm run sim -- --battle red-cliffs --games 100` (random both sides): winners cao=45 han=55, avgRounds 12.24, 0 invariant failures; fires=1757 ignited + 5013 spread.
- `tools/ai-bench.ts --battle red-cliffs --games 30 --pairs normal:normal,random:normal,normal:random --jobs 4` (local copy keyed by the real enemy side id; the stock bench crashes on a non-`yellow` enemy and its invariant check counts reinforcements as lost units — the `inv` column is meaningless for any battle with reinforcements): normal(han) vs normal(cao) **80%** (24-6, 6 timeouts, 12.2 rounds on average); random(han) vs normal(cao) 0%; normal(han) vs random(cao) 100%; normal(cao) vs random(han) 100%. In range (35–85%, ≥5 rounds).
- A traced AI-vs-AI game (seed 5000) ends in round 12 by Cao Cao's retreat: the Han AI wades the strip, lights the fleet when the gale comes, and its own units are scorched on the reed landings; Cao Cao is worn down to 1,500 by strikes and fire in rounds 9–12. With three fires lit in round 5 and no other action, an idle Cao Cao on the flagship takes his first fire damage in round 9 and is at 1,800 in round 12; the fire alone is slow, which is why the Han must finish him.

## Rulings
- **Wind direction.** The engine's directions are N/E/S/W. The south-east wind is `N` gale. The early wind is `S` breeze (the brief's "toward S").
- **Fleet shape.** 48 decks, five rows deep and ten wide at most, chosen so that a handful of ignitions can cover every column (a fleet of 64 decks took until round 13 to burn with the same three fires). The north row (y1) is eight wide so the silhouette reads as ships rather than a block.
- **Cao Cao's `hold` is a hint, not an immobiliser:** the AI repositions him a little within the fleet; that is accepted.
- **Huang Gai is a fixed Han reinforcement** (not a deploy slot), as the brief says; his entry tile list has two fallback tiles in the shallows for when an enemy landing party occupies (9,6) (the engine shifts to the nearest free passable tile anyway).
- **Shore fire safety.** The strip row is shallows (non-flammable) except four reed landings, so a lit fleet never ignites the Han camp by itself; only fire on the landing reeds or the reed beds can, and only while the wind blows south.
