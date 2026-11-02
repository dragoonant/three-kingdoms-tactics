// The AI's view of "what are we trying to do". This is the ONE adapter between the utility AI and the rules data
// (engine v2: docs/spec/13-engine-v2.md). Everything the other AI files need to know about objectives, enemy
// behaviour hints and side ids comes out of deriveGoals().
//
// Objectives are written from the player's point of view (R2-OBJ-1: the enemy has no list of its own, the player
// failing is the enemy winning). A bot on the player side pursues `win` and avoids `lose`; a bot on any other side
// pursues the mirror image:
//
//   win  routCommander / routUnits   player: rout those units            other side: protect them
//   win  routAll                     player: leave nothing standing       other side: stay alive
//   win  survive {round}             player: play for time and safety      other side: hurry, must win before it
//   win  hold {tiles, round}         player: keep enemies OFF the tiles    other side: STAND on a tile at the end of it
//   win  escape {units?, count, tiles}  player: walk designated units to the exits and use the escape action
//                                       other side: catch the escapers and block the exits
//   lose commanderLost / unitLost    player: protect the unit              other side: rout it
//   lose timeout {round}             player: hurry                         other side: play for time
//   lose hold {tiles, round?}        player: never let an enemy end its phase on a tile     other side: do exactly that
//
// enemyBehaviour hints (advance / hold / guard / ambush / pursue / advance-to / flee) bias what non-player units do; when the side's
// objectives need action late in the battle they stop mattering (see `behaviour`).

import { getBattleDef } from '../data'
import { PLAYER_SIDE } from '../data/types'
import { manhattan, type BattleState, type Cond, type Pos, type Unit } from '../engine'

type Loose = Record<string, unknown>

export type BehaviourKind = 'advance' | 'hold' | 'guard' | 'ambush' | 'pursue' | 'advance-to'

export interface Behaviour {
  kind: BehaviourKind
  /** ambush radius, or guard leash. */
  range?: number
  /** guard/pursue target unit. */
  unit?: string
  /** guard target tile; advance-to destination [R2-BEH-1]. */
  tile?: Pos
  /** advance-to a map edge (the `flee:<edge>` hint) [R2-BEH-1]. */
  edge?: 'west' | 'east' | 'north' | 'south'
  /** The data says so ('advance' / 'pursue' written down), as opposed to no hint at all. */
  explicit?: boolean
}

export interface PullTile extends Pos {
  weight: number
}

/** Tiles a side wants to stand on (`occupy`) or keep clear of enemies (`deny`; the way to do it is to stand on them). */
export interface HoldGoal {
  tiles: Pos[]
  /** First round the goal is live. */
  from: number
  /** The round whose end settles it (null: no end, the goal is live every enemy phase from `from`). */
  to: number | null
  /** The lose/win variant that ends the battle on the spot (standing there at the end of the enemy phase) vs a round-end check. */
  phaseEnd: boolean
}

export interface Goals {
  side: string
  playerSide: string
  isPlayer: boolean
  /** This side wins when the turn limit passes (so it can afford to be patient). */
  holdsOnTimeout: boolean
  /** 0..1: how badly this side must force a result. Scales approach weight and relaxes caution. */
  urgency: number
  /** Enemy unit ids whose rout (or retreat) wins the battle for us. */
  routWins: Set<string>
  /** Every enemy must go (routAll). */
  routAll: boolean
  /** Our unit ids whose rout (or retreat) loses the battle for us. */
  protect: Set<string>
  /** Enemy unit ids worth extra effort (escapers we must catch). */
  focus: Set<string>
  /** Tiles our units are drawn toward (hold / deny / escape exits). Kept for callers that only want a flat list. */
  pullTiles: PullTile[]
  /** Escape objective (our units should reach the exit tiles and use the escape action). */
  escape: { units: string[] | null; count: number; tiles: Pos[] } | null
  /** Our units that should escape: the listed ones still on the board plus the nearest others to make up the count. */
  escapers: Set<string>
  /** Exit tiles of every escape condition (pursuers block them). */
  exits: Pos[]
  /** Round by which we must have survived (survive objective), if any. */
  surviveRound: number | null
  /** Round by which the battle must be settled in the player's favour (timeout / survive), whichever side we are. */
  deadlineRound: number | null
  /** Tiles we want to stand on. */
  occupy: HoldGoal[]
  /** Tiles we must keep enemies off. */
  deny: HoldGoal[]
  /** Plays for time and safety: runs out the clock, or must survive to a round. */
  careful: boolean
  /** Share of the normal pull toward the enemy (patient sides meet it near their own lines; a survivor barely moves). */
  patience: number
  /** Multiplier on how much incoming damage worries us (patient, defending sides are more careful). */
  caution: number
  behaviour(unit: Unit): Behaviour
  /** Human-readable summary (debugging and tests). */
  notes: string[]
}

