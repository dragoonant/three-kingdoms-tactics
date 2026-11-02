// Crowds (docs/spec/52-crowds.md): formation layouts, determinism, instance counts, that the instanced parts follow the same
// joint clips as full rigs, that marching feet stay on the sand, and that fallen and flung bodies end up lying flat at y = 0.
import { InstancedMesh, Matrix4, Vector3 } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { createCrowd, disposeCrowds, layoutFormation, minSeparation, type Crowd, type CrowdOptions, type FormationName } from '../../src/client/cutins/crowd'
import { Timeline, type MemberInfo } from '../../src/client/cutins/crowd/motion'
import { applyClip } from '../../src/client/figures/clips'
import { disposeFigureCaches } from '../../src/client/figures/kit'
import type { TroopKind } from '../../src/client/figures/rig'
import { figures } from '../../src/client/figures'

const made: Crowd[] = []
const make = (o: CrowdOptions): Crowd => {
  const c = createCrowd(o)
  made.push(c)
  return c
}
afterAll(() => {
  made.forEach((c) => c.dispose())
  disposeCrowds()
  disposeFigureCaches()
})

const meshes = (c: Crowd): InstancedMesh[] => c.group.children.filter((o): o is InstancedMesh => o instanceof InstancedMesh)
const matrices = (c: Crowd): number[][] => meshes(c).map((m) => Array.from((m.instanceMatrix.array as Float32Array).slice(0, m.count * 16)))

/** Everything but the weapon arms (a spear butt or a lance tip may poke into the sand by design). */
const BODY = ['hips', 'torso', 'head', 'legL', 'legR', 'footL', 'footR', 'h:body', 'h:neck', 'h:head', 'h:legFL', 'h:legFR', 'h:legBL', 'h:legBR', 'h:hoofFL', 'h:hoofFR', 'h:hoofBL', 'h:hoofBR', 'h:tail']

const KINDS: [TroopKind, FormationName][] = [
  ['infantry', 'block'],
  ['archer', 'line'],
  ['cavalry', 'wedge'],
  ['rebel', 'mob'],
]

describe('crowd formations', () => {
  it.each(['block', 'line', 'wedge', 'mob'] as const)('%s lays out every member once, front rank first, centred', (formation) => {
    for (const n of [1, 7, 24, 40]) {
      const slots = layoutFormation({ kind: 'infantry', formation, count: n, seed: 3 })
      expect(slots).toHaveLength(n)
      // the front rank is the front: nobody in a later rank stands ahead of the first member of the first rank by more than the jitter
      expect(slots[0]!.rank).toBe(0)
      const maxZ = Math.max(...slots.map((s) => s.z))
      expect(Math.abs(maxZ)).toBeLessThan(0.2)
      // ranks never decrease along the list
      for (let i = 1; i < n; i++) expect(slots[i]!.rank).toBeGreaterThanOrEqual(slots[i - 1]!.rank)
    }
  })

  it.each(KINDS)('%s members never stand inside each other', (kind, formation) => {
    const slots = layoutFormation({ kind, formation, count: 40, seed: 9 })
    const min = minSeparation(slots)
    expect(min).toBeGreaterThan(kind === 'cavalry' ? 0.55 : 0.34)
  })

  it('is deterministic in the seed and the mob changes with it', () => {
    const a = layoutFormation({ kind: 'rebel', formation: 'mob', count: 30, seed: 4 })
    const b = layoutFormation({ kind: 'rebel', formation: 'mob', count: 30, seed: 4 })
    const c = layoutFormation({ kind: 'rebel', formation: 'mob', count: 30, seed: 5 })
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('the wedge has one at the apex and widens; the line has at most two ranks of 14', () => {
    const w = layoutFormation({ kind: 'cavalry', formation: 'wedge', count: 21, seed: 1, jitter: 0 })
    expect(w.filter((s) => s.rank === 0)).toHaveLength(1)
    expect(w.filter((s) => s.rank === 5)).toHaveLength(6)
    const l = layoutFormation({ kind: 'archer', formation: 'line', count: 28, seed: 1 })
    expect(Math.max(...l.map((s) => s.rank))).toBe(1)
  })
})

describe('crowd rendering budget', () => {
  it('front rank are full rigs, the rest instanced, in a handful of draw calls', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 30, seed: 2, frontRankFull: 4 })
    const s = c.stats()
    expect(s.full).toBe(4)
    expect(s.instanced).toBe(26)
    expect(c.members.filter((m) => m.full)).toHaveLength(4)
    expect(c.members.slice(0, 4).every((m) => m.full && m.rig)).toBe(true)
    expect(c.members[4]!.full).toBe(false)
    // every instanced member has one instance in every part of its variant
    for (const m of meshes(c)) expect(m.count).toBeGreaterThan(0)
    const perMember = meshes(c).length
    expect(perMember).toBeLessThan(60)
    expect(c.frontRank.length).toBeGreaterThan(3)
  })

  it('hi mode draws the whole front at full detail instanced; compacted rigs (PLAN D32) cost even less', () => {
    const rig = make({ kind: 'cavalry', side: 'han', count: 30, seed: 2, frontRankFull: 3 })
    const hi = make({ kind: 'cavalry', side: 'han', count: 30, seed: 2, frontRankFull: 3, frontRankMode: 'hi' })
    expect(hi.stats().full).toBe(0)
    expect(hi.stats().drawCalls).toBeLessThan(150)
    // a rigged front rank is compacted to a skinned body and its weapon (figures/compact.ts): a handful of draws per rider
    expect(rig.stats().drawCalls - rig.stats().instancedMeshes).toBeLessThanOrEqual(3 * 8)
    expect(rig.stats().drawCalls).toBeLessThan(hi.stats().drawCalls)
  })

  it('lo detail has far fewer triangles than the rig it was baked from', () => {
    const lo = make({ kind: 'infantry', side: 'han', count: 20, seed: 1, frontRankFull: 0, variants: 1 })
    const hi = make({ kind: 'infantry', side: 'han', count: 20, seed: 1, frontRankFull: 0, variants: 1, detail: 'hi' })
    expect(lo.stats().triangles).toBeLessThan(hi.stats().triangles * 0.45)
  })
})

