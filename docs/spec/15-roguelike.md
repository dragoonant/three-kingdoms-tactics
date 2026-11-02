# 15 — Roguelike mode "Roads to War" (plan v0.4, 2026-11-01; PLAN D28)

**Owner request (2026-11-01):** "I would love to reimagine this as a roguelike, so that you're fighting up to the final battle of that era ... each scenario would be a major battle (yellow turban rebellion, chi bi, etc), and we'd go through 2-3 minor battles leading up to that battle."

**Owner direction, same day:**
- "keep it from the novel. I'd like a romanticized version of history."
- "Boring ass stages that just give gold are worthless… each node in the grid should be some heavy decision. Like save a village under siege->go into a battle and lose some troops, or push troops forward instead of resting->less rice lost on the next stage, but lose some troops due to attrition."
- "rice/provisions should be a part of the game - it will drive how many troops each unit can bring into each battle. If you run out of rice - game over."

This is the agreed design. **RL1a (2026-11-02)** built the run layer (`src/run/`), the era-1 data (`src/data/eras/era1.json`) and the road, stop and deploy screens (`src/client/run/`); see "As built (RL1a)" at the end of this page.

**v0.4 (RL0 design pass, 2026-11-01).** Era 1 is designed in full in [`16-roguelike-era1.md`](16-roguelike-era1.md): the road template, 20 stops and an aftermath with exact effects, 3 new minor battles, the echo table, the Guangzong day table and the deploy rules. Every mechanic has an `RL-` rule in [`10-rules.md`](10-rules.md) §11. The numbers were tuned with a paper sim (`tools/roguelike/paper-sim.mjs`, data now `src/data/eras/era1.json`); its report is [`16-roguelike-era1-sim.md`](16-roguelike-era1-sim.md). Wireframes of the road, a stop, deploy and the finale briefing are in `docs/wireframes/roguelike/`. Numbers below that tuning changed are marked *(v0.4)*; they stay values for the RL4 run bench to confirm with the real battles.

## 1. The shape
- A **scenario** is one era of the novel, named for its major battle.
- A **run** is one era, 45–90 minutes. Liu Bei's band marches down a **road** of 6–8 **stops**. Every stop is a dilemma from the novel, and 2–3 of the choices along the way turn into battles.
- The road ends at the era's **finale**, a large hand-built battle whose setup is shaped by everything you did on the road.
- Win the finale and the era is written into the **Annals** (§6). The run ends if you lose a battle, if Liu Bei is routed, or if the rice runs out.
- This mode sits **beside** the story campaign "Liu Bei's Rise", which stays as a story mode.

## 2. The economy: three numbers and a calendar (always shown in the road HUD)
| | What it is | Rules |
|---|---|---|
| **Rice** (bags) | The clock, and the only currency | <ul><li>Daily upkeep is 1 bag per 500 soldiers in the pool (healthy and wounded), rounded up.</li><li>A battle also eats 1 bag per 250 soldiers fielded.</li><li>**Hungry:** if the rice lasts less than 3 days after a battle's cost, officers start that battle at 0 Qi *(v0.4: judged after the battle's rice)*.</li><li>**At 0 rice the army scatters: game over.**</li><li>The HUD always shows "Rice lasts N days".</li><li>*(v0.4)* There is no gold, so markets sell levies for rice: 100 soldiers per 5 bags, up to 500 a market stop.</li><li>*(v0.4)* Era 1 starts with 50 bags and 1,500 soldiers.</li></ul> |
| **Soldiers** | One shared army pool | <ul><li>Before each battle you fill each deployed officer's unit from the pool, up to their command cap (from Leadership and level).</li><li>Fewer soldiers on the field means a cheaper battle, but a weaker one.</li><li>Losses: half are killed and half are **wounded**. The wounded only return when you rest, and they still eat.</li><li>*(v0.4)* Command cap = 20 × Leadership + 100 × level (Liu Bei 1,850, Guan Yu 2,200, Zhang Fei 2,000 at level 3).</li><li>A routed officer is wounded first and falls on a second rout in the run. Iron Oath makes the first rout fatal, and a routed Liu Bei ends the run.</li></ul> |
| **Renown** | Liu Bei's benevolence, 0–100 (starts at 30 in era 1) | See §3 |
| **Days** | The calendar | <ul><li>Every leg of the road and every rest costs days, and the road shows them.</li><li>The finale gets harder with each day taken: its stockade or defences build up and enemy reinforcements arrive, on a per-finale table.</li><li>The finale briefing names the effect, e.g. "You arrived on day 15: the palisade is half built."</li><li>*(v0.4)* Guangzong's brackets: 12 or earlier, 13–16, 17–20 (as built), 21–24, 25–28, 29+. A fast, ruthless road arrives around day 11, a generous one around day 21.</li></ul> |

