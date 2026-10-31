# PLAN — Three Kingdoms Tactics

An original 3D grid tactics game set in the Three Kingdoms era, built as a spiritual successor to Koei's *Dynasty Tactics* (2002) and *Dynasty Tactics 2* (2003). It is not affiliated with Koei Tecmo. It is not a port: the ruleset is our own (`docs/spec/10-rules.md`).

## Decisions (owner, 2026-10-31 — do not re-ask)
- **D1** Platform: browser, TypeScript, same stack as the owner's sibling games (Vite, React 19, three/R3F, zustand, Vitest, Playwright).
- **D2** First milestone: one playable battle (vs AI) plus the design doc.
- **D3** Art direction: from the knowledge base (`dragoonant/tabletop-kb`), so MGSD figures (about 2–2.5 heads).
- **D4** Presentation concept: **War-council sand table** (`docs/spec/50-presentation.md`).
- **D5** First battle: **Daxing Hill**, the Yellow Turban rising (`docs/spec/11-battle-daxing-hill.md`).
- **D6** Git: push to `main` after each stage; GitHub Pages deploys every push.

## Defaults taken (change any by saying so)
- **D7** Square grid, 4 facings (front, side, rear). Hex was considered and not chosen.
- **D8** Side-phase turns (all your officers, then all of theirs), one move plus one action per officer.
- **D9** Signature system: **linked stratagems** (tags and `follows`, chained automatically from units already in range, up to 4 links, sworn-brother bonds). The player can exclude officers from a chain.
- **D10** IP posture: historical names from the public-domain novel; all prose, names of systems, UI and art are ours; no Koei names, art, music or UI. README says "unofficial fan project, not affiliated with Koei Tecmo".
- **D11** Working title "Three Kingdoms Tactics" until the owner picks one.
- **D12** The knowledge base is linked as a submodule at `docs/knowledge-base/` (KB rule). Pages does not check out submodules.

## Campaign decisions (owner, 2026-10-31 night — do not re-ask)
- **D13** Campaign arc: **Liu Bei's rise, 9 battles**: Daxing Hill → Relief of Qingzhou → Guangzong → Hulao Gate → Defence of Xuzhou → Xiapi → Bowang Slope → Changban → Red Cliffs. If time runs short, finish fewer battles completely rather than all nine half-done.
- **D14** Between battles: **camp with a persistent army**. Troops, experience and levels carry over; officers learn stratagems; swayed officers can join the roster; the player picks who deploys; autosave in the browser after each battle.
- **D15** Routed officers: return wounded next battle by default. **"Iron Oath" option** at campaign start makes routed officers permanent losses (Liu Bei falling ends the run). A lost battle can be retried.
- **D16** Enemy AI: **utility AI (M4) before the campaign battles**; gate: normal beats random ≥ 95%.
- **D17** Story: **short scenes on the table** (3–8 lines of our own prose per scene, speech slips, click skips) plus the briefing.
- **D18** Overnight budget **~6M tokens**; Sonnet agents implement; **multi-agent workflows approved**; **KB pushes approved**.

## Milestones
| M | What | Where | Status |
|---|---|---|---|
| M0 | Scaffold, specs 00/10/11/50, PLAN, CLAUDE.md, Pages | cloud | done 2026-10-31 |
| M1 | Data: terrain, officers, stratagems, Daxing Hill JSON + validator | cloud | |
| M2 | Engine: pure reducer per 10-rules, seeded RNG, replay, sim with invariants, rule-id tests | cloud | |
| M3 | Playable slice: sand-table skin, stand-in MGSD figures, HUD/slips/seal, director, greedy bot, briefing + how-to-play | cloud | |
| M4 | Utility AI in a worker; ai-bench (normal beats random ≥ 95%) | cloud | |
| M5 | Art: MGSD officer concepts → Hunyuan GLBs; sand-table terrain props | owner's PC | |
| M6 | Audio: drums/guqin/erhu score, seal stamp, fire, clash SFX | owner's PC | |
| M7 | Polish, phone layout, settings, end screen | cloud | |
| M8 | Campaign framework: progression, camp, roster, saves, story scenes, Iron Oath | cloud | |
| M9 | Campaign battles 2–9 (specs + data + scenes + per-battle AI checks) | cloud | |

