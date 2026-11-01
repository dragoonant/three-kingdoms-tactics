// Scene A — "Fire Arrows over the Millet" (docs/spec/51 Scene A; Jian Yong, Fire Attack; 7.0 s).
// This file is the pure half: layout, the arrow/ignition plan, the shot list, cues and overlay schedule. The renderer
// (FireArrowsWorld.tsx) reads the same plan, so what the camera frames is exactly what the world does.
//
// World frame: +y up, archers kneel at z = -2.4 facing +z, the millet field and 7 rebels lie at z ~ 1.4..5.3, and the
// breeze blows toward +x (the field's far side), so flames run to the right when seen from the rebel side.
import { seededOrder, rand, srand } from '../rng'
import { storyClock, type Cue, type CutinScene, type TimeScaleSeg, type Vec3 } from '../timeline'
import { FIRE, type Ignition } from '../fireModel'

export const A_DURATION = 7.0
export const A_SEED = 7101

export const A_TIMESCALE: TimeScaleSeg[] = [
  { start: 3.1, end: 3.5, rate: 0.5, kind: 'slowmo', ramp: 0.07 },
  { start: 4.05, end: 4.2, rate: 0, kind: 'hitstop' },
]
export const aStory = storyClock(A_TIMESCALE, A_DURATION)

export const A_LAYOUT = {
  archerZ: -2.4,
  archerCount: 6,
  archerX: (i: number): number => -1.05 + 0.42 * i,
  brazier: { x: 0, z: -2.1, len: 2.7 },
  jian: { x: 1.62, z: -3.1 },
  rebelCount: 7,
  rebelX: (i: number): number => -1.38 + 0.46 * i,
  field: { x0: -3.4, x1: 5.6, z0: 1.3, z1: 3.9 },
  wind: [1, 0] as [number, number],
}

export const rebelPos = (i: number): [number, number] => [A_LAYOUT.rebelX(i) + srand(A_SEED, i, 21) * 0.05, 2.55 + srand(A_SEED, i, 22) * 0.16]

/** Story times of the staggered ignition at the brazier: one archer after another, 0.08 s apart. */
export const IGNITE_FIRST = 1.18
export const IGNITE_STEP = 0.08
export const igniteAt = (archer: number): number => IGNITE_FIRST + archer * IGNITE_STEP
export const DRAW_START = 1.92
export const DRAW_FULL = 2.42
export const LOOSE_AT = 2.55

export interface ArrowPlan {
  id: number
  archer: number
  j: number
  /** Story times. */
  launch: number
  land: number
  from: Vec3
  to: Vec3
  apex: number
  /** Which rebel this arrow was aimed at. */
  rebel: number
}

/** The 18 arrows (6 archers x 3), a fan on ballistic arcs. Pure and seeded. */
export function arrowPlan(): ArrowPlan[] {
  const launch0 = aStory(2.55)
  const land0 = aStory(4.05)
  const order = seededOrder(18, A_SEED)
  const out: ArrowPlan[] = []
  for (let id = 0; id < 18; id++) {
    const archer = Math.floor(id / 3)
    const j = id % 3
    const slot = order[id]!
    const rebel = slot % A_LAYOUT.rebelCount
    const [rx, rz] = rebelPos(rebel)
    // a landing spot at or just in front of the target rebel, in the ridges and shields
    const to: Vec3 = [rx + srand(A_SEED, id, 31) * 0.24, 0.02, rz - 0.08 + rand(A_SEED, id, 32) * 0.55]
    const from: Vec3 = [A_LAYOUT.archerX(archer) + (j - 1) * 0.03, 0.34, A_LAYOUT.archerZ + 0.12]
    // the first landing is exactly on the hit-stop; the rest follow in the next 0.45 s
    const extra = slot === 0 ? 0 : 0.03 + rand(A_SEED, id, 33) * 0.42
    const land = land0 + extra
    const launch = launch0 + archer * 0.01 + j * 0.018
    out.push({ id, archer, j, launch, land, from, to, apex: 2.15 + rand(A_SEED, id, 34) * 0.7, rebel })
  }
  // make sure exactly one arrow lands first
  out.sort((a, b) => a.land - b.land)
  const first = out[0]!
  first.land = land0
  const byId = [...out].sort((a, b) => a.id - b.id)
  return byId
}

