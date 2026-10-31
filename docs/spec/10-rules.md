# 10 — Battle rules (v0.1, frozen for M1–M3)

This is an **original ruleset**. It is in the spirit of the early-2000s Three Kingdoms tactics games (positioning, facing, linked stratagems, fire and wind, recruiting officers mid-battle), but every mechanic, formula and name here is ours. It is not a port. Numbers are first-pass balance values; tune them only with an ai-bench or playtest result, and log every change in `PLAN.md`.

Rule IDs in brackets (e.g. `[R-ATK-1]`) are what tests are named after.

## 1. The board
- `[R-BOARD-1]` A battle is a W×H grid of square tiles. `x` runs west→east (0..W-1) and `y` runs north→south (0..H-1). Facing is one of `N E S W`.
- `[R-BOARD-2]` At most one unit stands on a tile. Units cannot pass through enemies; they may pass through allies but not stop on them.
- `[R-BOARD-3]` Terrain table (move cost by troop type infantry/cavalry/archers; "def" multiplies damage the occupant takes):

| Terrain | Move inf/cav/arch | Def | Elev | Flammability | Notes |
|---|---|---|---|---|---|
| plain | 1/1/1 | 1.00 | 0 | 0.5 | grassland |
| farm | 1/1/1 | 1.00 | 0 | 1.0 | ripe millet |
| forest | 2/3/2 | 0.80 | 0 | 1.0 | Charge cannot end in or pass through |
| hill | 2/2/2 | 0.90 | 1 | 0.5 | archers on a hill get +1 max range |
| village | 1/1/1 | 0.85 | 0 | 0 | heals 5% max troops at the start of the occupant's phase |
| road | 1/1/1 | 1.00 | 0 | 0 | |
| ford | 2/3/2 | 1.20 | 0 | 0 | |
| river | — | — | 0 | 0 | impassable |
| ash | 1/1/1 | 1.00 | 0 | 0 | what burnt tiles become |

- `[R-BOARD-4]` Height: an attacker on higher elevation than its target deals ×1.15; on lower elevation ×0.90.

## 2. Units and officers
- `[R-UNIT-1]` A unit is one **officer** leading **troops**. Troops are the unit's hit points (shown as a number, e.g. 2,000). A unit at 0 troops is **routed** and removed.
- `[R-UNIT-2]` Officer stats are 1–100: **War** (physical attack), **Intellect** (stratagem power and resisting ruses), **Leadership** (troop defence), **Charisma** (swaying enemies). Officers may also have **Loyalty** (0–100, or `null` meaning they cannot be swayed), **bonds** (a list of officer ids), and 1–3 **stratagems**.
- `[R-UNIT-3]` Troop types:

| Type | Move | Attack range | Strong against (×1.2) |
|---|---|---|---|
| infantry | 4 | 1 | cavalry |
| cavalry | 6 | 1 | archers |
| archers | 3 | 2–3 (cannot attack an adjacent tile) | infantry |

- `[R-UNIT-4]` Each unit has **Qi** (0–10). It gains +2 at the start of its side's phase and +1 each time it takes damage from a normal attack, up to 10. Stratagems spend Qi.
- `[R-UNIT-5]` Each side has exactly one **commander**. If a side's commander is routed, that side loses at once.

## 3. Turn structure
- `[R-TURN-1]` A battle runs in **rounds**. Each round, every side gets one **phase**, in the battle's side order (player first in Daxing Hill).
- `[R-TURN-2]` Start of phase, for that side's units: gain Qi; apply village healing; any unit still **confused** from earlier stays confused through this phase (it cannot act; see §7) and recovers at the end of this phase.
- `[R-TURN-3]` During its phase a side activates its ready units one at a time, in any order. An activation is: an optional **move** and then exactly one **action**: Attack, Stratagem, Sway or Wait. After the action the unit is **done** for this phase.
- `[R-TURN-4]` A unit may undo its move if it has not acted yet.
- `[R-TURN-5]` **Facing.** A move leaves the unit facing the direction of its last step. Attack and Stratagem turn the unit toward its (primary) target. **Wait** takes an explicit facing. "Toward" means the cardinal direction with the larger |Δ|; on a tie, the horizontal one.
- `[R-TURN-6]` The side may end its phase at any time; remaining ready units simply do nothing. `endPhase` is always a legal action.
- `[R-TURN-7]` End of round: fire resolves (§6), then wind updates (§6), then the round counter increases and the turn limit is checked.

