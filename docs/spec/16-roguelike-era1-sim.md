# 16 — Era 1 paper sim report (RL0, 2026-11-01)

**What this is.** `tools/roguelike/paper-sim.mjs` plays era 1 of "Roads to War" (`16-roguelike-era1.md`) end to end on paper: it draws each seed's road, walks it with four simple policies, applies every road rule exactly (`10-rules.md` §11, RL-) and reads every number from `docs/spec/data/era1-stops.json`. It is plain Node with no dependencies and is deterministic (sfc32 seeded like `src/engine/rng.ts`).

```
node tools/roguelike/paper-sim.mjs                  # 500 seeds per policy (seeds 1-500), summary + dominance check
node tools/roguelike/paper-sim.mjs --md             # + choice shares per stop
node tools/roguelike/paper-sim.mjs --first 5001     # holdout seeds
node tools/roguelike/paper-sim.mjs --narrate 6 --policies benevolent,ruthless,balanced
```

**What it is not.** Battles are **not played**. They use the placeholder model below, which stands in for the RL4 run bench (every battle played by the engine with the utility AI). The model only decides the road economy: whether a band of a given size, spirit and hunger tends to win a battle of a given size, and what it costs. Win rates in this report are for the model, not for a human at the real battles.

## 1. The model
**Battles (placeholder).** For a deployment with fielded soldiers nᵢ per officer:
- strength S = Σ nᵢ × qᵢ × forgedᵢ × (1 + 0.04 × Qi modᵢ) × (0.93 if tired) × (1 − 0.04 if Zhang Fei sulks) + guests;
- qᵢ is an officer quality (Liu Bei 1.0, Guan Yu 1.12, Zhang Fei 1.10, Jian Yong 0.85, Zhou Cang 0.95, Liao Hua 0.90); forged = 1.04 for the brothers with the forged weapons;
- Qi mod = Renown spirit (RL-REN-4) + rest bonus + per-officer echoes, and −2 for everyone when hungry (RL-HUNGER-1);
- enemy E = the battle's E × the tier scale (0.85 at tier 1, 1.0 at tier 2, 1.05–1.2 in the mid tiers) × pre-battle modifiers; the finale's E = 5,500 × the day bracket × (1 + echo and Renown shares);
- r = S ÷ E; **P(win) = 1 / (1 + e^(−6 (r − 0.8)))** (r = 1 gives 77%, r = 1.2 gives 92%);
- on a win, soldiers lost = fielded × clamp(0.22 ÷ r, 0.06, 0.45), split half killed and half wounded (RL-LOSS-1); each non-commander officer is routed with chance clamp(0.10 ÷ r, 0.02, 0.25) (RL-FALL-1); every fielded officer gains a level (+100 cap) in place of the real XP;
- a lost battle ends the run (RL-END-1).

| Battle | E (soldier units) | Guests | Slots |
|---|---|---|---|
| daxing-hill | 2,000 | 800 | 4 |
| qingzhou | 2,600 | 600 | 4 |
| village-siege (both variants) | 1,800 | 150 | 3 |
| prison-cart | 2,000 | 0 | 3 |
| dong-zhuo-rescue | 2,300 | 500 | 4 |
| guangzong (finale) | 5,500 | 1,500 | 5 |

**Policies.** Each scores every payable choice with a weighted sum of its printed effects (rice, soldiers, Renown, days at the current upkeep, stated finale effects, recruits, Qi), takes a gamble at its expected value minus a risk term, and values a battle as P(win) × spoils − P(loss) × 200 − its rice and losses. They see printed numbers and stated odds only, **never a hidden echo**. Careful policies avoid leaving a stop with under 4 days of rice, send men home when the rice will not reach the next stop, make camp when many are wounded, and send the wounded home before the finale when that lifts the hunger.

