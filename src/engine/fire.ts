// [R-FIRE-1..3], [R-WIND-1], [R-MOVE-2]
import { round10, terrainAt, terrainIdAt, tileIndex, unitAt } from './board'
import { DIRS, FACINGS, perpendicular } from './geometry'
import { applyDamage } from './ops'
import type { Roller } from './rng'
import type { BattleState, Facing, FireForecast, GameEvent, Terrain, Wind, WindInfo } from './types'
import { changeTerrain } from './terrain'

export const BURN_ROUNDS = 2
export const FIRE_DAMAGE_PCT = 0.1
export const FIRE_FOREST_MULT = 1.5
export const FIRE_CONFUSE_PCT = 50

/** Spread factor toward a neighbour in direction `d` under `wind` (before flammability). [R-FIRE-3] */
export function windFactor(wind: Wind, d: Facing): number {
  if (wind.strength === 'calm' || wind.dir === null) return 0.15
  if (wind.strength === 'breeze') return d === wind.dir ? 0.6 : 0
  if (d === wind.dir) return 1.0
  return perpendicular(wind.dir).includes(d) ? 0.3 : 0
}

export function windForRound(w: Pick<BattleState, 'windSchedule'>, round: number): Wind {
  let cur: Wind = { dir: null, strength: 'calm' }
  for (const e of w.windSchedule) if (e.round <= round) cur = { dir: e.dir, strength: e.strength }
  return cur
}

export function windInfo(state: BattleState): WindInfo {
  const next = state.windSchedule.find((e) => e.round > state.round) ?? null
  return { current: { ...state.wind }, next: next ? { ...next } : null }
}

/** Fire damage a unit on a burning tile will take. [R-FIRE-2a] */
export function fireDamageFor(state: BattleState, unit: { x: number; y: number; maxTroops: number; troops: number }): number {
  const forest = terrainIdAt(state, unit.x, unit.y) === 'forest'
  const raw = unit.maxTroops * FIRE_DAMAGE_PCT * (forest ? FIRE_FOREST_MULT : 1)
  return Math.min(unit.troops, Math.max(10, round10(raw)))
}

/** End-of-round fire step, in the order a / b / c of [R-FIRE-2]. */
export function resolveFire(w: BattleState, ev: GameEvent[], roller: Roller): void {
  const g = w.grid
  const burningAtStart: number[] = []
  for (let i = 0; i < w.burn.length; i++) if (w.burn[i]! > 0) burningAtStart.push(i)
  if (burningAtStart.length === 0) return
  // (a) damage and confusion, row-major by tile
  for (const i of burningAtStart) {
    const x = i % g.width
    const y = Math.floor(i / g.width)
    const u = unitAt(w, x, y)
    if (!u) continue
    const amount = fireDamageFor(w, u)
    const routed = applyDamage(w, ev, u, amount, 'fire')
    if (!routed && roller.chance(FIRE_CONFUSE_PCT)) {
      u.confused = true
      ev.push({ kind: 'confused', unit: u.id, source: 'fire', chance: FIRE_CONFUSE_PCT })
    }
  }
  // (b) spread from tiles burning at the start of this step
  for (const i of burningAtStart) {
    const from = { x: i % g.width, y: Math.floor(i / g.width) }
    for (const d of FACINGS) {
      const nx = from.x + DIRS[d].dx
      const ny = from.y + DIRS[d].dy
      if (nx < 0 || ny < 0 || nx >= g.width || ny >= g.height) continue
      const ni = tileIndex(g, nx, ny)
      if (w.burn[ni]! > 0) continue
      const flam = terrainAt(w, nx, ny).flammability
      const p = windFactor(w.wind, d) * flam
      if (p <= 0) continue
      if (roller.chance(p * 100)) {
        w.burn[ni] = BURN_ROUNDS
        ev.push({ kind: 'fireSpread', from, to: { x: nx, y: ny } })
      }
    }
  }
  // (c) burn down. A tile becomes ash, or the terrain's `burnsTo` (a burnt-out deck sinks into water).
  let tiles = g.tiles
  const sunk: { x: number; y: number; to: Terrain }[] = []
  for (const i of burningAtStart) {
    w.burn[i] = w.burn[i]! - 1
    if (w.burn[i] === 0) {
      const x = i % g.width
      const y = Math.floor(i / g.width)
      const burnsTo = w.data.terrain[g.tiles[i]!.terrain].burnsTo
      if (tiles === g.tiles) tiles = g.tiles.slice()
      tiles[i] = { ...tiles[i]!, terrain: 'ash' }
      ev.push({ kind: 'burnedOut', x, y })
      if (burnsTo) sunk.push({ x, y, to: burnsTo })
    }
  }
  if (tiles !== g.tiles) w.grid = { ...g, tiles }
  for (const s of sunk) changeTerrain(w, ev, [{ x: s.x, y: s.y }], s.to, 'burnout')
}

/** What the next end-of-round fire step will do (open information). */
export function fireForecast(state: BattleState): FireForecast {
  const g = state.grid
  const burning: FireForecast['burning'] = []
  const keep: Map<number, number> = new Map() // tile -> probability of NOT igniting
  for (let i = 0; i < state.burn.length; i++) {
    const b = state.burn[i]!
    if (b <= 0) continue
    const from = { x: i % g.width, y: Math.floor(i / g.width) }
    burning.push({ x: from.x, y: from.y, burn: b })
    for (const d of FACINGS) {
      const n = { x: from.x + DIRS[d].dx, y: from.y + DIRS[d].dy }
      if (n.x < 0 || n.y < 0 || n.x >= g.width || n.y >= g.height) continue
      const ni = tileIndex(g, n.x, n.y)
      if (state.burn[ni]! > 0) continue
      const p = windFactor(state.wind, d) * terrainAt(state, n.x, n.y).flammability
      if (p <= 0) continue
      keep.set(ni, (keep.get(ni) ?? 1) * (1 - Math.min(1, p)))
    }
  }
  const spread = [...keep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, k]) => ({ x: i % g.width, y: Math.floor(i / g.width), chance: 1 - k }))
  const unitDamage: FireForecast['unitDamage'] = []
  for (const b of burning) {
    const u = unitAt(state, b.x, b.y)
    if (u) unitDamage.push({ unit: u.id, amount: fireDamageFor(state, u), confuseChance: FIRE_CONFUSE_PCT / 100 })
  }
  return { wind: { ...state.wind }, burning, spread, unitDamage }
}
