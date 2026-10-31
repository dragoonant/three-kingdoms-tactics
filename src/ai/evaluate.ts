// Candidate generation and scoring for the utility AI. For one ready unit we consider "stay" and a pruned set of
// destinations; from each we price the best attack, stratagem or sway (using query.* previews) plus waiting facing the
// safest way, and add the positional value of where the unit ends up. A handful of the best candidates are then re-priced
// by sampling the real engine (step) with private random seeds, which settles chains, routs and counters exactly.
import {
  arcOf,
  facingToward,
  manhattan,
  query,
  seedRng,
  step,
  type Action,
  type BattleState,
  type Facing,
  type GameEvent,
  type MoveOption,
  type Pos,
  type StratagemPreview,
  type Unit,
} from '../engine'
import { legalActionsFor } from '../engine/legal'
import { ARC_MULT } from '../engine/geometry'
import {
  FACINGS,
  QI_VALUE,
  P_ENGAGE,
  actionValue,
  approachScore,
  bestFacing,
  buffValue,
  exposure,
  fireLoss,
  ignitionValue,
  lethal,
  posScore,
  routChance,
  routValue,
  threatenFrom,
  weight,
  windValue,
  WIN,
  ROUT,
  type Ctx,
} from './context'
import { escapeActionUnit, wantsEscape } from './goals'
import { projectFire } from './fireModel'
import { baseDamage, modesOf } from './threat'

export interface Cand {
  unit: string
  dest: Pos
  /** A move is needed first; `emit` is then the move and `finish` the follow-up. */
  viaMove: boolean
  finish: Action | null
  emit: Action
  offense: number
  pos: number
  score: number
  gain: number
  finalPos: Pos
  finalFacing: Facing
  /** The offense is worth so much (a won battle) that safety rules do not apply. */
  decisive: boolean
  label: string
}

interface Off {
  action: Action
  value: number
  finalPos: Pos
  finalFacing: Facing
  label: string
}

function unitById(state: BattleState, id: string): Unit | undefined {
  return state.units.find((u) => u.id === id)
}

function enemiesOnTiles(ctx: Ctx, st: BattleState, tiles: Pos[]): Unit[] {
  const out: Unit[] = []
  for (const t of tiles) {
    const u = st.units.find((x) => x.x === t.x && x.y === t.y)
    if (u && u.side !== ctx.me && !out.includes(u)) out.push(u)
  }
  return out
}

function softRout(cum: number, lethalDamage: number): number {
  return Math.max(0, Math.min(1, (cum / Math.max(1, lethalDamage) - 0.85) / 0.3))
}

// ------------------------------------------------------------------ offense options

function attackOptions(ctx: Ctx, st: BattleState, u: Unit): Off[] {
  const out: Off[] = []
  for (const tid of query.attackTargets(st, u.id)) {
    const t = unitById(st, tid)
    const pv = query.attackPreview(st, u.id, tid)
    if (!t || !pv) continue
    const pr = routChance(pv.damage.min, pv.damage.max, lethal(t))
    let v = Math.min(pv.damage.expected, lethal(t)) * weight(ctx, t)
    v += pr * (ROUT * weight(ctx, t) + (ctx.goals.routWins.has(t.id) ? WIN : 0))
    if (pv.counter.possible) v -= ((pv.counter.min + pv.counter.max) / 2) * weight(ctx, u) * (1 - pr)
    out.push({
      action: { type: 'attack', unit: u.id, target: tid },
      value: v,
      finalPos: { x: u.x, y: u.y },
      finalFacing: facingToward(u, t),
      label: `attack ${tid}`,
    })
  }
  return out
}

