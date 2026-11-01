// Pure pose helpers over the rig joints, usable by the board and the cut-ins alike.
// A clip is a function of time or progress that returns *deltas* from each joint's rest pose; `applyClip` adds them to the
// rest transform recorded when the figure was built (userData.rest), so one clip fits every figure.
// Nothing here touches the clock, the DOM or randomness.
import type { Object3D } from 'three'
import { HORSE_JOINTS, HUMAN_JOINTS, OPTIONAL_JOINTS, type HorseJoint, type HumanJoint, type Rig } from './rig'

export type Vec3 = [number, number, number]
export interface JointDelta {
  /** Euler rotation added to the rest rotation, radians. */
  r?: Vec3
  /** Offset added to the rest position, tile units. */
  p?: Vec3
}
export type Pose = Partial<Record<HumanJoint, JointDelta>>
export type HorsePose = Partial<Record<HorseJoint, JointDelta>>
export interface Clip {
  pose: Pose
  horse?: HorsePose
}

const ease = (x: number): number => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const S = Math.sin

/** Standing at rest: no deltas at all. */
export function rest(): Clip {
  return { pose: {} }
}

/** Gentle breathing, a little head and sway of beards, capes and tails. */
export function idle(t: number): Clip {
  const b = S(t * 1.7)
  const sway = S(t * 1.7 - 0.9)
  return {
    pose: {
      hips: { p: [0, 0.004 * b, 0] },
      torso: { r: [0.014 * b, 0.02 * S(t * 0.6), 0] },
      head: { r: [0.02 * S(t * 1.7 - 0.5), 0.05 * S(t * 0.45), 0.01 * S(t * 0.8)] },
      armL: { r: [0.02 * b, 0, -0.012 * b] },
      armR: { r: [0.016 * b, 0, 0.012 * b] },
      beard: { r: [0.07 * sway, 0, 0.04 * S(t * 1.1)] },
      cape: { r: [0.05 * sway, 0, 0.03 * S(t * 0.9)] },
    },
    horse: {
      tail: { r: [0.07 * S(t * 1.3), 0, 0.1 * S(t * 0.9)] },
      head: { r: [0.04 * S(t * 0.9), 0, 0] },
      neck: { r: [0.02 * b, 0, 0] },
      legFR: { r: [Math.max(0, S(t * 0.7)) * 0.1, 0, 0] },
    },
  }
}

/** Footman's march: opposite arm and leg swing with a small bob; `t` in seconds, one stride about 0.7 s. */
export function walk(t: number): Clip {
  const ph = t * 9
  const s = S(ph)
  return {
    pose: {
      hips: { p: [0, 0.018 * Math.abs(S(ph)), 0], r: [0, 0.05 * s, 0] },
      torso: { r: [0.04, -0.08 * s, 0] },
      legL: { r: [0.62 * s, 0, 0] },
      legR: { r: [-0.62 * s, 0, 0] },
      armL: { r: [-0.5 * s, 0, 0] },
      armR: { r: [0.22 * s, 0, 0] },
      head: { r: [0.02 * S(2 * ph), 0.05 * s, 0] },
      beard: { r: [0.12 * S(ph - 1), 0, 0] },
      cape: { r: [0.14 + 0.08 * S(ph - 1.2), 0, 0] },
    },
  }
}

