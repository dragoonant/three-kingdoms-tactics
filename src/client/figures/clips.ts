// Pure pose helpers over the rig joints, usable by the board and the cut-ins alike.
// A clip is a function of time or progress that returns *deltas* from each joint's rest pose; `applyClip` adds them to the
// rest transform recorded when the figure was built (userData.rest), so one clip fits every figure.
// Nothing here touches the clock, the DOM or randomness.
import type { Object3D } from 'three'
import {
  ANKLE,
  BOOT,
  HORSE_GAITS,
  HORSE_LEG,
  HUMAN_GAITS,
  HUMAN_LEG,
  bootPitch,
  hoofPitch,
  footCycle,
  footContact,
  gaitBlend,
  solveHorseLeg,
  solveHumanLeg,
  sstep,
  stanceWeight,
  type Gait,
  type HorseGaitName,
  type HorseGaitSpec,
  type HumanGaitSpec,
  type LegName,
} from './gait'
import { HOOF_JOINTS, HORSE_JOINTS, HUMAN_JOINTS, OPTIONAL_JOINTS, type HoofJoint, type HorseJoint, type HumanJoint, type Rig } from './rig'

export { gaitBlend, strideOf, HUMAN_GAITS, HORSE_GAITS } from './gait'
export type { Gait } from './gait'

export type Vec3 = [number, number, number]
export interface JointDelta {
  /** Euler rotation added to the rest rotation, radians. */
  r?: Vec3
  /** Offset added to the rest position, tile units. */
  p?: Vec3
}
export type Pose = Partial<Record<HumanJoint, JointDelta>>
export type HorsePose = Partial<Record<HorseJoint | HoofJoint, JointDelta>>
export interface Clip {
  pose: Pose
  horse?: HorsePose
}

const ease = sstep
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

// ---------- locomotion ----------
// Every gait clip takes the DISTANCE travelled (rig units: tiles of the figure's own scale), not the time. The cycle
// phase is distance / stride, so a unit that speeds up, slows down or stops keeps its feet where they were put (gait.ts
// solves each foot from its world position). A mounted rig gets the horse's footfall cycle plus the rider's seat.
const TAU = Math.PI * 2

function footGait(spec: HumanGaitSpec, d: number): Clip {
  const u = d / spec.stride
  const A = (spec.beta * spec.stride) / 2
  const L = HUMAN_LEG
  const ft = [footCycle(u, spec.beta, A, spec.lift), footCycle(u + 0.5, spec.beta, A, spec.lift)] as const
  const w = [stanceWeight(u, spec.beta), stanceWeight(u + 0.5, spec.beta)] as const
  const phi = [bootPitch(u, spec.beta, spec.roll), bootPitch(u + 0.5, spec.beta, spec.roll)] as const
  // the hips yaw as the legs swing, which moves the hip joints along z: solve twice so the planted foot ignores it
  let twist = 0
  let sol = [solveHumanLeg(ft[0].f, ft[0].h, L, phi[0]), solveHumanLeg(ft[1].f, ft[1].h, L, phi[1])] as const
  for (let it = 0; it < 2; it++) {
    twist = (spec.twist * (sol[1].a - sol[0].a)) / 1.8
    const shift = 0.075 * Math.sin(twist)
    sol = [solveHumanLeg(ft[0].f - shift, ft[0].h, L, phi[0]), solveHumanLeg(ft[1].f + shift, ft[1].h, L, phi[1])] as const
  }
  // body height: the stance feet decide it; with no foot down the body is in flight (the run's hop)
  const wsum = w[0] + w[1]
  const stanceBob = (w[0] * sol[0].dy + w[1] * sol[1].dy) / Math.max(1, wsum)
  const bob = stanceBob + spec.hop * (1 - Math.min(1, wsum))
  const aL = sol[0].a
  const aR = sol[1].a
  const sway = S(TAU * u)
  const flap = S(TAU * 2 * u - 1)
  return {
    pose: {
      hips: { p: [0, bob, 0], r: [0, twist, 0] },
      legL: { r: [aL, 0, 0], p: [0, sol[0].dy - bob, 0] },
      legR: { r: [aR, 0, 0], p: [0, sol[1].dy - bob, 0] },
      footL: { r: [sol[0].foot, 0, 0] },
      footR: { r: [sol[1].foot, 0, 0] },
      torso: { r: [spec.lean, -1.6 * twist, 0.025 * sway] },
      head: { r: [-spec.lean * 0.85, 1.1 * twist, -0.02 * sway] },
      armL: { r: [-spec.armL * aL, 0, 0] },
      armR: { r: [-spec.armR * aR, 0, 0] },
      beard: { r: [0.1 + spec.lean * 0.9 + 0.1 * flap, 0, 0.04 * sway] },
      cape: { r: [0.12 + spec.lean * 1.4 + 0.08 * flap, 0, 0.03 * sway] },
    },
  }
}

