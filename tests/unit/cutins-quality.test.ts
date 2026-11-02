// Cut-in quality tiers and the per-frame cuts (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32).
import { Box3, Group, Mesh, MeshStandardMaterial, BoxGeometry, type SkinnedMesh } from 'three'
import { describe, expect, it } from 'vitest'
import { applyCasters, casterGroup } from '../../src/client/cutins/casterPolicy'
import { makeArrowProp } from '../../src/client/cutins/props'
import {
  afterWarm,
  deviceTier,
  Governor,
  lower,
  lowest,
  MAX_INTERVAL_MS,
  resolveTier,
  startTier,
  STEP_MS,
  TIERS,
  TIER_ORDER,
  useQuality,
  WINDOW,
} from '../../src/client/cutins/quality'
import { applyClip, gallop, swingOverhead } from '../../src/client/figures/clips'
import { compactRig, mergeStatic } from '../../src/client/figures/compact'
import { buildHeroRig } from '../../src/client/figures/heroes'
import { HORSE_JOINTS, HUMAN_JOINTS } from '../../src/client/figures/rig'
import { buildTroopRig } from '../../src/client/figures/troops'

const desktop = { touch: false, minSide: 1080, ios: false }
const iphone = { touch: true, minSide: 390, ios: true }
const android = { touch: true, minSide: 412, ios: false }
const tablet = { touch: true, minSide: 1024, ios: false }

describe('tier selection (Auto)', () => {
  it('starts from the device: iOS or a touch phone at Medium, everything else at High', () => {
    expect(deviceTier(desktop)).toBe('high')
    expect(deviceTier(iphone)).toBe('medium')
    expect(deviceTier(android)).toBe('medium')
    expect(deviceTier(tablet)).toBe('high')
  })
  it('a remembered step-down lowers the start, never raises it', () => {
    expect(startTier(desktop, 'low')).toBe('low')
    expect(startTier(iphone, 'high')).toBe('medium')
    expect(startTier(iphone, null)).toBe('medium')
  })
  it('a slow board after the warm-up starts a tier lower', () => {
    expect(afterWarm('high', 16.7)).toBe('high')
    expect(afterWarm('high', STEP_MS + 5)).toBe('medium')
    expect(afterWarm('low', 80)).toBe('low')
    expect(afterWarm('medium', null)).toBe('medium')
  })
  it('steps go one tier at a time and stop at Low', () => {
    expect(lower('high')).toBe('medium')
    expect(lower('medium')).toBe('low')
    expect(lower('low')).toBe('low')
    expect(lowest('high', 'medium')).toBe('medium')
    expect(resolveTier('auto', 'low')).toBe('low')
    expect(resolveTier('high', 'low')).toBe('high')
  })
})

describe('live governor', () => {
  it('steps down when the median interval stays above the limit over a full window', () => {
    const g = new Governor()
    for (let i = 0; i < WINDOW - 1; i++) expect(g.feed(40)).toBe(false)
    expect(g.feed(40)).toBe(true)
    // the window starts again after a step
    expect(g.size).toBe(0)
  })
  it('does not step for fast frames, a few slow ones, or pauses', () => {
    const g = new Governor()
    for (let i = 0; i < 60; i++) expect(g.feed(i % 5 === 0 ? 60 : 16.7)).toBe(false)
    const h = new Governor()
    for (let i = 0; i < 60; i++) expect(h.feed(MAX_INTERVAL_MS + 100)).toBe(false)
    expect(h.size).toBe(0)
  })
  it('the store steps Auto down one tier per call and never below Low; a manual choice is never stepped', () => {
    const s = useQuality.getState()
    s.setChoice('auto')
    const from = useQuality.getState().auto
    useQuality.getState().stepDown('test')
    expect(TIER_ORDER.indexOf(useQuality.getState().tier)).toBe(Math.min(2, TIER_ORDER.indexOf(from) + 1))
    useQuality.getState().stepDown('test')
    useQuality.getState().stepDown('test')
    expect(useQuality.getState().tier).toBe('low')
    useQuality.getState().setChoice('high')
    useQuality.getState().stepDown('test')
    expect(useQuality.getState().tier).toBe('high')
    useQuality.getState().setChoice('auto')
    expect(useQuality.getState().tier).toBe('low')
  })
})

describe('tier table', () => {
  it('each lower tier costs no more than the one above, and Low fits the phone budget', () => {
    expect(TIERS.low.budget).toBeLessThanOrEqual(300)
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const a = TIERS[TIER_ORDER[i - 1]!]
      const b = TIERS[TIER_ORDER[i]!]
      expect(b.budget).toBeLessThanOrEqual(a.budget)
      expect(b.dpr).toBeLessThanOrEqual(a.dpr)
      expect(b.shadowMap).toBeLessThanOrEqual(a.shadowMap)
      expect(b.fx).toBeLessThanOrEqual(a.fx)
    }
    expect(TIERS.high.casters).toBe('all')
  })
})

/** World-space box of every vertex, posed (skinned meshes through their bones). */
function posedBox(root: Group): Box3 {
  root.updateMatrixWorld(true)
  for (const o of root.children) o.updateMatrixWorld(true)
  root.traverse((o) => {
    const s = o as SkinnedMesh
    if (s.isSkinnedMesh) s.skeleton.update()
  })
  return new Box3().setFromObject(root, true)
}

