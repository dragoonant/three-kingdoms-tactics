// [R-TURN-1..7] phases, rounds, end-of-round order.
import { round10, terrainAt } from './board'
import { resolveFire, windForRound } from './fire'
import { gainQi, healUnit } from './ops'
import type { Roller } from './rng'
import type { BattleState, GameEvent } from './types'
import { concludeIfWon } from './victory'

export const QI_PER_PHASE = 2
export const VILLAGE_HEAL_PCT = 0.05

/** [R-TURN-2] Start of the current side's phase. */
export function startPhase(w: BattleState, ev: GameEvent[]): void {
  for (const u of w.units) {
    if (u.side !== w.side) continue
    gainQi(u, QI_PER_PHASE)
    if (terrainAt(w, u.x, u.y).id === 'village') healUnit(ev, u, round10(u.maxTroops * VILLAGE_HEAL_PCT), 'village')
    u.moved = false
    u.done = false
    u.undo = null
  }
  ev.push({ kind: 'phaseStarted', side: w.side, round: w.round })
}

/** [R-TURN-6/7] End the current phase; may roll over the round. */
export function endPhase(w: BattleState, ev: GameEvent[], roller: Roller): void {
  for (const u of w.units) {
    if (u.side !== w.side) continue
    if (u.confused) {
      u.confused = false
      ev.push({ kind: 'recovered', unit: u.id })
    }
    u.moved = false
    u.done = false
    u.undo = null
  }
  if (w.phaseIndex + 1 < w.sideOrder.length) {
    w.phaseIndex += 1
    w.side = w.sideOrder[w.phaseIndex]!
    startPhase(w, ev)
    return
  }
  // end of round: fire, wind, round counter, turn limit
  resolveFire(w, ev, roller)
  if (concludeIfWon(w, ev)) return
  if (w.round >= w.turnLimit) {
    w.result = { winner: w.onTimeout, reason: 'timeout' }
    ev.push({ kind: 'battleEnded', winner: w.onTimeout, reason: 'timeout' })
    return
  }
  w.round += 1
  w.phaseIndex = 0
  w.side = w.sideOrder[0]!
  ev.push({ kind: 'roundStarted', round: w.round })
  const nw = windForRound(w, w.round)
  if (nw.dir !== w.wind.dir || nw.strength !== w.wind.strength) {
    w.wind = nw
    ev.push({ kind: 'windChanged', dir: nw.dir, strength: nw.strength, round: w.round })
  }
  startPhase(w, ev)
}