function stratagemValue(ctx: Ctx, st: BattleState, u: Unit, pv: StratagemPreview, strat: { tag: string; cost: number; area: string }): number {
  let v = 0
  const cum = new Map<string, number>()
  for (const t of pv.targets) {
    const tu = unitById(st, t.unit)
    if (!tu) continue
    const fs = t.foresightChance / 100
    const dmg = t.expected * (1 - fs)
    v += Math.min(dmg, lethal(tu)) * weight(ctx, tu)
    cum.set(tu.id, (cum.get(tu.id) ?? 0) + dmg)
    const pr = routChance(t.min, t.max, lethal(tu)) * (1 - fs)
    v += pr * (ROUT * weight(ctx, tu) + (ctx.goals.routWins.has(tu.id) ? WIN : 0))
    if (t.confuseChance > 0) v += (t.confuseChance / 100) * (1 - fs) * (1 - pr) * 0.9 * actionValue(ctx, tu)
    // A provoked unit must come at the caster: it loses its own plan for the turn.
    if (t.provokes) v += 0.35 * (1 - fs) * (1 - pr) * actionValue(ctx, tu)
  }
  for (let k = 1; k < pv.chain.length; k++) {
    const link = pv.chain[k]!
    const hit = enemiesOnTiles(ctx, st, link.tiles)
    if (hit.length === 0) continue
    const prob = Math.pow(0.85, k)
    const each = (link.expected * prob) / hit.length
    for (const tu of hit) {
      v += each * weight(ctx, tu)
      cum.set(tu.id, (cum.get(tu.id) ?? 0) + each)
    }
  }
  // Chains finish units off: add the soft rout chance for targets that the whole chain brings low.
  for (const [id, c] of cum) {
    const tu = unitById(st, id)
    if (!tu) continue
    const first = pv.targets.find((t) => t.unit === id)
    const firstShare = first ? first.expected : 0
    if (c > firstShare + 1) {
      const p = softRout(c, lethal(tu)) - softRout(firstShare, lethal(tu))
      if (p > 0) v += p * (ROUT * weight(ctx, tu) + (ctx.goals.routWins.has(tu.id) ? WIN : 0))
    }
  }
  v -= strat.cost * QI_VALUE
  return v
}

function stratagemOptions(ctx: Ctx, st: BattleState, u: Unit): Off[] {
  const out: Off[] = []
  for (const opt of query.stratagemOptions(st, u.id)) {
    if (!opt.usable) continue
    const def = st.data.stratagems[opt.id]
    if (!def) continue
    for (const a of query.stratagemTargets(st, u.id, opt.id)) {
      const pv = query.stratagemPreview(st, u.id, opt.id, a)
      if (!pv) continue
      let v: number
      if (def.tag === 'Command') {
        v = pv.heals.reduce((n, h) => {
          const ally = unitById(st, h.unit)
          return n + (ally ? h.amount * weight(ctx, ally) * 0.8 : 0)
        }, 0)
        for (const b of pv.buffs ?? []) {
          const ally = unitById(st, b.unit)
          if (ally && ally.side === ctx.me) v += buffValue(ctx, ally, b.stat, b.amount, b.rounds)
        }
        if (pv.wind) v += windValue(ctx, pv.wind)
        v -= def.cost * QI_VALUE
        if (v <= 0) continue
      } else {
        v = stratagemValue(ctx, st, u, pv, def)
        if (pv.ignites) {
          const g = st.grid
          const burning = (st.burn[a.y * g.width + a.x] ?? 0) > 0
          const flam = st.data.terrain[g.tiles[a.y * g.width + a.x]!.terrain].flammability
          if (!burning && flam > 0) v += ignitionValue(ctx, def.area === 'single' ? [a] : pv.tiles.filter((t) => t.x >= 0 && t.y >= 0 && t.x < g.width && t.y < g.height))
        }
      }
      const finalPos = pv.dashTo ?? { x: u.x, y: u.y }
      const faces = def.tag !== 'Command' && (a.x !== u.x || a.y !== u.y)
      out.push({
        action: { type: 'stratagem', unit: u.id, strat: def.id, x: a.x, y: a.y, excludeFromChain: [] },
        value: v,
        finalPos,
        finalFacing: faces ? facingToward(finalPos, a) : u.facing,
        label: `${def.id}@${a.x},${a.y}`,
      })
    }
  }
  return out
}

