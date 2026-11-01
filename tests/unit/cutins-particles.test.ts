// Battle cut-ins (docs/spec/51 "Determinism"): particles, plans and layouts are pure functions of (seed, id, time).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIRE, burnState, igniteTime, milletLayout } from '../../src/client/cutins/fireModel'
import { burstPosition, sampleSlot, type SlotConfig } from '../../src/client/cutins/particles'
import { hash32, mulberry32, noise1, rand, seededOrder, srand } from '../../src/client/cutins/rng'
import { A_LAYOUT, aStory, arrowAt, arrowPlan, fallers, ignitions, rebelHitTime } from '../../src/client/cutins/scenes/fireArrows'
import { B_LAYOUT, contactTime, fallOrder, flingPlan, leaderAt, rebelLine, riderAt, startZ } from '../../src/client/cutins/scenes/thunderingCharge'

describe('rng', () => {
  it('is stateless and uniform-ish', () => {
    expect(rand(1, 2, 3)).toBe(rand(1, 2, 3))
    expect(rand(1, 2, 3)).not.toBe(rand(1, 2, 4))
    expect(hash32(5)).toBe(hash32(5))
    let sum = 0
    for (let i = 0; i < 2000; i++) {
      const r = rand(77, i)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
      sum += r
    }
    expect(sum / 2000).toBeGreaterThan(0.45)
    expect(sum / 2000).toBeLessThan(0.55)
    expect(srand(3, 4)).toBeGreaterThanOrEqual(-1)
    expect(noise1(1.5, 3)).toBe(noise1(1.5, 3))
  })
  it('seeded order is a permutation and repeatable', () => {
    const o = seededOrder(18, 7101)
    expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i))
    expect(seededOrder(18, 7101)).toEqual(o)
    const g = mulberry32(5)
    const h = mulberry32(5)
    expect([g(), g(), g()]).toEqual([h(), h(), h()])
  })
  it('no cut-in source uses Math.random', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
    const files = walk('src/client/cutins').filter((f) => /\.(ts|tsx)$/.test(f))
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/Math\.random\s*\(/)
  })
})

describe('particle slots', () => {
  const cfg: SlotConfig = { seed: 11, count: 50, period: 0.8, start: 1, end: 5, lifeMin: 0.4 }
  it('same (slot, t) gives the same particle every time, in any order', () => {
    const ts = [0.5, 1.2, 2.2, 3.7, 5.1, 9]
    const run = (): string => JSON.stringify(ts.flatMap((t) => Array.from({ length: 50 }, (_, i) => { const s = sampleSlot(cfg, i, t); return [s.alive, s.tb, s.age, s.u, s.k, s.r(3)] })))
    const a = run()
    const reversed = JSON.stringify([...ts].reverse().flatMap((t) => Array.from({ length: 50 }, (_, i) => { const s = sampleSlot(cfg, i, t); return [s.alive, s.tb, s.age, s.u, s.k, s.r(3)] })))
    expect(run()).toBe(a)
    expect(reversed).not.toBe('')
  })
  it('respects the emission window and the particle life', () => {
    for (let i = 0; i < 50; i++) {
      expect(sampleSlot(cfg, i, 0.9).alive).toBe(false)
      expect(sampleSlot(cfg, i, 6.5).alive).toBe(false)
    }
    let alive = 0
    for (let i = 0; i < 50; i++) {
      const s = sampleSlot(cfg, i, 3)
      if (s.alive) {
        alive++
        expect(s.age).toBeGreaterThanOrEqual(0)
        expect(s.age).toBeLessThan(cfg.period)
        expect(s.u).toBeGreaterThanOrEqual(0)
        expect(s.u).toBeLessThanOrEqual(1)
        expect(s.tb).toBeGreaterThanOrEqual(cfg.start)
        expect(s.tb).toBeLessThanOrEqual(cfg.end)
      }
    }
    expect(alive).toBeGreaterThan(20)
  })
  it('a slot gets fresh randoms each cycle', () => {
    const a = sampleSlot(cfg, 3, 2.0)
    const b = sampleSlot(cfg, 3, 2.0 + cfg.period)
    if (a.alive && b.alive) expect(a.r(1)).not.toBe(b.r(1))
  })
  it('burst particles fly ballistically and are deterministic', () => {
    expect(burstPosition(1, 2, 1, 0.5, [0, 0, 0], 1, 3, 0.6)).toBeNull()
    const a = burstPosition(1, 2, 1, 1.3, [0, 0.1, 0], 1, 3, 0.6)!
    expect(a).toEqual(burstPosition(1, 2, 1, 1.3, [0, 0.1, 0], 1, 3, 0.6))
    expect(a.p[1]).toBeGreaterThanOrEqual(0)
    expect(burstPosition(1, 2, 1, 2, [0, 0, 0], 1, 3, 0.6)).toBeNull()
  })
})