There is no gold. Battles never pay a flat reward; whatever you gain comes from the situation a battle was part of.

## 3. Renown (owner approved all six effects, 2026-11-01)
**How it changes.** Usually it costs something now and pays later.
- **+5 to +15:** saving a village, sharing rice with the starving, sparing enemies who surrender, keeping a promise, escorting refugees.
- **−5 to −15:** marching past people in danger, taking rice from villages, press-ganging peasants, executing prisoners, abandoning refugees.

**What it does.** The exact numbers are shown wherever an effect applies.
1. **Volunteers:** at each town or village stop, Renown × 10 soldiers offer to join.
2. **Rice:** at 50+, some stops give rice for free and market rice is cheaper. Below 20, villages hide their rice and markets charge double. *(v0.4: at 50+ every town or village stop brings a gift of Renown ÷ 5 bags; rice from a trade is ×1.25 at 50+ and ×0.5 under 20; market prices ×0.8 and ×2.)*
3. **Recruit thresholds:** some officers join only a lord of good name, e.g. Mi Zhu 40+, Zhao Yun 50+, Zhuge Liang 60+ (plus days spent on the three visits). Below the threshold they don't join, and some appear later as enemies. *(v0.4, era 1: Zhou Cang 40+ and Liao Hua 55+, both met early as an alt-history liberty.)*
4. **Battle spirit:** officers start a battle with +2 Qi at 70+, +1 at 40+, and −1 below 20. Below 20, 5% of the soldiers also desert at each rest.
5. **Sway:** Liu Bei's sway chance gets a bonus from Renown (an engine modifier with a rule id). *(v0.4: + ⌊(Renown − 30) ÷ 10⌋ points, RL-REN-6.)*
6. **Finales:** some finales read Renown. At Changban, the refugees slow you but block the enemy cavalry. At Red Cliffs, Sun Quan's alliance terms decide how many allied ships fight. *(v0.4, Guangzong: 60+ a village militia joins, 80+ two rebel captains waver, under 20 one imperial company stays in camp.)*

**Design aim:** the ruthless road (fast and well fed, but short of men, low in spirit and missing some officers) and the benevolent road (slow and hungry, but a growing army and the best officers) must both be winnable. The run bench checks this. *(v0.4: in the paper sim, benevolent wins 51–58% and ruthless 48–51% over three seed sets; a careless battle-hungry run starves 20%.)*

## 4. Stops are dilemmas
- Each stop is a scene from the novel on the sand table, with **2–3 choices**. Every choice button shows its exact cost and gain in rice, soldiers, days and Renown.
- A **battle is one of the choices**, not a kind of stop.
- Some consequences are **hidden echoes**: they stay unseen and come back later, at a later stop or in the finale briefing.
- Now and then a choice is an **open gamble with stated odds** ("60%: the gates open").
- The map shows two stops ahead, and roads branch: a short mountain path (fewer days, attrition) or the long road (more days and rice, safe).