function swayOptions(ctx: Ctx, st: BattleState, u: Unit): Off[] {
  const out: Off[] = []
  for (const tid of query.swayTargets(st, u.id)) {
    const pv = query.swayChance(st, u.id, tid)
    const t = unitById(st, tid)
    if (!pv || !pv.legal || !t) continue
    out.push({
      action: { type: 'sway', unit: u.id, target: tid },
      value: (pv.chance / 100) * (0.7 * t.troops + 250) * weight(ctx, t),
      finalPos: { x: u.x, y: u.y },
      finalFacing: u.facing,
      label: `sway ${tid}`,
    })
  }
  return out
}

// ------------------------------------------------------------------ destinations

/** Best immediate strike available from `p` against the foes now (no move needed), in TP. */
function strikeNow(ctx: Ctx, u: Unit, p: Pos): number {
  const modes = modesOf(ctx.state, u, u.qi)
  let best = 0
  for (const f of ctx.foes) {
    const d = manhattan(f, p)
    for (const m of modes) {
      const max = m.max + (m.hillRange && ctx.state.grid.tiles[p.y * ctx.state.grid.width + p.x]!.terrain === 'hill' ? 1 : 0)
      if (d < m.min || d > max) continue
      let v = baseDamage(ctx.state, u, p, m, f, f)
      if (m.arc) v *= ARC_MULT[arcOf(f, p)]
      v = Math.min(v, f.troops)
      let val = v * weight(ctx, f)
      if (v >= f.troops * 0.9) val += routValue(ctx, f) * 0.6
      if (val > best) best = val
    }
  }
  return best
}

function cheapPos(ctx: Ctx, u: Unit, p: Pos): number {
  return approachScore(ctx, u, p) + strikeNow(ctx, u, p) + P_ENGAGE * threatenFrom(ctx, u, p) * 0.5
}

export function pickDestinations(ctx: Ctx, u: Unit, moves: MoveOption[], max: number): Pos[] {
  if (moves.length === 0) return []
  const stage1 = moves.map((m) => ({ p: { x: m.x, y: m.y }, s: cheapPos(ctx, u, m) }))
  stage1.sort((a, b) => b.s - a.s || a.p.y - b.p.y || a.p.x - b.p.x)
  const pool = stage1.slice(0, Math.max(max * 2, max + 4))
  const detailed = pool.map((e) => {
    const ex = exposure(ctx, u, e.p)
    const safest = Math.min(ex.byFacing.N, ex.byFacing.E, ex.byFacing.S, ex.byFacing.W)
    const w = weight(ctx, u)
    const s2 = e.s - P_ENGAGE * w * safest - fireLoss(ctx, u, e.p, ctx.fire)
    return { ...e, s2, safest }
  })
  const picked = new Map<string, Pos>()
  const add = (arr: { p: Pos }[], n: number): void => {
    for (let i = 0; i < arr.length && i < n; i++) picked.set(`${arr[i]!.p.x},${arr[i]!.p.y}`, arr[i]!.p)
  }
  add([...detailed].sort((a, b) => b.s2 - a.s2 || a.p.y - b.p.y || a.p.x - b.p.x), Math.max(4, max - 5))
  add([...detailed].sort((a, b) => a.safest - b.safest || a.p.y - b.p.y || a.p.x - b.p.x), 2)
  add([...detailed].sort((a, b) => b.s - a.s || a.p.y - b.p.y || a.p.x - b.p.x), 3)
  return [...picked.values()]
}

// ------------------------------------------------------------------ candidates

function relocated(state: BattleState, u: Unit, to: Pos): BattleState {
  const facing = facingToward(u, to)
  return {
    ...state,
    units: state.units.map((x) =>
      x.id === u.id ? { ...x, x: to.x, y: to.y, moved: true, facing, undo: { x: u.x, y: u.y, facing: u.facing } } : x,
    ),
  }
}

