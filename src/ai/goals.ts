// The AI's view of "what are we trying to do". This is the ONE adapter between the utility AI and the rules data.
//
// Today (engine v1) the answer is fixed: rout the enemy commander, protect ours, and (for the side that does not win
// on timeout) press on as the turn limit nears. The engine v2 spec (docs/spec/13-engine-v2.md) adds objectives,
// enemy behaviour hints, escape actions and side ids as data. This file reads those as OPTIONAL, loosely typed
// fields, so it compiles and behaves sensibly today and lights up the moment the engine starts providing them:
//
//   state.objectives          { win: Cond[], lose: Cond[] }   evaluated for the player side (R2-OBJ-1)
//   state.playerSide          string, default 'han'            (R2-SIDE-1)
//   state.enemyBehaviour      { [unitId]: 'advance' | 'hold' | 'guard:<id|x,y>' | 'ambush:<n>' | 'pursue:<id>' }
//     (also looked up at state.battle.enemyBehaviour and state.data.battles[battleId].enemyBehaviour)
//   legalActions() containing { type: 'escape', unit }        (R2-OBJ-1 escape)
//
// Nothing else in src/ai reads those fields. To wire a new objective kind, change only this file.
import type { BattleState, Pos, Unit } from '../engine'

type Loose = Record<string, unknown>

export type BehaviourKind = 'advance' | 'hold' | 'guard' | 'ambush' | 'pursue'

export interface Behaviour {
  kind: BehaviourKind
  /** ambush radius, or guard leash. */
  range?: number
  /** guard/pursue target unit. */
  unit?: string
  /** guard target tile. */
  tile?: Pos
}

export interface PullTile extends Pos {
  weight: number
}

export interface Goals {
  side: string
  playerSide: string
  /** This side wins when the turn limit passes (so it can afford to be patient). */
  holdsOnTimeout: boolean
  /** 0..1: how badly this side must force a result. Scales approach weight and relaxes caution. */
  urgency: number
  /** Enemy unit ids whose rout wins the battle for us. */
  routWins: Set<string>
  /** Every enemy must go (routAll). */
  routAll: boolean
  /** Our unit ids whose rout loses the battle for us. */
  protect: Set<string>
  /** Enemy unit ids worth extra effort (e.g. units trying to escape). */
  focus: Set<string>
  /** Tiles our units are drawn toward (hold / deny / escape exits). */
  pullTiles: PullTile[]
  /** Escape objective (our units should reach the exit tiles and use the escape action). */
  escape: { units: string[] | null; count: number; tiles: Pos[] } | null
  /** Round by which we must have survived (survive objective), if any. */
  surviveRound: number | null
  behaviour(unit: Unit): Behaviour
  /** Human-readable summary (debugging and tests). */
  notes: string[]
}

interface Cond {
  type: string
  units?: string[]
  unit?: string
  tiles?: Pos[]
  round?: number
  count?: number
}

function asCond(c: unknown): Cond | null {
  if (typeof c !== 'object' || c === null) return null
  const r = c as Loose
  const type = typeof r.type === 'string' ? r.type : typeof r.kind === 'string' ? r.kind : null
  if (!type) return null
  const out: Cond = { type }
  if (Array.isArray(r.units)) out.units = r.units.filter((x): x is string => typeof x === 'string')
  if (typeof r.unit === 'string') out.unit = r.unit
  if (Array.isArray(r.tiles)) out.tiles = r.tiles.map(asPos).filter((p): p is Pos => p !== null)
  if (typeof r.round === 'number') out.round = r.round
  if (typeof r.count === 'number') out.count = r.count
  return out
}

function asPos(p: unknown): Pos | null {
  if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') return { x: p[0], y: p[1] }
  if (typeof p === 'object' && p !== null) {
    const r = p as Loose
    if (typeof r.x === 'number' && typeof r.y === 'number') return { x: r.x, y: r.y }
  }
  return null
}

function condList(v: unknown): Cond[] {
  return Array.isArray(v) ? v.map(asCond).filter((c): c is Cond => c !== null) : []
}

export function playerSideOf(state: BattleState): string {
  const p = (state as unknown as Loose).playerSide
  return typeof p === 'string' ? p : 'han'
}

function behaviourTable(state: BattleState): Record<string, string> | null {
  const s = state as unknown as Loose
  const dataBattles = ((state.data as unknown as Loose | undefined)?.battles ?? null) as Loose | null
  const cands: unknown[] = [
    s.enemyBehaviour,
    (s.battle as Loose | undefined)?.enemyBehaviour,
    (dataBattles?.[state.battleId] as Loose | undefined)?.enemyBehaviour,
  ]
  for (const c of cands) if (typeof c === 'object' && c !== null) return c as Record<string, string>
  return null
}

/** Parse a hint string such as 'ambush:3', 'guard:liu-bei', 'guard:4,5', 'pursue:zhao-yun'. Unknown strings advance. */
export function parseBehaviour(hint: unknown): Behaviour {
  if (typeof hint !== 'string') return { kind: 'advance' }
  const [head, ...rest] = hint.split(':')
  const arg = rest.join(':')
  switch (head) {
    case 'hold':
      return { kind: 'hold' }
    case 'ambush': {
      const n = Number(arg)
      return { kind: 'ambush', range: Number.isFinite(n) && n > 0 ? n : 3 }
    }
    case 'pursue':
      return arg ? { kind: 'pursue', unit: arg } : { kind: 'advance' }
    case 'guard': {
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(arg)
      if (m) return { kind: 'guard', tile: { x: Number(m[1]), y: Number(m[2]) }, range: 2 }
      return arg ? { kind: 'guard', unit: arg, range: 2 } : { kind: 'hold' }
    }
    default:
      return { kind: 'advance' }
  }
}

