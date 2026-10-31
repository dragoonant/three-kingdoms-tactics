# 04 — Hulao Gate (190 AD)

**Source story:** *Romance of the Three Kingdoms* chapter 5. The lords of the anti-Dong coalition camp below Hulao Pass (the Sishui Gate). Dong Zhuo's champion Lu Bu holds the wall. After Gongsun Zan is beaten back, Zhang Fei rides out alone against Lu Bu, Guan Yu joins him, then Liu Bei, and the three of them circle Lu Bu until he turns his horse and flees through the gate. Lu Bu is never killed there: he is driven off. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties / alt-history flags:**
- Zhang Liao is placed in Dong Zhuo's host at Hulao (the novel has him serving under Lu Bu later, and he reappears as an enemy in battles 6 and 9, so he is deliberately **not recruitable**).
- Li Jue and Guo Si are placed on the wall as Lu Bu's lieutenants, and Li Jue is the Dong **commander** for the engine's one-commander rule. Dong Zhuo himself and Hua Xiong are not on the field (the novel has Guan Yu slay Hua Xiong earlier that day).
- The wall, the double gate and its ramparts are a game abstraction of the pass. The rampart archers, the fire-arrow captain and the gate spearman are invented minor officers, flagged `invented: true`.
- The gate bar splitting in round 6 is invented (a pacing device, so the battle can never deadlock).

## Objective
- Win: **Lu Bu is routed or retreats** (`routUnits [lu-bu]`). He retreats the moment his troops fall to 50% of his maximum (`retreatAt 0.5`), after the damage that caused it. A retreat counts as a win.
- Lose: Liu Bei is routed (`commanderLost`), or round 12 ends (`timeout 12`; the engine then also gives the battle to `dong`).
- Side order: `han` (the coalition, player) then `dong`. Win and lose texts show in the HUD tracker.
- The Dong commander is **Li Jue**, not Lu Bu. Routing Li Jue does nothing for the objective (R2-OBJ-1: with `objectives`, an enemy commander falling wins only when `routCommander` is listed).

