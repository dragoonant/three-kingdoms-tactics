// Crowd motion: a deterministic timeline of commands compiled into per-member segments, and a pure evaluator
// (member, t) -> Frame (position, heading, tumble and the joint Clip). No three objects, no clock, no Math.random:
// the same commands and the same t give the same pose (docs/spec/52-crowds.md "Determinism").
//
// Commands carry the time they were issued (`at`). Evaluating at a time t uses only commands with at <= t, so scrubbing
// a scene back and forth is safe: issuing a command at an earlier time drops the later ones (the scene replays them),
// and repeating the command a scene is already running (the usual "call it every frame") changes nothing.
import {
  drawBow,
  fallBack,
  fallForward,
  gaitClip,
  horseWalk,
  idle,
  kneel,
  locomotion,
  mix,
  stagger,
  staggerShift,
  stepTurn,
  type Clip,
  type JointDelta,
} from '../../figures/clips'
import type { Gait } from '../../figures/gait'
import { sstep } from '../../figures/gait'
import type { TroopKind } from '../../figures/rig'

export type Vec2 = [number, number]
export type FallStyle = 'back' | 'forward' | 'fling'
export type MemberState = 'idle' | 'turn' | 'march' | 'kneel' | 'stagger' | 'down' | 'flung' | 'fled'

export const TAU = Math.PI * 2
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const clampRange = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const wrap = (a: number): number => {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Everything the evaluator needs to know about one member (fixed at creation, seeded). */
export interface MemberInfo {
  index: number
  kind: TroopKind
  mounted: boolean
  /** Formation slot (crowd-local world units) and the heading the member starts with. */
  x: number
  z: number
  h: number
  /** Effective scale: world units per rig unit for this member (crowd scale x its small size variation). */
  e: number
  /** Time offset of the idle sway, and the gait cycle offset (rig units of distance). */
  phase: number
  dPhase: number
  /** +1 or -1: which leg goes forward when kneeling, which way a horse topples. */
  side: 1 | -1
  /** Small constant lean and head turn so the ranks are not clones, and the heading wobble (already in `h`). */
  lean: number
  look: number
  hBias: number
  /** Per-member speed factor of a rout (0.85..1.15). */
  fleeK: number
  /** Seeded draw of [0,1) per member for fall variety. */
  r: number
}

/** Measured resting offsets of the lying poses, per kind (see crowd.ts `calibrate`). */
export interface Calib {
  /** Rig-unit lift (negative = down) that puts a flung body lying on its back on the sand when it tumbles about a pivot `flingPivot` above its feet. */
  flingDrop: number
  flingPivot: number
  /** Rig-unit lift of a horse lying on its side, and the roll angle it lies at. */
  toppleLift: number
  toppleRoll: number
  /** Same for a horse flung about its middle. */
  flingMountLift: number
  /** Rig-unit lift of a body lying after a back / forward fall (its quiver and spear butt keep it off the sand). */
  backLift: number
  forwardLift: number
}

export const DEFAULT_CALIB: Calib = { flingDrop: -0.22, flingPivot: 0.42, toppleLift: 0.3, toppleRoll: Math.PI / 2, flingMountLift: 0.3, backLift: 0, forwardLift: 0 }

export interface Frame {
  /** Crowd-local ground position (world units) and extra height above the sand (world units). */
  x: number
  z: number
  y: number
  /** Heading (yaw, radians about +Y; 0 faces +Z) and the tumble rotations about the pivot at `pivotY` rig units. */
  h: number
  pitch: number
  roll: number
  pivotY: number
  clip: Clip
  /** Bow arrow still nocked (archers). */
  arrow: boolean
  speed: number
  dist: number
  state: MemberState
}

// ---------------------------------------------------------------- clip algebra
type V3 = [number, number, number]
const add3 = (a: V3 | undefined, b: V3 | undefined): V3 | undefined => (a && b ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : (a ?? b))

function addDelta(a: JointDelta | undefined, b: JointDelta | undefined): JointDelta {
  const r = add3(a?.r, b?.r)
  const p = add3(a?.p, b?.p)
  return { ...(r ? { r } : {}), ...(p ? { p } : {}) }
}

/** Sum of two clips' deltas (layering a pose on a base). */
export function addClips(a: Clip, b: Clip): Clip {
  const pa = a.pose as Record<string, JointDelta>
  const pb = b.pose as Record<string, JointDelta>
  const pose: Record<string, JointDelta> = {}
  for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) pose[k] = addDelta(pa[k], pb[k])
  const ha = (a.horse ?? {}) as Record<string, JointDelta>
  const hb = (b.horse ?? {}) as Record<string, JointDelta>
  const horse: Record<string, JointDelta> = {}
  for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) horse[k] = addDelta(ha[k], hb[k])
  return { pose: pose as Clip['pose'], horse: horse as NonNullable<Clip['horse']> }
}