describe('fire model (scene A)', () => {
  const plan = arrowPlan()
  const ign = ignitions(plan)
  it('has 18 arrows in a fan, launched together and landing within about half a second', () => {
    expect(plan.length).toBe(18)
    const launches = plan.map((p) => p.launch)
    expect(Math.max(...launches) - Math.min(...launches)).toBeLessThan(0.1)
    expect(Math.min(...launches)).toBeCloseTo(aStory(2.55), 6)
    const lands = plan.map((p) => p.land)
    expect(Math.min(...lands)).toBeCloseTo(aStory(4.05), 9)
    expect(Math.max(...lands) - Math.min(...lands)).toBeLessThan(0.5)
    // exactly one arrow lands first (the hit-stop frame)
    expect(lands.filter((l) => Math.abs(l - Math.min(...lands)) < 1e-9).length).toBe(1)
  })
  it('arrows rise, peak mid-flight above 2 units, and come down at their landing spot', () => {
    for (const a of plan) {
      const mid = arrowAt(a, (a.launch + a.land) / 2)
      expect(mid.p[1]).toBeGreaterThan(2)
      expect(mid.d[1]).toBeLessThan(0.3)
      const end = arrowAt(a, a.land)
      expect(end.p[0]).toBeCloseTo(a.to[0], 6)
      expect(end.p[2]).toBeCloseTo(a.to[2], 6)
      expect(arrowAt(a, a.land - 0.3).d[1]).toBeLessThan(0)
    }
  })
  it('the apex of the volley falls inside the slow-motion window', () => {
    const apexes = plan.map((a) => (a.launch + a.land) / 2)
    const mean = apexes.reduce((x, y) => x + y, 0) / apexes.length
    expect(mean).toBeGreaterThan(aStory(3.1) - 0.05)
    expect(mean).toBeLessThan(aStory(3.5) + 0.05)
  })
  it('flames run downwind (+x) much faster than upwind or across', () => {
    const g = [{ x: 0, z: 2.5, t: 4 }]
    const down = igniteTime(g, 1.2, 2.5) - 4
    const up = igniteTime(g, -1.2, 2.5) - 4
    const cross = igniteTime(g, 0, 2.5 + 1.2) - 4
    expect(down).toBeLessThan(up / 4)
    expect(down).toBeLessThan(cross / 2)
    expect(down).toBeCloseTo(1.2 / FIRE.vDown, 1)
  })
  it('a stalk goes fresh, catching, burning, charred, and never back', () => {
    expect(burnState(5, 4.9).phase).toBe('fresh')
    expect(burnState(5, 5.1).phase).toBe('catching')
    expect(burnState(5, 6).phase).toBe('burning')
    expect(burnState(5, 5 + FIRE.burn + 0.1).phase).toBe('charred')
    expect(burnState(5, 20).char).toBeGreaterThan(0.95)
  })
  it('millet layout is deterministic and keeps clear zones empty', () => {
    const a = milletLayout(A_LAYOUT.field, 7101, [{ x: 0, z: 2.5, r: 0.3 }])
    const b = milletLayout(A_LAYOUT.field, 7101, [{ x: 0, z: 2.5, r: 0.3 }])
    expect(a.stalks.length).toBe(b.stalks.length)
    expect(a.stalks[100]).toEqual(b.stalks[100])
    expect(a.stalks.some((s) => (s.x - 0) ** 2 + (s.z - 2.5) ** 2 < 0.09)).toBe(false)
    expect(a.stalks.length).toBeGreaterThan(1000)
  })
  it('the first ignition time of every stalk is finite', () => {
    expect(Number.isFinite(igniteTime(ign, 3, 3))).toBe(true)
  })
  it('fallers: the count follows the damage sample, with at least one and never more than the line', () => {
    expect(fallers(2).length).toBe(2)
    expect(new Set(fallers(5)).size).toBe(5)
    expect(fallers(99).length).toBe(A_LAYOUT.rebelCount)
    expect(fallers(2)).toEqual(fallers(2))
  })
  it('every rebel is hit after the first impact', () => {
    for (let i = 0; i < A_LAYOUT.rebelCount; i++) expect(rebelHitTime(plan, i)).toBeGreaterThanOrEqual(aStory(4.05) - 1e-9)
  })
})

describe('charge path (scene B)', () => {
  it('the leader holds until 1.62, then accelerates to a gallop, and is at the first rebel at 3.6', () => {
    expect(leaderAt(1.0).speed).toBe(0)
    expect(leaderAt(1.0).z).toBeCloseTo(startZ(), 9)
    expect(leaderAt(2.4).speed).toBeGreaterThan(leaderAt(1.8).speed)
    expect(leaderAt(3.4).speed).toBeGreaterThan(4.5)
    const first = Math.min(...fallOrder(4).map((i) => rebelLine(i)[1]))
    const nose = riderAt(0, 3.6).z + 0.4
    expect(nose).toBeCloseTo(first, 1)
  })
  it('the wedge wheels to the right and ends facing back toward the line', () => {
    expect(leaderAt(4.3).heading).toBeLessThan(0.05)
    expect(leaderAt(5.8).heading).toBeCloseTo(Math.PI, 1)
    expect(leaderAt(6.5).x).toBeGreaterThan(leaderAt(4.4).x + 1)
    // and it never leaves the table (half-extents 10 x 8)
    for (let t = 0; t <= 7; t += 0.05) {
      for (let m = 0; m < 4; m++) {
        const p = riderAt(m, t)
        expect(Math.abs(p.x)).toBeLessThan(9)
        expect(Math.abs(p.z)).toBeLessThan(7.9)
      }
    }
  })
  it('path is continuous', () => {
    let prev = leaderAt(0)
    for (let t = 0.01; t <= 7; t += 0.01) {
      const p = leaderAt(t)
      expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(0.08)
      prev = p
    }
  })
  it('flung rebels: the count follows the sample, wedge first then sweep, contacts after the hit-stop starts', () => {
    const plan = flingPlan(4)
    expect(plan.length).toBe(4)
    expect(plan.filter((f) => f.by === 'wedge').length).toBe(2)
    expect(plan.filter((f) => f.by === 'sweep').length).toBe(2)
    for (const f of plan) expect(f.t).toBeGreaterThanOrEqual(3.58)
    expect(Math.min(...plan.filter((f) => f.by === 'wedge').map((f) => f.t))).toBeCloseTo(3.6, 1)
    expect(flingPlan(1).length).toBe(1)
    expect(flingPlan(99).length).toBe(B_LAYOUT.rebelCount)
    expect(contactTime(3).t).toBeLessThan(3.8)
  })
})
