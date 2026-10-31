// Seeded RNG: sfc32 (4 x uint32 state), stored in BattleState.rng.
//
// DRAW ORDER (part of the engine contract; replay depends on it). Every draw is one
// call to nextFloat(), a uniform number in [0, 1). A draw is made ONLY when the outcome
// is not already certain, in exactly this order:
//
//  attack action:       1. variance for the attack (always)
//                       2. variance for the counterattack (only if a counter happens)
//  stratagem (per link, targets in area-tile order: anchor first, then the order of
//             geometry.areaTiles; each affected enemy unit does, in sequence):
//                       1. foresight roll   (Ruse/Fire tag AND target.int > caster.int)
//                       2. variance         (power > 0, target not seen through)
//                       3. confuse roll     (effect confuse, target still on board)
//             The opener's targets are resolved before link 1 is chosen, and so on.
//  sway action:         1. one roll
//  end of round fire:   1. confuse roll (50%) for each surviving unit on a burning tile,
//                          in row-major tile order (y, then x)
//                       2. spread rolls: burning-at-start tiles in row-major order; for each,
//                          its neighbours in order N, E, S, W; a roll is made for each
//                          neighbour that is flammable, not burning (including tiles lit
//                          earlier in this same step) and has a chance > 0
//
// Previews and chain planning never touch the RNG (they run in "expected" mode).

export type RngState = [number, number, number, number]

/** Initialise from an integer seed (splitmix32-style scrambling) and warm up. */
export function seedRng(seed: number): RngState {
  let s = seed >>> 0
  const sm = (): number => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return (z ^ (z >>> 16)) >>> 0
  }
  const st: RngState = [sm(), sm(), sm(), sm()]
  for (let i = 0; i < 12; i++) nextFloat(st)
  return st
}

/** Advances `st` in place and returns a float in [0, 1). Only call on a working copy. */
export function nextFloat(st: RngState): number {
  let a = st[0]
  let b = st[1]
  let c = st[2]
  let d = st[3]
  let t = (a + b) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  d = (d + 1) | 0
  t = (t + d) | 0
  c = (c + t) | 0
  st[0] = a >>> 0
  st[1] = b >>> 0
  st[2] = c >>> 0
  st[3] = d >>> 0
  return (t >>> 0) / 4294967296
}

/** How dice are rolled: real (seeded) or "expected" (previews: variance 1.0, nothing random happens). */
export interface Roller {
  readonly expected: boolean
  /** Damage variance in [0.9, 1.1]. */
  variance(): number
  /** True with probability pct/100. */
  chance(pct: number): boolean
}

export function rngRoller(st: RngState): Roller {
  return {
    expected: false,
    variance: () => 0.9 + 0.2 * nextFloat(st),
    chance: (pct) => nextFloat(st) * 100 < pct,
  }
}

export const EXPECTED_ROLLER: Roller = {
  expected: true,
  variance: () => 1,
  chance: () => false,
}
