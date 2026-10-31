// [R-UNIT-5], [R-WIN-1], [R-WIN-2], [R2-OBJ-1]
import { decideByObjectives, type CheckPoint } from './objectives'
import type { BattleResult, BattleState, GameEvent } from './types'

/** Decide the result from the units on the board (not the turn limit). Old rules; used when a battle has no objectives. */
export function decideWinner(w: BattleState): BattleResult | null {
  const lacking = w.sideOrder.filter((s) => !w.units.some((u) => u.side === s && u.commander))
  if (lacking.length >= 2) return { winner: w.onTimeout, reason: 'commander' }
  if (lacking.length === 1) return { winner: w.sideOrder.find((s) => s !== lacking[0])!, reason: 'commander' }
  const empty = w.sideOrder.filter((s) => !w.units.some((u) => u.side === s))
  if (empty.length === 1) return { winner: w.sideOrder.find((s) => s !== empty[0])!, reason: 'annihilation' }
  return null
}

/** Sets state.result and emits battleEnded if a side has won. Returns true when the battle is over. */
export function concludeIfWon(w: BattleState, ev: GameEvent[], where: CheckPoint = 'action'): boolean {
  if (w.result) return true
  const r = w.objectives ? decideByObjectives(w, where) : decideWinner(w)
  if (!r) return false
  w.result = r
  ev.push({ kind: 'battleEnded', winner: r.winner, reason: r.reason })
  return true
}
