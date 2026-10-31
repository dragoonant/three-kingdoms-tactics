// [R-MOVE-1], [R-MOVE-2]: Dijkstra over terrain cost with zone of control.
import { inEnemyZoc, isBurning, tileIndex, unitAt } from './board'
import { FACINGS, DIRS, stepFacing } from './geometry'
import type { BattleState, Facing, MoveOption, Pos, Unit } from './types'

export const TROOP_MOVE = { infantry: 4, cavalry: 6, archers: 3 } as const
export const BURNING_ENTRY_COST = 2

interface Reach {
  start: number
  cost: Map<number, number>
  parent: Map<number, number>
}

export function reach(state: BattleState, unit: Unit): Reach {
  const g = state.grid
  const move = TROOP_MOVE[unit.type]
  const start = tileIndex(g, unit.x, unit.y)
  const cost = new Map<number, number>([[start, 0]])
  const parent = new Map<number, number>()
  const done = new Set<number>()
  const frontier = new Set<number>([start])
  while (frontier.size > 0) {
    let cur = -1
    let best = Infinity
    for (const i of frontier) {
      const c = cost.get(i)!
      if (c < best || (c === best && i < cur)) {
        best = c
        cur = i
      }
    }
    frontier.delete(cur)
    done.add(cur)
    const cx = cur % g.width
    const cy = Math.floor(cur / g.width)
    // Entering a tile next to an enemy ends movement; leaving the start tile is always fine.
    if (cur !== start && inEnemyZoc(state, unit.side, cx, cy)) continue
    for (const f of FACINGS) {
      const nx = cx + DIRS[f].dx
      const ny = cy + DIRS[f].dy
      if (nx < 0 || ny < 0 || nx >= g.width || ny >= g.height) continue
      const ni = tileIndex(g, nx, ny)
      if (done.has(ni)) continue
      const t = state.data.terrain[g.tiles[ni]!.terrain]
      if (t.move === null) continue
      const occ = unitAt(state, nx, ny)
      if (occ && occ.side !== unit.side) continue
      const step = t.move[unit.type] + (isBurning(state, nx, ny) ? BURNING_ENTRY_COST : 0)
      const nc = best + step
      if (nc > move) continue
      const old = cost.get(ni)
      if (old === undefined || nc < old) {
        cost.set(ni, nc)
        parent.set(ni, cur)
        frontier.add(ni)
      }
    }
  }
  return { start, cost, parent }
}

/** Reachable, enterable (unoccupied) tiles other than the start, row-major. */
export function moveOptions(state: BattleState, unit: Unit): MoveOption[] {
  const r = reach(state, unit)
  const out: MoveOption[] = []
  const idxs = [...r.cost.keys()].filter((i) => i !== r.start).sort((a, b) => a - b)
  for (const i of idxs) {
    const x = i % state.grid.width
    const y = Math.floor(i / state.grid.width)
    if (unitAt(state, x, y)) continue
    out.push({ x, y, cost: r.cost.get(i)! })
  }
  return out
}

export function pathTo(state: BattleState, unit: Unit, x: number, y: number): { path: Pos[]; cost: number; facing: Facing } | null {
  const r = reach(state, unit)
  const target = tileIndex(state.grid, x, y)
  const c = r.cost.get(target)
  if (c === undefined || target === r.start || unitAt(state, x, y)) return null
  const rev: number[] = []
  let cur = target
  while (cur !== r.start) {
    rev.push(cur)
    cur = r.parent.get(cur)!
  }
  rev.reverse()
  const path = rev.map((i) => ({ x: i % state.grid.width, y: Math.floor(i / state.grid.width) }))
  const prev = path.length >= 2 ? path[path.length - 2]! : { x: unit.x, y: unit.y }
  return { path, cost: c, facing: stepFacing(prev, path[path.length - 1]!) }
}