/** Objective tiles are [x, y] pairs in the data; {x, y} objects (hand-built states) are accepted too. */
const pos = (t: readonly [number, number] | Pos): Pos => (Array.isArray(t) ? { x: t[0], y: t[1] } : { x: (t as Pos).x, y: (t as Pos).y })

export function playerSideOf(_state?: BattleState): string {
  return PLAYER_SIDE
}

/** Enemy-behaviour table of the state (engine v2 stores it at state.enemyBehaviour; {} when the battle has none). */
function behaviourTable(state: BattleState): Record<string, string> | null {
  const t = (state as unknown as Loose).enemyBehaviour
  return typeof t === 'object' && t !== null ? (t as Record<string, string>) : null
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
    // [R2-BEH-1] walk toward a tile, or toward a map edge
    case 'advance-to': {
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(arg)
      return m ? { kind: 'advance-to', tile: { x: Number(m[1]), y: Number(m[2]) } } : { kind: 'advance' }
    }
    case 'flee':
      return arg === 'west' || arg === 'east' || arg === 'north' || arg === 'south' ? { kind: 'advance-to', edge: arg } : { kind: 'advance' }
    case 'guard': {
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(arg)
      if (m) return { kind: 'guard', tile: { x: Number(m[1]), y: Number(m[2]) }, range: 2 }
      return arg ? { kind: 'guard', unit: arg, range: 2 } : { kind: 'hold' }
    }
    default:
      return { kind: 'advance' }
  }
}

// ------------------------------------------------------------------ escape designation

/**
 * The player units that should walk out through the exits: every listed unit still on the board, then the units
 * nearest an exit until the count (less those already out) is covered.
 */
export function designateEscapers(state: BattleState, cond: Extract<Cond, { type: 'escape' }>, side: string = PLAYER_SIDE): Set<string> {
  const out = new Set<string>()
  const mine = state.units.filter((u) => u.side === side)
  const listed = cond.units ?? []
  for (const id of listed) if (mine.some((u) => u.id === id)) out.add(id)
  const already = state.escaped.length
  const need = Math.max(0, cond.count - already - out.size)
  if (need > 0 && cond.tiles.length > 0) {
    const exits = cond.tiles.map(pos)
    const nearest = (u: Unit): number => Math.min(...exits.map((e) => manhattan(e, u)))
    const rest = mine
      .filter((u) => !out.has(u.id))
      .sort((a, b) => nearest(a) - nearest(b) || (a.commander === b.commander ? 0 : a.commander ? 1 : -1) || (a.id < b.id ? -1 : 1))
    for (const u of rest.slice(0, need)) out.add(u.id)
  }
  return out
}

// ------------------------------------------------------------------ ambush tracking

/**
 * Has an `ambush` unit been woken? It wakes when a foe comes within its range, when it has been hurt, or when it is
 * no longer standing where the battle data put it (a sleeper never moves, so that remembers an earlier wake-up).
 */
