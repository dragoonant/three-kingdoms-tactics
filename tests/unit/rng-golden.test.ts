import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import golden from '../fixtures/golden-daxing.json'
import { createBattle, legalActions, nextFloat, replay, seedRng, step, type Action, type BattleState } from '../../src/engine'
import { act, mk, u } from './helpers'

function playAll(seed: number, actions: Action[]): BattleState {
  let s = createBattle('daxing-hill', seed)
  for (const a of actions) s = act(s, a).state
  return s
}

describe('R-RNG-1 determinism', () => {
  it('R-RNG-1 sfc32 is deterministic and well spread', () => {
    const a = seedRng(123)
    const b = seedRng(123)
    const xs = Array.from({ length: 5 }, () => nextFloat(a))
    expect(Array.from({ length: 5 }, () => nextFloat(b))).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(seedRng(124)).not.toEqual(seedRng(123))
    const big = seedRng(7)
    let sum = 0
    for (let i = 0; i < 20000; i++) sum += nextFloat(big)
    expect(sum / 20000).toBeGreaterThan(0.49)
    expect(sum / 20000).toBeLessThan(0.51)
    // reference values pin the generator (changing sfc32 would break every replay)
    expect(xs.map((x) => Math.round(x * 1e6) / 1e6)).toMatchInlineSnapshot(`
      [
        0.636188,
        0.520507,
        0.454593,
        0.014929,
        0.96725,
      ]
    `)
  })
  it('R-RNG-1 the same seed and action list reproduce the same battle; another seed differs', () => {
    const actions = golden.actions as Action[]
    const a = playAll(golden.seed, actions.slice(0, 120))
    const b = playAll(golden.seed, actions.slice(0, 120))
    expect(b).toEqual(a)
    const mkDuel = (seed: number) => mk({ seed, units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'd', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 5000 }] })
    const dmg = (seed: number) => 5000 - u(act(mkDuel(seed), { type: 'attack', unit: 'a', target: 'd' }).state, 'd').troops
    expect(dmg(9)).toBe(dmg(9))
    expect(new Set(Array.from({ length: 20 }, (_, i) => dmg(i + 1))).size).toBeGreaterThan(1)
  })
  it('R-RNG-1 step never mutates its input state', () => {
    const s = createBattle('daxing-hill', 3)
    const before = JSON.stringify(s)
    for (const a of legalActions(s).slice(0, 60)) step(s, a)
    expect(JSON.stringify(s)).toBe(before)
  })
  it('R-RNG-1 the engine source uses no Math.random, Date, timers or DOM/React/three imports', () => {
    const dir = join(__dirname, '../../src/engine')
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const text = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '')
      expect(text, f).not.toMatch(/Math\.random|Date\.now|new Date|setTimeout|setInterval|requestAnimationFrame|document\.|window\.|from 'react|from 'three|@react-three/)
    }
  })
})

describe('golden battle (daxing hill, seed 29, 260 actions)', () => {
  const actions = golden.actions as Action[]
  it('R-RNG-1 replay(seed, actions) deep-equals the live state', () => {
    const live = playAll(golden.seed, actions)
    const rep = replay('daxing-hill', golden.seed, actions)
    expect(rep).toEqual(live)
  })
  it('R-RNG-1 the final snapshot is exactly the recorded one (regression guard)', () => {
    const s = replay('daxing-hill', golden.seed, actions)
    const e = golden.expect
    expect(s.round).toBe(e.round)
    expect(s.side).toBe(e.side)
    expect(Object.fromEntries(s.units.map((x) => [x.id, x.troops]))).toEqual(e.troops)
    expect(Object.fromEntries(s.units.map((x) => [x.id, x.side]))).toEqual(e.sides)
    expect(s.defeated).toEqual(e.defeated)
    expect(s.burn.filter((b) => b > 0).length).toBe(e.burning)
    expect(s.grid.tiles.filter((t) => t.terrain === 'ash').length).toBe(e.ash)
    expect(s.rng).toEqual(e.rng)
  })
  it('replay rejects a corrupt log instead of silently diverging', () => {
    expect(() => replay('daxing-hill', 1, [{ type: 'attack', unit: 'liu-bei', target: 'cheng-yuanzhi' }])).toThrow(/rejected/)
  })
})
