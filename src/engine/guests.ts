// [R2-GUEST-2] AI-moved guests: player-side units the player cannot order. They act on their own, by a fixed rule
// read from the battle's behaviour table, at the end of the player side's phase. Pure and deterministic; the only
// random draws are those of an attack.
import { PLAYER_SIDE } from '../data/types'
import { getUnit } from './board'
import { attackTargets, resolveAttack } from './combat'
import { manhattan } from './geometry'
import { moveOptions, pathTo } from './movement'
import { dropProvokesBy } from './ops'
import type { Roller } from './rng'
import type { BattleState, GameEvent, Pos, Unit } from './types'
import { concludeIfWon } from './victory'

export type Edge = 'west' | 'east' | 'north' | 'south'
const EDGES: readonly string[] = ['west', 'east', 'north', 'south']

export type GuestPlan = { kind: 'flee'; edge: Edge } | { kind: 'advance-to'; tile: Pos } | { kind: 'stand' }

/** The rule a guest follows, from its hint. */
export function guestPlan(hint: string | undefined): GuestPlan {
  if (typeof hint === 'string') {
    const flee = /^flee:(\w+)$/.exec(hint)
    if (flee && EDGES.includes(flee[1]!)) return { kind: 'flee', edge: flee[1] as Edge }
    const adv = /^advance-to:(\d+),(\d+)$/.exec(hint)
    if (adv) return { kind: 'advance-to', tile: { x: Number(adv[1]), y: Number(adv[2]) } }
  }
  return { kind: 'stand' }
}

/** Tiles from `p` to the named edge of the board. */
export function edgeDistance(w: Pick<BattleState, 'grid'>, p: Pos, edge: Edge): number {
  switch (edge) {
    case 'west':
      return p.x
    case 'east':
      return w.grid.width - 1 - p.x
    case 'north':
      return p.y
    case 'south':
      return w.grid.height - 1 - p.y
  }
}

export function isAiGuest(u: Unit): boolean {
  return u.guestControl === 'ai' && u.side === PLAYER_SIDE
}

/** [R2-GUEST-2] At the start of a player-side phase, AI guests are marked done so the player cannot order them. */
export function holdAiGuests(w: BattleState): void {
  if (w.side !== PLAYER_SIDE) return
  for (const u of w.units) if (isAiGuest(u)) u.done = true
}

interface Option {
  x: number
  y: number
  cost: number
}

function nearestFoe(w: BattleState, u: Unit, p: Pos): number {
  let d = Infinity
  for (const f of w.units) if (f.side !== u.side) d = Math.min(d, manhattan(f, p))
  return d
}

const rowMajor = (a: Pos, b: Pos): number => a.y - b.y || a.x - b.x

/** The tile the guest moves to (its own tile when staying is best). */
function chooseTile(w: BattleState, u: Unit, plan: GuestPlan): Option {
  const here: Option = { x: u.x, y: u.y, cost: 0 }
  if (plan.kind === 'stand') return here
  const opts = [here, ...moveOptions(w, u)]
  const score = (o: Option): number =>
    plan.kind === 'flee' ? edgeDistance(w, o, plan.edge) : manhattan(o, plan.tile)
  let best = here
  for (const o of opts) {
    const a = score(o)
    const b = score(best)
    if (a < b) {
      best = o
      continue
    }
    if (a > b) continue
    if (plan.kind === 'flee') {
      const fa = nearestFoe(w, u, o)
      const fb = nearestFoe(w, u, best)
      if (fa !== fb) {
        if (fa > fb) best = o
        continue
      }
    }
    if (o.cost !== best.cost) {
      if (o.cost < best.cost) best = o
      continue
    }
    if (rowMajor(o, best) < 0) best = o
  }
  return best
}

function escape(w: BattleState, ev: GameEvent[], u: Unit): void {
  w.units = w.units.filter((x) => x.id !== u.id)
  dropProvokesBy(w, u.id)
  w.escaped.push(u.id)
  ev.push({ kind: 'escaped', unit: u.id, side: u.side, x: u.x, y: u.y })
}

/** One guest's activation. */
function actGuest(w: BattleState, ev: GameEvent[], roller: Roller, u: Unit): void {
  const plan = guestPlan(w.enemyBehaviour[u.id])
  if (plan.kind === 'flee' && edgeDistance(w, u, plan.edge) === 0) {
    escape(w, ev, u)
    return
  }
  const before = plan.kind === 'flee' ? edgeDistance(w, u, plan.edge) : plan.kind === 'advance-to' ? manhattan(u, plan.tile) : 0
  const dest = chooseTile(w, u, plan)
  if (dest.x !== u.x || dest.y !== u.y) {
    const p = pathTo(w, u, dest.x, dest.y)
    if (p) {
      const from = { x: u.x, y: u.y }
      u.x = dest.x
      u.y = dest.y
      u.facing = p.facing
      u.moved = true
      ev.push({ kind: 'moved', unit: u.id, from, to: { x: u.x, y: u.y }, path: p.path, cost: p.cost, facing: u.facing })
    }
  }
  if (plan.kind === 'flee' && edgeDistance(w, u, plan.edge) === 0) {
    escape(w, ev, u)
    return
  }
  const after = plan.kind === 'flee' ? edgeDistance(w, u, plan.edge) : plan.kind === 'advance-to' ? manhattan(u, plan.tile) : 0
  if (plan.kind === 'flee' && after < before) return
  const targets = attackTargets(w, u).sort((a, b) => a.troops - b.troops || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (targets.length > 0) resolveAttack(w, ev, roller, u.id, targets[0]!.id)
}

/** [R2-GUEST-2] Every AI guest acts, in unit-list order, at the end of the player side's phase. */
export function actAiGuests(w: BattleState, ev: GameEvent[], roller: Roller): void {
  if (w.side !== PLAYER_SIDE) return
  const ids = w.units.filter(isAiGuest).map((u) => u.id)
  for (const id of ids) {
    const u = getUnit(w, id)
    if (!u || u.confused || u.side !== PLAYER_SIDE) continue
    actGuest(w, ev, roller, u)
    const live = getUnit(w, id)
    if (live) {
      live.done = true
      live.undo = null
    }
    if (concludeIfWon(w, ev)) return
  }
}
