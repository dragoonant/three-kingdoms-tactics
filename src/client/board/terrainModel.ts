// Pure terrain model of the sand table: which tiles are bridges, how high each stands, which way a gate faces,
// where a ship's hull shows. No three, no React: the renderer (Terrain.tsx) draws what these helpers decide.
import type { Terrain } from '../../engine'
import { BRIDGE_TOP, TOP } from './layout'

export type Side4 = 'N' | 'E' | 'S' | 'W'
const DIRS: [Side4, number, number][] = [
  ['N', 0, -1],
  ['E', 1, 0],
  ['S', 0, 1],
  ['W', -1, 0],
]

export interface TerrainGrid {
  terrain: Terrain[]
  width: number
  height: number
}

export function terrainAt(g: TerrainGrid, x: number, y: number): Terrain | undefined {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return undefined
  return g.terrain[y * g.width + x]
}

/**
 * A bridge tile is a `bridge` terrain tile, or a road tile listed in the battle's `bridges` (Daxing Hill draws its road crossing as
 * a bridge over the river). A destroyed bridge turns to water, so it stops being one by itself.
 */
export function isBridgeTile(g: TerrainGrid, listed: { x: number; y: number }[], x: number, y: number): boolean {
  const t = terrainAt(g, x, y)
  if (t === 'bridge') return true
  return t === 'road' && listed.some((b) => b.x === x && b.y === y)
}

/** Surface height of a tile (bridges stand on planks over the water). */
export function tileTop(g: TerrainGrid, listed: { x: number; y: number }[], x: number, y: number): number {
  if (isBridgeTile(g, listed, x, y)) return BRIDGE_TOP
  const t = terrainAt(g, x, y)
  return t ? TOP[t] : 0
}

/** Terrain that is drawn as blue silk water underneath (rivers, deep water, and what a bridge or deck floats on). */
export function hasWaterBelow(t: Terrain | undefined, bridge: boolean): boolean {
  return t === 'river' || t === 'water' || t === 'deck' || t === 'bridge' || bridge
}

export const isWallish = (t: Terrain | undefined): boolean => t === 'wall' || t === 'rampart' || t === 'gate'

/** The wall runs north-south ('ns') or east-west ('ew') at a gate: judged from the wall tiles on either side. */
export function gateAxis(g: TerrainGrid, x: number, y: number): 'ns' | 'ew' {
  const ns = (isWallish(terrainAt(g, x, y - 1)) ? 1 : 0) + (isWallish(terrainAt(g, x, y + 1)) ? 1 : 0)
  const ew = (isWallish(terrainAt(g, x - 1, y)) ? 1 : 0) + (isWallish(terrainAt(g, x + 1, y)) ? 1 : 0)
  return ns >= ew ? 'ns' : 'ew'
}

/** Sides of a deck tile that border open water (where the hull shows). Edges of the board are not water. */
export function hullSides(g: TerrainGrid, listed: { x: number; y: number }[], x: number, y: number): Side4[] {
  const out: Side4[] = []
  for (const [d, dx, dy] of DIRS) {
    const n = terrainAt(g, x + dx, y + dy)
    if (n === undefined) continue
    if (n === 'deck') continue
    if (isBridgeTile(g, listed, x + dx, y + dy)) continue
    if (n === 'water' || n === 'river' || n === 'shallows' || n === 'ford') out.push(d)
  }
  return out
}

/** Sides of a rampart tile that get a low parapet: the ones that do not continue the wall. */
export function parapetSides(g: TerrainGrid, x: number, y: number): Side4[] {
  const out: Side4[] = []
  for (const [d, dx, dy] of DIRS) {
    const n = terrainAt(g, x + dx, y + dy)
    if (n === undefined) continue
    if (n === 'rampart' || n === 'wall' || n === 'gate') continue
    out.push(d)
  }
  return out
}

/** Is a gate open for the player? A gate is open to the side that owns it; the player's view shows it open only when the player owns it. */
export function gateIsOpenFor(gateOwner: string | null, playerSide: string): boolean {
  return gateOwner !== null && gateOwner === playerSide
}

/** Tiles whose terrain differs between two presented terrain arrays (for the transform effect). */
export function changedTiles(prev: Terrain[], next: Terrain[], width: number): { x: number; y: number; to: Terrain }[] {
  const out: { x: number; y: number; to: Terrain }[] = []
  if (prev.length !== next.length) return out
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) out.push({ x: i % width, y: Math.floor(i / width), to: next[i]! })
  }
  return out
}

/** Which way a bridge runs: along x when the tiles to its west and east are land, else along z. */
export function bridgeAxis(g: TerrainGrid, listed: { x: number; y: number }[], x: number, y: number): 'x' | 'z' {
  const land = (nx: number, ny: number): boolean => {
    const n = terrainAt(g, nx, ny)
    if (n === undefined) return false
    if (n === 'water' || n === 'river' || n === 'shallows') return false
    return n !== 'deck' || isBridgeTile(g, listed, nx, ny)
  }
  const ew = (land(x - 1, y) ? 1 : 0) + (land(x + 1, y) ? 1 : 0)
  const ns = (land(x, y - 1) ? 1 : 0) + (land(x, y + 1) ? 1 : 0)
  return ew >= ns ? 'x' : 'z'
}
