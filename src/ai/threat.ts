// Enemy threat model and distance fields. These are HEURISTICS for the AI only: the numbers the player sees still
// come from query.*; the AI uses query.* previews for its own actions and this lighter estimator only for what the
// other side might do next phase (it cannot ask the engine for a preview of a move it has not been given yet).
// The rule constants (damage formula, arcs, move points) are imported from the engine, never copied here.
import { arcOf, manhattan, query, statOf, terrainCostFor, type BattleState, type Facing, type Pos, type TroopType, type Unit } from '../engine'
import { BASE_DAMAGE, BASE_PER_TROOP, HEIGHT_DOWN, HEIGHT_UP, MATCHUP_MULT, STRONG_AGAINST } from '../engine/damage'
import { ARC_MULT, FACINGS } from '../engine/geometry'
import { TROOP_MOVE } from '../engine/movement'

export interface Mode {
  min: number
  max: number
  power: number
  stat: 'war' | 'int'
  arc: boolean
  height: boolean
  /** Archers' normal attack gains +1 range on a hill. */
  hillRange: boolean
  /** Odds this mode confuses its target (0..1). */
  confuse: number
}

export interface Threat {
  unit: Unit
  origins: Pos[]
  modes: Mode[]
}

function terrainOf(state: BattleState, p: Pos) {
  return state.data.terrain[state.grid.tiles[p.y * state.grid.width + p.x]!.terrain]
}

/** What `u` could do to a target next phase: its normal attack and every damaging stratagem it can afford. */
export function modesOf(state: BattleState, u: Unit, qi: number): Mode[] {
  const modes: Mode[] = [
    u.type === 'archers'
      ? { min: 2, max: 3, power: 1, stat: 'war', arc: true, height: true, hillRange: true, confuse: 0 }
      : { min: 1, max: 1, power: 1, stat: 'war', arc: true, height: true, hillRange: false, confuse: 0 },
  ]
  const off = state.data.officers[u.officer]
  if (!off) return modes
  for (const sid of off.stratagems) {
    const s = state.data.stratagems[sid]
    if (!s || s.tag === 'Command' || qi < s.cost || s.power <= 0) continue
    const adjacent = s.area === 'adjacent'
    modes.push({
      min: adjacent ? 1 : Math.max(1, s.range.min),
      max: adjacent ? 1 : s.range.max,
      // Chains make stratagem damage worth more than its face value; a modest uplift stands in for that.
      power: s.power * 1.1,
      stat: s.stat ?? 'war',
      arc: s.tag === 'Strike' || s.tag === 'Charge',
      height: s.tag === 'Strike' || s.tag === 'Charge' || s.tag === 'Volley',
      hillRange: false,
      confuse: s.effect?.type === 'confuse' ? 0.5 : 0,
    })
  }
  return modes
}

/** Damage before the arc multiplier (expected variance 1.0), capped at the defender's troops. */
export function baseDamage(
  state: BattleState,
  att: Unit,
  from: Pos,
  mode: Mode,
  def: Unit,
  at: Pos,
): number {
  if (!state.data.officers[att.officer] || !state.data.officers[def.officer]) return 0
  let v = (BASE_DAMAGE + att.troops * BASE_PER_TROOP) * mode.power * ((100 + statOf(state, att, mode.stat)) / (100 + statOf(state, def, 'lead')))
  if (STRONG_AGAINST[att.type] === def.type) v *= MATCHUP_MULT
  const dt = terrainOf(state, at)
  v *= dt.def
  if (mode.height) {
    const ea = terrainOf(state, from).elev
    if (ea > dt.elev) v *= HEIGHT_UP
    else if (ea < dt.elev) v *= HEIGHT_DOWN
  }
  return v
}

export function threatsAgainst(state: BattleState, foes: Unit[]): Threat[] {
  const out: Threat[] = []
  for (const f of foes) {
    if (f.confused) continue
    const origins: Pos[] = [{ x: f.x, y: f.y }]
    for (const m of query.moveRange(state, f.id)) origins.push({ x: m.x, y: m.y })
    out.push({ unit: f, origins, modes: modesOf(state, f, Math.min(10, f.qi + 2)) })
  }
  return out
}