export function ambushTriggered(state: BattleState, u: Unit, range: number): boolean {
  if (u.troops < u.maxTroops) return true
  if (state.units.some((f) => f.side !== u.side && manhattan(f, u) <= range)) return true
  try {
    const start = getBattleDef(state.battleId)?.units.find((d) => d.id === u.id)
    if (start && (start.x !== u.x || start.y !== u.y)) return true
  } catch {
    /* hand-built battles are not in the registry */
  }
  return false
}

// ------------------------------------------------------------------ derive

export function deriveGoals(state: BattleState, side: string = state.side): Goals {
  const playerSide = playerSideOf(state)
  const isPlayer = side === playerSide
  const routWins = new Set<string>()
  const protect = new Set<string>()
  const focus = new Set<string>()
  const pullTiles: PullTile[] = []
  const occupy: HoldGoal[] = []
  const deny: HoldGoal[] = []
  const notes: string[] = []
  let routAll = false
  let escape: Goals['escape'] = null
  let escapers = new Set<string>()
  let exits: Pos[] = []
  let surviveRound: number | null = null
  let timeoutIsMine = state.onTimeout === side
  let deadlineRound: number | null = null

  const obj = state.objectives
  const win: Cond[] = obj?.win ?? []
  const loseList: Cond[] = obj?.lose ?? []
  const hasObjectives = obj !== null
  const lose: Cond[] = hasObjectives && loseList.length === 0 ? [{ type: 'commanderLost' }] : loseList
  const mine = (u: Unit): boolean => u.side === side
  const enemyUnits = state.units.filter((u) => !mine(u))
  const ownUnits = state.units.filter(mine)

  // Our own commander is always protected; the enemy commander is the default prize.
  for (const u of ownUnits) if (u.commander) protect.add(u.id)
  const wantsEnemyCommander = !hasObjectives || win.some((c) => c.type === 'routCommander')
  if (wantsEnemyCommander || !isPlayer) for (const u of enemyUnits) if (u.commander) routWins.add(u.id)
  if (!hasObjectives) notes.push('default: rout the enemy commander, protect ours')

  const fromRound = (r: number | undefined): number => r ?? 1

  for (const c of win) {
    switch (c.type) {
      case 'routCommander':
        if (!isPlayer) for (const u of ownUnits) if (u.commander) protect.add(u.id)
        break
      case 'routAll':
        if (isPlayer) routAll = true
        break
      case 'routUnits':
        for (const id of c.units) (isPlayer ? routWins : protect).add(id)
        break
      case 'survive':
        if (isPlayer) surviveRound = c.round
        else deadlineRound = deadlineRound === null ? c.round : Math.min(deadlineRound, c.round)
        break
      case 'hold': {
        const tiles = c.tiles.map(pos)
        const goal: HoldGoal = { tiles, from: 1, to: c.round ?? state.turnLimit, phaseEnd: false }
        // The player keeps the tiles clear until the round ends; everyone else wants a unit on one of them by then.
        ;(isPlayer ? deny : occupy).push(goal)
        for (const t of tiles) pullTiles.push({ ...t, weight: 1 })
        if (!isPlayer) deadlineRound = deadlineRound === null ? goal.to! : Math.min(deadlineRound, goal.to!)
        break
      }
      case 'escape': {
        const tiles = c.tiles.map(pos)
        exits = exits.concat(tiles)
        const designated = designateEscapers(state, c)
        if (isPlayer) {
          escape = { units: c.units ?? null, count: c.count, tiles }
          escapers = new Set([...escapers, ...designated])
          for (const t of tiles) pullTiles.push({ ...t, weight: 1.4 })
        } else {
          // Pursuers: catch the escapers, and keep a unit on the way out.
          for (const id of designated) focus.add(id)
          occupy.push({ tiles, from: 1, to: null, phaseEnd: false })
          for (const t of tiles) pullTiles.push({ ...t, weight: 0.5 })
        }
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
        ;(isPlayer ? protect : routWins).add(c.unit)
        break
      case 'timeout':
        if (isPlayer) deadlineRound = deadlineRound === null ? c.round : Math.min(deadlineRound, c.round)
        else timeoutIsMine = true
        break
      case 'hold': {
        const goal: HoldGoal = { tiles: c.tiles.map(pos), from: fromRound(c.round), to: null, phaseEnd: true }
        ;(isPlayer ? deny : occupy).push(goal)
        for (const t of goal.tiles) pullTiles.push({ ...t, weight: isPlayer ? 0.6 : 1 })
        break
      }
      default:
        break
    }
    notes.push(`lose:${c.type}`)
  }
  // routUnits wins name units that may have already gone; only live ones matter.
  const live = new Set(state.units.map((u) => u.id))
  for (const id of [...routWins]) if (!live.has(id) && !state.reinforcements.some((r) => r.units.some((d) => d.id === id))) routWins.delete(id)

  // A side that has to settle things before a round (survive / hold) cannot run out the clock, whatever onTimeout says.
  if (!isPlayer && deadlineRound !== null && deadlineRound <= state.turnLimit) timeoutIsMine = false

  const table = behaviourTable(state)
  const turnLimit = Math.max(1, deadlineRound ?? state.turnLimit)
  const progress = Math.min(1, state.round / turnLimit)
  let urgency = timeoutIsMine ? 0.15 : Math.min(1, 0.3 + 0.9 * progress)
  if (surviveRound !== null) urgency = Math.min(urgency, 0.1)
  if (!isPlayer && deadlineRound !== null) urgency = Math.max(urgency, 0.7)
  if (escape) urgency = Math.max(urgency, 0.6)
  if (!isPlayer && focus.size > 0) urgency = Math.max(urgency, 0.6)
  const careful = timeoutIsMine || surviveRound !== null
  // Hint-driven passivity gives way once the objectives call for action: the side that must force a result is
  // running out of rounds, or a decisive tile goal is live.
  const forcePush = !careful && (progress >= 0.7 || occupy.some((g) => g.phaseEnd && state.round >= g.from - 1))

  return {
    side,
    playerSide,
    isPlayer,
    holdsOnTimeout: timeoutIsMine,
    urgency,
    routWins,
    routAll,
    protect,
    focus,
    pullTiles,
    escape,
    escapers,
    exits,
    surviveRound,
    deadlineRound,
    occupy,
    deny,
    careful,
    patience: surviveRound !== null ? 0.1 : timeoutIsMine ? 0.6 : 1,
    caution: careful ? 1.25 : 1,
    // Behaviour hints are about enemy units only; the player's own units always advance.
    behaviour: (u) => {
      if (isPlayer || !table) return { kind: 'advance' }
      const hint = table[u.id]
      const parsed = parseBehaviour(hint)
      // A written-down 'advance' or 'pursue' is an order to be aggressive: it is not slowed by a patient side's patience.
      const b: Behaviour =
        hint !== undefined && (parsed.kind === 'pursue' || parsed.kind === 'advance-to' || hint === 'advance') ? { ...parsed, explicit: true } : parsed
      if (forcePush && b.kind !== 'advance' && b.kind !== 'pursue' && b.kind !== 'advance-to') return { kind: 'advance' }
      if (b.kind === 'ambush' && ambushTriggered(state, u, b.range ?? 3)) return { kind: 'advance' }
      return b
    },
    notes,
  }
}

/** The unit id of an { type: 'escape', unit } action, or null for any other action. */
export function escapeActionUnit(a: unknown): string | null {
  if (typeof a !== 'object' || a === null) return null
  const r = a as Loose
  return r.type === 'escape' && typeof r.unit === 'string' ? r.unit : null
}

/** Whether using the escape action with `unitId` serves one of our goals. */
export function wantsEscape(goals: Goals, unitId: string): boolean {
  return !!goals.escape && goals.escapers.has(unitId)
}
