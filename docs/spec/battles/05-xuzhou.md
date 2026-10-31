# 05 — Defence of Xuzhou (194 AD)

**Source story:** *Romance of the Three Kingdoms* chapters 10–12. Cao Cao's father, Cao Song, is murdered on the road through Tao Qian's province of Xuzhou by the governor's own escort. Cao Cao marches south to avenge him and massacres the cities on the way. Tao Qian, old and frightened, sends for Liu Bei, who comes from Pingyuan with Guan Yu, Zhang Fei and a small column that Gongsun Zan lends him under Zhao Yun. Before the matter is settled, Lu Bu (chased from the north by Cao Cao's enemies) seizes Cao Cao's own province of Yanzhou, and Cao Cao has to give up the siege and go home. Tao Qian then tries to hand Xuzhou to Liu Bei. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties / alt-history flags:**
- Zhao Yun is a **guest** here (the novel has him in Gongsun Zan's service and only meeting Liu Bei at Pingyuan and in the Xuzhou campaign; he does not join Liu Bei until later). `campaign.json` lists `zhao-yun` as departing after this battle; the roster never held him, so the departure is only the story marker.
- Dian Wei, Xiahou Yuan, Cao Ren and Yu Jin are all placed outside the walls of one city at once (the novel spreads Cao Cao's army over many cities in this campaign). The three Cao captains (`xuzhou-vanguard`, `xuzhou-raider`, `xuzhou-levy`) are invented minor officers, flagged `invented: true`.
- The mechanical siege is an abstraction: three crumbled stretches of wall are climbable ramparts, and the south rampart falls on a timer.
- Mi Zhu and Sun Qian join after the battle (they are Tao Qian's staff in the novel; here their joining is the story's pay-off for holding the city).

## Objective
- Win: **survive round 10** (`survive 10`): the end of round 10 is reached with none of the lose conditions met. A timeline message at the start of round 10 announces why: "Riders bring word: Lu Bu has struck at Yanzhou. Cao Cao turns for home."
- Lose, any of:
  - Liu Bei is routed (`commanderLost`);
  - **Tao Qian is routed** (`unitLost tao-qian`);
  - an enemy unit stands on any **keep tile** (the six village tiles (2,4), (3,4), (2,5), (3,5), (2,6), (3,6)) at the end of any enemy phase (`hold`, lose variant).
- `turnLimit 12` and `onTimeout cao` are only a safety net; the win comes at round 10.
- Side order: `han` (player) then `cao`.
- The Cao commander (Cao Cao) can be routed, but doing so does not win: this battle is about the clock.

## Map (14 × 12)
Legend: `.` plain, `f` farm (autumn stubble), `T` forest, `h` hill, `v` village (the keep), `=` road, `#` wall, `r` rampart, `G` gate (Han's own).

```
   x 0123456789ABCD
y0   ff.TT.......TT
y1   f..T..ff.....T
y2   ######..ff....
y3   #....#ff..f.h.
y4   #.vv.rff..f...
y5   #.vv.G====....
y6   #.vv.G====....
y7   #....rff..f...
y8   #....#ff...f..
y9   ###r##ff......
y10  f..T..ff.....T
y11  ff.TT.......TT
```
The city occupies x 0–5, y 2–9. Its interior is x 1–4, y 3–8, and its keep is the six `v` tiles at x 2–3, y 4–6 (def 0.85, heals 5% a phase).

- **The gate** at (5,5) and (5,6) is Han's (`gateOwner: han`): Han units pass freely; Cao's units cannot enter it. It never opens for Cao. It is Zhao Yun's and Guan Yu's sally port, and nobody on Cao's side can use it.
- **Three ramparts** can be climbed from the field: the east ramparts (5,4) and (5,7), and the **south rampart** (3,9). Each is a one-tile funnel (walls on both sides), reached from a single outside tile: (6,4), (6,7), (3,10). Infantry and archers climb them (cost 2); cavalry cannot. A unit standing on a rampart has cover 0.75 and elevation, so an attacker from the ground does 0.75 × 0.90 = 0.675 of the damage.
- **The south rampart falls** at the end of round 6 (timeline: (3,9) becomes plain): a one-tile gap that cavalry can use as well.
- **The stubble belt** x 6–7, y 3–9 is flammable (and the far farm patches too), so fire matters to anyone climbing the east ramparts. The roads at (6..9, 5..6) are firebreaks.
- The north wall (y=2) is whole: nobody climbs it, but archers can shoot over it.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | E | breeze |
| 5 | — | calm |
| 8 | W | breeze |

The east breeze (rounds 1–4) carries fire in the stubble away from the walls and toward Cao's line, which is the defenders' friend. The west breeze after round 8 blows it back at the walls, which are not flammable, so the city is safe from fire in every phase; the only people it hurts are men standing in the stubble.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Numbers for shared officers come from 14-campaign-battles.md. Troop counts for Han are the campaign values (level 3 = 2000).

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Bonds | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | 2000 | 72/74/78/98 | — | guan-yu, zhang-fei | twin-blades, rally | (3,7) E |
| guan-yu | Guan Yu | han | cavalry | 2000 | 97/75/95/85 | — | liu-bei, zhang-fei | crescent-sweep, thundering-charge | (4,5) E |
| zhang-fei | Zhang Fei | han | infantry | 2000 | 98/30/85/45 | — | liu-bei, guan-yu | serpent-thrust, thunder-roar | (4,4) E |
| jian-yong | Jian Yong | han | archers | 2000 | 40/72/50/80 | — | — | fire-attack, sow-discord | (4,7) E |
| zhao-yun | Zhao Yun (guest) | han | cavalry | 2200 | 96/76/90/82 | — | — | serpent-thrust, thundering-charge | (4,6) E |
| tao-qian | Tao Qian (guest, **protected**) | han | infantry | 1600 | 25/58/40/75 | — | — | rally | (1,5) E |
| cao-cao | Cao Cao (commander) | cao | cavalry | 2600 | 72/94/98/96 | — | — | crescent-sweep, fire-attack, thundering-charge | (13,3) W |
| xiahou-yuan | Xiahou Yuan | cao | archers | 1400 | 90/55/85/66 | — | — | arrow-rain, massed-arrows | (11,5) W |
| cao-ren | Cao Ren | cao | infantry | 2000 | 86/62/90/68 | — | — | serpent-thrust, crescent-sweep | (11,3) W |
| yu-jin | Yu Jin | cao | infantry | 1900 | 80/66/85/58 | — | — | twin-blades, thunder-roar | (11,8) W |
| dian-wei | Dian Wei | cao | infantry | 1900 | 98/30/60/50 | — | — | crescent-sweep, thunder-roar | (11,6) W |
| xuzhou-vanguard | Cao Vanguard Captain* | cao | infantry | 1400 | 68/38/55/35 | 45 | — | twin-blades, mob-rush | (10,4) W |
| xuzhou-raider | Cao Raider Captain* | cao | cavalry | 1200 | 62/30/48/30 | 40 | — | torch-raid, mob-rush | (8,0) W |
| xuzhou-levy-a, -b | Conscript Spearmen* (reinforcement) | cao | infantry | 1200 | 52/28/42/28 | 50 | — | mob-rush | arrive round 4 at (13,4), (13,7) |

`*` invented. The deploy has **4 slots** (the roster at this point is Liu Bei, Guan Yu, Zhang Fei, Jian Yong); required: Liu Bei, Guan Yu, Zhang Fei; default deploy adds Jian Yong. Zhao Yun and Tao Qian are guests: fixed units, never drawn from the roster, never earning campaign XP. Cao's captains are swayable (loyalty 40–50) but never recruitable.

## Stratagems
No battle-local stratagems. All used are shared. The ones that matter here:

| id | Tag | Cost | Why it matters |
|---|---|---|---|
| rally (Liu Bei, Tao Qian) | Command | 4 | heals 15% to every ally within 2: the city's endurance |
| fire-attack (Jian Yong, Cao Cao) | Fire | 5 | light the stubble under climbers; Cao Cao can do the same to a defender standing in the field |
| thunder-roar (Zhang Fei, Yu Jin, Dian Wei) | Shout | 4 | confuses climbers on a rampart; confused units cannot counter or act |
| torch-raid (Cao raider) | Fire | 5 | the raider sets the stubble alight on the defenders' side if they sally |
| arrow-rain (Xiahou Yuan) | Volley | 3 | a cross-shaped volley on the wall's defenders |

## Reinforcements
| Round | Side | Units | Entry |
|---|---|---|---|
| 4 | cao | xuzhou-levy-a, xuzhou-levy-b (1200 each) | (13,4), (13,7) |

## Timeline
| Round | Phase | Kind | Effect |
|---|---|---|---|
| 1 | start | message | "Cao Cao's banners fill the eastern road. He has sworn to leave no house in Xuzhou standing." |
| 5 | start | message | "Sappers are tunnelling under the old south rampart. It will not stand past the end of round 6." |
| 6 | end | terrain | (3,9) becomes `plain`: the south rampart falls |
| 7 | start | message | "The south rampart has fallen. A single gap lets the enemy into the city." |
| 10 | start | message | "Riders bring word: Lu Bu has struck at Yanzhou. Cao Cao turns for home." |

The terrain change is open information (`query.timelinePreview` lists it), so the defenders see the breach coming a round and a half ahead.

## Enemy behaviour
| Unit | Hint | Meaning |
|---|---|---|
| cao-cao | `hold` | the commander stays at his hill (13,3), far east (the soft hint: the AI may still advance when it sees a target) |
| xiahou-yuan, cao-ren, yu-jin, dian-wei, xuzhou-vanguard | `advance` | straight at the walls |
| xuzhou-raider | `ambush:5` | lurks in the north-east; strikes anyone who comes within 5 tiles or is hurt |
| xuzhou-levy-a, xuzhou-levy-b | `advance` | the second wave |

## Intended play (a design check, not a script)
Xuzhou is the first battle you win by doing nothing clever with the enemy and everything clever with the ground. The enemy has more men, and they are better; the city has walls. The win is a clock: count to ten.

1. **Do not sortie.** The open field belongs to Cao Cao. Every Han unit that leaves the gate for more than a round gets surrounded: this was the single largest cause of losses in AI-vs-AI play (see Balance notes). Guan Yu and Zhao Yun use the gate to hit what is standing on a rampart or at its foot, and come back inside on their next activation.
2. **Hold the ramparts yourself.** The three climbable ramparts are one-tile funnels. A Han infantryman on (5,4) or (5,7) has cover 0.75 and elevation (0.675 of the damage from the ground) and can only be attacked from the outside tile and, by archers, from range 3 (4 for archers standing on a rampart). If an enemy infantryman gets a foot on a rampart it takes cover from that terrain too; zone of control stops it there, but it then threatens the keep next turn. Kill or block it at once: a unit on a rampart is two moves from the keep.
3. **Light the stubble.** The x 6–7 belt (and the far farm plots) is dry. Jian Yong's Fire Attack under the round 1–4 east breeze burns the ground the climbers must stand on, damaging them (10% of max a round) and confusing half of them. Roads at (6–9, 5–6) do not burn, so the funnels at (6,4) and (6,7) are the places to set alight.
4. **Protect Tao Qian.** He is 1600 troops of an old man, and losing him loses the battle. He starts at (1,5), as far from every wall as the city allows; archers on a rampart (range 4) can only reach him if they get past the funnels. Keep him away from the walls and, if needed, behind Liu Bei's Rally.
5. **Plan for the breach.** The round 5 message and the preview warn you that the south rampart falls at the end of round 6. From round 7 the gap at (3,9) is open to horses and men alike. It is one tile wide: plug it with a strong infantryman at (3,8) (Zhang Fei) so only one enemy can come through at a time, and keep Rally in reach.
6. **The keep is the line.** An enemy anywhere in the city but not on the six keep tiles at the end of Cao's phase is dangerous but not yet fatal; on a keep tile it is over. A defender standing on a keep tile also blocks it.
7. **At round 10** the message lands at the start of the round; hold through the end of it.

## Balance notes
Sim: 100 random-policy games, 0 invariant failures, every game ends, both sides win (see below).
The campaign-balance bench (a generalised copy of `tools/ai-bench.ts`; the shipped bench hard-codes `yellow`) is reported under "Bench" below. Tuning done once: Cao's troops were reduced by about 25% (Cao Cao 3000 → 2600, Xiahou Yuan 2200 → 1400, Cao Ren 2600 → 2000, Yu Jin/Dian Wei 2400 → 1900, the invented units to 1400/1200), the north rampart was bricked up (3 ramparts left instead of 4), the breach was shrunk from two tiles to one and moved from round 5 to round 6, and Cao's start line was moved two columns east. The headline numbers are held down by the AI: the stock `normal` AI is not yet objective-aware, so `normal` as Han runs its units out of the gate to hunt Cao Cao and loses; a `turtle` proxy (the same AI with the gate walled up in its view of the board, so it cannot sortie through the gate) wins 83% of the time, which is the number that says the map is winnable for a player who defends. Revisit after the objective-aware AI lands.

## Bench
`npx tsx tools/ai-bench.ts --battle xuzhou --games 30 --pairs normal:normal,random:normal,normal:random --jobs 4` (generalised copy; seeds 5000–5029, 300 ms frozen clock), plus the `turtle` proxy described above. A = the first-named tier, seat in brackets.

| Match | A wins | Avg rounds |
|---|---|---|
| normal(han) vs normal(cao) | 3 / 30 = **10%** | 6.0 |
| random(han) vs normal(cao) | 0 / 30 = 0% | 3.1 |
| normal(han) vs random(cao) | 30 / 30 = 100% | 10.0 |
| normal(cao) vs random(han) | 30 / 30 = 100% | 3.1 |
| turtle(han) vs normal(cao) | 25 / 30 = **83%** | 9.6 |
| turtle(cao) vs normal(han) | 28 / 30 (turtle as Cao) | 5.7 |

**Out of the target band for `normal` (10% against 35–85%)**, deliberately left that way: the stock AI as Han does not understand a survive-10 objective, so it sorties through the gate and chases Cao Cao around the board; the walled-gate proxy, which can only defend, wins 83%, so the map itself is winnable for a defender. Random Han almost never survives. Re-run once the objective-aware AI has landed.

Sim (`npm run sim -- --battle xuzhou --games 100`): winners han=87 cao=13, avgRounds 9.64, invariantFailures=0 (random policy: neither side can do much, so the survive win dominates).

## Rulings
- **Hold tiles = the six keep tiles**, not every city tile: an enemy that has climbed in but is not yet in the keep is a danger, not a defeat.
- **The gate is Han's** (`gateOwner: han`) and is never opened, so Cao's cavalry can only enter through the south breach, which the timeline creates at the end of round 6. Cao Cao himself is cavalry and cannot climb any rampart.
- **Par 10** (equal to the survive round): a win always ends in round 10, so there is no under-par provision bonus here.
- **Deploy has 4 slots** (not 5): the roster at this point has exactly four officers (Zhao Yun is a guest; Mi Zhu and Sun Qian join after).
- **`campaign.json` lists Zhao Yun as departing** after this battle although he was never on the roster. The battle's `departs` field mirrors the campaign entry (the validator requires agreement); the departure has no mechanical effect.
- **Cao Cao `hold`:** the hint is soft in the current AI (it may advance toward a target); the lose conditions do not depend on him staying home.
- **Tao Qian is a Han-side unit under the player's control** (the AI controls the guest as well in AI-vs-AI games, and can walk him into danger).