/** Horse gallop: the legs pivot at shoulders and hips; the rider bobs in the saddle. `t` in seconds. */
export function gallop(t: number): Clip {
  const ph = t * 10
  const A = 0.85
  return {
    pose: {
      hips: { p: [0, 0.012 * S(2 * ph), 0] },
      torso: { r: [0.1 + 0.03 * S(2 * ph + 1), 0, 0] },
      armR: { r: [0.05 * S(2 * ph), 0, 0] },
      cape: { r: [0.5 + 0.12 * S(2 * ph - 1), 0, 0] },
      beard: { r: [0.35 + 0.1 * S(2 * ph - 1), 0, 0] },
    },
    horse: {
      body: { r: [0.07 * S(2 * ph + 0.5), 0, 0], p: [0, 0.02 * Math.abs(S(ph)), 0] },
      neck: { r: [0.1 * S(2 * ph + 1), 0, 0] },
      head: { r: [0.08 * S(2 * ph + 2), 0, 0] },
      legFL: { r: [A * S(ph), 0, 0] },
      legFR: { r: [A * S(ph + 0.45), 0, 0] },
      legBL: { r: [A * S(ph + Math.PI * 0.85), 0, 0] },
      legBR: { r: [A * S(ph + Math.PI * 0.85 + 0.45), 0, 0] },
      tail: { r: [0.55 + 0.15 * S(2 * ph - 1), 0, 0.08 * S(ph)] },
    },
  }
}

/** Draw a bow: p 0 (rest) .. 1 (fully drawn, held). Turns the body side-on, bow arm out, string hand back to the cheek. */
export function drawBow(p: number): Clip {
  const e = ease(p)
  return {
    pose: {
      torso: { r: [0, 0.95 * e, 0] },
      head: { r: [0, -0.85 * e, 0] },
      armL: { r: [-1.1 * e, -0.35 * e, -1.05 * e] },
      armR: { r: [-0.85 * e, 0.9 * e, 1.0 * e] },
      handL: { r: [0, 0, 0] },
      legL: { r: [-0.18 * e, 0, 0] },
      legR: { r: [0.18 * e, 0, 0] },
    },
  }
}

/** Overhead chop: wind up behind the head (0..0.38), strike down (0.38..0.62), follow through. */
export function swingOverhead(p: number): Clip {
  const w = ease(p / 0.38)
  const s = ease((p - 0.38) / 0.24)
  const arm = -2.7 * w + 2.3 * s
  return {
    pose: {
      hips: { p: [0, 0, 0.08 * s] },
      torso: { r: [-0.22 * w + 0.5 * s, 0, 0] },
      armR: { r: [arm, 0, 0.12 * w] },
      armL: { r: [-0.9 * w + 0.7 * s, 0, 0] },
      head: { r: [-0.1 * w + 0.15 * s, 0, 0] },
      legL: { r: [0.2 * w - 0.45 * s, 0, 0] },
      legR: { r: [-0.1 * w + 0.35 * s, 0, 0] },
    },
  }
}

/** Spear thrust: draw back (0..0.3), lunge forward (0.3..0.6), hold. */
export function thrust(p: number): Clip {
  const w = ease(p / 0.3)
  const s = ease((p - 0.3) / 0.3)
  return {
    pose: {
      hips: { p: [0, 0, -0.04 * w + 0.16 * s] },
      torso: { r: [0.3 * s, -0.35 * w + 0.5 * s, 0] },
      armR: { r: [0.5 * w - 1.0 * s, 0, 0] },
      armL: { r: [-0.2 * w - 0.5 * s, 0, 0] },
      legL: { r: [-0.5 * s + 0.1 * w, 0, 0] },
      legR: { r: [0.45 * s - 0.1 * w, 0, 0] },
      head: { r: [-0.06 * s, 0, 0] },
    },
  }
}

/** Knocked back and down: p 0 standing .. 1 on the back. */
export function fallBack(p: number): Clip {
  const e = ease(p)
  const k = e * e
  return {
    pose: {
      root: { r: [-1.35 * k, 0, 0], p: [0, -0.06 * k, -0.08 * e] },
      torso: { r: [-0.3 * e, 0, 0] },
      head: { r: [-0.35 * e, 0, 0] },
      armL: { r: [-0.6 * e, 0, -0.9 * e] },
      armR: { r: [-0.4 * e, 0, 1.0 * e] },
      legL: { r: [0.5 * e, 0, 0] },
      legR: { r: [0.3 * e, 0, 0] },
    },
  }
}