function makeCand(ctx: Ctx, u: Unit, dest: Pos, viaMove: boolean, off: Off | null, idle: number, postFacing: Facing): Cand {
  const wait = off === null
  const finalPos = off ? off.finalPos : dest
  const finalFacing = off ? off.finalFacing : postFacing
  const decisive = !!off && off.value >= WIN * 0.55
  const ps = posScore(ctx, u, finalPos, finalFacing)
  let pos = ps.value
  // No safety penalty for a key unit whose action wins the battle.
  if (decisive && ps.keyPenalty > 0) pos += ps.keyPenalty
  const finish: Action | null = wait ? { type: 'wait', unit: u.id, facing: postFacing } : off.action
  const emit: Action = viaMove ? { type: 'move', unit: u.id, x: dest.x, y: dest.y } : (finish as Action)
  const offense = off ? off.value : 0
  const score = offense + pos
  return {
    unit: u.id,
    dest,
    viaMove,
    finish,
    emit,
    offense,
    pos,
    score,
    gain: score - idle,
    finalPos,
    finalFacing,
    decisive,
    label: `${viaMove ? `move ${dest.x},${dest.y} + ` : ''}${wait ? `wait ${postFacing}` : off.label}`,
  }
}

const actionKey = (a: Action): string => JSON.stringify(a)

/** The best candidate for each destination of one ready unit. A provoked unit only gets what legalActions allows it. */
export function candidatesForUnit(ctx: Ctx, u: Unit, maxDests: number, expired: () => boolean): Cand[] {
  const state = ctx.state
  const idle = posScore(ctx, u, u, u.facing).value
  const out: Cand[] = []
  const restricted = u.provoked !== undefined
  const legal0 = restricted ? new Set(legalActionsFor(state, u).map(actionKey)) : null
  const dests: { p: Pos; via: boolean }[] = [{ p: { x: u.x, y: u.y }, via: false }]
  if (!u.moved) {
    const moves = query.moveRange(state, u.id).filter((m) => !legal0 || legal0.has(actionKey({ type: 'move', unit: u.id, x: m.x, y: m.y })))
    for (const p of pickDestinations(ctx, u, moves, maxDests)) dests.push({ p, via: true })
  }
  for (const d of dests) {
    if (d.via && out.length > 0 && expired()) break
    const st = d.via ? relocated(state, u, d.p) : state
    const uu = unitById(st, u.id)!
    // After a (provoked) move the restriction is re-read from the engine for the new position.
    const allowed = restricted ? new Set(legalActionsFor(st, uu).map(actionKey)) : null
    const offs: Off[] = [...attackOptions(ctx, st, uu), ...stratagemOptions(ctx, st, uu), ...swayOptions(ctx, st, uu)].filter((o) => !allowed || allowed.has(actionKey(o.action)))
    const postFacing = d.via ? uu.facing : u.facing
    // Waiting: pick the facing that exposes the unit least (among the legal ones).
    let wf = bestFacing(ctx, uu, d.p)
    let canWait = true
    if (allowed && !allowed.has(actionKey({ type: 'wait', unit: u.id, facing: wf }))) {
      const alt = FACINGS.find((f) => allowed.has(actionKey({ type: 'wait', unit: u.id, facing: f })))
      if (alt) wf = alt
      else canWait = false
    }
    let best: Cand | null = canWait ? makeCand(ctx, u, d.p, d.via, null, idle, wf) : null
    for (const off of offs) {
      const c = makeCand(ctx, u, d.p, d.via, off, idle, postFacing)
      if (!best || c.score > best.score) best = c
    }
    if (best) out.push(best)
  }
  return out
}

// ------------------------------------------------------------------ rollouts

