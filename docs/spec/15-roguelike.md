# 15 — Roguelike mode "Roads to War" (plan v0.2, 2026-11-01; decisions 1–4 answered, PLAN D28)

**Owner request (2026-11-01):** "I would love to reimagine this as a roguelike, so that you're fighting up to the final battle of that era. It would be cool to go through the minor battles of the era leading up to the major battle of each era - each scenario would be a major battle (yellow turban rebellion, chi bi, etc), and we'd go through 2-3 minor battles leading up to that battle (from history). Let's make a plan for that."

This is a plan, not a frozen spec. Items marked **[decide]** are the owner's call; each has a recommendation. Nothing here is built yet.

## 1. The shape in one paragraph
A **scenario** is one era, named for its major battle (Yellow Turbans → Guangzong; Red Cliffs → Chibi). A **run** starts with a small band and a seed. The **road** is a short branching map of 2–3 historical minor battles plus camps and events. It ends at the **major battle**, a large hand-built set piece with its own signature mechanic. Win the major battle and the era is won and written into the **Annals**. Lose any battle, or lose the lord, and the run ends; what you learned and unlocked stays. Each run differs because the road branches, the battles are seeded variants (enemy rosters, deployment, weather, omens), and you draft your officers, treasures and tactics as you go.

## 2. Eras (Liu Bei's path first)
History comes first, from the *Records of the Three Kingdoms* (Sanguozhi) and the *Book of the Later Han*. Famous set pieces from the novel are allowed, but each is labelled *novel* in its briefing. Dates and attributions marked † get checked in the research pass (RL0) before content is written.