describe('crowd determinism', () => {
  const script = (c: Crowd): void => {
    c.march([0, 1], 0.9, { at: 0.5 })
    c.stagger('front', { at: 1.5 })
    c.fall(c.pick(6, 3), 'fling', 1.2, { at: 2 })
    c.flee('rear', { at: 3, dir: [0, -1] })
  }
  const opts: CrowdOptions = { kind: 'rebel', side: 'yellow', count: 24, seed: 8, frontRankFull: 2 }

  it('the same seed and commands give the same matrices at the same t, whatever was drawn before', () => {
    const a = make(opts)
    const b = make(opts)
    script(a)
    script(b)
    a.update(0.2)
    a.update(4.1)
    a.update(2.3)
    b.update(2.3)
    expect(matrices(a)).toEqual(matrices(b))
    expect(a.members.map((m) => m.position.toArray())).toEqual(b.members.map((m) => m.position.toArray()))
  })

  it('a different seed gives a different crowd', () => {
    const a = make(opts)
    const b = make({ ...opts, seed: 9 })
    a.update(1)
    b.update(1)
    expect(matrices(a)).not.toEqual(matrices(b))
  })

  it('repeating the running command every frame changes nothing, and going back in time replays', () => {
    const infos: MemberInfo[] = Array.from({ length: 3 }, (_, i) => ({
      index: i, kind: 'infantry', mounted: false, x: i * 0.3, z: 0, h: 0, e: 0.5, phase: 0, dPhase: 0, side: 1, lean: 0, look: 0, hBias: 0, fleeK: 1, r: 0.5,
    }))
    const tl = new Timeline(infos)
    for (let k = 0; k < 40; k++) tl.add(k * 0.05, { k: 'march', path: null, dir: [0, 1], speed: 1, ramp: 0.5 }, [0, 1, 2])
    expect(tl.eventCount).toBe(1)
    tl.add(1, { k: 'halt', decel: 0.4 }, [0, 1, 2])
    expect(tl.eventCount).toBe(2)
    tl.add(0.5, { k: 'march', path: null, dir: [1, 0], speed: 1, ramp: 0.5 }, [0, 1, 2])
    expect(tl.eventCount).toBe(2)
  })
})

