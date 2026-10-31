import { PLAYER_SIDE } from '../data/types'
import { getUnit, officerOf, unitAt } from './board'
import { attackTargets } from './combat'
import { FACINGS, manhattan } from './geometry'
import { moveOptions } from './movement'
import { isExitTile } from './objectives'
import { evalLink, legalAnchors } from './stratagems'
import { swayTargets } from './sway'
import type { Action, BattleState, Unit } from './types'

/** Every action `u` could take now, ignoring provocation. Per-unit order: move/undo, attack, stratagem, sway, escape, wait. */
function unitActions(state: BattleState, u: Unit): Action[] {
  const out: Action[] = []
  if (!u.moved) for (const m of moveOptions(state, u)) out.push({ type: 'move', unit: u.id, x: m.x, y: m.y })
  else if (u.undo && !unitAt(state, u.undo.x, u.undo.y)) out.push({ type: 'undoMove', unit: u.id })
  for (const t of attackTargets(state, u)) out.push({ type: 'attack', unit: u.id, target: t.id })
  for (const sid of officerOf(state, u).stratagems) {
    const s = state.data.stratagems[sid]
    if (!s || u.qi < s.cost) continue
    for (const a of legalAnchors(state, u, s)) out.push({ type: 'stratagem', unit: u.id, strat: s.id, x: a.x, y: a.y, excludeFromChain: [] })
  }
  for (const t of swayTargets(state, u)) out.push({ type: 'sway', unit: u.id, target: t.id })
  if (u.side === PLAYER_SIDE && isExitTile(state, u.x, u.y)) out.push({ type: 'escape', unit: u.id })
  for (const f of FACINGS) out.push({ type: 'wait', unit: u.id, facing: f })
  return out
}

/** [R2-STRAT-3] Does the action attack the provoker, or (before moving) move toward it? */
function complies(state: BattleState, u: Unit, provoker: Unit, a: Action): boolean {
  switch (a.type) {
    case 'attack':
      return a.target === provoker.id
    case 'stratagem': {
      const s = state.data.stratagems[a.strat]
      if (!s || s.tag === 'Command') return false
      return evalLink(state, u, s, { x: a.x, y: a.y }, 0, false).targets.some((t) => t.unit.id === provoker.id)
    }
    case 'move':
      return manhattan({ x: a.x, y: a.y }, provoker) < manhattan(u, provoker)
    default:
      return false
  }
}

/**
 * Legal actions of one unit. A provoked unit may only attack the provoker or move toward it; when it cannot do either
 * it is unrestricted, except that a unit which has already moved may only wait.
 */
export function legalActionsFor(state: BattleState, u: Unit): Action[] {
  const all = unitActions(state, u)
  if (u.provoked === undefined) return all
  const provoker = getUnit(state, u.provoked)
  if (!provoker || provoker.side === u.side) return all
  const ok = all.filter((a) => complies(state, u, provoker, a))
  if (ok.length > 0) return ok
  return u.moved ? all.filter((a) => a.type === 'wait') : all
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'move':
      return b.type === 'move' && a.unit === b.unit && a.x === b.x && a.y === b.y
    case 'attack':
    case 'sway':
      return (b.type === 'attack' || b.type === 'sway') && a.unit === b.unit && a.target === b.target
    case 'stratagem':
      return b.type === 'stratagem' && a.unit === b.unit && a.strat === b.strat && a.x === b.x && a.y === b.y
    case 'wait':
      return b.type === 'wait' && a.unit === b.unit && a.facing === b.facing
    case 'undoMove':
    case 'escape':
      return a.unit === (b as { unit: string }).unit
    case 'endPhase':
      return true
  }
}

/** Every action the side to move may take. Never empty while there is no result: endPhase is always last. */
export function legalActions(state: BattleState): Action[] {
  if (state.result) return []
  const out: Action[] = []
  for (const u of state.units) {
    if (u.side !== state.side || u.done || u.confused) continue
    out.push(...legalActionsFor(state, u))
  }
  out.push({ type: 'endPhase' })
  return out
}
