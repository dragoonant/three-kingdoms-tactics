// Scene B — "Thundering Charge" (docs/spec/51 Scene B; Guan Yu; 7.0 s).
// Pure half: the riders' path (a deterministic integral of a speed and turn profile), the rebel line, who falls and when,
// the shot list, cues and overlay schedule. ThunderingChargeWorld.tsx renders exactly this plan.
//
// World frame: +y up. The Han wedge gallops toward +z; the rebel line stands across x at z ~ 3.0 facing -z. After the
// impact the wedge wheels to the right (+x) in a half circle and ends facing the broken line again.
import { HORSE_GAITS, gaitBlend, type HorseGaitName, type LegName } from '../../figures/gait'
import { rand, srand, seededOrder } from '../rng'
import { storyClock, type CamKey, type Cue, type CutinScene, type Slip, type TimeScaleSeg, type Vec3 } from '../timeline'
import { SCENE_INFO } from '../sceneInfo'
import type { LinkPlan } from '../plan'
import { defenderOf, groundKind } from './act'

export const B_DURATION = 7.0
export const B_SEED = 8203

export const B_TIMESCALE: TimeScaleSeg[] = [{ start: 3.6, end: 3.75, rate: 0, kind: 'hitstop' }]
export const bStory = storyClock(B_TIMESCALE, B_DURATION)

export const B_LAYOUT = {
  rebelCount: 7,
  /** Offsets of the wedge in the leader's frame: [right, forward]. Guan Yu leads; three Han cavalry follow. */
  wedge: [
    [0, 0],
    [-0.62, -0.66],
    [0.62, -0.66],
    [0, -1.3],
  ] as [number, number][],
}

export const rebelLine = (i: number): [number, number] => [-1.5 + 0.5 * i + srand(B_SEED, i, 1) * 0.07, 3.05 + srand(B_SEED, i, 2) * 0.16 + (i % 2) * 0.05]

// ---- the riders' path ---------------------------------------------------------------------------------------------

export interface Pose2 {
  x: number
  z: number
  /** radians from +z toward +x */
  heading: number
  speed: number
  /** distance travelled along the path (for the leg cycle) */
  dist: number
}

const smooth = (u: number): number => {
  const x = u < 0 ? 0 : u > 1 ? 1 : u
  return x * x * (3 - 2 * x)
}

/**
 * Leader speed (tiles per second) at story time s. The legs run on the distance covered, so the speeds are chosen for
 * the gaits (figures/gait.ts, in the 0.52-scale figures): trot below about 0.55, canter to about 2.2, gallop above.
 */
export const TOP_SPEED = 3.9
function speedAt(s: number): number {
  if (s < 1.62) return 0
  if (s < 3.1) {
    const u = (s - 1.62) / 1.48
    return 0.45 + (TOP_SPEED - 0.45) * u * u
  }
  if (s < 3.6) return TOP_SPEED
  if (s < 4.4) return TOP_SPEED - (TOP_SPEED - 2.0) * smooth((s - 3.6) / 0.8)
  if (s < 5.8) return 2.0 - 0.7 * smooth((s - 4.4) / 1.4)
  return Math.max(0, 1.3 * (1 - smooth((s - 5.8) / 0.7)))
}

/** Heading in radians at story time s: the wheel to the right between 4.4 and 5.75. */
function headingAt(s: number): number {
  const u = (s - 4.42) / 1.33
  return Math.PI * smooth(u)
}

const PSTEP = 1 / 240
let pathCache: { z0: number; table: Pose2[] } | null = null

/** The leader's start z is chosen so the front hoof meets the first rebel exactly at story 3.6. */
export function fallOrder(count: number): number[] {
  // the rebels nearest the wedge's centre line go down first; ties broken by seed
  const idx = Array.from({ length: B_LAYOUT.rebelCount }, (_, i) => i)
  idx.sort((a, b) => Math.abs(rebelLine(a)[0] - 0.05) + rand(B_SEED, a, 9) * 0.05 - (Math.abs(rebelLine(b)[0] - 0.05) + rand(B_SEED, b, 9) * 0.05))
  return idx.slice(0, Math.min(count, B_LAYOUT.rebelCount))
}