describe('rig compaction (figures/compact.ts)', () => {
  it('a mounted hero is a handful of draws, with every joint of the contract still in place', () => {
    const rig = buildHeroRig('guan-yu', { mounted: true })!
    const joints = { ...rig.joints }
    const horse = { ...rig.mount!.joints }
    const r = compactRig(rig)
    expect(r.before).toBeGreaterThan(90)
    expect(r.after).toBeLessThanOrEqual(6)
    for (const k of HUMAN_JOINTS) expect(rig.joints[k]).toBe(joints[k])
    for (const k of HORSE_JOINTS) expect(rig.mount!.joints[k]).toBe(horse[k])
    // the weapon is its own draw under its joint, so a scene can still hide it
    expect(rig.joints.weapon.children.some((c) => (c as Mesh).isMesh)).toBe(true)
    let meshes = 0
    rig.group.traverse((o) => {
      if ((o as Mesh).isMesh) meshes++
    })
    expect(meshes).toBe(r.after)
  })

  it('draws the same figure in any pose (posed vertex bounds match the uncompacted rig)', () => {
    for (const [make, clip] of [
      [() => buildHeroRig('guan-yu', { mounted: true })!, gallop(0.37)],
      [() => buildTroopRig('infantry', 'han', 1), swingOverhead(0.6)],
    ] as const) {
      const a = make()
      const b = make()
      compactRig(b)
      applyClip(a, clip)
      applyClip(b, clip)
      a.group.rotation.y = b.group.rotation.y = 0.7
      a.group.position.set(1, 0, 2)
      b.group.position.set(1, 0, 2)
      const ba = posedBox(a.group)
      const bb = posedBox(b.group)
      expect(bb.min.distanceTo(ba.min)).toBeLessThan(1e-4)
      expect(bb.max.distanceTo(ba.max)).toBeLessThan(1e-4)
    }
  })

  it('hiding the weapon joint hides the weapon (it is not part of the skinned body)', () => {
    const rig = buildTroopRig('infantry', 'han', 0)
    compactRig(rig)
    const before = posedBox(rig.group)
    rig.joints.weapon.visible = false
    const after = posedBox(rig.group)
    expect(after.max.y).toBeLessThanOrEqual(before.max.y)
  })

  it('the culling sphere follows the pose', () => {
    const rig = buildTroopRig('infantry', 'cao', 0)
    compactRig(rig)
    rig.group.updateMatrixWorld(true)
    let sk: SkinnedMesh | null = null
    rig.group.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh && !sk) sk = o as SkinnedMesh
    })
    const s0 = sk!.boundingSphere!.clone()
    rig.joints.root.position.x += 3
    rig.group.updateMatrixWorld(true)
    const s1 = sk!.boundingSphere!.clone()
    expect(s1.center.x - s0.center.x).toBeGreaterThan(2.5)
    expect(s1.radius).toBeGreaterThan(0.2)
  })

  it('a second copy of a design reuses the merged geometry', () => {
    const a = buildTroopRig('archer', 'yellow', 2)
    const b = buildTroopRig('archer', 'yellow', 2)
    compactRig(a)
    compactRig(b)
    const ga = new Set<unknown>()
    a.group.traverse((o) => (o as Mesh).isMesh && ga.add((o as Mesh).geometry))
    let shared = 0
    b.group.traverse((o) => (o as Mesh).isMesh && ga.has((o as Mesh).geometry) && shared++)
    expect(shared).toBeGreaterThan(0)
  })
})

describe('static dressing and props', () => {
  it('mergeStatic draws one mesh per material and undoes cleanly', () => {
    const g = new Group()
    const m = new MeshStandardMaterial()
    const box = new BoxGeometry(1, 1, 1)
    for (let i = 0; i < 5; i++) {
      const x = new Mesh(box, m)
      x.position.x = i
      g.add(x)
    }
    const undo = mergeStatic(g)
    const visible = g.children.filter((c) => c.visible)
    expect(visible).toHaveLength(1)
    expect(new Box3().setFromObject(visible[0]!).max.x).toBeCloseTo(4.5)
    undo()
    expect(g.children.filter((c) => c.visible)).toHaveLength(5)
  })
  it('an arrow is one draw with its own glow', () => {
    const a = makeArrowProp(0.3)
    const b = makeArrowProp(0.3)
    let n = 0
    a.group.traverse((o) => (o as Mesh).isMesh && n++)
    expect(n).toBe(1)
    expect(a.wrap.geometry).toBe(b.wrap.geometry)
    expect(a.wrapMat).not.toBe(b.wrapMat)
  })
})

describe('caster policy', () => {
  it('keeps the named officers at Low, the figures and the stage at Medium, everything at High; reversible', () => {
    const root = new Group()
    const stage = new Group()
    stage.userData.perf = 'stage'
    const ranks = new Group()
    ranks.userData.perf = 'ranks'
    const fig = new Group()
    fig.name = 'figure'
    fig.userData.lead = true
    const troop = new Group()
    troop.name = 'figure'
    const mk = (p: Group) => {
      const m = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
      m.castShadow = true
      p.add(m)
      return m
    }
    const s = mk(stage)
    const r = mk(ranks)
    const f = mk(fig)
    const t = mk(troop)
    const prop = mk(root)
    root.add(stage, ranks, fig, troop)
    expect(casterGroup(f)).toBe('lead')
    expect(casterGroup(t)).toBe('hero')
    expect(casterGroup(r)).toBe('rank-inst')
    expect(applyCasters(root, 'heroes')).toBe(1)
    expect([s.castShadow, r.castShadow, f.castShadow, t.castShadow, prop.castShadow]).toEqual([false, false, true, false, false])
    expect(applyCasters(root, 'near')).toBe(3)
    expect(applyCasters(root, 'all')).toBe(5)
  })
})
