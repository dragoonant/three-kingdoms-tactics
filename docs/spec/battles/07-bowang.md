# 07 — Bowang Slope (207 AD)

**Source story:** *Romance of the Three Kingdoms* chapter 39. Xiahou Dun leads Cao Cao's vanguard against Liu Bei at Xinye, and Zhuge Liang, newly in post, takes his first command. He sends Guan Yu to lie in wait on the left, Zhang Fei on the right, Guan Ping and Liu Feng to the narrow end with fire, and Zhao Yun to bait Xiahou Dun forward. Yu Jin and Li Dian warn that the road is narrow, the reeds thick and fire a danger; Xiahou Dun rides on. The novel is public domain. Every line of prose in the game is ours.

**Cast liberties / alt-history flags**
- Liu Feng, who lights the fire in the novel, is not in this campaign; Guan Ping and the deployed officers stand for the fire party. No alt-history recruitment.
- Zhuge Liang opens with Valley Blaze (fire laid in reeds and pines in one cast) and Eight Trigrams, per 14-campaign-battles.md.
- Yu Jin and Li Dian are the cautious officers of the novel, so Yu Jin holds the valley mouth and Li Dian stays beside Xiahou Dun. A ledger message in round 3 carries Li Dian's warning.
- Invented units, flagged `invented: true`: Cao Light Horse (2 units), Cao Spear Captain (2), Cao Crossbow Captain (1).

## Objective
- Win: rout Xiahou Dun. He has `retreatAt: 0.5`, so taking him to half strength (1250 of 2500 troops) wins; a retreat counts as a rout.
- Lose: Liu Bei is routed, or round 12 ends (`onTimeout: cao`).
- Side order: `han` (player) then `cao`.
- Par: 8 rounds.

## Map (13 × 14)
Legend: `.` plain, `e` reeds, `T` forest, `h` hill, `v` village, `=` road.

```
   x 0123456789ABC
y0   .............
y1   ......=......
y2   h.....=.....h
y3   hT....=....Th
y4   hTT.eeeee.TTh
y5   hhTTeeeeeTThh
y6   hhTTeeeeeTThh
y7   hhhTeeeeeThhh
y8   hhhTTeeeTThhh
y9   hhhTTeeeTThhh
y10  hhTTeeeeeTThh
y11  hTT.=====.TTh
y12  .T..==v==..T.
y13  .............
```
- **The staging ground** (y0–2, plain with a road down the middle) is where Cao's army starts; the road stops at (6,3).
- **The valley** is the reeds (flammable 1.0, move 2/3/2): five wide at y4–7, **narrowing to a neck three wide at y8–9** (x5–7), widening again at y10. Cavalry move 3 per reed tile, so a horseman in the reeds crawls two tiles a round.
- **The slopes** are forest (x3–4 and x8–9 around the neck, x1–3 and x9–11 further up) backed by hills. Forest gives defence 0.8; an ambush post on it is adjacent to the reeds at the neck.
- **The camp** is the road yard at y11–12 with a village at (6,12). It is bare road, so a fire coming down the valley stops at its edge.

## Wind schedule
| Round | Blows toward | Strength |
|---|---|---|
| 1 | — | calm |
| 4 | S | breeze |

The breeze spreads fire only to the single downwind (south) neighbour at 0.6 × flammability, so a fire lit in the valley in round 4 or later walks south through the reeds, one tile a round, toward the neck and the camp. In calm (rounds 1–3) it spreads at 0.15 to all four sides, which can reach the forest where your own ambushers stand. Round 1 and round 4 carry ledger messages about the wind.

## Officers (stats War/Int/Lead/Cha, Loyalty)
Shared officers use the numbers of 14-campaign-battles.md. `*` = invented (battle-local ids).