function buildPath(): { z0: number; table: Pose2[] } {
  const n = Math.ceil((B_DURATION + 2) / PSTEP)
  const raw: Pose2[] = []
  let x = 0
  let z = 0
  let dist = 0
  for (let i = 0; i <= n; i++) {
    const s = i * PSTEP
    const v = speedAt(s)
    const th = headingAt(s)
    raw.push({ x, z, heading: th, speed: v, dist })
    x += Math.sin(th) * v * PSTEP
    z += Math.cos(th) * v * PSTEP
    dist += v * PSTEP
  }
  // anchor: the horse's nose (0.45 ahead of the leader) reaches the first rebel at 3.6
  const first = Math.min(...fallOrder(4).map((i) => rebelLine(i)[1]))
  const k = Math.round(3.6 / PSTEP)
  const z0 = first - 0.4 - raw[k]!.z
  return { z0, table: raw.map((p) => ({ ...p, z: p.z + z0 })) }
}

export function leaderAt(s: number): Pose2 {
  if (!pathCache) pathCache = buildPath()
  const t = pathCache.table
  const x = Math.max(0, s) / PSTEP
  const i = Math.min(t.length - 2, Math.floor(x))
  const f = Math.min(1, x - i)
  const a = t[i]!
  const b = t[i + 1]!
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: a.heading + (b.heading - a.heading) * f, speed: a.speed + (b.speed - a.speed) * f, dist: a.dist + (b.dist - a.dist) * f }
}

export const startZ = (): number => leaderAt(0).z

/** World pose of wedge member m (0 = Guan Yu) at story s. */
export function riderAt(m: number, s: number): Pose2 {
  const L = leaderAt(s)
  const [ox, oz] = B_LAYOUT.wedge[m]!
  // before the charge the wedge stands still; offsets rotate with the heading
  const fx = Math.sin(L.heading)
  const fz = Math.cos(L.heading)
  const rx = Math.cos(L.heading)
  const rz = -Math.sin(L.heading)
  return { ...L, x: L.x + rx * ox + fx * oz, z: L.z + rz * ox + fz * oz }
}

const distCache: Float64Array[] = []
/** Distance rider `m` has actually travelled by story time s (the followers swing wider in the wheel): drives the leg cycle. */
export function riderDist(m: number, s: number): number {
  if (!distCache[m]) {
    const n = Math.ceil((B_DURATION + 2) / PSTEP)
    const t = new Float64Array(n + 1)
    let prev = riderAt(m, 0)
    for (let i = 1; i <= n; i++) {
      const q = riderAt(m, i * PSTEP)
      t[i] = t[i - 1]! + Math.hypot(q.x - prev.x, q.z - prev.z)
      prev = q
    }
    distCache[m] = t
  }
  const t = distCache[m]!
  const x = Math.min(t.length - 2, Math.max(0, s) / PSTEP)
  const i = Math.floor(x)
  return t[i]! + (t[i + 1]! - t[i]!) * (x - i)
}
/** Speed of rider `m` at story time s (tiles per second, from the distance table). */
export const riderSpeed = (m: number, s: number): number => (riderDist(m, s + 0.02) - riderDist(m, Math.max(0, s - 0.02))) / (s < 0.02 ? 0.02 + s : 0.04)

export interface Footfall {
  t: number
  x: number
  z: number
  leg: LegName
  /** 0..1, from the speed. */
  power: number
}

const LEG_POS: Record<LegName, [number, number]> = { legFL: [-0.088, 0.2], legFR: [0.088, 0.2], legBL: [-0.088, -0.2], legBR: [0.088, -0.2] }
const HORSE_Z = -0.14
const footfallCache = new Map<string, Footfall[]>()
/**
 * When and where each hoof of rider `m` strikes the sand (for the dust puffs): the cycle phase accumulates distance /
 * stride of the gait the speed calls for, and a hoof lands when its phase (less its footfall offset) crosses a whole cycle.
 * `fs` is the figure scale (rig units to world).
 */