## 4. Movement
- `[R-MOVE-1]` A unit moves orthogonally, spending terrain move cost per tile entered, up to its Move value. Tiles adjacent to an enemy are a **zone of control**: entering one ends movement.
- `[R-MOVE-2]` Entering a burning tile costs +2 and is allowed; the unit will take fire damage at the end of the round.

## 5. Attacks
- `[R-ATK-1]` **Facing arc.** Take the vector from the defender to the attacker and compare it with the defender's facing. If the attacker is in front of the defender's line (a positive dot product, and |dot| ≥ |cross|), the arc is **front**. If the attacker is behind it (a negative dot product, and |dot| ≥ |cross|), the arc is **rear**. Otherwise the arc is **side**. Multiplier: front ×1.00, side ×1.25, rear ×1.50.
- `[R-ATK-2]` **Damage formula** (normal attack):
  ```
  base    = 150 + attackerTroops × 0.08
  stat    = (100 + attacker.war) / (100 + defender.lead)
  dmg     = base × stat × arc × matchup × terrainDef(defender tile) × height × variance
  variance = uniform in [0.90, 1.10] from the seeded RNG
  result  = round to nearest 10, minimum 10, capped at defender troops
  ```
- `[R-ATK-3]` **Counterattack.** If the defender survives a melee attack and is not archers and not confused, and the attacker is in its front or side arc, it strikes back. The counter uses the same formula with roles swapped, using the defender's remaining troops, with arc ×1.00, then ×0.5. Archers' ranged attacks are never countered.
- `[R-ATK-4]` A surviving, non-confused defender of a melee attack turns to face the attacker after any counter.
- `[R-ATK-5]` The preview (`query.attackPreview`) shows the min–max damage and counter range, the arc, and every multiplier. The client shows these engine numbers only (see `00-architecture.md`).

## 6. Fire and wind
- `[R-FIRE-1]` A burning tile has `burn = 2` rounds left. Only tiles with flammability > 0 can ignite.
- `[R-FIRE-2]` At the end of each round, in this order: (a) every unit on a burning tile loses 10% of its max troops (forest ×1.5), rounded to 10, and is confused with 50% chance. (b) Spread: each tile that was burning at the start of this step tries to ignite neighbours (below). (c) Every previously burning tile loses 1 `burn`; at 0 it becomes **ash**.
- `[R-FIRE-3]` Spread chance to a neighbour = wind factor × that neighbour's flammability:
  - calm: 0.15 to each of the 4 neighbours;
  - breeze: 0.60 to the downwind neighbour only;
  - gale: 1.00 to the downwind neighbour, and 0.30 to each of the two neighbours perpendicular to the wind.
  Tiles ignited by spread start with `burn = 2` and do not spread again in the same step.
- `[R-WIND-1]` Wind has a direction (the direction it blows **toward**) and a strength (calm, breeze or gale). A battle defines a wind schedule: `[{round, dir, strength}]`. The current wind and the next scheduled change are open information and always shown.

