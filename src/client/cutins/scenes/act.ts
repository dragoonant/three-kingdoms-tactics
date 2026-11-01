// The pure half of the "act" scenes: C (Duel Strike), D (Thunder Roar), R (Ruse), W (Wind) and the three short attack
// scenes. A scene is an ActPlan (who stands where and how they move: tracks, groups, ground and effects) plus the usual
// CutinScene data (beats, shots, cues, overlays). ActWorld.tsx renders exactly this; nothing here touches three or React.
//
// World frame: +y up. The caster's side stands at -z facing +z; the defenders stand at +z facing -z (a side or rear hit turns
// them). Time in cues is STORY time (after slow-motion and hit-stop); beats, shots and overlays are WALL time.
import type { Terrain as TerrainId } from '../../../engine'
import { SCENE_INFO } from '../sceneInfo'
import type { ActorPlan, LinkPlan, SceneId, SidePalette, StrikeTrail, TroopKindName } from '../plan'
import { rand, seededOrder, srand } from '../rng'
import {
  EASE,
  clamp01,
  storyClock,
  type Beat,
  type CamKey,
  type Cue,
  type CutinScene,
  type OverlaySchedule,
  type Shot,
  type Slip,
  type TimeScaleSeg,
  type Vec3,
} from '../timeline'
import { formationSlots, type FormationLayout } from './formation'

export type Vec2 = readonly [number, number]

// ---- tracks -----------------------------------------------------------------------------------------------------

export type SegEase = 'lin' | 'in' | 'out' | 'io'
export interface Seg {
  t0: number
  t1: number
  to: Vec2
  /** Quadratic control point: the segment is a curve (a wheel). */
  via?: Vec2
  ease?: SegEase
}
export interface Track {
  start: Vec2
  /** Heading while standing (radians from +z toward +x). */
  yaw: number
  segs: Seg[]
  /** 'travel': face the way you move; 'fixed': keep `yaw` and walk backwards or sideways (the legs run on the signed distance). */
  face?: 'travel' | 'fixed'
}
export interface TrackPose {
  x: number
  z: number
  yaw: number
  /** Signed speed along the facing, world units per second. */
  speed: number
  /** Distance covered along the facing so far (signed; drives the leg cycle). */
  dist: number
}

const easeF = (e: SegEase | undefined, u: number): number => {
  const x = clamp01(u)
  switch (e) {
    case 'in':
      return x * x
    case 'out':
      return 1 - (1 - x) * (1 - x)
    case 'io':
      return x * x * (3 - 2 * x)
    default:
      return x
  }
}

interface CompiledSeg {
  seg: Seg
  from: Vec2
  len: number
  /** cumulative signed distance at the start of the segment */
  d0: number
  /** arc-length fraction table for curves */
  table: number[] | null
  endYaw: number
  factor: number
}
const compiled = new WeakMap<Track, CompiledSeg[]>()

function bez(a: Vec2, v: Vec2, b: Vec2, e: number): [number, number] {
  const m = 1 - e
  return [m * m * a[0] + 2 * m * e * v[0] + e * e * b[0], m * m * a[1] + 2 * m * e * v[1] + e * e * b[1]]
}
function bezTan(a: Vec2, v: Vec2, b: Vec2, e: number): [number, number] {
  return [2 * (1 - e) * (v[0] - a[0]) + 2 * e * (b[0] - v[0]), 2 * (1 - e) * (v[1] - a[1]) + 2 * e * (b[1] - v[1])]
}

function compile(tr: Track): CompiledSeg[] {
  let c = compiled.get(tr)
  if (c) return c
  c = []
  let from: Vec2 = tr.start
  let d0 = 0
  let yaw = tr.yaw
  const fixedDir: Vec2 = [Math.sin(tr.yaw), Math.cos(tr.yaw)]
  for (const seg of tr.segs) {
    let len = 0
    let table: number[] | null = null
    let factor = 1
    if (seg.via) {
      table = [0]
      let prev = bez(from, seg.via, seg.to, 0)
      for (let i = 1; i <= 24; i++) {
        const p = bez(from, seg.via, seg.to, i / 24)
        len += Math.hypot(p[0] - prev[0], p[1] - prev[1])
        table.push(len)
        prev = p
      }
      const t = bezTan(from, seg.via, seg.to, 1)
      if (Math.hypot(t[0], t[1]) > 1e-6) yaw = Math.atan2(t[0], t[1])
    } else {
      len = Math.hypot(seg.to[0] - from[0], seg.to[1] - from[1])
      if (len > 1e-6) yaw = Math.atan2(seg.to[0] - from[0], seg.to[1] - from[1])
    }
    if (tr.face === 'fixed') {
      const dx = seg.to[0] - from[0]
      const dz = seg.to[1] - from[1]
      factor = len > 1e-6 ? (dx * fixedDir[0] + dz * fixedDir[1]) / len : 0
    }
    c.push({ seg, from, len, d0, table, endYaw: yaw, factor })
    d0 += len * (tr.face === 'fixed' ? factor : 1)
    from = seg.to
  }
  compiled.set(tr, c)
  return c
}

function posAt(cs: CompiledSeg, e: number): [number, number] {
  const { seg, from } = cs
  if (seg.via) return bez(from, seg.via, seg.to, e)
  return [from[0] + (seg.to[0] - from[0]) * e, from[1] + (seg.to[1] - from[1]) * e]
}

function rawAt(tr: Track, cs: CompiledSeg[], s: number): { x: number; z: number; yaw: number; dist: number } {
  if (cs.length === 0 || s <= cs[0]!.seg.t0) return { x: tr.start[0], z: tr.start[1], yaw: tr.yaw, dist: 0 }
  let k = 0
  while (k < cs.length - 1 && s >= cs[k + 1]!.seg.t0) k++
  const c = cs[k]!
  const sg = c.seg
  if (s >= sg.t1) {
    const sign = tr.face === 'fixed' ? c.factor : 1
    return { x: sg.to[0], z: sg.to[1], yaw: tr.face === 'fixed' ? tr.yaw : c.endYaw, dist: c.d0 + c.len * sign }
  }
  const e = easeF(sg.ease, (s - sg.t0) / (sg.t1 - sg.t0))
  const [x, z] = posAt(c, e)
  // distance along the path at parameter e
  let frac = e
  if (c.table) {
    const f = e * 24
    const i = Math.min(23, Math.floor(f))
    frac = (c.table[i]! + (c.table[i + 1]! - c.table[i]!) * (f - i)) / Math.max(1e-9, c.len)
  }
  const sign = tr.face === 'fixed' ? c.factor : 1
  let yaw = tr.yaw
  if (tr.face !== 'fixed') {
    const t = sg.via ? bezTan(c.from, sg.via, sg.to, e) : [sg.to[0] - c.from[0], sg.to[1] - c.from[1]]
    yaw = Math.hypot(t[0]!, t[1]!) > 1e-6 ? Math.atan2(t[0]!, t[1]!) : c.endYaw
  }
  return { x, z, yaw, dist: c.d0 + c.len * frac * sign }
}

/** Where a tracked actor is at story time s, and how fast it is moving along its facing. */
export function trackAt(tr: Track, s: number): TrackPose {
  const cs = compile(tr)
  const a = rawAt(tr, cs, s)
  const h = 0.012
  const b = rawAt(tr, cs, s + h)
  const c = rawAt(tr, cs, s - h)
  return { x: a.x, z: a.z, yaw: a.yaw, dist: a.dist, speed: (b.dist - c.dist) / (s < h ? h + s : 2 * h) }
}

export const still = (x: number, z: number, yaw: number): Track => ({ start: [x, z], yaw, segs: [] })

// ---- plan types -------------------------------------------------------------------------------------------------

export interface GroupSpec {
  id: 'atk' | 'def'
  kind: TroopKindName
  palette: SidePalette
  count: number
  layout: FormationLayout
  seed: number
}
export interface ActActor {
  id: string
  group: 'hero' | 'atk' | 'def'
  index: number
  track: Track
  /** front-rank figure of its formation */
  front: boolean
}
export type GroundKind = 'millet' | 'forest' | 'hill' | 'village' | 'shallows' | 'deck' | 'plain'

