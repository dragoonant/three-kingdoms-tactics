// Tile aims: the hold / deny / occupy / exit-blocking objectives turned into "standing on this tile is worth N" and a
// nearest-unit assignment so the right unit walks there. Type-only import of Ctx keeps this free of a runtime cycle.
import { canStandOn, manhattan, type Pos, type Unit } from '../engine'

import { WIN, type Ctx } from './context'
import { movePoints } from './threat'

export interface Aim {
  tile: Pos
  /** What standing on the tile is worth (TP). */
  strength: number
  kind: 'occupy' | 'deny' | 'guard'
  /** The tile ends the battle if left/taken wrongly (lose-hold), or the goal is within a round of its check. */
  urgent: boolean
}

const key = (p: Pos): string => `${p.x},${p.y}`

/** Could an enemy end a move on `t` next phase? A tile one of our units stands on counts if an enemy is within a move of it. */
function reachableByFoe(ctx: Ctx, t: Pos): boolean {
  if (ctx.threats.some((th) => th.origins.some((o) => o.x === t.x && o.y === t.y))) return true
  if (!ctx.friends.some((f) => f.x === t.x && f.y === t.y)) return false
  return ctx.threats.some((th) => manhattan(th.unit, t) <= movePoints(th.unit.type))
}

/** All tile aims of the side to move, with their current strength. */
export function buildAims(ctx: Ctx): Aim[] {
  const out: Aim[] = []
  const round = ctx.state.round
  const g = ctx.goals
  const foeOn = (t: Pos): Unit | undefined => ctx.foes.find((f) => f.x === t.x && f.y === t.y)

  for (const goal of g.occupy) {
    for (const t of goal.tiles) {
      let strength: number
      let urgent = false
      if (goal.phaseEnd) {
        // Standing on the tile when the enemy phase ends wins the battle on the spot.
        if (round >= goal.from) {
          strength = 0.8 * WIN
          urgent = true
        } else strength = round >= goal.from - 1 ? 400 : 120
      } else if (goal.to === null) {
        strength = 90 // an exit tile: a unit standing on it cannot be used to escape
      } else if (round >= goal.to) {
        strength = 4000 // last round: a unit on the tile is what stops the player winning
        urgent = true
      } else strength = round >= goal.to - 2 ? 600 : 150
      out.push({ tile: t, strength, kind: 'occupy', urgent })
    }
  }
  for (const goal of g.deny) {
    for (const t of goal.tiles) {
      const threatened = !!foeOn(t) || reachableByFoe(ctx, t)
      let strength: number
      let urgent = false
      if (goal.phaseEnd) {
        // An enemy ending its phase here loses us the battle: block it as soon as an enemy can get there.
        if (round >= goal.from) {
          strength = threatened ? 0.7 * WIN : 80
          urgent = threatened
        } else strength = threatened ? 300 : 60
      } else if (round >= (goal.to ?? Infinity)) {
        strength = threatened ? 3000 : 400
        urgent = true
      } else if (round >= (goal.to ?? Infinity) - 1) strength = threatened ? 700 : 300
      else strength = 120
      out.push({ tile: t, strength, kind: 'deny', urgent })
    }
  }
  // A patient side keeps a bodyguard on the tiles around each key unit, on the side the enemy comes from.
  if (g.careful && ctx.foes.length > 0) {
    for (const k of ctx.friends) {
      if (!(k.commander || g.protect.has(k.id))) continue
      let near: Unit = ctx.foes[0]!
      for (const f of ctx.foes) if (manhattan(f, k) < manhattan(near, k)) near = f
      if (manhattan(near, k) > GUARD_RANGE) continue
      const slots = [
        { x: k.x, y: k.y - 1 },
        { x: k.x + 1, y: k.y },
        { x: k.x, y: k.y + 1 },
        { x: k.x - 1, y: k.y },
      ]
        .filter((t) => t.x >= 0 && t.y >= 0 && t.x < ctx.state.grid.width && t.y < ctx.state.grid.height)
        .filter((t) => canStandOn(ctx.state, t.x, t.y, ctx.me, 'infantry') && !ctx.foes.some((f) => f.x === t.x && f.y === t.y))
        .sort((a, b) => manhattan(a, near) - manhattan(b, near) || a.y - b.y || a.x - b.x)
      for (const t of slots.slice(0, GUARD_SLOTS)) out.push({ tile: t, strength: GUARD_STRENGTH, kind: 'guard', urgent: false })
    }
  }
  return out
}

/** The guard only forms up once the enemy is this close (Manhattan) to the key unit. */
export const GUARD_RANGE = 9
export const GUARD_SLOTS = 3
export const GUARD_STRENGTH = 120

/** One tile per unit, nearest first, strongest aims first. Commanders and protected units are the last choice. */
export function assignAims(ctx: Ctx, aims: Aim[]): Map<string, Aim> {
  const out = new Map<string, Aim>()
  const taken = new Set<string>()
  const order = [...aims].sort((a, b) => b.strength - a.strength || a.tile.y - b.tile.y || a.tile.x - b.tile.x)
  for (const a of order) {
    if (a.strength < 200 && a.kind !== 'guard') continue
    // a friend already standing on the tile has it covered
    if (ctx.friends.some((f) => f.x === a.tile.x && f.y === a.tile.y)) {
      const f = ctx.friends.find((x) => x.x === a.tile.x && x.y === a.tile.y)!
      if (!out.has(f.id)) {
        out.set(f.id, a)
        taken.add(f.id)
      }
      continue
    }
    let best: Unit | null = null
    let bd = Infinity
    for (const f of ctx.friends) {
      if (taken.has(f.id) || f.done) continue
      const key = f.commander || ctx.goals.protect.has(f.id)
      if (key && a.kind === 'guard') continue
      // Units under a hold / ambush / guard / pursue hint keep to it; objectives that matter more are not 'guard' aims.
      if (a.kind === 'guard' && ctx.goals.behaviour(f).kind !== 'advance') continue
      const d = manhattan(f, a.tile) + (key ? 20 : 0)
      if (d < bd || (d === bd && best && f.id < best.id)) {
        bd = d
        best = f
      }
    }
    if (best) {
      out.set(best.id, a)
      taken.add(best.id)
    }
  }
  return out
}

/** Value of ending an activation on `p` for the aims (standing on an aim tile). */
export function aimBonus(ctx: Ctx, p: Pos, unitId: string): number {
  let v = 0
  const mine = ctx.assign.get(unitId)
  for (const a of ctx.aims) {
    if (a.tile.x !== p.x || a.tile.y !== p.y) continue
    // A bodyguard slot only counts for the unit sent to it.
    if (a.kind === 'guard' && mine !== a) continue
    v += a.strength
  }
  return v
}

export const aimKey = key
