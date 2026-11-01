// Cut-in timeline (docs/spec/51-battle-cutins.md). Pure and deterministic: a scene is data, and `evaluate(scene, t)` is a
// function of WALL time t (what the scrubber scrubs). Slow-motion and hit-stop are part of the timeline: they define a
// mapping from wall time to STORY time (what the actors and particles run on), so a scene is exactly `duration` seconds
// long and every beat lands on the spec's time whatever the time scale does inside it.
import { rand } from './rng'

export type Vec3 = readonly [number, number, number]
export type EaseName = 'linear' | 'in' | 'out' | 'inOut' | 'soft'

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u
export const EASE: Record<EaseName, (u: number) => number> = {
  linear: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - (1 - u) * (1 - u) * (1 - u),
  inOut: (u) => u * u * (3 - 2 * u),
  // gentler start and end than inOut, for slow dollies
  soft: (u) => u * u * u * (u * (u * 6 - 15) + 10),
}
const ease = (name: EaseName | undefined, u: number): number => EASE[name ?? 'inOut'](clamp01(u))

// ---- types -------------------------------------------------------------------------------------------------------

export interface Beat {
  id: string
  start: number
  end: number
  label: string
}

export interface CamKey {
  /** Wall time of the key. */
  t: number
  pos: Vec3
  target: Vec3
  fov: number
  /** Easing of the segment that ENDS at this key (segments mode). */
  ease?: EaseName
}

export interface Shot {
  beat: string
  from: number
  to: number
  keys: CamKey[]
  /** 'smooth' runs a Hermite spline through the keys (soft start and stop); 'segments' eases each pair. */
  mode?: 'smooth' | 'segments'
  /** The scene's single whip-pan: horizontal streak strength peaks half-way through [from, to]. */
  whip?: { from: number; to: number; blur: number }
  /** Multiplies the hand-held feel; informational. */
  note?: string
}

export interface ShakeEvent {
  at: number
  dur: number
  /** Camera offset in world units at full strength. */
  amp: number
  /** decay: strongest at once, dies in `dur`. ramp: grows to `amp` over `dur`. */
  mode: 'decay' | 'ramp'
  freq?: number
}

export interface TimeScaleSeg {
  start: number
  end: number
  /** 0 is a hit-stop; 0.5 is half speed. */
  rate: number
  kind: 'slowmo' | 'hitstop'
  /** Seconds over which the rate eases in and out (slow-mo only). */
  ramp?: number
}

export interface Cue {
  /** Actor id, e.g. 'archer3', 'rebel5', 'guan-yu'. */
  actor: string
  action: string
  /** STORY time. */
  start: number
  end: number
  params?: Record<string, number | string>
}

export interface Flash {
  at: number
  dur: number
  kind: 'ink' | 'fire'
  peak: number
}

export interface OverlaySchedule {
  title: { text: string; sub: string; inAt: number; inDur: number; outAt: number; outDur: number }
  callout: { text: string; at: number; inDur: number; hold: number; outDur: number }
  damage: { text: string; at: number; paintDur: number; outAt: number; outDur: number }
  seal: { at: number; dur: number; glyph: string }
  flashes: Flash[]
  /** Brush speed-line strength keyframes [wall t, 0..1]. */
  speed: [number, number][]
  /** Edge defocus strength keyframes [wall t, 0..1] (the shallow depth of field). */
  dof: [number, number][]
  /** Opacity of the black cover at the very start and end of the dive (0 = none). */
  veil: [number, number][]
}

export interface SampleEvent {
  /** Damage dealt, from the engine event (a sample on the review page). */
  damage: number
  /** How many of the target miniatures fall. */
  falls: number
}

export interface CutinScene {
  id: 'A' | 'B'
  title: string
  officer: string
  duration: number
  beats: Beat[]
  shots: Shot[]
  shakes: ShakeEvent[]
  timeScale: TimeScaleSeg[]
  cues: Cue[]
  overlays: OverlaySchedule
  sample: SampleEvent
  seed: number
}

// ---- time mapping ------------------------------------------------------------------------------------------------

const STEP = 1 / 480

interface Clock {
  /** story time at wall index i * STEP */
  table: Float64Array
}
const clocks = new WeakMap<readonly TimeScaleSeg[], Clock>()