**Era 1 examples** *(v0.4: tuned numbers; the full list of 20 stops is in `16-roguelike-era1.md` §3)*:
| Stop | Choices |
|---|---|
| **The recruiting notice at Zhuo** (novel ch. 1, the opening) | <ul><li>Zhang Fei sells his estate: +600 soldiers, +10 rice.</li><li>Open the peach garden to the county: −8 rice, 1 day, +15 Renown.</li><li>Take the county's levy: +30 rice, +300 pressed men, −10 Renown.</li><li>(The horse merchants are their own stop: their gift forges the brothers' weapons, War +4 all run.)</li></ul> |
| **A village under siege** | <ul><li>Fight: a battle (`village-siege`); a win gives +20 rice, +10 Renown, then Renown × 10 volunteers.</li><li>Send Zhang Fei with 100 men: +5 Renown, half the volunteers; 50%: he comes back hurt (half his command until you rest) and 100 die.</li><li>March past: −10 Renown, no volunteers. *Echo:* the village falls and one more rebel unit waits at the finale.</li></ul> |
| **Rest or push on** | <ul><li>Rest 2 days: the wounded return, hurt officers recover, +1 Qi next battle.</li><li>Forced march: the next leg is 2 days shorter, but −12% soldiers to attrition, and they arrive tired (−1 move in round 1).</li><li>Rest a day and strip the orchard: +10 rice, half the wounded back, −3 Renown.</li></ul> |
| **A captured granary** | <ul><li>Take it: +40 rice, but the wagons cost 3 days.</li><li>Burn it: the finale enemy fields 2 fewer units.</li><li>Give it to the starving: +15 Renown and volunteers on the spot.</li></ul> |
| **Lu Zhi in chains** (novel ch. 1: your teacher, arrested on a eunuch's word) | <ul><li>Free him: a battle against the imperial escort (`prison-cart`); his veterans join you at the finale, but you are outlaws (imperial camps give no rice).</li><li>Pay the escort: −10 rice, +5 Renown.</li><li>Let him go: −6 Renown. *Echo:* Zhang Fei ignores your first order in the next battle.</li></ul> |
| **Zhang Fei flogs the inspector** (novel ch. 2) | <ul><li>Let him: +12 Renown and Zhang Fei +1 Qi, but you lose the county post's rice and become outlaws.</li><li>Stop him and pay: +22 rice, −5 Renown, and Zhang Fei broods (−1 Qi for one battle).</li></ul> |

**Finale briefing:** before deploy, every echo, every day effect and every Renown effect is listed with its cause. Example: "Because you burned the granary: Zhang Bao fields 2 fewer units."

## 5. Eras from the novel (Liu Bei's path; v1 is eras 1–4)
| # | Era | Finale | Stops and battles drawn from the novel | Reuses |
|---|---|---|---|---|
| 1 | Yellow Turbans | Guangzong | Zhuo recruiting, Daxing Hill, relief of Qingzhou, the rescue of Dong Zhuo and his snub, Lu Zhi in chains, Zhang Bao's sorcery (pig and dog blood against the hex), the inspector | Daxing, Qingzhou, Guangzong |
| 2 | Coalition against Dong Zhuo | Hulao Gate (the three brothers against Lu Bu) | Joining Gongsun Zan, Sishui Gate (Guan Yu's warm wine and Hua Xiong's head), Sun Jian and the Imperial Seal, Luoyang burning, Cao Cao's pursuit at Xingyang | Hulao |
| 3 | Xu Province and Lu Bu | Xiapi (White Gate Tower) | Tao Qian's three offers of Xu, the halberd shot at the camp gate, Zhang Fei's drunken loss of Xiapi, Yuan Shu's march, the plum-grove talk with Cao Cao | Xuzhou, Xiapi |
| 4 | The Flight South | Red Cliffs | Guan Yu's five passes (as an event chain), the three visits, Bowang Slope, Xinye burning, Changban and Zhao Yun's ride, borrowing arrows with straw boats, the chained fleet, borrowing the east wind | Bowang, Changban, Red Cliffs |
| 5–7 | Yi Province, Hanzhong, Yiling | later | | |

Battle maps are hand-built places with **seeded variants**:
- 2–3 deployments for each side;
- enemy roster pools;
- weather and wind;
- terrain toggles;
- bonus objectives.

The run seed fixes the whole run, so daily and shared seeds come free. Each finale is a fixed set piece whose setup the road changes: the day table, echoes and Renown.

## 6. Between runs: the Annals (default: horizontal unlocks, no permanent stat power)
- Every run, won or lost, is written down: era, road, battles, losses, best chain, final Renown.
- Winning an era's finale unlocks the next era.
- Officers recruited once join that era's pool of possible recruits.
- Achievements unlock new stops and treasures.
- Mandate levels 1–10 add difficulty.
- After all four v1 eras are won, a long run chains them with the band carried forward.

## 7. How it fits the code
- **Engine** (`src/engine`, still pure):
  - `createBattle(battleId, seed, options)` gains `variant`, `modifiers` (Renown Qi, sway bonus, tired, echoes as roster changes) and `roster` (officers with their troop counts from the pool).
  - Every modifier is a rule with an `RL-` id in `10-rules.md`, and `query.*` owns every number the UI shows.
- **Run layer** (`src/run/`, pure TS with injected storage):
  - `RunState` holds rice, soldiers, wounded, Renown, day, flags (echoes), roster and seed;
  - it also covers road generation, stop resolution, upkeep and saves.
  - It reuses the campaign's officer and XP code.
- **Data:**
  - `src/data/eras/<era>.json`: road template, stop pool, finale day table, echo hooks;
  - `src/data/stops/*.json`: scene lines, choices with exact effects, echoes;
  - `variants` added to the battle JSONs.
- **Client:**
  - the road as a scroll map of the province laid on the sand table, with stops as banner flags and the path in brush ink;
  - choices as bamboo slips with costs on them, confirmed with the cinnabar seal;
  - the rice, soldiers, Renown and day counters along the top;
  - the deploy screen gains a soldier slider per officer, with the battle's rice cost shown live.

## 8. Milestones
| M | What | Est. |
|---|---|---|
| RL0 | Design pass: the full era 1 stop list with numbers, the finale day table, the `RL-` rules, wireframes of the road, a stop and deploy; a paper sim of 3 runs (owner gate). **Done 2026-11-01:** `16-roguelike-era1.md`, `16-roguelike-era1-sim.md`, `10-rules.md` §11, `docs/wireframes/roguelike/` | ~0.4M |
| RL1 | The run layer and era 1 end to end: road UI, stops, upkeep, pool deploy, Renown, echoes, saves; e2e of a whole run with the bot | ~1.2M |
| RL2 | Seeded variants, modifiers in the engine, Mandate levels 1–5, daily seed | ~0.9M |
| RL3 | Eras 2–4: stops, about 6 new battles, scenes in our own prose | ~1.8M |
| RL4 | Annals, Mandate 6–10, the run bench (ruthless and benevolent policies over hundreds of seeds), tuning | ~0.7M |

## 9. Decisions (owner, 2026-11-01)
- **Placement:** beside the campaign.
- **Scope:** Liu Bei's path first, one era per run.
- **Officer losses:** wounded first, then fall.
- **Source:** the novel.
- **Stops:** every one is a heavy decision.
- **Rice:** sets troop numbers, and 0 rice ends the run.
- **Soldiers:** one shared pool.
- **Calendar:** each day taken strengthens the finale.
- **Visibility:** exact costs, hidden echoes, occasional stated-odds gambles.
- **Renown:** all six effects as proposed.
- **Default, unless the owner objects:** horizontal unlocks only.

## As built (RL1a, 2026-11-02)
- **Run layer** `src/run/` (pure, deterministic, storage injected; no DOM, React, three or `Math.random`): `types.ts` (RunState v1, era data shapes), `era.ts` (data access, the RL-RNG-1 streams), `road.ts` (RL-ROAD-1..6), `core.ts` (start state, upkeep, losses, Renown, stops and choices, gambles, volunteers and gifts, markets, legs, forced march, mountain path, make camp, send home), `battle.ts` (deploy check and seal, the battle's `CreateOptions` with `RunModifiers`, the result: RL-LOSS-1, RL-FALL-1, RL-XP-1, RL-END-*, the finale briefing), `query.ts` (every number a run screen shows: slips, HUD, forecast, road view), `save.ts` (RunState v1 at `tkt.run.v1`, the Annals at `tkt.run.annals.v1`). Officer records, XP and levels reuse `src/campaign` (`makeRecord`, `addXp`, `xpBreakdownFromLog`, `carriedStratagems`).
- **Battle ids:** the stop data names real battle ids: `daxing-hill`, `qingzhou`, `rl-village-siege`, `rl-bandit-pass` (the old `village-siege` variant `bandit-pass`), `rl-prison-cart`, `rl-dong-zhuo-rescue`, `guangzong`.
- **What reaches the engine today** (`CreateOptions.run`): `startQiAll` (Renown spirit + rest; hungry is `-2`, cancelling the opening +2), `startQi` (per-officer echoes), `enemyTroopScale` (tier scale x pre-battle raids; `no-quarter` x1.05 at the finale), `swayBonus` (RL-REN-6), `removeUnits` (finale: the day bracket's archers, `granary-burned`, Renown under 20). Forged weapons are War +4 in the deploy entry's `statBonus`. The rest of the finale table (map patches, waves, added guests, loyalty changes, Zhang Bao's storm), tiredness (-1 move) and Zhang Fei's sulk have no contract field yet: the briefing and the deploy screen show them marked "applied in a later build" (RL2).
- **Client** `src/client/run/` (one `run` screen; the store picks the view from the run phase): New run (seed shown, Iron Oath), the peach-garden prologue and each stop's speech slips, the road scroll map and HUD (rice, lasts N days, the RL-HUNGER-2 forecast, soldiers + wounded, Renown with its Qi, day and finale bracket), stop slips with exact effects and the seal, the market, deploy (sliders, the quartermaster's slip, the Hungry chip, the Qi line, the refusing seal), the finale briefing, the battle report and the run end with its annals. Battles run through the existing battle flow (`useGame.beginRun`, mode `run`).
- **Sim:** `npx tsx tools/roguelike/paper-sim.mjs` now runs on `src/run`; only its policies and the placeholder battle model are its own.
