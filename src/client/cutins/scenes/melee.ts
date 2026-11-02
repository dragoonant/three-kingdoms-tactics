// The background battle (owner, 2026-11-01: "troops fighting each other from each side around the stratagem move, so it doesn't
// look like an isolated battle, it's happening inside of a larger war"). Around the featured action of a cut-in, small knots of
// both sides' troops skirmish in the mid and far ground: pairs and knots duelling (thrust and lunge, block and give a step), the odd
// one going down, a few running past, a few riders, dust, a banner or two leaning in the sand. Built on the instanced crowds
// (one crowd per side and kind, explicit places), so it costs a handful of draw calls, and scheduled up front like everything in a
// cut-in: a pure function of story time. It never stands in the scene's lanes (the discs the scene passes in `exclude`: where its
// figures stand, run, ride or are flung, and the near part of the camera's view).
import { CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three'
import { createCrowd, type Crowd } from '../crowd'
import type { SidePalette, TroopKindName } from '../plan'
import { rand, srand } from '../rng'
import { ParticleBuffer } from '../stage/ParticleBuffer'
import { TABLE } from '../stage/Stage'
import type { Disc } from '../stage/lens'
import { CrowdScript, CrowdSet, meleeQuality, type CrowdQuality } from './ranks'

export interface MeleeSide {
  palette: SidePalette
  /** The foot kind of the side's skirmishers (infantry, or rebel for the Yellow Turbans). */
  foot: TroopKindName
}

export interface MeleeOpts {
  seed: number
  /** The middle of the featured action (world x, z). */
  center: readonly [number, number]
  /** The two sides: [the caster's, the target's]. */
  sides: readonly [MeleeSide, MeleeSide]
  /** Fighting knots at full quality (pairs and threes and fours). */
  knots: number
  /** Rider duels (a rider of one side against foot of the other). */
  riders?: number
  /** Troops running past, tangentially. */
  runners?: number
  /** Banners leaning in the sand. */
  banners?: number
  /** The ring the background fills: from rMin to rMax tiles around `center`. */
  rMin: number
  rMax: number
  /** Story length of the scene: duels run to the end, runners must not cross a lane at any time before it. */
  duration: number
  /** Ground the background keeps out of. */
  exclude: readonly Disc[]
  quality?: CrowdQuality
}

export interface Melee {
  crowds: CrowdSet
  /** Everything to mount: the crowds, the banners and the dust. */
  group: Group
  /** Members per side, [caster's, target's]. */
  members: [number, number]
  /** Pose and dust at story time s (ppu: the point-sprite scale of this frame). */
  update(s: number, ppu: number): void
  /** Draw calls of one pass (crowds, banners, dust). */
  drawCalls(): number
  dispose(): void
}

const CLOTH: Record<SidePalette, string> = { han: '#2f6b5e', yellow: '#d4a72c', cao: '#34495e', dong: '#6b1f2a', lu: '#5b2c6f', court: '#5d5a52' }

interface Slot {
  x: number
  z: number
  h: number
}
type Role = { kind: 'duel'; period: number; phase: number; fall: number | null } | { kind: 'run'; dir: [number, number]; speed: number }

/** Discs every sampled point of which keeps `pad` clear of the excluded ground and of the table's rim. */
function freeAt(x: number, z: number, pad: number, exclude: readonly Disc[]): boolean {
  if (Math.abs(x) > TABLE.halfX - 0.5 || Math.abs(z) > TABLE.halfZ - 0.5) return false
  for (const d of exclude) if ((d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + pad) ** 2) return false
  return true
}

export function backgroundMelee(o: MeleeOpts): Melee | null {
  const q = o.quality ?? meleeQuality()
  if (q === 'off') return null
  const lite = q === 'lite'
  const seed = o.seed
  const nKnots = Math.round(o.knots * (lite ? 0.5 : 1))
  const nRiders = lite ? 0 : (o.riders ?? 0)
  const nRunners = Math.round((o.runners ?? 0) * (lite ? 0.5 : 1))
  // slots per side and kind: [side][foot | rider]
  const slots: Slot[][][] = [
    [[], []],
    [[], []],
  ]
  const roles: Role[][][] = [
    [[], []],
    [[], []],
  ]
  const centres: { x: number; z: number; r: number }[] = []
  const taken: Disc[] = []
  const place = (pad: number, tries: number, salt: number): [number, number] | null => {
    for (let k = 0; k < tries; k++) {
      const a = rand(seed, salt, k, 1) * Math.PI * 2
      const r = o.rMin + (o.rMax - o.rMin) * Math.sqrt(rand(seed, salt, k, 2))
      const x = o.center[0] + Math.cos(a) * r
      const z = o.center[1] + Math.sin(a) * r
      if (!freeAt(x, z, pad, o.exclude)) continue
      if (taken.some((d) => (d.x - x) ** 2 + (d.z - z) ** 2 < (d.r + pad) ** 2)) continue
      return [x, z]
    }
    return null
  }
  const add = (side: number, rider: number, s: Slot, role: Role): void => {
    slots[side]![rider]!.push(s)
    roles[side]![rider]!.push(role)
  }
  const duel = (k: number, n: number, period: number): Role => ({ kind: 'duel', period, phase: (k / n + rand(seed, k, n, 9) * 0.08) % 1, fall: null })

  // the knots: a pair face to face, or three or four around a point, sides alternating
  for (let k = 0; k < nKnots; k++) {
    const size = rand(seed, k, 3) < 0.6 ? 2 : rand(seed, k, 4) < 0.6 ? 3 : 4
    const at = place(0.7, 80, 100 + k)
    if (!at) continue
    const [cx, cz] = at
    taken.push({ x: cx, z: cz, r: 0.75 })
    centres.push({ x: cx, z: cz, r: 0.3 })
    const th = rand(seed, k, 5) * Math.PI * 2
    const period = 1.0 + rand(seed, k, 6) * 0.5
    const first = rand(seed, k, 7) < 0.5 ? 0 : 1
    const goesDown = rand(seed, k, 8) < 0.3 ? Math.floor(rand(seed, k, 10) * size) : -1
    for (let j = 0; j < size; j++) {
      const a = th + (j / size) * Math.PI * 2
      const rad = size === 2 ? 0.21 : 0.27
      const x = cx + Math.sin(a) * rad
      const z = cz + Math.cos(a) * rad
      // facing the middle of the knot
      const h = Math.atan2(cx - x, cz - z)
      const role = duel(j, size, period) as Extract<Role, { kind: 'duel' }>
      if (j === goesDown) role.fall = 0.9 + rand(seed, k, 11) * Math.max(0.5, o.duration - 2.2)
      add((first + j) % 2, 0, { x, z, h }, role)
    }
  }
  // rider duels: a rider of one side against one or two foot of the other
  for (let k = 0; k < nRiders; k++) {
    const at = place(0.95, 40, 300 + k)
    if (!at) continue
    const [cx, cz] = at
    taken.push({ x: cx, z: cz, r: 0.95 })
    centres.push({ x: cx, z: cz, r: 0.4 })
    const th = rand(seed, k, 21) * Math.PI * 2
    const side = k % 2
    const period = 1.3 + rand(seed, k, 22) * 0.4
    add(side, 1, { x: cx - Math.sin(th) * 0.3, z: cz - Math.cos(th) * 0.3, h: th }, duel(0, 2, period))
    const foot = rand(seed, k, 23) < 0.5 ? 1 : 2
    for (let j = 0; j < foot; j++) {
      const a = th + (foot === 2 ? (j - 0.5) * 0.7 : 0)
      const x = cx + Math.sin(a) * 0.3
      const z = cz + Math.cos(a) * 0.3
      add(1 - side, 0, { x, z, h: Math.atan2(cx - Math.sin(th) * 0.3 - x, cz - Math.cos(th) * 0.3 - z) }, duel(1, 2, period))
    }
  }
  // runners: across the ring, tangentially, on a line that stays clear of every lane for the whole scene
  for (let k = 0; k < nRunners; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const at = place(0.4, 1, 500 + k * 31 + tries)
      if (!at) continue
      const [x, z] = at
      const rx = x - o.center[0]
      const rz = z - o.center[1]
      const l = Math.hypot(rx, rz) || 1
      const sgn = rand(seed, k, tries, 31) < 0.5 ? 1 : -1
      const dir: [number, number] = [(-rz / l) * sgn, (rx / l) * sgn]
      const speed = 1.1 + rand(seed, k, 32) * 0.4
      let ok = true
      for (let t = 0; t <= o.duration + 0.5 && ok; t += 0.2) ok = freeAt(x + dir[0] * speed * t, z + dir[1] * speed * t, 0.3, o.exclude)
      if (!ok) continue
      add(k % 2, 0, { x, z, h: Math.atan2(dir[0], dir[1]) }, { kind: 'run', dir, speed })
      break
    }
  }

  // the crowds: one per side and kind, the members standing at their places (crowd frame = world)
  const crowds = new CrowdSet('melee')
  const all: { c: Crowd; roles: Role[] }[] = []
  for (let side = 0; side < 2; side++) {
    for (let rider = 0; rider < 2; rider++) {
      const sl = slots[side]![rider]!
      if (!sl.length) continue
      const c = crowds.add(
        createCrowd({ kind: rider ? 'cavalry' : o.sides[side]!.foot, side: o.sides[side]!.palette, count: sl.length, slots: sl, seed: seed + side * 7 + rider * 3, frontRankFull: 0, variants: 1, detail: 'lo', castShadow: false, cadence: 1 }),
      )
      if (c) all.push({ c, roles: roles[side]![rider]! })
    }
  }
  for (const { c, roles: rs } of all) {
    const sc = new CrowdScript()
    rs.forEach((r, i) => {
      if (r.kind === 'run') {
        sc.at(-0.5, () => c.march(r.dir, r.speed, { at: -0.5, members: [i], ramp: 0.3 }))
        return
      }
      sc.at(-1, () => c.fight([i], { at: -1, period: r.period, phase: r.phase, lunge: 0.06 }))
      if (r.fall !== null) {
        const t = r.fall
        sc.at(t, () => c.stagger([i], { at: t, hold: 0.05, dur: 0.16 }))
        sc.at(t + 0.16, () => c.fall([i], rand(seed, i, 41) < 0.5 ? 'back' : 'forward', undefined, { at: t + 0.16 }))
      }
    })
    sc.apply()
    c.update(0)
  }

  // banners leaning in the sand, one per side
  const group = new Group()
  group.add(crowds.group)
  const disposables: { dispose(): void }[] = []
  const banners: Group[] = []
  for (let k = 0; k < (o.banners ?? 0); k++) {
    const at = place(0.35, 40, 700 + k)
    if (!at) continue
    taken.push({ x: at[0], z: at[1], r: 0.35 })
    const g = new Group()
    const poleGeo = new CylinderGeometry(0.011, 0.015, 0.95, 6).translate(0, 0.475, 0)
    const clothGeo = new PlaneGeometry(0.34, 0.2).translate(0.17, 0.78, 0)
    const poleMat = new MeshStandardMaterial({ color: '#4a2f1c', roughness: 0.8 })
    const clothMat = new MeshStandardMaterial({ color: k % 2 ? '#c8372d' : CLOTH[o.sides[k % 2]!.palette], side: DoubleSide, roughness: 0.85 })
    disposables.push(poleGeo, clothGeo, poleMat, clothMat)
    g.add(new Mesh(poleGeo, poleMat), new Mesh(clothGeo, clothMat))
    g.position.set(at[0], 0, at[1])
    g.rotation.set(0.28 + rand(seed, k, 51) * 0.25, rand(seed, k, 52) * Math.PI * 2, srand(seed, k, 53) * 0.2, 'YXZ')
    group.add(g)
    banners.push(g)
  }

  // dust: a low haze kicked up at every knot, and a puff behind every runner
  const dust = new ParticleBuffer(centres.length * 4 + 40, 'alpha', 0.9)
  disposables.push(dust)
  group.add(dust.points)
  const v = new Vector3()
  const members: [number, number] = [0, 0]
  for (let side = 0; side < 2; side++) members[side] = slots[side]![0]!.length + slots[side]![1]!.length

  return {
    crowds,
    group,
    members,
    update(s, ppu) {
      crowds.update(s)
      banners.forEach((b, k) => {
        const cloth = b.children[1]!
        cloth.rotation.y = Math.sin(s * 2.1 + k * 1.7) * 0.35
      })
      dust.begin(ppu)
      centres.forEach((cn, k) => {
        for (let j = 0; j < 4; j++) {
          const u = (s * 0.55 + j / 4 + rand(seed, k, j, 61) * 0.25) % 1
          dust.push(cn.x + srand(seed, k, j, 62) * 0.35 + u * 0.12, 0.04 + u * 0.16, cn.z + srand(seed, k, j, 63) * 0.35, 0.14 + 0.3 * u, 0.8, 0.68, 0.5, 0.22 * Math.sin(Math.PI * u))
        }
      })
      for (const { c } of all) {
        for (const m of c.members) {
          const f = c.frame(m.index)
          if (f.speed < 0.8) continue
          c.positionOf(m.index, v, true)
          for (let j = 0; j < 2; j++) {
            const u = (s * 3.2 + j / 2 + rand(seed, m.index, j, 64) * 0.3) % 1
            dust.push(v.x - Math.sin(m.heading) * u * 0.3, 0.03 + u * 0.1, v.z - Math.cos(m.heading) * u * 0.3, 0.08 + 0.18 * u, 0.8, 0.67, 0.47, 0.3 * (1 - u) ** 1.3)
          }
        }
      }
      dust.end()
    },
    drawCalls() {
      return crowds.stats().drawCalls + banners.length * 2 + 1
    },
    dispose() {
      crowds.dispose()
      for (const d of disposables) d.dispose()
      group.removeFromParent()
    },
  }
}

