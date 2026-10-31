import { describe, expect, it } from 'vitest'
import { createBattle, legalActions, query, step } from '../../src/engine'
import { act, endPhases, ev, kinds, legalOf, mk, patch, reject, u, type TU } from './helpers'

/** Liu-like caster 'q' (cha 98) at (5,5) and a swayable yellow captain 't' (loyalty 40) at (7,5). */
function swayWorld(t: Partial<TU> = {}, q: Partial<TU> = {}, seed = 1) {
  return mk({
    seed,
    units: [
      { id: 'q', side: 'han', x: 5, y: 5, cha: 98, ...q },
      { id: 't', side: 'yellow', x: 7, y: 5, loyalty: 40, troops: 1000, facing: 'W', qi: 4, ...t },
    ],
  })
}
const sway = (s = swayWorld(), who = 'q', target = 't') => act(s, { type: 'sway', unit: who, target })
const pct = (s: ReturnType<typeof swayWorld>, who = 'q', target = 't') => query.swayChance(s, who, target)!.chance

describe('R-SWAY-1 who can be swayed', () => {
  it('R-SWAY-1 an enemy within 2 tiles with a Loyalty value that is not a commander', () => {
    expect(query.swayTargets(swayWorld(), 'q')).toEqual(['t'])
    expect(query.swayTargets(swayWorld({ x: 8 }), 'q')).toEqual([]) // 3 tiles
    expect(query.swayTargets(swayWorld({ x: 6 }), 'q')).toEqual(['t']) // adjacent is fine
    reject(swayWorld({ x: 8 }), { type: 'sway', unit: 'q', target: 't' }, 'outOfRange')
  })
  it('R-SWAY-1 a commander cannot be swayed', () => {
    const s = swayWorld({ commander: true })
    expect(query.swayTargets(s, 'q')).toEqual([])
    reject(s, { type: 'sway', unit: 'q', target: 't' }, 'commanderCannotBeSwayed')
    expect(query.swayChance(s, 'q', 't')).toMatchObject({ legal: false })
  })
  it('R-SWAY-1 an officer with null Loyalty cannot be swayed', () => {
    const s = swayWorld({ loyalty: null })
    expect(query.swayTargets(s, 'q')).toEqual([])
    reject(s, { type: 'sway', unit: 'q', target: 't' }, 'cannotBeSwayed')
  })
  it('R-SWAY-1 each officer may try each target once per battle', () => {
    // find a failing seed so the target is still an enemy afterwards
    let seed = 1
    let r = sway(swayWorld({ loyalty: 90 }, { cha: 10 }, seed))
    while (ev(r.events, 'swayed').length) r = sway(swayWorld({ loyalty: 90 }, { cha: 10 }, ++seed))
    expect(ev(r.events, 'swayFailed')).toHaveLength(1)
    const again = endPhases(r.state, 2)
    expect(query.swayTargets(again, 'q')).toEqual([])
    reject(again, { type: 'sway', unit: 'q', target: 't' }, 'swayAlreadyTried')
    expect(query.swayChance(again, 'q', 't')).toMatchObject({ legal: false, reason: expect.stringContaining('Already') })
    // a different officer may still try the same target
    const other = (sd: number) =>
      mk({
        seed: sd,
        units: [
          { id: 'q', side: 'han', x: 5, y: 5, cha: 10 },
          { id: 'q2', side: 'han', x: 6, y: 6, cha: 10 },
          { id: 't', side: 'yellow', x: 7, y: 5, loyalty: 90 },
        ],
      })
    let sd = 1
    let o1 = sway(other(sd))
    while (ev(o1.events, 'swayed').length) o1 = sway(other(++sd))
    expect(query.swayTargets(o1.state, 'q2')).toEqual(['t'])
    expect(query.swayTargets(o1.state, 'q')).toEqual([])
  })
  it('R-SWAY-1 sway is an action: the unit may move first, then it is done', () => {
    const s = swayWorld({ x: 9 })
    const moved = act(s, { type: 'move', unit: 'q', x: 7, y: 5 }).state
    const r = sway(moved)
    expect(u(r.state, 'q').done).toBe(true)
    reject(r.state, { type: 'wait', unit: 'q', facing: 'N' }, 'unitDone')
  })
})

describe('R-SWAY-2 chance', () => {
  it('R-SWAY-2 chance = cha - loyalty + 40 x (1 - troops/max) + 10 if confused, clamped 5..90', () => {
    expect(pct(swayWorld())).toBe(58) // 98 - 40
    const hurt = patch(swayWorld(), 't', { troops: 500, maxTroops: 1000 })
    expect(pct(hurt)).toBeCloseTo(78, 10)
    expect(pct(patch(hurt, 't', { confused: true }))).toBeCloseTo(88, 10)
    expect(pct(swayWorld({ loyalty: 0 }, { cha: 100 }))).toBe(90)
    expect(pct(swayWorld({ loyalty: 90 }, { cha: 10 }))).toBe(5)
    expect(pct(patch(swayWorld({ loyalty: 0 }, { cha: 100 }), 't', { troops: 10, maxTroops: 1000 }))).toBe(90)
  })
  it('R-SWAY-2 the realised success rate matches the chance', () => {
    let won = 0
    const N = 400
    for (let seed = 1; seed <= N; seed++) if (ev(sway(swayWorld({}, {}, seed)).events, 'swayed').length) won++
    expect(won / N).toBeGreaterThan(0.5)
    expect(won / N).toBeLessThan(0.66)
  })
})

