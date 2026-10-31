// Board and lookup helpers shared by every module. Pure; nothing here mutates a state.
import type { OfficerDef, StratagemDef, TerrainDef } from '../data/types'
import type { BattleState, Grid, Pos, Side, Terrain, Unit } from './types'
import { neighbors } from './geometry'

/** Build a width x height grid of plain tiles, row-major (index = y * width + x). */
export function makeGrid(width: number, height: number): Grid {
  const tiles: Grid['tiles'] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, y, terrain: 'plain' as Terrain })
    }
  }
  return { width, height, tiles }
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height
}

export function tileIndex(grid: Grid, x: number, y: number): number {
  return y * grid.width + x
}

export function terrainAt(state: BattleState, x: number, y: number): TerrainDef {
  const t = state.grid.tiles[tileIndex(state.grid, x, y)]!
  return state.data.terrain[t.terrain]
}

export function terrainIdAt(state: BattleState, x: number, y: number): Terrain {
  return state.grid.tiles[tileIndex(state.grid, x, y)]!.terrain
}

export function isBurning(state: BattleState, x: number, y: number): boolean {
  return (state.burn[tileIndex(state.grid, x, y)] ?? 0) > 0
}

export function getUnit(state: BattleState, id: string): Unit | undefined {
  return state.units.find((u) => u.id === id)
}

export function unitAt(state: BattleState, x: number, y: number): Unit | undefined {
  return state.units.find((u) => u.x === x && u.y === y)
}

export function officerOf(state: BattleState, unit: Unit): OfficerDef {
  return state.data.officers[unit.officer]!
}

export function stratagemById(state: BattleState, id: string): StratagemDef | undefined {
  return state.data.stratagems[id]
}

export function isEnemy(a: { side: Side }, b: { side: Side }): boolean {
  return a.side !== b.side
}

export function enemiesOf(state: BattleState, side: Side): Unit[] {
  return state.units.filter((u) => u.side !== side)
}

export function alliesOf(state: BattleState, side: Side): Unit[] {
  return state.units.filter((u) => u.side === side)
}

/** True when an enemy of `side` stands on a tile orthogonally adjacent to (x, y). [R-MOVE-1] */
export function inEnemyZoc(state: BattleState, side: Side, x: number, y: number): boolean {
  for (const n of neighbors({ x, y })) {
    const u = unitAt(state, n.x, n.y)
    if (u && u.side !== side) return true
  }
  return false
}

export function onBoard(state: BattleState, p: Pos): boolean {
  return inBounds(state.grid, p.x, p.y)
}

/** Copy of a state that is safe to mutate (units, burn, rng, lists). `grid` and `data` stay shared; replace, never mutate, the grid. */
export function cloneWork(state: BattleState): BattleState {
  return {
    ...state,
    rng: [...state.rng] as BattleState['rng'],
    burn: state.burn.slice(),
    units: state.units.map((u) => ({ ...u, undo: u.undo ? { ...u.undo } : null })),
    defeated: state.defeated.slice(),
    sideOrder: state.sideOrder.slice(),
    wind: { ...state.wind },
    swayTried: state.swayTried.slice(),
    result: state.result ? { ...state.result } : null,
  }
}

export function round10(n: number): number {
  return Math.round(n / 10) * 10
}