## Map (16 × 12)
Legend: `.` plain, `f` farm (stubble), `T` forest, `h` hill, `v` village, `=` road, `#` wall (impassable), `r` rampart, `G` gate (Dong's own; shut to the coalition).

```
   x 0123456789ABCDEF
y0   TTTThh...#TT....
y1   TTT.hh.h.#.T....
y2   TT..ff.hh#r.....
y3   T...fff..#r..ff.
y4   v...fff..#r.fff.
y5   =========G......
y6   =========G......
y7   v...fff..#r.fff.
y8   T..fffh..#r..ff.
y9   TT.fff...#r.....
y10  TTT..hh..#.T....
y11  TTTTh....#TT....
```
The wall runs the full height of the pass at x=9, so the only way through is the double gate at (9,5) and (9,6). The ramparts (x=10) are **behind** the wall: only Dong units can climb on them. Coalition infantry or archers cannot step up from the west, because the wall tile is in the way.

- **The approach** (x 3–8) is a stubble field (flammable) cut by the road to the gate, with hills at (7,1), (7,2), (8,2), (6,8) and forest copses to the north and south.
- **Ramparts** at (10,2)–(10,4) and (10,7)–(10,9): archers there are on high ground (elevation 1, cover 0.75) and shoot up to **4 tiles** (3 plus the +1 rampart range). On the rows of their ramparts that covers every tile with x ≥ 6, which is why the map says "stay out of the bowshot": x ≤ 5 is safe on every row.
- **Villages** at (0,4) and (0,7) are the coalition camp's field hospitals (heal 5% a phase).
- **The gate** is `gateOwner: dong`: Dong's units can pass; coalition units cannot enter (9,5) or (9,6) while it is barred. At the start of round 6 a timeline event turns both tiles into **road** (the bar splits), so the objective is always reachable even if Lu Bu never leaves.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 5 | — | calm |
| 8 | W | breeze |

The east breeze carries a fire in the stubble field **toward** the wall (away from the coalition); after round 8 the west breeze blows it back at the coalition. The stubble is a fire trap for whoever stands in it when it lights. Dong's fire-arrow captain can start that fire on the coalition's own side.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Numbers for shared officers come from 14-campaign-battles.md. Troops for the coalition are the campaign values (level 3 = 2000); the default deploy is used when no campaign options are given.

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Bonds | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | 2000 | 72/74/78/98 | — | guan-yu, zhang-fei | twin-blades, rally | (1,5) E |
| guan-yu | Guan Yu | han | cavalry | 2000 | 97/75/95/85 | — | liu-bei, zhang-fei | crescent-sweep, thundering-charge | (2,4) E |
| zhang-fei | Zhang Fei | han | infantry | 2000 | 98/30/85/45 | — | liu-bei, guan-yu | serpent-thrust, thunder-roar | (2,6) E |
| jian-yong | Jian Yong | han | archers | 2000 | 40/72/50/80 | — | — | fire-attack, sow-discord | (1,6) E |
| (spare slot) | — | han | — | — | — | — | — | — | (1,4) E |
| gongsun-zan | Gongsun Zan (guest) | han | cavalry | 2400 | 80/60/78/70 | — | — | thundering-charge, crescent-sweep | (3,5) E |
| lu-bu | Lu Bu (**retreatAt 0.5**) | dong | cavalry | 3200 | 100/28/90/40 | — | — | thundering-charge, crescent-sweep, thunder-roar | (11,5) W |
| li-jue | Li Jue (commander) | dong | cavalry | 2000 | 76/32/60/30 | — | — | thundering-charge, mob-rush | (13,6) W |
| guo-si | Guo Si | dong | cavalry | 1800 | 74/30/58/28 | — | — | thundering-charge, mob-rush | (11,6) W |
| zhang-liao | Zhang Liao | dong | cavalry | 2200 | 93/78/94/76 | — | — | thundering-charge, crescent-sweep | (7,3) W |
| hulao-gate-guard | Gate Spearman* | dong | infantry | 1600 | 60/30/55/30 | 45 | — | mob-rush | (8,5) W |
| hulao-gate-archer-n | Rampart Archer* | dong | archers | 1200 | 52/40/45/30 | 50 | — | massed-arrows | (10,3) W |
| hulao-gate-archer-s | Rampart Archer* | dong | archers | 1200 | 52/40/45/30 | 50 | — | massed-arrows | (10,9) W |
| hulao-gate-firebow | Fire-Arrow Captain* | dong | archers | 1200 | 48/58/42/32 | 55 | — | massed-arrows, fire-attack | (10,7) W |

`*` invented. The deploy has **5 slots** but the roster at this point has only four officers (Liu Bei, Guan Yu, Zhang Fei, Jian Yong), so the fifth start is spare (as in Daxing Hill). Required: Liu Bei, Guan Yu, Zhang Fei. Default deploy: those three plus Jian Yong.

## Stratagems
No battle-local stratagems. All used are shared: `fire-attack`, `massed-arrows`, `mob-rush`, `thundering-charge`, `crescent-sweep`, `thunder-roar`, `serpent-thrust`, `twin-blades`, `rally`, `sow-discord`. The ones that matter here:

| id | Tag | Cost | Why it matters |
|---|---|---|---|
| thunder-roar (Zhang Fei, Lu Bu) | Shout | 4 | confuses Lu Bu (a confused unit cannot counter) and opens the bonded chain |
| thundering-charge (Guan Yu, Gongsun Zan, Lu Bu, Dong cavalry) | Charge | 5 | follows Shout or Volley: Guan Yu's dash is the middle link; a Dong Volley from the ramparts can feed Lu Bu's own charge |
| twin-blades (Liu Bei) | Strike | 3 | follows Charge: the closing link |
| massed-arrows (rampart archers) | Volley | 3 | opens a Dong chain: Volley, then Lu Bu's Charge |

## Timeline
| Round | Phase | Kind | Effect |
|---|---|---|---|
| 1 | start | message | "Hulao Pass. The gate is barred, the ramparts are manned, and Lu Bu waits behind them." |
| 5 | end | message | "The coalition's battering ram reaches the gate. The bar will not last the night." |
| 6 | start | terrain | gate tiles (9,5), (9,6) become `road` |
| 6 | start | message | "The bar splits. Hulao's gate stands open to any man who dares the pass." |

There are no reinforcements.

## Enemy behaviour
| Unit | Hint | Meaning |
|---|---|---|
| lu-bu | `ambush:7` | waits behind the wall until a coalition unit is within 7 tiles of him, or he is attacked; shown as "Lying in wait". From his start (11,5), a unit at (4,5) or at (6,3) is within 7 |
| li-jue | `hold` | commander stays at the back |
| guo-si | `guard:lu-bu` | rides at Lu Bu's side wherever he goes |
| zhang-liao | `ambush:3` | forward picket at (7,3); springs when a unit comes within 3 or he is hurt |
| hulao-gate-guard | `hold` | plugs the road at the gate mouth, (8,5) |
| hulao-gate-archer-n, -s, hulao-gate-firebow | `hold` | stay on their ramparts |

## Intended play (a design check, not a script)
Hulao Gate is the first battle where the ground itself says no. The coalition cannot pass the gate, the ramparts out-range anything the coalition has, and Lu Bu is a single unit stronger than anything the player owns. The answer is not to fight the wall: it is to make Lu Bu leave it.

1. **Do not go to him.** Everything with x ≥ 6 is under four-tile bows, and Dong's Volley→Charge combo (rampart archers opening a chain for Lu Bu) is the most lethal thing on the map. The safe line is x ≤ 5.
2. **Bait.** A coalition unit at x 4–5 wakes Lu Bu (`ambush:7`) without being in bowshot. He sallies through the double gate with Guo Si at his side. The bait should be sturdy (Zhang Fei in the forest/hill terrain at x 3–4, or Gongsun Zan, who is the guest and the story's own bait).
3. **Take him on open ground, out of the bowshot.** Once Lu Bu has crossed the gate and is at x ≤ 5, the ramparts can no longer help him. Facing arcs matter: a chain that lands on his side or rear does 1.25–1.5 times the damage.
4. **The sworn brothers' bonds are the answer.** Zhang Fei's **Thunder Roar** (Shout, adjacent) confuses Lu Bu half the time (48%) and opens a chain; **Guan Yu's Thundering Charge** (Charge follows Shout; needs a clear straight line of 2–3 tiles) follows; **Liu Bei's Twin Blades** (Strike follows Charge) closes. Zhang Fei–Guan Yu and Guan Yu–Liu Bei are bonded, so both links get ×1.15 and +1 range. Measured on the real engine (seeds 1–8, Zhang Fei west, Guan Yu north at (6,2), Liu Bei south, Lu Bu at (6,5)): with Lu Bu facing west, east or south the chain deals **1,780–2,000** damage, comfortably more than the 1,600 he can lose before retreating (half of 3,200). Qi: roar 4, charge 5, blades 3, so the earliest chain is round 3 (every unit has 6 Qi).
   **The order of links is the engine's choice** (R-CHAIN-2: highest expected damage first), and that is the trap. With Lu Bu facing north, Liu Bei stands on his rear arc, his Twin Blades (×1.5 arc) outranks Guan Yu's Charge, and Strike cannot be followed by Charge: the chain is cut to two links and deals only **1,010–1,160**, leaving Lu Bu well above the line. Position the brothers so that Guan Yu's dash is the best second link, not Liu Bei's blow.
5. **Fire as the prelude.** Jian Yong's Fire Attack in the stubble under the east breeze burns the ground Lu Bu crosses and may confuse him (50% a round-end roll). A confused Lu Bu cannot counter.
6. **If Lu Bu never comes**, the gate bar splits in round 6 and the pass is open. By then the rampart archers still have their four-tile reach, so the push is costly; the choice is to wait for the wind turn in round 8 (west breeze: your own fire would blow back), to bait Zhang Liao out of his picket first, or to accept losses.
7. Do not fight Lu Bu one on one. Every unit on his side arc takes his counterattacks and Charges; the point of the brothers is that three are present at once.

## Balance notes
Sim: 100 random-policy games, 0 invariant failures, every game ends, both sides win (see below). ai-bench uses a copy of `tools/ai-bench.ts` generalised for non-`yellow` enemy sides (the shipped bench hard-codes `yellow` and counts a retreat as unit-count drift; the copy uses `unitBudget`); results are under "Bench" below. Lu Bu was tuned 3000 → 3200 troops after the chain test (at 3000, a clean bonded chain left him near 1,000 troops, 500 under the line, which was too forgiving). In AI-vs-AI games Lu Bu usually sallies in round 2–3 against units that walked into bowshot; the normal AI does not yet bait him out of range deliberately.

## Bench
`npx tsx tools/ai-bench.ts --battle hulao-gate --games 30 --pairs normal:normal,random:normal,normal:random --jobs 4` (generalised copy; seeds 5000–5029, 300 ms frozen clock). A = the first-named tier, seat in brackets.

| Match | A wins | Avg rounds |
|---|---|---|
| normal(han) vs normal(dong) | 14 / 30 = **47%** | 8.0 (3 timeouts) |
| random(han) vs normal(dong) | 0 / 30 = 0% | 4.0 |
| normal(han) vs random(dong) | 30 / 30 = 100% | 6.6 |
| normal(dong) vs random(han) | 30 / 30 = 100% | 4.0 |

In the target band (Han 35–85%, at least 5 rounds, random Han almost always loses). The bench's own invariant column showed 10 hits in one game: a swayed Rampart Archer standing on a gate tile (see Rulings), not a rules fault; `npm run sim` reports 0.

Sim (`npm run sim -- --battle hulao-gate --games 100`): winners han=27 dong=73, avgRounds 10.44, 27 `retreated` events, invariantFailures=0.

## Rulings
- **Lu Bu is not the commander.** Li Jue is. A retreating commander would fold two ideas together; making Lu Bu a normal unit keeps "retreat" a pure objective mechanic. The validator needs one commander per side.
- **The gate:** `gateOwner: dong` means Dong units can walk through the barred gate and stand on the gate tiles. A Dong unit that is swayed while standing on a gate tile ends up on a tile the coalition cannot enter; it can still leave it. `tools/invariants` flags that state ("on a gate it does not own"): this is an engine/tool edge case (found by the normal AI at seed 5020), not a data bug.
- **Ramparts are unreachable for the coalition by design** (the wall is in front). Coalition archers use the hills (7,2), (8,2), (6,8) for their own +1 range.
- **Ambush radius** is Manhattan distance from Lu Bu's current tile.
- **Spare slot:** the 5th start is unused until a later roster has a fifth officer. The default deploy has 4.
- **Timeline round 6 `start`:** the gate opens before the coalition's round-6 phase, so the first time the coalition can use the gate is round 6; Dong already could.