/** Position of an arrow at story time s (clamped to its flight), and its direction of travel. */
export function arrowAt(a: ArrowPlan, s: number): { p: [number, number, number]; d: [number, number, number]; flying: boolean; q: number } {
  const q = Math.min(1, Math.max(0, (s - a.launch) / (a.land - a.launch)))
  const e = q
  const x = a.from[0] + (a.to[0] - a.from[0]) * e
  const z = a.from[2] + (a.to[2] - a.from[2]) * e
  const y = a.from[1] + (a.to[1] - a.from[1]) * e + 4 * a.apex * e * (1 - e)
  const dq = 1e-3
  const e2 = Math.min(1.002, e + dq)
  const x2 = a.from[0] + (a.to[0] - a.from[0]) * e2
  const z2 = a.from[2] + (a.to[2] - a.from[2]) * e2
  const y2 = a.from[1] + (a.to[1] - a.from[1]) * e2 + 4 * a.apex * e2 * (1 - e2)
  const dl = Math.hypot(x2 - x, y2 - y, z2 - z) || 1
  return { p: [x, y, z], d: [(x2 - x) / dl, (y2 - y) / dl, (z2 - z) / dl], flying: s >= a.launch && s <= a.land, q }
}

export function ignitions(plan: readonly ArrowPlan[]): Ignition[] {
  return plan.map((a) => ({ x: a.to[0], z: a.to[2], t: a.land }))
}

/** Which rebels fall (seeded; the count comes from the engine event's damage). */
export function fallers(count: number): number[] {
  return seededOrder(A_LAYOUT.rebelCount, A_SEED + 5).slice(0, Math.min(count, A_LAYOUT.rebelCount))
}

/** First story time an arrow comes down within `r` of rebel `i`; falls back to the first impact. */
export function rebelHitTime(plan: readonly ArrowPlan[], i: number): number {
  const [rx, rz] = rebelPos(i)
  let best = Infinity
  let any = Infinity
  for (const a of plan) {
    any = Math.min(any, a.land)
    if ((a.to[0] - rx) ** 2 + (a.to[2] - rz) ** 2 < 0.5 * 0.5) best = Math.min(best, a.land)
  }
  return best === Infinity ? any + 0.12 + i * 0.015 : best
}

export const FALL_DURATION = 0.9

function buildCues(plan: readonly ArrowPlan[], falls: number[]): Cue[] {
  const cues: Cue[] = []
  for (let a = 0; a < A_LAYOUT.archerCount; a++) {
    const id = `archer${a}`
    const ig = igniteAt(a)
    cues.push({ actor: id, action: 'wake', start: 0.15, end: 0.6 })
    cues.push({ actor: id, action: 'dip', start: ig - 0.42, end: ig + 0.3, params: { ignite: ig } })
    cues.push({ actor: id, action: 'raise', start: ig + 0.3, end: DRAW_START })
    cues.push({ actor: id, action: 'draw', start: DRAW_START, end: DRAW_FULL })
    cues.push({ actor: id, action: 'hold', start: DRAW_FULL, end: LOOSE_AT })
    cues.push({ actor: id, action: 'release', start: LOOSE_AT, end: LOOSE_AT + 0.35 })
  }
  cues.push({ actor: 'jian-yong', action: 'raise', start: 0.3, end: 0.75 })
  cues.push({ actor: 'jian-yong', action: 'drop', start: LOOSE_AT - 0.12, end: LOOSE_AT + 0.05 })
  for (let r = 0; r < A_LAYOUT.rebelCount; r++) {
    const hit = rebelHitTime(plan, r)
    cues.push({ actor: `rebel${r}`, action: 'wake', start: 0.15, end: 0.6 })
    if (falls.includes(r)) {
      cues.push({ actor: `rebel${r}`, action: 'flinch', start: hit, end: hit + 0.14 })
      cues.push({ actor: `rebel${r}`, action: 'fall', start: hit + 0.14, end: hit + 0.14 + FALL_DURATION })
    } else {
      cues.push({ actor: `rebel${r}`, action: 'flinch', start: hit, end: hit + 0.4 })
      cues.push({ actor: `rebel${r}`, action: 'stagger', start: hit + 0.4, end: aStory(5.6) })
      cues.push({ actor: `rebel${r}`, action: 'retreat', start: aStory(5.6), end: aStory(7.0) })
    }
  }
  return cues
}

