// Per-decision context for the utility AI: unit values, the threat map, fire projections, approach fields, and the
// positional score of ending a unit's activation on a tile facing a direction. All values are in "troop points" (TP):
// roughly, one point is one soldier's worth of damage.
import { facingToward, manhattan, statOf, terrainCostFor, type BattleState, type BuffStat, type Facing, type Pos, type Unit } from '../engine'
import { assignAims, aimBonus, buildAims, type Aim } from './aims'
import { deriveGoals, wantsEscape, type Behaviour, type Goals } from './goals'
import { FIRE_HORIZON, projectFire, type FireProjection, type WindOverride } from './fireModel'

import { timelineFacts, type TimelineFacts } from './timeline'
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
  windValues: Map<string, number>
  /** Scheduled terrain changes, fires and enemy arrivals (timeline.ts). */
  timeline: TimelineFacts
  /** Tile objectives (hold / deny / occupy / exit blocking) and which of our units is sent to which. */
  aims: Aim[]
  assign: Map<string, Aim>
  /** Enemy units standing on a tile we must clear or want (kill them first). */
  onAim: Set<string>
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
  const timeline = timelineFacts(state, me)
  // Enemy waves that arrive before we next act count as threats (phantom units); they are never targets.
  const threats = threatsAgainst(timeline.threatState, timeline.threatFoes)
  const threatRadius = radiiOf(threats)
  const ctx: Ctx = {
    state,
    me,
    foes,
    friends,
    goals,
    threats,
    fire: projectFire(state, timeline.igniteTiles),
    threatRadius,
    threatsWithout: new Map(),
    fields: new Map(),
    weights: new Map(),
    exposures: new Map(),
    myModes: new Map(),
    fireValues: new Map(),
    windValues: new Map(),
    timeline,
    aims: [],
    assign: new Map(),
    onAim: new Set(),
  }
  ctx.aims = buildAims(ctx)
  ctx.assign = assignAims(ctx, ctx.aims)
  for (const f of foes) if (ctx.aims.some((a) => a.strength >= 200 && a.tile.x === f.x && a.tile.y === f.y)) ctx.onAim.add(f.id)
  return ctx
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
  const w =
    officerPower(ctx.state, u) * (key ? 2 : 1) * (!mine && ctx.goals.focus.has(u.id) ? 1.5 : 1) * (!mine && ctx.onAim.has(u.id) ? 1.5 : 1)
  ctx.weights.set(u.id, w)
  return w
}

/** A unit of ours whose loss would lose the battle: the commander and anything an objective says must not fall. */
export function isKey(ctx: Ctx, u: Unit): boolean {
  return u.side === ctx.me && (u.commander || ctx.goals.protect.has(u.id))
}

/** Damage that removes the unit from the board: all its troops, or down to its retreat line [R2-OBJ-2]. */
export function lethal(u: Unit): number {
  if (u.retreatAt === undefined) return u.troops
  return Math.max(1, Math.ceil(u.troops - u.retreatAt * u.maxTroops))
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
    const base = ctx.timeline.threatState
    const lifted: BattleState = { ...base, units: base.units.filter((x) => x.id !== u.id) }
    const threats = threatsAgainst(lifted, ctx.timeline.threatFoes)
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
    let val = Math.min(best, lethal(f)) * weight(ctx, f)
    // Being in position to finish a decisive unit is worth walking toward.
    if (ctx.goals.routWins.has(f.id)) val += Math.pow(Math.min(1, best / Math.max(1, lethal(f))), 2) * 3000
    if (val > top) {
      rest += top
      top = val
    } else rest += val
  }
  return top + 0.3 * rest
}

// ------------------------------------------------------------------ approach

interface Source {
  key: string
  sources: Pos[]
  weight: number
  /** Tiles of slack before the pull starts (a guard's leash). */
  slack?: number
}

