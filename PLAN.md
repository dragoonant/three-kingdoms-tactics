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
| Next | Campaign: Liu Bei's road (Guangzong, Hulao Gate, Xuzhou, Changban, Red Cliffs, …), persistent officers, recruitment | | |

## Rulings / balance log
(`RULING: <rule> | <what we did> | <why>`)