export function footfalls(m: number, fs: number): Footfall[] {
  const key = `${m}|${fs.toFixed(4)}`
  const hit = footfallCache.get(key)
  if (hit) return hit
  const out: Footfall[] = []
  const legs = Object.keys(LEG_POS) as LegName[]
  let ph = 0
  let prev = legs.map(() => 0)
  let first = true
  for (let s = 1.6; s < B_DURATION; s += PSTEP) {
    const v = riderSpeed(m, s) / fs
    if (v < 0.3) continue
    const g = gaitBlend(true, v)
    const name = (g.w > 0.5 ? g.b : g.a) as HorseGaitName
    const spec = HORSE_GAITS[name]
    ph += (v * PSTEP) / spec.stride
    const cur = legs.map((l) => Math.floor(ph - spec.off[l]))
    if (!first) {
      legs.forEach((l, i) => {
        if (cur[i]! > prev[i]!) {
          const R = riderAt(m, s)
          const A = (spec.beta * spec.stride) / 2
          const [lx, lz] = LEG_POS[l]
          const fwd = (lz + HORSE_Z + A) * fs
          const side = lx * fs
          out.push({
            t: s,
            x: R.x + Math.sin(R.heading) * fwd + Math.cos(R.heading) * side,
            z: R.z + Math.cos(R.heading) * fwd - Math.sin(R.heading) * side,
            leg: l,
            power: Math.min(1, v / 5),
          })
        }
      })
    }
    prev = cur
    first = false
  }
  footfallCache.set(key, out)
  return out
}

/** Story time when rider `m` (only the lane that is within 0.45 across) reaches the rebel, by the horse's nose. */
export function contactTime(rebel: number, laneHalfWidth = 0.46): { t: number; by: number } {
  const [rx, rz] = rebelLine(rebel)
  let best = { t: Infinity, by: -1 }
  for (let m = 0; m < B_LAYOUT.wedge.length; m++) {
    for (let s = 3.0; s < 4.6; s += PSTEP) {
      const p = riderAt(m, s)
      const nose = [p.x + Math.sin(p.heading) * 0.42, p.z + Math.cos(p.heading) * 0.42]
      if (Math.abs(nose[0]! - rx) < laneHalfWidth && nose[1]! >= rz - 0.05) {
        if (s < best.t) best = { t: s, by: m }
        break
      }
    }
  }
  return best
}

export interface FlingPlan {
  rebel: number
  /** story time of the contact */
  t: number
  by: 'wedge' | 'sweep'
  /** launch velocity (x, y, z) in tiles/s and spin (x, z) in rad/s */
  v: [number, number, number]
  spin: [number, number]
}

/** Sweep geometry: Guan Yu's glaive swings from his right-forward to left-forward between 3.72 and 4.25 (story). */
export const SWEEP = { from: 3.72, to: 4.22, a0: -1.0, a1: 1.15, reach: 0.78, height: 0.58 }
export const sweepAngle = (s: number): number => {
  const u = Math.min(1, Math.max(0, (s - SWEEP.from) / (SWEEP.to - SWEEP.from)))
  return SWEEP.a0 + (SWEEP.a1 - SWEEP.a0) * (u * u * (3 - 2 * u))
}

export function flingPlan(count: number): FlingPlan[] {
  const order = fallOrder(count)
  const out: FlingPlan[] = []
  order.forEach((rebel, k) => {
    const wedge = k < Math.ceil(order.length / 2)
    const ct = contactTime(rebel)
    const [rx] = rebelLine(rebel)
    if (wedge) {
      const t = ct.t === Infinity ? 3.62 + k * 0.05 : ct.t
      out.push({ rebel, t, by: 'wedge', v: [(rx - 0.0) * 1.4 + srand(B_SEED, rebel, 3) * 0.6, 2.4 + rand(B_SEED, rebel, 4) * 0.8, 2.4 + rand(B_SEED, rebel, 5) * 1.0], spin: [9 + rand(B_SEED, rebel, 6) * 5, srand(B_SEED, rebel, 7) * 4] })
    } else {
      // knocked aside by the sweep: sideways, away from Guan Yu's swing, a little later
      const side = rx >= 0 ? 1 : -1
      out.push({ rebel, t: SWEEP.from + 0.12 + (k - Math.ceil(order.length / 2)) * 0.09, by: 'sweep', v: [side * (1.9 + rand(B_SEED, rebel, 4)), 1.9 + rand(B_SEED, rebel, 5) * 0.6, 1.2 + rand(B_SEED, rebel, 8)], spin: [-(7 + rand(B_SEED, rebel, 6) * 4), side * 6] })
    }
  })
  return out
}

