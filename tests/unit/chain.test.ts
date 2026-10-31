import { describe, expect, it } from 'vitest'
import { query } from '../../src/engine'
import { act, ev, kinds, mk, patch, strat, u, type TU } from './helpers'

const pos = (x: number, y: number) => ({ x, y })

/**
 * Enemy 'e' at (6,5). a1 opens Arrow Rain (Volley) from (3,5).
 * b1 (5,5) Crescent Sweep, c1 (6,4) Serpent Thrust, d1 (6,6) and f1 (7,5) Twin Blades: all Strike followers.
 */
function chainWorld(over: Record<string, Partial<TU>> = {}, extra: TU[] = [], seed = 1) {
  const base: TU[] = [
    { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, strats: ['arrow-rain'], qi: 3 },
    { id: 'b1', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 4 },
    { id: 'c1', side: 'han', x: 6, y: 4, strats: ['serpent-thrust'], qi: 3 },
    { id: 'd1', side: 'han', x: 6, y: 6, strats: ['twin-blades'], qi: 3 },
    { id: 'f1', side: 'han', x: 7, y: 5, strats: ['twin-blades'], qi: 3 },
    { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000, lead: 50 },
  ]
  return mk({ seed, units: [...base.map((b) => ({ ...b, ...(over[b.id] ?? {}) })), ...extra] })
}
const open = (s = chainWorld(), ex: string[] = []) => act(s, strat('a1', 'arrow-rain', 6, 5, ex))
const links = (events: ReturnType<typeof open>['events']) => ev(events, 'chainLink')

describe('R-CHAIN-1 who can link', () => {
  it('R-CHAIN-1 after a hit the next allied unit with a following tag, Qi and range links without moving', () => {
    const r = open()
    // e faces W: f1 (east) strikes its rear (x1.5) and outranks the side attackers; c1 then beats d1 on power.
    expect(links(r.events).map((l) => [l.link, l.unit, l.strat, l.from])).toEqual([
      [1, 'b1', 'crescent-sweep', 'a1'],
      [2, 'f1', 'twin-blades', 'b1'],
      [3, 'c1', 'serpent-thrust', 'f1'],
    ])
    expect(u(r.state, 'b1').qi).toBe(0) // links spend Qi
    expect(u(r.state, 'a1').qi).toBe(0)
  })
  it('R-CHAIN-1 linking does not use the unit action: a ready unit can still act afterwards', () => {
    const r = open()
    expect(u(r.state, 'b1').done).toBe(false)
    expect(u(r.state, 'a1').done).toBe(true) // the opener used its action
    expect(act(r.state, { type: 'wait', unit: 'b1', facing: 'N' }).state.units.find((x) => x.id === 'b1')!.done).toBe(true)
  })
  it('R-CHAIN-1 done units can link too', () => {
    const s = patch(chainWorld(), 'b1', { done: true, moved: true })
    expect(links(open(s).events)[0]!.unit).toBe('b1')
    expect(u(open(s).state, 'b1').done).toBe(true)
  })
  it('R-CHAIN-1 a confused unit does not link', () => {
    const s = chainWorld({ b1: { confused: true } })
    expect(links(open(s).events).map((l) => l.unit)).not.toContain('b1')
    expect(links(open(s).events)).toHaveLength(0) // nobody else follows Volley
  })
  it('R-CHAIN-1 needs the Qi: a unit short of the cost does not link', () => {
    const s = chainWorld({ b1: { qi: 3 } })
    expect(links(open(s).events)).toHaveLength(0)
  })
  it('R-CHAIN-1 needs the tag: Twin Blades does not follow Volley', () => {
    const s = chainWorld({ b1: { strats: ['twin-blades'] } })
    expect(links(open(s).events)).toHaveLength(0)
  })
  it('R-CHAIN-1 needs a target in range from where it stands (no moving)', () => {
    const s = chainWorld({ b1: { x: 2, y: 8 } })
    expect(links(open(s).events)).toHaveLength(0)
    // an enemy that the previous link did not hit is no target either
    const w = chainWorld({ b1: { x: 9, y: 9 } }, [{ id: 'e2', side: 'yellow', x: 9, y: 8, troops: 9000 }])
    expect(links(open(w).events)).toHaveLength(0)
  })
  it('R-CHAIN-1 a routed target ends the chain (it must still be on the board)', () => {
    const s = chainWorld({ e: { troops: 20 } })
    const r = open(s)
    expect(ev(r.events, 'routed')).toHaveLength(1)
    expect(links(r.events)).toHaveLength(0)
  })
  it('R-CHAIN-1 the opener must hit an enemy: ignite on an empty tile never chains', () => {
    const s = mk({
      map: Array.from({ length: 12 }, () => 'ffffffffffff'),
      units: [
        { id: 'j', side: 'han', type: 'archers', x: 3, y: 5, strats: ['fire-attack'], qi: 5 },
        { id: 'k', side: 'han', type: 'archers', x: 3, y: 7, strats: ['arrow-rain'], qi: 5 },
        { id: 'e', side: 'yellow', x: 6, y: 6 },
      ],
    })
    const r = act(s, strat('j', 'fire-attack', 5, 5))
    expect(kinds(r.events)).toEqual(['stratagem', 'turned', 'ignited'].filter((k) => kinds(r.events).includes(k)))
    expect(links(r.events)).toHaveLength(0)
  })
})