## Rulings / balance log
(`RULING: <rule> | <what we did> | <why>`)
RULING: R-UNIT-4 | Units start a battle with 0 Qi; the first phase's +2 is applied inside createBattle (no events returned for it) | spec gives no starting Qi, 0 keeps round-1 casts impossible (cheapest costs 3)
RULING: R-STRAT-2 | Troop matchup (x1.2) and terrain defence apply to every damaging stratagem; only the facing arc (Strike, Charge) and height (Strike, Charge, Volley) depend on the tag | simplest literal reading of "uses the attack formula"
RULING: R-STRAT-1 | A stratagem is castable only if it would hit at least one enemy in its area, or has the ignite effect and the anchor tile is flammable, not burning and holds no unit; Thunder Roar/War Cry (adjacent) are anchored on the caster's own tile and need an adjacent enemy | spec defines no empty casts, but Fire Attack on the millet must work
RULING: R-STRAT-1 | Rally the Militia (aura, range 0-2) heals every allied unit (self included) within Manhattan distance 2 of the caster by 15% of max troops (rounded to 10, capped); castable only when someone in that area is wounded; anchor is the caster's tile | "aura (allies incl. self)" was undefined
RULING: R-STRAT-3 | Foresight is rolled per target before the variance roll; a unit that sees through takes no damage/effect but the anchor tile still ignites | draw order must be fixed; the fire is on the ground, not in the target's mind
RULING: R-CHAIN-1 | A link "hits" an enemy when that enemy does not see through it (a failed confuse roll still counts); the next link must target an enemy hit by the previous link only and still on the board; Charge dashes are allowed as links (the dash is part of the stratagem, not a pre-move) | simplest reading
RULING: R-CHAIN-2 | "Closest unit" = Manhattan distance to the previous link's caster; a candidate's best target maximises the summed expected damage (variance 1.0, ignoring foresight and confuse), ties by first tile row-major; unit ties by id (plain string order) | spec left "closest to what" open
RULING: R-CHAIN-4 | Bond means the link officer's `bonds` list contains the previous link's officer (the opener has no bond); the +1 range applies to single/cross/sweep range and dash range, not to caster-centred areas | simplest reading
RULING: R-ATK-3 | Counterattack damage counts as damage from a normal attack, so the countered attacker also gains +1 Qi | R-UNIT-4 wording
RULING: R-TURN-2 | Confusion is a flag cleared at the end of its owner's side's next phase (including units swayed mid-phase, who recover at the end of that same phase) | simplest reading of "until the end of the confused unit's next phase"
RULING: R-TURN-4 | undoMove is also refused while another unit stands on the start tile, and is unavailable after the unit dashed as a chain link | otherwise two units could share a tile / teleport
RULING: R-WIN-2 | At the turn limit the round counter stays at N (no increment) and the result is timeout; fire at the end of round N resolves first, and if both commanders fall at once the onTimeout side wins | R-TURN-7 ordering plus a tiebreak
RULING: R-FIRE-2 | Every surviving unit on a burning tile gets the 50% confuse roll (even if already confused); fire damage is rounded to 10, minimum 10, capped at current troops; routed units are removed | draw order must be fixed
RULING: R-STRAT-6 | The dash path (the tiles between caster and target) must hold no unit of either side, be passable and not forest; the destination is the tile adjacent to the target | "clear path"
RULING: R-MOVE-1 | Leaving a ZOC tile is always allowed; an allied-occupied ZOC tile can be passed into but not through (movement ends on entering, and allies cannot be stopped on) | consequence of R-BOARD-2 + R-MOVE-1
RULING: R-SWAY-1 | "Within 2 tiles" = Manhattan distance 1..2; the sway pair key is caster unit id + target unit id | simplest reading
RULING: data | Jian Yong is tagged source "Romance ch.1" with a `note` (cast liberty: strategist added to this battle); only the four captains and the Adept are `invented` | 11-battle-daxing-hill.md lists only those as invented

## UI notes (M3)
- **Layers.** `src/client/store/game.ts` is the only caller of `step`; it holds the live state, the action log, the seed (`?seed=` or random), the UI selection and the *presented scene*. `presentation/scene.ts` is a small picture of the battle (units, burning tiles, ash, wind, round) that the director advances one engine event at a time; a unit test replays every batch of real games and checks the picture ends equal to the live state. `presentation/beats.ts` is the pure planner (events to timed beats, each beat commits its events when it ends). `presentation/director.ts` plays them on timers; any press skips the batch and the click that follows is swallowed.
- **Speeds.** Full = plan durations, Quick = 40% (min 40 ms), Instant = 0 (applied in a loop, no banners or floating numbers). The bot waits 750 / 220 / 0 ms between actions, only when the director is idle; a 2 s watchdog re-arms it and a batch older than 25 s is skipped.
- **Bot (`src/ai/greedy.ts`).** One-ply and pure: for every ready unit it scores "stay" and every move tile (it steps the move to evaluate attacks, stratagems and sways from the new tile with `query.*`), adds a small position term (closer, side/rear arc, cover, not on fire), and returns the best legal action. Sway is only considered at 60% or better. Greedy (han) beats greedy (yellow) in all of 30 seeds and beats the random policy in 30 of 30; Daxing Hill is therefore easy for a strong player until M4 gives the rebels a real utility AI.
- **Seal text.** Every confirm button names what it does with engine numbers (`Seal: Arrow Rain → Captain Gao, 290–360 + chain ×3`); "OK" is never a label and there are no native `title` tooltips (an e2e check enforces both).
- **Camera.** The camera is fitted so the whole 14x12 board sits inside the part of the window the HUD leaves free (right 312 px and bottom 196 px on desktop, bottom 40% on phone), using a view offset; orbit, zoom and pan are clamped, Q/E turn the table. `?aa=0` and `?shadows=0` are quality switches for slow machines.
- **Headless rendering.** Under SwiftShader the board renders at about 2–3 fps; Playwright runs one worker, drives battles at Instant speed and waits on `window.__game.idle()`. `window.__game` (only with `?test=1`) also has `suggest()` (the greedy choice), `tileToScreen`, `unitToScreen`, `scene()`, `ledger()` and `stats()`.
- **Stand-in art.** Each figure is two merged meshes (body, banner) with baked vertex colours, so a figure costs a handful of draw calls; the facing notch, back banner and weapon make facing readable. Replace with the M5 GLBs behind the same `Figure` props.
- Polish: chain seal row should read left-to-right in link order (opener first); M3 screenshot showed it reversed.