| # | Era (scenario) | Major battle (finale) | Minor battle pool (2–3 are fought per run) | Reuses |
|---|---|---|---|---|
| 1 | Yellow Turban Rebellion, 184 | **Guangzong**: Zhang Jiao's stronghold (Huangfu Song takes it after Zhang Jiao's death) | Daxing Hill (*novel*, Liu Bei's debut) · Relief of Qingzhou (*novel*) · Changshe: the fire attack on Bo Cai's camp (history) · Wancheng: the siege (history; Sun Jian first over the wall) · Xiaquyang: Zhang Bao's last stand (history†) | Daxing, Qingzhou, Guangzong |
| 2 | The Coalition against Dong Zhuo, 190–191 | **Hulao Gate** (*novel*: the brothers against Lu Bu) | Xingyang / Bian River: Xu Rong routs Cao Cao (history) · Yangren: Sun Jian beats Dong Zhuo's army and Hua Xiong falls (history) · Sishui Gate: Guan Yu and Hua Xiong (*novel*) · Luoyang burning: escort the refugees (history: Dong Zhuo burns the capital) | Hulao |
| 3 | Xu Province and Lu Bu, 194–198 | **Xiapi**: the flood siege (history) | Tan: relieving Tao Qian against Cao Cao (history) · Xuyi–Huaiyin: holding off Yuan Shu (history) · Xiaopei: Lu Bu's halberd shot stops a battle (history; could be an event rather than a fight) · Defence of Xuzhou | Xuzhou, Xiapi |
| 4 | The Flight South, 200–208 | **Red Cliffs (Chibi)**: fire on the chained fleet, with the wind | Xuzhou 200: Cao Cao's eastern strike (history) · Runan: with the Yellow Turban remnants (history†) · Bowang Slope (history: 202; the campaign uses the novel's 207) · Changban: the rear guard and Zhao Yun's ride (history) · Xiakou: linking up with Liu Qi (history†) | Bowang, Changban, Red Cliffs |
| 5 | Into Yi Province, 211–214 | **Luo / Chengdu**: the year-long siege where Pang Tong falls (history) | Jiameng Pass (history) · Fu: the turn against Liu Zhang (history) · Mianzhu (history) · Zhang Fei down the river (history†) | — |
| 6 | Hanzhong, 217–219 | **Mount Dingjun**: Huang Zhong's charge kills Xiahou Yuan (history) | Yangping Pass (history) · Xiabian: Zhang Fei and Ma Chao (history†) · Han River: Zhao Yun's open camp (history, from Zhao Yun's separate biography) | — |
| 7 | Yiling, 221–222 | **Xiaoting / Yiling**: Lu Xun's fire on the camps. History records a loss; the scenario asks whether you can win it | Wu Gorges (history) · Zigui (history†) · Yidao: the blocked Sun Huan (history†) | — |

**v1 is eras 1–4.** They reuse all nine existing battles (seven as minors or finales and two as alternates) and need about 8 new minor battles. Eras 5–7 come later. Other lords (Cao Cao at Guandu, the Sun family at Chibi from the south bank) are a later expansion; see the decisions in §9.

## 3. A run
```
Choose era (unlocked ones) → choose lord + starting band (v1: Liu Bei's band) → choose Mandate (difficulty)
→ Road: tier 1 → tier 2 → [tier 3] → Major battle
   each tier: pick one of 2–3 nodes (the map shows two tiers ahead)
→ win: Annals entry, unlocks, era summary          → lose: run over, Annals records how far you got
```
**Node types on the road**
| Node | What happens |
|---|---|
| **Battle** | A historical minor battle as a seeded variant (§5). Win to get a reward pick. Each one has an optional **bonus objective** (e.g. "rout Bo Cai before round 6") that pays extra. |
| **Elite** | A harder battle or a duel set piece with a famous officer. It pays a treasure. Optional; the map can route around it. |
| **Event** | A short historical anecdote with 2–3 choices, told as a scene on the sand table: Liu Bei weeping over his thighs, the third visit to the thatched hut, Cao Cao's plum-grove talk. Choices trade provisions, loyalty, troops, a recruit or an omen. |
| **Camp** | The existing camp: heal the wounded, drill, muster, swap stratagems. |
| **Market** | Spend provisions on troops, treasures and tactic manuals. |

The road always has **2–3 battles** before the finale, as the owner asked; the branching only decides *which* ones and what sits between them. A run lasts about 45–90 minutes: 3–4 battles of 10–20 minutes, plus the stops between.

## 4. What you build during a run
- **Band:** you start with the lord plus 2–3 officers (Liu Bei, Guan Yu, Zhang Fei in era 1; later eras start with that era's historical band). After each win you pick **1 of 3 rewards**: a recruit (an officer from this era's pool), a treasure, a tactic manual (a new stratagem for an officer) or a troop upgrade. The existing camp and deploy rules apply, including deploy slots and required officers.
- **Officers carry over within a run**, with XP, levels and learned stratagems as in the campaign layer.
- **Loss:** a routed officer comes back **wounded** (50% troops next battle, as now). A second rout in the same run means they **fall** for the rest of the run. **Iron Oath** stays as the hardcore toggle: a single rout and they fall. If the lord is routed, the run ends.
- **Treasures** are passive modifiers taken from history and legend, e.g.:
  - Red Hare: +1 move for a rider;
  - the *Art of War*: one free stratagem a battle;
  - the Imperial Seal: +loyalty, but enemies target you;
  - Double-edged swords: Liu Bei's twin swords counter-attack harder;
  - a Black Dragon river map: extra movement on water.

  There are about 20 for v1, and each is one line of rule text with a rule id.
- **Provisions** stay the single currency.
- **Omens** are run modifiers that events can hand out, good or bad: "Heaven's wind" (fire spreads further), "Hungry ranks" (−10% troops), "Rumour of the Yellow Sky" (enemy sway +).

## 5. Battles as seeded variants
The existing battles are hand-built and deterministic. Replayability comes from **variants of hand-built maps**, not from random terrain, so every map stays a real place with its history.
- **Per battle data:** a base map plus variant slots:
  - 2–3 deployment layouts for each side;
  - enemy roster pools (who leads, troop mix and size by era tier and Mandate);
  - weather and wind tables;
  - optional terrain toggles (a bridge out, a burnt field);
  - a bonus objective pool.
- **The run seed drives everything** through the existing sfc32 RNG: the run seed fixes the road, and each node's seed fixes its variant. The same seed always gives the same run, so a **daily seed** and shared seeds come free.
- **Major battles** stay mostly fixed set pieces, with the signature mechanic always present (Chibi's fire and wind, Xiapi's flood, Hulao's gate and Lu Bu). Only the rosters and deployment vary.
- **Balance:** the AI bench grows into a **run bench**: the AI plays whole runs (road choices by a simple policy) over hundreds of seeds and reports win rate per era and Mandate level, the deadliest nodes and the treasures that are too strong. The win-rate targets are set in RL4.

## 6. Between runs: the Annals (meta-progression)
Each finished run, won or lost, writes an entry in the **Annals**: the era, the road taken, the battles, the losses and the best chain. Unlocks are **horizontal**, giving new options rather than permanent stat power, so the tactics stay the skill.
- **Next era:** winning an era's major battle unlocks the next era.
- **Wider pools:** officers you recruited join the era's draft pool for later runs.
- **Treasures and events:** achievements unlock them, e.g. winning Chibi without losing an officer.
- **Mandate levels:** 1–10 stacking difficulty steps, each one line. Examples: "enemy rosters +1 tier", "camps cost more", "one fewer reward choice".
- **A full-history run:** after all v1 eras are won, one long run chains eras 1–4 with the band carried forward.

## 7. How it fits the code
- **Engine** (`src/engine`, still pure):
  - `createBattle(battleId, seed, options)` gains `variant` (deployment, roster and toggles already resolved), `modifiers` (treasures and omens as data) and `roster` (the run's officers with levels and troops).
  - Every modifier is a rule with an id in `10-rules.md` (new section `RL-…`), and `query.*` still owns every number the UI shows, including modified ones. Modifiers are data that the existing rule functions read. They are not hooks that run code, so replay stays exact.
- **Run layer** (`src/run/`, pure TS like `src/campaign/`, with injected storage):
  - `RunState`, road generation (seeded), node resolution, reward tables, events, the Annals, saves;
  - it reuses the campaign's officer records, XP and camp code.
  - Save points are between nodes. A mid-battle save is the battle's action log, replayed on load.
- **Data:**
  - `src/data/eras/<era>.json`: the road template, node pools, the draft pool, the finale;
  - `src/data/battles/*.json`: gain `variants`;
  - `src/data/treasures.json`, `src/data/events/*.json`.
- **Client:**
  - **the road**, drawn as a strategy map laid out on the same sand table: a scroll-map of the province, with nodes as small banner flags and the path drawn in brush ink;
  - the reward pick drawn as three bamboo slips;
  - the Annals as a lacquered ledger;
  - everything follows `50-presentation.md`.
- **The "Liu Bei's Rise" campaign** stays playable as a story mode from the title (see the decisions in §9). Its battles become the first content for the eras.

## 8. Milestones (estimates in agent tokens; the overnight builds ran about 0.3–0.7M per agent)
| M | What | Est. |
|---|---|---|
| **RL0** | **Research and design:** era tables checked against sources (†-marked items settled), the run rules in `10-rules.md` with `RL-` ids, the treasure, event and omen lists, the road template, wireframes of the road and reward screens. Owner review gate. | ~0.4M |
| **RL1** | **Run layer and one era end to end:** `src/run/`, the road map UI, the reward pick, the camp/market/event nodes, saves, defeat and victory. Era 1 with its existing three battles plus Changshe and Wancheng as new minors. Unit tests by rule id, plus an e2e that plays a whole era-1 run at Instant speed with the bot. | ~1.2M |
| **RL2** | **Variants and modifiers:** variant slots on all v1 battles, treasures and omens in the engine with tests, bonus objectives, Mandate levels 1–5, daily seed. | ~0.9M |
| **RL3** | **Eras 2–4 content:** about 6 new minor battles (specs, data, scenes), events, draft pools, story lines for each era (our own prose). | ~1.8M |
| **RL4** | **Annals and balance:** meta-progression, unlocks, Mandate levels 6–10, the run bench over hundreds of seeds, tuning. KB update. | ~0.7M |
| RL5 | Eras 5–7 (later), then other lords | later |

v1 (RL0–RL4) is about **5M tokens**, done as two or three overnight sessions. The cut-ins, crowds, portraits and audio already built all carry over unchanged.

## 9. Decisions (owner answered 1–4 on 2026-11-01, all as recommended; 5–6 are defaults unless the owner objects)
1. **[decided: as recommended] Does the roguelike replace the campaign or sit beside it?** *Recommend: beside it.* "Roads to War" becomes the main mode on the title, and "Liu Bei's Rise" stays as a story mode. It's already built, and it teaches the rules.
2. **[decided: as recommended] Whose road?** *Recommend: Liu Bei's eras for v1* (the figures, portraits and stories already exist), with Cao Cao and the Sun family as later lords. Each lord would add their own eras, such as Guandu.
3. **[decided: as recommended] How long is a run?** *Recommend: one era per run* (45–90 min), and after all v1 eras are won, unlock one long run that chains all four.
4. **[decided: as recommended] Officer loss?** *Recommend: wounded first, fall on the second rout in a run*, with Iron Oath as the one-rout hardcore toggle.
5. **[default] Meta-progression?** *Recommend: unlocks only* (eras, officers into the draft pools, treasures, events, Mandate levels), with no permanent stat upgrades.
6. **[default] History or the novel?** You said "from history". *Recommend: history first, with the novel's best-known set pieces kept and labelled.* That keeps Daxing Hill, Qingzhou, Sishui Gate and Hulao Gate, which are novel events.
