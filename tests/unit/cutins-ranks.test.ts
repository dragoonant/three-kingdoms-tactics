// The instanced ranks of the cut-ins (docs/spec/51 "More troops" / PLAN D22, docs/spec/52-crowds.md "How a scene should use it"):
// troops per side, that the crowds move with the scene (pure functions of story time), the quality profile, and the review fixes
// that are pure (lens clearance, the millet action lane).
import { Vector3 } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { disposeCrowds } from '../../src/client/cutins/crowd'
import { milletLayout } from '../../src/client/cutins/fireModel'
import { SCENE_INFO } from '../../src/client/cutins/sceneInfo'
import type { SceneId } from '../../src/client/cutins/plan'
import { buildActRanks, frontHeroActor, type ActRanks } from '../../src/client/cutins/scenes/actRanks'
import { figures } from '../../src/client/figures'
import { A_LAYOUT } from '../../src/client/cutins/scenes/fireArrows'
import { buildScene, samplePlan } from '../../src/client/cutins/scenes/index'
import { rankCount } from '../../src/client/cutins/scenes/ranks'
import { backgroundMelee, meleeSides, type Melee } from '../../src/client/cutins/scenes/melee'
import { lensClear } from '../../src/client/cutins/stage/lens'
import { evaluate } from '../../src/client/cutins/timeline'
import { disposeFigureCaches } from '../../src/client/figures/kit'

const built: ActRanks[] = []
afterAll(() => {
  built.forEach((r) => r.crowds.dispose())
  disposeCrowds()
  disposeFigureCaches()
})

const ACT: SceneId[] = ['C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']

describe('troops per side (D22: 20-30 a side in full scenes, 10-15 in short ones)', () => {
  it.each(ACT)('%s: front-rank rigs + instanced ranks', (id) => {
    const sc = buildScene(samplePlan(id))
    const act = sc.act!
    const ranks = (side: 'atk' | 'def'): number => act.ranks.filter((r) => r.id === side).reduce((a, r) => a + r.count, 0)
    const atk = act.actors.filter((a) => a.group !== 'def').length + ranks('atk')
    const def = act.actors.filter((a) => a.group === 'def').length + ranks('def')
    if (SCENE_INFO[id].full) {
      expect(atk).toBeGreaterThanOrEqual(19)
      expect(atk).toBeLessThanOrEqual(30)
      if (id !== 'W') {
        expect(def).toBeGreaterThanOrEqual(20)
        expect(def).toBeLessThanOrEqual(30)
      } else expect(def).toBe(0)
    } else {
      expect(atk).toBeGreaterThanOrEqual(10)
      expect(atk).toBeLessThanOrEqual(15)
      expect(def).toBeGreaterThanOrEqual(10)
      expect(def).toBeLessThanOrEqual(15)
    }
  })

  it('A and B: the fixed ranks behind their seven-figure front ranks', () => {
    expect(A_LAYOUT.archerCount + 1 + A_LAYOUT.archerRanks).toBeGreaterThanOrEqual(20)
    expect(A_LAYOUT.rebelCount + A_LAYOUT.defRanks).toBeGreaterThanOrEqual(20)
  })

  it('a flank or rear hit turns the defending ranks the way their front rank faces', () => {
    for (const arc of ['side', 'rear'] as const) {
      const sc = buildScene(samplePlan('S-melee', { arc }))
      const def = sc.act!.ranks.find((r) => r.id === 'def')!
      const yaw = sc.act!.actors.find((a) => a.group === 'def')!.track.yaw
      expect(def.turnTo).toBeCloseTo(yaw, 9)
    }
    expect(buildScene(samplePlan('S-melee', { arc: 'front' })).act!.ranks.find((r) => r.id === 'def')!.turnTo).toBeUndefined()
  })
})