describe('R-SWAY-3 success', () => {
  const winning = () => {
    for (let seed = 1; seed < 100; seed++) {
      const r = sway(swayWorld({ facing: 'S', qi: 4, troops: 800 }, {}, seed))
      if (ev(r.events, 'swayed').length) return { seed, r }
    }
    throw new Error('no winning seed')
  }
  it('R-SWAY-3 the target joins the caster side at once, done, keeping troops, Qi and facing', () => {
    const { r } = winning()
    expect(ev(r.events, 'swayed')).toEqual([{ kind: 'swayed', unit: 'q', target: 't', chance: 58, side: 'han' }])
    expect(u(r.state, 't')).toMatchObject({ side: 'han', done: true, troops: 800, qi: 4, facing: 'S' })
    expect(legalOf(r.state, 't')).toEqual([{ type: 'endPhase' }])
    reject(r.state, { type: 'wait', unit: 't', facing: 'N' }, 'unitDone')
  })
  it('R-SWAY-3 afterwards it fights for its new side', () => {
    const { r } = winning()
    let s = endPhases(r.state, 2) // yellow phase, then han phase again
    expect(legalOf(s, 't').some((a) => a.type === 'move')).toBe(true)
    s = act(s, { type: 'move', unit: 't', x: 6, y: 5 }).state
    expect(u(s, 't').side).toBe('han')
    expect(query.attackTargets(s, 't')).toEqual([]) // no enemies left except the far commander
  })
  it('R-SWAY-1 failure: swayFailed, the target stays put, and the caster is done', () => {
    let seed = 1
    let r = sway(swayWorld({ loyalty: 90 }, { cha: 10 }, seed))
    while (ev(r.events, 'swayed').length) r = sway(swayWorld({ loyalty: 90 }, { cha: 10 }, ++seed))
    expect(ev(r.events, 'swayFailed')).toEqual([{ kind: 'swayFailed', unit: 'q', target: 't', chance: 5 }])
    expect(u(r.state, 't').side).toBe('yellow')
    expect(u(r.state, 'q').done).toBe(true)
  })
})

describe('R-WIN-1 victory', () => {
  it('R-WIN-1 routing the enemy commander wins at once, even with enemy units left', () => {
    const s = mk({
      units: [
        { id: 'a', side: 'han', x: 5, y: 5, war: 100 },
        { id: 'c', side: 'yellow', x: 6, y: 5, commander: true, troops: 20 },
        { id: 'x', side: 'yellow', x: 9, y: 9 },
      ],
    })
    const r = act(s, { type: 'attack', unit: 'a', target: 'c' })
    expect(r.state.result).toEqual({ winner: 'han', reason: 'commander' })
    expect(r.state.units.some((x) => x.id === 'x')).toBe(true)
    expect(kinds(r.events).at(-1)).toBe('battleEnded')
  })
  it('R-WIN-1 routing an ordinary unit does not end the battle', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'x', side: 'yellow', x: 6, y: 5, troops: 20 }] })
    const r = act(s, { type: 'attack', unit: 'a', target: 'x' })
    expect(r.state.result).toBeNull()
  })
  it('R-WIN-1 losing your own commander (to a counter) loses the battle', () => {
    const s = mk({
      units: [
        { id: 'h', side: 'han', x: 5, y: 5, commander: true, troops: 30, war: 10 },
        { id: 'y', side: 'yellow', x: 6, y: 5, facing: 'W', war: 100, troops: 3000, lead: 100 },
      ],
    })
    const r = act(s, { type: 'attack', unit: 'h', target: 'y' })
    expect(r.state.result).toEqual({ winner: 'yellow', reason: 'commander' })
  })
  it('R-WIN-1 a side with no units left loses (annihilation)', () => {
    const base = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'x', side: 'yellow', x: 6, y: 5, troops: 20 }] })
    // remove the yellow commander from the roster, as an ex-commander-less side
    const s = { ...base, units: base.units.filter((x) => x.id !== 'yellow-cmd').map((x) => (x.id === 'x' ? { ...x, commander: false } : x)) }
    const r = step(s, { type: 'attack', unit: 'a', target: 'x' })
    expect(r.ok && r.state.result?.winner).toBe('han')
  })
  it('R-WIN-1 after the result every action is rejected and legalActions is empty', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'c', side: 'yellow', x: 6, y: 5, commander: true, troops: 20 }] })
    const done = act(s, { type: 'attack', unit: 'a', target: 'c' }).state
    reject(done, { type: 'endPhase' }, 'battleOver')
    reject(done, { type: 'wait', unit: 'a', facing: 'N' }, 'battleOver')
    expect(legalActions(done)).toEqual([])
  })
})

describe('R-WIN-2 turn limit', () => {
  it('R-WIN-2 (daxing hill) after round 15 without a winner the rebels (yellow) win', () => {
    let s = createBattle('daxing-hill', 4)
    let n = 0
    while (!s.result) {
      expect(s.round).toBeLessThanOrEqual(15)
      s = act(s, { type: 'endPhase' }).state
      n++
    }
    expect(n).toBe(30)
    expect(s.result).toEqual({ winner: 'yellow', reason: 'timeout' })
    expect(s.round).toBe(15)
  })
  it('R-WIN-2 a decisive win before the limit beats the timeout side', () => {
    const s = mk({ turnLimit: 3, units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'c', side: 'yellow', x: 6, y: 5, commander: true, troops: 20 }] })
    expect(act(s, { type: 'attack', unit: 'a', target: 'c' }).state.result).toEqual({ winner: 'han', reason: 'commander' })
  })
})