/** Footman's march (a chunky step, hips bobbing, arms counter-swinging, the weapon arm nearly still). `d` is distance travelled. */
export const walk = (d: number): Clip => footGait(HUMAN_GAITS.walk, d)
/** Bounding run with a flight phase and a forward lean. `d` is distance travelled. */
export const run = (d: number): Clip => footGait(HUMAN_GAITS.run, d)

const HORSE_LEGS: LegName[] = ['legFL', 'legFR', 'legBL', 'legBR']

function mountedGait(name: HorseGaitName, spec: HorseGaitSpec, d: number): Clip {
  const u = d / spec.stride
  const A = (spec.beta * spec.stride) / 2
  const pitchCycles = name === 'walk' || name === 'trot' ? 2 : 1
  const pitch = spec.pitch * S(TAU * (pitchCycles * u + 0.15))
  const legs = HORSE_LEGS.map((n) => {
    const front = n.startsWith('legF')
    const L = front ? HORSE_LEG.front : HORSE_LEG.back
    const x = u - spec.off[n]
    const f = footCycle(x, spec.beta, A, spec.lift)
    // pitching the body raises the hind pivots and lowers the fore pivots
    const lift = (front ? -0.2 : 0.2) * S(pitch)
    return { n, f, w: stanceWeight(x, spec.beta), sol: solveHorseLeg(front, f.f, f.h, L + lift, hoofPitch(x, spec.beta, 0.45), pitch) }
  })
  const wsum = legs.reduce((a, l) => a + l.w, 0)
  const stanceBob = legs.reduce((a, l) => a + l.w * l.sol.dy, 0) / Math.max(1, wsum)
  const hop = spec.hop * (1 - Math.min(1, wsum))
  const bob = stanceBob + hop
  const horse: HorsePose = {
    body: { r: [pitch, 0, 0.012 * S(TAU * u)], p: [0, bob, 0] },
    neck: { r: [spec.nod * S(TAU * spec.nodCycles * u + 0.9) - spec.lean * 0.25, 0, 0] },
    head: { r: [-spec.nod * 0.7 * S(TAU * spec.nodCycles * u + 1.5) + spec.lean * 0.2, 0, 0] },
    tail: { r: [spec.tail + 0.12 * S(TAU * 2 * u - 1), 0, 0.09 * S(TAU * u)] },
  }
  for (const l of legs) {
    horse[l.n] = { r: [l.sol.a, 0, 0], p: [0, l.sol.dy - bob, 0] }
    horse[l.n.replace('leg', 'hoof') as HoofJoint] = { r: [l.sol.foot, 0, 0] }
  }
  // the rider sits astride: the seat follows the body, the legs grip, the torso leans into the gait, the weapon arm holds
  const jolt = S(TAU * pitchCycles * u + 1.2)
  return {
    pose: {
      root: { p: [0, -0.5 * hop + 0.006 * jolt * (0.4 + spec.lean * 2), 0] },
      hips: { r: [spec.lean * 0.3 + 0.02 * jolt, 0, 0] },
      torso: { r: [spec.lean * 0.7 + 0.03 * jolt, 0, 0] },
      head: { r: [-spec.lean * 0.75 - 0.02 * jolt, 0, 0] },
      legL: { r: [0.1 * S(TAU * pitchCycles * u), 0, -0.03 * jolt] },
      legR: { r: [-0.1 * S(TAU * pitchCycles * u), 0, 0.03 * jolt] },
      armL: { r: [0.05 * jolt, 0, 0] },
      armR: { r: [0.04 * jolt, 0, 0] },
      cape: { r: [0.1 + spec.lean * 1.8 + 0.1 * S(TAU * 2 * u - 1), 0, 0.04 * S(TAU * u)] },
      beard: { r: [0.1 + spec.lean * 1.3 + 0.1 * S(TAU * 2 * u - 1), 0, 0.04 * S(TAU * u)] },
    },
    horse,
  }
}