| Policy | Character | Rice / soldiers / Renown weights | Marches | Mountain path | Market keeps |
|---|---|---|---|---|---|
| benevolent | protect people, rest often | 1.0 / 3.0 / 2.2 (losses ×1.5), +6 for a choice worth Renown 8+, +12 for a rest | never | never | 14 days of rice |
| ruthless | take rice, march hard, skip people | 1.6 / 2.6 / 0 | every leg of 2+ days | always | 8 days |
| balanced | the middle | 1.2 / 3.0 / 0.9 | when behind schedule | when short of rice | 11 days |
| greedy-fighter | takes every battle, careless with rice | 0.6 / 3.0 / 0.5; only panics at 3 days | never | never | 12 days |

## 2. Results (500 seeds per policy)

### v0.5 (owner rulings 2026-11-01): Daxing Hill is always on the road
Tier 1 is now the single fixed stop `daxing-hill` (no "guard Zhuo's walls" option), so every run fights at least once before the finale; the road HUD gains the finale forecast (`RL-HUNGER-2`). Everything else is unchanged from v0.4.

**Seeds 1–500:**

| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| benevolent | 58% | 2% | 15% | 26% | 84% | 3 | 52% | 3000 | 58% | 80 | 20 | 3 | 5 | 0% |
| ruthless | 49% | 0% | 6% | 45% | 94% | 6 | 5% | 2350 | 6% | 0 | 12 | 1 | 4 | 0% |
| balanced | 45% | 1% | 8% | 45% | 91% | 5 | 27% | 2550 | 31% | 20 | 18 | 2 | 4 | 0% |
| greedy-fighter | 21% | 17% | 39% | 23% | 46% | 2 | 58% | 2150 | 56% | 60 | 21 | 4 | 4 | 1% |

**Seeds 5001–5500:**

| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| benevolent | 55% | 1% | 16% | 27% | 82% | 3 | 51% | 3100 | 56% | 82 | 20 | 3 | 5 | 0% |
| ruthless | 50% | 0% | 4% | 46% | 96% | 6 | 6% | 2400 | 6% | 0 | 12 | 1 | 4 | 0% |
| balanced | 43% | 1% | 10% | 46% | 90% | 5 | 23% | 2700 | 27% | 20 | 18 | 2 | 4 | 0% |
| greedy-fighter | 19% | 18% | 43% | 19% | 40% | 3 | 57% | 2200 | 57% | 60 | 21 | 4 | 4 | 1% |

**Seeds 9001–9500:**

| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| benevolent | 54% | 2% | 13% | 31% | 85% | 4 | 49% | 3000 | 56% | 80 | 20 | 3 | 5 | 0% |
| ruthless | 43% | 0% | 7% | 51% | 93% | 6 | 6% | 2400 | 5% | 0 | 12 | 1 | 4 | 0% |
| balanced | 42% | 1% | 7% | 50% | 92% | 5 | 24% | 2600 | 29% | 20 | 18 | 2 | 4 | 0% |
| greedy-fighter | 19% | 18% | 40% | 22% | 43% | 3 | 60% | 2050 | 62% | 60 | 21 | 4 | 4 | 0% |

Across the three sets: benevolent 54–58%, ruthless 43–49%, balanced 42–45%, greedy-fighter 19–21% (starving 17–18%). No run reaches the finale without a battle; ruthless now fights 1 (84%) or 2 road battles. Dominance check: none. The owner accepted the middle road being weakest ("commit to a road"; recheck in RL4) and the benevolent road arriving hungry (the forecast makes it a choice).

### v0.4 (before the Daxing ruling)
**Seeds 1–500:**

| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| benevolent | 58% | 4% | 12% | 27% | 85% | 4 | 46% | 2950 | 57% | 80 | 21 | 2 | 5 | 0% |
| ruthless | 51% | 0% | 4% | 45% | 96% | 6 | 6% | 2350 | 6% | 0 | 11 | 1 | 4 | 0% |
| balanced | 47% | 1% | 7% | 45% | 92% | 5 | 25% | 2650 | 31% | 18 | 18 | 1 | 4 | 0% |
| greedy-fighter | 18% | 20% | 39% | 23% | 44% | 2 | 70% | 2150 | 68% | 57 | 21 | 4 | 4 | 1% |

