// World layout of the sand table. One tile is one world unit; the board is centred on the origin.
// x runs west to east, z runs north (negative) to south, so a camera looking north has East on the right.
import type { Facing, Pos, Terrain } from '../../engine'

export const BOARD_W = 14
export const BOARD_H = 12

export const tileX = (x: number): number => x - (BOARD_W - 1) / 2
export const tileZ = (y: number): number => y - (BOARD_H - 1) / 2

/** Height of the sand surface for each terrain. Rivers are cut below the banks. */
export const TOP: Record<Terrain, number> = {
  plain: 0.1,
  farm: 0.1,
  forest: 0.1,
  hill: 0.46,
  village: 0.1,
  road: 0.09,
  ford: 0.07,
  river: 0.0,
  ash: 0.1,
  wall: 0.5,
  rampart: 0.46,
  gate: 0.14,
  shallows: 0.05,
  reeds: 0.1,
  deck: 0.16,
  water: 0.0,
  bridge: 0.1,
}

export const BRIDGE_TOP = 0.2

export const SAND: Record<Terrain, string> = {
  plain: '#cdb88c',
  farm: '#bb9f6d',
  forest: '#a08c62',
  hill: '#d8c294',
  village: '#c7aa7e',
  road: '#e6d6ac',
  ford: '#d9cfae',
  river: '#8a7852',
  ash: '#3a322b',
  wall: '#9a8a6e',
  rampart: '#a89878',
  gate: '#8a6a3a',
  shallows: '#b9c2a8',
  reeds: '#a9a05e',
  deck: '#8a6a44',
  water: '#6f7a63',
  bridge: '#b48f55',
}

export const COLORS = {
  night: '#14100d',
  lacquer: '#3a1410',
  bamboo: '#c9b27c',
  bronze: '#a07a3a',
  lantern: '#f2b45a',
  cinnabar: '#c8372d',
  han: '#2f6b5e',
  yellow: '#d4a72c',
  dong: '#6b1f2a',
  cao: '#34495e',
  lu: '#5b2c6f',
}

/** Banner colour of a side, by its colour token (side ids double as tokens in the shipped battles). */
export function sideColour(token: string): string {
  return (COLORS as Record<string, string>)[token] ?? COLORS.yellow
}

export function hash2(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) % 100000) / 100000
}

export const FACING_ANGLE: Record<Facing, number> = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 }

export function facingAngle(f: Facing): number {
  return FACING_ANGLE[f]
}

export function topAt(terrain: Terrain[], width: number, p: Pos): number {
  const t = terrain[p.y * width + p.x]
  return t ? TOP[t] : 0
}

/** Shortest signed angular difference b - a. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Screen-projection hooks filled by the canvas (used by tests and by HUD pointers). */
export const viewApi: {
  tileToScreen: (x: number, y: number) => { x: number; y: number } | null
  unitToScreen: (id: string) => { x: number; y: number } | null
  rotate: (dir: -1 | 1) => void
} = {
  tileToScreen: () => null,
  unitToScreen: () => null,
  rotate: () => undefined,
}