const bias = (c: Clip, m: MemberInfo): Clip =>
  addClips(c, { pose: { head: { r: [0, m.look * (m.mounted ? 0.5 : 1), 0] }, torso: { r: [m.lean * (m.mounted ? 0.5 : 1), 0, 0] } } })

// ---------------------------------------------------------------- the poses that are not in clips.ts
/** A rider reeling: the horse rears a little and the rider rocks back. p 0..1. */
export function horseStagger(p: number): Clip {
  const e = sstep(p)
  return {
    pose: {
      hips: { r: [-0.22 * e, 0, 0] },
      torso: { r: [-0.3 * e, 0, 0] },
      head: { r: [0.2 * e, 0, 0] },
      armL: { r: [-0.9 * e, 0, -0.6 * e] },
      armR: { r: [-0.6 * e, 0, 0.7 * e] },
    },
    horse: {
      body: { r: [-0.38 * e, 0, 0], p: [0, 0.05 * e, -0.03 * e] },
      neck: { r: [0.3 * e, 0, 0] },
      head: { r: [0.2 * e, 0, 0] },
      legFL: { r: [-0.9 * e, 0, 0] },
      legFR: { r: [-0.7 * e, 0, 0] },
      legBL: { r: [0.1 * e, 0, 0] },
      legBR: { r: [0.1 * e, 0, 0] },
      tail: { r: [0.5 * e, 0, 0] },
    },
  }
}

/** A horse going over and the rider thrown out of the seat; the roll itself is the member's. p 0..1. */
export function horseTopple(p: number): Clip {
  const e = sstep(p)
  return {
    pose: {
      torso: { r: [-0.25 * e, 0, 0.3 * e] },
      head: { r: [0.2 * e, 0, 0.2 * e] },
      armL: { r: [-1.3 * e, 0, -0.9 * e] },
      armR: { r: [-1.1 * e, 0, 0.9 * e] },
      legL: { r: [0.4 * e, 0, -0.5 * e] },
      legR: { r: [0.3 * e, 0, 0.5 * e] },
    },
    horse: {
      neck: { r: [-0.5 * e, 0, 0] },
      head: { r: [-0.3 * e, 0, 0] },
      legFL: { r: [-1.0 * e, 0, 0] },
      legFR: { r: [-0.55 * e, 0, 0] },
      legBL: { r: [0.8 * e, 0, 0] },
      legBR: { r: [0.5 * e, 0, 0] },
      tail: { r: [0.7 * e, 0, 0] },
    },
  }
}

/** The limp body of a flung foot soldier: arms thrown up, legs trailing; the tumble itself is the member's rotation. p 0..1 over the flight. */
export function flungPose(p: number, r: number): Clip {
  const e = sstep(p / 0.35)
  const w = Math.sin(p * 11 + r * 6) * 0.25 * (1 - sstep((p - 0.7) / 0.3))
  return {
    pose: {
      torso: { r: [-0.25 * e, 0, 0.1 * e] },
      head: { r: [0.3 * e, 0, 0.15 * e] },
      armL: { r: [-2.6 * e + w, 0, -0.7 * e] },
      armR: { r: [-2.2 * e - w, 0, 0.8 * e] },
      legL: { r: [0.7 * e - w, 0, -0.35 * e] },
      legR: { r: [-0.3 * e + w, 0, 0.4 * e] },
    },
  }
}

