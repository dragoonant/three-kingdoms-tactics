// [R2-OBJ-1] objective conditions, evaluated for the player side. Pure.
import { PLAYER_SIDE } from '../data/types'
import type { BattleResult, BattleState, Cond, ObjectiveStatus } from './types'

/** When a check runs: after any action ('action'), when the enemy's phase ends, or at the end of a round. */
export type CheckPoint = 'action' | 'enemyPhaseEnd' | 'roundEnd'

export function enemySide(w: Pick<BattleState, 'sideOrder'>): string {
  return w.sideOrder.find((s) => s !== PLAYER_SIDE) ?? w.sideOrder[w.sideOrder.length - 1]!
}

const gone = (w: BattleState, id: string): boolean => w.defeated.includes(id) || w.retreated.includes(id)

function nameOf(w: BattleState, id: string): string {
  return w.units.find((u) => u.id === id) ? (w.data.officers[w.units.find((u) => u.id === id)!.officer]?.name ?? id) : (w.data.officers[id]?.name ?? id)
}

/** Exit tiles of every escape condition in the win list. */
export function exitTiles(w: BattleState): [number, number][] {
  const out: [number, number][] = []
  for (const c of w.objectives?.win ?? []) if (c.type === 'escape') for (const t of c.tiles) out.push(t)
  return out
}

export function isExitTile(w: BattleState, x: number, y: number): boolean {
  return exitTiles(w).some(([ex, ey]) => ex === x && ey === y)
}

function enemyOnTiles(w: BattleState, tiles: [number, number][]): boolean {
  const e = enemySide(w)
  return w.units.some((u) => u.side === e && tiles.some(([x, y]) => u.x === x && u.y === y))
}

/** Is the condition met right now (as `where` it is evaluated)? `inLose` selects the lose variant of `hold`. */
export function condMet(w: BattleState, c: Cond, where: CheckPoint, inLose: boolean): boolean {
  switch (c.type) {
    case 'routCommander': {
      const id = w.commanders[enemySide(w)]
      return id !== undefined && gone(w, id)
    }
    case 'routAll':
      return !w.units.some((u) => u.side === enemySide(w))
    case 'routUnits':
      return c.units.every((id) => gone(w, id))
    case 'survive':
      return where === 'roundEnd' && w.round >= c.round
    case 'timeout':
      return where === 'roundEnd' && w.round >= c.round
    case 'hold':
      if (inLose) return where === 'enemyPhaseEnd' && w.round >= (c.round ?? 1) && enemyOnTiles(w, c.tiles)
      return where === 'roundEnd' && w.round >= (c.round ?? w.turnLimit) && !enemyOnTiles(w, c.tiles)
    case 'escape':
      return w.escaped.length >= c.count && (c.units ?? []).every((id) => w.escaped.includes(id))
    case 'commanderLost': {
      const id = w.commanders[PLAYER_SIDE]
      return id !== undefined && gone(w, id)
    }
    case 'unitLost':
      return gone(w, c.unit)
  }
}

const REASON: Record<Cond['type'], BattleResult['reason']> = {
  routCommander: 'commander',
  routAll: 'annihilation',
  routUnits: 'objective',
  survive: 'objective',
  hold: 'objective',
  escape: 'objective',
  commanderLost: 'commander',
  unitLost: 'objective',
  timeout: 'timeout',
}

/** Lose conditions are checked first; the default lose list is [commanderLost]. */
export function loseConds(w: BattleState): Cond[] {
  const l = w.objectives?.lose ?? []
  return l.length > 0 ? l : [{ type: 'commanderLost' }]
}

export function decideByObjectives(w: BattleState, where: CheckPoint): BattleResult | null {
  if (!w.objectives) return null
  const foe = enemySide(w)
  for (const c of loseConds(w)) if (condMet(w, c, where, true)) return { winner: foe, reason: REASON[c.type] }
  for (const c of w.objectives.win) if (condMet(w, c, where, false)) return { winner: PLAYER_SIDE, reason: REASON[c.type] }
  return null
}

// ------------------------------------------------------------------ query.objectives

interface Described {
  text: string
  current: number | null
  target: number | null
}

function describe(w: BattleState, c: Cond, inLose: boolean): Described {
  const lab = (d: string): string => c.label ?? d
  switch (c.type) {
    case 'routCommander': {
      const id = w.commanders[enemySide(w)]
      return { text: `${lab('Rout the enemy commander')}${id ? ` (${nameOf(w, id)})` : ''}`, current: null, target: null }
    }
    case 'routAll': {
      const left = w.units.filter((u) => u.side === enemySide(w)).length
      return { text: `${lab('Rout every enemy unit')}: ${left} remain`, current: null, target: null }
    }
    case 'routUnits': {
      const k = c.units.filter((id) => gone(w, id)).length
      return { text: `${lab(`Rout ${c.units.map((id) => nameOf(w, id)).join(', ')}`)}: ${k} / ${c.units.length}`, current: k, target: c.units.length }
    }
    case 'survive':
      return { text: `${lab('Survive')}: round ${Math.min(w.round, c.round)} / ${c.round}`, current: Math.min(w.round, c.round), target: c.round }
    case 'timeout':
      return { text: `${lab('Time limit')}: round ${Math.min(w.round, c.round)} / ${c.round}`, current: Math.min(w.round, c.round), target: c.round }
    case 'hold': {
      if (inLose) return { text: lab('Do not let the enemy take the position'), current: null, target: null }
      const r = c.round ?? w.turnLimit
      return { text: `${lab('Hold the position')}: round ${Math.min(w.round, r)} / ${r}`, current: Math.min(w.round, r), target: r }
    }
    case 'escape': {
      const k = Math.min(w.escaped.length, c.count)
      const must = (c.units ?? []).map((id) => nameOf(w, id))
      const tail = must.length ? ` (${must.join(', ')} must escape)` : ''
      return { text: `${c.label ? `${c.label}: ` : ''}Escaped ${k} / ${c.count}${tail}`, current: k, target: c.count }
    }
    case 'commanderLost': {
      const id = w.commanders[PLAYER_SIDE]
      return { text: lab(`${id ? nameOf(w, id) : 'The commander'} must not fall`), current: null, target: null }
    }
    case 'unitLost':
      return { text: lab(`${nameOf(w, c.unit)} must not fall`), current: null, target: null }
  }
}

function legacyObjectives(w: BattleState): { win: Cond[]; lose: Cond[] } {
  return { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'timeout', round: w.turnLimit }] }
}

export function objectiveStatuses(w: BattleState): ObjectiveStatus[] {
  const o = w.objectives ?? legacyObjectives(w)
  const lose = w.objectives ? loseConds(w) : o.lose
  const out: ObjectiveStatus[] = []
  o.win.forEach((c, index) => {
    const d = describe(w, c, false)
    out.push({ side: 'win', index, cond: c, ...d, met: w.result ? w.result.winner === PLAYER_SIDE : false })
  })
  lose.forEach((c, index) => {
    const d = describe(w, c, true)
    out.push({ side: 'lose', index, cond: c, ...d, met: false })
  })
  return out
}
