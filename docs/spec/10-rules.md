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

## 11. Roguelike run rules (RL-) — design, not yet implemented (RL1)
These rules govern a run of "Roads to War" (`15-roguelike.md`), between battles. Era 1's numbers are in `docs/spec/data/era1-stops.json` and `16-roguelike-era1.md`; the paper sim (`tools/roguelike/paper-sim.mjs`) follows them. Constants are per era (`rules` in the era data); the values below are era 1's. The run layer (`src/run/`) will be pure and deterministic like the engine; battle modifiers become engine rules with these ids.

**The run**
- `[RL-RUN-1]` A run is one era. It starts with the era's start state (era 1: 50 rice, 1,500 soldiers, 0 wounded, Renown 30, day 0, Liu Bei, Guan Yu and Zhang Fei at level 3) and a run seed. The run state holds rice, healthy soldiers, wounded soldiers, Renown, day, flags, the band (each officer's level, XP, cap bonus, hurt and wounded marks) and the seed.
- `[RL-RUN-2]` A run ends **won** when the finale is won; it ends **lost** when a battle is lost (`RL-END-1`), when Liu Bei is routed (`RL-END-2`) or when the army scatters (`RL-SCATTER-1`). Every ended run is written to the Annals.

**Road**
- `[RL-ROAD-1]` The road is drawn once from the run seed: a fixed first tier, anchor tiers, mid tiers and a late tier from the era's template, two lanes per tier, then the finale. Era 1 draws a short road (7 stops) or a long road (8 stops) with equal chance.
- `[RL-ROAD-2]` Each tier's stops come from that tier's pool, each stop at most once a run. Aftermath stops never appear on the road; a battle's win opens them.
- `[RL-ROAD-3]` A node connects to the same lane in the next tier, and to the other lane with chance 1/2. A single-node tier connects to every node of the next tier; the last tier connects to the finale.
- `[RL-ROAD-4]` Every connection has a length in days (era 1: 1, 2 or 3 days with weights 2, 5, 3; the last leg 2 days). Travelling a leg passes that many days.
- `[RL-ROAD-5]` A mountain path joins a node to the same lane two tiers on. It takes its own days (era 1: 2), costs a share of the healthy soldiers (era 1: 5%, split as `RL-LOSS-1`), skips the stop between and cannot be force-marched.
- `[RL-ROAD-6]` Every mid tier holds at least one stop with a battle choice, so every path offers battles before the finale. The road shows the next two tiers: each stop's title and marks (battle, town or village, market, camp) and every leg's days; a stop's choices are read on arrival.

**Rice, upkeep and scattering**
- `[RL-UPKEEP-1]` Each day passed costs ⌈(healthy + wounded) ÷ 500⌉ bags. Days pass on legs, on choices that cost days, on rests and on battles.
- `[RL-UPKEEP-2]` "Rice lasts N days" = ⌊rice ÷ today's daily upkeep⌋. The road HUD, every choice slip and the deploy screen show it (after the choice or the battle where relevant).
- `[RL-SCATTER-1]` If a day's upkeep cannot be paid, or rice reaches 0 by any cost, the army scatters and the run is lost.
- `[RL-HUNGER-1]` A battle is fought **hungry** if, after its rice cost is paid, the rice lasts fewer than 3 days. Every officer then starts that battle at 0 Qi (the opening +2 of `R-UNIT-4` is not given, and every other start-Qi modifier is ignored).

**The soldier pool and deploy**
- `[RL-POOL-1]` The army is one pool of healthy and wounded soldiers. Only healthy soldiers can be fielded.
- `[RL-POOL-2]` An officer's command cap = 20 × Leadership + 100 × level, rounded down to 50, plus cap bonuses from stops; halved (rounded down to 50, minimum 250) while he is hurt (`RL-FALL-2`).
- `[RL-POOL-3]` Soldiers join the healthy pool from choices, volunteers (`RL-REN-3`) and markets (`RL-POOL-5`). Recruited officers bring no soldiers of their own unless the choice says so.
- `[RL-POOL-4]` Between stops, and before deploying, the player may send any number of healthy or wounded soldiers home. They leave the run for good; nothing else changes.
- `[RL-POOL-5]` At a stop tagged market, after the choice, rice buys paid levies: 100 healthy soldiers per 5 bags, priced through `RL-REN-2`, up to 500 a stop.
- `[RL-DEPLOY-1]` Liu Bei is always deployed. The player fills the battle's other deploy slots from the band; a fallen officer cannot deploy.
- `[RL-DEPLOY-2]` Each deployed officer is given 250 to his command cap healthy soldiers, in steps of 50; the total cannot exceed the healthy pool. These are his unit's troops (and max troops) in the battle. Guests' troops never come from the pool.
- `[RL-DEPLOY-3]` A battle costs ⌈fielded ÷ 250⌉ bags, paid when the deploy is sealed. A deployment that would leave 0 rice is refused.
- `[RL-DEPLOY-4]` A battle takes 1 day (its upkeep is paid after the battle).