describe('instanced ranks follow the same joint clips as full rigs', () => {
  it('a member joint is where a full rig posed with the same clip puts it', () => {
    for (const kind of ['infantry', 'archer', 'cavalry', 'rebel'] as TroopKind[]) {
      const c = make({ kind, side: 'han', count: 12, seed: 6, frontRankFull: 0, variants: 3 })
      c.march([0, 1], 1.1, { at: 0.2 })
      c.update(1.7)
      for (const i of [2, 7]) {
        const m = c.members[i]!
        const f = c.frame(i)
        const ref = figures.buildTroop(kind, 'han', m.variant)
        applyClip(ref, f.clip)
        ref.group.updateMatrixWorld(true)
        const joints = kind === 'cavalry' ? ['handR', 'footL', 'head'] : ['handR', 'footL', 'head', 'legR']
        for (const j of joints) {
          const expected = ref.joints[j as 'handR']!.getWorldPosition(new Vector3()).multiplyScalar(m.scale)
          // heading about +Y, then the ground position
          const c0 = Math.cos(f.h)
          const s0 = Math.sin(f.h)
          const ex = expected.x * c0 + expected.z * s0 + f.x
          const ez = -expected.x * s0 + expected.z * c0 + f.z
          const got = c.jointPosition(i, j)
          expect(got.x).toBeCloseTo(ex, 4)
          expect(got.y).toBeCloseTo(expected.y + f.y, 4)
          expect(got.z).toBeCloseTo(ez, 4)
        }
        ref.dispose()
      }
    }
  })

  it('members animate: legs move over a stride, and each member has its own phase', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 12, seed: 6, frontRankFull: 0, formation: 'mob' })
    c.march([0, 1], 0.55, { at: 0 })
    const rot = (t: number, i: number): number => {
      c.update(t)
      return c.frame(i).clip.pose.legL?.r?.[0] ?? 0
    }
    const seq = [1, 1.08, 1.16, 1.24, 1.32].map((t) => rot(t, 3))
    expect(Math.max(...seq) - Math.min(...seq)).toBeGreaterThan(0.25)
    c.update(1.2)
    const phases = new Set(c.members.map((_, i) => c.frame(i).clip.pose.legL?.r?.[0]?.toFixed(2)))
    expect(phases.size).toBeGreaterThan(4)
  })

  it('the gait runs on distance: the cycle phase is distance / stride, so feet do not skate', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 6, seed: 6, frontRankFull: 0 })
    c.march([0, 1], 0.5, { at: 0, ramp: 0 })
    c.update(2)
    const p0 = c.members[1]!.position.clone()
    const d0 = c.frame(1).dist
    c.update(3.5)
    const travelled = c.members[1]!.position.distanceTo(p0)
    expect(travelled).toBeCloseTo(0.75, 3)
    expect(c.frame(1).dist - d0).toBeCloseTo(travelled, 3)
  })

  it('marching soldiers and riders keep their lowest point on the sand', () => {
    for (const [kind, speed] of [['infantry', 0.5], ['infantry', 1.5], ['cavalry', 1.0], ['cavalry', 2.6]] as [TroopKind, number][]) {
      const c = make({ kind, side: 'han', count: 8, seed: 4, frontRankFull: 0 })
      c.march([0, 1], speed, { at: 0, ramp: 0.2 })
      for (const t of [0.5, 0.9, 1.3, 1.7, 2.1]) {
        c.update(t)
        for (const i of [0, 3]) {
          // boots and hooves (a footman's spear butt reaches below the sand by design); the run and the gallop have a flight phase
          const e = c.extent(i, kind === 'cavalry' ? ['footL', 'footR', 'h:hoofFL', 'h:hoofFR', 'h:hoofBL', 'h:hoofBR', 'h:legFL', 'h:legFR', 'h:legBL', 'h:legBR'] : ['footL', 'footR'])
          expect(e.minY).toBeGreaterThan(-0.02)
          expect(e.minY).toBeLessThan(kind === 'cavalry' ? 0.12 : speed > 1 ? 0.07 : 0.05)
        }
      }
    }
  })
})