export interface ActFx {
  /** Brush shockwave rings (D): emitted at story time `t0` from `origin`, expanding at `speed` for `life` seconds. */
  rings?: { t0: number; origin: [number, number, number]; speed: number; life: number }[]
  /** The strike's weapon trail (C): drawn from `t0` at `at`, facing `yaw`. */
  trail?: { kind: StrikeTrail; t0: number; at: [number, number]; yaw: number }
  /** Ink smoke drifting from a hand to the targets (R). */
  smoke?: { t0: number; from: [number, number, number]; to: [number, number, number]; dur: number }
  /** Wind banners and incense (W): `dir` is the world heading of the new wind (radians from +z toward +x), null when calm. */
  wind?: { t0: number; dir: number | null; altar: [number, number]; poles: [number, number][] }
  /** Brush spirals over confused figures: actor ids and the story time they start. */
  spirals?: { actor: string; from: number }[]
  /** Arrows of a volley (S-archer): one flight per entry. */
  arrows?: { from: [number, number, number]; to: [number, number, number]; launch: number; land: number; apex: number }[]
  /** Ground dust kicked up by the running line (set for scenes where troops run). */
  dust?: boolean
  /** The caster opens his mouth to roar between these story times. */
  roar?: { from: number; to: number }
}
export interface ActPlan {
  hero: ActorPlan | null
  heroMounted: boolean
  groups: GroupSpec[]
  actors: ActActor[]
  ground: { kind: GroundKind; terrain: TerrainId; seed: number; center: Vec2; halfW: number; halfD: number }
  fx: ActFx
  focus: [number, number]
  /** Weapon read of the hero for the strike poses. */
  weapon: StrikeTrail
}

export function groundKind(t: TerrainId): GroundKind {
  switch (t) {
    case 'farm':
    case 'reeds':
      return 'millet'
    case 'forest':
      return 'forest'
    case 'hill':
      return 'hill'
    case 'village':
      return 'village'
    case 'shallows':
    case 'ford':
    case 'river':
    case 'water':
      return 'shallows'
    case 'deck':
      return 'deck'
    default:
      return 'plain'
  }
}

/** The opposing palette and a plain troop kind for a defender the plan does not name (a stratagem that hit nobody). */
export function defenderOf(p: LinkPlan): { kind: TroopKindName; palette: SidePalette } {
  if (p.defender) return { kind: p.defender.kind, palette: p.defender.palette }
  return p.caster.palette === 'yellow' ? { kind: 'infantry', palette: 'han' } : { kind: 'rebel', palette: 'yellow' }
}

/** Indices (into `count` figures, front rank first) that fall, centre-out, with a seeded tiebreak. Pure. */
export function pickFallers(slots: { r: number; front: boolean }[], falls: number, aim = 0, seed = 1): number[] {
  const order = slots
    .map((s, i) => ({ i, k: (s.front ? 0 : 100) + Math.abs(s.r - aim) + rand(seed, i, 9) * 0.06 }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.i)
  return order.slice(0, Math.min(falls, slots.length))
}

// ---- builder helpers --------------------------------------------------------------------------------------------

const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z]
const key = (t: number, pos: Vec3, target: Vec3, fov: number): CamKey => ({ t, pos, target, fov })

class Cues {
  readonly list: Cue[] = []
  add(actor: string, action: string, start: number, end: number, params?: Record<string, number | string>): void {
    this.list.push({ actor, action, start, end, ...(params ? { params } : {}) })
  }
}

/** The dive: high over the table, pushing in to the first shot. */
function diveShot(beat: string, dur: number, hold: Vec3, tgt: Vec3, fov: number, over: Vec3, flip = false): Shot {
  const f = flip ? -1 : 1
  return {
    beat,
    from: 0,
    to: dur,
    mode: 'smooth',
    keys: [
      key(0, [over[0] + 3.4, 6.4, over[2] - 6.4 * f], [over[0], 0, over[2]], 38),
      key(dur * 0.5, [(over[0] + hold[0]) / 2 + 1.2, 2.2, (over[2] + hold[2]) / 2 - 2.0 * f], [tgt[0], 0.26, tgt[2]], 36),
      key(dur, hold, tgt, fov),
    ],
  }
}

/** The pull-out: from the last shot's pose up and out to the table. */
function pullShot(beat: string, t0: number, t1: number, fromPos: Vec3, fromTgt: Vec3, fromFov: number, over: Vec3, flip = false): Shot {
  const mid = t0 + (t1 - t0) * 0.5
  const f = flip ? -1 : 1
  return {
    beat,
    from: t0,
    to: t1,
    mode: 'smooth',
    keys: [
      key(t0, fromPos, fromTgt, fromFov),
      key(mid, [(fromPos[0] + over[0]) / 2 - 0.4, 2.3, (fromPos[2] + over[2] - 6 * f) / 2], [over[0], 0.2, over[2]], 40),
      key(t1, [over[0] + 0.7, 6.6, over[2] - 6.8 * f], [over[0], 0, over[2] + 0.2 * f], 38),
    ],
  }
}

const money = (n: number): string => `−${Math.round(n).toLocaleString('en-US')}`

interface OvOpts {
  title?: { text: string; sub: string; inAt?: number; outAt?: number }
  callout?: { text: string; at: number; hold?: number; side?: 'left' }
  damage: { text: string; at: number }
  seal: { at: number; glyph: string }
  flashes?: OverlaySchedule['flashes']
  speed?: [number, number][]
  dof?: [number, number][]
  slips?: Slip[]
  windArrow?: OverlaySchedule['windArrow']
}
function overlays(o: OvOpts, duration: number): OverlaySchedule {
  return {
    title: { text: o.title?.text ?? '', sub: o.title?.sub ?? '', inAt: o.title?.inAt ?? 0.2, inDur: 0.5, outAt: o.title?.outAt ?? 2.3, outDur: 0.3 },
    callout: { text: o.callout?.text ?? '', at: o.callout?.at ?? 0, inDur: 0.18, hold: o.callout?.hold ?? 0.5, outDur: 0.2, ...(o.callout?.side ? { side: o.callout.side } : {}) },
    damage: { text: o.damage.text, at: o.damage.at, paintDur: 0.5, outAt: 99, outDur: 0.1 },
    seal: { at: o.seal.at, dur: 0.22, glyph: o.seal.glyph },
    flashes: o.flashes ?? [],
    speed: o.speed ?? [[0, 0]],
    dof: o.dof ?? [
      [0, 0.05],
      [0.6, 0.5],
      [duration - 1.4, 0.4],
      [duration - 0.4, 0.1],
      [duration, 0],
    ],
    veil: [[0, 0]],
    ...(o.slips ? { slips: o.slips } : {}),
    ...(o.windArrow ? { windArrow: o.windArrow } : {}),
  }
}

function baseScene(id: SceneId, p: LinkPlan, beats: Beat[], shots: Shot[], ts: TimeScaleSeg[], cues: Cue[], ov: OverlaySchedule, act: ActPlan, seed: number, shakes: CutinScene['shakes']): CutinScene {
  const info = SCENE_INFO[id]
  return {
    id,
    title: p.stratName || info.title,
    officer: p.caster.name,
    duration: info.duration,
    beats,
    shots,
    shakes,
    timeScale: ts,
    cues,
    overlays: ov,
    sample: { damage: p.damage, falls: p.falls },
    seed,
    params: p,
    chain: { skipTo: info.skipTo, cutAt: info.cutAt, resultAt: info.resultAt },
    act,
  }
}

const KIND_LABEL: Record<TroopKindName, string> = { infantry: 'Infantry', archer: 'Archers', cavalry: 'Cavalry', rebel: 'Rebels' }
export const kindLabel = (k: TroopKindName): string => KIND_LABEL[k]

