# 13 — Engine v2: what the campaign battles need (v0.1)

Each addition is **one generic mechanism**, not a battle-specific branch, and is data-driven from the battle JSON. Existing rule ids stay valid, and Daxing Hill must replay exactly as before (the golden test must stay byte-identical). New rule ids use the prefix `R2-`.

## 1. Battle options (campaign carry-over)
- `[R2-OPT-1]` `createBattle(battleId, seed, options?)`. `options.deploy` is an array of `{officerId, level, statBonus, maxTroops, troops, stratagems}` for the player side, placed on `playerStarts` in order. Without options the battle uses its built-in default roster, so Daxing Hill is unchanged. Stats used in battle = base + statBonus (cap 100).

## 2. Objectives (replaces the hard-coded victory check)
- `[R2-OBJ-1]` `objectives: { win: Cond[], lose: Cond[] }` per battle, evaluated for the player side (`han`). The enemy has no separate list: the player losing is the enemy winning. If a battle has no `objectives`, the old rules apply (R-WIN-1/2), so Daxing Hill is unchanged.
- Conditions (any `win` met → win; any `lose` met → loss; lose is checked first):
  - `routCommander`: the enemy commander is routed or has retreated.
  - `routAll`: no enemy units are on the board.
  - `routUnits {units[]}`: every listed enemy unit is routed or has retreated.
  - `survive {round}`: the end of that round is reached.
  - `hold {tiles[], round}`: at the end of that round, no enemy unit stands on any listed tile (lose variant: an enemy stands on any listed tile at the end of any enemy phase).
  - `escape {units[]?, count, tiles[]}`: that many player units (including every listed unit) have **escaped**. An escape is an action available to a unit standing on an exit tile; it removes the unit from the board as `escaped`, which is not routed.
  - `commanderLost`: the player commander is routed (the default lose condition).
  - `unitLost {unit}`: a protected unit is routed.
  - `timeout {round}`: the end of that round passes.
- `[R2-OBJ-2]` **Retreat:** a unit with `retreatAt: 0.5` leaves the board (`retreated` event) when its troops fall to that fraction of max or below, after the damage that caused it. Retreated counts as routed for `routCommander` and `routUnits`.

## 3. Reinforcements
- `[R2-REIN-1]` `reinforcements: [{round, side, units: UnitDef[], entry: [x,y][]}]`. These arrive at the start of that side's phase in that round, on the entry tiles in order. A blocked entry tile shifts to the nearest free passable tile (row-major tie-break). They arrive ready to act, with Qi 4. A player reinforcement may name a deploy slot (`slot: n`), which places the n-th chosen officer from the deploy list instead of a fixed unit.

## 4. Timeline events
- `[R2-TIME-1]` `timeline: [{round, phase: 'start' | 'end', kind, ...}]`. Kinds:
  - `terrain {tiles[], to}`: change those tiles' terrain. A unit on a tile that becomes impassable is pushed to the nearest passable free tile; if none, it is routed.
  - `wind {dir, strength}`: an ad-hoc wind change that overrides the schedule until the next schedule entry.
  - `message {text}`: a narrator line for the ledger and banner.
  - `ignite {tiles[]}`: set those tiles burning.

## 5. New terrain
| Terrain | Move inf/cav/arch | Def | Elev | Flammability | Notes |
|---|---|---|---|---|---|
| wall | — | — | 1 | 0 | impassable; blocks Charge dash |
| rampart | 2/—/2 | 0.75 | 1 | 0 | top of a wall; cavalry cannot enter; archers get +1 range (as hill) |
| gate | 1/1/1 owner side only, else — | 0.85 | 0 | 0 | battle data names the owner side; a timeline `terrain` event can turn it into `road` (gate opened) |
| shallows | 3/4/3 | 1.25 | 0 | 0 | flood water |
| reeds | 2/3/2 | 0.90 | 0 | 1.0 | |
| deck | 1/2/1 | 1.00 | 0 | 1.0 | a ship's deck; burning deck tiles become `water` instead of ash |
| water | — | — | 0 | 0 | impassable |
| bridge | 1/1/1 | 1.00 | 0 | 0 | road over water; a timeline event may destroy it (→ water) |

## 6. Stratagem additions
- `[R2-STRAT-1]` effect `wind {dir, strength, rounds}` (Command tag): sets the wind for N full rounds, then the schedule resumes. The direction can be `'toward-target'` (the cardinal direction from caster to target).
- `[R2-STRAT-2]` effect `buff {stat, amount, rounds}` on allies in an aura (e.g. Zhuge Liang). Buffs show as statuses and expire at the end of the owner's phase after N rounds.
- `[R2-STRAT-3]` effect `provoke` (Shout): the target must move toward and attack the caster on its next activation if able. The AI honours it; for the player it is shown and enforced by `legalActions` (only actions that attack the provoker, or move toward it, are legal for that unit).

## 7. Enemy behaviour hints (data for the AI, ignored by the rules)
`enemyBehaviour: { [unitId]: 'advance' | 'hold' | 'guard:<unitId|x,y>' | 'ambush:<range>' | 'pursue:<unitId>' }`. `ambush:n` stays put until a player unit comes within n tiles or the unit is attacked; it is open information and shown on the unit's panel as "Lying in wait".

## 8. Events added
`retreated`, `escaped`, `reinforced`, `terrainChanged`, `timelineMessage`, `buffed`, `buffExpired`, `provoked`, `objectiveProgress` (for the HUD objective tracker). Each needs a ledger line in the client.

## 9. Queries added
`query.objectives(state)` returns each condition with progress text from the engine (e.g. "Hold the gate: round 4 / 10", "Escaped 2 / 4"). `query.timelinePreview(state)` returns the next scheduled timeline items that are open information.

## 10. Further generalisations needed by 14-campaign-battles.md
- `[R2-SIDE-1]` **Side ids are data.** The player side is always `han`. The enemy side id comes from the battle (`yellow`, `dong`, `cao`, `lu`), with `sides: [{id, name, colourToken}]` in the battle JSON. The engine must not assume `yellow`.
- `[R2-GUEST-1]` **Guests:** `guests: UnitDef[]` are fixed player-side units placed at their own starts, never taken from the roster and never earning campaign XP. `defaultDeploy` lists the roster officers used when no `options.deploy` is given (tests, sim, quick battle).
- `[R2-AREA-1]` New area `ring2`: every tile within Manhattan distance 1..2 of the caster (used by bridge-roar).
- `[R2-AREA-2]` An `ignite` effect on a multi-tile area ignites every flammable tile in that area, not only the anchor.
- `[R2-SLOT-1]` `playerStarts` entries may carry `ambush: true` (shown as an "ambush post" in deploy UI only; no rule effect) and `arrivesRound: n` (that slot's officer arrives as a reinforcement in round n on that tile instead of at the start).
