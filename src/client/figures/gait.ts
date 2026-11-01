// Foot-contact solver and gait tables for the locomotion clips (docs/spec/31-hero-figures.md "Locomotion").
//
// The figures have no base: boots and hooves stand on the ground plane at y = 0. A walking figure must not skate, so the
// cycle phase is driven by DISTANCE TRAVELLED (phase = distance / strideLength), never by time, and every foot is solved
// from where it should be on the ground: while a foot is in stance it is pinned to a fixed world point (the hips move
// forward over it), while it swings it follows a lifted arc. A person's leg is a rigid piece pivoting at the hip with a
// boot on an ankle joint, so the solver finds the swing angle that puts the contact point of the boot (an ellipse in the
// side view, rolling heel to toe) at the wanted forward offset, and the small vertical offset (`dy`, the leg joint
// sliding a hair inside the hips) that puts the sole exactly at the wanted height. A horse's leg is one rigid piece with
// the hoof on its end. Everything here is pure: no clock, no DOM, no randomness.

/** The side-view outline of a boot or hoof: an ellipse with its centre at (z, y) from the joint it hangs on. */
export interface FootGeom {
  zc: number
  yc: number
  /** Semi-axes along the foot's local z and y. */
  rz: number
  ry: number
}

/** Boot of the MGSD body (parts.ts): an ellipse about the ankle, 0.112 long and 0.052 high, centred 0.028 ahead of it. */
export const BOOT: FootGeom = { zc: 0.028, yc: 0, rz: 0.112, ry: 0.052 }
/** Hip to the sole of the boot (= the hip height above the ground at rest), and hip to the ankle joint. */
export const HUMAN_LEG = 0.184
export const ANKLE = 0.132
/** Front and rear horse leg: shoulder / hip pivot to the sole of the hoof, and to the pastern joint the hoof hangs from. */
export const HORSE_LEG = { front: 0.221, back: 0.241 }
export const HOOF_H = 0.047
/** A hoof as an ellipse about its pastern joint. */
export const HOOF: FootGeom = { zc: 0.004, yc: -0.0245, rz: 0.064, ry: 0.0235 }

/** Lowest point of the foot after it turns by `a` about its joint (positive a tips the toe down / swings the leg back). */
export function footContact(g: FootGeom, a: number): { y: number; z: number } {
  const s = Math.sin(a)
  const c = Math.cos(a)
  const yc = g.yc * c - g.zc * s
  const zc = g.yc * s + g.zc * c
  const D = Math.sqrt(g.rz * g.rz * s * s + g.ry * g.ry * c * c) || 1e-9
  return { y: yc - D, z: zc + ((g.rz * g.rz - g.ry * g.ry) * s * c) / D }
}

export interface LegSolution {
  /** Rotation about x to add to the leg joint (body-frame angle). */
  a: number
  /** Vertical offset to add to the leg joint's position. */
  dy: number
  /** Rotation about x to add to the foot joint (human legs only). */
  foot: number
}

const A_MAX = 1.42
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

/**
 * A leg with a foot on an ankle joint (a person's, or a horse's with its hoof on the pastern). The foot turns about the
 * ankle to a world angle `phi` (0 level, positive toe down). Solved so the foot's contact point is `f` ahead of where it
 * stands when the leg hangs straight and its lowest point is `h` above the ground. `reach` is pivot to ankle, `pivotY` the
 * pivot height above the ground and `pitch` the pitch of the body the leg hangs from (the leg turns with it, so the
 * body-frame angle is the world angle minus the pitch).
 */
export function solveAnkleLeg(reach: number, geom: FootGeom, f: number, h: number, pivotY: number, phi: number, pitch = 0): LegSolution {
  const fc = footContact(geom, phi)
  const z0 = footContact(geom, 0).z
  const a = Math.asin(clamp((fc.z - f - z0) / reach, -Math.sin(A_MAX), Math.sin(A_MAX)))
  return { a: a - pitch, dy: h - pivotY + reach * Math.cos(a) - fc.y, foot: phi - a }
}

export const solveHumanLeg = (f: number, h: number, pivotY: number, phi: number): LegSolution => solveAnkleLeg(ANKLE, BOOT, f, h, pivotY, phi)
export const solveHorseLeg = (front: boolean, f: number, h: number, pivotY: number, phi: number, pitch: number): LegSolution =>
  solveAnkleLeg((front ? HORSE_LEG.front : HORSE_LEG.back) - HOOF_H, HOOF, f, h, pivotY, phi, pitch)

/** The shared stance / swing shape of one foot over a cycle. u in cycles; f is the forward offset from the hips. */
export function footCycle(u: number, beta: number, A: number, lift: number): { f: number; h: number; stance: boolean; w: number } {
  const x = u - Math.floor(u)
  if (x < beta) return { f: A * (1 - (2 * x) / beta), h: 0, stance: true, w: x / beta }
  const w = (x - beta) / (1 - beta)
  const e = w * w * (3 - 2 * w)
  // lift off with a toe-push, land with the foot a little ahead
  return { f: -A + 2 * A * e, h: lift * Math.pow(Math.sin(Math.PI * w), 0.8), stance: false, w }
}

/** Smooth 0 -> 1 over [0, 1]. */
export const sstep = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/** World angle of a boot over its cycle: heel strike (toe up), flat, heel-off (toe down), then toe-up swing. */
export function bootPitch(x: number, beta: number, roll: number): number {
  const u = x - Math.floor(x)
  if (u < beta) {
    const w = u / beta
    return -roll * 0.55 * (1 - sstep(w / 0.22)) + roll * sstep((w - 0.62) / 0.38)
  }
  const w = (u - beta) / (1 - beta)
  return roll * (1 - sstep(w / 0.55)) - roll * 0.55 * sstep((w - 0.5) / 0.5)
}

