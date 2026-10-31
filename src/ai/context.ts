// Per-decision context for the utility AI: unit values, the threat map, fire projections, approach fields, and the
// positional score of ending a unit's activation on a tile facing a direction. All values are in "troop points" (TP):
// roughly, one point is one soldier's worth of damage.
import { facingToward, manhattan, type BattleState, type Facing, type Pos, type Unit } from '../engine'
import { deriveGoals, wantsEscape, type Behaviour, type Goals } from './goals'
import { projectFire, type FireProjection } from './fireModel'
import {
  baseDamage,
  distanceField,
  exposureAt,
  modesOf,
  movePoints,
  threatsAgainst,
  type Exposure,
  type Mode,
  type Threat,
} from './threat'

export const FACINGS: Facing[] = ['N', 'E', 'S', 'W']

/** Value of winning the battle outright (and, negated, of losing it). */
export const WIN = 20000
/** Base bonus for routing a unit, before its importance multiplier. */
export const ROUT = 220
/** How seriously to take the threat map: the chance an enemy that can strike a tile actually does so. */
export const P_ENGAGE = 0.35
/** How much the damage I could do next phase from a tile counts, relative to damage I might take there. */
export const P_THREATEN = 0.5
/** Cost in TP of one Qi spent (Qi pays for chains later). */
export const QI_VALUE = 9
/** A commander should not stand where expected incoming damage reaches this share of its troops... */
export const COMMANDER_SAFE_FRACTION = 0.35

export interface Ctx {
  state: BattleState
  me: string
  foes: Unit[]
  friends: Unit[]
  goals: Goals
  /** Enemy reach with every unit on the board (used for ordering and cheap screens). */
  threats: Threat[]
  fire: FireProjection
  /** Radius (tiles) beyond which an enemy cannot reach a tile next phase, by enemy index in `threats`. */
  threatRadius: number[]
  /** Per own unit: enemy reach computed with that unit lifted off the board (its own zone of control must not shield it). */
  threatsWithout: Map<string, { threats: Threat[]; radius: number[] }>
  fields: Map<string, Float64Array>
  weights: Map<string, number>
  exposures: Map<string, Exposure>
  myModes: Map<string, Mode[]>
  fireValues: Map<string, number>
}

function radiiOf(threats: Threat[]): number[] {
  return threats.map((t) => {
    let maxRange = 0
    for (const m of t.modes) maxRange = Math.max(maxRange, m.max + (m.hillRange ? 1 : 0))
    let far = 0
    for (const o of t.origins) far = Math.max(far, manhattan(o, t.unit))
    return far + maxRange
  })
}

export function buildCtx(state: BattleState, goalsOverride?: Goals): Ctx {
  const me = state.side
  const goals = goalsOverride ?? deriveGoals(state, me)
  const foes = state.units.filter((u) => u.side !== me)
  const friends = state.units.filter((u) => u.side === me)
  const threats = threatsAgainst(state, foes)
  const threatRadius = radiiOf(threats)
  return {
    state,
    me,
    foes,
    friends,
    goals,
    threats,
    fire: projectFire(state),
    threatRadius,
    threatsWithout: new Map(),
    fields: new Map(),
    weights: new Map(),
    exposures: new Map(),
    myModes: new Map(),
    fireValues: new Map(),
  }
}

// ------------------------------------------------------------------ unit values

function officerPower(state: BattleState, u: Unit): number {
  const o = state.data.officers[u.officer]
  return o ? 0.85 + (0.3 * (o.war + o.int)) / 200 : 1
}

/** Importance multiplier of a unit: commanders and unit named by an objective count double. */
export function weight(ctx: Ctx, u: Unit): number {
  const hit = ctx.weights.get(u.id)
  if (hit !== undefined) return hit
  const mine = u.side === ctx.me
  const key = u.commander || (mine ? ctx.goals.protect.has(u.id) : ctx.goals.routWins.has(u.id))
  const w = officerPower(ctx.state, u) * (key ? 2 : 1) * (!mine && ctx.goals.focus.has(u.id) ? 1.5 : 1)
  ctx.weights.set(u.id, w)
  return w
}