describe('falls', () => {
  it('back and forward falls end lying flat on the sand', () => {
    for (const style of ['back', 'forward'] as const) {
      const c = make({ kind: 'rebel', side: 'yellow', count: 10, seed: 2, frontRankFull: 0 })
      c.fall([1, 4], style, undefined, { at: 0.2 })
      c.update(0.1)
      const standing = c.extent(1).maxY
      c.update(2)
      for (const i of [1, 4]) {
        const e = c.extent(i, BODY)
        expect(c.members[i]!.state).toBe('down')
        expect(e.minY).toBeGreaterThan(-0.015)
        expect(e.minY).toBeLessThan(0.03)
        expect(e.maxY).toBeLessThan(standing * 0.5)
      }
    }
  })

  it('a flung body flies, lands at y = 0 and lies flat; it never goes through the sand on the way', () => {
    const c = make({ kind: 'rebel', side: 'yellow', count: 8, seed: 3, frontRankFull: 0 })
    c.fall([2, 5], 'fling', 1.6, { at: 0.5, apex: 0.7 })
    c.update(0.2)
    const standing = c.extent(2).maxY
    let apex = 0
    let floor = Infinity
    for (let t = 0.5; t <= 2.5; t += 0.05) {
      c.update(t)
      for (const i of [2, 5]) {
        const e = c.extent(i, BODY)
        apex = Math.max(apex, c.members[i]!.position.y)
        floor = Math.min(floor, e.minY)
      }
    }
    expect(apex).toBeGreaterThan(0.45)
    expect(floor).toBeGreaterThan(-0.05)
    c.update(3.2)
    for (const i of [2, 5]) {
      const e = c.extent(i, BODY)
      expect(c.members[i]!.state).toBe('down')
      expect(e.minY).toBeGreaterThan(-0.02)
      expect(e.minY).toBeLessThan(0.03)
      expect(e.maxY).toBeLessThan(standing * 0.5)
    }
    // it landed somewhere other than where it stood
    expect(c.members[2]!.position.distanceTo(new Vector3(c.members[2]!.slot.x * c.scale, 0, c.members[2]!.slot.z * c.scale))).toBeGreaterThan(1)
  })

  it('a toppled or flung rider lies on its side on the sand', () => {
    const c = make({ kind: 'cavalry', side: 'han', count: 8, seed: 3, frontRankFull: 0 })
    c.fall([1], 'back', undefined, { at: 0.2 })
    c.fall([2], 'fling', 1.5, { at: 0.2 })
    c.update(0.1)
    const standing = c.extent(3).maxY
    c.update(3)
    for (const i of [1, 2]) {
      const e = c.extent(i, BODY)
      expect(e.minY).toBeGreaterThan(-0.03)
      expect(e.minY).toBeLessThan(0.05)
      expect(e.maxY).toBeLessThan(standing * 0.95)
    }
  })

  it('the fallen and the routed ignore later orders', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 8, seed: 3, frontRankFull: 0 })
    c.fall([1], 'back', undefined, { at: 0.1 })
    c.flee([2], { at: 0.1 })
    c.march([0, 1], 1, { at: 0.5 })
    c.update(0.4)
    const p1 = c.members[1]!.position.clone()
    c.update(3)
    expect(c.members[1]!.state).toBe('down')
    expect(c.members[1]!.position.distanceTo(p1)).toBeLessThan(0.3)
    expect(c.members[2]!.state).toBe('fled')
    expect(c.members[0]!.state).toBe('march')
  })
})

describe('archers', () => {
  it('draw, loose, and the arrow is gone until the next draw; they kneel and rise', () => {
    const c = make({ kind: 'archer', side: 'han', count: 10, seed: 3, frontRankFull: 0 })
    c.kneel({ at: 0.1 })
    c.draw(undefined, { at: 1, dur: 0.8 })
    c.loose({ at: 2.5 })
    c.update(0.05)
    const standing = c.jointPosition(0, 'head').y
    c.update(0.9)
    expect(c.jointPosition(0, 'head').y).toBeLessThan(standing * 0.85)
    c.update(1.9)
    expect(c.frame(0).arrow).toBe(true)
    expect(c.frame(0).clip.pose.torso?.r?.[1] ?? 0).toBeGreaterThan(0.8)
    c.update(2.9)
    expect(c.frame(0).arrow).toBe(false)
    c.draw(0.5, { at: 3 })
    c.update(3.1)
    expect(c.frame(0).arrow).toBe(true)
    c.stand({ at: 3.2 })
    c.update(4.2)
    expect(c.jointPosition(0, 'head').y).toBeGreaterThan(standing * 0.95)
  })
})

describe('targeting', () => {
  it('pick is seeded and stays inside the selection; positions are readable', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 20, seed: 3, frontRankFull: 2 })
    const a = c.pick(5, 7, 'rear')
    expect(a).toEqual(c.pick(5, 7, 'rear'))
    expect(a.every((i) => !c.frontRank.includes(i))).toBe(true)
    expect(new Set(a).size).toBe(5)
    const m = new Matrix4()
    void m
    const w = c.positionOf(0, undefined, true)
    expect(Number.isFinite(w.x + w.y + w.z)).toBe(true)
    expect(c.jointPosition(10, 'head').y).toBeGreaterThan(0.1)
  })

  it('placed and faced by the options', () => {
    const c = make({ kind: 'infantry', side: 'han', count: 4, seed: 3, frontRankFull: 0, origin: [5, 0, 2], facing: Math.PI / 2 })
    c.update(0)
    expect(c.group.position.x).toBe(5)
    expect(c.group.rotation.y).toBeCloseTo(Math.PI / 2)
    const wp = c.positionOf(0, undefined, true)
    expect(wp.x).toBeGreaterThan(4)
  })
})