/** Mounted gaits (a rider on a horse). The footfall order is in gait.ts: walk (4-beat), trot (diagonals), canter (3-beat), gallop (4-beat). */
export const horseWalk = (d: number): Clip => mountedGait('walk', HORSE_GAITS.walk, d)
export const trot = (d: number): Clip => mountedGait('trot', HORSE_GAITS.trot, d)
export const canter = (d: number): Clip => mountedGait('canter', HORSE_GAITS.canter, d)
export const gallop = (d: number): Clip => mountedGait('gallop', HORSE_GAITS.gallop, d)

/** A gait by name for a foot or mounted rig ('run' on a horse is the gallop; a horse gait on foot is the run). */
export function gaitClip(gait: Gait, d: number, mounted: boolean): Clip {
  if (mounted) return gait === 'walk' ? horseWalk(d) : gait === 'trot' ? trot(d) : gait === 'canter' ? canter(d) : gallop(d)
  return gait === 'walk' ? walk(d) : run(d)
}

/** Locomotion at `v` rig units per second after `d` units travelled: the gaits cross-fade at their thresholds and a standing figure idles. */
export function locomotion(rig: Pick<Rig, 'mount'>, d: number, v: number, t: number): Clip {
  const m = !!rig.mount
  const g = gaitBlend(m, v)
  const moving = g.w > 0 ? mix(gaitClip(g.a, d, m), gaitClip(g.b, d, m), g.w) : gaitClip(g.a, d, m)
  return mix(idle(t), moving, sstep(v / 0.3))
}

/** Picks the travel clip that fits the rig: gallop when mounted, walk otherwise. `d` is distance travelled. */
export function travel(rig: Rig, d: number): Clip {
  return rig.mount ? gallop(d) : walk(d)
}

/** Small in-place steps while turning on the spot. `angle` is the yaw turned so far, radians (signed); the feet stay planted as the body turns. */
export const STEP_TURN = { stride: 0.1, beta: 0.6, lift: 0.032, footX: 0.075 }
export function stepTurn(angle: number): Clip {
  const tau = Math.sign(angle) || 1
  const u = (STEP_TURN.footX * Math.abs(angle)) / STEP_TURN.stride
  const A = (STEP_TURN.beta * STEP_TURN.stride) / 2
  const make = (sigma: number, off: number) => {
    const c = footCycle(u + off, STEP_TURN.beta, A, STEP_TURN.lift)
    return { c, w: stanceWeight(u + off, STEP_TURN.beta), sol: solveHumanLeg(-sigma * tau * c.f, c.h, HUMAN_LEG, bootPitch(u + off, STEP_TURN.beta, 0.12)) }
  }
  const l = make(-1, 0)
  const r = make(1, 0.5)
  const bob = (l.w * l.sol.dy + r.w * r.sol.dy) / Math.max(1, l.w + r.w)
  const sway = S(TAU * u)
  return {
    pose: {
      hips: { p: [0, bob, 0] },
      legL: { r: [l.sol.a, 0, 0], p: [0, l.sol.dy - bob, 0] },
      legR: { r: [r.sol.a, 0, 0], p: [0, r.sol.dy - bob, 0] },
      footL: { r: [l.sol.foot, 0, 0] },
      footR: { r: [r.sol.foot, 0, 0] },
      torso: { r: [0.02, 0, 0.03 * sway] },
      head: { r: [0, 0, -0.02 * sway] },
    },
  }
}

/** Kneel on one knee (archers): the weapon arms keep their pose. p 0 standing .. 1 kneeling; `side` +1 puts the right leg forward. */
export function kneel(p: number, side: 1 | -1 = 1): Clip {
  const e = sstep(p)
  const aF = -1.15 * e
  const aR = 1.35 * e
  const phiR = 0.2 * e
  const yR = -ANKLE * Math.cos(aR) + footContact(BOOT, phiR).y
  const yF = -ANKLE * Math.cos(aF) + footContact(BOOT, 0).y
  // hips come down until the rear shin lies on the sand; the front foot is then planted by sliding its joint
  const H = -yR
  const bob = H - HUMAN_LEG
  const dyF = -(H + yF)
  const front = side > 0 ? 'R' : 'L'
  const rear = side > 0 ? 'L' : 'R'
  return {
    pose: {
      hips: { p: [0, bob, 0] },
      [`leg${front}`]: { r: [aF, 0, 0], p: [0, dyF, 0] },
      [`foot${front}`]: { r: [-aF, 0, 0] },
      [`leg${rear}`]: { r: [aR, 0, 0], p: [0, 0, 0] },
      [`foot${rear}`]: { r: [phiR - aR, 0, 0] },
      torso: { r: [0.03 * e, 0, 0] },
    } as Pose,
  }
}