/** Picks the travel clip that fits the rig: gallop when mounted, walk otherwise. */
export function travel(rig: Rig, t: number): Clip {
  return rig.mount ? gallop(t) : walk(t)
}

// ---------- applying ----------
interface Rest {
  r: Vec3
  p: Vec3
}
const restOf = (o: Object3D): Rest => {
  const u = o.userData as { rest?: Rest }
  if (!u.rest) u.rest = { r: [o.rotation.x, o.rotation.y, o.rotation.z], p: [o.position.x, o.position.y, o.position.z] }
  return u.rest
}
const put = (o: Object3D, d: JointDelta | undefined): void => {
  const r = restOf(o)
  const dr = d?.r
  const dp = d?.p
  o.rotation.set(r.r[0] + (dr?.[0] ?? 0), r.r[1] + (dr?.[1] ?? 0), r.r[2] + (dr?.[2] ?? 0))
  o.position.set(r.p[0] + (dp?.[0] ?? 0), r.p[1] + (dp?.[1] ?? 0), r.p[2] + (dp?.[2] ?? 0))
}

/** Sets every joint to rest + the clip's delta (joints the clip does not mention return to rest; joints the rig lacks are skipped). */
export function applyClip(rig: Rig, clip: Clip): void {
  for (const name of [...HUMAN_JOINTS, ...OPTIONAL_JOINTS] as HumanJoint[]) {
    const j = rig.joints[name]
    if (j) put(j, clip.pose[name])
  }
  if (rig.mount) for (const name of HORSE_JOINTS) put(rig.mount.joints[name], clip.horse?.[name])
}

/** The joint names a clip touches (for tests and tools). */
export function touched(clip: Clip): { human: HumanJoint[]; horse: HorseJoint[] } {
  return { human: Object.keys(clip.pose) as HumanJoint[], horse: Object.keys(clip.horse ?? {}) as HorseJoint[] }
}

/** Largest absolute delta in a clip (0 means exactly the rest pose). */
export function magnitude(clip: Clip): number {
  let m = 0
  const scan = (pose: Pose | HorsePose | undefined): void => {
    if (!pose) return
    for (const d of Object.values(pose) as (JointDelta | undefined)[]) {
      for (const v of [...(d?.r ?? []), ...(d?.p ?? [])]) m = Math.max(m, Math.abs(v))
    }
  }
  scan(clip.pose)
  scan(clip.horse)
  return m
}

/** Blend two clips (for transitions): 0 gives a, 1 gives b. */
export function mix(a: Clip, b: Clip, t: number): Clip {
  const k = clamp01(t)
  const blend = <T extends string>(x: Partial<Record<T, JointDelta>> | undefined, y: Partial<Record<T, JointDelta>> | undefined): Partial<Record<T, JointDelta>> => {
    const out: Partial<Record<T, JointDelta>> = {}
    const keys = new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})]) as Set<T>
    for (const key of keys) {
      const dx = x?.[key]
      const dy = y?.[key]
      const r: Vec3 = [lerp(dx?.r?.[0] ?? 0, dy?.r?.[0] ?? 0, k), lerp(dx?.r?.[1] ?? 0, dy?.r?.[1] ?? 0, k), lerp(dx?.r?.[2] ?? 0, dy?.r?.[2] ?? 0, k)]
      const p: Vec3 = [lerp(dx?.p?.[0] ?? 0, dy?.p?.[0] ?? 0, k), lerp(dx?.p?.[1] ?? 0, dy?.p?.[1] ?? 0, k), lerp(dx?.p?.[2] ?? 0, dy?.p?.[2] ?? 0, k)]
      out[key] = { r, p }
    }
    return out
  }
  return { pose: blend<HumanJoint>(a.pose, b.pose), horse: blend<HorseJoint>(a.horse, b.horse) }
}