/** What one action by this unit is worth (used to price confusion and a wasted turn). */
export function actionValue(ctx: Ctx, u: Unit): number {
  return (150 + 0.08 * u.troops) * weight(ctx, u)
}

export function routValue(ctx: Ctx, u: Unit): number {
  const mine = u.side === ctx.me
  const decisive = mine ? ctx.goals.protect.has(u.id) : ctx.goals.routWins.has(u.id)
  return ROUT * weight(ctx, u) + (decisive ? WIN : 0)
}

/** Probability that damage in [min, max] (uniform-ish) routs a target with `troops`. */
export function routChance(min: number, max: number, troops: number): number {
  if (min >= troops) return 1
  if (max < troops) return 0
  if (max <= min) return 1
  return Math.max(0, Math.min(1, (max - troops + 10) / (max - min + 10)))
}

// ------------------------------------------------------------------ tiles, fire, exposure

export function tileIndex(ctx: Ctx, p: Pos): number {
  return p.y * ctx.state.grid.width + p.x
}

function tileTerrain(ctx: Ctx, p: Pos) {
  return ctx.state.data.terrain[ctx.state.grid.tiles[tileIndex(ctx, p)]!.terrain]
}

/** Damage a unit takes per end-of-round fire step on this tile [R-FIRE-2a]. */
export function fireDamageAt(ctx: Ctx, u: Unit, p: Pos): number {
  const forest = ctx.state.grid.tiles[tileIndex(ctx, p)]!.terrain === 'forest'
  const raw = u.maxTroops * 0.1 * (forest ? 1.5 : 1)
  return Math.min(u.troops, Math.max(10, Math.round(raw / 10) * 10))
}

/** Expected loss (TP) of a unit standing on `p` for the fire projection `proj`. */
export function fireLoss(ctx: Ctx, u: Unit, p: Pos, proj: FireProjection): number {
  const ev = proj.events[tileIndex(ctx, p)] ?? 0
  if (ev <= 0) return 0
  return ev * (fireDamageAt(ctx, u, p) + 0.5 * 0.8 * actionValue(ctx, u)) * weight(ctx, u)
}

export function exposure(ctx: Ctx, u: Unit, p: Pos): Exposure {
  const key = `${u.id}@${p.x},${p.y}`
  const hit = ctx.exposures.get(key)
  if (hit) return hit
  const e = exposureAtFast(ctx, u, p)
  ctx.exposures.set(key, e)
  return e
}

function exposureAtFast(ctx: Ctx, u: Unit, p: Pos): Exposure {
  let set = ctx.threatsWithout.get(u.id)
  if (!set) {
    const lifted: BattleState = { ...ctx.state, units: ctx.state.units.filter((x) => x.id !== u.id) }
    const threats = threatsAgainst(lifted, ctx.foes)
    set = { threats, radius: radiiOf(threats) }
    ctx.threatsWithout.set(u.id, set)
  }
  const near: Threat[] = []
  for (let i = 0; i < set.threats.length; i++) {
    const t = set.threats[i]!
    if (manhattan(t.unit, p) <= set.radius[i]!) near.push(t)
  }
  return exposureAt(ctx.state, near, u, p)
}