/** The resting shape of a flung body: `fallBack(1)` without its root turn (the member's tumble supplies that). */
export function flungRest(): Clip {
  const pose = { ...fallBack(1).pose }
  delete pose.root
  return { pose }
}

// ---------------------------------------------------------------- compiled segments
type SegKind = 'idle' | 'turn' | 'march' | 'kneel' | 'stagger' | 'fall' | 'fling' | 'flee'

interface Path {
  pts: Vec2[]
  /** Cumulative length at each point. */
  cum: number[]
  /** Heading of each leg (pts[i] -> pts[i+1]). */
  head: number[]
}

function buildPath(pts: Vec2[]): Path {
  const cum = [0]
  const head: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]![0] - pts[i - 1]![0]
    const dz = pts[i]![1] - pts[i - 1]![1]
    cum.push(cum[i - 1]! + Math.hypot(dx, dz))
    head.push(Math.atan2(dx, dz))
  }
  return { pts, cum, head }
}

const CORNER = 0.35
function pathAt(p: Path, s: number): { x: number; z: number; h: number } {
  const n = p.pts.length
  if (n < 2) return { x: p.pts[0]![0], z: p.pts[0]![1], h: 0 }
  let i = 0
  while (i < n - 2 && s > p.cum[i + 1]!) i++
  const leg = Math.max(1e-6, p.cum[i + 1]! - p.cum[i]!)
  const u = (s - p.cum[i]!) / leg
  const a = p.pts[i]!
  const b = p.pts[i + 1]!
  const x = a[0] + (b[0] - a[0]) * u
  const z = a[1] + (b[1] - a[1]) * u
  let h = p.head[i]!
  // round the heading off over CORNER either side of a vertex
  const toEnd = p.cum[i + 1]! - s
  const fromStart = s - p.cum[i]!
  if (i + 1 < n - 1 && toEnd < CORNER) h = h + wrap(p.head[i + 1]! - h) * sstep(0.5 + (CORNER - toEnd) / (2 * CORNER))
  else if (i > 0 && fromStart < CORNER) h = p.head[i - 1]! + wrap(h - p.head[i - 1]!) * sstep(0.5 + fromStart / (2 * CORNER))
  return { x, z, h }
}

interface Seg {
  t0: number
  kind: SegKind
  /** Cross-fade seconds from the previous segment's pose at the moment it ended. */
  blend: number
  x0: number
  z0: number
  h0: number
  /** World distance walked before this segment, and the speed it starts at. */
  d0: number
  v0: number
  // turn
  dur?: number
  h1?: number
  // march / flee
  v1?: number
  ramp?: number
  path?: Path
  offX?: number
  offZ?: number
  theta0?: number
  dirX?: number
  dirZ?: number
  gait?: Gait
  // kneel
  from?: number
  to?: number
  // stagger
  hold?: number
  // fall / fling
  style?: FallStyle
  slideX?: number
  slideZ?: number
  apex?: number
  spin?: number
}

interface BowSeg {
  t0: number
  from: number
  to: number
  dur: number
  release: boolean
}

export type Cmd =
  | { k: 'march'; path: Vec2[] | null; dir: Vec2 | null; speed: number; ramp: number; gait?: Gait }
  | { k: 'halt'; decel: number }
  | { k: 'face'; dir: Vec2 }
  | { k: 'stand' }
  | { k: 'kneel'; on: boolean; dur: number }
  | { k: 'stagger'; dur: number; hold: number }
  | { k: 'fall'; style: FallStyle; dir: Vec2 | null; dist: number; dur: number; apex: number }
  | { k: 'flee'; dir: Vec2; speed: number }
  | { k: 'bow'; from: number | null; to: number; dur: number; release: boolean }

interface Ev {
  at: number
  cmd: Cmd
  members: number[]
}