/** The tiles a unit is drawn toward, with a weight, from its objectives first and its behaviour hint second. */
function approachSources(ctx: Ctx, u: Unit, beh: Behaviour): Source | null {
  const g = ctx.goals
  if (wantsEscape(g, u.id) && g.exits.length > 0) return { key: 'escape', sources: g.exits, weight: 1.8 }
  const aim = ctx.assign.get(u.id)
  if (aim) return { key: `aim:${aim.tile.x},${aim.tile.y}`, sources: [aim.tile], weight: aim.strength >= 1000 ? 2 : 1.2 }
  switch (beh.kind) {
    case 'hold':
    case 'ambush':
      return null
    case 'guard': {
      const s = beh.tile ?? (beh.unit ? ctx.state.units.find((x) => x.id === beh.unit) : undefined)
      if (s) return { key: `guard:${s.x},${s.y}`, sources: [{ x: s.x, y: s.y }], weight: 0.9, slack: beh.range ?? 2 }
      break
    }
    case 'pursue': {
      const s = ctx.state.units.find((x) => x.id === beh.unit)
      if (s) return { key: `pursue:${s.id}`, sources: [{ x: s.x, y: s.y }], weight: 1.2 }
      break
    }
    // [R2-BEH-1] advance-to a tile, or flee to a map edge
    case 'advance-to': {
      const { width, height } = ctx.state.grid
      const sources: Pos[] = beh.tile ? [beh.tile] : []
      if (beh.edge === 'west' || beh.edge === 'east') for (let y = 0; y < height; y++) sources.push({ x: beh.edge === 'west' ? 0 : width - 1, y })
      if (beh.edge === 'north' || beh.edge === 'south') for (let x = 0; x < width; x++) sources.push({ x, y: beh.edge === 'north' ? 0 : height - 1 })
      if (sources.length > 0) return { key: `to:${beh.tile ? `${beh.tile.x},${beh.tile.y}` : beh.edge}`, sources, weight: 2 }
      break
    }
    default:
      break
  }
  // Advance: toward the prize (the units whose rout wins, the escapers to catch), else the nearest foe.
  const prime = ctx.foes.filter((f) => g.routWins.has(f.id) || g.focus.has(f.id))
  if (prime.length > 0 && !g.routAll) return { key: 'prime', sources: prime, weight: 1 }
  if (ctx.foes.length === 0 && g.pullTiles.length > 0) return { key: 'pull', sources: g.pullTiles, weight: 1 }
  return { key: 'foes', sources: ctx.foes, weight: 1 }
}

function field(ctx: Ctx, u: Unit, key: string, sources: Pos[]): Float64Array {
  const k = `${u.side}|${u.type}|${key}|${sources.map((s) => `${s.x},${s.y}`).join(';')}`
  const hit = ctx.fields.get(k)
  if (hit) return hit
  const f = distanceField(ctx.state, u.type, sources, u.side)
  ctx.fields.set(k, f)
  return f
}

export const ADVANCE_WEIGHT = 10

/** Approach term of a tile for a unit (negative = far from where it wants to be), plus the value of tile aims. */
export function approachScore(ctx: Ctx, u: Unit, p: Pos): number {
  const beh = ctx.goals.behaviour(u)
  const src = approachSources(ctx, u, beh)
  let s = 0
  if (src && src.sources.length > 0) {
    const f = field(ctx, u, src.key, src.sources)
    let d = f[tileIndex(ctx, p)]!
    if (!Number.isFinite(d)) d = 40
    if (src.slack) d = Math.max(0, d - src.slack)
    // Ranged units want to stand a couple of tiles short of the enemy rather than on it.
    if (u.type === 'archers' && (src.key === 'foes' || src.key === 'prime')) d = Math.max(0, d - 2)
    const key = isKey(ctx, u)
    // A key unit stays with its army instead of leading the charge; a side that is happy to run out the clock more so.
    // An advance-to order is walked whatever the unit's rank [R2-BEH-1].
    const calm = beh.kind === 'advance-to' ? 1 : key && ctx.goals.careful ? CALM_KEY_PATIENT : key && ctx.friends.length > 1 ? 0.1 : 1
    // An advance-to order is walked at full urgency whatever the side's patience [R2-BEH-1].
    const urgency = beh.kind === 'advance-to' ? 1 : ctx.goals.urgency
    s -= ADVANCE_WEIGHT * (0.4 + 1.6 * urgency) * src.weight * calm * d * (beh.explicit ? 1 : ctx.goals.patience)
  } else if (beh.kind === 'hold' || beh.kind === 'ambush') {
    // The hint says stay: leaving the post has a price that a real opportunity must beat.
    const away = manhattan(p, u)
    s -= beh.kind === 'ambush' ? 60 * away : HOLD_LEASH * Math.min(1, away) + 4 * HOLD_LEASH * Math.max(0, away - 1)
  }
  return s + aimBonus(ctx, p, u.id)
}