**Holdout seeds 5001–5500** (same data, different roads):

| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| benevolent | 51% | 2% | 15% | 33% | 83% | 3 | 57% | 2900 | 63% | 80 | 21 | 2 | 5 | 0% |
| ruthless | 49% | 0% | 4% | 47% | 96% | 6 | 6% | 2350 | 7% | 0 | 11 | 1 | 4 | 0% |
| balanced | 43% | 0% | 8% | 48% | 92% | 5 | 29% | 2600 | 34% | 19 | 17 | 2 | 4 | 0% |
| greedy-fighter | 18% | 20% | 41% | 20% | 41% | 2 | 60% | 2000 | 58% | 58 | 21 | 4 | 4 | 1% |

Median battles before the finale, all four policies pooled: **2** (benevolent 2, balanced 1–2, ruthless 1, greedy-fighter 4). A third seed set (9001–9500) gives benevolent 53%, ruthless 48%, balanced 41%, greedy-fighter 19% (21% starved).

**Targets (from the RL0 brief):**
| Target | Result | |
|---|---|---|
| Benevolent and ruthless both win roughly 45–65% | benevolent 51–58%, ruthless 48–51% over three seed sets | met |
| A careless or greedy-fighter run often reaches the finale with ≤3 days of rice, or starves (~20–40%) | greedy-fighter starves 20–21%; 60–70% of those that arrive have ≤3 days | met |
| No single choice is picked by every sensible policy everywhere | dominance check (a choice ≥95% for each of benevolent, ruthless and balanced): **none** on seeds 1–500 and 5001–5500 | met |
| The median run sees 2–3 battles before the finale | pooled median 2; ruthless alone is 1 | met overall, low for ruthless |

## 3. What each policy chose (seeds 1–500)
Share of visits to each stop. No row has one choice at ≥95% for all three sensible policies.

| Stop | benevolent | ruthless | balanced | greedy-fighter |
|---|---|---|---|---|
| zhuo-notice | feast 100% | levy 100% | levy 100% | estate 100% |
| horse-merchants | escort 100% | commandeer 100% | commandeer 79%, escort 21% | escort 100% |
| daxing-hill | fight 100% | raid 100% | fight 100% | raid 100% |
| qingzhou-relief | relieve 100% | march-on 91%, relieve 9% | relieve 99%, march-on 1% | relieve 100% |
| village-under-siege | break 84%, zhang-fei 16% | pass 98%, zhang-fei 2% | zhang-fei 80%, break 20% | break 100% |
| refugee-column | take-in 65%, feed 28%, press 7% | press 100% | press 100% | press 100% |
| yellow-deserters | enlist 100% | execute 100% | enlist 91%, execute 9% | enlist 100% |
| hungry-county | harvest 100% | seize 100% | seize 98%, harvest 2% | seize 77%, harvest 23% |
| flooded-ford | wait 71%, cross 16%, rafts 14% | rafts 71%, cross 29% | rafts 94%, cross 6% | cross 98%, rafts 2% |
| bandit-offer | accept 96%, clear 4% | clear 58%, toll 42% | clear 77%, accept 15%, toll 8% | clear 100% |
| huangfu-song-fires | firebreak 76%, pursue 24% | pursue 100% | pursue 100% | pursue 100% |
| captured-granary | give 84%, take 16% | burn 65%, take 35% | take 41%, give 30%, burn 29% | give 87%, burn 13% |
| lu-zhi-in-chains | free 39%, bribe 36%, let-pass 25% | let-pass 100% | let-pass 100% | free 100% |
| dong-zhuo-rescue | charge 55%, loot 45% | loot 100% | loot 100% | charge 100% |
| dong-zhuo-snub | restrain 56%, storm-out 44% | - | - | storm-out 100% |
| plague-camp | march-through 55%, quarantine 45% | charm-water 100% | charm-water 100% | charm-water 100% |
| rest-or-push | push 73%, rest 21%, forage 6% | push 100% | push 99%, forage 1% | rest 53%, forage 46%, push 1% |
| inspector | flog 85%, pay 15% | pay 100% | pay 82%, flog 18% | flog 78%, pay 22% |
| zhu-jun-camp | horses 82%, serve 18% | serve 100% | serve 92%, horses 8% | horses 75%, serve 21%, storm-wancheng 5% |
| zhang-bao-sorcery | night-raid 94%, blood 6% | night-raid 100% | night-raid 54%, blood 46% | blood 92%, night-raid 8% |
| guangzong-eve | advance 91%, wait-column 9% | night-raid 100% | advance 86%, wait-column 14% | night-raid 63%, wait-column 37% |