const sameArr = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])
const sameCmd = (a: Cmd, b: Cmd): boolean => JSON.stringify(a) === JSON.stringify(b)
const trackOf = (c: Cmd): 'bow' | 'base' => (c.k === 'bow' ? 'bow' : 'base')

/** Gravity of a flung body in world units per second squared. */
export const FLING_G = 9
export const flingTime = (apex: number): number => 2 * Math.sqrt((2 * apex) / FLING_G)

interface Kin {
  x: number
  z: number
  y: number
  h: number
  pitch: number
  roll: number
  pivotY: number
  dist: number
  speed: number
  /** Segment progress 0..1 where it has one (the kneel amount for kneel segments). */
  p: number
  /** Signed yaw turned so far (turn segments). */
  turned: number
  state: MemberState
}

export class Timeline {
  private events: Ev[] = []
  private segs: Seg[][] = []
  private bows: BowSeg[][] = []
  private dirty = true
  /** Bumps whenever the commands change (so a caller knows a frozen t needs a redraw). */
  version = 0
  constructor(
    readonly infos: readonly MemberInfo[],
    public calib: Calib = DEFAULT_CALIB,
  ) {}

  private touch(): void {
    this.dirty = true
    this.version++
  }

  get eventCount(): number {
    return this.events.length
  }