describe('the ranks move with the scene', () => {
  const at = (r: ActRanks, side: 'atk' | 'def', t: number): { pos: number[]; states: string[] } => {
    const c = side === 'atk' ? r.atk! : r.def!
    c.update(t)
    const v = new Vector3()
    return { pos: c.members.flatMap((m) => (c.positionOf(m.index, v, true), [+v.x.toFixed(4), +v.z.toFixed(4)])), states: c.members.map((m) => m.state) }
  }

  it.each(ACT.filter((id) => id !== 'W'))('%s: the defenders react (stagger, fall or flee) and nobody stands frozen', (id) => {
    const sc = buildScene(samplePlan(id))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    expect(r.def).not.toBeNull()
    const seen = new Set<string>()
    for (let t = 0; t <= sc.duration; t += 0.1) for (const s of at(r, 'def', t).states) seen.add(s)
    expect([...seen].some((s) => s === 'stagger' || s === 'down' || s === 'flung' || s === 'fled' || s === 'march')).toBe(true)
  })

  it.each(['C', 'S-melee', 'S-cavalry'] as SceneId[])('%s: the attacking ranks advance with the front rank', (id) => {
    const sc = buildScene(samplePlan(id))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    const z0 = at(r, 'atk', 0).pos.filter((_, k) => k % 2 === 1)
    const z1 = at(r, 'atk', sc.duration).pos.filter((_, k) => k % 2 === 1)
    const moved = z1.reduce((a, z, k) => a + (z - z0[k]!), 0) / z0.length
    expect(moved).toBeGreaterThan(0.3)
  })

  it('W: the ranks kneel while the wind is called, and stand again', () => {
    const sc = buildScene(samplePlan('W'))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    expect(at(r, 'atk', 1.4).states.filter((s) => s === 'kneel').length).toBeGreaterThan(r.atk!.members.length / 2)
    expect(at(r, 'atk', 0.2).states.every((s) => s === 'idle')).toBe(true)
  })

  it('S-archer: the ranks loose one arrow each, landing among the defenders after the front rank looses', () => {
    const sc = buildScene(samplePlan('S-archer'))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    expect(r.arrows.length).toBe(r.atk!.members.length)
    const loose = sc.cues.find((c) => c.action === 'loose')!.start
    for (const a of r.arrows) {
      expect(a.launch).toBeGreaterThanOrEqual(loose - 0.1)
      expect(a.land).toBeGreaterThan(a.launch)
      expect(a.to[2]).toBeGreaterThan(1.5)
    }
  })

  it('is a pure function of story time: scrubbing back and forth gives the same frame', () => {
    const sc = buildScene(samplePlan('S-cavalry'))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    const a = at(r, 'def', 1.7)
    at(r, 'def', 2.6)
    at(r, 'def', 0.2)
    expect(at(r, 'def', 1.7)).toEqual(a)
    const r2 = buildActRanks(sc, sc.act!)
    built.push(r2)
    expect(at(r2, 'def', 1.7)).toEqual(a)
  })

  it('the falls of the ranks follow the plan: none when the attack did no damage', () => {
    const sc = buildScene(samplePlan('S-archer', { damage: 0, falls: 0 }))
    const r = buildActRanks(sc, sc.act!)
    built.push(r)
    for (let t = 0; t <= sc.duration; t += 0.1) expect(at(r, 'def', t).states.some((s) => s === 'down' || s === 'flung')).toBe(false)
  })
})

describe('short scenes: the hero leads the front rank', () => {
  it('a named officer with a hero design takes the middle of the front rank (the apex of a wedge)', () => {
    const heroes = figures.heroIds()
    const melee = buildScene(samplePlan('S-melee'))
    expect(heroes).toContain(melee.params!.caster.officer)
    const id = frontHeroActor(melee, melee.act!, heroes)!
    const a = melee.act!.actors.find((x) => x.id === id)!
    expect(a.front).toBe(true)
    expect(Math.abs(a.track.start[0])).toBeLessThan(0.05)
    const cav = buildScene(samplePlan('S-cavalry'))
    expect(frontHeroActor(cav, cav.act!, heroes)).toBe('atk0')
  })
  it('an officer without a hero design leaves the troops as they are, and full scenes keep their own hero', () => {
    const heroes = figures.heroIds()
    const archers = buildScene(samplePlan('S-archer'))
    expect(heroes).not.toContain(archers.params!.caster.officer)
    expect(frontHeroActor(archers, archers.act!, heroes)).toBeNull()
    const c = buildScene(samplePlan('C'))
    expect(frontHeroActor(c, c.act!, heroes)).toBeNull()
  })
})