export interface Exposure {
  /** Expected damage (at variance 1.0) if every enemy that can reach the tile strikes it, by the unit's facing. */
  byFacing: Record<Facing, number>
  /** Number of distinct enemies able to strike the tile. */
  attackers: number
  /** Chance-weighted confusion pressure (sum of per-enemy confuse odds). */
  confusion: number
}

/** Pessimistic next-phase exposure of `def` standing on `pos`. */
export function exposureAt(state: BattleState, threats: Threat[], def: Unit, pos: Pos): Exposure {
  const byFacing: Record<Facing, number> = { N: 0, E: 0, S: 0, W: 0 }
  let attackers = 0
  let confusion = 0
  for (const t of threats) {
    const best: Record<Facing, number> = { N: 0, E: 0, S: 0, W: 0 }
    let any = false
    let conf = 0
    for (const mode of t.modes) {
      const hill = mode.hillRange
      for (const o of t.origins) {
        if (o.x === pos.x && o.y === pos.y) continue
        const d = manhattan(o, pos)
        const max = mode.max + (hill && terrainOf(state, o).id === 'hill' ? 1 : 0)
        if (d < mode.min || d > max) continue
        any = true
        if (mode.confuse > conf) conf = mode.confuse
        const base = baseDamage(state, t.unit, o, mode, def, pos)
        if (!mode.arc) {
          for (const f of FACINGS) if (base > best[f]) best[f] = base
        } else {
          for (const f of FACINGS) {
            const v = base * ARC_MULT[arcOf({ x: pos.x, y: pos.y, facing: f }, o)]
            if (v > best[f]) best[f] = v
          }
        }
      }
    }
    if (!any) continue
    attackers++
    confusion += conf
    for (const f of FACINGS) byFacing[f] += Math.min(def.troops, best[f])
  }
  return { byFacing, attackers, confusion }
}

// ------------------------------------------------------------------ distance fields

/** Terrain move cost for a troop type, or Infinity when impassable. Tolerates richer v2 terrain data. */
function enterCost(state: BattleState, i: number, type: TroopType, side: string): number {
  const c = terrainCostFor(state, state.data.terrain[state.grid.tiles[i]!.terrain], side, type)
  return c === null ? Infinity : c
}

/**
 * Movement-cost distance from every tile to the nearest source (a multi-source Dijkstra run backwards from the
 * sources). Rivers are routed around, so the approach logic finds the bridge and the fords.
 */
export function distanceField(state: BattleState, type: TroopType, sources: readonly Pos[], side: string): Float64Array {
  const { width: w, height: h } = state.grid
  const n = w * h
  const dist = new Float64Array(n).fill(Infinity)
  const done = new Uint8Array(n)
  const frontier: number[] = []
  for (const s of sources) {
    if (s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) continue
    const i = s.y * w + s.x
    dist[i] = 0
    frontier.push(i)
  }
  while (frontier.length > 0) {
    let bi = 0
    for (let k = 1; k < frontier.length; k++) if (dist[frontier[k]!]! < dist[frontier[bi]!]!) bi = k
    const cur = frontier[bi]!
    frontier[bi] = frontier[frontier.length - 1]!
    frontier.pop()
    if (done[cur]) continue
    done[cur] = 1
    const cx = cur % w
    const cy = Math.floor(cur / w)
    // Stepping from a neighbour onto `cur` costs cur's entry cost; a source tile (an enemy's) is entered at its own cost.
    const step = Math.min(enterCost(state, cur, type, side), 4)
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (done[ni]) continue
      if (!Number.isFinite(enterCost(state, ni, type, side))) continue
      const nd = dist[cur]! + step
      if (nd < dist[ni]!) {
        dist[ni] = nd
        frontier.push(ni)
      }
    }
  }
  return dist
}

export function movePoints(type: TroopType): number {
  return TROOP_MOVE[type]
}