/** How strongly a key unit of a patient side is drawn to the enemy (a fraction of a normal unit's pull). */
export const CALM_KEY_PATIENT = 0.02
/** What a unit under a `hold` hint pays per tile for leaving its post (only a real prize is worth a sortie). */
export const HOLD_LEASH = 60


// ------------------------------------------------------------------ position score

export interface PosScore {
  value: number
  incoming: number
  /** The part of `value` that is the key-unit safety penalty (a winning action waives it). */
  keyPenalty: number
}

/** A key unit is hit harder than the sum of single attacks suggests: chains, bonds and Qi built up over the phase. */
export function keyUplift(attackers: number): number {
  return KEY_UPLIFT_BASE + KEY_UPLIFT_STACK * Math.min(4, Math.max(0, attackers - 1))
}
export const KEY_UPLIFT_BASE = 1.15
export const KEY_UPLIFT_STACK = 0.12

/** 0.3..2: how threatened a key friend of ours is where it stands now. */
function keyDanger(ctx: Ctx, k: Unit): number {
  const ex = exposure(ctx, k, k)
  const inc = Math.min(ex.byFacing.N, ex.byFacing.E, ex.byFacing.S, ex.byFacing.W) * keyUplift(ex.attackers)
  return Math.max(0.3, Math.min(2, inc / Math.max(1, lethal(k)) / COMMANDER_SAFE_FRACTION))
}

/** The value of ending an activation with `u` standing on `p` facing `f` (next-phase exposure, fire, terrain, progress). */
export function posScore(ctx: Ctx, u: Unit, p: Pos, f: Facing): PosScore {
  const w = weight(ctx, u)
  const ex = exposure(ctx, u, p)
  const incoming = ex.byFacing[f]
  const key = isKey(ctx, u)
  let v = 0
  // The more a side needs a result, the less it fears the threat map; patient defenders fear it a little more.
  const pEng = P_ENGAGE * (1 - 0.7 * ctx.goals.urgency) * ctx.goals.caution
  v -= pEng * w * incoming
  v -= pEng * 0.4 * ex.confusion * actionValue(ctx, u)
  const riskOfRout = Math.max(0, Math.min(1, (incoming / Math.max(1, lethal(u)) - 0.7) / 0.6))
  v -= riskOfRout * routValue(ctx, u) * pEng
  v -= fireLoss(ctx, u, p, ctx.fire)
  // [R2-BEH-1] a unit under an advance-to order walks it rather than lingering to threaten.
  const ordered = ctx.goals.behaviour(u).kind === 'advance-to' ? ADVANCE_TO_THREATEN : 1
  v += P_THREATEN * ordered * threatenFrom(ctx, u, p) * (key && ctx.goals.careful ? KEY_THREATEN_PATIENT : ctx.goals.surviveRound !== null ? SURVIVOR_THREATEN : 1)
  v += approachScore(ctx, u, p)
  const t = tileTerrain(ctx, p)
  v += (1 - t.def) * 30 + t.elev * 5
  if (t.id === 'village' && u.troops < u.maxTroops) v += Math.min(0.05 * u.maxTroops, u.maxTroops - u.troops) * 0.8
  // Scheduled terrain changes: do not park where the ground is about to flood, or to slow going.
  const shift = ctx.timeline.shifts.get(tileIndex(ctx, p))
  if (shift) {
    const to = ctx.state.data.terrain[shift.to]
    const pushed = terrainCostFor(ctx.state, to, u.side, u.type) === null
    v -= shift.weight * (pushed ? 0.6 * actionValue(ctx, u) + 100 : 0.12 * actionValue(ctx, u))
  }
  if (key) {
    // A key unit keeps its army around it...
    let screen = 0
    for (const o of ctx.friends) if (o.id !== u.id && manhattan(o, p) <= 2) screen++
    v += 10 * Math.min(3, screen)
  } else {
    // ...and its army keeps between it and the enemy.
    for (const k of ctx.friends) {
      if (k.id === u.id || !isKey(ctx, k) || manhattan(k, p) > 2) continue
      let near: Unit | undefined
      let nd = Infinity
      for (const e of ctx.foes) {
        const d = manhattan(e, k)
        if (d < nd) {
          nd = d
          near = e
        }
      }
      if (near && manhattan(near, p) < nd) v += SCREEN_VALUE * keyDanger(ctx, k)
    }
  }
  // A side that only has to survive stays home: no sortie further than a few tiles from the units it must protect.
  if (ctx.goals.surviveRound !== null && !key) {
    let near = Infinity
    for (const k of ctx.friends) if (k.id !== u.id && isKey(ctx, k)) near = Math.min(near, manhattan(k, p))
    if (Number.isFinite(near)) v -= SURVIVOR_TETHER * Math.max(0, near - 3)
  }
  // Key-unit safety: a hard-ish constraint on standing where a third of the army can be lost in one phase.
  let keyPenalty = 0
  if (key) {
    const frac = (incoming * keyUplift(ex.attackers)) / Math.max(1, lethal(u))
    const safe = COMMANDER_SAFE_FRACTION / ctx.goals.caution
    if (frac >= safe) keyPenalty = 600 + 5000 * (frac - safe)
    v -= keyPenalty
  }
  return { value: v, incoming, keyPenalty }
}