/**
 * Discs over everywhere the crowds of a scene go during it (sampled every `step` of story time), for `exclude`. Leaves every
 * crowd posed at time 0.
 */
export function crowdLanes(set: CrowdSet, duration: number, r = 0.55, step = 0.25): Disc[] {
  const out: Disc[] = []
  const v = new Vector3()
  for (let t = 0; t <= duration + 1e-9; t += step) {
    set.update(t)
    for (const c of set.list) for (const m of c.members) {
      c.positionOf(m.index, v, true)
      out.push({ x: v.x, z: v.z, r })
    }
  }
  set.update(0)
  return out
}

/** The two sides of a background battle from the cut-in's two palettes (Yellow Turbans fight as rebels, everyone else as infantry). */
export function meleeSides(atk: SidePalette, def: SidePalette): [MeleeSide, MeleeSide] {
  const foot = (p: SidePalette): TroopKindName => (p === 'yellow' ? 'rebel' : 'infantry')
  return [
    { palette: atk, foot: foot(atk) },
    { palette: def, foot: foot(def) },
  ]
}

/** Discs covering a rectangle (a field the background keeps out of). */
export function boxDiscs(x0: number, x1: number, z0: number, z1: number, r = 0.5): Disc[] {
  const out: Disc[] = []
  for (let x = x0; x <= x1 + 1e-9; x += r) for (let z = z0; z <= z1 + 1e-9; z += r) out.push({ x, z, r: r * 0.75 })
  return out
}