/** Title slip for full scenes: the stratagem name and the officer; chain links 2+ have no dive so the title comes in at once. */
function titleOf(p: LinkPlan, skipTo: number): OvOpts['title'] {
  const first = p.link === 0
  return { text: p.stratName, sub: p.caster.name, inAt: first ? 0.2 : skipTo + 0.05, outAt: first ? 2.3 : skipTo + 1.7 }
}

// ---- C: Duel Strike ---------------------------------------------------------------------------------------------

export const C_TS: TimeScaleSeg[] = [
  { start: 1.9, end: 2.2, rate: 0.5, kind: 'slowmo', ramp: 0.06 },
  { start: 2.4, end: 2.54, rate: 0, kind: 'hitstop' },
]
const C = storyClock(C_TS, 6.0)

export function makeDuelStrike(p: LinkPlan): CutinScene {
  const seed = 9301 + p.falls * 7
  const mounted = p.caster.mounted
  const M = mounted ? 1.5 : 1
  const def = defenderOf(p)
  const fz = 1.5
  const defSlots = formationSlots('block', 13, 0.46, seed)
  const atkN = mounted ? 4 : 6
  const atkSlots = formationSlots(mounted ? 'wedge' : 'block', atkN, 0.46, seed + 1)
  // the hero's run: walk to run to the clash
  const hitZ = fz - 0.64
  const run = 2.6 * M
  const d1 = (run * (C(1.5) - C(0.6))) / 2
  const d2 = run * (C(2.4) - C(1.5))
  const z0 = hitZ - d1 - d2
  const heroTrack: Track = { start: [0, z0], yaw: 0, segs: [{ t0: C(0.6), t1: C(1.5), to: [0, z0 + d1], ease: 'in' }, { t0: C(1.5), t1: C(2.4), to: [0, hitZ], ease: 'lin' }] }
  const hit = C(2.4)
  const actors: ActActor[] = [{ id: 'hero', group: 'hero', index: 0, track: heroTrack, front: true }]
  const cues = new Cues()
  // the hero's own troops follow, then pour in through the broken line
  atkSlots.forEach((sl, i) => {
    const delay = 0.05 * i
    const sx = sl.r * 1.0
    const sz = z0 - 0.55 - sl.b
    const midZ = hitZ - 0.55 - sl.b * 0.5
    const endZ = fz + 0.35 - sl.b * 0.55
    actors.push({
      id: `atk${i}`,
      group: 'atk',
      index: i,
      front: sl.front,
      track: {
        start: [sx, sz],
        yaw: 0,
        segs: [
          { t0: C(0.7 + delay), t1: C(2.5), to: [sx * 1.05, midZ], ease: 'io' },
          { t0: C(2.7 + delay), t1: C(4.2), to: [sx * 1.3, endZ], ease: 'out' },
        ],
      },
    })
    cues.add(`atk${i}`, 'strike', C(3.55 + delay), C(3.95 + delay))
  })
  // the defenders: the front rank is hit centre-out; the second rank staggers and gives ground
  const fallers = pickFallers(defSlots, p.falls, 0, seed)
  const dfx = (sl: { r: number; b: number }): [number, number] => [sl.r, fz + sl.b]
  defSlots.forEach((sl, i) => {
    const [x, z] = dfx(sl)
    const id = `def${i}`
    const falls = fallers.includes(i)
    const track: Track = { start: [x, z], yaw: Math.PI, face: 'fixed', segs: [] }
    if (!falls) track.segs.push({ t0: C(3.3), t1: C(4.7), to: [x + srand(seed, i, 4) * 0.15, z + 0.55 + (sl.front ? 0 : 0.1)], ease: 'io' })
    actors.push({ id, group: 'def', index: i, track, front: sl.front })
    cues.add(id, 'brace', C(1.7), hit)
    const d = Math.abs(sl.r)
    const delay = sl.front ? d * 0.03 : 0.12 + d * 0.03
    if (falls) {
      const side = sl.r >= 0 ? 1 : -1
      cues.add(id, 'fling', hit + delay, hit + delay + 1.0, {
        vx: side * (0.5 + rand(seed, i, 1) * 1.1) * (p.trail === 'arc' ? 1.6 : 1),
        vy: 1.7 + rand(seed, i, 2) * 0.7,
        vz: (p.trail === 'line' ? 2.7 : 2.0) + rand(seed, i, 3) * 0.9,
        sx: 8 + rand(seed, i, 6) * 4,
        sz: srand(seed, i, 7) * 3,
      })
    } else {
      cues.add(id, 'stagger', hit + delay, hit + delay + 0.7)
      cues.add(id, 'wary', hit + delay + 0.7, C(6.0))
    }
  })
  cues.add('hero', 'windup', C(1.6), hit, { trail: p.trail })
  cues.add('hero', 'strike', hit, hit + 0.45, { trail: p.trail })
  cues.add('hero', 'recover', hit + 0.45, C(6.0))
  const act: ActPlan = {
    hero: p.caster,
    heroMounted: mounted,
    groups: [
      { id: 'atk', kind: p.caster.kind, palette: p.caster.palette, count: atkN, layout: mounted ? 'wedge' : 'block', seed },
      { id: 'def', kind: def.kind, palette: def.palette, count: 13, layout: 'block', seed },
    ],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, fz + 0.3], halfW: 3.4, halfD: 1.7 },
    fx: { trail: { kind: p.trail, t0: hit, at: [0, hitZ], yaw: 0 }, dust: true },
    focus: [0, 0.2],
    weapon: p.trail,
  }
  const H = (t: number): { x: number; z: number } => {
    const q = trackAt(heroTrack, C(t))
    return { x: q.x, z: q.z }
  }
  const h06 = H(0.6)
  const h11 = H(1.1)
  const h16 = H(1.6)
  const h24 = H(2.4)
  const hold1 = v3(2.2, 0.34, h06.z + 0.1)
  const shots: Shot[] = [
    diveShot('C1', 0.6, hold1, v3(0, 0.3, h06.z + 0.5), 36, v3(0, 0, z0 + 0.5)),
    {
      beat: 'C2',
      from: 0.6,
      to: 1.6,
      mode: 'smooth',
      keys: [key(0.6, hold1, v3(0, 0.3, h06.z + 0.5), 36), key(1.1, v3(2.1, 0.32, h11.z + 0.2), v3(0, 0.3, h11.z + 0.45), 37), key(1.6, v3(1.9, 0.3, h16.z + 0.35), v3(0, 0.3, h16.z + 0.55), 38)],
    },
    {
      beat: 'C3',
      from: 1.6,
      to: 2.4,
      mode: 'smooth',
      note: 'low close-up on the wind-up; slow motion 1.9-2.2',
      keys: [key(1.6, v3(1.9, 0.3, h16.z + 0.35), v3(0, 0.3, h16.z + 0.55), 38), key(2.0, v3(1.75, 0.22, H(2.0).z + 0.7), v3(0, 0.33, H(2.0).z + 0.05), 31), key(2.4, v3(1.7, 0.25, h24.z + 0.55), v3(0, 0.33, h24.z + 0.1), 31)],
    },
    {
      beat: 'C4',
      from: 2.4,
      to: 3.4,
      mode: 'smooth',
      note: 'impact: the weapon trail, the front rank is knocked back',
      keys: [key(2.4, v3(-2.5, 0.4, 0.75), v3(0.0, 0.32, 1.15), 38), key(3.4, v3(-2.6, 0.55, 0.45), v3(0.3, 0.3, 1.4), 40)],
    },
    {
      beat: 'C5',
      from: 3.4,
      to: 4.8,
      mode: 'smooth',
      note: 'wide: both lines crash together',
      keys: [key(3.4, v3(-2.6, 0.55, 0.45), v3(0.3, 0.3, 1.4), 40), key(4.1, v3(-3.1, 1.1, fz - 1.3), v3(0.1, 0.3, fz + 0.4), 40), key(4.8, v3(-3.0, 1.45, fz - 1.1), v3(0.2, 0.3, fz + 0.6), 41)],
    },
    pullShot('C6', 4.8, 6.0, v3(-3.0, 1.45, fz - 1.1), v3(0.2, 0.3, fz + 0.6), 41, v3(0, 0, 0.8)),
  ]
  const beats: Beat[] = [
    { id: 'C1', start: 0, end: 0.6, label: 'Dive into the caster’s tile' },
    { id: 'C2', start: 0.6, end: 1.6, label: 'Tracking beside the hero: walk to run' },
    { id: 'C3', start: 1.6, end: 2.4, label: 'Low close-up: the wind-up, “Strike!” (slow motion 1.9–2.2)' },
    { id: 'C4', start: 2.4, end: 3.4, label: 'Impact: hit-stop, the weapon’s own trail, the front rank knocked back' },
    { id: 'C5', start: 3.4, end: 4.8, label: 'Wide: both lines crash together, the troops pour in' },
    { id: 'C6', start: 4.8, end: 6.0, label: 'Pull out: damage painted, seal' },
  ]
  const slips: Slip[] = []
  if (p.damage > 0 && p.targets > 1) slips.push({ text: `${p.targets} units struck`, at: 5.2, tone: 'ink', row: 0 })
  if (p.routed) slips.push({ text: 'Routed', at: 5.3, tone: 'cinnabar', row: p.targets > 1 ? 1 : 0 })
  const ov = overlays(
    {
      title: titleOf(p, 0.6),
      callout: { text: 'Strike!', at: p.link === 0 ? 1.72 : 1.68, hold: 0.5 },
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 4.95 },
      seal: { at: 5.5, glyph: SCENE_INFO.C.glyph },
      flashes: [{ at: 2.4, dur: 0.16, kind: 'ink', peak: 0.62 }],
      speed: [[0, 0], [0.9, 0], [1.3, 0.7], [1.9, 0.9], [2.3, 0], [4.8, 0]],
      slips,
    },
    6.0,
  )
  const shakes: CutinScene['shakes'] = [
    { at: 1.7, dur: 0.7, amp: 0.012, mode: 'ramp', freq: 22 },
    { at: 2.54, dur: 0.32, amp: 0.07, mode: 'decay', freq: 27 },
    { at: 2.85, dur: 0.28, amp: 0.025, mode: 'decay', freq: 31 },
    { at: 3.7, dur: 0.3, amp: 0.02, mode: 'decay', freq: 24 },
  ]
  return baseScene('C', p, beats, shots, C_TS, cues.list, ov, act, seed, shakes)
}