export const SCREEN_VALUE = 25
/** Share of the threaten term kept by a unit walking an advance-to order [R2-BEH-1]. */
export const ADVANCE_TO_THREATEN = 0.1
/** Cost per tile beyond 3 from the nearest protected unit, for a side that only has to survive. */
export const SURVIVOR_TETHER = 12
export const KEY_THREATEN_PATIENT = 0.4
/** A survivor does not walk out to get into striking position; it hits what comes to it. */
export const SURVIVOR_THREATEN = 0.3

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

// ------------------------------------------------------------------ fire and wind

/** Net TP value of the change from the current fire projection to `proj`: enemy units burnt minus our own. */
function fireDelta(ctx: Ctx, proj: FireProjection): number {
  let v = 0
  for (const u of ctx.state.units) {
    const p = { x: u.x, y: u.y }
    const delta = fireLoss(ctx, u, p, proj) - fireLoss(ctx, u, p, ctx.fire)
    // We can walk our own people out of the fire; the enemy might too, but is less likely to.
    v += u.side === ctx.me ? -delta * 0.6 : delta * 0.85
  }
  return v
}

/** Net TP value of lighting `tiles` now over the projected horizon. */
export function ignitionValue(ctx: Ctx, tiles: Pos[]): number {
  const key = tiles.map((t) => `${t.x},${t.y}`).join(';')
  const hit = ctx.fireValues.get(key)
  if (hit !== undefined) return hit
  const v = fireDelta(ctx, projectFire(ctx.state, [...ctx.timeline.igniteTiles, ...tiles]))
  ctx.fireValues.set(key, v)
  return v
}

/** Net TP value of overriding the wind (call-the-storm, borrow-the-wind) for the fire already on the board or due. */
export function windValue(ctx: Ctx, w: WindOverride): number {
  const key = `${w.dir}|${w.strength}|${w.rounds}`
  const hit = ctx.windValues.get(key)
  if (hit !== undefined) return hit
  const v = fireDelta(ctx, projectFire(ctx.state, ctx.timeline.igniteTiles, FIRE_HORIZON, w))
  ctx.windValues.set(key, v)
  return v
}

/** Value of `amount` points of `stat` on ally `a` for `rounds` rounds (benevolent-banner, eight-trigrams...). */
export function buffValue(ctx: Ctx, a: Unit, stat: BuffStat, amount: number, rounds: number): number {
  const turns = Math.min(rounds, 2)
  const w = weight(ctx, a)
  if (stat === 'lead') {
    const ex = exposure(ctx, a, a)
    const inc = Math.min(ex.byFacing.N, ex.byFacing.E, ex.byFacing.S, ex.byFacing.W)
    return (amount / (100 + statOf(ctx.state, a, 'lead') + amount)) * inc * P_ENGAGE * 1.2 * w * turns
  }
  if (stat === 'war' || stat === 'int') {
    const off = ctx.state.data.officers[a.officer]
    const uses = stat === 'war' ? 1 : off && off.stratagems.some((s) => ctx.state.data.stratagems[s]?.stat === 'int') ? 0.6 : 0.1
    return (amount / (100 + statOf(ctx.state, a, stat))) * (150 + 0.08 * a.troops) * 1.2 * w * turns * uses
  }
  return 0
}