describe('R-CHAIN-2 choosing the link', () => {
  const quiet = { c1: { strats: [] }, d1: { strats: [] }, f1: { strats: [] } } as Record<string, Partial<TU>>
  it('R-CHAIN-2 the candidate with the highest expected damage on its best target links', () => {
    // a stronger fighter beats a weaker one at the same arc
    const s = chainWorld({ ...quiet, c1: { strats: ['twin-blades'] }, d1: { strats: ['twin-blades'], war: 100 } })
    expect(links(open(s).events).map((l) => l.unit)).toEqual(['b1', 'd1', 'c1'])
    // the rear arc outranks a higher-power stratagem from the side (see the default chain)
    expect(links(open().events)[1]!.unit).toBe('f1')
  })
  it('R-CHAIN-2 ties go to the closest unit (to the previous link), then the lowest id', () => {
    const tieWorld = (units: TU[]) => chainWorld({ ...quiet, c1: { strats: [], x: 9, y: 9 }, d1: { strats: [], x: 9, y: 10 } }, units)
    // equal strength and equal distance from b1: the lowest id links first, even though it stands elsewhere in the list
    const ids = tieWorld([
      { id: 'x2', side: 'han', x: 6, y: 4, strats: ['twin-blades'], qi: 3 },
      { id: 'x1', side: 'han', x: 6, y: 6, strats: ['twin-blades'], qi: 3 },
    ])
    expect(links(open(ids).events).map((l) => l.unit)).toEqual(['b1', 'x1', 'x2'])
    // equal strength, different distance from b1 (5,5): the nearer one links even with a higher id
    const near = tieWorld([
      { id: 'a-far', side: 'han', x: 6, y: 3, strats: ['serpent-thrust'], qi: 3 },
      { id: 'z-near', side: 'han', x: 6, y: 4, strats: ['serpent-thrust'], qi: 3 },
    ])
    expect(links(open(near).events).map((l) => l.unit)).toEqual(['b1', 'z-near', 'a-far'])
  })
  it('R-CHAIN-2 a unit uses the first stratagem in its list that qualifies', () => {
    // b1 lists Crescent Sweep (cost 4) first, Twin Blades second: with Qi 3 only Twin Blades is affordable,
    // but Twin Blades does not follow Volley, so b1 cannot link at all.
    expect(links(open(chainWorld({ b1: { strats: ['crescent-sweep', 'twin-blades'], qi: 3 } })).events)).toHaveLength(0)
    // c1 lists Twin Blades before Serpent Thrust: both follow Strike; the first is used though the second hits harder
    const first = chainWorld({ ...quiet, c1: { strats: ['twin-blades', 'serpent-thrust'] } })
    expect(links(open(first).events)[1]!.strat).toBe('twin-blades')
    // when the first one does not qualify (no Qi) the next in the list is used
    const fallback = chainWorld({ ...quiet, c1: { strats: ['crescent-sweep', 'serpent-thrust'], qi: 3 } })
    expect(links(open(fallback).events)[1]!.strat).toBe('serpent-thrust')
  })
})

