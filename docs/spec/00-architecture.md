# 00 — Architecture and frozen contracts

The patterns come from the owner's sibling games (see the knowledge base, `README.md` "proven build recipe"). Only the structure is reused; this game has its own rules and its own skin.

## Layers
```
src/engine/   pure TypeScript rules. No DOM, React, three or timers. Deterministic.
src/data/     JSON content (officers, stratagems, terrain, battles) + loader/validator.
src/ai/       decider(s) that answer through legalActions, runnable in a Web Worker.
src/client/   React + R3F: store (sole caller of step), presentation director, board, HUD.
tools/        sim.ts (headless games + invariants), ai-bench.ts.
tests/unit    Vitest, named by rule id from 10-rules.md (e.g. "R-ATK-1 rear arc ×1.5").
tests/e2e     Playwright, one full-battle-by-clicks test kept fast.
```

## Engine contract (frozen at M2 start; changes go in the change log below)
```ts
createBattle(battleId: string, seed: number): BattleState
legalActions(state): Action[]          // never empty while !state.result (endPhase always legal)
step(state, action): { ok: true, state, events: GameEvent[] } | { ok: false, code: RejectCode, message: string }
                                        // never throws on a bad action; state is immutable (returns a new object)
query.moveRange(state, unitId)          // reachable tiles + cost
query.attackTargets / query.attackPreview(state, unitId, targetId)            // min/max dmg, counter, arc, multipliers
query.stratagemTargets / query.stratagemPreview(state, unitId, stratId, target, excludeFromChain)
                                        // affected tiles, per-target min/max, planned chain links
query.swayChance(state, unitId, targetId)
query.fireForecast(state)               // spread chances for next end-of-round
replay(battleId, seed, actions[]): BattleState
```
- **Actions:** `move{unit,x,y}`, `undoMove{unit}`, `attack{unit,target}`, `stratagem{unit,strat,x,y,excludeFromChain[]}`, `sway{unit,target}`, `wait{unit,facing}`, `endPhase`.
- **Events:** a structured log (`moved`, `turned`, `attacked`, `countered`, `damaged`, `routed`, `stratagem`, `chainLink`, `sawThrough`, `confused`, `ignited`, `fireSpread`, `burnedOut`, `healed`, `swayed`, `swayFailed`, `windChanged`, `phaseStarted`, `roundStarted`, `battleEnded`). Every event has a player-facing line in the client feed (a test fails on any event kind without one).
- **RNG:** sfc32 seeded per battle and stored in state. The draw order is part of the contract.
- **Open information:** both sides see everything, so there is no `view()` filter in v1. Add one when hidden ambushes arrive.
- **`query.*` owns every number the UI shows.** The client never does rules maths.

## Invariants (checked by `tools/sim.ts` after every step)
No NaN; troops in [0, max]; Qi in [0, 10]; at most one unit per tile; no unit on a river; exactly one commander per side while the battle runs; `legalActions` non-empty until there is a result; every battle ends by the turn limit; replay(seed, log) equals the live state.

## Change log
- 2026-10-31 v0.1 written at M0.