export function rateAt(segs: readonly TimeScaleSeg[], t: number): number {
  for (const s of segs) {
    if (t >= s.start && t < s.end) {
      if (s.kind === 'hitstop') return s.rate
      const ramp = Math.min(s.ramp ?? 0, (s.end - s.start) / 2)
      if (ramp <= 0) return s.rate
      const a = clamp01((t - s.start) / ramp)
      const b = clamp01((s.end - t) / ramp)
      return lerp(1, s.rate, EASE.inOut(Math.min(a, b)))
    }
  }
  return 1
}

function clockFor(segs: readonly TimeScaleSeg[], duration: number): Clock {
  let c = clocks.get(segs)
  const n = Math.ceil(duration / STEP) + 2
  if (c && c.table.length >= n) return c
  const table = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const mid = (i - 0.5) * STEP
    table[i] = table[i - 1]! + rateAt(segs, mid) * STEP
  }
  c = { table }
  clocks.set(segs, c)
  return c
}

/** Wall time -> story time (monotone, non-decreasing). Beyond the table it continues at rate 1. */
export function storyAt(segs: readonly TimeScaleSeg[], duration: number, t: number): number {
  if (t <= 0) return Math.max(0, t)
  const { table } = clockFor(segs, duration + 1)
  const x = t / STEP
  const i = Math.floor(x)
  if (i + 1 >= table.length) return table[table.length - 1]! + (t - (table.length - 1) * STEP)
  return lerp(table[i]!, table[i + 1]!, x - i)
}

/** A small helper for scene files: `const S = storyClock(TS, 7)` then `S(3.1)` is the story time at wall time 3.1. */
export function storyClock(segs: readonly TimeScaleSeg[], duration: number): (wall: number) => number {
  return (wall) => storyAt(segs, duration, wall)
}

// ---- camera ------------------------------------------------------------------------------------------------------

export interface CameraPose {
  pos: [number, number, number]
  target: [number, number, number]
  fov: number
}

const v3lerp = (a: Vec3, b: Vec3, u: number): [number, number, number] => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]

function hermite(p0: number, p1: number, m0: number, m1: number, h: number, u: number): number {
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1
}

function shotPose(shot: Shot, t: number): CameraPose {
  const keys = shot.keys
  const first = keys[0]!
  const last = keys[keys.length - 1]!
  if (t <= first.t) return { pos: [...first.pos], target: [...first.target], fov: first.fov }
  if (t >= last.t) return { pos: [...last.pos], target: [...last.target], fov: last.fov }
  let i = 0
  while (i < keys.length - 2 && t >= keys[i + 1]!.t) i++
  const a = keys[i]!
  const b = keys[i + 1]!
  const h = b.t - a.t
  const raw = (t - a.t) / h
  if (shot.mode === 'smooth') {
    const out: number[] = []
    const comps = (key: CamKey): number[] => [...key.pos, ...key.target, key.fov]
    const ca = comps(a)
    const cb = comps(b)
    const cp = keys[i - 1] ? comps(keys[i - 1]!) : null
    const cn = keys[i + 2] ? comps(keys[i + 2]!) : null
    for (let c = 0; c < ca.length; c++) {
      // finite-difference tangents; the shot's first and last keys come to rest
      const m0 = cp ? (cb[c]! - cp[c]!) / (b.t - keys[i - 1]!.t) : 0
      const m1 = cn ? (cn[c]! - ca[c]!) / (keys[i + 2]!.t - a.t) : 0
      out.push(hermite(ca[c]!, cb[c]!, m0, m1, h, raw))
    }
    return { pos: [out[0]!, out[1]!, out[2]!], target: [out[3]!, out[4]!, out[5]!], fov: out[6]! }
  }
  const u = ease(b.ease, raw)
  return { pos: v3lerp(a.pos, b.pos, u), target: v3lerp(a.target, b.target, u), fov: lerp(a.fov, b.fov, u) }
}

function shakeAt(shakes: readonly ShakeEvent[], t: number): [number, number] {
  let x = 0
  let y = 0
  for (const s of shakes) {
    if (t < s.at || t > s.at + s.dur) continue
    const u = (t - s.at) / s.dur
    const env = s.mode === 'decay' ? (1 - u) * (1 - u) : u * u
    const f = s.freq ?? 26
    const ph = s.at * 13.7
    x += s.amp * env * (Math.sin(2 * Math.PI * f * (t - s.at) + ph) + 0.5 * Math.sin(2 * Math.PI * f * 1.73 * (t - s.at) + ph * 1.9))
    y += s.amp * env * (Math.sin(2 * Math.PI * f * 1.21 * (t - s.at) + ph * 0.6) + 0.5 * Math.sin(2 * Math.PI * f * 2.3 * (t - s.at) + ph))
  }
  return [x, y]
}

