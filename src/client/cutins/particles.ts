// Pure particle maths. A particle is a function of (seed, slot, time): no state is carried between frames, so any
// frame can be rendered on its own (scrubbing, loop, capture) and two runs agree exactly.
import { rand } from './rng'

export interface SlotConfig {
  seed: number
  /** Number of slots; steady-state density is count / period. */
  count: number
  /** Seconds between births in one slot; must be >= the longest particle life. */
  period: number
  /** Births outside [start, end] do not exist. */
  start: number
  end: number
  /** Particle life is lifeMin + (period - lifeMin) * r with r in [0,1) per particle; defaults to the full period. */
  lifeMin?: number
}

export interface Slot {
  alive: boolean
  /** Birth time of the particle currently occupying the slot. */
  tb: number
  age: number
  /** age / life in [0,1]. */
  u: number
  life: number
  /** Cycle number; with the slot index it identifies the particle for `r`. */
  k: number
  /** Per-particle random number n (0..) in [0,1). */
  r: (n: number) => number
}

const DEAD: Slot = { alive: false, tb: 0, age: 0, u: 1, life: 1, k: 0, r: () => 0 }

export function sampleSlot(cfg: SlotConfig, i: number, t: number): Slot {
  const phase = (i / cfg.count + rand(cfg.seed, i, 7) / cfg.count) * cfg.period
  const k = Math.floor((t - phase) / cfg.period)
  const tb = phase + k * cfg.period
  if (tb < cfg.start || tb > cfg.end) return DEAD
  const age = t - tb
  const r = (n: number): number => rand(cfg.seed, i, k, n)
  const lifeMin = cfg.lifeMin ?? cfg.period
  const life = lifeMin + (cfg.period - lifeMin) * r(99)
  if (age < 0 || age >= life) return { ...DEAD, tb, age }
  return { alive: true, tb, age, u: age / life, life, k, r }
}

/** A one-shot particle born at `t0` that flies ballistically: null before birth and after `life`. */
export function burstPosition(
  seed: number,
  id: number,
  t0: number,
  t: number,
  origin: readonly [number, number, number],
  speed: number,
  gravity: number,
  life: number,
): { p: [number, number, number]; u: number } | null {
  const age = t - t0
  if (age < 0 || age > life) return null
  const th = rand(seed, id, 1) * Math.PI * 2
  const up = 0.35 + rand(seed, id, 2) * 0.65
  const sp = speed * (0.4 + rand(seed, id, 3) * 0.6)
  const hx = Math.cos(th) * (1 - up * 0.5)
  const hz = Math.sin(th) * (1 - up * 0.5)
  const p: [number, number, number] = [
    origin[0] + hx * sp * age,
    Math.max(0, origin[1] + up * sp * age - 0.5 * gravity * age * age),
    origin[2] + hz * sp * age,
  ]
  return { p, u: age / life }
}
