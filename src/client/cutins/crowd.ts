// Crowds for the battle cut-ins (docs/spec/52-crowds.md, PLAN D22): 20-40 troops of one kind on screen, the front rank as full
// rigs from figures.buildTroop and the ranks behind as instanced, lower-detail copies of the same rig that run the SAME joint
// clips (walk / run / gallop / kneel / drawBow / stagger / fallBack / ...) with per-member seeded phase offsets and small
// variations. A handful of draw calls per crowd. Everything is a pure function of (seed, commands, t).
//
//   const crowd = createCrowd({ kind: 'infantry', side: 'han', count: 28, formation: 'block', seed: 7, origin: [0, 0, -2], facing: 0 })
//   scene.add(crowd.group)
//   // every frame, with the scene time:
//   crowd.update(t)
//   crowd.march([0, 1], 0.9)        // from the scene's cues
import { Euler, Group, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { figures } from '../figures'
import { applyClip, fallBack, fallForward } from '../figures/clips'
import type { Rig, SidePalette, TroopKind } from '../figures/rig'
import { rand, seededOrder } from './rng'
import { acquireBake, disposeCrowdCaches, releaseBake, type BakedSet, type Detail } from './crowd/bake'
import { defaultCadenceSpread, defaultJitter, layout, type FormationName, type Slot, type Spacing } from './crowd/formations'
import {
  DEFAULT_CALIB,
  Timeline,
  flingTime,
  flungRest,
  horseTopple,
  type Calib,
  type Cmd,
  type FallStyle,
  type Frame,
  type MemberInfo,
  type MemberState,
  type Vec2,
} from './crowd/motion'
import { Pool, bakeExtent, disposeCrowdMaterials } from './crowd/pool'
import type { Gait } from '../figures/gait'

export type { FormationName, Slot, Spacing } from './crowd/formations'
export type { FallStyle, MemberState, Vec2 } from './crowd/motion'
export type { Detail } from './crowd/bake'
export { layout as layoutFormation, minSeparation } from './crowd/formations'

/** Which members a command applies to: everyone, the front rank, everyone behind it, the full rigs, the instanced ranks, or explicit indices. */
export type MemberSel = 'all' | 'front' | 'rear' | 'full' | 'instanced' | readonly number[]

export interface CrowdOptions {
  kind: TroopKind
  side: SidePalette
  /** Up to about 40. */
  count: number
  /** Default by kind: infantry block, archer line, cavalry wedge, rebel mob. */
  formation?: FormationName
  /** A multiplier on the default spacing (number) or the spacing in rig units ({ x, z }). */
  spacing?: number | Partial<Spacing>
  /** Random offset of each slot as a fraction of the spacing. */
  jitter?: number
  /** Members across the front (block, mob) or per rank (line). */
  files?: number
  /** Seeds everything: layout, variants, phases, fall variety. */
  seed?: number
  /** Where the middle of the front rank stands, in the parent's space, and which way the crowd faces (yaw radians, 0 = +Z). */
  origin?: readonly [number, number, number]
  facing?: number
  /** How many of the first (front, centre-out) members get the full-detail treatment. Default 5 (3 for cavalry). */
  frontRankFull?: number
  /** `rig` (default): they are real rigs from figures.buildTroop, one draw call per mesh (about 50 each, 100 for a rider) and posable by the scene. `hi`: the same geometry merged per joint and instanced (about 12 draw calls for the lot): looks the same, costs far fewer draw calls, but cannot be posed by hand. */
  frontRankMode?: 'rig' | 'hi'
  /** World units per rig unit. Default: the cut-in miniature scale (0.45 / the infantry rig's height), the same scale poseKit's fitFigure gives the heroes. */
  scale?: number
  /** Troop variants to mix (1..3): different headgear, shield and weapon angle. Each variant of the instanced ranks costs its own draw calls. Default 2. */
  variants?: number
  /** Instanced detail: `lo` rebuilds generated primitives with fewer segments (about a quarter of the triangles); `hi` keeps the rig as built. Default lo. */
  detail?: Detail
  /** How far apart the gait cycles of the members start, 0 (in step) .. 1 (random). Default by formation. */
  cadence?: number
  castShadow?: boolean
}

export interface CommandOpts {
  /** Who: default everyone (the fallen and routed ignore later orders). */
  members?: MemberSel
  /** The scene time of the command; default the time of the last update. */
  at?: number
}

export interface CrowdMember {
  readonly index: number
  /** A full rig (front rank in `rig` mode); false for the instanced members. */
  readonly full: boolean
  /** How it is drawn: `rig`, `hi` (instanced at full detail) or `lo` (instanced, reduced). */
  readonly detail: 'rig' | Detail
  readonly variant: number
  /** The full rig, when `full`. Scenes may pose it further after `update` (they own it only until the next update). */
  readonly rig: Rig | null
  readonly slot: Slot
  /** Crowd-local ground position (world units, +y is lift above the sand), refreshed by `update`. */
  readonly position: Vector3
  heading: number
  state: MemberState
  /** Standing height in world units, and the member's own scale (world units per rig unit). */
  readonly height: number
  readonly scale: number
}

export interface Crowd {
  readonly group: Group
  readonly kind: TroopKind
  readonly members: readonly CrowdMember[]
  /** Indices of the front rank (the middle of it first). */
  readonly frontRank: readonly number[]
  /** World units per rig unit. */
  readonly scale: number
  /** The time of the last update. */
  readonly time: number
  update(t: number, dt?: number): void
  /** A direction [x, z] (straight on, forever) or a list of waypoints [[x, z], ...] in crowd-local space; the formation keeps its shape, turning on the path. Speed in world units per second. */
  march(target: Vec2 | Vec2[], speed: number, opts?: CommandOpts & { ramp?: number; gait?: Gait }): void
  /** Slow to a stop (default over 0.4 s). */
  halt(opts?: CommandOpts & { decel?: number }): void
  /** Turn on the spot to face a direction [x, z]. */
  face(dir: Vec2, opts?: CommandOpts): void
  /** Down on one knee (archers; on foot only). */
  kneel(opts?: CommandOpts & { dur?: number }): void
  /** Get up from a kneel, or just stand easy (also cancels a stagger). */
  stand(opts?: CommandOpts & { dur?: number }): void
  /** Draw the bow: `draw(p)` holds the draw at p (0..1; call it every frame to drive it from the scene), `draw()` draws fully over `dur` (default 0.9 s). Archers only. */
  draw(p?: number, opts?: CommandOpts & { dur?: number }): void
  /** Loose the arrow: the string hand snaps forward, the arrow leaves the bow and stays gone until the next draw. */
  loose(opts?: CommandOpts): void
  /** Hit and reeling back one step; recovers after `hold` seconds (default 0.5; Infinity to stay reeling). */
  stagger(members?: MemberSel, opts?: CommandOpts & { hold?: number; dur?: number }): void
  /** Knocked down. back / forward: falls and lies flat where the push slides it. fling: a ballistic tumbling body that lands and lies flat on its back. `impulse` is a distance (default: 0.2 back, 0.12 forward, 1.5 fling, away from where it faces) or a vector [x, z] in crowd-local space whose length is the distance. */
  fall(members: MemberSel, style: FallStyle, impulse?: number | Vec2, opts?: CommandOpts & { apex?: number; dur?: number }): void
  /** Turn and run away (default straight back, away from the enemy; `dir` in crowd-local space). */
  flee(members?: MemberSel, opts?: CommandOpts & { dir?: Vec2; speed?: number }): void
  /** Resolves a selection to indices. */
  select(sel: MemberSel): number[]
  /** `n` members chosen from `from` by `seed`, the same every time (for "N of them fall"). */
  pick(n: number, seed: number, from?: MemberSel): number[]
  /** Where a joint of a member is, after the last `update`: in crowd-local space, or in world space with `world`. */
  jointPosition(i: number, joint: string, out?: Vector3, world?: boolean): Vector3
  /** Crowd-local (or world) ground position of a member after the last update. */
  positionOf(i: number, out?: Vector3, world?: boolean): Vector3
  /** Lowest and highest crowd-local y of a member's geometry after the last update, optionally of some parts only ('footL', 'footR', 'torso', 'h:legFL', ...) (tests). Note the footman's spear butt reaches below the sand by design. */
  extent(i: number, parts?: readonly string[]): { minY: number; maxY: number }
  /** The last evaluated frame of a member (tests). */
  frame(i: number): Frame
  stats(): { members: number; full: number; instanced: number; drawCalls: number; instancedMeshes: number; triangles: number }
  dispose(): void
}

// ---------------------------------------------------------------- scale
let miniature: number | null = null
/** World units per rig unit of the cut-in miniatures (poseKit.figureScale): 0.45 / the infantry rig's height. */
export function crowdScale(): number {
  if (miniature === null) {
    const r = figures.buildTroop('infantry', 'han', 0)
    miniature = r.height > 0 ? 0.45 / r.height : 1
    r.dispose()
  }
  return miniature
}

const DEFAULT_FORMATION: Record<TroopKind, FormationName> = { infantry: 'block', archer: 'line', cavalry: 'wedge', rebel: 'mob' }

// ---------------------------------------------------------------- placement
const Y_AXIS = new Vector3(0, 1, 0)
const qh = new Quaternion()
const qt = new Quaternion()
const eul = new Euler()
const pv = new Vector3()
const tv = new Vector3()
const sv = new Vector3()
const tv2 = new Matrix4()

/** Position and orientation of a member from its frame: heading about the ground point, tumble about a pivot above it. */
function place(f: Frame, e: number, pos: Vector3, quat: Quaternion): void {
  qh.setFromAxisAngle(Y_AXIS, f.h)
  if (f.pitch !== 0 || f.roll !== 0) qt.setFromEuler(eul.set(f.pitch, 0, f.roll, 'XYZ'))
  else qt.identity()
  quat.multiplyQuaternions(qh, qt)
  pv.set(0, f.pivotY * e, 0)
  tv.copy(pv).applyQuaternion(qt)
  tv.subVectors(pv, tv).applyQuaternion(qh)
  pos.set(f.x + tv.x, f.y + tv.y, f.z + tv.z)
}

function calibrate(bake: BakedSet, mounted: boolean): Calib {
  const c: Calib = { ...DEFAULT_CALIB }
  // the weapon arms are left out: a spear butt or lance tip that points at the sand must not hold the body above it
  const body = [...new Set(bake.parts.map((p) => p.joint))].filter((j) => j !== 'armL' && j !== 'armR')
  const m = new Matrix4()
  const q = new Quaternion()
  const p = new Vector3()
  const f: Frame = { x: 0, z: 0, y: 0, h: 0, pitch: 0, roll: 0, pivotY: 0, clip: { pose: {} }, arrow: true, speed: 0, dist: 0, state: 'idle' }
  if (!mounted) {
    f.pitch = -Math.PI / 2
    f.pivotY = c.flingPivot
    f.clip = flungRest()
    place(f, 1, p, q)
    c.flingDrop = -bakeExtent(bake, f.clip, m.compose(p, q, sv.set(1, 1, 1)), body).minY
  } else {
    f.roll = Math.PI / 2
    f.clip = horseTopple(1)
    place(f, 1, p, q)
    c.toppleLift = -bakeExtent(bake, f.clip, m.compose(p, q, sv.set(1, 1, 1)), body).minY
    f.pivotY = 0.45
    place(f, 1, p, q)
    c.flingMountLift = -bakeExtent(bake, f.clip, m.compose(p, q, sv.set(1, 1, 1)), body).minY
  }
  if (!mounted) {
    f.pitch = 0
    f.roll = 0
    f.pivotY = 0
    place(f, 1, p, q)
    m.compose(p, q, sv.set(1, 1, 1))
    c.backLift = Math.max(0, -bakeExtent(bake, fallBack(1), m, body).minY)
    c.forwardLift = Math.max(0, -bakeExtent(bake, fallForward(1), m, body).minY)
  }
  return c
}

// ---------------------------------------------------------------- the crowd
export function createCrowd(o: CrowdOptions): Crowd {
  const kind = o.kind
  const mounted = kind === 'cavalry'
  const count = Math.max(0, Math.min(64, Math.floor(o.count)))
  const seed = (o.seed ?? 1) | 0
  const formation = o.formation ?? DEFAULT_FORMATION[kind]
  const k = o.scale ?? crowdScale()
  const nVariants = Math.max(1, Math.min(3, Math.floor(o.variants ?? 2)))
  const detail = o.detail ?? 'lo'
  const shadows = o.castShadow ?? true
  const nFull = Math.max(0, Math.min(count, Math.floor(o.frontRankFull ?? (mounted ? 3 : 5))))
  const cadence = o.cadence ?? defaultCadenceSpread(formation)
  const slots = layout({ kind, formation, count, seed, spacing: o.spacing, jitter: o.jitter ?? defaultJitter(formation), ...(o.files !== undefined ? { files: o.files } : {}) })

  const group = new Group()
  group.name = `crowd-${kind}-${o.side}`
  const origin = o.origin ?? [0, 0, 0]
  group.position.set(origin[0], origin[1], origin[2])
  group.rotation.y = o.facing ?? 0

  // ---- members
  const infos: MemberInfo[] = []
  const variants: number[] = []
  const bakes = new Map<string, BakedSet>()
  const getBake = (v: number, d: Detail = detail): BakedSet => {
    const key = `${v}|${d}`
    let b = bakes.get(key)
    if (!b) {
      b = acquireBake(kind, o.side, v, d)
      bakes.set(key, b)
    }
    return b
  }
  const frontMode = o.frontRankMode ?? 'rig'
  const detailOf = (i: number): 'rig' | Detail => (i < nFull ? (frontMode === 'rig' ? 'rig' : 'hi') : detail)
  for (let i = 0; i < count; i++) {
    const s = slots[i]!
    const r = (n: number): number => rand(seed, i, n, 0x5ca1e)
    const hBias = (r(1) - 0.5) * 0.08
    variants.push(Math.min(nVariants - 1, Math.floor(r(2) * nVariants)))
    infos.push({
      index: i,
      kind,
      mounted,
      x: s.x * k,
      z: s.z * k,
      h: hBias,
      e: k * (0.97 + 0.06 * r(3)),
      phase: r(4) * 6.28,
      dPhase: cadence * r(5) * 0.55,
      side: r(6) < 0.5 ? 1 : -1,
      lean: (r(7) - 0.5) * 0.05,
      look: (r(8) - 0.5) * 0.3,
      hBias,
      fleeK: 0.85 + 0.3 * r(9),
      r: r(10),
    })
  }
  const tl = new Timeline(infos)
  // measure how a flung body or a toppled horse lies on the sand, once, on the first variant
  if (count > 0) tl.calib = calibrate(getBake(variants[0]!), mounted)

  // ---- full rigs (front rank)
  const holders: (Group | null)[] = []
  const rigs: (Rig | null)[] = []
  const arrows: (Object3D | null)[] = []
  let fullMeshes = 0
  const members: CrowdMember[] = []
  for (let i = 0; i < count; i++) {
    let rig: Rig | null = null
    if (detailOf(i) === 'rig') {
      rig = figures.buildTroop(kind, o.side, variants[i]!)
      const holder = new Group()
      holder.name = `crowd-full-${i}`
      holder.add(rig.group)
      rig.group.traverse((m) => {
        if (m instanceof Mesh) {
          m.castShadow = shadows
          m.receiveShadow = true
          fullMeshes++
        }
      })
      group.add(holder)
      holders.push(holder)
      arrows.push(rig.group.getObjectByName('arrow') ?? null)
    } else {
      holders.push(null)
      arrows.push(null)
    }
    rigs.push(rig)
    members.push({
      index: i,
      full: rig !== null,
      detail: detailOf(i),
      variant: variants[i]!,
      rig,
      slot: slots[i]!,
      position: new Vector3(infos[i]!.x, 0, infos[i]!.z),
      heading: infos[i]!.h,
      state: 'idle',
      height: (rig?.height ?? getBake(variants[i]!, detail).height) * infos[i]!.e,
      scale: infos[i]!.e,
    })
  }

  // ---- instanced ranks
  const pools: Pool[] = []
  for (const d of (detail === 'hi' ? ['hi'] : ['hi', 'lo']) as Detail[]) {
    for (let v = 0; v < nVariants; v++) {
      const idx = members.filter((m) => !m.full && m.detail === d && m.variant === v).map((m) => m.index)
      if (!idx.length) continue
      const pool = new Pool(getBake(v, d), idx, shadows)
      for (const p of pool.meshes) group.add(p.mesh)
      pools.push(pool)
    }
  }
  const poolOf = new Map<number, { pool: Pool; slot: number }>()
  for (const pool of pools) pool.members.forEach((mi, slot) => poolOf.set(mi, { pool, slot }))

  const frontRank = members.filter((m) => m.slot.rank === 0).map((m) => m.index)
  const frames: Frame[] = infos.map((_, i) => tl.frame(i, 0))
  const mm = new Matrix4()
  const pos = new Vector3()
  const quat = new Quaternion()
  let now = 0
  let drawn: { t: number; version: number } | null = null
  let disposed = false

  const resolve = (sel: MemberSel | undefined): number[] => {
    if (sel === undefined || sel === 'all') return members.map((m) => m.index)
    if (sel === 'front') return [...frontRank]
    if (sel === 'rear') return members.filter((m) => m.slot.rank > 0).map((m) => m.index)
    if (sel === 'full') return members.filter((m) => m.full).map((m) => m.index)
    if (sel === 'instanced') return members.filter((m) => !m.full).map((m) => m.index)
    return sel.filter((i) => i >= 0 && i < count)
  }
  const send = (cmd: Cmd, sel: MemberSel | undefined, opts?: CommandOpts): void => {
    tl.add(opts?.at ?? now, cmd, resolve(opts?.members ?? sel))
  }

  const crowd: Crowd = {
    group,
    kind,
    members,
    frontRank,
    scale: k,
    get time() {
      return now
    },
    update(t) {
      if (disposed) return
      if (drawn && drawn.t === t && drawn.version === tl.version) return
      now = t
      for (let i = 0; i < count; i++) {
        const f = tl.frame(i, t)
        frames[i] = f
        const info = infos[i]!
        const m = members[i]!
        place(f, info.e, pos, quat)
        m.position.set(f.x, f.y, f.z)
        m.heading = f.h
        m.state = f.state
        const holder = holders[i]
        if (holder) {
          holder.position.copy(pos)
          holder.quaternion.copy(quat)
          holder.scale.setScalar(info.e)
          const rig = rigs[i]!
          applyClip(rig, f.clip)
          const ar = arrows[i]
          if (ar) ar.visible = f.arrow
        } else {
          const ref = poolOf.get(i)!
          mm.compose(pos, quat, sv.set(info.e, info.e, info.e))
          ref.pool.write(ref.slot, f, mm)
        }
      }
      for (const p of pools) p.commit()
      drawn = { t, version: tl.version }
    },
    march(target, speed, opts) {
      const isPath = Array.isArray(target[0])
      const cmd: Cmd = {
        k: 'march',
        path: isPath ? (target as Vec2[]) : null,
        dir: isPath ? null : (target as Vec2),
        speed,
        ramp: opts?.ramp ?? 0.5,
        ...(opts?.gait ? { gait: opts.gait } : {}),
      }
      send(cmd, 'all', opts)
    },
    halt(opts) {
      send({ k: 'halt', decel: opts?.decel ?? 0.4 }, 'all', opts)
    },
    face(dir, opts) {
      send({ k: 'face', dir }, 'all', opts)
    },
    kneel(opts) {
      send({ k: 'kneel', on: true, dur: opts?.dur ?? 0.55 }, 'all', opts)
    },
    stand(opts) {
      const sel = resolve(opts?.members)
      const at = opts?.at ?? now
      tl.add(at, { k: 'kneel', on: false, dur: opts?.dur ?? 0.5 }, sel)
      tl.add(at, { k: 'stand' }, sel)
    },
    draw(p, opts) {
      if (p === undefined) send({ k: 'bow', from: null, to: 1, dur: opts?.dur ?? 0.9, release: false }, 'all', opts)
      else send({ k: 'bow', from: null, to: Math.max(0, Math.min(1, p)), dur: 0, release: false }, 'all', opts)
    },
    loose(opts) {
      send({ k: 'bow', from: null, to: 0, dur: 0.2, release: true }, 'all', opts)
    },
    stagger(sel, opts) {
      send({ k: 'stagger', dur: opts?.dur ?? 0.55, hold: opts?.hold ?? 0.5 }, sel ?? 'all', opts)
    },
    fall(sel, style, impulse, opts) {
      const dist = typeof impulse === 'number' ? impulse : impulse ? Math.hypot(impulse[0], impulse[1]) : style === 'fling' ? 1.5 : style === 'forward' ? 0.12 : 0.2
      const dir: Vec2 | null = Array.isArray(impulse) ? (impulse as Vec2) : null
      send({ k: 'fall', style, dir, dist, dur: opts?.dur ?? 0.85, apex: opts?.apex ?? 0.7 }, sel, opts)
    },
    flee(sel, opts) {
      send({ k: 'flee', dir: opts?.dir ?? [0, -1], speed: opts?.speed ?? 1.5 }, sel ?? 'all', opts)
    },
    select: resolve,
    pick(n, pseed, from) {
      const pool = resolve(from)
      const order = seededOrder(pool.length, pseed ^ seed)
      return order.slice(0, Math.max(0, Math.min(n, pool.length))).map((j) => pool[j]!).sort((a, b) => a - b)
    },
    jointPosition(i, joint, out = new Vector3(), world = false) {
      const f = frames[i]!
      place(f, infos[i]!.e, pos, quat)
      mm.compose(pos, quat, sv.set(infos[i]!.e, infos[i]!.e, infos[i]!.e))
      const ref = poolOf.get(i)
      const bake = ref ? ref.pool.bake : getBake(variants[i]!)
      applyClip(bake.evaluator, f.clip)
      bake.evaluator.group.updateMatrixWorld(true)
      const ev = bake.evaluator
      const j = bake.joints.get(joint) ?? (ev.joints as Record<string, Object3D | undefined>)[joint] ?? (ev.mount?.joints as Record<string, Object3D | undefined> | undefined)?.[joint.replace('h:', '')] ?? ev.group
      out.setFromMatrixPosition(tv2.multiplyMatrices(mm, j.matrixWorld))
      if (world) {
        group.updateMatrixWorld()
        group.localToWorld(out)
      }
      return out
    },
    positionOf(i, out = new Vector3(), world = false) {
      out.copy(members[i]!.position)
      if (world) {
        group.updateMatrixWorld()
        group.localToWorld(out)
      }
      return out
    },
    extent(i, parts) {
      const f = frames[i]!
      place(f, infos[i]!.e, pos, quat)
      mm.compose(pos, quat, sv.set(infos[i]!.e, infos[i]!.e, infos[i]!.e))
      return bakeExtent(poolOf.get(i)?.pool.bake ?? getBake(variants[i]!), f.clip, mm, parts)
    },
    frame: (i) => frames[i]!,
    stats() {
      const instancedMeshes = pools.reduce((a, p) => a + p.meshes.length, 0)
      const instanced = members.filter((m) => !m.full).length
      const full = members.length - instanced
      const fullTris = rigs.reduce((a, r) => {
        if (!r) return a
        let t = 0
        r.group.traverse((m) => {
          if (m instanceof Mesh) t += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes['position']!.count / 3
        })
        return a + t
      }, 0)
      return { members: count, full, instanced, drawCalls: instancedMeshes + fullMeshes, instancedMeshes, triangles: Math.round(fullTris + pools.reduce((a, p) => a + p.triangles, 0)) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const p of pools) p.dispose()
      for (const r of rigs) r?.dispose()
      for (const h of holders) h?.removeFromParent()
      for (const b of bakes.values()) releaseBake(b)
      bakes.clear()
      group.removeFromParent()
    },
  }
  // the time of the first frame is 0 unless the scene says otherwise
  crowd.update(0)
  return crowd
}

/** Frees the shared baked geometries and materials of every crowd (tests, hot reload). */
export function disposeCrowds(): void {
  disposeCrowdCaches()
  disposeCrowdMaterials()
}

export { flingTime }