// ---- overlays ----------------------------------------------------------------------------------------------------

export interface OverlayState {
  title: { text: string; sub: string; reveal: number; alpha: number }
  callout: { text: string; reveal: number; alpha: number }
  damage: { text: string; paint: number; alpha: number }
  seal: { stamp: number; alpha: number; glyph: string }
  flash: { kind: 'ink' | 'fire'; alpha: number; progress: number; seed: number } | null
  speedLines: number
  dof: number
  veil: number
  /** Horizontal whip-pan streak, 0..1. */
  whip: number
}

function curve(keys: readonly [number, number][], t: number): number {
  if (keys.length === 0) return 0
  const first = keys[0]!
  if (t <= first[0]) return first[1]
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!
    if (t <= b[0]) {
      const a = keys[i - 1]!
      return lerp(a[1], b[1], EASE.inOut(clamp01((t - a[0]) / Math.max(1e-6, b[0] - a[0]))))
    }
  }
  return keys[keys.length - 1]![1]
}

export function overlayAt(scene: CutinScene, t: number, whip = 0): OverlayState {
  const o = scene.overlays
  const ti = o.title
  const titleIn = clamp01((t - ti.inAt) / ti.inDur)
  const titleOut = clamp01((t - ti.outAt) / ti.outDur)
  const c = o.callout
  const calloutIn = clamp01((t - c.at) / c.inDur)
  const calloutOut = clamp01((t - (c.at + c.inDur + c.hold)) / c.outDur)
  const d = o.damage
  const dmgPaint = clamp01((t - d.at) / d.paintDur)
  const dmgOut = clamp01((t - d.outAt) / d.outDur)
  const sl = o.seal
  const stamp = clamp01((t - sl.at) / sl.dur)
  let flash: OverlayState['flash'] = null
  for (const f of o.flashes) {
    if (t >= f.at && t <= f.at + f.dur) {
      const p = (t - f.at) / f.dur
      // sharp attack, long tail
      const a = f.peak * (p < 0.12 ? p / 0.12 : Math.pow(1 - (p - 0.12) / 0.88, 1.6))
      flash = { kind: f.kind, alpha: a, progress: p, seed: Math.round(f.at * 1000) }
    }
  }
  return {
    title: { text: ti.text, sub: ti.sub, reveal: EASE.out(titleIn), alpha: t >= ti.inAt ? 1 - EASE.inOut(titleOut) : 0 },
    callout: { text: c.text, reveal: EASE.out(calloutIn), alpha: t >= c.at ? 1 - EASE.inOut(calloutOut) : 0 },
    damage: { text: d.text, paint: EASE.inOut(dmgPaint), alpha: t >= d.at ? 1 - EASE.inOut(dmgOut) : 0 },
    seal: { stamp, alpha: t >= sl.at ? 1 : 0, glyph: sl.glyph },
    flash,
    speedLines: curve(o.speed, t),
    dof: curve(o.dof, t),
    veil: curve(o.veil, t),
    whip,
  }
}

// ---- evaluate ----------------------------------------------------------------------------------------------------

export interface Evaluated {
  /** Wall time, clamped to [0, duration]. */
  t: number
  /** Story time: what actors and particles run on. */
  story: number
  /** Instantaneous time scale (0 in a hit-stop). */
  rate: number
  hitStop: boolean
  beat: Beat
  /** 0..1 through the current beat. */
  beatProgress: number
  camera: CameraPose
  /** Shake already folded into `camera`; this is the offset applied (camera-right, camera-up). */
  shake: [number, number]
  overlay: OverlayState
}

export function beatAt(scene: CutinScene, t: number): Beat {
  for (const b of scene.beats) if (t >= b.start && t < b.end) return b
  return t < 0 ? scene.beats[0]! : scene.beats[scene.beats.length - 1]!
}

export function shotAt(scene: CutinScene, t: number): Shot {
  for (const s of scene.shots) if (t >= s.from && t < s.to) return s
  return t < 0 ? scene.shots[0]! : scene.shots[scene.shots.length - 1]!
}

