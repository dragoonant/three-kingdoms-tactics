# 12 — Campaign: "Liu Bei's Rise" (v0.1)

Owner decisions D13–D17 (PLAN.md). Nine battles in sequence, with a camp between them and a persistent army. The campaign layer is **pure TypeScript** in `src/campaign/` (no React). Like the engine, it is deterministic and unit-tested. The client only renders it.

## 1. Flow
```
New campaign (choose Iron Oath on/off) → [Scene: prologue] → for each battle i in 1..9:
   Camp (skipped before battle 1) → Briefing → Pre-battle scene → Deploy (pick officers) → Battle
   → win: Post-battle scene → Results (XP, level-ups, joins/leaves, provisions) → autosave → next
   → loss: Defeat screen → "Retry battle" (restores the pre-camp autosave of this battle) or "Return to title"
After battle 9: Epilogue scene → Campaign summary (battles, best chain, officers' levels, losses).
```

## 2. Campaign state (`CampaignState`, JSON-serialisable, versioned)
```ts
{ version: 1, seed, ironOath: boolean, battleIndex: number,            // 0-based index into the arc
  roster: OfficerRecord[], provisions: number, stats: {...}, finished?: 'won' | 'lost' }
OfficerRecord = { officerId, level, xp, statBonus: {war,int,lead,cha}, maxTroops,
                  stratagems: string[], wounded: boolean, status: 'active' | 'fallen' | 'departed' }
```
Saved to `localStorage['tkt.campaign.v1']` (with try/catch; if storage is unavailable the game still runs, it just doesn't persist). `retry` reloads `localStorage['tkt.campaign.v1.prebattle']`, written when the Camp for that battle opens.

## 3. Experience and levels
- XP comes from the battle's event log, via the pure function `xpFromLog(events, side)`. Per officer:
  - +10 per normal attack that deals damage;
  - +15 per stratagem link it performs (opener or chain link);
  - +30 per enemy unit it routs;
  - +25 per successful sway;
  - +20 for being on the field (not routed) when the battle is won.
- 100 XP per level; levels 1–10. Starting levels come from `campaign.json`.
- Per level: `growth` from the officer data (e.g. Guan Yu `{war:2,int:1,lead:2,cha:1}`; the default is `{1,1,1,1}`), capped at 100 per stat. Max troops +100.
- **Stratagem learning:** officer data has `learns: [{level, strat}]`. Reaching the level adds the stratagem. An officer carries at most 3 stratagems into battle; in camp the player chooses which 3 when they know more.

## 4. Between battles (Camp)
- **Troops:** everyone starts each battle at max troops, except **wounded** officers (routed last battle, Iron Oath off), who start at 50% and lose the wounded flag after that battle.
- **Iron Oath on:** an officer routed in a *won* battle becomes `fallen` (permanently gone; their slip shows a black ribbon in camp). Liu Bei being routed loses the battle (it always does), and with Iron Oath on that ends the run: a retry is still allowed, but the campaign records the fall. A lost battle never kills anyone; you retry from the pre-battle save.
- **Provisions** (one number): +100 per victory, +10 per enemy unit routed, +5 per round under the battle's par (`par` in battle data). Spend in camp:
  - **Drill** an officer: 60 provisions for +50 XP (at most once per officer per camp).
  - **Muster** an officer: 80 provisions for +200 max troops (at most twice per officer per camp).
- **Recruitment:** a named enemy officer swayed during a won battle joins the roster if their officer record has `recruitable: true`. Invented captains are never recruitable. Story joins and departures are listed per battle (`joins`, `departs`) and shown on the Results screen.
- **Deploy:** each battle has `deploySlots` (n), `required` officer ids (always deployed), and fixed start tiles (`playerStarts`). The player fills the remaining slots from active roster officers, in order of the starts. Wounded officers can be deployed.

## 5. Story scenes
- Data `src/data/scenes/<battleId>.json`: `{ pre: Line[], post: Line[] }` plus `prologue` and `epilogue` files. Each Line is `{ speaker: officerId | 'narrator', text }`, with 3–8 lines per scene.
- Text is **our own prose**, written fresh and paraphrasing the novel's events. Never quote any published translation. Keep the tone grounded with a little warmth: the sworn brothers tease each other, and Zhang Fei is blunt.
- Shown as speech slips over the sand table: speaker portrait circle, name, line. Any click advances, and "Skip scene" is always shown.

## 6. Battle data additions (see 13-engine-v2.md for the mechanics)
Each campaign battle JSON adds: `title`, `year`, `place`, `blurb` (briefing paragraphs), `deploySlots`, `required`, `playerStarts`, `par`, `objectives`, `reinforcements`, `timeline`, `enemyBehaviour`, `joins`, `departs`. Battle 1 (Daxing Hill) gets these fields too: deploySlots 5, required liu-bei/guan-yu/zhang-fei, with Zou Jing and Jian Yong as story-required guests in battle 1 only.

## 7. The arc (detail in 14-campaign-battles.md)
| # | Battle | Year | Signature mechanic |
|---|---|---|---|
| 1 | Daxing Hill | 184 | fire on the millet, first chains |
| 2 | Relief of Qingzhou | 184 | feigned retreat: Guan Yu and Zhang Fei arrive as reinforcements |
| 3 | Guangzong | 184 | sorcery that seizes the wind |
| 4 | Hulao Gate | 190 | walls and a gate; Lu Bu retreats at 50% troops |
| 5 | Defence of Xuzhou | 194 | hold the city tiles for 10 rounds |
| 6 | Xiapi | 198 | the flood timeline drowns the low ground |
| 7 | Bowang Slope | 207 | the valley ambush, Zhuge Liang's first fire |
| 8 | Changban | 208 | escape: get Liu Bei and 3 others off the south edge; Zhang Fei holds the bridge |
| 9 | Red Cliffs | 208 | the chained fleet burns under the south-east wind |