**Losses and officers**
- `[RL-LOSS-1]` After a battle, for each deployed unit, lost = fielded − troops left (all of them if routed). Half the lost, rounded to the nearest 10, are killed; the rest become wounded. Survivors return to the healthy pool. Losses from stops, marches and paths are split the same way unless the effect says "all killed".
- `[RL-LOSS-2]` Wounded soldiers return to the healthy pool only through a rest (`RL-REST-1`, `RL-REST-2`) or an effect that says so.
- `[RL-FALL-1]` A non-commander officer routed in a won battle gets the **wounded** mark for the rest of the run and is hurt; if he already had the mark, he **falls** and leaves the band. With Iron Oath on, the first rout is a fall.
- `[RL-FALL-2]` A **hurt** officer has half his command cap until a full rest (`RL-REST-1`). A stop can hurt an officer without a rout; that does not give the wounded mark.
- `[RL-END-1]` Losing any battle ends the run.
- `[RL-END-2]` Liu Bei routed loses the battle at once (`R-UNIT-5`), and so ends the run.
- `[RL-XP-1]` Officers gain XP and levels from each battle's log as in the campaign (`xpFromLog`, `12-campaign.md` §3); a level raises the command cap by 100.

**Rest and the march**
- `[RL-REST-1]` A **rest** choice at a stop: all wounded return, hurt officers recover, tiredness clears, and the choice's own effects (days, Qi) apply.
- `[RL-REST-2]` **Make camp**, between stops: 2 days; half the wounded (rounded down to 10) return and tiredness clears; hurt officers stay hurt.
- `[RL-MARCH-1]` A **forced march** on a leg of L ≥ 2 days takes ⌈L ÷ 2⌉ days and costs 3% of the healthy soldiers per day saved (split as `RL-LOSS-1`); the band arrives tired.
- `[RL-MARCH-2]` A **tired** band's units have −1 move in round 1 of their next battle. Tiredness clears after a battle, a rest, or a leg marched at the normal pace (a stop that makes the band tired lasts through the next leg).

**Renown (0–100)**
- `[RL-REN-1]` Renown changes only by the amounts printed on choices and is clamped to 0–100.
- `[RL-REN-2]` **Rice and Renown.** There is no gold: rice is the price of things. At Renown 50+, a town or village stop brings a gift of ⌊Renown ÷ 5⌋ bags after the choice (not when the choice turns on the people: "no volunteers"), rice gained from a trade is ×1.25 (rounded), and market prices are ×0.8. Under 20, rice gained from a trade is ×0.5 and market prices are ×2. Elsewhere ×1.
- `[RL-REN-3]` **Volunteers.** At a town or village stop, after the choice, Renown × 10 healthy soldiers join (Renown after the choice), unless the choice says "no volunteers"; a choice may scale this or grant it at another stop.
- `[RL-REN-4]` **Battle spirit.** Every officer's starting Qi is +2 at Renown 70+, +1 at 40+, −1 under 20 (never below 0). Under 20, each rest (`RL-REST-1`, `RL-REST-2`) also loses 5% of the healthy soldiers to desertion.
- `[RL-REN-5]` **Recruit thresholds.** Some recruits need Renown at least a value at the moment of the choice (era 1: Zhou Cang 40, Liao Hua 55). Below it the choice says so and gives its other branch.
- `[RL-REN-6]` **Sway.** Liu Bei's sway chance (`R-SWAY-2`) gets + ⌊(Renown − 30) ÷ 10⌋ percentage points (−3 to +7), before the clamp.
- `[RL-REN-7]` **Finales** read Renown through the finale's own table (era 1: §6 of `16-roguelike-era1.md`).

**Calendar, echoes, gambles, choices**
- `[RL-CAL-1]` The finale's setup depends on the arrival day through the finale's day table (era 1: brackets at days 12, 16, 20, 24, 28). The briefing names the bracket and its effects.
- `[RL-ECHO-1]` A **hidden echo** is a flag set by a choice without being shown. When it pays off (a later stop's condition, a battle, or the finale) its cause is named in full.
- `[RL-ECHO-2]` A **stated** flag is printed on its choice with its payoff. The finale briefing lists every flag, day and Renown effect with its cause before deploy.
- `[RL-GAMBLE-1]` A gamble prints its odds and both outcomes. It is resolved by one draw from the run's seeded RNG.
- `[RL-RNG-1]` Every run draw comes from sfc32 seeded (like `R-RNG-1`) from the run seed, the purpose (road or fate) and the stop index, so the same seed always draws the same road and a choice never shifts the draws of later stops. A battle's own seed is derived the same way.
- `[RL-CHOICE-1]` Every choice slip prints its exact effects in rice, soldiers, wounded, days, Renown, recruits, Qi and stated flags, and the "rice lasts N days" after it.
- `[RL-CHOICE-2]` A choice whose rice cost exceeds the rice held is shown greyed with the reason and cannot be sealed. A stop always offers at least one sealable choice; if none can be paid, the army scatters.