export function evaluate(scene: CutinScene, tIn: number): Evaluated {
  const t = Math.min(scene.duration, Math.max(0, tIn))
  const beat = beatAt(scene, t)
  const shot = shotAt(scene, t)
  const base = shotPose(shot, t)
  const [sx, sy] = shakeAt(scene.shakes, t)
  // camera basis for the shake offset
  const f: [number, number, number] = [base.target[0] - base.pos[0], base.target[1] - base.pos[1], base.target[2] - base.pos[2]]
  const fl = Math.hypot(f[0], f[1], f[2]) || 1
  f[0] /= fl
  f[1] /= fl
  f[2] /= fl
  // right = f x up(0,1,0)
  let r: [number, number, number] = [-f[2], 0, f[0]]
  const rl = Math.hypot(r[0], r[1], r[2]) || 1
  r = [r[0] / rl, 0, r[2] / rl]
  const u: [number, number, number] = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const off: [number, number, number] = [r[0] * sx + u[0] * sy, r[1] * sx + u[1] * sy, r[2] * sx + u[2] * sy]
  const camera: CameraPose = {
    pos: [base.pos[0] + off[0], base.pos[1] + off[1], base.pos[2] + off[2]],
    target: [base.target[0] + off[0] * 0.6, base.target[1] + off[1] * 0.6, base.target[2] + off[2] * 0.6],
    fov: base.fov,
  }
  let whip = 0
  if (shot.whip && t >= shot.whip.from && t <= shot.whip.to) {
    const p = (t - shot.whip.from) / (shot.whip.to - shot.whip.from)
    whip = shot.whip.blur * Math.sin(Math.PI * clamp01(p))
  }
  const rate = rateAt(scene.timeScale, t)
  return {
    t,
    story: storyAt(scene.timeScale, scene.duration, t),
    rate,
    hitStop: scene.timeScale.some((s) => s.kind === 'hitstop' && t >= s.start && t < s.end),
    beat,
    beatProgress: clamp01((t - beat.start) / (beat.end - beat.start)),
    camera,
    shake: [sx, sy],
    overlay: overlayAt(scene, t, whip),
  }
}

// ---- cues --------------------------------------------------------------------------------------------------------

export interface CueState {
  cue: Cue
  /** 0..1 through the cue (clamped), in story time. */
  p: number
  active: boolean
}

/** The latest cue for `actor` (optionally of one action) that has started by story time s; null before the first. */
export function cueFor(scene: CutinScene, actor: string, s: number, action?: string): CueState | null {
  let best: Cue | null = null
  for (const c of scene.cues) {
    if (c.actor !== actor || (action !== undefined && c.action !== action)) continue
    if (c.start <= s && (best === null || c.start >= best.start)) best = c
  }
  if (!best) return null
  return { cue: best, p: clamp01((s - best.start) / Math.max(1e-6, best.end - best.start)), active: s < best.end }
}

export function actorCues(scene: CutinScene, actor: string): Cue[] {
  return scene.cues.filter((c) => c.actor === actor).sort((a, b) => a.start - b.start)
}

/** Deterministic phase offset in [0,1) for an actor id, so figures do not breathe in sync. */
export function actorPhase(scene: CutinScene, actor: string): number {
  let h = scene.seed
  for (let i = 0; i < actor.length; i++) h = (Math.imul(h, 31) + actor.charCodeAt(i)) | 0
  return rand(h)
}

// ---- validation (used by the unit tests and the review page's beat list) -------------------------------------------

export function validateScene(scene: CutinScene): string[] {
  const problems: string[] = []
  const eps = 1e-6
  const bs = scene.beats
  if (Math.abs(bs[0]!.start) > eps) problems.push('first beat does not start at 0')
  if (Math.abs(bs[bs.length - 1]!.end - scene.duration) > eps) problems.push('last beat does not end at duration')
  for (let i = 1; i < bs.length; i++) if (Math.abs(bs[i]!.start - bs[i - 1]!.end) > eps) problems.push(`gap before ${bs[i]!.id}`)
  const ss = scene.shots
  if (Math.abs(ss[0]!.from) > eps) problems.push('first shot does not start at 0')
  if (Math.abs(ss[ss.length - 1]!.to - scene.duration) > eps) problems.push('last shot does not end at duration')
  for (let i = 0; i < ss.length; i++) {
    const s = ss[i]!
    if (i > 0 && Math.abs(s.from - ss[i - 1]!.to) > eps) problems.push(`gap before shot ${i}`)
    if (Math.abs(s.keys[0]!.t - s.from) > eps || Math.abs(s.keys[s.keys.length - 1]!.t - s.to) > eps) problems.push(`shot ${i} keys do not span its range`)
  }
  const segs = [...scene.timeScale].sort((a, b) => a.start - b.start)
  for (let i = 1; i < segs.length; i++) if (segs[i]!.start < segs[i - 1]!.end) problems.push('time-scale segments overlap')
  return problems
}