/** The one rebel who drops his spear and turns (B4): the nearest survivor to one end of the line. */
export function dropper(falls: readonly number[]): number {
  for (const i of [5, 1, 6, 0, 4, 2, 3]) if (!falls.includes(i)) return i
  return 0
}

const G = 9.0
export const FLING_GRAVITY = G

function buildCues(falls: FlingPlan[]): Cue[] {
  const cues: Cue[] = []
  const fallIds = falls.map((f) => f.rebel)
  const drop = dropper(fallIds)
  for (let m = 0; m < 4; m++) {
    const id = m === 0 ? 'guan-yu' : `cav${m}`
    cues.push({ actor: id, action: 'wake', start: 0.1, end: 0.55 })
    cues.push({ actor: id, action: 'charge', start: 1.62, end: 3.6 })
    cues.push({ actor: id, action: 'impact', start: 3.6, end: 4.4 })
    cues.push({ actor: id, action: 'wheel', start: 4.42, end: 5.75 })
  }
  cues.push({ actor: 'guan-yu', action: 'rear', start: 0.62, end: 1.6 })
  cues.push({ actor: 'guan-yu', action: 'raise-glaive', start: 0.85, end: 1.3 })
  cues.push({ actor: 'guan-yu', action: 'sweep', start: SWEEP.from, end: SWEEP.to })
  cues.push({ actor: 'guan-yu', action: 'raise-glaive-again', start: 5.4, end: 5.8 })
  for (let i = 0; i < B_LAYOUT.rebelCount; i++) {
    const id = `rebel${i}`
    cues.push({ actor: id, action: 'wake', start: 0.1, end: 0.55 })
    cues.push({ actor: id, action: 'flinch', start: 3.0 + (i % 3) * 0.04, end: 3.6 })
    const f = falls.find((x) => x.rebel === i)
    if (f) {
      cues.push({ actor: id, action: 'fling', start: f.t, end: f.t + 1.0, params: { by: f.by } })
    } else if (i === drop) {
      cues.push({ actor: id, action: 'drop-turn', start: 3.18, end: 3.6 })
      cues.push({ actor: id, action: 'flee', start: 3.6, end: 7.0 })
    } else {
      cues.push({ actor: id, action: 'brace', start: 3.4, end: 3.7 })
      cues.push({ actor: id, action: 'recoil', start: 3.7, end: 4.6 })
      cues.push({ actor: id, action: 'regroup', start: 5.8, end: 7.0 })
    }
  }
  return cues
}

// ---- camera -----------------------------------------------------------------------------------------------------

const circle = (c: Vec3, r: number, deg: number, y: number): Vec3 => [c[0] + r * Math.sin((deg * Math.PI) / 180), y, c[2] + r * Math.cos((deg * Math.PI) / 180)]

function trackKeys(): CamKey[] {
  // ground-level beside the hooves: matches the leader's speed (capped), then lets the riders pull ahead
  const keys: CamKey[] = []
  const ts = [1.6, 1.9, 2.2, 2.5, 2.8, 3.0]
  let cz = leaderAt(1.6).z + 0.15
  let last = 1.6
  for (const t of ts) {
    // integrate camera z with a speed that follows the leader but never exceeds 3.6 tiles/s
    for (let s = last; s < t - 1e-9; s += PSTEP) cz += Math.min(leaderAt(s).speed * 1.0, 3.6) * PSTEP
    last = t
    const L = leaderAt(t)
    keys.push({ t, pos: [2.7, 0.2, cz], target: [0.05, 0.28, L.z + 0.15 + Math.max(0, L.z - cz) * 0.3], fov: 40 + (t - 1.6) * 2.5 })
  }
  return keys
}