export function makeFireArrows(sampleDamage = 420, sampleFalls = 2): CutinScene {
  const plan = arrowPlan()
  const falls = fallers(sampleFalls)
  const dmg = `−${sampleDamage.toLocaleString('en-US')}`
  return {
    id: 'A',
    title: 'Fire Attack',
    officer: 'Jian Yong',
    duration: A_DURATION,
    seed: A_SEED,
    sample: { damage: sampleDamage, falls: sampleFalls },
    beats: [
      { id: 'A1', start: 0.0, end: 0.7, label: 'Dive from the board into Jian Yong’s tile' },
      { id: 'A2', start: 0.7, end: 1.9, label: 'Archers dip arrows in the brazier, tips catch one by one' },
      { id: 'A3', start: 1.9, end: 2.6, label: 'Synchronised draw, bows bend, “Loose!”' },
      { id: 'A4', start: 2.6, end: 4.0, label: 'Tilt up and track the volley, slow-motion at the apex' },
      { id: 'A5', start: 4.0, end: 5.6, label: 'Reverse shot: impact, flames run downwind, rebels fall' },
      { id: 'A6', start: 5.6, end: 7.0, label: 'Rise to a wide shot, pull out to the table, seal' },
    ],
    shots: [
      {
        beat: 'A1',
        from: 0,
        to: 0.7,
        mode: 'smooth',
        keys: [
          { t: 0, pos: [-2.2, 6.4, -9.6], target: [0.2, 0.0, -2.6], fov: 38 },
          { t: 0.36, pos: [-2.4, 2.1, -6.1], target: [-0.9, 0.22, -2.5], fov: 36 },
          { t: 0.7, pos: [-2.5, 0.36, -3.85], target: [-1.15, 0.27, -2.2], fov: 34 },
        ],
      },
      {
        beat: 'A2',
        from: 0.7,
        to: 1.9,
        mode: 'smooth',
        note: 'slow dolly left to right along the line, behind the archers at shoulder height',
        keys: [
          { t: 0.7, pos: [-2.5, 0.36, -3.85], target: [-1.15, 0.27, -2.2], fov: 34 },
          { t: 1.3, pos: [-0.9, 0.37, -3.9], target: [-0.2, 0.28, -2.15], fov: 34 },
          { t: 1.9, pos: [0.9, 0.38, -3.85], target: [1.1, 0.3, -2.1], fov: 34 },
        ],
      },
      {
        beat: 'A3',
        from: 1.9,
        to: 2.6,
        mode: 'smooth',
        note: 'medium close, side-on to the line: the bows bend in profile',
        keys: [
          { t: 1.9, pos: [-3.9, 0.34, -3.5], target: [-0.6, 0.3, -2.3], fov: 30 },
          { t: 2.6, pos: [-3.6, 0.36, -3.4], target: [-0.5, 0.36, -2.25], fov: 28 },
        ],
      },
      {
        beat: 'A4',
        from: 2.6,
        to: 4.0,
        mode: 'smooth',
        note: 'tilt up with the volley; apex under slow motion',
        keys: [
          { t: 2.6, pos: [0.0, 0.24, -4.3], target: [0.0, 0.7, -0.4], fov: 50 },
          { t: 3.3, pos: [0.0, 0.26, -4.4], target: [0.0, 1.9, 0.6], fov: 52 },
          { t: 4.0, pos: [0.0, 0.34, -4.2], target: [0.0, 0.9, 2.6], fov: 48 },
        ],
      },
      {
        beat: 'A5',
        from: 4.0,
        to: 5.6,
        mode: 'smooth',
        note: 'reverse shot from the rebel side, low in the millet',
        keys: [
          { t: 4.0, pos: [0.55, 0.5, 4.55], target: [0.15, 0.6, 0.9], fov: 46 },
          { t: 5.6, pos: [0.25, 0.5, 4.3], target: [0.55, 0.5, 1.2], fov: 44 },
        ],
      },
      {
        beat: 'A6',
        from: 5.6,
        to: 7.0,
        mode: 'smooth',
        note: 'rise to a wide of the burning field, then up and out to the table',
        keys: [
          { t: 5.6, pos: [0.25, 0.5, 4.3], target: [0.55, 0.5, 1.2], fov: 44 },
          { t: 6.25, pos: [0.4, 1.55, 7.3], target: [1.0, 0.15, 1.8], fov: 40 },
          { t: 7.0, pos: [1.0, 6.2, 11.2], target: [1.4, 0.0, 1.2], fov: 38 },
        ],
      },
    ],
    shakes: [
      { at: 4.05, dur: 0.32, amp: 0.045, mode: 'decay' },
      { at: 4.28, dur: 0.3, amp: 0.02, mode: 'decay', freq: 31 },
      { at: 4.5, dur: 0.3, amp: 0.016, mode: 'decay', freq: 23 },
    ],
    timeScale: A_TIMESCALE,
    cues: buildCues(plan, falls),
    overlays: {
      title: { text: 'Fire Attack', sub: 'Jian Yong', inAt: 0.2, inDur: 0.55, outAt: 2.25, outDur: 0.35 },
      callout: { text: 'Loose!', at: 2.02, inDur: 0.18, hold: 0.36, outDur: 0.18 },
      damage: { text: dmg, at: 5.72, paintDur: 0.55, outAt: 99, outDur: 0.1 },
      seal: { at: 6.5, dur: 0.22, glyph: '火' },
      flashes: [{ at: 4.05, dur: 0.15, kind: 'fire', peak: 0.38 }],
      speed: [[0, 0]],
      dof: [
        [0, 0.05],
        [0.7, 0.6],
        [4.0, 0.5],
        [5.6, 0.3],
        [6.6, 0.1],
        [7.0, 0],
      ],
      veil: [[0, 0]],
    },
  }
}

export { FIRE }