/** Damage I could threaten from `p` next phase: best single target plus a share of the rest. */
export function threatenFrom(ctx: Ctx, u: Unit, p: Pos): number {
  let modes = ctx.myModes.get(u.id)
  if (!modes) {
    modes = modesOf(ctx.state, u, Math.min(10, u.qi + 2))
    ctx.myModes.set(u.id, modes)
  }
  let maxRange = 0
  for (const m of modes) maxRange = Math.max(maxRange, m.max + (m.hillRange ? 1 : 0))
  const reach = movePoints(u.type) + maxRange
  let top = 0
  let rest = 0
  for (const f of ctx.foes) {
    if (manhattan(f, p) > reach) continue
    let best = 0
    for (const m of modes) {
      const v = baseDamage(ctx.state, u, p, m, f, f) * 1.12
      if (v > best) best = v
    }
    let val = Math.min(best, f.troops) * weight(ctx, f)
    // Being in position to finish a decisive unit is worth walking toward.
    if (ctx.goals.routWins.has(f.id)) val += Math.pow(Math.min(1, best / Math.max(1, f.troops)), 2) * 3000
    if (val > top) {
      rest += top
      top = val
    } else rest += val
  }
  return top + 0.3 * rest
}

// ------------------------------------------------------------------ approach

/** The tiles a unit is drawn toward, with a weight, according to its behaviour and the goals. */
function approachSources(ctx: Ctx, u: Unit, beh: Behaviour): { key: string; sources: Pos[]; weight: number } | null {
  const g = ctx.goals
  if (wantsEscape(g, u.id) && g.escape && g.escape.tiles.length > 0) {
    return { key: 'escape', sources: g.escape.tiles, weight: 1.6 }
  }
  switch (beh.kind) {
    case 'hold':
      return null
    case 'ambush': {
      const r = beh.range ?? 3
      const alerted = u.troops < u.maxTroops || ctx.foes.some((f) => manhattan(f, u) <= r)
      return alerted ? { key: 'foes', sources: ctx.foes, weight: 1 } : null
    }
    case 'guard': {
      const s = beh.tile ?? (beh.unit ? ctx.state.units.find((x) => x.id === beh.unit) : undefined)
      if (!s) return null
      return { key: `guard:${s.x},${s.y}`, sources: [{ x: s.x, y: s.y }], weight: 0.8 }
    }
    case 'pursue': {
      const s = ctx.state.units.find((x) => x.id === beh.unit)
      if (!s) return { key: 'foes', sources: ctx.foes, weight: 1 }
      return { key: `pursue:${s.id}`, sources: [{ x: s.x, y: s.y }], weight: 1.2 }
    }
    default: {
      if (g.pullTiles.length > 0 && ctx.foes.length === 0) {
        return { key: 'pull', sources: g.pullTiles, weight: 1 }
      }
      // Pull toward the objective unit (enemy commander) as well as the nearest foe.
      const prime = ctx.foes.filter((f) => g.routWins.has(f.id))
      if (prime.length > 0 && !g.routAll) return { key: 'prime', sources: prime, weight: 1 }
      return { key: 'foes', sources: ctx.foes, weight: 1 }
    }
  }
}

function field(ctx: Ctx, u: Unit, key: string, sources: Pos[]): Float64Array {
  const k = `${u.type}|${key}|${sources.map((s) => `${s.x},${s.y}`).join(';')}`
  const hit = ctx.fields.get(k)
  if (hit) return hit
  const f = distanceField(ctx.state, u.type, sources)
  ctx.fields.set(k, f)
  return f
}

export const ADVANCE_WEIGHT = 10

/** Approach term of a tile for a unit (negative = far from where it wants to be). */
export function approachScore(ctx: Ctx, u: Unit, p: Pos): number {
  const beh = ctx.goals.behaviour(u)
  const src = approachSources(ctx, u, beh)
  let s = 0
  if (src && src.sources.length > 0) {
    const f = field(ctx, u, src.key, src.sources)
    let d = f[tileIndex(ctx, p)]!
    if (!Number.isFinite(d)) d = 40
    // Ranged units want to stand a couple of tiles short of the enemy rather than on it.
    if (u.type === 'archers' && src.key !== 'escape') d = Math.max(0, d - 2)
    const urgent = ctx.goals.urgency
    const wAdv = ADVANCE_WEIGHT * (0.4 + 1.6 * urgent) * src.weight * (u.commander && ctx.friends.length > 1 ? 0.1 : 1)
    s -= wAdv * d
  }
  // Objective tiles (hold / deny) pull a little even when foes are around.
  for (const t of ctx.goals.pullTiles) s += (4 / (1 + manhattan(p, t))) * t.weight
  return s
}