## 7. Stratagems and chains
- `[R-STRAT-1]` A stratagem has: `id`, `name`, `tag` (one of **Strike, Charge, Volley, Fire, Shout, Ruse, Command**), `cost` (Qi), `range {min,max}`, `area` (`single`, `cross` = target plus its 4 neighbours, `sweep` = target plus the two tiles beside it perpendicular to the caster→target direction, `adjacent` = every tile adjacent to the caster), `power` (damage multiplier, or 0), `stat` (`war` or `int`), optional `effect` (`confuse` with a chance formula, `ignite`, `heal`, `dash`), and `follows: tag[]`, the tags it can chain after.
- `[R-STRAT-2]` **Damage.** Stratagem damage uses the attack formula with `base × power`, and `stat = (100 + caster[stat]) / (100 + defender.lead)`. Strike and Charge also apply the facing arc and height; Volley applies height only; Fire, Ruse and Shout apply neither. Stratagems are never countered.
- `[R-STRAT-3]` **Foresight.** A Ruse- or Fire-tagged stratagem aimed at a unit whose officer's Intellect is higher than the caster's can be seen through. The chance is `min(60, 2 × (target.int − caster.int))`%, rolled per target. A unit that sees through takes no damage or effect from that link.
- `[R-STRAT-4]` **Confuse.** A confused unit cannot act, cannot counterattack and cannot turn to face. Chance for Shout and Ruse = `clamp(40 + caster.war (or int for Ruse) − target.lead, 10, 90)`%. Confusion lasts until the end of the confused unit's next phase.
- `[R-STRAT-5]` **Ignite.** The tile hit is set burning if flammable, after the damage.
- `[R-STRAT-6]` **Dash** (Charge): the target must be in a straight orthogonal line from the caster, 2–3 tiles away, with a clear path that is not forest. The caster moves to the tile adjacent to the target, then strikes.
- `[R-CHAIN-1]` **Linked stratagems.** After any stratagem link hits at least one enemy (damage or a status), the engine looks for the next link. A **candidate** is an allied unit that is on the board, not yet in this chain, and not confused. It must have a stratagem S with `S.follows` containing the previous link's tag, Qi ≥ S.cost, and, from where it stands right now without moving, a legal target that is an enemy hit by the previous link and still on the board. Ready and done units can both link; linking does not use the unit's action.
- `[R-CHAIN-2]` **Choosing the link.** Among the candidates, pick the one with the highest expected damage on the best target. Ties go to the closest unit (Manhattan distance), then the lowest unit id. The unit uses its first stratagem in list order that qualifies.
- `[R-CHAIN-3]` A chain is at most 4 links (the opener plus 3). Link *k* (opener *k* = 0) deals ×(1 + 0.2k).
- `[R-CHAIN-4]` **Bonds.** If a link's officer has a bond with the previous link's officer, that link gets ×1.15 and +1 max range for finding its target.
- `[R-CHAIN-5]` The player may exclude units from a chain when issuing the opener (`excludeFromChain`). The preview (`query.stratagemPreview`) shows the planned chain assuming every link hits. The real chain is recomputed link by link, because a target may be routed or see through.
- `[R-CHAIN-6]` Command-tag stratagems (e.g. Rally) target allies, never open a chain and never link.

## 8. Sway
- `[R-SWAY-1]` Action: target an enemy unit within 2 tiles whose officer has non-null Loyalty and is not a commander. Each officer may try each target once per battle.
- `[R-SWAY-2]` Chance = `clamp(caster.cha − target.loyalty + 40 × (1 − troops/maxTroops) + (target confused ? 10 : 0), 5, 90)`%.
- `[R-SWAY-3]` On success the unit joins the caster's side at once. It is done for this phase and keeps its troops, Qi and facing.

## 9. Victory
- `[R-WIN-1]` A side wins when the enemy commander is routed or every enemy unit is gone.
- `[R-WIN-2]` If the battle's turn limit passes (the end of round N) without a winner, the battle's `onTimeout` side wins (in Daxing Hill, the rebels).

## 10. Randomness
- `[R-RNG-1]` Every random draw comes from the engine's seeded RNG in a fixed order. The same seed and action list always reproduce the same battle.