| Unit id | Officer | Side | Type | Troops | W/I/L/C | Loyalty | Stratagems | Start (x,y) facing |
|---|---|---|---|---|---|---|---|---|
| liu-bei | Liu Bei (commander) | han | infantry | roster | 72/74/78/98 | — | twin-blades, rally | start 0: (6,12) N, the village |
| zhuge-liang | Zhuge Liang | han | archers | roster | 38/100/92/95 | — | valley-blaze, eight-trigrams | start 1: (3,7) E, forest edge |
| zhao-yun | Zhao Yun (bait) | han | cavalry | roster | 96/76/90/82 | — | serpent-thrust, thundering-charge | start 2: (6,8) N, in the neck |
| (deploy 3–6) | roster choice: guan-yu, zhang-fei, guan-ping, jian-yong, mi-zhu, sun-qian | han | roster | roster | per table | — | per table | starts 3–6 are the ambush posts: (3,6) E, (9,6) W, (4,9) E, (8,9) W |
| xiahou-dun | Xiahou Dun (commander) | cao | cavalry | 2500 | 92/58/88/70 | — | thundering-charge, serpent-thrust | (6,0) S |
| yu-jin | Yu Jin | cao | infantry | 2000 | 80/66/85/58 | — | twin-blades, thunder-roar | (4,1) S |
| li-dian | Li Dian | cao | infantry | 2000 | 76/72/76/60 | — | twin-blades, sow-discord | (8,1) S |
| bowang-scout-a | Cao Light Horse* | cao | cavalry | 1500 | 62/35/50/30 | 70 | thundering-charge | (5,0) S |
| bowang-scout-b | Cao Light Horse* | cao | cavalry | 1500 | 62/35/50/30 | 70 | thundering-charge | (7,0) S |
| bowang-spear-a | Cao Spear Captain* | cao | infantry | 1600 | 64/38/60/32 | 75 | serpent-thrust | (5,2) S |
| bowang-spear-b | Cao Spear Captain* | cao | infantry | 1600 | 64/38/60/32 | 75 | serpent-thrust | (7,2) S |
| bowang-crossbow | Cao Crossbow Captain* | cao | archers | 1300 | 55/45/50/35 | 75 | massed-arrows | (6,2) S |

Deploy: `deploySlots` 7, `required` liu-bei, zhuge-liang, zhao-yun (deployed first, in that order, onto starts 0, 1 and 2), `defaultDeploy` liu-bei, zhuge-liang, zhao-yun, guan-yu, zhang-fei, guan-ping, jian-yong. Roster at this point: nine officers (Liu Bei, Guan Yu, Zhang Fei, Jian Yong, Mi Zhu, Sun Qian, Zhuge Liang, Zhao Yun, Guan Ping) for seven slots. Starts 3–6 carry `ambush: true` (a label in the deploy screen only; no rule effect). Eight enemy units against seven.

## Stratagems
No battle-local stratagems; all are in the shared table.
- **Valley Blaze** (Zhuge Liang): Fire, cost 6, range 2–4, cross, power 1.1 int, ignites every flammable tile of the cross. Qi arrives at 2 per phase, so he first has 6 in round 3 and 8 in round 4; casting in round 4 pairs it with the wind.
- **Eight Trigrams**: Command, cost 4, aura 0–2, lead +15 for 2 rounds. Cast on the ambushers before they close.
- The enemy has no fire stratagem (the Light Horse carry Thundering Charge).

## Timeline and reinforcements
| Round | Phase | Item |
|---|---|---|
| 1 | start | message: "Dusk at Bowang. Xiahou Dun is coming down the road after Zhao Yun. The wind will turn south in round 4." |
| 3 | start | message: Li Dian's warning (narrow road, reeds, beware of fire) |
| 4 | start | message: "The evening wind comes down the pass and runs south along the valley." (the wind schedule changes in the same step) |

No reinforcements.

## enemyBehaviour (per enemy unit)
| Unit | Hint | Why |
|---|---|---|
| xiahou-dun | `pursue:zhao-yun` | the bait works |
| bowang-scout-a | `pursue:zhao-yun` | rides ahead with him |
| bowang-scout-b | `advance` | |
| bowang-spear-a, bowang-spear-b | `advance` | |
| yu-jin | `hold` | the cautious rear guard stays at the valley mouth |
| li-dian | `guard:xiahou-dun` | stays beside his commander |
| bowang-crossbow | `guard:xiahou-dun` | covers him from behind |

