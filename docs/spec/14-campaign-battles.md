# 14 — Campaign battles 2–9: design brief (v0.1)

Each battle gets its own spec `docs/spec/battles/NN-<id>.md` (written by the battle's builder from this brief, in the same shape as 11-battle-daxing-hill.md: map, wind, officers, stratagems, objectives, intended play), data in `src/data/battles/<id>.json`, and scenes in `src/data/scenes/<id>.json`. Events follow *Romance of the Three Kingdoms* (public domain). All prose is ours. Any **alternate-history** element (recruiting someone the novel didn't) is fine, but it is flagged in the spec.

## Shared officer table (use these numbers; add new officers in the same scale)
W/I/L/C, type. Growth defaults to {1,1,1,1} unless noted.

| Officer | W/I/L/C | Type | Notes |
|---|---|---|---|
| liu-bei | 72/74/78/98 | infantry | growth cha1 lead2 int1 war1 |
| guan-yu | 97/75/95/85 | cavalry | growth war2 lead2 |
| zhang-fei | 98/30/85/45 | infantry | growth war2 lead2 |
| jian-yong | 40/72/50/80 | archers | joins roster after battle 1 |
| zou-jing | 55/60/70/60 | archers | guest in 1–2 |
| gong-jing | 50/55/60/60 | infantry | guest in 2 (Qingzhou governor) |
| gongsun-zan | 80/60/78/70 | cavalry | guest in 4 |
| zhao-yun | 96/76/90/82 | cavalry | guest in 5; joins roster before 7; growth war2 lead2 |
| tao-qian | 25/58/40/75 | infantry | guest in 5 (protected: `unitLost`) |
| mi-zhu | 30/70/45/85 | infantry | joins after 5 |
| sun-qian | 35/72/48/82 | archers | joins after 5 |
| cao-cao | 72/94/98/96 | cavalry | guest in 6; enemy commander in 8–9 |
| guan-ping | 78/60/72/65 | infantry | joins before 7 |
| zhuge-liang | 38/100/92/95 | archers | joins before 7; growth int2 lead2 |
| xiahou-dun | 92/58/88/70 | cavalry | guest in 6; enemy commander in 7 |
| xiahou-yuan | 90/55/85/66 | archers | enemy 5, 8 |
| cao-ren | 86/62/90/68 | infantry | enemy 5, 8, 9 |
| yu-jin | 80/66/85/58 | infantry | enemy 5, 7 |
| dian-wei | 98/30/60/50 | infantry | enemy 5 |
| xu-chu | 97/32/66/45 | infantry | enemy 8, 9 |
| zhang-he | 90/68/86/60 | cavalry | enemy 8 |
| li-dian | 76/72/76/60 | infantry | enemy 7 |
| lu-bu | 100/28/90/40 | cavalry | enemy 4 (retreatAt 0.5), 6 (commander) |
| chen-gong | 52/92/75/64 | archers | enemy 6; recruitable (alt-history) |
| gao-shun | 86/50/88/55 | infantry | enemy 6; recruitable (alt-history) |
| zhang-liao | 93/78/94/76 | cavalry | enemy 4, 6, 9; **not recruitable** (appears again later) |
| li-jue | 76/32/60/30 | cavalry | enemy 4 |
| guo-si | 74/30/58/28 | cavalry | enemy 4 |
| zhang-liang | 80/60/72/66 | infantry | enemy 3 (commander) |
| zhang-bao | 70/78/62/60 | archers | enemy 3 (storm sorcery) |
| zhou-yu | 76/96/96/90 | archers | guest in 9 |
| huang-gai | 80/68/82/72 | infantry | guest in 9 (fire ships) |
| gan-ning | 94/62/82/55 | cavalry | guest in 9 |
| cai-mao | 66/70/74/40 | archers | enemy 9 (fleet admiral) |

Rule: **a recruitable officer must never appear as an enemy in a later battle** (the validator checks this).

## Learnable stratagems (roster officers)
| Officer | Level | Stratagem (tag, cost, range, area, power, stat, effect, follows) |
|---|---|---|
| liu-bei | 4 | benevolent-banner (Command, 4, 0–2, aura, 0, —, buff lead +10 for 2 rounds, —) |
| guan-yu | 5 | green-dragon-cleave (Strike, 5, 1–1, single, 1.8, war, —, Strike Volley Shout Charge) |
| zhang-fei | 5 | bridge-roar (Shout, 5, 0–2, adjacent-within-2, 0.3, war, provoke + confuse, Strike Charge) |
| jian-yong | 3 | kindling (Fire, 3, 1–2, single, 0.6, int, ignite, Volley Strike) |
| zhao-yun | 6 | lone-rider (Charge, 5, 2–4, single, 1.4, war, dash, Volley Shout Strike) |
| zhuge-liang | start | valley-blaze (Fire, 6, 2–4, cross, 1.1, int, ignite all tiles, Volley Fire Ruse) and eight-trigrams (Command, 4, 0–2, aura, 0, —, buff lead +15 for 2 rounds) |
| zhuge-liang | 7 | borrow-the-wind (Command, 6, 0–0, self, 0, —, wind toward-target as chosen dir, gale, 3 rounds) |
| mi-zhu | 3 | supply-train (Command, 4, 0–2, aura, 0, —, heal 10%) |
| sun-qian | 3 | envoys-tongue (Ruse, 3, 1–3, single, 0, int, confuse, Shout Fire) |
| guan-ping | 4 | fathers-shadow (Strike, 3, 1–1, single, 1.3, war, —, Strike Charge; bond guan-yu) |

