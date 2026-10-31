// [R2-TIME-1] terrain changes (floods, opened gates, destroyed bridges, burnt decks), unit displacement,
// and the timeline runner. Pure helpers that mutate a working copy.
import { canStandOn, getUnit, inBounds, isBurning, terrainAt, tileIndex, unitAt } from './board'
import { removeUnit } from './ops'
import type { BattleState, GameEvent, Pos, Terrain, Unit } from './types'

/** Nearest free tile the unit can stand on (Manhattan distance, then row-major). */
export function nearestFreeTile(w: BattleState, u: Pos & { side: Unit['side']; type: Unit['type'] }, from: Pos): Pos | null {
  let best: Pos | null = null
  let bd = Infinity
  for (let y = 0; y < w.grid.height; y++) {
    for (let x = 0; x < w.grid.width; x++) {
      const d = Math.abs(x - from.x) + Math.abs(y - from.y)
      if (d >= bd) continue
      if (unitAt(w, x, y) || !canStandOn(w, x, y, u.side, u.type)) continue
      best = { x, y }
      bd = d
    }
  }
  return best
}

/** Change the terrain of `tiles` to `to`. Units standing on a tile they can no longer occupy are pushed to the nearest free tile, or routed. */
export function changeTerrain(w: BattleState, ev: GameEvent[], tiles: Pos[], to: Terrain, cause: 'timeline' | 'burnout'): void {
  const g = w.grid
  const next = g.tiles.slice()
  const changed: Pos[] = []
  const flammable = w.data.terrain[to].flammability > 0
  for (const p of tiles) {
    if (!inBounds(g, p.x, p.y)) continue
    const i = tileIndex(g, p.x, p.y)
    if (next[i]!.terrain === to) continue
    next[i] = { ...next[i]!, terrain: to }
    changed.push({ x: p.x, y: p.y })
    if (!flammable) w.burn[i] = 0
  }
  if (changed.length === 0) return
  w.grid = { ...g, tiles: next }
  ev.push({ kind: 'terrainChanged', tiles: changed, to, cause })
  const ids = changed
    .map((p) => unitAt(w, p.x, p.y))
    .filter((u): u is Unit => !!u)
    .map((u) => u.id)
  for (const id of ids) {
    const u = getUnit(w, id)
    if (!u || canStandOn(w, u.x, u.y, u.side, u.type)) continue
    const dest = nearestFreeTile(w, u, u)
    if (!dest) {
      removeUnit(w, ev, u)
      continue
    }
    const from = { x: u.x, y: u.y }
    u.x = dest.x
    u.y = dest.y
    u.undo = null
    ev.push({ kind: 'moved', unit: u.id, from, to: dest, path: [{ ...dest }], cost: 0, facing: u.facing })
  }
}

/** Run the timeline items scheduled for (round, phase). */
export function fireTimeline(w: BattleState, ev: GameEvent[], round: number, phase: 'start' | 'end'): void {
  for (const t of w.timeline) {
    if (t.round !== round || t.phase !== phase) continue
    switch (t.kind) {
      case 'terrain':
        changeTerrain(w, ev, t.tiles.map(([x, y]) => ({ x, y })), t.to, 'timeline')
        break
      case 'wind': {
        const dir = t.strength === 'calm' ? null : t.dir
        w.windUntil = null
        if (dir !== w.wind.dir || t.strength !== w.wind.strength) {
          w.wind = { dir, strength: t.strength }
          ev.push({ kind: 'windChanged', dir, strength: t.strength, round: w.round })
        }
        break
      }
      case 'message':
        ev.push({ kind: 'timelineMessage', text: t.text, round })
        break
      case 'ignite':
        for (const [x, y] of t.tiles) {
          if (!inBounds(w.grid, x, y) || terrainAt(w, x, y).flammability <= 0 || isBurning(w, x, y)) continue
          w.burn[tileIndex(w.grid, x, y)] = 2
          ev.push({ kind: 'ignited', x, y, by: 'timeline', strat: 'timeline' })
        }
        break
    }
  }
}