// ---- D: Thunder Roar --------------------------------------------------------------------------------------------

export const D_TS: TimeScaleSeg[] = [{ start: 2.78, end: 2.9, rate: 0, kind: 'hitstop' }]
const D = storyClock(D_TS, 6.0)
export const D_RING = { speed: 4.2, first: 1.95, gap: 0.17, count: 3 }

export function makeThunderRoar(p: LinkPlan): CutinScene {
  const seed = 9501 + p.falls * 5
  const def = defenderOf(p)
  const mountedDef = def.kind === 'cavalry'
  const hz = -1.3
  const dz = 2.0
  const n = 7
  const defSlots = formationSlots('ragged', n, mountedDef ? 0.62 : 0.46, seed)
  const atkN = 4
  const atkSlots = formationSlots(p.caster.mounted ? 'wedge' : 'block', atkN, 0.5, seed + 3)
  const actors: ActActor[] = [{ id: 'hero', group: 'hero', index: 0, track: still(0, hz, 0), front: true }]
  const cues = new Cues()
  const mouthZ = hz + 0.18
  const rings: NonNullable<ActFx['rings']> = Array.from({ length: D_RING.count }, (_, k) => ({ t0: D(D_RING.first + k * D_RING.gap), origin: [0, 0.03, mouthZ], speed: D_RING.speed, life: 1.5 }))
  const reach = (x: number, z: number): number => D(D_RING.first) + Math.hypot(x, z - mouthZ) / D_RING.speed
  const fallers = pickFallers(defSlots, p.falls, 0, seed)
  const spirals: NonNullable<ActFx['spirals']> = []
  const survivors: number[] = []
  defSlots.forEach((sl, i) => {
    const x = sl.r
    const z = dz + sl.b
    const id = `def${i}`
    const tc = reach(x, z)
    const falls = fallers.includes(i)
    const track: Track = { start: [x, z], yaw: Math.PI, face: 'fixed', segs: [] }
    if (!falls) track.segs.push({ t0: D(4.1), t1: D(4.95), to: [x * 1.1, z + 0.6 + rand(seed, i, 5) * 0.15], ease: 'io' })
    actors.push({ id, group: 'def', index: i, track, front: true })
    cues.add(id, 'brace', D(0.9), tc)
    if (falls) {
      cues.add(id, 'cover', tc, tc + 0.22)
      cues.add(id, mountedDef ? 'topple' : 'fall', tc + 0.22, tc + 1.3)
    } else {
      cues.add(id, 'cover', tc, D(5.6))
      cues.add(id, mountedDef ? 'rear' : 'stagger', tc + 0.05, tc + (mountedDef ? 1.0 : 0.7))
      survivors.push(i)
    }
  })
  // brush spirals over the confused: every survivor when the target was confused, else as many as units confused
  const dizzy = p.principalConfused ? survivors : survivors.slice(0, Math.min(survivors.length, Math.max(0, p.confused)))
  dizzy.forEach((i) => spirals.push({ actor: `def${i}`, from: reach(defSlots[i]!.r, dz + defSlots[i]!.b) + 0.25 }))
  atkSlots.forEach((sl, i) => {
    actors.push({ id: `atk${i}`, group: 'atk', index: i, front: sl.front, track: still(sl.r + (sl.r >= 0 ? 0.3 : -0.3), hz - 0.75 - sl.b, 0) })
    cues.add(`atk${i}`, 'cheer', D(2.0), D(4.2))
  })
  cues.add('hero', 'breath', D(0.6), D(1.8))
  cues.add('hero', 'roar', D(1.8), D(2.7))
  cues.add('hero', 'recover', D(2.7), D(6.0))
  const act: ActPlan = {
    hero: p.caster,
    heroMounted: p.caster.mounted,
    groups: [
      { id: 'atk', kind: p.caster.kind, palette: p.caster.palette, count: atkN, layout: p.caster.mounted ? 'wedge' : 'block', seed },
      { id: 'def', kind: def.kind, palette: def.palette, count: n, layout: 'ragged', seed },
    ],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, dz + 0.2], halfW: 3.6, halfD: 1.8 },
    fx: { rings, spirals, roar: { from: D(1.85), to: D(2.55) }, dust: true },
    focus: [0, 0.4],
    weapon: 'line',
  }
  const hold = v3(0.5, 0.34, hz + 1.6)
  const shots: Shot[] = [
    diveShot('D1', 0.6, hold, v3(0, 0.3, hz), 34, v3(0, 0, hz)),
    {
      beat: 'D2',
      from: 0.6,
      to: 1.8,
      mode: 'smooth',
      note: 'slow push-in on the face; the chest swells',
      keys: [key(0.6, hold, v3(0, 0.3, hz), 34), key(1.2, v3(0.3, 0.3, hz + 1.1), v3(0, 0.3, hz), 31), key(1.8, v3(0.14, 0.32, hz + 0.85), v3(0, 0.31, hz), 28)],
    },
    {
      beat: 'D3',
      from: 1.8,
      to: 2.6,
      mode: 'smooth',
      note: 'front, camera shaking: ROAR',
      keys: [key(1.8, v3(0.14, 0.32, hz + 0.85), v3(0, 0.31, hz), 28), key(2.6, v3(0.3, 0.34, hz + 1.2), v3(0, 0.3, hz), 33)],
    },
    {
      beat: 'D4',
      from: 2.6,
      to: 4.0,
      mode: 'smooth',
      note: 'reverse shot from the hero’s side as the rings hit the enemy line',
      keys: [key(2.6, v3(-0.9, 0.34, dz - 1.55), v3(0.1, 0.3, dz), 38), key(4.0, v3(-0.7, 0.4, dz - 1.45), v3(0.15, 0.3, dz + 0.2), 36)],
    },
    {
      beat: 'D5',
      from: 4.0,
      to: 5.0,
      mode: 'smooth',
      keys: [key(4.0, v3(-0.7, 0.4, dz - 1.45), v3(0.15, 0.3, dz + 0.2), 36), key(5.0, v3(-3.5, 1.0, dz - 0.9), v3(0, 0.3, dz + 0.3), 40)],
    },
    pullShot('D6', 5.0, 6.0, v3(-3.5, 1.0, dz - 0.9), v3(0, 0.3, dz + 0.3), 40, v3(0, 0, 0.4)),
  ]
  const beats: Beat[] = [
    { id: 'D1', start: 0, end: 0.6, label: 'Dive into the caster’s tile' },
    { id: 'D2', start: 0.6, end: 1.8, label: 'Slow push-in on the face: a deep breath' },
    { id: 'D3', start: 1.8, end: 2.6, label: 'ROAR: brush rings spread across the sand, the lanterns shudder' },
    { id: 'D4', start: 2.6, end: 4.0, label: 'Reverse shot: the rings hit, weapons dropped, ears covered, spirals' },
    { id: 'D5', start: 4.0, end: 5.0, label: 'Wide: horses rear, survivors back away' },
    { id: 'D6', start: 5.0, end: 6.0, label: 'Pull out: damage and the Confused slip, seal' },
  ]
  const slips: Slip[] = []
  if (p.confused > 0) slips.push({ text: `Confused ×${p.confused}`, at: 5.1, tone: 'jade', row: 0 })
  if (p.targets > 1) slips.push({ text: `${p.targets} units`, at: 5.15, tone: 'ink', row: p.confused > 0 ? 1 : 0 })
  const ov = overlays(
    {
      title: titleOf(p, 0.6),
      callout: { text: 'ROAR!', at: 1.95, hold: 0.55 },
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 5.05 },
      seal: { at: 5.5, glyph: SCENE_INFO.D.glyph },
      flashes: [{ at: 2.0, dur: 0.14, kind: 'ink', peak: 0.3 }],
      speed: [[0, 0]],
      slips,
    },
    6.0,
  )
  const shakes: CutinScene['shakes'] = [
    { at: 1.8, dur: 0.8, amp: 0.05, mode: 'ramp', freq: 28 },
    { at: 2.6, dur: 0.3, amp: 0.045, mode: 'decay', freq: 26 },
    { at: 2.9, dur: 0.4, amp: 0.04, mode: 'decay', freq: 24 },
  ]
  return baseScene('D', p, beats, shots, D_TS, cues.list, ov, act, seed, shakes)
}

