// Board and lookup helpers shared by every module. Pure; nothing here mutates a state.
import type { BuffStat, OfficerDef, StratagemDef, TerrainDef, TroopType } from '../data/types'
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

/** A stat after active buffs [R2-STRAT-2]; not capped above 100 + buffs (the base is capped at 100 when deployed). */
export function statOf(state: BattleState, unit: Unit, stat: BuffStat): number {
  let v = state.data.officers[unit.officer]![stat]
  for (const b of unit.buffs ?? []) if (b.stat === stat) v += b.amount
  return v
}

/** Move cost of entering `terrain` for a unit of this side/type, or null when it cannot enter (walls, water, gates of the other side, rampart for cavalry). */
export function terrainCostFor(state: BattleState, terrain: TerrainDef, side: Side, type: TroopType): number | null {
  if (terrain.move === null) return null
  if (terrain.gate && side !== state.gateOwner) return null
  return terrain.move[type]
}

export function canStandOn(state: BattleState, x: number, y: number, side: Side, type: TroopType): boolean {
  return terrainCostFor(state, terrainAt(state, x, y), side, type) !== null
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
    units: state.units.map((u) => {
      const c: Unit = { ...u, undo: u.undo ? { ...u.undo } : null }
      if (u.buffs) c.buffs = u.buffs.map((b) => ({ ...b }))
      return c
    }),
    defeated: state.defeated.slice(),
    escaped: state.escaped.slice(),
    retreated: state.retreated.slice(),
    reinforcements: state.reinforcements.slice(),
    sideOrder: state.sideOrder.slice(),
    wind: { ...state.wind },
    swayTried: state.swayTried.slice(),
    result: state.result ? { ...state.result } : null,
  }
}

export function round10(n: number): number {
  return Math.round(n / 10) * 10
}