function eventsValue(ctx: Ctx, before: BattleState, events: GameEvent[]): number {
  let v = 0
  const get = (id: string): Unit | undefined => unitById(before, id)
  for (const e of events) {
    switch (e.kind) {
      case 'damaged': {
        const t = get(e.unit)
        if (!t) break
        v += (t.side === ctx.me ? -1 : 1) * e.amount * weight(ctx, t)
        break
      }
      case 'routed':
      case 'retreated': {
        const t = get(e.unit)
        if (!t) break
        v += (t.side === ctx.me ? -1 : 1) * ROUT * weight(ctx, t)
        break
      }
      case 'buffed': {
        const t = get(e.unit)
        if (t && t.side === ctx.me) v += buffValue(ctx, t, e.stat, e.amount, Math.max(1, e.until - before.round))
        break
      }
      case 'provoked': {
        const t = get(e.unit)
        if (t && t.side !== ctx.me) v += 0.35 * actionValue(ctx, t)
        break
      }
      case 'confused': {
        const t = get(e.unit)
        if (!t) break
        v += (t.side === ctx.me ? -1 : 1) * 0.9 * actionValue(ctx, t)
        break
      }
      case 'swayed': {
        const t = get(e.target)
        if (!t) break
        const val = (0.7 * t.troops + 250) * weight(ctx, t)
        v += e.side === ctx.me ? val : -val
        break
      }
      case 'healed': {
        const t = get(e.unit)
        if (t && t.side === ctx.me) v += e.amount * weight(ctx, t) * 0.8
        break
      }
      case 'stratagem':
      case 'chainLink': {
        const c = get(e.unit)
        if (c && c.side === ctx.me) v -= e.cost * QI_VALUE
        break
      }
      case 'battleEnded':
        v += e.winner === ctx.me ? WIN : -WIN
        break
      default:
        break
    }
  }
  return v
}

function fireDeltaAfter(ctx: Ctx, after: BattleState): number {
  const proj = projectFire(after)
  let v = 0
  for (const u of after.units) {
    const p = { x: u.x, y: u.y }
    const delta = fireLoss(ctx, u, p, proj) - fireLoss(ctx, u, p, ctx.fire)
    v += u.side === ctx.me ? -delta * 0.6 : delta * 0.85
  }
  return v
}

/** Re-prices a candidate by sampling the engine. Returns null when the sampled action is rejected. */
export function rollout(ctx: Ctx, c: Cand, seeds: number[]): number | null {
  if (!c.finish || c.finish.type === 'wait' || c.finish.type === 'escape') return null
  let base = ctx.state
  if (c.viaMove) {
    const r = step(base, c.emit)
    if (!r.ok) return null
    base = r.state
  }
  const idleUnit = unitById(base, c.unit)
  if (!idleUnit) return null
  let total = 0
  for (const seed of seeds) {
    const sampled: BattleState = { ...base, rng: seedRng(seed) }
    const r = step(sampled, c.finish)
    if (!r.ok) return null
    let v = eventsValue(ctx, base, r.events)
    if (r.events.some((e) => e.kind === 'ignited' || e.kind === 'windChanged')) v += fireDeltaAfter(ctx, r.state)
    const uu = unitById(r.state, c.unit)
    if (uu && !r.state.result) v += posScore(ctx, uu, uu, uu.facing).value
    total += v
  }
  return total / seeds.length
}

// ------------------------------------------------------------------ v2 escape

/** Walking a unit off the board: the battle when it completes the objective, otherwise solid progress toward it. */
function escapeValue(ctx: Ctx, id: string): number {
  const e = ctx.goals.escape
  if (!e) return 0
  const out = ctx.state.escaped
  const rest = (e.units ?? []).every((x) => x === id || out.includes(x))
  return out.length + 1 >= e.count && rest ? WIN : 2500
}

/** Candidates for { type: 'escape' } actions (engine v2) for the units that are meant to leave by the exits. */
export function escapeCandidates(ctx: Ctx, legal: Action[]): Cand[] {
  const out: Cand[] = []
  for (const a of legal) {
    const id = escapeActionUnit(a)
    if (!id || !wantsEscape(ctx.goals, id)) continue
    const u = unitById(ctx.state, id)
    if (!u) continue
    const value = escapeValue(ctx, id)
    out.push({
      unit: id,
      dest: { x: u.x, y: u.y },
      viaMove: false,
      finish: a,
      emit: a,
      offense: value,
      pos: 0,
      score: value,
      gain: value,
      finalPos: { x: u.x, y: u.y },
      finalFacing: u.facing,
      decisive: value >= WIN * 0.55,
      label: `escape ${id}`,
    })
  }
  return out
}

