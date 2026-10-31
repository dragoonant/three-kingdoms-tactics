// A cheap probabilistic projection of the fire rules [R-FIRE-1..3] over the next few end-of-round steps.
// It mirrors engine/fire.ts (burn = 2 rounds, damage first, then spread from tiles burning at the start of the step,
// then burn-down to ash) but tracks per-tile probabilities instead of rolling dice. Wind comes from the state's own
// schedule, so a gale due in three rounds is accounted for. Units are assumed to stay put (callers discount).
import { windFactor, type BattleState, type Facing, type Pos } from '../engine'

const DIRS: [Facing, number, number][] = [
  ['N', 0, -1],
  ['E', 1, 0],
  ['S', 0, 1],
  ['W', -1, 0],
]

export const FIRE_HORIZON = 3
/** How much each projected end-of-round step counts (enemies walk away from fire, plans change). */
export const FIRE_DISCOUNT = [1, 0.7, 0.45, 0.3]

export interface FireProjection {
  /** Per tile index: discounted expected number of fire-damage steps a unit standing there would suffer. */
  events: Float64Array
  /** Per tile index: probability that the tile is burning at the first end-of-round step. */
  burningNow: Float64Array
}

function windAtRound(state: BattleState, round: number): { dir: Facing | null; strength: 'calm' | 'breeze' | 'gale' } {
  let cur: { dir: Facing | null; strength: 'calm' | 'breeze' | 'gale' } = { dir: null, strength: 'calm' }
  for (const e of state.windSchedule) if (e.round <= round) cur = { dir: e.dir, strength: e.strength }
  return cur
}

/** Project fire for `horizon` end-of-round steps, optionally with extra tiles set alight right now. */
export function projectFire(state: BattleState, extraIgnite: readonly Pos[] = [], horizon = FIRE_HORIZON): FireProjection {
  const { width: w, height: h } = state.grid
  const n = w * h
  const events = new Float64Array(n)
  const burningNow = new Float64Array(n)
  let b2 = new Float64Array(n)
  let b1 = new Float64Array(n)
  const ever = new Float64Array(n)
  let any = false
  for (let i = 0; i < n; i++) {
    const b = state.burn[i] ?? 0
    if (b >= 2) b2[i] = 1
    else if (b === 1) b1[i] = 1
    if (b > 0) {
      ever[i] = 1
      any = true
    }
  }
  const flam = new Float64Array(n)
  for (let i = 0; i < n; i++) flam[i] = state.data.terrain[state.grid.tiles[i]!.terrain].flammability
  for (const p of extraIgnite) {
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue
    const i = p.y * w + p.x
    if (flam[i]! > 0 && ever[i]! < 1) {
      b2[i] = 1
      ever[i] = 1
      any = true
    }
  }
  if (!any) return { events, burningNow }
  for (let k = 0; k < horizon; k++) {
    const disc = FIRE_DISCOUNT[k] ?? 0.2
    const wind = k === 0 ? state.wind : windAtRound(state, state.round + k)
    const nb2 = new Float64Array(n)
    const nb1 = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const burning = b2[i]! + b1[i]!
      if (burning <= 0) continue
      events[i] = (events[i] ?? 0) + burning * disc
      if (k === 0) burningNow[i] = burning
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const f = flam[i]!
        if (f <= 0) continue
        const avail = 1 - ever[i]!
        if (avail <= 0) continue
        let keep = 1
        for (const [d, dx, dy] of DIRS) {
          // A neighbour at (x-dx, y-dy) spreading in direction d lands on us.
          const sx = x - dx
          const sy = y - dy
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
          const si = sy * w + sx
          const sb = b2[si]! + b1[si]!
          if (sb <= 0) continue
          const p = windFactor(wind, d) * f
          if (p > 0) keep *= 1 - Math.min(1, sb * p)
        }
        const fresh = avail * (1 - keep)
        if (fresh > 0) nb2[i] = fresh
      }
    }
    for (let i = 0; i < n; i++) {
      nb1[i] = b2[i]!
      ever[i] = Math.min(1, ever[i]! + nb2[i]!)
    }
    b2 = nb2
    b1 = nb1
  }
  return { events, burningNow }
}