// ---- R: Ruse (3 s) ----------------------------------------------------------------------------------------------

export const R_TS: TimeScaleSeg[] = []
const R = storyClock(R_TS, 3.0)

export function makeRuse(p: LinkPlan): CutinScene {
  const seed = 9701 + p.confused * 3
  const def = defenderOf(p)
  const n = 4
  const cz = -1.0
  const tz = 1.2
  const slots = formationSlots('ragged', n, def.kind === 'cavalry' ? 0.7 : 0.5, seed)
  const actors: ActActor[] = [{ id: 'hero', group: 'hero', index: 0, track: still(0, cz, 0), front: true }]
  const cues = new Cues()
  const spirals: NonNullable<ActFx['spirals']> = []
  const dizzyAll = p.principalConfused || p.confused > 0
  slots.forEach((sl, i) => {
    actors.push({ id: `def${i}`, group: 'def', index: i, track: still(sl.r, tz + sl.b, Math.PI), front: true })
    cues.add(`def${i}`, 'brace', R(0.5), R(1.6))
    cues.add(`def${i}`, 'dizzy', R(1.7 + i * 0.06), R(3.0))
    if (dizzyAll) spirals.push({ actor: `def${i}`, from: R(1.75 + i * 0.06) })
  })
  cues.add('hero', 'gesture', R(0.55), R(1.5))
  cues.add('hero', 'recover', R(1.5), R(3.0))
  const act: ActPlan = {
    hero: p.caster,
    heroMounted: false,
    groups: [{ id: 'def', kind: def.kind, palette: def.palette, count: n, layout: 'ragged', seed }],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, tz + 0.1], halfW: 3.0, halfD: 1.5 },
    fx: { smoke: { t0: R(0.85), from: [0.18, 0.46, cz + 0.34], to: [0, 0.4, tz], dur: 1.2 }, spirals },
    focus: [0, 0.1],
    weapon: 'line',
  }
  const hold = v3(1.5, 0.42, cz - 0.9)
  const shots: Shot[] = [
    diveShot('R1', 0.5, hold, v3(0, 0.38, cz + 0.4), 36, v3(0, 0, cz)),
    { beat: 'R2', from: 0.5, to: 1.4, mode: 'smooth', note: 'the caster gestures', keys: [key(0.5, hold, v3(0, 0.38, cz + 0.4), 36), key(1.4, v3(1.35, 0.46, cz - 0.6), v3(0.1, 0.4, cz + 0.7), 38)] },
    { beat: 'R3', from: 1.4, to: 2.4, mode: 'smooth', note: 'low on the targets as the smoke drifts over and they turn dizzy', keys: [key(1.4, v3(1.35, 0.46, cz - 0.6), v3(0.1, 0.4, cz + 0.7), 38), key(2.4, v3(-1.1, 0.36, tz - 1.35), v3(0, 0.4, tz), 38)] },
    pullShot('R4', 2.4, 3.0, v3(-1.1, 0.36, tz - 1.35), v3(0, 0.4, tz), 38, v3(0, 0, 0.3)),
  ]
  const beats: Beat[] = [
    { id: 'R1', start: 0, end: 0.5, label: 'Dive into the caster’s tile' },
    { id: 'R2', start: 0.5, end: 1.4, label: 'The caster gestures; ink smoke gathers in the hand' },
    { id: 'R3', start: 1.4, end: 2.4, label: 'Smoke drifts over the targets; they turn dizzy (brush spirals)' },
    { id: 'R4', start: 2.4, end: 3.0, label: 'Pull out: Confused slip, seal' },
  ]
  const slips: Slip[] = []
  if (p.confused > 0) slips.push({ text: `Confused ×${p.confused}`, at: 2.3, tone: 'jade', row: 0 })
  const ov = overlays(
    {
      title: titleOf(p, 0.5),
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 2.35 },
      seal: { at: 2.65, glyph: SCENE_INFO.R.glyph },
      flashes: [],
      slips,
    },
    3.0,
  )
  return baseScene('R', p, beats, shots, R_TS, cues.list, ov, act, seed, [])
}

// ---- W: Wind (3 s) ----------------------------------------------------------------------------------------------

export const W_TS: TimeScaleSeg[] = []
const W = storyClock(W_TS, 3.0)
/** World heading (from +z toward +x) of a wind that blows toward a board direction; the cut-in camera looks toward -z, so east is screen-right. */
export function windHeading(dir: string | null): number | null {
  switch (dir) {
    case 'E':
      return Math.PI / 2
    case 'W':
      return -Math.PI / 2
    case 'N':
      return Math.PI
    case 'S':
      return 0
    default:
      return null
  }
}
/** Screen angle (degrees, 0 = right, 90 = down) of the brush arrow for a board direction (north is up). */
export function windScreenAngle(dir: string | null): number {
  switch (dir) {
    case 'E':
      return 0
    case 'S':
      return 90
    case 'W':
      return 180
    case 'N':
      return 270
    default:
      return 0
  }
}

