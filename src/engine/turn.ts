// [R-TURN-1..7] phases, rounds, end-of-round order.
import { PLAYER_SIDE } from '../data/types'
import { canStandOn, round10, terrainAt, unitAt } from './board'
import { resolveFire } from './fire'
import { objectiveStatuses } from './objectives'
import { gainQi, healUnit, unitFromDef } from './ops'
import type { Roller } from './rng'
import { fireTimeline, nearestFreeTile } from './terrain'
import { actAiGuests, holdAiGuests } from './guests'
import type { BattleState, GameEvent, Wind } from './types'
import { concludeIfWon } from './victory'

export const QI_PER_PHASE = 2
export const VILLAGE_HEAL_PCT = 0.05
export const REINFORCEMENT_QI = 4

/** [R2-REIN-1] Units due this round for the side whose phase is starting arrive ready to act with Qi 4. */
export function spawnReinforcements(w: BattleState, ev: GameEvent[]): void {
  const due = w.reinforcements.filter((r) => r.round === w.round && r.side === w.side)
  if (due.length === 0) return
  w.reinforcements = w.reinforcements.filter((r) => !due.includes(r))
  for (const r of due) {
    r.units.forEach((d, i) => {
      const e = r.entry[Math.min(i, r.entry.length - 1)]!
      let at = { x: e[0], y: e[1] }
      if (unitAt(w, at.x, at.y) || !canStandOn(w, at.x, at.y, d.side, d.type)) {
        const free = nearestFreeTile(w, { ...at, side: d.side, type: d.type }, at)
        if (!free) {
          w.defeated.push(d.id)
          return
        }
        at = free
      }
      const u = unitFromDef({ ...d, x: at.x, y: at.y })
      u.qi = REINFORCEMENT_QI
      // [RL-MOD-1] a run's start-Qi bonus for a late-arriving deployed officer
      const bonus = r.qiBonus?.[u.id]
      if (bonus) gainQi(u, bonus)
      w.units.push(u)
      ev.push({
        kind: 'reinforced',
        unit: u.id,
        officer: u.officer,
        side: u.side,
        type: u.type,
        x: u.x,
        y: u.y,
        facing: u.facing,
        troops: u.troops,
        maxTroops: u.maxTroops,
        commander: u.commander,
        round: w.round,
      })
    })
  }
}

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
  spawnReinforcements(w, ev)
  holdAiGuests(w)
}

/** Wind at the start of a new round: overrides hold until their expiry or the next schedule entry. */
export function windAtRoundStart(w: BattleState, round: number): Wind {
  const scheduled = (): Wind => {
    let cur: Wind = { dir: null, strength: 'calm' }
    for (const e of w.windSchedule) if (e.round <= round) cur = { dir: e.dir, strength: e.strength }
    return cur
  }
  if (w.windUntil !== null) {
    if (round >= w.windUntil) {
      w.windUntil = null
      return scheduled()
    }
    return { ...w.wind }
  }
  if (w.windSchedule.some((e) => e.round === round)) return scheduled()
  return { ...w.wind }
}

function emitProgress(w: BattleState, ev: GameEvent[]): void {
  if (!w.objectives) return
  for (const s of objectiveStatuses(w)) {
    if (s.current === null || s.target === null) continue
    ev.push({ kind: 'objectiveProgress', side: s.side, index: s.index, text: s.text, current: s.current, target: s.target })
  }
}

/** [R2-OBJ-1] Progress lines for the HUD tracker (also used after an escape). */
export { emitProgress }

/** [R-TURN-6/7] End the current phase; may roll over the round. */
export function endPhase(w: BattleState, ev: GameEvent[], roller: Roller): void {
  // [R2-GUEST-2] AI-moved guests act after the player's units, before anyone recovers.
  if (w.side === PLAYER_SIDE && w.units.some((u) => u.guestControl === 'ai')) {
    actAiGuests(w, ev, roller)
    if (w.result) return
  }
  for (const u of w.units) {
    if (u.side !== w.side) continue
    if (u.confused) {
      u.confused = false
      ev.push({ kind: 'recovered', unit: u.id })
    }
    if (u.provoked !== undefined) delete u.provoked
    if (u.buffs && u.buffs.length > 0) {
      const keep = u.buffs.filter((b) => b.until > w.round)
      for (const b of u.buffs) if (b.until <= w.round) ev.push({ kind: 'buffExpired', unit: u.id, strat: b.id, stat: b.stat })
      if (keep.length > 0) u.buffs = keep
      else delete u.buffs
    }
    u.moved = false
    u.done = false
    u.undo = null
  }
  if (w.objectives && w.side !== PLAYER_SIDE && concludeIfWon(w, ev, 'enemyPhaseEnd')) return
  if (w.phaseIndex + 1 < w.sideOrder.length) {
    w.phaseIndex += 1
    w.side = w.sideOrder[w.phaseIndex]!
    startPhase(w, ev)
    return
  }
  // end of round: fire, timeline, objectives, wind, round counter, turn limit
  resolveFire(w, ev, roller)
  if (concludeIfWon(w, ev)) return
  fireTimeline(w, ev, w.round, 'end')
  if (concludeIfWon(w, ev)) return
  emitProgress(w, ev)
  if (concludeIfWon(w, ev, 'roundEnd')) return
  if (w.round >= w.turnLimit) {
    w.result = { winner: w.onTimeout, reason: 'timeout' }
    ev.push({ kind: 'battleEnded', winner: w.onTimeout, reason: 'timeout' })
    return
  }
  w.round += 1
  w.phaseIndex = 0
  w.side = w.sideOrder[0]!
  ev.push({ kind: 'roundStarted', round: w.round })
  const nw = windAtRoundStart(w, w.round)
  if (nw.dir !== w.wind.dir || nw.strength !== w.wind.strength) {
    w.wind = nw
    ev.push({ kind: 'windChanged', dir: nw.dir, strength: nw.strength, round: w.round })
  }
  fireTimeline(w, ev, w.round, 'start')
  if (concludeIfWon(w, ev)) return
  startPhase(w, ev)
}
