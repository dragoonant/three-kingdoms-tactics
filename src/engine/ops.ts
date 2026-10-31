// Mutating helpers. They operate only on a working copy created by cloneWork().
import { round10 } from './board'
import type { BattleState, DamageSource, Facing, GameEvent, Unit } from './types'

export const QI_MAX = 10

export function gainQi(u: Unit, n: number): void {
  u.qi = Math.max(0, Math.min(QI_MAX, u.qi + n))
}

export function turnUnit(ev: GameEvent[], u: Unit, to: Facing): void {
  if (u.facing === to) return
  ev.push({ kind: 'turned', unit: u.id, from: u.facing, to })
  u.facing = to
}

export function removeUnit(w: BattleState, ev: GameEvent[], u: Unit, by?: string): void {
  w.units = w.units.filter((x) => x.id !== u.id)
  w.defeated.push(u.id)
  const e: GameEvent = { kind: 'routed', unit: u.id, side: u.side }
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