export function makeWindTurn(p: LinkPlan): CutinScene {
  const seed = 9901
  const cz = -0.2
  const dirName = p.wind?.dir ?? null
  const heading = windHeading(dirName)
  const actors: ActActor[] = [{ id: 'hero', group: 'hero', index: 0, track: still(0, cz, 0), front: true }]
  const cues = new Cues()
  cues.add('hero', 'gesture', W(0.55), W(1.6))
  cues.add('hero', 'recover', W(1.6), W(3.0))
  const act: ActPlan = {
    hero: p.caster,
    heroMounted: false,
    groups: [],
    actors,
    ground: { kind: 'plain', terrain: 'plain', seed, center: [0, 0], halfW: 3, halfD: 2 },
    fx: { wind: { t0: W(1.05), dir: heading, altar: [0.7, cz + 0.15], poles: [[-1.5, cz - 0.6], [1.5, cz - 0.6], [-2.5, cz + 0.9], [2.5, cz + 0.9]] } },
    focus: [0, cz],
    weapon: 'line',
  }
  const hold = v3(0.3, 0.55, cz + 2.6)
  const shots: Shot[] = [
    diveShot('W1', 0.5, hold, v3(0, 0.45, cz), 36, v3(0, 0, cz), true),
    { beat: 'W2', from: 0.5, to: 1.3, mode: 'smooth', note: 'the caster raises his arms at the altar', keys: [key(0.5, hold, v3(0, 0.45, cz), 36), key(1.3, v3(-0.7, 0.45, cz + 1.5), v3(0, 0.5, cz), 33)] },
    { beat: 'W3', from: 1.3, to: 2.4, mode: 'smooth', note: 'wide: the banners whip round and the incense smoke swings', keys: [key(1.3, v3(-0.7, 0.45, cz + 1.5), v3(0, 0.5, cz), 33), key(2.4, v3(1.6, 1.0, cz + 3.6), v3(0, 0.55, cz - 0.3), 40)] },
    pullShot('W4', 2.4, 3.0, v3(1.6, 1.0, cz + 3.6), v3(0, 0.55, cz - 0.3), 40, v3(0, 0, cz), true),
  ]
  const beats: Beat[] = [
    { id: 'W1', start: 0, end: 0.5, label: 'Dive into the caster’s tile' },
    { id: 'W2', start: 0.5, end: 1.3, label: 'The caster raises his arms; robe and cape stir' },
    { id: 'W3', start: 1.3, end: 2.4, label: 'Banners whip round, the incense smoke swings, the wind-arrow is brushed' },
    { id: 'W4', start: 2.4, end: 3.0, label: 'Pull out, seal' },
  ]
  const strength = p.wind?.strength === 'gale' ? 'Gale' : p.wind?.strength === 'breeze' ? 'Breeze' : 'Calm'
  const dirWord = dirName === 'E' ? 'east' : dirName === 'W' ? 'west' : dirName === 'N' ? 'north' : dirName === 'S' ? 'south' : ''
  const ov = overlays(
    {
      title: titleOf(p, 0.5),
      damage: { text: '', at: 2.4 },
      seal: { at: 2.65, glyph: SCENE_INFO.W.glyph },
      flashes: [],
      windArrow: { at: 1.6, angle: windScreenAngle(dirName), label: dirWord ? `${strength}, blowing ${dirWord}` : 'The wind falls calm' },
    },
    3.0,
  )
  return baseScene('W', p, beats, shots, W_TS, cues.list, ov, act, seed, [])
}

// ---- short attack scenes ----------------------------------------------------------------------------------------

/** Where the camera stands for an arc: a profile for a front hit, behind the attackers for a flank or rear hit. */
function arcYaw(p: LinkPlan, seed: number): number {
  if (p.arc === 'rear') return 0
  if (p.arc === 'side') return rand(seed, 77) < 0.5 ? Math.PI / 2 : -Math.PI / 2
  return Math.PI
}
const arcWord = (a: LinkPlan['arc']): string => (a === 'rear' ? 'Rear!' : a === 'side' ? 'Flank!' : '')

function shortSlips(p: LinkPlan, t0: number, tNumbers: number): Slip[] {
  const slips: Slip[] = [{ text: `${kindLabel(p.caster.kind)} · ${p.caster.name}`, at: t0, tone: 'ink', row: 0 }]
  if (p.counter && p.counter.damage > 0) slips.push({ text: `Counter ${money(p.counter.damage)}`, at: tNumbers, tone: 'cinnabar', row: 1 })
  return slips
}

export const SM_TS: TimeScaleSeg[] = [{ start: 1.2, end: 1.3, rate: 0, kind: 'hitstop' }]
const SM = storyClock(SM_TS, 2.7)

export function makeShortMelee(p: LinkPlan): CutinScene {
  const seed = 9101 + p.falls * 3 + p.arc.length
  const def = defenderOf(p)
  const n = 5
  const slots = formationSlots('block', n, 0.46, seed)
  const dz = 1.05
  const yaw = arcYaw(p, seed)
  const hit = SM(1.2)
  const actors: ActActor[] = []
  const cues = new Cues()
  const fallers = pickFallers(slots, p.falls, 0, seed)
  const cf = p.counter ? pickFallers(slots, p.counter.falls, 0, seed + 4) : []
  slots.forEach((sl, i) => {
    // attackers run in and clash; with a counter some fall, otherwise they press on
    const z0 = -1.55
    const z1 = 0.28
    const segs: Seg[] = [{ t0: SM(0.3), t1: hit, to: [sl.r, z1], ease: 'io' }]
    if (!p.counter) segs.push({ t0: SM(1.8), t1: SM(2.3), to: [sl.r, z1 + 0.22], ease: 'io' })
    actors.push({ id: `atk${i}`, group: 'atk', index: i, front: true, track: { start: [sl.r, z0], yaw: 0, segs } })
    cues.add(`atk${i}`, 'strike', hit - 0.12, hit + 0.3)
    if (p.counter) {
      if (cf.includes(i)) cues.add(`atk${i}`, 'fling', SM(1.85), SM(1.85) + 0.9, { vx: srand(seed, i, 1) * 0.5, vy: 1.3, vz: -1.5 - rand(seed, i, 2) * 0.6, sx: -8, sz: srand(seed, i, 3) * 2, back: 1 })
      else cues.add(`atk${i}`, 'stagger', SM(1.85), SM(1.85) + 0.6)
    } else cues.add(`atk${i}`, 'strike', SM(1.85), SM(2.2))
    const dsegs: Seg[] = []
    if (p.counter && !fallers.includes(i)) dsegs.push({ t0: SM(1.8), t1: SM(2.1), to: [sl.r, dz - 0.2], ease: 'io' })
    actors.push({ id: `def${i}`, group: 'def', index: i, front: true, track: { start: [sl.r, dz], yaw, face: 'fixed', segs: dsegs } })
    cues.add(`def${i}`, 'brace', SM(0.6), hit)
    if (fallers.includes(i)) cues.add(`def${i}`, 'fling', hit + 0.02 * i, hit + 0.02 * i + 1.0, { vx: srand(seed, i, 4) * 0.7, vy: 1.4 + rand(seed, i, 5) * 0.5, vz: 1.2 + rand(seed, i, 6) * 0.7, sx: 8, sz: srand(seed, i, 7) * 3, away: Math.cos(yaw) < 0 ? 0 : 1 })
    else {
      cues.add(`def${i}`, 'stagger', hit + 0.02, hit + 0.6)
      if (p.counter) cues.add(`def${i}`, 'strike', SM(1.8), SM(2.2))
    }
  })
  const act: ActPlan = {
    hero: null,
    heroMounted: false,
    groups: [
      { id: 'atk', kind: p.caster.kind, palette: p.caster.palette, count: n, layout: 'block', seed },
      { id: 'def', kind: def.kind, palette: def.palette, count: n, layout: 'block', seed: seed + 9 },
    ],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, dz + 0.1], halfW: 2.4, halfD: 1.3 },
    fx: { dust: true },
    focus: [0, 0],
    weapon: 'line',
  }
  const cam = shortCam(p, yaw, 0, dz)
  const shots: Shot[] = [
    diveShot('SM1', 0.3, cam.a, cam.t, cam.fov, v3(0, 0, -0.2)),
    { beat: 'SM2', from: 0.3, to: 1.2, mode: 'smooth', note: 'the front rank runs in', keys: [key(0.3, cam.a, cam.t, cam.fov), key(1.2, cam.b, cam.t2, cam.fov - 2)] },
    { beat: 'SM3', from: 1.2, to: 1.8, mode: 'smooth', note: 'the clash', keys: [key(1.2, cam.b, cam.t2, cam.fov - 2), key(1.8, cam.c, cam.t2, cam.fov - 3)] },
    { beat: 'SM4', from: 1.8, to: 2.4, mode: 'smooth', note: p.counter ? 'the defenders shove back' : 'the attackers press on', keys: [key(1.8, cam.c, cam.t2, cam.fov - 3), key(2.4, cam.c2, cam.t2, cam.fov - 2)] },
    pullShot('SM5', 2.4, 2.7, cam.c2, cam.t2, cam.fov - 2, v3(0, 0, 0.3)),
  ]
  const beats: Beat[] = [
    { id: 'SM1', start: 0, end: 0.3, label: 'Short dive' },
    { id: 'SM2', start: 0.3, end: 1.2, label: 'The front rank runs in' },
    { id: 'SM3', start: 1.2, end: 1.8, label: 'The clash (0.10 s hit-stop); the front rank falls' },
    { id: 'SM4', start: 1.8, end: 2.4, label: p.counter ? 'Counter: the defenders shove back, attackers fall' : 'The attackers press on' },
    { id: 'SM5', start: 2.4, end: 2.7, label: 'Pull out: the numbers' },
  ]
  const ov = overlays(
    {
      callout: arcWord(p.arc) ? { text: arcWord(p.arc), at: 1.2, hold: 0.45, side: 'left' } : undefined,
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 1.85 },
      seal: { at: 2.45, glyph: SCENE_INFO['S-melee'].glyph },
      flashes: [{ at: 1.2, dur: 0.12, kind: 'ink', peak: 0.38 }],
      slips: shortSlips(p, 0.3, 2.0),
      dof: [[0, 0.05], [0.3, 0.35], [2.4, 0.2], [2.7, 0]],
    },
    2.7,
  )
  const shakes: CutinScene['shakes'] = [{ at: 1.3, dur: 0.28, amp: 0.045, mode: 'decay', freq: 27 }, { at: 1.9, dur: 0.2, amp: 0.02, mode: 'decay', freq: 30 }]
  return baseScene('S-melee', p, beats, shots, SM_TS, cues.list, ov, act, seed, shakes)
}