describe('the background battle (owner 2026-11-01: "inside of a larger war")', () => {
  const made: Melee[] = []
  afterAll(() => made.forEach((m) => m.dispose()))
  const lane = [
    { x: 0, z: 0, r: 1.2 },
    { x: 0, z: 2, r: 1.2 },
    { x: 3, z: 1, r: 1.0 },
  ]
  const make = (quality: 'full' | 'lite' | 'off' = 'full'): Melee | null => {
    const m = backgroundMelee({ seed: 31, center: [0, 1], sides: meleeSides('han', 'yellow'), knots: 14, riders: 2, runners: 3, banners: 2, rMin: 1.2, rMax: 6.5, duration: 6, exclude: lane, quality })
    if (m) made.push(m)
    return m
  }
  const positions = (m: Melee, t: number): { x: number; z: number; state: string }[] => {
    m.update(t, 500)
    const v = new Vector3()
    return m.crowds.list.flatMap((c) => c.members.map((mm) => (c.positionOf(mm.index, v, true), { x: +v.x.toFixed(4), z: +v.z.toFixed(4), state: mm.state })))
  }

  it('fills both sides with knots of fighters, a few riders and runners', () => {
    const m = make()!
    expect(m.members[0]).toBeGreaterThan(8)
    expect(m.members[1]).toBeGreaterThan(8)
    expect(m.crowds.list.some((c) => c.kind === 'cavalry')).toBe(true)
    expect(m.crowds.list.map((c) => c.kind).sort()).toEqual(expect.arrayContaining(['infantry', 'rebel']))
    const mid = positions(m, 3)
    expect(mid.filter((q) => q.state === 'fight').length).toBeGreaterThan(mid.length / 2)
    expect(mid.some((q) => q.state === 'march')).toBe(true)
  })

  it('never stands, fights, falls or runs in the excluded lanes, at any time of the scene', () => {
    const m = make()!
    for (let t = 0; t <= 6; t += 0.25) for (const q of positions(m, t)) for (const d of lane) expect(Math.hypot(q.x - d.x, q.z - d.z)).toBeGreaterThan(d.r)
  })

  it('duels on the spot: the fighters lunge and give ground about their place, for the whole scene', () => {
    const m = make()!
    const a = positions(m, 0.5)
    const zs = [1.1, 2.3, 3.7, 5.2].map((t) => positions(m, t))
    a.forEach((q, i) => {
      if (zs[0]![i]!.state !== 'fight') return
      for (const z of zs) if (z[i]!.state === 'fight') expect(Math.hypot(z[i]!.x - q.x, z[i]!.z - q.z)).toBeLessThan(0.12)
    })
    expect(zs.flatMap((z) => z).filter((q) => q.state === 'fight').length).toBeGreaterThan(20)
  })

  it('is a pure function of time and seed; lite halves it, off removes it', () => {
    const a = make()!
    const b = make()!
    expect(positions(a, 2.2)).toEqual(positions(b, 2.2))
    positions(a, 5)
    expect(positions(a, 2.2)).toEqual(positions(b, 2.2))
    const lite = make('lite')!
    expect(lite.members[0] + lite.members[1]).toBeLessThan(a.members[0] + a.members[1])
    expect(make('off')).toBeNull()
  })

  it('costs a few dozen draw calls (instanced, no shadow pass)', () => {
    const m = make()!
    expect(m.drawCalls()).toBeLessThan(90)
  })
})

describe('quality profile', () => {
  it('lite keeps 60% of the ranks, off keeps none', () => {
    expect(rankCount(20, 'full')).toBe(20)
    expect(rankCount(20, 'lite')).toBe(12)
    expect(rankCount(20, 'off')).toBe(0)
  })
})

describe('review fixes (2026-11-01)', () => {
  it('lens clearance: discs cover the near view of every low shot and none of the high ones', () => {
    const sc = buildScene(samplePlan('Ap', { terrain: 'forest' }))
    const discs = lensClear(sc, { reach: 2.2, maxY: 1.4 })
    expect(discs.length).toBeGreaterThan(0)
    for (let t = 0; t <= sc.duration; t += 0.5) {
      const cam = evaluate(sc, t).camera
      const covered = discs.some((d) => Math.hypot(d.x - cam.pos[0], d.z - cam.pos[2]) <= d.r + 1e-9)
      expect(covered).toBe(cam.pos[1] <= 1.4)
    }
  })

  it('millet action lane: stalks there are thinned and cut to half height; outside it nothing changes', () => {
    const box = { x0: -2, x1: 2, z0: 0, z1: 2 }
    const lane = [{ x: 0, z: 1, r: 0.6 }]
    const plain = milletLayout(box, 11)
    const thin = milletLayout(box, 11, [], lane)
    const inLane = (s: { x: number; z: number }): boolean => Math.hypot(s.x, s.z - 1) < 0.6
    expect(thin.stalks.filter(inLane).length).toBeLessThan(plain.stalks.filter(inLane).length * 0.7)
    expect(Math.max(...thin.stalks.filter(inLane).map((s) => s.h))).toBeLessThanOrEqual(0.0751)
    expect(thin.stalks.filter((s) => !inLane(s))).toEqual(plain.stalks.filter((s) => !inLane(s)))
  })

  it('S-cavalry: the flank camera holds the clash from under 2.5 tiles (it was 3.2) and stays outside the wedge', () => {
    const sc = buildScene(samplePlan('S-cavalry'))
    const t = sc.beats.find((b) => b.id === 'SC3')!
    const cam = evaluate(sc, (t.start + t.end) / 2).camera
    const line = sc.act!.actors.find((a) => a.group === 'def')!.track.start[1]
    expect(Math.hypot(cam.pos[0], cam.pos[2] - line)).toBeLessThan(2.5)
    const widest = Math.max(...sc.act!.actors.filter((a) => a.group === 'atk').map((a) => Math.abs(a.track.start[0])))
    expect(Math.abs(cam.pos[0])).toBeGreaterThan(widest + 0.3)
  })
})