// ------------------------------------------------------------------ position score

export interface PosScore {
  value: number
  incoming: number
}

/** The value of ending an activation with `u` standing on `p` facing `f` (next-phase exposure, fire, terrain, progress). */
export function posScore(ctx: Ctx, u: Unit, p: Pos, f: Facing): PosScore {
  const w = weight(ctx, u)
  const ex = exposure(ctx, u, p)
  const incoming = ex.byFacing[f]
  let v = 0
  // The more a side needs a result, the less it fears the threat map.
  const pEng = P_ENGAGE * (1 - 0.7 * ctx.goals.urgency)
  v -= pEng * w * incoming
  v -= pEng * 0.4 * ex.confusion * actionValue(ctx, u)
  const riskOfRout = Math.max(0, Math.min(1, (incoming / Math.max(1, u.troops) - 0.7) / 0.6))
  v -= riskOfRout * routValue(ctx, u) * pEng
  v -= fireLoss(ctx, u, p, ctx.fire)
  v += P_THREATEN * threatenFrom(ctx, u, p)
  v += approachScore(ctx, u, p)
  const t = tileTerrain(ctx, p)
  v += (1 - t.def) * 30 + t.elev * 5
  if (t.id === 'village' && u.troops < u.maxTroops) v += Math.min(0.05 * u.maxTroops, u.maxTroops - u.troops) * 0.8
  // A commander keeps its army around it.
  if (u.commander) {
    let screen = 0
    for (const f of ctx.friends) if (f.id !== u.id && manhattan(f, p) <= 2) screen++
    v += 10 * Math.min(3, screen)
  }
  // Commander safety: a hard-ish constraint on standing where a third of the army can be lost in one phase.
  if (u.commander) {
    const frac = incoming / Math.max(1, u.troops)
    if (frac >= COMMANDER_SAFE_FRACTION) v -= 600 + 5000 * (frac - COMMANDER_SAFE_FRACTION)
  }
  return { value: v, incoming }
}

/** Facing that minimises exposure on `p`, ties toward the nearest enemy. */
export function bestFacing(ctx: Ctx, u: Unit, p: Pos): Facing {
  const ex = exposure(ctx, u, p)
  let near: Unit | undefined
  let nd = Infinity
  for (const f of ctx.foes) {
    const d = manhattan(f, p)
    if (d < nd) {
      nd = d
      near = f
    }
  }
  const toward = near ? facingToward(p, near) : u.facing
  let best: Facing = toward
  let bv = ex.byFacing[toward]
  for (const f of FACINGS) {
    const v = ex.byFacing[f]
    if (v < bv - 1) {
      bv = v
      best = f
    }
  }
  return best
}

// ------------------------------------------------------------------ fire value of an ignition

/** Net TP value of lighting `tiles` now: enemy units burnt minus our own, over the projected horizon. */
export function ignitionValue(ctx: Ctx, tiles: Pos[]): number {
  const key = tiles.map((t) => `${t.x},${t.y}`).join(';')
  const hit = ctx.fireValues.get(key)
  if (hit !== undefined) return hit
  const proj = projectFire(ctx.state, tiles)
  let v = 0
  for (const u of ctx.state.units) {
    const p = { x: u.x, y: u.y }
    const delta = fireLoss(ctx, u, p, proj) - fireLoss(ctx, u, p, ctx.fire)
    // We can walk our own people out of the fire; the enemy might too, but is less likely to.
    v += u.side === ctx.me ? -delta * 0.6 : delta * 0.85
  }
  ctx.fireValues.set(key, v)
  return v
}

