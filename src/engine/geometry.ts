import type { AreaKind } from '../data/types'
import type { Arc, Facing, Pos } from './types'

export const FACINGS: Facing[] = ['N', 'E', 'S', 'W']
export const DIRS: Record<Facing, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** The four orthogonal neighbours in N, E, S, W order (not bounds-checked). */
export function neighbors(p: Pos): Pos[] {
  return FACINGS.map((f) => ({ x: p.x + DIRS[f].dx, y: p.y + DIRS[f].dy }))
}

/** Cardinal direction from `from` toward `to`: larger |delta| wins, ties go horizontal. [R-TURN-5] */
export function facingToward(from: Pos, to: Pos): Facing {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

/** Direction of one orthogonal step (assumes |dx|+|dy| = 1). */
export function stepFacing(from: Pos, to: Pos): Facing {
  return facingToward(from, to)
}

/** [R-ATK-1] Arc from which `attacker` hits `defender` given the defender's facing. */
export function arcOf(defender: Pos & { facing: Facing }, attacker: Pos): Arc {
  const vx = attacker.x - defender.x
  const vy = attacker.y - defender.y
  const f = DIRS[defender.facing]
  const dot = vx * f.dx + vy * f.dy
  const cross = Math.abs(vx * f.dy - vy * f.dx)
  if (dot > 0 && Math.abs(dot) >= cross) return 'front'
  if (dot < 0 && Math.abs(dot) >= cross) return 'rear'
  return 'side'
}

export const ARC_MULT: Record<Arc, number> = { front: 1.0, side: 1.25, rear: 1.5 }

/**
 * Tiles affected by a stratagem anchored at `anchor`, cast from `caster`.
 * First element is always the anchor (or the caster's tile for adjacent/aura). Not bounds-checked.
 */
export function areaTiles(area: AreaKind, caster: Pos, anchor: Pos, auraRange = 2): Pos[] {
  switch (area) {
    case 'single':
      return [{ x: anchor.x, y: anchor.y }]
    case 'cross':
      return [{ x: anchor.x, y: anchor.y }, ...neighbors(anchor)]
    case 'sweep': {
      const dir = facingToward(caster, anchor)
      const horizontal = dir === 'E' || dir === 'W'
      const a = horizontal ? { x: anchor.x, y: anchor.y - 1 } : { x: anchor.x - 1, y: anchor.y }
      const b = horizontal ? { x: anchor.x, y: anchor.y + 1 } : { x: anchor.x + 1, y: anchor.y }
      return [{ x: anchor.x, y: anchor.y }, a, b]
    }
    case 'adjacent':
      return neighbors(caster)
    case 'ring2': {
      // [R2-AREA-1] every tile within Manhattan distance 1..2 of the caster
      const out: Pos[] = []
      for (let y = caster.y - 2; y <= caster.y + 2; y++)
        for (let x = caster.x - 2; x <= caster.x + 2; x++) {
          const d = Math.abs(x - caster.x) + Math.abs(y - caster.y)
          if (d >= 1 && d <= 2) out.push({ x, y })
        }
      return out
    }
    case 'self':
      return [{ x: caster.x, y: caster.y }]
    case 'aura': {
      const out: Pos[] = []
      for (let y = caster.y - auraRange; y <= caster.y + auraRange; y++)
        for (let x = caster.x - auraRange; x <= caster.x + auraRange; x++)
          if (Math.abs(x - caster.x) + Math.abs(y - caster.y) <= auraRange) out.push({ x, y })
      return out
    }
  }
}

/** Neighbour of `p` in direction `f`. */
export function shift(p: Pos, f: Facing): Pos {
  return { x: p.x + DIRS[f].dx, y: p.y + DIRS[f].dy }
}

export function perpendicular(f: Facing): [Facing, Facing] {
  return f === 'N' || f === 'S' ? ['E', 'W'] : ['N', 'S']
}