## 4. Tuning (first pass → final)
The first pass used spec 15's first-pass numbers plus a first draft of the stops. It came out wrong in every target:

| Policy | Win | Starved | Lost a road battle | Battles (median) |
|---|---|---|---|---|
| benevolent | 30% | 2% | 3% | 0 |
| ruthless | 10% | 0% | 0% | 0 |
| balanced | 10% | 0% | 0% | 0 |
| greedy-fighter | 2% | 15% | 79% | 3 |

and 8 choices were picked by every sensible policy (Daxing raid, commandeering the horses, looting Dong Zhuo's rout, letting Lu Zhi's cart pass, crossing the flood, the forced march, both night raids). The army never grew past about 2,500 against a finale tuned for 8,000, and battles took 25–30% of the men who fought. What changed, in order:

1. **Scale.** Finale E 8,000 → 5,500 and guests 2,200 → 1,500; road battles down 15–25% (Daxing 2,400 → 2,000, Qingzhou 3,000 → 2,600, village 2,000 → 1,800, prison cart 2,300 → 2,000, Dong Zhuo 2,700 → 2,300); the mid-tier scale 1.1–1.4 → 1.05–1.2. The pool reaches 2,500–4,500 by the finale, not 6,000+.
2. **Losses** 0.28 ÷ r → 0.22 ÷ r of the field (about 18% at r = 1.2, half of it wounded).
3. **Start rice** 40 → 50.
4. **Markets (new rule RL-POOL-5):** rice buys levies, 5 bags per 100 (×0.8 at Renown 50+, ×2 under 20), up to 500 a market stop. The ruthless road had a rice hoard and no use for it.
5. **The Renown 50+ gift (RL-REN-2)** became Renown ÷ 5 bags at every town and village stop instead of a per-stop number. The benevolent road starved without it.
6. **Day table:** 5 brackets (×0.85–1.45) → 6 brackets (×0.75–1.3, cut at days 12, 16, 20, 24, 28). Arriving very early is the ruthless road's reward.
7. **Marching:** forced march 4% → 3% of the healthy per day saved, and tiredness now walks off after one normal leg (RL-MARCH-2). Before, the ruthless band reached Guangzong tired every time.
8. **Echoes:** hidden finale penalties softened from +6–8% to +3–5% each (a ruthless run collects four); burning the granary −10% → −15% with no Renown cost; the blood ward −8% → −15% for 1 day and 6 rice; Huangfu Song's column +1,000 → +1,200 for 2 days instead of 3; Renown under 20 withholds a smaller company (−1,000 → −500); the 60+ militia +700 → +600.
9. **Stops:** the Zhuo feast +10 → +15 Renown; the levy also presses 300 men; Zhang Fei's estate +600 men, +10 rice; the horse dealers' gift is the forged weapons (War +4 for the brothers all run) for 1 day; the Daxing raid became "burn the carts, then fight" (a gamble that weakens the battle) so the ruthless road still fights; holding Zhuo pays 10 rice; the Qingzhou smuggling run is cheaper (12 rice, 80%); breaking the village siege pays 20 rice and Zhang Fei's sortie is 50%; the flooded ford is 60% with a harsher loss; loading the granary takes 3 days; Lu Zhi's bribe is cheaper and letting the cart pass costs 6 Renown; charging to Dong Zhuo's rescue brings 200 stragglers and +10 Renown while looting is +15 rice; quarantine takes 1 day; the forced march at the rest stop costs 12%; flogging the inspector is +12 Renown and keeps the county's young men; storming Wancheng is 65%; the altar raid 55%.
10. **Policy fixes** (not game changes): careful policies stopped dismissing half the army at the first sign of hunger, stopped picking choices that leave under 4 days of rice, and send the wounded home before the finale when that ends the hunger.