## Intended play (a design check, not a script)
Zhuge Liang's first command is a trap, and the trap has a clock: the wind is calm until round 4, and Valley Blaze costs 6 Qi, which he first holds in round 3. The bait goes first: Zhao Yun sits in the neck at (6,8) and the Cao cavalry want him. In the reeds a horseman moves two tiles a round, so the enemy column strings out along the road and the reed edge for three rounds. Keep the ambushers (the four forest posts) still, put Zhuge Liang on the forest edge where Valley Blaze (range 2–4) reaches the reeds, and let the enemy come to the reed edge. Round 4: the wind turns south; a Valley Blaze on the reeds behind the leaders burns a cross of five tiles and the fire walks south with the wind, through the neck, toward the camp. Units standing in burning reeds lose 10% of max troops a round and may be confused (fire damage alone cannot take Xiahou Dun to half, so the ambushers must close in and chain: a Volley opener from the crossbow side, then Guan Yu and Zhang Fei with the bond bonus).

Mistakes the map punishes: lighting the reeds before round 4 (calm wind spreads sideways, into the forest your own ambushers stand on); leaving Zhao Yun in the neck when the blaze starts (the fire is coming for him; he should run south on the road, which does not burn); and putting Liu Bei anywhere but the bare camp yard. The forest posts burn too, so the ambushers should leave the slope edge before a fire in the column next to them reaches their column. Yu Jin and Li Dian are the reason not to chase: if the player pushes north after a retreating column, the rear guard is still standing at the mouth.

## Rulings
- **Hill range bonus.** Archers on a hill get +1 max range for normal attacks only (stratagem range checks use the printed range), so Zhuge Liang cannot cast Valley Blaze from a hill at (2,7) onto the valley centre (distance 5). His start is on the forest edge (3,7), distance 4 to (6,6).
- Reeds begin at y4 and the road continues to y3 on purpose: a version with reeds from y3 made the normal AI sit still and gave the Han side only 7% wins (timeouts).
- Ambush posts have no rule effect (R2-SLOT-1); they are the four forest starts and are labelled in the deploy UI.
- Li Dian's warning is a plain timeline `message`; the engine has no spoken-line event.
- No reinforcements: a version with a Cao rear column arriving in round 6 was not needed to get the average round count above 5.

## Balance notes
- `npm run sim -- --battle bowang --games 100` (random policy both sides): winners cao=95 han=5, reasons timeout=94 commander=6, avgRounds 11.82, 0 invariant failures; both sides win.
- AI bench, 30 games per direction, seeds 5000–5029, budget 300 ms (a locally patched copy of `tools/ai-bench.ts` that reads the enemy side id from the battle; the committed bench hard-codes `yellow`): `normal(han)` vs `normal(cao)` 14/30 = 47%, average 11.0 rounds, 16 timeouts; `random(han)` vs `normal(cao)` 0/30; `normal(han)` vs `random(cao)` 30/30.
- Over half the AI games time out: the cautious AI Cao army stays at the reed edge and the Han AI does not use the ambush, so the battle is decided by whether the Han AI comes out to meet it. Today's AI does not play the intended trap at all, so these numbers are only a sanity check; re-bench with the objective-aware AI.
- **Campaign-balance pass (AI v2, battles 2-9).** With the improved AI the bench (normal vs normal, roster officers at 2000 troops) had Han at **30%** / 10.8 rounds, under the 40-65% wanted for battle 7. Changes, all in `bowang.json` and troops only: Xiahou Dun 3000 -> 2500 (he retreats at half, so the line drops from 1500 to 1250; this is by far the strongest lever: 2700 gave 42%, and 3000 with every other unit cut to 1200-1800 gave 17% then 50% with a hollow army), Yu Jin and Li Dian 2200 -> 2000, the spear captains 1700 -> 1600. Ambush starts, wind and `pursue:zhao-yun` untouched.
  Result (normal vs normal, 30 games): seeds 5000-5029 **30% -> 53%**, 9.7 rounds (13 timeouts); holdout seeds 7000-7039 **55%**, 10.2 rounds (18 timeouts). random(han) 0%. 0 fallbacks / illegal / invariants. Test change: `battle-bowang.test.ts` now expects Xiahou Dun at 2500 troops / maxTroops (was 3000); its 1510-troop setup still works because the Zhao Yun hit it checks deals more than the 260 needed to cross the new 1250 line.