interface ShortCam {
  a: Vec3
  b: Vec3
  c: Vec3
  c2: Vec3
  t: Vec3
  t2: Vec3
  fov: number
}
/** Camera poses for the short scenes: a profile for a front hit; from behind the attackers (looking at the flank or the back) otherwise. */
function shortCam(p: LinkPlan, yaw: number, atkZ: number, defZ: number): ShortCam {
  const mid = (atkZ + defZ) / 2
  if (p.arc === 'front') {
    return { a: v3(-2.4, 0.5, mid - 0.9), b: v3(-2.2, 0.42, mid - 0.2), c: v3(-2.1, 0.4, mid), c2: v3(-2.6, 0.7, mid - 0.2), t: v3(0, 0.3, mid), t2: v3(0, 0.3, mid + 0.1), fov: 40 }
  }
  void yaw
  return { a: v3(0.9, 0.62, atkZ - 2.2), b: v3(0.7, 0.5, atkZ - 1.2), c: v3(0.55, 0.45, atkZ - 0.8), c2: v3(1.1, 0.8, atkZ - 1.2), t: v3(0, 0.3, defZ - 0.3), t2: v3(0, 0.3, defZ), fov: 40 }
}

export const SC_TS: TimeScaleSeg[] = [{ start: 1.25, end: 1.35, rate: 0, kind: 'hitstop' }]
const SC = storyClock(SC_TS, 2.7)

export function makeShortCavalry(p: LinkPlan): CutinScene {
  const seed = 9111 + p.falls * 3
  const def = defenderOf(p)
  const n = 5
  const riders = formationSlots('wedge', 5, 0.5, seed)
  const slots = formationSlots('line', n, 0.5, seed)
  const dz = 1.0
  const yaw = arcYaw(p, seed)
  const hit = SC(1.25)
  const actors: ActActor[] = []
  const cues = new Cues()
  const fallers = pickFallers(slots, p.falls, 0, seed)
  const cf = p.counter ? pickFallers(riders.map((r) => ({ r: r.r, front: true })), p.counter.falls, 0, seed + 5) : []
  riders.forEach((sl, i) => {
    const x = sl.r
    const z0 = -3.4 - sl.b
    const zIn = dz - 0.5 - sl.b * 0.3
    const zOut = 2.7 - sl.b * 0.3
    actors.push({
      id: `atk${i}`,
      group: 'atk',
      index: i,
      front: sl.front,
      track: {
        start: [x, z0],
        yaw: 0,
        segs: [
          { t0: SC(0.3), t1: SC(1.3), to: [x, zIn], ease: 'in' },
          { t0: SC(1.3), t1: SC(1.9), to: [x * 1.1, zOut], ease: 'lin' },
          { t0: SC(1.9), t1: SC(2.65), to: [x * 0.6 + 1.2, dz - 0.4], via: [x + 2.4, zOut + 0.7], ease: 'io' },
        ],
      },
    })
    if (p.counter) {
      if (cf.includes(i)) cues.add(`atk${i}`, 'topple', SC(1.9), SC(1.9) + 0.8)
      else cues.add(`atk${i}`, 'rear', SC(1.5), SC(1.5) + 0.6)
    }
  })
  slots.forEach((sl, i) => {
    actors.push({ id: `def${i}`, group: 'def', index: i, front: true, track: still(sl.r, dz, yaw) })
    cues.add(`def${i}`, 'brace', SC(0.7), hit)
    if (fallers.includes(i)) cues.add(`def${i}`, 'fling', hit + 0.03 * i, hit + 0.03 * i + 1.1, { vx: srand(seed, i, 4) * 1.0, vy: 1.6 + rand(seed, i, 5) * 0.6, vz: 2.4 + rand(seed, i, 6) * 0.9, sx: 9, sz: srand(seed, i, 7) * 3 })
    else cues.add(`def${i}`, 'stagger', hit + 0.03, hit + 0.65)
  })
  const act: ActPlan = {
    hero: null,
    heroMounted: false,
    groups: [
      { id: 'atk', kind: 'cavalry', palette: p.caster.palette, count: 5, layout: 'wedge', seed },
      { id: 'def', kind: def.kind, palette: def.palette, count: n, layout: 'line', seed: seed + 9 },
    ],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, dz + 0.4], halfW: 3.0, halfD: 1.6 },
    fx: { dust: true },
    focus: [0, 0],
    weapon: 'line',
  }
  const cam = shortCam(p, yaw, -1.9, dz)
  if (p.arc !== 'front') {
    // from behind the riders, following them in: the camera keeps pace on the flank side
    cam.a = v3(1.7, 0.75, -4.7)
    cam.b = v3(1.9, 0.5, -2.4)
    cam.c = v3(2.1, 0.44, -0.5)
    cam.c2 = v3(1.9, 0.8, 0.6)
    cam.t = v3(0, 0.3, 0.2)
    cam.t2 = v3(0, 0.32, 0.9)
  }
  const shots: Shot[] = [
    diveShot('SC1', 0.3, cam.a, cam.t, cam.fov, v3(0, 0, -1.5)),
    { beat: 'SC2', from: 0.3, to: 1.25, mode: 'smooth', note: 'the riders canter in', keys: [key(0.3, cam.a, cam.t, cam.fov), key(1.25, cam.b, cam.t2, cam.fov - 2)] },
    { beat: 'SC3', from: 1.25, to: 1.9, mode: 'smooth', note: 'ride through', keys: [key(1.25, cam.b, cam.t2, cam.fov - 2), key(1.9, cam.c, v3(0, 0.3, dz + 0.9), cam.fov - 3)] },
    { beat: 'SC4', from: 1.9, to: 2.4, mode: 'smooth', note: 'wheel round', keys: [key(1.9, cam.c, v3(0, 0.3, dz + 0.9), cam.fov - 3), key(2.4, cam.c2, v3(0.6, 0.3, dz + 0.4), cam.fov)] },
    pullShot('SC5', 2.4, 2.7, cam.c2, v3(0.6, 0.3, dz + 0.4), cam.fov, v3(0, 0, 0.4)),
  ]
  const beats: Beat[] = [
    { id: 'SC1', start: 0, end: 0.3, label: 'Short dive' },
    { id: 'SC2', start: 0.3, end: 1.25, label: 'The riders canter in' },
    { id: 'SC3', start: 1.25, end: 1.9, label: 'The charge rides through the line (0.10 s hit-stop); the front rank falls' },
    { id: 'SC4', start: 1.9, end: 2.4, label: p.counter ? 'They wheel round; a counter unseats riders' : 'They wheel round' },
    { id: 'SC5', start: 2.4, end: 2.7, label: 'Pull out: the numbers' },
  ]
  const ov = overlays(
    {
      callout: arcWord(p.arc) ? { text: arcWord(p.arc), at: 1.25, hold: 0.45, side: 'left' } : undefined,
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 1.9 },
      seal: { at: 2.45, glyph: SCENE_INFO['S-cavalry'].glyph },
      flashes: [{ at: 1.25, dur: 0.12, kind: 'ink', peak: 0.4 }],
      slips: shortSlips(p, 0.3, 2.05),
      speed: [[0, 0], [0.5, 0.6], [1.2, 0.8], [1.3, 0], [2.7, 0]],
      dof: [[0, 0.05], [0.3, 0.35], [2.4, 0.2], [2.7, 0]],
    },
    2.7,
  )
  const shakes: CutinScene['shakes'] = [{ at: 0.8, dur: 0.45, amp: 0.015, mode: 'ramp', freq: 19 }, { at: 1.35, dur: 0.3, amp: 0.05, mode: 'decay', freq: 26 }]
  return baseScene('S-cavalry', p, beats, shots, SC_TS, cues.list, ov, act, seed, shakes)
}

