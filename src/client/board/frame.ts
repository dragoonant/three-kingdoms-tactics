// Pure framing helpers: everything about the table that depends on the board size (W x H, 10..16 x 8..14).
// No three, no React, no module state, so the numbers are unit-tested. One tile is one world unit, the board is centred on the origin.

export const MIN_W = 10
export const MAX_W = 16
export const MIN_H = 8
export const MAX_H = 14

export interface BoardSize {
  w: number
  h: number
}

/** Clamp a size into the range the table is designed for (the engine allows more; the camera still copes). */
export function clampSize(w: number, h: number): BoardSize {
  return { w: Math.max(MIN_W, Math.min(MAX_W, w)), h: Math.max(MIN_H, Math.min(MAX_H, h)) }
}

/** World centre of a tile. x runs west to east, z runs north (negative) to south. */
export function tileCentre(x: number, y: number, w: number, h: number): { x: number; z: number } {
  return { x: x - (w - 1) / 2, z: y - (h - 1) / 2 }
}

/** The tile (clamped into the board) under a world point. */
export function tileAt(wx: number, wz: number, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(w - 1, Math.round(wx + (w - 1) / 2))),
    y: Math.max(0, Math.min(h - 1, Math.round(wz + (h - 1) / 2))),
  }
}

/** Corner points of the frame the camera must keep in view (table edge, from the sand up to the height of a rampart). */
export function frameCorners(w: number, h: number): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.5]) out.push([sx * (w / 2 + 0.55), y, sz * (h / 2 + 0.55)])
  return out
}

/** How far the orbit target may be panned away from the middle of the board. */
export function panLimits(w: number, h: number): { x: number; z: number } {
  return { x: Math.max(1, w / 2 - 2), z: Math.max(1, h / 2 - 1.5) }
}

/** Lantern light and mesh positions: they hang over the corners of the table whatever its size. */
export function lanternSpots(w: number, h: number): { lights: [number, number, number][]; meshes: [number, number, number][]; posts: [number, number][] } {
  const hx = w / 2
  const hz = h / 2
  return {
    lights: [
      [-(hx + 1.2), 4.1, -(hz + 0.4)],
      [hx + 1.2, 4.1, -(hz + 0.4)],
      [-(hx + 1.2), 4.1, hz + 1.0],
      [hx + 1.2, 4.1, hz + 1.0],
    ],
    meshes: [
      [-(hx + 3.5), 6.2, -(hz + 2.0)],
      [hx + 3.5, 6.2, -(hz + 2.0)],
      [-(hx + 3.5), 6.2, hz + 2.6],
      [hx + 3.5, 6.2, hz + 2.6],
    ],
    posts: [
      [-(hx + 4), -(hz + 3)],
      [hx + 4, -(hz + 3)],
      [-(hx + 4), hz + 3.5],
      [hx + 4, hz + 3.5],
    ],
  }
}

/** Half-extents of the directional light's shadow box so the whole board casts and receives shadow. */
export function shadowBox(w: number, h: number): { x: number; z: number } {
  return { x: w / 2 + 2.5, z: h / 2 + 3 }
}

/** Where a unit that arrives or leaves enters/exits: a point `out` tiles beyond the nearest board edge, in tile coordinates. */
export function edgePoint(x: number, y: number, w: number, h: number, out = 2.5): { x: number; y: number } {
  const dl = x
  const dr = w - 1 - x
  const dt = y
  const db = h - 1 - y
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return { x: -out, y }
  if (m === dr) return { x: w - 1 + out, y }
  if (m === dt) return { x, y: -out }
  return { x, y: h - 1 + out }
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const angleGap = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}

/**
 * Occlusion fade of a tent-cloth panel standing at azimuth `panelAz` on the ring around the table, for a camera at azimuth `camAz`:
 * 0 (gone) for the panels on the camera's side of the table, up to 1 (solid) behind and beside the board. The cloth never stands between the
 * camera and the board, whatever the pitch. Azimuths are atan2(x, z) as everywhere in the camera model.
 */
export function drapeOpacity(panelAz: number, camAz: number): number {
  return smoothstep(Math.PI * 0.3, Math.PI * 0.52, angleGap(panelAz, camAz))
}

/**
 * Whether a lantern post at (px, pz) is shown: the two posts nearest the camera are hidden when the camera is low (elevation under about 35
 * degrees) and outside the post, because a 9-unit pole there would cross the view of the table. 1 = shown, 0 = hidden.
 */
export function postOpacity(px: number, pz: number, camAz: number, camDist: number, elevation: number): number {
  const near = angleGap(Math.atan2(px, pz), camAz) < Math.PI * 0.45 && camDist > Math.hypot(px, pz)
  return near && elevation < 0.62 ? 0 : 1
}