/** Scene B. The defaults are the review page's original sample (Guan Yu, 1,060 damage, four fall); a LinkPlan overrides every actor and number. */
export function makeThunderingCharge(sampleDamage = 1060, sampleFalls = 4, params?: LinkPlan): CutinScene {
  const p = params
  const info = SCENE_INFO.B
  const first = !p || p.link === 0
  const casterName = p ? p.caster.name : 'Guan Yu'
  const title = p ? p.stratName : 'Thundering Charge'
  const slips: Slip[] = []
  if (p && p.targets > 1) slips.push({ text: `${p.targets} units struck`, at: 6.0, tone: 'ink', row: 0 })
  if (p?.routed) slips.push({ text: 'Routed', at: 6.1, tone: 'cinnabar', row: p.targets > 1 ? 1 : 0 })
  const z0 = startZ()
  const C: Vec3 = [0, 0.42, z0]
  const falls = flingPlan(sampleFalls)
  const L50 = leaderAt(5.0)
  const L55 = leaderAt(5.6)
  const dmg = sampleDamage > 0 ? `−${sampleDamage.toLocaleString('en-US')}` : ''
  const camB5: Vec3 = [-2.7, 0.62, 5.5]
  return {
    id: 'B',
    title,
    officer: casterName,
    duration: B_DURATION,
    seed: B_SEED,
    sample: { damage: sampleDamage, falls: sampleFalls },
    ...(p ? { params: p } : {}),
    chain: { skipTo: info.skipTo, cutAt: info.cutAt, resultAt: info.resultAt },
    beats: [
      { id: 'B1', start: 0.0, end: 0.6, label: `Dive into ${casterName}’s tile` },
      { id: 'B2', start: 0.6, end: 1.6, label: 'Hero shot: the horse half-rears, glaive raised' },
      { id: 'B3', start: 1.6, end: 3.0, label: 'Ground-level tracking, trot to gallop, “Charge!”' },
      { id: 'B4', start: 3.0, end: 3.6, label: 'Front view of the rebel line, rising shake, rebels flinch' },
      { id: 'B5', start: 3.6, end: 4.4, label: 'Impact: hit-stop, ink splash, the line is ploughed through' },
      { id: 'B6', start: 4.4, end: 5.8, label: 'Whip-pan out of the far side, the riders wheel round' },
      { id: 'B7', start: 5.8, end: 7.0, label: 'Pull up and out to the table, seal' },
    ],
    shots: [
      {
        beat: 'B1',
        from: 0,
        to: 0.6,
        mode: 'smooth',
        keys: [
          { t: 0, pos: [3.6, 6.4, z0 - 6.6], target: [0, 0.0, z0 + 0.4], fov: 38 },
          { t: 0.3, pos: [2.9, 1.9, z0 - 2.4], target: [0, 0.3, z0], fov: 36 },
          { t: 0.6, pos: circle(C, 1.9, 24, 0.27), target: [0, 0.4, z0], fov: 34 },
        ],
      },
      {
        beat: 'B2',
        from: 0.6,
        to: 1.6,
        mode: 'smooth',
        note: 'low front three-quarter, circling 20 degrees',
        keys: [
          { t: 0.6, pos: circle(C, 1.9, 24, 0.27), target: [0, 0.36, z0], fov: 34 },
          { t: 1.1, pos: circle(C, 1.85, 34, 0.29), target: [0, 0.37, z0], fov: 34 },
          { t: 1.6, pos: circle(C, 1.8, 44, 0.3), target: [0, 0.38, z0], fov: 33 },
        ],
      },
      { beat: 'B3', from: 1.6, to: 3.0, mode: 'smooth', note: 'ground level beside the hooves, matching speed then letting them pull ahead', keys: trackKeys() },
      {
        beat: 'B4',
        from: 3.0,
        to: 3.6,
        mode: 'smooth',
        note: 'front of the rebel line; the shake builds',
        keys: [
          { t: 3.0, pos: [-1.5, 0.3, 1.2], target: [0.0, 0.36, 3.0], fov: 38 },
          { t: 3.6, pos: [-1.2, 0.3, 1.7], target: [0.0, 0.38, 3.0], fov: 40 },
        ],
      },
      {
        beat: 'B5',
        from: 3.6,
        to: 4.4,
        mode: 'smooth',
        note: 'three-quarter from the front left: the wedge ploughs through',
        keys: [
          { t: 3.6, pos: camB5, target: [0.1, 0.3, 3.0], fov: 40 },
          { t: 4.4, pos: [-2.55, 0.62, 5.35], target: [0.35, 0.32, 3.25], fov: 40 },
        ],
      },
      {
        beat: 'B6',
        from: 4.4,
        to: 5.8,
        mode: 'smooth',
        whip: { from: 4.62, to: 4.98, blur: 1 },
        note: 'the single whip-pan, then follow the wheel',
        keys: [
          { t: 4.4, pos: [-2.55, 0.62, 5.35], target: [0.35, 0.32, 3.25], fov: 40 },
          { t: 4.6, pos: [-2.55, 0.62, 5.35], target: [0.4, 0.32, 3.3], fov: 40 },
          { t: 5.0, pos: [-2.6, 0.6, 5.3], target: [L50.x + 0.15, 0.4, L50.z], fov: 38 },
          { t: 5.4, pos: [-2.65, 0.52, 5.3], target: [L55.x + 0.3, 0.42, L55.z - 0.1], fov: 38 },
          { t: 5.8, pos: [-2.7, 0.55, 5.3], target: [leaderAt(6.0).x, 0.42, leaderAt(6.0).z], fov: 38 },
        ],
      },
      {
        beat: 'B7',
        from: 5.8,
        to: 7.0,
        mode: 'smooth',
        keys: [
          { t: 5.8, pos: [-2.7, 0.55, 5.3], target: [leaderAt(6.0).x, 0.42, leaderAt(6.0).z], fov: 38 },
          { t: 6.35, pos: [-1.6, 2.2, 9.0], target: [1.0, 0.1, 3.6], fov: 40 },
          { t: 7.0, pos: [0.8, 6.8, 11.6], target: [0.9, 0.0, 3.0], fov: 38 },
        ],
      },
    ],
    shakes: [
      { at: 1.62, dur: 1.38, amp: 0.012, mode: 'ramp', freq: 19 },
      { at: 3.0, dur: 0.6, amp: 0.05, mode: 'ramp', freq: 24 },
      { at: 3.6, dur: 0.34, amp: 0.085, mode: 'decay', freq: 27 },
      { at: 3.85, dur: 0.3, amp: 0.03, mode: 'decay', freq: 31 },
      { at: 4.1, dur: 0.26, amp: 0.02, mode: 'decay', freq: 23 },
    ],
    timeScale: B_TIMESCALE,
    cues: buildCues(falls),
    overlays: {
      title: { text: title, sub: casterName, inAt: first ? 0.12 : info.skipTo + 0.05, inDur: 0.55, outAt: first ? 1.4 : info.skipTo + 1.5, outDur: 0.3 },
      callout: { text: 'Charge!', at: 1.72, inDur: 0.18, hold: 0.55, outDur: 0.2 },
      damage: { text: dmg, at: 5.95, paintDur: 0.55, outAt: 99, outDur: 0.1 },
      seal: { at: 6.5, dur: 0.22, glyph: info.glyph },
      ...(slips.length ? { slips } : {}),
      flashes: [{ at: 3.6, dur: 0.15, kind: 'ink', peak: 0.7 }],
      speed: [
        [0, 0],
        [1.62, 0],
        [2.1, 0.8],
        [2.9, 1],
        [3.25, 0],
        [4.5, 0],
        [4.75, 0.6],
        [5.3, 0.45],
        [5.6, 0],
      ],
      dof: [
        [0, 0.05],
        [0.6, 0.55],
        [3.0, 0.45],
        [4.4, 0.5],
        [5.8, 0.3],
        [6.6, 0.1],
        [7.0, 0],
      ],
      veil: [[0, 0]],
    },
  }
}

/** What the world needs from a plan: the defenders' kind and palette and the ground under them. */
export function chargeWorldSpec(scene: CutinScene): { ground: ReturnType<typeof groundKind>; def: ReturnType<typeof defenderOf> } {
  const p = scene.params
  return { ground: p ? groundKind(p.terrain) : 'plain', def: p ? defenderOf(p) : { kind: 'rebel', palette: 'yellow' } }
}
