// Pure helpers for units that travel on the board: how fast each kind of unit goes, how a beat's progress turns into
// distance along the engine's path (an ease in and out), and where along a polyline of tile centres the unit stands and
// which way it faces (turning smoothly through the corners). The figure's feet run on this distance (figures/clips.ts
// locomotion), so a longer path or a faster beat never makes a foot slide. No React, no three.
import type { TroopType } from '../../engine'

/** Board speeds in tiles per second at normal playback: foot soldiers march, riders canter. */
export const FOOT_SPEED = 1.5
export const RIDER_SPEED = 3.3

export const travelSpeed = (type: TroopType): number => (type === 'cavalry' ? RIDER_SPEED : FOOT_SPEED)

/** Milliseconds to turn on the spot before setting off (or after arriving) when the heading differs. */
export const TURN_MS = 130

const smooth = (x: number): number => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x
  return t * t * (3 - 2 * t)
}

/** Shortest signed angle from a to b. */
export function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Trapezoid speed profile over beat progress p in 0..1: speed ramps up over `ta`, cruises, ramps down over `td`.
 * `q` is the fraction of the path covered and `dq` the speed in path-lengths per beat (1 means the average speed).
 */
export function trapezoid(p: number, ta = 0.14, td = 0.2): { q: number; dq: number } {
  const x = p < 0 ? 0 : p > 1 ? 1 : p
  const v = 1 / (1 - (ta + td) / 2)
  if (x < ta) return { q: (v * x * x) / (2 * ta), dq: (v * x) / ta }
  if (x > 1 - td) {
    const r = 1 - x
    return { q: 1 - (v * r * r) / (2 * td), dq: (v * r) / td }
  }
  return { q: (v * ta) / 2 + v * (x - ta), dq: v }
}

export interface PathPoint {
  x: number
  z: number
  y: number
}

export function pathLength(pts: readonly PathPoint[]): number {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z)
  return d
}

/** Heading in radians (atan2(dx, dz), the board's yaw) of each segment. */
export function segmentHeadings(pts: readonly PathPoint[]): number[] {
  const h: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x
    const dz = pts[i]!.z - pts[i - 1]!.z
    h.push(Math.hypot(dx, dz) < 1e-6 ? (h[h.length - 1] ?? 0) : Math.atan2(dx, dz))
  }
  return h
}

/**
 * Position, ground height and heading at distance `d` along the polyline. The heading turns through each corner over
 * `rc` before and after it (so the body swings round instead of snapping); the position follows the tile centres.
 */
export function samplePath(pts: readonly PathPoint[], d: number, rc = 0.3): { x: number; z: number; y: number; heading: number } {
  const n = pts.length
  if (n === 0) return { x: 0, z: 0, y: 0, heading: 0 }
  if (n === 1) return { x: pts[0]!.x, z: pts[0]!.z, y: pts[0]!.y, heading: 0 }
  const heads = segmentHeadings(pts)
  const cum: number[] = [0]
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z))
  const total = cum[n - 1]!
  const dd = d < 0 ? 0 : d > total ? total : d
  let i = 1
  while (i < n - 1 && dd > cum[i]!) i++
  const a = pts[i - 1]!
  const b = pts[i]!
  const seg = cum[i]! - cum[i - 1]!
  const f = seg < 1e-9 ? 1 : (dd - cum[i - 1]!) / seg
  let heading = heads[0]!
  for (let j = 1; j < heads.length; j++) {
    const corner = cum[j]!
    const w = smooth((dd - (corner - rc)) / (2 * rc))
    heading += angDiff(heading, heads[j]!) * w
  }
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, heading }
}

/**
 * The phases of a move beat: turn on the spot (only when the first heading differs from the facing), travel, then turn to
 * the final facing. Fractions of the beat; they sum to 1.
 */
export function movePhases(turnIn: number, turnOut: number, ms: number): { tin: number; tout: number } {
  const unit = TURN_MS / Math.max(1, ms)
  return { tin: Math.abs(turnIn) > 0.35 ? Math.min(0.3, unit) : 0, tout: Math.abs(turnOut) > 0.35 ? Math.min(0.3, unit) : 0 }
}

/** Extra beat time for the turns before and after a move, in ms. */
export const turnAllowance = (turnIn: number, turnOut: number): number => (Math.abs(turnIn) > 0.35 ? TURN_MS : 0) + (Math.abs(turnOut) > 0.35 ? TURN_MS : 0)