export function deriveGoals(state: BattleState, side: string = state.side): Goals {
  const playerSide = playerSideOf(state)
  const isPlayer = side === playerSide
  const routWins = new Set<string>()
  const protect = new Set<string>()
  const focus = new Set<string>()
  const pullTiles: PullTile[] = []
  const notes: string[] = []
  let routAll = false
  let escape: Goals['escape'] = null
  let surviveRound: number | null = null
  let timeoutIsMine = state.onTimeout === side
  let deadlineRound: number | null = null

  const obj = (state as unknown as Loose).objectives as Loose | undefined
  const win = condList(obj?.win)
  const lose = condList(obj?.lose)
  const hasObjectives = win.length > 0 || lose.length > 0
  const mine = (u: Unit): boolean => u.side === side
  const enemyUnits = state.units.filter((u) => !mine(u))
  const ownUnits = state.units.filter(mine)

  // The default lose condition is always "our commander is routed", and the default win is the enemy commander.
  for (const u of ownUnits) if (u.commander) protect.add(u.id)
  const wantsEnemyCommander = !hasObjectives || win.some((c) => c.type === 'routCommander')
  if (wantsEnemyCommander || !isPlayer) for (const u of enemyUnits) if (u.commander) routWins.add(u.id)
  if (!hasObjectives) notes.push('default: rout the enemy commander, protect ours')

  // Conditions are written from the player's point of view. A bot on the player side pursues `win` and avoids
  // `lose`; a bot on the other side pursues `lose` (the player failing) and avoids `win`.
  for (const c of win) {
    switch (c.type) {
      case 'routCommander':
        if (!isPlayer) for (const u of ownUnits) if (u.commander) protect.add(u.id)
        break
      case 'routAll':
        if (isPlayer) routAll = true
        break
      case 'routUnits':
        for (const id of c.units ?? []) (isPlayer ? routWins : protect).add(id)
        break
      case 'survive':
        if (isPlayer && c.round !== undefined) surviveRound = c.round
        else if (c.round !== undefined) deadlineRound = c.round
        break
      case 'hold':
        for (const t of c.tiles ?? []) pullTiles.push({ ...t, weight: 1 })
        if (c.round !== undefined && !isPlayer) deadlineRound = c.round
        break
      case 'escape': {
        const tiles = c.tiles ?? []
        if (isPlayer) escape = { units: c.units ?? null, count: c.count ?? 1, tiles }
        else for (const id of c.units ?? []) focus.add(id)
        if (!isPlayer && c.units === undefined) for (const u of enemyUnits) focus.add(u.id)
        break
      }
      default:
        break
    }
    notes.push(`win:${c.type}`)
  }
  for (const c of lose) {
    switch (c.type) {
      case 'commanderLost':
        if (!isPlayer) for (const u of state.units) if (u.side === playerSide && u.commander) routWins.add(u.id)
        break
      case 'unitLost':
        if (c.unit) (isPlayer ? protect : routWins).add(c.unit)
        break
      case 'timeout':
        if (c.round !== undefined) {
          if (isPlayer) deadlineRound = c.round
          else timeoutIsMine = true
        }
        break
      case 'hold':
        for (const t of c.tiles ?? []) pullTiles.push({ ...t, weight: isPlayer ? 0.6 : 1 })
        break
      default:
        break
    }
    notes.push(`lose:${c.type}`)
  }

  const table = behaviourTable(state)
  const turnLimit = Math.max(1, deadlineRound ?? state.turnLimit)
  const progress = Math.min(1, state.round / turnLimit)
  let urgency = timeoutIsMine ? 0.15 : Math.min(1, 0.3 + 0.9 * progress)
  if (surviveRound !== null) urgency = Math.min(urgency, 0.1)
  if (!isPlayer && deadlineRound !== null) urgency = Math.max(urgency, 0.7)
  if (escape) urgency = Math.max(urgency, 0.6)

  return {
    side,
    playerSide,
    holdsOnTimeout: timeoutIsMine,
    urgency,
    routWins,
    routAll,
    protect,
    focus,
    pullTiles,
    escape,
    surviveRound,
    // Behaviour hints are about enemy units only; the player's own units always advance.
    behaviour: (u) => (isPlayer || !table ? { kind: 'advance' } : parseBehaviour(table[u.id])),
    notes,
  }
}

/** The unit id of an { type: 'escape', unit } action (engine v2), or null for any other action. */
export function escapeActionUnit(a: unknown): string | null {
  if (typeof a !== 'object' || a === null) return null
  const r = a as Loose
  return r.type === 'escape' && typeof r.unit === 'string' ? r.unit : null
}

/** Whether using the escape action with `unitId` serves one of our goals. */
export function wantsEscape(goals: Goals, unitId: string): boolean {
  return !!goals.escape && (goals.escape.units === null || goals.escape.units.includes(unitId))
}
