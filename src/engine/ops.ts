// Mutating helpers. They operate only on a working copy created by cloneWork().
import { round10 } from './board'
import type { UnitDef } from '../data/types'
import type { BattleState, DamageSource, Facing, GameEvent, Unit } from './types'

export const QI_MAX = 10

/** A fresh unit from its definition (Qi 0, ready). */
export function unitFromDef(d: UnitDef): Unit {
  const u: Unit = {
    id: d.id,
    officer: d.officer,
    side: d.side,
    type: d.type,
    x: d.x,
    y: d.y,
    facing: d.facing,
    troops: d.troops,
    maxTroops: d.maxTroops ?? d.troops,
    qi: 0,
    commander: d.commander,
    confused: false,
    moved: false,
    done: false,
    undo: null,
  }
  if (d.retreatAt !== undefined) u.retreatAt = d.retreatAt
  if (d.guestControl === 'ai') u.guestControl = 'ai'
  return u
}

export function gainQi(u: Unit, n: number): void {
  u.qi = Math.max(0, Math.min(QI_MAX, u.qi + n))
}

export function turnUnit(ev: GameEvent[], u: Unit, to: Facing): void {
  if (u.facing === to) return
  ev.push({ kind: 'turned', unit: u.id, from: u.facing, to })
  u.facing = to
}

/** [R2-STRAT-3] A provoke ends when its provoker leaves the board (routed, retreated or escaped). */
export function dropProvokesBy(w: BattleState, id: string): void {
  for (const x of w.units) if (x.provoked === id) delete x.provoked
}

export function removeUnit(w: BattleState, ev: GameEvent[], u: Unit, by?: string): void {
  w.units = w.units.filter((x) => x.id !== u.id)
  dropProvokesBy(w, u.id)
  w.defeated.push(u.id)
  const e: GameEvent = { kind: 'routed', unit: u.id, side: u.side }
  if (by !== undefined) e.by = by
  ev.push(e)
}

/** [R2-OBJ-2] The unit leaves the board without being routed. */
export function retreatUnit(w: BattleState, ev: GameEvent[], u: Unit, by?: string): void {
  w.units = w.units.filter((x) => x.id !== u.id)
  dropProvokesBy(w, u.id)
  w.retreated.push(u.id)
  const e: GameEvent = { kind: 'retreated', unit: u.id, side: u.side, x: u.x, y: u.y }
  if (by !== undefined) e.by = by
  ev.push(e)
}

/** Reduce troops by `amount` (already capped by the caller or capped here). Returns true if the unit was routed. */
export function applyDamage(
  w: BattleState,
  ev: GameEvent[],
  target: Unit,
  amount: number,
  source: DamageSource,
  by?: string,
  strat?: string,
  link?: number,
): boolean {
  const dealt = Math.min(target.troops, amount)
  const before = target.troops
  target.troops = before - dealt
  const e: GameEvent = { kind: 'damaged', unit: target.id, amount: dealt, troopsBefore: before, troopsAfter: target.troops, source }
  if (by !== undefined) e.by = by
  if (strat !== undefined) e.strat = strat
  if (link !== undefined) e.link = link
  ev.push(e)
  if (target.troops <= 0) {
    removeUnit(w, ev, target, by)
    return true
  }
  // [R2-OBJ-2] retreat after the damage that caused it
  if (target.retreatAt !== undefined && target.troops <= target.retreatAt * target.maxTroops) {
    retreatUnit(w, ev, target, by)
    return true
  }
  return false
}

export function healUnit(
  ev: GameEvent[],
  u: Unit,
  amount: number,
  source: 'village' | 'rally',
  by?: string,
): number {
  const gain = Math.min(u.maxTroops - u.troops, round10(amount))
  if (gain <= 0) return 0
  u.troops += gain
  const e: GameEvent = { kind: 'healed', unit: u.id, amount: gain, source }
  if (by !== undefined) e.by = by
  ev.push(e)
  return gain
}