export const SA_TS: TimeScaleSeg[] = []
const SA = storyClock(SA_TS, 2.4)
export const SA_FLIGHT = { launch: 0.92, land: 1.6 }

export function makeShortArcher(p: LinkPlan): CutinScene {
  const seed = 9121 + p.falls * 3
  const def = defenderOf(p)
  const n = 5
  const az = -2.0
  const dz = 2.0
  const yaw = arcYaw(p, seed)
  const slots = formationSlots('line', n, 0.5, seed)
  const dslots = formationSlots('line', n, 0.5, seed + 2)
  const actors: ActActor[] = []
  const cues = new Cues()
  const fallers = pickFallers(dslots, p.falls, 0, seed)
  const arrows: NonNullable<ActFx['arrows']> = []
  slots.forEach((sl, i) => {
    actors.push({ id: `atk${i}`, group: 'atk', index: i, front: true, track: still(sl.r, az, 0) })
    cues.add(`atk${i}`, 'draw', SA(0.3 + i * 0.02), SA(0.88))
    cues.add(`atk${i}`, 'loose', SA(0.9), SA(1.3))
    for (let j = 0; j < 2; j++) {
      const target = dslots[(i + j) % n]!
      arrows.push({
        from: [sl.r, 0.36, az + 0.15],
        to: [target.r + srand(seed, i * 2 + j, 3) * 0.12, 0.2, dz - 0.05],
        launch: SA(SA_FLIGHT.launch + i * 0.012 + j * 0.02),
        land: SA(SA_FLIGHT.land + rand(seed, i * 2 + j, 4) * 0.14),
        apex: 1.5 + rand(seed, i * 2 + j, 5) * 0.4,
      })
    }
  })
  dslots.forEach((sl, i) => {
    actors.push({ id: `def${i}`, group: 'def', index: i, front: true, track: still(sl.r, dz, yaw) })
    cues.add(`def${i}`, 'brace', SA(0.5), SA(SA_FLIGHT.land))
    const land = SA(SA_FLIGHT.land) + 0.05
    if (fallers.includes(i)) cues.add(`def${i}`, 'fall', land + 0.04 * i, land + 0.04 * i + 0.9, { dz: 0.12 })
    else cues.add(`def${i}`, 'stagger', land, land + 0.65)
  })
  const act: ActPlan = {
    hero: null,
    heroMounted: false,
    groups: [
      { id: 'atk', kind: p.caster.kind === 'archer' ? 'archer' : 'archer', palette: p.caster.palette, count: n, layout: 'line', seed },
      { id: 'def', kind: def.kind, palette: def.palette, count: n, layout: 'line', seed: seed + 9 },
    ],
    actors,
    ground: { kind: groundKind(p.terrain), terrain: p.terrain, seed, center: [0, dz + 0.1], halfW: 2.6, halfD: 1.2 },
    fx: { arrows },
    focus: [0, 0],
    weapon: 'line',
  }
  const side = p.arc === 'front'
  const a: Vec3 = side ? v3(-4.5, 1.0, 0.0) : v3(0.8, 0.7, az - 2.0)
  const t: Vec3 = side ? v3(0, 0.55, 0.0) : v3(0, 0.5, dz)
  const shots: Shot[] = [
    diveShot('SA1', 0.3, a, t, 40, v3(0, 0, 0)),
    { beat: 'SA2', from: 0.3, to: 0.9, mode: 'smooth', note: 'the archers draw', keys: [key(0.3, a, t, 40), key(0.9, side ? v3(-4.4, 0.9, 0) : v3(0.7, 0.62, az - 1.7), t, 38)] },
    { beat: 'SA3', from: 0.9, to: 1.6, mode: 'smooth', note: 'loose: the arrows climb and fall', keys: [key(0.9, side ? v3(-4.4, 0.9, 0) : v3(0.7, 0.62, az - 1.7), t, 38), key(1.6, side ? v3(-4.3, 1.0, 0.2) : v3(0.5, 0.9, az - 1.2), side ? v3(0, 0.6, 0.2) : v3(0, 0.55, dz), 41)] },
    { beat: 'SA4', from: 1.6, to: 2.1, mode: 'smooth', note: 'the arrows land', keys: [key(1.6, side ? v3(-4.3, 1.0, 0.2) : v3(0.5, 0.9, az - 1.2), side ? v3(0, 0.6, 0.2) : v3(0, 0.55, dz), 41), key(2.1, side ? v3(-3.4, 0.7, dz - 0.9) : v3(-0.5, 0.8, 0.3), v3(0, 0.3, dz), 38)] },
    pullShot('SA5', 2.1, 2.4, side ? v3(-3.4, 0.7, dz - 0.9) : v3(-0.5, 0.8, 0.3), v3(0, 0.3, dz), 38, v3(0, 0, 0.4)),
  ]
  const beats: Beat[] = [
    { id: 'SA1', start: 0, end: 0.3, label: 'Short dive' },
    { id: 'SA2', start: 0.3, end: 0.9, label: 'The archers draw' },
    { id: 'SA3', start: 0.9, end: 1.6, label: 'Loose: arrows climb and fall' },
    { id: 'SA4', start: 1.6, end: 2.1, label: 'The arrows land; the front rank falls' },
    { id: 'SA5', start: 2.1, end: 2.4, label: 'Pull out: the numbers (an archer attack is never countered)' },
  ]
  const ov = overlays(
    {
      callout: arcWord(p.arc) ? { text: arcWord(p.arc), at: 1.62, hold: 0.45, side: 'left' } : undefined,
      damage: { text: p.damage > 0 ? money(p.damage) : '', at: 1.7 },
      seal: { at: 2.15, glyph: SCENE_INFO['S-archer'].glyph },
      flashes: [],
      slips: shortSlips({ ...p, counter: null }, 0.3, 2.0),
      dof: [[0, 0.05], [0.3, 0.3], [2.1, 0.2], [2.4, 0]],
    },
    2.4,
  )
  return baseScene('S-archer', p, beats, shots, SA_TS, cues.list, ov, act, seed, [{ at: 1.62, dur: 0.25, amp: 0.02, mode: 'decay', freq: 28 }])
}

void EASE
void seededOrder
