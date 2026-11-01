// World layout of the sand table. One tile is one world unit; the board is centred on the origin.
// x runs west to east, z runs north (negative) to south, so a camera looking north has East on the right.
import type { Facing, Pos, Terrain } from '../../engine'

/**
 * The size of the board on the table right now. It is set (by setBoardSize) the moment a battle is loaded, before anything
 * renders, so every tile helper below works for any W x H. Pure framing helpers that take the size explicitly live in frame.ts.
 */
export const board = { w: 14, h: 12 }
export function setBoardSize(w: number, h: number): void {
  board.w = w
  board.h = h
}

export const tileX = (x: number): number => x - (board.w - 1) / 2
export const tileZ = (y: number): number => y - (board.h - 1) / 2

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
  wall: 0.95,
  rampart: 0.62,
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
  wall: '#a58f73',
  rampart: '#b09b7c',
  gate: '#a68a5a',
  shallows: '#9c9a76',
  reeds: '#a9a05e',
  deck: '#6f7a63',
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

/** Side id -> colour token, filled from the battle's `sides` data when a battle loads ([R2-SIDE-1]). */
const sideTokens = new Map<string, string>()
export function setSideTokens(sides: { id: string; colourToken: string }[]): void {
  sideTokens.clear()
  for (const s of sides) sideTokens.set(s.id, s.colourToken)
}
/** The colour token of a side id (falls back to the id itself, which is also a token in the shipped battles). */
export function sideToken(sideId: string): string {
  return sideTokens.get(sideId) ?? sideId
}
/** Banner colour of a side, by side id or colour token. */
export function sideColour(idOrToken: string): string {
  const c = COLORS as Record<string, string>
  return c[sideToken(idOrToken)] ?? c[idOrToken] ?? COLORS.yellow
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

/** Screen-projection and camera hooks filled by the canvas (used by tests, tools and HUD pointers). */
export const viewApi: {
  tileToScreen: (x: number, y: number) => { x: number; y: number } | null
  unitToScreen: (id: string) => { x: number; y: number } | null
  rotate: (dir: -1 | 1) => void
  /** Glide back to the fitted overview. */
  reset: () => void
  /** The camera right now: position, orbit target (x, z), azimuth, zoom (0 overview, 1 closest), tilt and near plane. */
  camera: () => { x: number; y: number; z: number; tx: number; tz: number; az: number; zoom: number; tilt: number; dist: number; near: number } | null
  /** Set the view at once (target x/z in world units, azimuth, zoom, tilt). */
  setView: (p: { x?: number; z?: number; az?: number; zoom?: number; tilt?: number }) => void
  /** Glide to a unit at a zoom (1 = as close as the camera goes). */
  focusUnit: (id: string, zoom?: number) => void
} = {
  tileToScreen: () => null,
  unitToScreen: () => null,
  rotate: () => undefined,
  reset: () => undefined,
  camera: () => null,
  setView: () => undefined,
  focusUnit: () => undefined,
}