describe('R-CHAIN-3 length and scaling', () => {
  it('R-CHAIN-3 a chain has at most 4 links (the opener plus 3)', () => {
    const r = open()
    expect(links(r.events)).toHaveLength(3)
    expect(ev(r.events, 'stratagem')).toHaveLength(1)
    expect(u(r.state, 'd1').qi).toBe(3) // the fifth candidate was never used
  })
  it('R-CHAIN-3 link k deals x(1 + 0.2k)', () => {
    const r = open()
    expect(links(r.events).map((l) => l.multiplier)).toEqual([1.2, 1.4, 1.6].map((x) => expect.closeTo(x, 10)))
    const p = query.stratagemPreview(chainWorld(), 'a1', 'arrow-rain', pos(6, 5))!
    expect(p.chain.map((c) => c.multiplier)).toEqual([1, 1.2, 1.4, 1.6].map((x) => expect.closeTo(x, 10)))
    const dmg = ev(r.events, 'damaged').map((d) => [d.link, d.amount])
    expect(dmg.map((d) => d[0])).toEqual([0, 1, 2, 3])
  })
})

describe('R-CHAIN-4 bonds', () => {
  it('R-CHAIN-4 a bonded link gets x1.15 and flags bond', () => {
    const r = open(chainWorld({ b1: { bonds: ['a1'] } }))
    const l = links(r.events)[0]!
    expect(l.bond).toBe(true)
    expect(l.multiplier).toBeCloseTo(1.2 * 1.15, 10)
    expect(links(r.events)[1]!.bond).toBe(false)
    const plain = query.stratagemPreview(chainWorld(), 'a1', 'arrow-rain', pos(6, 5))!.chain[1]!.expected
    const bonded = query.stratagemPreview(chainWorld({ b1: { bonds: ['a1'] } }), 'a1', 'arrow-rain', pos(6, 5))!.chain[1]!.expected
    expect(bonded).toBeGreaterThan(plain)
  })
  it('R-CHAIN-4 a bond adds +1 max range for finding the target', () => {
    // c1 (Serpent Thrust, range 1-2) stands 3 tiles from e: too far without a bond, in range with one
    const strikeWorld = (bonds: string[]) =>
      mk({
        units: [
          { id: 'o', side: 'han', x: 5, y: 5, strats: ['twin-blades'], qi: 3 },
          { id: 'c1', side: 'han', x: 6, y: 8, strats: ['serpent-thrust'], qi: 3, bonds },
          { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000 },
        ],
      })
    expect(links(act(strikeWorld([]), strat('o', 'twin-blades', 6, 5)).events)).toHaveLength(0)
    const r = act(strikeWorld(['o']), strat('o', 'twin-blades', 6, 5))
    expect(links(r.events).map((l) => [l.unit, l.bond])).toEqual([['c1', true]])
  })
})