## Battles
**2. Relief of Qingzhou (184).** Rebels besiege Qingzhou; Liu Bei's first push fails, so he feigns a retreat. Map about 14×12: a walled city (village tiles inside wall/gate, gate owner han) in the east, rolling hills, two wooded ridges on the flanks. Start: Liu Bei, Jian Yong, Zou Jing (guest) in the centre-west. **Guan Yu and Zhang Fei arrive as player reinforcements in round 3** from behind the north and south ridges (slots 2 and 3 of the deploy list). Governor Gong Jing (guest) sallies from the city gate in round 5. Enemy: 7–8 invented rebel units under an invented "Rebel Chief" commander with `pursue:liu-bei`. Win: routCommander. Lose: commanderLost, timeout 14. Zou Jing departs after this battle.

**3. Guangzong (184).** Liu Bei joins the imperial push against the Zhang brothers. In this game's version, Zhang Bao's storm sorcery falls on Guangzong; the novel sets it at Yangcheng, so flag the liberty. Map: open plain toward a fortified camp, a river, farm belts. Enemy: Zhang Liang (commander), Zhang Bao with **call-the-storm** (Command, 6, wind toward-target gale for 2 rounds, effect R2-STRAT-1) plus a confuse Ruse, and 6 rebel units. Timeline message: "Zhang Jiao lies sick behind the palisade." Win: routCommander. Lose: commanderLost, timeout 15. The lesson: an enemy can turn your fire against you.

**4. Hulao Gate (190).** Coalition vs Dong Zhuo's army. Map: the pass narrows east toward a wall line with a gate (owner yellow-side, i.e. enemy) and ramparts holding enemy archers; Lu Bu sallies. Player: deploy 5 + guest Gongsun Zan. Enemy: **Lu Bu (retreatAt 0.5)**, Zhang Liao, Li Jue, Guo Si, rampart archers (invented). Enemy sides use the side id `dong` (sides are data: `han` vs `dong`), with a red-black banner colour token added to theme. Win: routUnits [lu-bu] (a retreat counts). Lose: commanderLost, timeout 12. The three brothers' bonds are the intended answer.

**5. Defence of Xuzhou (194).** Cao Cao invades to avenge his father; Liu Bei comes to Tao Qian's aid with Zhao Yun lent by Gongsun Zan. Map: city of Xuzhou on the west (walls, gate owner han, village tiles = the city), open fields east. Enemy side `cao`: Cao Cao (commander, `hold` far east), Xiahou Yuan, Cao Ren, Yu Jin, Dian Wei, plus 2 invented units. Win: survive {round 10}, with timeline message at round 10: "Riders bring word: Lu Bu has struck at Yanzhou. Cao Cao turns for home." Lose: commanderLost; unitLost tao-qian; hold-lose on the city tiles. After: Zhao Yun departs, Mi Zhu and Sun Qian join.

**6. Xiapi (198).** Liu Bei and Cao Cao besiege Lu Bu. Map: Xiapi city in the middle-east on low ground, two rivers north and south. **Timeline floods**: rounds 3, 5, 7 turn bands of low tiles (plain/farm/road around the city, outermost first) into shallows. Enemy side `lu`: Lu Bu (commander), Chen Gong (recruitable), Gao Shun (recruitable), Zhang Liao, plus 3 units. Guests: Cao Cao, Xiahou Dun. Win: routCommander. Lose: commanderLost, timeout 14.

**7. Bowang Slope (207).** Zhuge Liang's first command. Xiahou Dun pursues Zhao Yun (bait) into a narrow valley of reeds and forest at dusk. Joins before: Zhuge Liang, Zhao Yun, Guan Ping. Map: a long south–north valley (reeds), slopes with forest on both sides (ambush positions), the player's camp at the south end. Wind: breeze toward S from round 4 (the valley channels it). Enemy side `cao`: Xiahou Dun (commander, retreatAt 0.5, `pursue:zhao-yun`), Yu Jin, Li Dian, plus 5 units. Player: deploy 7, required liu-bei, zhuge-liang, zhao-yun; deploy slots in the forest are flagged so the player knows they are ambush posts. Win: routCommander. Lose: commanderLost, timeout 12.

**8. Changban (208).** Cao Cao's light cavalry catch Liu Bei's column of refugees. **Escape** objective: get Liu Bei and 3 other units off the south edge (exit tiles). Map: 16×12 north–south, a river with the Changban bridge (bridge tiles) in the south-middle, woods. Enemy side `cao` reinforcements from the north edge every 2 rounds (Zhang He, Xu Chu, Cao Ren, Xiahou Yuan, invented cavalry), and Cao Cao (commander, `hold`) arrives round 6. Zhang Fei (if deployed) should be able to hold the bridge with bridge-roar. Win: escape {units: [liu-bei], count 4}. Lose: commanderLost, timeout 12.

**9. Red Cliffs (208).** Allied with Wu. Cao Cao's chained fleet (deck tiles over water, contiguous) fills the north half; the allied shore is in the south with a narrow strip of shallows and reeds. Wind schedule: rounds 1–4 toward S breeze (the fire would blow back); **round 5 the south-east wind: toward NW, gale**. Guests: Zhou Yu, Gan Ning; **Huang Gai arrives round 5 as a reinforcement adjacent to the fleet** with fire-ships (Fire, 4, 1–1, cross, 1.2, war, ignite). Enemy side `cao`: Cao Cao (commander, retreatAt 0.5), Cai Mao, Cao Ren, Xu Chu, Zhang Liao, plus 4 invented fleet units on deck tiles. Win: routCommander. Lose: commanderLost, timeout 14. Epilogue: Cao Cao flees by the Huarong road; the realm splits in three.
