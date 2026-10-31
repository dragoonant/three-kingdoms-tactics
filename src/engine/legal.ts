import { officerOf, unitAt } from './board'
import { attackTargets } from './combat'
import { FACINGS } from './geometry'
import { moveOptions } from './movement'
import { legalAnchors } from './stratagems'
import { swayTargets } from './sway'
import type { Action, BattleState } from './types'

/** Every action the side to move may take. Never empty while there is no result: endPhase is always last. */
export function legalActions(state: BattleState): Action[] {
  if (state.result) return []
  const out: Action[] = []
  for (const u of state.units) {
    if (u.side !== state.side || u.done || u.confused) continue
    if (!u.moved) for (const m of moveOptions(state, u)) out.push({ type: 'move', unit: u.id, x: m.x, y: m.y })
    else if (u.undo && !unitAt(state, u.undo.x, u.undo.y)) out.push({ type: 'undoMove', unit: u.id })
    for (const t of attackTargets(state, u)) out.push({ type: 'attack', unit: u.id, target: t.id })
    for (const sid of officerOf(state, u).stratagems) {
      const s = state.data.stratagems[sid]
      if (!s || u.qi < s.cost) continue
      for (const a of legalAnchors(state, u, s)) out.push({ type: 'stratagem', unit: u.id, strat: s.id, x: a.x, y: a.y, excludeFromChain: [] })
    }
    for (const t of swayTargets(state, u)) out.push({ type: 'sway', unit: u.id, target: t.id })
    for (const f of FACINGS) out.push({ type: 'wait', unit: u.id, facing: f })
  }
  out.push({ type: 'endPhase' })
  return out
}