describe('R-CHAIN-5 exclusion and preview', () => {
  it('R-CHAIN-5 excludeFromChain keeps units out of the chain', () => {
    const r = open(chainWorld(), ['b1'])
    expect(links(r.events)).toHaveLength(0)
    const r2 = open(chainWorld(), ['c1'])
    expect(links(r2.events).map((l) => l.unit)).toEqual(['b1', 'f1', 'd1'])
  })
  it('R-CHAIN-5 the preview plans the chain and matches the real chain when everything hits', () => {
    const s = chainWorld()
    const p = query.stratagemPreview(s, 'a1', 'arrow-rain', pos(6, 5))!
    const real = open(s)
    expect(p.chain.map((c) => [c.link, c.unit, c.strat])).toEqual([[0, 'a1', 'arrow-rain'], ...links(real.events).map((l) => [l.link, l.unit, l.strat])])
    expect(p.chain.map((c) => c.target)).toEqual(p.chain.map(() => pos(6, 5)))
    const realDamage = ev(real.events, 'damaged').filter((d) => d.unit === 'e')
    for (let i = 0; i < realDamage.length; i++) {
      // each real hit lies within +-10% (+ rounding) of the planned expectation
      expect(Math.abs(realDamage[i]!.amount - p.chain[i]!.expected)).toBeLessThanOrEqual(p.chain[i]!.expected * 0.1 + 10)
    }
    expect(p.totalExpected).toBe(p.chain.reduce((n, c) => n + c.expected, 0))
    const ex = query.stratagemPreview(s, 'a1', 'arrow-rain', pos(6, 5), ['b1'])!
    expect(ex.chain).toHaveLength(1)
  })
  it('R-CHAIN-5 the real chain is recomputed link by link: a target routed mid-chain ends it', () => {
    // 680 troops: the planned chain assumes expected rolls, real rolls rout the target earlier or later
    const lengths = new Map<number, number>()
    for (let seed = 1; seed <= 60; seed++) {
      const r = open(chainWorld({ e: { troops: 680 } }, [], seed))
      const n = 1 + links(r.events).length
      lengths.set(n, (lengths.get(n) ?? 0) + 1)
      if (ev(r.events, 'routed').length) expect(ev(r.events, 'battleEnded')).toHaveLength(0)
      // nothing is dealt after the routing blow
      const idx = kinds(r.events).indexOf('routed')
      if (idx >= 0) expect(kinds(r.events).slice(idx + 1).filter((k) => k === 'damaged')).toHaveLength(0)
    }
    expect(lengths.size).toBeGreaterThanOrEqual(2)
    expect(Math.max(...lengths.keys())).toBeLessThanOrEqual(4)
  })
})

describe('R-CHAIN-6 Command stratagems', () => {
  it('R-CHAIN-6 Rally heals allies, never opens a chain and never links', () => {
    const s = mk({
      units: [
        { id: 'r', side: 'han', x: 5, y: 5, strats: ['rally'], qi: 10, troops: 2000 },
        { id: 'w', side: 'han', x: 5, y: 7, troops: 2000 },
        { id: 'far', side: 'han', x: 5, y: 9, troops: 2000 },
        { id: 'e', side: 'yellow', x: 9, y: 5 },
      ],
    })
    const hurt = patch(patch(patch(s, 'r', { troops: 1000 }), 'w', { troops: 1000 }), 'far', { troops: 1000 })
    expect(query.stratagemTargets(hurt, 'r', 'rally')).toEqual([pos(5, 5)])
    const pv = query.stratagemPreview(hurt, 'r', 'rally', pos(5, 5))!
    expect(pv.heals).toEqual([{ unit: 'r', amount: 300 }, { unit: 'w', amount: 300 }])
    expect(pv.chain).toEqual([])
    const r = act(hurt, strat('r', 'rally', 5, 5))
    expect(u(r.state, 'r').troops).toBe(1300)
    expect(u(r.state, 'w').troops).toBe(1300)
    expect(u(r.state, 'far').troops).toBe(1000) // outside range 2
    expect(ev(r.events, 'healed').map((h) => h.source)).toEqual(['rally', 'rally'])
    expect(links(r.events)).toHaveLength(0)
    // not usable with nobody hurt
    expect(query.stratagemTargets(s, 'r', 'rally')).toEqual([])
  })
  it('R-CHAIN-6 a unit holding only Rally is never picked as a link', () => {
    const s = chainWorld({ b1: { strats: ['rally'], qi: 10 }, c1: { strats: [] }, d1: { strats: [] }, f1: { strats: [] } })
    expect(links(open(s).events)).toHaveLength(0)
  })
})

describe('chains with Charge dashes', () => {
  it('R-CHAIN-1 a Charge link dashes into place from a straight line and strikes', () => {
    const s = mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 3 },
        { id: 'g', side: 'han', type: 'cavalry', x: 8, y: 8, strats: ['thundering-charge'], qi: 5 },
        { id: 'e', side: 'yellow', x: 8, y: 5, facing: 'W', troops: 9000 },
      ],
    })
    const r = act(s, strat('a1', 'arrow-rain', 8, 5))
    expect(links(r.events).map((l) => [l.unit, l.strat])).toEqual([['g', 'thundering-charge']])
    expect(u(r.state, 'g')).toMatchObject({ x: 8, y: 6, facing: 'N' })
    expect(ev(r.events, 'moved')[0]).toMatchObject({ unit: 'g', dash: true })
  })
})