  /** Records a command for `members` at time `at` (see the file comment for the rewind and repeat rules). */
  add(at: number, cmd: Cmd, members: readonly number[]): void {
    if (members.length === 0) return
    const sel = [...new Set(members)].sort((a, b) => a - b)
    if (this.events.length && at < this.events[this.events.length - 1]!.at - 1e-9) {
      this.events = this.events.filter((e) => e.at <= at + 1e-9)
      this.touch()
    }
    // a repeat of the command already running for these members (same track, nothing since for them) changes nothing
    const track = trackOf(cmd)
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]!
      if (trackOf(e.cmd) !== track || !e.members.some((m) => sel.includes(m))) continue
      if (sameArr(e.members, sel) && sameCmd(e.cmd, cmd)) return
      // a held bow draw that changes every frame replaces itself instead of piling up
      if (i === this.events.length - 1 && sameArr(e.members, sel) && cmd.k === 'bow' && e.cmd.k === 'bow' && cmd.dur === 0 && e.cmd.dur === 0) {
        this.events[i] = { at, cmd, members: sel }
        this.touch()
        return
      }
      break
    }
    this.events.push({ at, cmd, members: sel })
    this.touch()
  }

  /** Drops every command (a new scene). */
  clear(): void {
    this.events = []
    this.touch()
  }

  // ------------------------------------------------------------ kinematics
  private kin(seg: Seg, m: MemberInfo, t: number): Kin {
    const tau = Math.max(0, t - seg.t0)
    const k: Kin = { x: seg.x0, z: seg.z0, y: 0, h: seg.h0, pitch: 0, roll: 0, pivotY: 0, dist: seg.d0, speed: 0, p: 0, turned: 0, state: 'idle' }
    switch (seg.kind) {
      case 'idle':
        break
      case 'turn': {
        const u = clamp01(tau / (seg.dur ?? 0.3))
        const d = wrap((seg.h1 ?? seg.h0) - seg.h0)
        k.h = seg.h0 + d * sstep(u)
        k.turned = d * sstep(u)
        k.p = u
        k.state = 'turn'
        break
      }
      case 'march':
      case 'flee': {
        const v0 = seg.v0
        const v1 = seg.v1 ?? 0
        const r = seg.ramp ?? 0
        let s: number
        let v: number
        if (r <= 1e-6 || tau >= r) {
          s = r <= 1e-6 ? v1 * tau : ((v0 + v1) / 2) * r + v1 * (tau - r)
          v = v1
        } else {
          v = v0 + ((v1 - v0) * tau) / r
          s = v0 * tau + ((v1 - v0) * tau * tau) / (2 * r)
        }
        k.dist = seg.d0 + s
        k.speed = v
        if (seg.path) {
          const a = pathAt(seg.path, s)
          const phi = a.h - (seg.theta0 ?? 0)
          const c = Math.cos(phi)
          const sn = Math.sin(phi)
          const ox = seg.offX ?? 0
          const oz = seg.offZ ?? 0
          k.x = a.x + ox * c + oz * sn
          k.z = a.z - ox * sn + oz * c
          k.h = a.h + m.hBias
        } else {
          k.x = seg.x0 + (seg.dirX ?? 0) * s
          k.z = seg.z0 + (seg.dirZ ?? 0) * s
          k.h = seg.h1 ?? seg.h0
        }
        k.state = seg.kind === 'flee' ? 'fled' : 'march'
        break
      }
      case 'kneel': {
        k.p = lerp(seg.from ?? 0, seg.to ?? 1, clamp01(tau / (seg.dur ?? 0.5)))
        k.state = k.p > 0.001 ? 'kneel' : 'idle'
        break
      }
      case 'stagger': {
        const dur = seg.dur ?? 0.55
        const up = clamp01(tau / dur)
        const hold = seg.hold ?? 0.5
        const down = hold < 1e8 ? clamp01((tau - dur - hold) / 0.6) : 0
        const p = up * (1 - down)
        k.p = p
        // the planted foot stays put: the body moves back by the step (rig units -> world)
        const back = staggerShift(p) * m.e * (m.mounted ? 0.6 : 1)
        k.x = seg.x0 - Math.sin(seg.h0) * back
        k.z = seg.z0 - Math.cos(seg.h0) * back
        k.state = down >= 1 ? 'idle' : 'stagger'
        break
      }
      case 'fall': {
        const u = clamp01(tau / (seg.dur ?? 0.85))
        k.p = u
        const sl = sstep(Math.min(1, u * 1.15))
        k.x = seg.x0 + (seg.slideX ?? 0) * sl
        k.z = seg.z0 + (seg.slideZ ?? 0) * sl
        if (m.mounted) {
          k.roll = m.side * this.calib.toppleRoll * sstep(u)
          k.y = this.calib.toppleLift * m.e * Math.abs(Math.sin(k.roll))
        } else {
          const e = sstep(u)
          k.y = (seg.style === 'forward' ? this.calib.forwardLift : this.calib.backLift) * m.e * e * e
        }
        k.state = 'down'
        break
      }
      case 'fling': {
        const apex = seg.apex ?? 0.7
        const T = flingTime(apex)
        const u = clamp01(tau / T)
        k.p = u
        const slideT = Math.max(0, tau - T)
        const slide = u < 1 ? u : 1 + 0.22 * (1 - Math.exp(-slideT / 0.18))
        k.x = seg.x0 + (seg.slideX ?? 0) * slide
        k.z = seg.z0 + (seg.slideZ ?? 0) * slide
        const ease = sstep(u)
        const turns = seg.spin ?? 1
        const c = this.calib
        if (m.mounted) {
          k.pivotY = 0.45
          k.roll = m.side * (TAU * turns + c.toppleRoll) * ease
          k.y = 4 * apex * u * (1 - u) + c.flingMountLift * m.e * ease
        } else {
          k.pivotY = c.flingPivot
          k.pitch = -(TAU * turns + Math.PI / 2) * ease
          k.y = 4 * apex * u * (1 - u) + c.flingDrop * m.e * ease
        }
        k.state = u < 1 ? 'flung' : 'down'
        break
      }
    }
    return k
  }

  // ------------------------------------------------------------ poses
  private pose(seg: Seg, kin: Kin, m: MemberInfo, t: number): Clip {
    const ti = t + m.phase
    const mounted = m.mounted
    switch (seg.kind) {
      case 'idle':
        return idle(ti)
      case 'turn':
        if (mounted) return horseWalk((Math.abs(kin.turned) * 0.5) / m.e + m.dPhase)
        return addClips(idle(ti), stepTurn(kin.turned))
      case 'march':
      case 'flee': {
        const dRig = kin.dist / m.e + m.dPhase
        const vRig = kin.speed / m.e
        if (seg.gait) return mix(idle(ti), gaitClip(seg.gait, dRig, mounted), sstep(vRig / 0.3))
        return locomotion({ mount: mounted ? ({} as never) : undefined }, dRig, vRig, ti)
      }
      case 'kneel':
        return mounted ? idle(ti) : addClips(idle(ti), kneel(kin.p, m.side))
      case 'stagger':
        return addClips(idle(ti), mounted ? horseStagger(kin.p) : stagger(kin.p))
      case 'fall':
        if (mounted) return horseTopple(kin.p)
        return seg.style === 'forward' ? fallForward(kin.p) : fallBack(kin.p)
      case 'fling':
        if (mounted) return horseTopple(clamp01(kin.p * 1.6))
        // limp in the air, then the resting shape as the body arrives
        return mix(flungPose(kin.p, m.r), flungRest(), sstep((kin.p - 0.8) / 0.2))
    }
  }

  // ------------------------------------------------------------ compile
  /** The segment of member i that is running at time t. */
  private active(i: number, t: number): Seg {
    const list = this.segs[i]!
    let k = list.length - 1
    while (k > 0 && list[k]!.t0 > t) k--
    return list[k]!
  }

  private compile(): void {
    this.segs = this.infos.map((m) => [{ t0: -Infinity, kind: 'idle', blend: 0, x0: m.x, z0: m.z, h0: m.h, d0: 0, v0: 0 } as Seg])
    this.bows = this.infos.map(() => [])
    const stateAt = (i: number, t: number): Kin => this.kin(this.active(i, t), this.infos[i]!, t)
    const push = (i: number, seg: Seg): void => {
      const list = this.segs[i]!
      // a new segment replaces anything planned at or after its start (several commands in one frame, or a command mid-turn)
      while (list.length > 1 && list[list.length - 1]!.t0 >= seg.t0 - 1e-9) list.pop()
      list.push(seg)
    }
    const from = (t: number, k: Kin): Pick<Seg, 't0' | 'x0' | 'z0' | 'h0' | 'd0' | 'v0'> => ({ t0: t, x0: k.x, z0: k.z, h0: k.h, d0: k.dist, v0: k.speed })
    for (const ev of this.events) {
      const c = ev.cmd
      const at = ev.at
      if (c.k === 'bow') {
        for (const i of ev.members) {
          if (this.infos[i]!.kind !== 'archer') continue
          const list = this.bows[i]!
          while (list.length && list[list.length - 1]!.t0 >= at - 1e-9) list.pop()
          const cur = list.length ? this.bowP(list, at).p : 0
          list.push({ t0: at, from: c.from ?? cur, to: c.to, dur: c.dur, release: c.release })
        }
        continue
      }
      // the fallen and the routed take no more orders
      const targets = ev.members.filter((i) => {
        const list = this.segs[i]!
        const k = list[list.length - 1]!.kind
        return k !== 'fall' && k !== 'fling' && k !== 'flee'
      })
      if (targets.length === 0) continue
      const st = new Map<number, Kin>(targets.map((i) => [i, stateAt(i, at)]))
      switch (c.k) {
        case 'march': {
          // the formation's anchor is the centroid of the marchers when they set off; a path steers it through its waypoints
          let ax = 0
          let az = 0
          for (const i of targets) {
            ax += st.get(i)!.x
            az += st.get(i)!.z
          }
          ax /= targets.length
          az /= targets.length
          let pts: Vec2[]
          if (c.path && c.path.length) pts = [[ax, az], ...c.path.filter((q) => Math.hypot(q[0] - ax, q[1] - az) > 1e-6)]
          else {
            const d = c.dir ?? [0, 1]
            const l = Math.hypot(d[0], d[1]) || 1
            pts = [[ax, az], [ax + (d[0] / l) * 400, az + (d[1] / l) * 400]]
          }
          if (pts.length < 2) pts = [[ax, az], [ax, az + 400]]
          const path = buildPath(pts)
          const theta0 = path.head[0]!
          let turnDur = 0
          for (const i of targets) {
            const d = Math.abs(wrap(theta0 - st.get(i)!.h))
            if (d > 0.08) turnDur = Math.max(turnDur, clampRange(d / 4.5, 0.18, 0.6))
          }
          for (const i of targets) {
            const m = this.infos[i]!
            const s0 = st.get(i)!
            let t1 = at
            let k1 = s0
            if (turnDur > 0) {
              // everyone takes the same time to turn, so the marchers set off together
              push(i, { ...from(at, s0), kind: 'turn', blend: 0.15, dur: turnDur, h1: theta0 + m.hBias })
              t1 = at + turnDur
              k1 = stateAt(i, t1)
            }
            push(i, {
              ...from(t1, k1),
              kind: 'march',
              blend: 0.2,
              v1: c.speed,
              ramp: c.ramp,
              path,
              offX: s0.x - ax,
              offZ: s0.z - az,
              theta0,
              ...(c.gait ? { gait: c.gait } : {}),
            })
          }
          break
        }
        case 'halt':
          for (const i of targets) {
            const s = st.get(i)!
            if (this.active(i, at).kind !== 'march' || s.speed <= 1e-6) continue
            // keep going along the heading while slowing to a stop
            push(i, { ...from(at, s), kind: 'march', blend: 0.25, v1: 0, ramp: c.decel, path: buildPath([[s.x, s.z], [s.x + Math.sin(s.h) * 60, s.z + Math.cos(s.h) * 60]]), offX: 0, offZ: 0, theta0: s.h })
          }
          break
        case 'face': {
          const th = Math.atan2(c.dir[0], c.dir[1])
          let dur = 0.2
          for (const i of targets) dur = Math.max(dur, clampRange(Math.abs(wrap(th - st.get(i)!.h)) / 4.5, 0.2, 0.7))
          for (const i of targets) {
            const m = this.infos[i]!
            const turn: Seg = { ...from(at, st.get(i)!), kind: 'turn', blend: 0.15, dur, h1: th + m.hBias }
            push(i, turn)
            const e = this.kin(turn, m, at + dur)
            push(i, { t0: at + dur, kind: 'idle', blend: 0.2, x0: e.x, z0: e.z, h0: e.h, d0: e.dist, v0: 0 })
          }
          break
        }
        case 'stand':
          for (const i of targets) push(i, { ...from(at, st.get(i)!), kind: 'idle', blend: 0.3, v0: 0 })
          break
        case 'kneel':
          for (const i of targets) {
            if (this.infos[i]!.mounted) continue
            const s = st.get(i)!
            const cur = this.active(i, at)
            if (!c.on && cur.kind !== 'kneel') continue
            push(i, { ...from(at, s), kind: 'kneel', blend: 0.12, from: cur.kind === 'kneel' ? s.p : 0, to: c.on ? 1 : 0, dur: c.dur, v0: 0 })
          }
          break
        case 'stagger':
          for (const i of targets) push(i, { ...from(at, st.get(i)!), kind: 'stagger', blend: 0.08, dur: c.dur, hold: c.hold, v0: 0 })
          break
        case 'fall':
          for (const i of targets) {
            const m = this.infos[i]!
            const s = st.get(i)!
            // the push: along the given direction, or straight away from where the member faces
            let dx = c.dir ? c.dir[0] : -Math.sin(s.h)
            let dz = c.dir ? c.dir[1] : -Math.cos(s.h)
            const l = Math.hypot(dx, dz) || 1
            dx /= l
            dz /= l
            const fling = c.style === 'fling'
            const dist = c.dist * (fling ? 0.85 + 0.3 * m.r : 1)
            const lat = fling ? (m.r - 0.5) * 0.5 * dist : 0
            const slideX = dx * dist + dz * lat
            const slideZ = dz * dist - dx * lat
            if (fling) push(i, { ...from(at, s), kind: 'fling', blend: 0.06, slideX, slideZ, apex: c.apex * (0.85 + 0.3 * m.r), spin: 1, v0: 0 })
            else push(i, { ...from(at, s), kind: 'fall', blend: 0.1, style: c.style, slideX, slideZ, dur: c.dur, v0: 0 })
          }
          break
        case 'flee': {
          const th = Math.atan2(c.dir[0], c.dir[1])
          for (const i of targets) {
            const m = this.infos[i]!
            const s = st.get(i)!
            const dh = Math.abs(wrap(th - s.h))
            const turnDur = dh > 0.15 ? clampRange(dh / 5, 0.16, 0.5) * (0.8 + 0.4 * m.r) : 0
            const h1 = th + m.hBias * 3
            let t1 = at
            let k1 = s
            if (turnDur > 0) {
              push(i, { ...from(at, s), kind: 'turn', blend: 0.08, dur: turnDur, h1 })
              t1 = at + turnDur
              k1 = stateAt(i, t1)
            }
            push(i, { ...from(t1, k1), kind: 'flee', blend: 0.15, v1: c.speed * m.fleeK, ramp: 0.35, dirX: Math.sin(h1), dirZ: Math.cos(h1), h1 })
          }
          break
        }
        default:
          break
      }
    }
    this.dirty = false
  }

  private bowP(list: BowSeg[], t: number): { p: number; arrow: boolean; recoil: number } {
    let p = 0
    let arrow = true
    let recoil = 0
    for (const s of list) {
      if (s.t0 > t) break
      const u = s.dur <= 1e-6 ? 1 : clamp01((t - s.t0) / s.dur)
      p = lerp(s.from, s.to, s.release ? 1 - (1 - u) * (1 - u) : u)
      if (s.release) {
        arrow = t - s.t0 < 0.02
        const w = clamp01((t - s.t0) / 0.3)
        recoil = Math.sin(Math.PI * w) * (1 - w)
      } else {
        arrow = true
        recoil = 0
      }
    }
    return { p, arrow, recoil }
  }

  // ------------------------------------------------------------ evaluation
  frame(i: number, t: number): Frame {
    if (this.dirty) this.compile()
    const m = this.infos[i]!
    const list = this.segs[i]!
    let k = list.length - 1
    while (k > 0 && list[k]!.t0 > t) k--
    const seg = list[k]!
    const kin = this.kin(seg, m, t)
    let clip = this.pose(seg, kin, m, t)
    const since = t - seg.t0
    if (k > 0 && since < seg.blend) {
      const prev = list[k - 1]!
      // the previous pose is held at the moment it ended, so a gait keeps its phase through the fade
      const tp = Math.max(prev.t0, seg.t0)
      clip = mix(this.pose(prev, this.kin(prev, m, tp), m, tp), clip, sstep(since / seg.blend))
    }
    clip = bias(clip, m)
    let arrow = true
    if (m.kind === 'archer') {
      const b = this.bowP(this.bows[i]!, t)
      arrow = b.arrow
      if (b.p > 1e-4 || b.recoil > 1e-3) {
        const upper: Clip = { pose: { ...drawBow(b.p).pose } }
        // standing archers keep the stance of the draw; kneeling and marching ones only turn the upper body
        if (seg.kind !== 'idle') {
          delete upper.pose.legL
          delete upper.pose.legR
        }
        const tremble = b.p > 0.95 ? Math.sin(t * 37 + m.phase * 5) * 0.012 : 0
        clip = addClips(clip, upper)
        clip = addClips(clip, { pose: { armR: { r: [tremble - 0.5 * b.recoil, 0, 0.35 * b.recoil] }, torso: { r: [-0.12 * b.recoil, 0, 0] } } })
      }
    }
    return { x: kin.x, z: kin.z, y: kin.y, h: kin.h, pitch: kin.pitch, roll: kin.roll, pivotY: kin.pivotY, clip, arrow, speed: kin.speed, dist: kin.dist, state: kin.state }
  }

  /** The state a member is in at time t (cheap; builds no clip). */
  stateAt(i: number, t: number): MemberState {
    if (this.dirty) this.compile()
    return this.kin(this.active(i, t), this.infos[i]!, t).state
  }
}
