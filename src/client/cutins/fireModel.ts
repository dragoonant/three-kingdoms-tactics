// Pure model of how fire spreads through the millet in scene A: every arrow that lands is an ignition point, and the
// flames run downwind (+x) fast, creep across the ridges, and hardly move upwind. Time here is STORY time.
import { rand } from './rng'

export interface Ignition {
  x: number
  z: number
  /** Story time the arrow lands. */
  t: number
}

export const FIRE = {
  /** Spread speed downwind (+x), crosswind and upwind, in tiles per second. */
  vDown: 1.2,
  vCross: 0.34,
  vUp: 0.17,
  /** Seconds a stalk burns before it is charred. */
  burn: 1.9,
}

/** Story time when the fire reaches (x, z), or Infinity when there are no ignitions. */
export function igniteTime(ign: readonly Ignition[], x: number, z: number, jitterSeed = 0): number {
  let best = Infinity
  for (const g of ign) {
    const dx = x - g.x
    const along = dx >= 0 ? dx / FIRE.vDown : -dx / FIRE.vUp
    const cross = (z - g.z) / FIRE.vCross
    const t = g.t + Math.sqrt(along * along + cross * cross)
    if (t < best) best = t
  }
  if (best === Infinity) return best
  return best + rand(jitterSeed, Math.round(x * 1000), Math.round(z * 1000)) * 0.12
}

export type BurnPhase = 'fresh' | 'catching' | 'burning' | 'charred'

export interface BurnState {
  phase: BurnPhase
  /** 0..1 glow strength */
  glow: number
  /** height multiplier of the stalk (collapses as it burns) */
  height: number
  /** 0 fresh .. 1 black */
  char: number
}

export function burnState(tIgnite: number, t: number, burn = FIRE.burn): BurnState {
  const a = t - tIgnite
  if (a < 0) return { phase: 'fresh', glow: 0, height: 1, char: 0 }
  if (a < 0.28) {
    const k = a / 0.28
    return { phase: 'catching', glow: k, height: 1, char: k * 0.35 }
  }
  if (a < burn) {
    const k = (a - 0.28) / (burn - 0.28)
    return { phase: 'burning', glow: 1 - 0.55 * k, height: 1 - 0.2 * k, char: 0.35 + 0.45 * k }
  }
  const k = Math.min(1, (a - burn) / 0.6)
  return { phase: 'charred', glow: 0.18 * (1 - k), height: 0.78 - 0.25 * k, char: 0.8 + 0.2 * k }
}

export interface Stalk {
  x: number
  z: number
  h: number
  c: number
  phase: number
}

export interface FieldBox {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** Rows of millet along x with ridges every `rowGap`. Deterministic from the seed. */
/**
 * The stalks of a field. `clear` discs stay bare (figures stand there); in the `low` discs (an action lane) the stalks are thinned
 * by half and cut to half height so the troops riding or running through stay in view.
 */
export function milletLayout(
  box: FieldBox,
  seed: number,
  clear: { x: number; z: number; r: number }[] = [],
  low: { x: number; z: number; r: number }[] = [],
): { rows: number[]; stalks: Stalk[] } {
  const rowGap = 0.22
  const rows: number[] = []
  for (let z = box.z0; z <= box.z1 + 1e-6; z += rowGap) rows.push(z)
  const stalks: Stalk[] = []
  const step = 0.07
  rows.forEach((rz, r) => {
    for (let x = box.x0, k = 0; x <= box.x1; x += step, k++) {
      const jx = (rand(seed, r, k, 1) - 0.5) * step * 0.9
      const jz = (rand(seed, r, k, 2) - 0.5) * 0.05
      const sx = x + jx
      const sz = rz + jz
      if (sz > 3.4 && rand(seed, r, k, 6) < 0.7) continue
      if (clear.some((c) => (c.x - sx) ** 2 + (c.z - sz) ** 2 < c.r * c.r)) continue
      const lowered = low.length > 0 && low.some((c) => (c.x - sx) ** 2 + (c.z - sz) ** 2 < c.r * c.r)
      if (lowered && rand(seed, r, k, 7) < 0.5) continue
      stalks.push({ x: sx, z: sz, h: (0.1 + rand(seed, r, k, 3) * 0.05) * (lowered ? 0.5 : 1), c: Math.floor(rand(seed, r, k, 4) * 4), phase: rand(seed, r, k, 5) * 6.28 })
    }
  })
  return { rows, stalks }
}