/** World angle of a hoof: flat for the whole stance (a flat hoof has corners, so it must not roll), folding toe-down in the swing. */
export function hoofPitch(x: number, beta: number, fold: number): number {
  const u = x - Math.floor(x)
  if (u < beta) return 0
  return fold * Math.sin((Math.PI * (u - beta)) / (1 - beta))
}

/** Weight of a foot being on the ground (fades in and out over the first and last tenth of its stance). */
export function stanceWeight(x: number, beta: number): number {
  const u = x - Math.floor(x)
  if (u >= beta) return 0
  return sstep(u / (0.12 * beta)) * (1 - sstep((u - 0.88 * beta) / (0.12 * beta)))
}

// ---------- gait tables ----------
export interface HumanGaitSpec {
  /** Distance travelled in one full cycle (two steps), rig units. */
  stride: number
  /** Fraction of the cycle a foot is on the ground. */
  beta: number
  lift: number
  hop: number
  lean: number
  armL: number
  armR: number
  twist: number
  /** How far the boot pitches at heel strike and push-off. */
  roll: number
}

export const HUMAN_GAITS: Record<'walk' | 'run', HumanGaitSpec> = {
  // a chunky MGSD marching step (short legs, quick small steps), then a bounding run with a flight phase
  walk: { stride: 0.37, beta: 0.54, lift: 0.045, hop: 0, lean: 0.06, armL: 0.55, armR: 0.2, twist: 0.1, roll: 0.12 },
  run: { stride: 0.62, beta: 0.4, lift: 0.085, hop: 0.03, lean: 0.24, armL: 1.0, armR: 0.38, twist: 0.16, roll: 0.14 },
}

export type HorseGaitName = 'walk' | 'trot' | 'canter' | 'gallop'
export type LegName = 'legFL' | 'legFR' | 'legBL' | 'legBR'

export interface HorseGaitSpec {
  stride: number
  beta: number
  lift: number
  hop: number
  pitch: number
  /** Cycle offset of each foot: this is the footfall order. */
  off: Record<LegName, number>
  /** Neck / head bob per cycle. */
  nod: number
  nodCycles: number
  lean: number
  tail: number
}

export const HORSE_GAITS: Record<HorseGaitName, HorseGaitSpec> = {
  // four-beat walk: hind-left, fore-left, hind-right, fore-right
  walk: { stride: 0.38, beta: 0.72, lift: 0.045, hop: 0, pitch: 0.03, off: { legBL: 0, legFL: 0.25, legBR: 0.5, legFR: 0.75 }, nod: 0.1, nodCycles: 1, lean: 0.03, tail: 0.2 },
  // two-beat trot: diagonal pairs fore-left + hind-right, then fore-right + hind-left, with a suspension between
  trot: { stride: 0.66, beta: 0.44, lift: 0.07, hop: 0.03, pitch: 0.025, off: { legFL: 0, legBR: 0, legFR: 0.5, legBL: 0.5 }, nod: 0.07, nodCycles: 2, lean: 0.08, tail: 0.3 },
  // three-beat canter: hind-left, then hind-right with fore-left, then fore-right (the lead), then suspension
  canter: { stride: 0.94, beta: 0.34, lift: 0.085, hop: 0.045, pitch: 0.06, off: { legBL: 0, legBR: 0.28, legFL: 0.28, legFR: 0.56 }, nod: 0.1, nodCycles: 1, lean: 0.17, tail: 0.5 },
  // four-beat gallop: hind-left, hind-right, fore-left, fore-right, then a long suspension
  gallop: { stride: 1.45, beta: 0.22, lift: 0.1, hop: 0.07, pitch: 0.085, off: { legBL: 0, legBR: 0.12, legFL: 0.4, legFR: 0.52 }, nod: 0.14, nodCycles: 1, lean: 0.3, tail: 0.7 },
}

export type Gait = 'walk' | 'run' | 'trot' | 'canter' | 'gallop'

/** Stride length (distance per cycle, rig units) of a gait; the cycle phase is distance / stride. */
export const strideOf = (gait: Gait, mounted: boolean): number =>
  mounted
    ? HORSE_GAITS[(gait === 'run' ? 'gallop' : gait) as HorseGaitName].stride
    : HUMAN_GAITS[gait === 'walk' ? 'walk' : 'run'].stride

/**
 * Which gaits to blend at a speed (rig units per second). On foot: walk, then run. Mounted: walk, trot, canter, gallop.
 * Returns the two neighbouring gaits and the weight of the second (0 means only the first).
 */
export function gaitBlend(mounted: boolean, v: number): { a: Gait; b: Gait; w: number } {
  const steps: [Gait, number][] = mounted
    ? [['walk', 0], ['trot', 1.05], ['canter', 2.2], ['gallop', 4.2]]
    : [['walk', 0], ['run', 1.7]]
  let k = 0
  for (let i = 1; i < steps.length; i++) if (v >= steps[i]![1] * 0.86) k = i
  if (k === 0) return { a: 'walk', b: 'walk', w: 0 }
  const t = steps[k]![1]
  // cross-fade over +-14% around each threshold
  if (v < t * 1.14) return { a: steps[k - 1]![0], b: steps[k]![0], w: sstep((v - t * 0.86) / (t * 0.28)) }
  return { a: steps[k]![0], b: steps[k]![0], w: 0 }
}