/** How far back (rig units) a stagger moves the body over p 0..1; the caller moves the figure by this so the planted foot stays put. */
export const STAGGER_STEP = 0.16
export const staggerShift = (p: number): number => STAGGER_STEP * sstep(p)

/** Hit and reeling back one step: the near foot stays planted, the other steps back, the torso rocks and the arms fling up. p 0..1. */
export function stagger(p: number): Clip {
  const e = sstep(p)
  const wB = sstep((p - 0.05) / 0.5)
  const H = -STAGGER_STEP * e
  // foot A planted at world 0, foot B steps back to 1.4 steps
  const fA = 0 - H
  const fB = -1.4 * STAGGER_STEP * wB - H
  const hB = 0.05 * Math.pow(Math.sin(Math.PI * wB), 0.8)
  const a = solveHumanLeg(fA, 0, HUMAN_LEG, 0)
  const b = solveHumanLeg(fB, hB, HUMAN_LEG, 0.25 * Math.sin(Math.PI * wB))
  const rock = S(Math.PI * Math.min(1, p * 1.2)) * 0.12
  return {
    pose: {
      legL: { r: [a.a, 0, 0], p: [0, a.dy, 0] },
      legR: { r: [b.a, 0, 0], p: [0, b.dy, 0] },
      footL: { r: [a.foot, 0, 0] },
      footR: { r: [b.foot, 0, 0] },
      torso: { r: [-0.42 * e + rock * 0.4, 0.08 * S(p * 9) * e, 0.06 * S(p * 7) * e] },
      head: { r: [-0.25 * e, 0, 0] },
      armL: { r: [-1.0 * e, 0, -0.7 * e] },
      armR: { r: [-0.6 * e, 0, 0.8 * e] },
    },
  }
}

/** Knocked back and down: p 0 standing .. 1 lying flat on the back on the sand (the figure falls about its heels). */
export function fallBack(p: number): Clip {
  const e = sstep(p)
  const k = e * e
  return {
    pose: {
      // the body turns 90 degrees about the feet and settles on its back (the thickness of the chest keeps it off the sand)
      root: { r: [-(Math.PI / 2) * k, 0, 0], p: [0, 0.2 * k, -0.02 * e] },
      torso: { r: [-0.08 * e, 0, 0] },
      head: { r: [0.12 * e, 0, 0.1 * e] },
      armL: { r: [-0.5 * e, 0, -1.25 * e] },
      armR: { r: [-0.3 * e, 0, 1.3 * e] },
      legL: { r: [0.16 * e, 0, -0.22 * e] },
      legR: { r: [-0.08 * e, 0, 0.26 * e] },
    },
  }
}

/** Pitched forward onto the face: p 0 standing .. 1 lying flat on the front. */
export function fallForward(p: number): Clip {
  const e = sstep(p)
  const k = e * e
  return {
    pose: {
      root: { r: [(Math.PI / 2) * k, 0, 0], p: [0, 0.185 * k, 0.02 * e] },
      torso: { r: [0.06 * e, 0, 0] },
      head: { r: [-0.1 * e, 0, -0.1 * e] },
      armL: { r: [-2.6 * e, 0, -0.35 * e] },
      armR: { r: [-2.5 * e, 0, 0.35 * e] },
      legL: { r: [0.1 * e, 0, -0.16 * e] },
      legR: { r: [-0.12 * e, 0, 0.2 * e] },
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
  if (rig.mount) {
    for (const name of HORSE_JOINTS) put(rig.mount.joints[name], clip.horse?.[name])
    for (const name of HOOF_JOINTS) {
      const j = rig.mount.joints[name]
      if (j) put(j, clip.horse?.[name])
    }
  }
}

/** The joint names a clip touches (for tests and tools). */
export function touched(clip: Clip): { human: HumanJoint[]; horse: (HorseJoint | HoofJoint)[] } {
  return { human: Object.keys(clip.pose) as HumanJoint[], horse: Object.keys(clip.horse ?? {}) as (HorseJoint | HoofJoint)[] }
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
