# 15 — Roguelike mode "Roads to War" (plan v0.3, 2026-11-01; PLAN D28)

**Owner request (2026-11-01):** "I would love to reimagine this as a roguelike, so that you're fighting up to the final battle of that era ... each scenario would be a major battle (yellow turban rebellion, chi bi, etc), and we'd go through 2-3 minor battles leading up to that battle."

**Owner direction, same day:**
- "keep it from the novel. I'd like a romanticized version of history."
- "Boring ass stages that just give gold are worthless… each node in the grid should be some heavy decision. Like save a village under siege->go into a battle and lose some troops, or push troops forward instead of resting->less rice lost on the next stage, but lose some troops due to attrition."
- "rice/provisions should be a part of the game - it will drive how many troops each unit can bring into each battle. If you run out of rice - game over."

This is the agreed design. All numbers are first-pass values for tuning in RL4 (the run bench). Nothing is built yet.

## 1. The shape
- A **scenario** is one era of the novel, named for its major battle.
- A **run** is one era, 45–90 minutes. Liu Bei's band marches down a **road** of 6–8 **stops**. Every stop is a dilemma from the novel, and 2–3 of the choices along the way turn into battles.
- The road ends at the era's **finale**, a large hand-built battle whose setup is shaped by everything you did on the road.
- Win the finale and the era is written into the **Annals** (§6). The run ends if you lose a battle, if Liu Bei is routed, or if the rice runs out.
- This mode sits **beside** the story campaign "Liu Bei's Rise", which stays as a story mode.

## 2. The economy: three numbers and a calendar (always shown in the road HUD)
| | What it is | Rules |
|---|---|---|
| **Rice** (bags) | The clock | <ul><li>Daily upkeep is 1 bag per 500 soldiers in the pool, rounded up.</li><li>A battle also eats 1 bag per 250 soldiers fielded.</li><li>**Hungry:** with less than 3 days of upkeep left, officers start battles at 0 Qi.</li><li>**At 0 rice the army scatters: game over.**</li><li>The HUD always shows "Rice lasts N days".</li></ul> |
| **Soldiers** | One shared army pool | <ul><li>Before each battle you fill each deployed officer's unit from the pool, up to their command cap (from Leadership and level).</li><li>Fewer soldiers on the field means a cheaper battle, but a weaker one.</li><li>Losses: half are killed and half are **wounded**. The wounded only return when you rest.</li><li>A routed officer is wounded first and falls on a second rout in the run. Iron Oath makes the first rout fatal, and a routed Liu Bei ends the run.</li></ul> |
| **Renown** | Liu Bei's benevolence, 0–100 (starts at 30 in era 1) | See §3 |
| **Days** | The calendar | <ul><li>Every leg of the road and every rest costs days, and the road shows them.</li><li>The finale gets harder with each day taken: its stockade or defences build up and enemy reinforcements arrive, on a per-finale table.</li><li>The finale briefing names the effect, e.g. "You arrived on day 11: the stockade is half built."</li></ul> |

There is no gold. Battles never pay a flat reward; whatever you gain comes from the situation a battle was part of.

## 3. Renown (owner approved all six effects, 2026-11-01)
**How it changes.** Usually it costs something now and pays later.
- **+5 to +15:** saving a village, sharing rice with the starving, sparing enemies who surrender, keeping a promise, escorting refugees.
- **−5 to −15:** marching past people in danger, taking rice from villages, press-ganging peasants, executing prisoners, abandoning refugees.

**What it does.** The exact numbers are shown wherever an effect applies.
1. **Volunteers:** at each town or village stop, Renown × 10 soldiers offer to join.
2. **Rice:** at 50+, some stops give rice for free and market rice is cheaper. Below 20, villages hide their rice and markets charge double.
3. **Recruit thresholds:** some officers join only a lord of good name, e.g. Mi Zhu 40+, Zhao Yun 50+, Zhuge Liang 60+ (plus days spent on the three visits). Below the threshold they don't join, and some appear later as enemies.
4. **Battle spirit:** officers start a battle with +2 Qi at 70+, +1 at 40+, and −1 below 20. Below 20, 5% of the soldiers also desert at each rest.
5. **Sway:** Liu Bei's sway chance gets a bonus from Renown (an engine modifier with a rule id).
6. **Finales:** some finales read Renown. At Changban, the refugees slow you but block the enemy cavalry. At Red Cliffs, Sun Quan's alliance terms decide how many allied ships fight.

**Design aim:** the ruthless road (fast and well fed, but short of men, low in spirit and missing some officers) and the benevolent road (slow and hungry, but a growing army and the best officers) must both be winnable. The run bench checks this.

## 4. Stops are dilemmas
- Each stop is a scene from the novel on the sand table, with **2–3 choices**. Every choice button shows its exact cost and gain in rice, soldiers, days and Renown.
- A **battle is one of the choices**, not a kind of stop.
- Some consequences are **hidden echoes**: they stay unseen and come back later, at a later stop or in the finale briefing.
- Now and then a choice is an **open gamble with stated odds** ("60%: the gates open").
- The map shows two stops ahead, and roads branch: a short mountain path (fewer days, attrition) or the long road (more days and rice, safe).

**Era 1 examples** (first-pass numbers):
| Stop | Choices |
|---|---|
| **The recruiting notice at Zhuo** (novel ch. 1, the opening) | <ul><li>Zhang Fei sells his estate: +500 soldiers, +20 rice.</li><li>Accept the horse merchants' gift: a cavalry unit, the brothers' weapons forged, +8 rice.</li></ul> |
| **A village under siege** | <ul><li>Fight: a battle, about −300 soldiers, then +10 Renown, +200 volunteers, +15 rice.</li><li>Send Zhang Fei alone with 100 men: a duel set piece, 40% chance he returns wounded, +5 Renown.</li><li>March past: no cost now, −10 Renown. *Echo:* the village falls and one more rebel unit waits at the finale.</li></ul> |
| **Rest or push on** | <ul><li>Rest 2 days: 2 days of upkeep, the wounded return, +1 Qi next battle.</li><li>Forced march: arrive 2 days earlier, but −8% soldiers to attrition, and they start the next battle tired (−1 move in round 1).</li></ul> |
| **A captured granary** | <ul><li>Take it: +40 rice, but the wagons cost +2 days.</li><li>Burn it: the finale enemy fields 2 fewer units.</li><li>Give it to the starving: +15 Renown and volunteers on the spot.</li></ul> |
| **Lu Zhi in chains** (novel ch. 2: your teacher, arrested on a eunuch's word) | <ul><li>Free him: a battle against the imperial escort, after which officials stop supplying rice.</li><li>Let him go. *Echo:* Zhang Fei refuses one order in a later battle.</li></ul> |
| **Zhang Fei flogs the inspector** (novel ch. 2) | <ul><li>Let him: +10 Renown and Zhang Fei +1 Qi, but you lose the county post and its rice.</li><li>Stop him: keep the rice, and Zhang Fei broods (−1 Qi for one battle).</li></ul> |

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
| RL0 | Design pass: the full era 1 stop list with numbers, the finale day table, the `RL-` rules, wireframes of the road, a stop and deploy; a paper sim of 3 runs (owner gate) | ~0.4M |
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