## 5. Three runs, stop by stop
*Narrated on the v0.4 road (before tier 1 became Daxing Hill alone); all three runs already went through Daxing Hill. RL1 regenerates them from `--narrate`.*

Raw logs come from `--narrate <seed>`. Each line of the log reads "day | rice (days it lasts) | healthy + wounded | Renown | event".

### Benevolent, seed 6 (long road): won, 3 road battles
Road: Zhuo → {refugees | **Daxing Hill**} → {deserters | **Qingzhou**} → {empty county | **Lu Zhi**} → {Changshe fires | **Zhou Cang's pass**} → {fever | **village under siege**} → {Dong Zhuo | **the inspector**} → {rest or push | **eve of Guangzong**} (taken stops in bold).
1. **Zhuo.** Opens the peach garden to the county (−8 rice, a day, Renown 30 → 45). 450 volunteers: 1,950 men, 39 rice, 9 days.
2. **Daxing Hill** (3-day leg). Marches with Zou Jing: fields only 1,500 for 6 bags at 97% and wins, −240 (120 killed). Zou Jing's stores +30, Renown 53, Jian Yong joins; 530 volunteers, and at 50+ the elders bring 10 bags.
3. **Qingzhou.** Relieves the city: 2,200 fielded for 9 bags at 87%, won, −430. The governor's granary +30, Renown 63; 630 volunteers and 12 bags.
4. **Lu Zhi in chains.** Pays the escort to treat him gently (−10 rice, Renown 68). Hidden echo: Lu Zhi's letter.
5. **Zhou Cang's pass.** At Renown 68 Zhou Cang kneels: +400 men and a fifth officer.
6. **The village under siege.** Breaks the siege: 2,800 fielded for 12 bags at 99%, −400. +20 rice, Renown 75; 750 volunteers and 15 bags. Rice is now the problem: 3,700 men eat 8 bags a day.
7. **The inspector.** Cuts him down and pays him from the county granary (+22, Renown 70, Zhang Fei broods); 700 volunteers and 14 bags.
8. **The eve of Guangzong.** Crosses at dawn.
9. **Guangzong, day 21 (late: levies on round 4).** 3,890 healthy, 530 wounded, 26 rice (2 days). The letter gives the imperial guests +2 Qi; Renown 70 brings the Julu militia and +2 Qi. Fields 3,850 for 16 bags, so it fights **hungry** (all officers at 0 Qi). 77% → **victory**. The slow, generous road: the biggest army in the sim, a full band of five, and barely enough rice to feed it on the day.

### Ruthless, seed 15 (short road): won, 1 road battle
Road: Zhuo → {refugees | **Daxing Hill**} → {empty county | **Qingzhou**} → {Zhou Cang's pass | **fever**} → (mountain path over {Lu Zhi | rest or push}) → {village | **the inspector**} → {Zhang Bao | **Zhu Jun's camp**}.
1. **Zhuo.** Takes the county's levy and presses its idle men (+30 rice, +300, Renown 20); 200 volunteers; buys 500 levies for 25 bags. 2,500 men, 55 rice.
2. **Daxing Hill.** Burns the rebel carts and the farms round them the night before (Renown 15, a day) and wins the 65% gamble: +30 rice and the rebels at ×0.75. Fields just 1,000 for 4 bags at 97%, −160. +20 rice, Jian Yong joins; buys 500 more levies. 3,070 men, 61 rice.
3. **Qingzhou.** Leaves it to its walls (Renown 13; hidden echo: Qingzhou falls). Forced march.
4. **Fever in the camp.** Buys the charm water (Renown 8) and wins the 50%: nobody dies. Forced march, then the **mountain path** (−140 to stragglers, a stop skipped).
5. **The inspector.** Pays him from the county granary (+22, Renown 3). Forced march.
6. **Zhu Jun's camp.** Serves in his line (+40 rice, 2 days, a company for the finale); buys 200 levies at the low-Renown price, 10 bags per 100.
7. **Guangzong, day 11 (very early: a line of stakes).** 2,900 healthy, 270 wounded, 51 rice (7 days), Renown 3. The briefing: Qingzhou's besiegers have joined Zhang Liang; Zhu Jun's company fights beside you; the imperial generals keep a company back from a lord with such a name; every officer −1 Qi. Fields 2,900 for 12 bags, well fed. 81% → **victory**. Fast and fed, a thin and dispirited army, and the finale caught half built.

### Balanced, seed 39 (short road): won, 2 road battles
Road: Zhuo → {**Daxing Hill** | refugees} → {**Qingzhou** | horse dealers} → {Dong Zhuo | **deserters**} → {**the inspector** | Lu Zhi} → {**village** | fever} → {Zhang Bao | **eve of Guangzong**}.
1. **Zhuo.** The levy (+30 rice, +300, Renown 20), 200 volunteers, 500 bought levies: 2,500 men, 55 rice.
2. **Daxing Hill.** Fights with Zou Jing: 1,500 fielded at 97%, −240; +30 rice, Renown 28, Jian Yong.
3. **Qingzhou.** Relieves it: 2,500 at 92%, −450; +30 rice, Renown 38; 380 volunteers.
4. **The deserters.** Spares and enlists them (+400 men, Renown 43; hidden echo: turncoats).
5. **The inspector.** Pays him (+22 rice); 380 volunteers.
6. **The village under siege.** Sends Zhang Fei with a hundred men and **loses the 50%**: 100 killed and Zhang Fei hurt, leading half his cap until a rest that never comes; half the volunteers still come (220).
7. **The eve of Guangzong.** Crosses at dawn.
8. **Guangzong, day 15 (early: half built).** 3,370 healthy, 340 wounded, 23 rice (2 days). The turncoats' cousin wavers. Fields 3,350 for 14 bags and fights **hungry**. 75% → **victory**. The middle road has the men but not the rice or the spirit; it is the weakest of the three policies overall (43–47%).

## 6. What the sim cannot tell us
- **The benevolent road fights the finale hungry** 56–63% of the time (rice lasting under 3 days after the finale's cost): it wins on men and spirit and fights the last battle at 0 Qi. That is the design aim ("slow and hungry"), but it is the strongest single pressure in the economy and the place a human will feel cheated if it is too common. (An open question for the owner.)
- **Officers almost never fall** (0–1% of runs): the model routs officers rarely. Real battles will rout more, and RL-FALL-1 will matter more than this shows.
- **The middle road is the weakest.** Spreading across rice and Renown gets neither the Renown snowball (volunteers, gifts, +2 Qi) nor the very early finale.
- **The ruthless road fights about one battle**, because it skips the people who need saving. The pooled median is 2.
- **Policies are blind to hidden echoes.** A player who has learned them from the Annals will do better, mostly on the ruthless road (it collects four of them).
- **Battle E values, tier scales and the finale's day multipliers are paper numbers.** RL2 fits the real battle variants to them and RL4's run bench (the real AI on every battle) replaces this model.
