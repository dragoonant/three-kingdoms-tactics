import { describe, expect, it } from 'vitest'
import { arcOf, query } from '../../src/engine'
import { act, ev, mk, reject, u, type TU } from './helpers'

/** han 'a' at (5,5) facing E attacks yellow 'd' at (6,5) facing W (a stands in d's front arc). */
function duel(a: Partial<TU> = {}, d: Partial<TU> = {}, extra: TU[] = []) {
  return mk({
    units: [
      { id: 'a', side: 'han', x: 5, y: 5, war: 100, troops: 1000, ...a },
      { id: 'd', side: 'yellow', x: 6, y: 5, facing: 'W', lead: 100, troops: 1000, ...d },
      ...extra,
    ],
  })
}

describe('R-UNIT', () => {
  it('R-UNIT-1 a unit reduced to 0 troops is routed and removed', () => {
    const s = duel({}, { troops: 30 })
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(r.state.units.find((x) => x.id === 'd')).toBeUndefined()
    expect(r.state.defeated).toEqual(['d'])
    expect(ev(r.events, 'routed')).toEqual([{ kind: 'routed', unit: 'd', side: 'yellow', by: 'a' }])
  })
  it('R-UNIT-2 war and leadership scale damage as (100+war)/(100+lead)', () => {
    const p1 = query.attackPreview(duel({ war: 100 }, { lead: 100 }), 'a', 'd')!
    expect(p1.multipliers.find((m) => m.id === 'stat')!.value).toBe(1)
    const p2 = query.attackPreview(duel({ war: 50 }, { lead: 25 }), 'a', 'd')!
    expect(p2.multipliers.find((m) => m.id === 'stat')!.value).toBeCloseTo(150 / 125, 10)
  })
  it('R-UNIT-3 matchups: infantry>cavalry, cavalry>archers, archers>infantry (x1.2), not the reverse', () => {
    const m = (at: TU['type'], dt: TU['type']) => {
      const dist = at === 'archers' ? 2 : 1
      const s = mk({ units: [{ id: 'a', side: 'han', type: at, x: 5, y: 5 }, { id: 'd', side: 'yellow', type: dt, x: 5 + dist, y: 5, facing: 'W' }] })
      return query.attackPreview(s, 'a', 'd')!.multipliers.find((x) => x.id === 'matchup')?.value
    }
    expect(m('infantry', 'cavalry')).toBe(1.2)
    expect(m('cavalry', 'archers')).toBe(1.2)
    expect(m('archers', 'infantry')).toBe(1.2)
    expect(m('cavalry', 'infantry')).toBeUndefined()
    expect(m('infantry', 'archers')).toBeUndefined()
    expect(m('archers', 'cavalry')).toBeUndefined()
  })
  it('R-UNIT-3 ranges: archers 2-3, cannot attack an adjacent tile; melee 1', () => {
    const s = mk({
      units: [
        { id: 'k', side: 'han', type: 'archers', x: 5, y: 5 },
        { id: 'e1', side: 'yellow', x: 6, y: 5 },
        { id: 'e2', side: 'yellow', x: 7, y: 5 },
        { id: 'e3', side: 'yellow', x: 5, y: 8 },
        { id: 'e4', side: 'yellow', x: 9, y: 5 },
      ],
    })
    expect(query.attackTargets(s, 'k').sort()).toEqual(['e2', 'e3'])
    reject(s, { type: 'attack', unit: 'k', target: 'e1' }, 'targetTooClose')
    reject(s, { type: 'attack', unit: 'k', target: 'e4' }, 'outOfRange')
    const inf = mk({ units: [{ id: 'i', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 7, y: 5 }] })
    reject(inf, { type: 'attack', unit: 'i', target: 'e' }, 'outOfRange')
    expect(query.attackTargets(inf, 'i')).toEqual([])
  })
  it('R-UNIT-4 Qi: +2 at the start of own phase (cap 10), +1 when damaged by a normal attack', () => {
    let s = duel({ qi: 0 }, { qi: 4 })
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(u(r.state, 'd').qi).toBe(5)
    s = duel({}, { qi: 10 })
    expect(u(act(s, { type: 'attack', unit: 'a', target: 'd' }).state, 'd').qi).toBe(10)
    // phase start
    const p = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, qi: 9 }, { id: 'b', side: 'han', x: 4, y: 4, qi: 1 }, { id: 'e', side: 'yellow', x: 9, y: 9, qi: 0 }] })
    const t1 = act(p, { type: 'endPhase' }).state // yellow phase: e gains
    expect(u(t1, 'e').qi).toBe(2)
    expect(u(t1, 'a').qi).toBe(9)
    const t2 = act(t1, { type: 'endPhase' }).state // han phase again
    expect(u(t2, 'a').qi).toBe(10)
    expect(u(t2, 'b').qi).toBe(3)
  })
  it('R-UNIT-4 the counterattacked attacker also gains 1 Qi', () => {
    const s = duel({ qi: 2 }, { troops: 3000 })
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(ev(r.events, 'countered')).toHaveLength(1)
    expect(u(r.state, 'a').qi).toBe(3)
  })
  it('R-UNIT-5 routing a commander ends the battle at once', () => {
    const s = duel({}, { troops: 20, commander: true })
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(r.state.result).toEqual({ winner: 'han', reason: 'commander' })
    expect(ev(r.events, 'battleEnded')).toEqual([{ kind: 'battleEnded', winner: 'han', reason: 'commander' }])
  })
})

describe('R-ATK-1 facing arc', () => {
  it('R-ATK-1 arcOf: front, side and rear by dot/cross; diagonals count as front/rear on a tie', () => {
    const d = { x: 5, y: 5, facing: 'E' as const }
    expect(arcOf(d, { x: 6, y: 5 })).toBe('front')
    expect(arcOf(d, { x: 7, y: 5 })).toBe('front')
    expect(arcOf(d, { x: 5, y: 4 })).toBe('side')
    expect(arcOf(d, { x: 5, y: 7 })).toBe('side')
    expect(arcOf(d, { x: 4, y: 5 })).toBe('rear')
    expect(arcOf(d, { x: 6, y: 6 })).toBe('front')
    expect(arcOf(d, { x: 4, y: 6 })).toBe('rear')
    expect(arcOf(d, { x: 6, y: 8 })).toBe('side')
  })
  it('R-ATK-1 multipliers: front x1.00, side x1.25, rear x1.50', () => {
    const arc = (facing: 'W' | 'N' | 'E') => {
      const p = query.attackPreview(duel({}, { facing }), 'a', 'd')!
      return [p.arc, p.multipliers.find((m) => m.id === 'arc')!.value]
    }
    expect(arc('W')).toEqual(['front', 1])
    expect(arc('N')).toEqual(['side', 1.25])
    expect(arc('E')).toEqual(['rear', 1.5])
  })
})

describe('R-ATK-2 damage formula', () => {
  it('R-ATK-2 base = 150 + troops*0.08, rounded to 10 after variance 0.9..1.1', () => {
    const p = query.attackPreview(duel(), 'a', 'd')!
    expect(p.base).toBe(230)
    expect(p.damage).toEqual({ min: 210, max: 250, expected: 230 })
  })
  it('R-ATK-2 side and rear arcs scale the range', () => {
    expect(query.attackPreview(duel({}, { facing: 'N' }), 'a', 'd')!.damage).toMatchObject({ min: 260, max: 320 })
    expect(query.attackPreview(duel({}, { facing: 'E' }), 'a', 'd')!.damage).toMatchObject({ min: 310, max: 380 })
  })
  it('R-ATK-2 damage is capped at the defender troops', () => {
    const p = query.attackPreview(duel({}, { troops: 100 }), 'a', 'd')!
    expect(p.damage.max).toBe(100)
    expect(p.routsAtMax).toBe(true)
    expect(p.routsAtMin).toBe(true)
    const big = query.attackPreview(duel({}, { troops: 240 }), 'a', 'd')!
    expect(big.damage).toMatchObject({ min: 210, max: 240 })
    expect(big.routsAtMin).toBe(false)
    expect(big.routsAtMax).toBe(true)
    const q = query.attackPreview(duel({}, { troops: 30 }), 'a', 'd')!
    expect(q.damage).toMatchObject({ min: 30, max: 30 })
    expect(q.routsAtMin).toBe(true)
  })
  it('R-ATK-2 every real roll is a multiple of 10 inside the previewed range', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 60; seed++) {
      const s2 = mk({ seed, units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'd', side: 'yellow', x: 6, y: 5, facing: 'W', lead: 100, troops: 5000 }] })
      const p = query.attackPreview(s2, 'a', 'd')!
      const r = act(s2, { type: 'attack', unit: 'a', target: 'd' })
      const dmg = ev(r.events, 'damaged').find((e) => e.source === 'attack')!.amount
      expect(dmg % 10).toBe(0)
      expect(dmg).toBeGreaterThanOrEqual(p.damage.min)
      expect(dmg).toBeLessThanOrEqual(p.damage.max)
      seen.add(dmg)
    }
    expect(seen.size).toBeGreaterThan(2) // variance really varies
  })
})

describe('R-ATK-3 counterattack', () => {
  it('R-ATK-3 a surviving melee defender strikes back for half damage with arc x1.00', () => {
    const s = duel({}, { troops: 3000 })
    const p = query.attackPreview(s, 'a', 'd')!
    expect(p.counter.possible).toBe(true)
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(r.events.map((e) => e.kind)).toEqual(['attacked', 'damaged', 'countered', 'damaged', 'turned'].filter((k) => r.events.some((e) => e.kind === k)))
    const c = ev(r.events, 'damaged').find((e) => e.source === 'counter')!
    expect(c.unit).toBe('a')
    expect(c.by).toBe('d')
    expect(c.amount).toBeGreaterThanOrEqual(p.counter.min)
    expect(c.amount).toBeLessThanOrEqual(p.counter.max)
  })
  it('R-ATK-3 counter numbers: remaining troops, x0.5, no arc multiplier', () => {
    const p = query.attackPreview(duel({}, { war: 100 }), 'a', 'd')!
    // defender troops after attack: 790 (at min) .. 750 (at max); (150+0.08*t) * stat(200/150) * 0.5
    expect(p.counter.multipliers.map((m) => m.id)).toEqual(['stat', 'counter'])
    expect(p.counter.multipliers.find((m) => m.id === 'counter')!.value).toBe(0.5)
    expect(p.counter.max).toBeGreaterThan(p.counter.min)
  })
  it('R-ATK-3 no counter against a rear attack', () => {
    const s = duel({}, { facing: 'E', troops: 3000 })
    expect(query.attackPreview(s, 'a', 'd')!.counter.possible).toBe(false)
    expect(ev(act(s, { type: 'attack', unit: 'a', target: 'd' }).events, 'countered')).toHaveLength(0)
  })
  it('R-ATK-3 a side attack is countered', () => {
    const s = duel({}, { facing: 'N', troops: 3000 })
    expect(ev(act(s, { type: 'attack', unit: 'a', target: 'd' }).events, 'countered')).toHaveLength(1)
  })
  it('R-ATK-3 archers do not counter and ranged attacks are never countered', () => {
    const s = duel({}, { type: 'archers', troops: 3000 })
    expect(ev(act(s, { type: 'attack', unit: 'a', target: 'd' }).events, 'countered')).toHaveLength(0)
    const r = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, war: 100 }, { id: 'd', side: 'yellow', x: 7, y: 5, facing: 'W', troops: 3000 }] })
    const res = act(r, { type: 'attack', unit: 'k', target: 'd' })
    expect(ev(res.events, 'countered')).toHaveLength(0)
    expect(ev(res.events, 'attacked')[0]!.ranged).toBe(true)
    expect(query.attackPreview(r, 'k', 'd')!.counter.possible).toBe(false)
  })
  it('R-ATK-3 a confused defender cannot counter', () => {
    const s = duel({}, { confused: true, troops: 3000 })
    expect(ev(act(s, { type: 'attack', unit: 'a', target: 'd' }).events, 'countered')).toHaveLength(0)
  })
  it('R-ATK-3 a routed defender does not counter; a counter can rout the attacker', () => {
    const s = duel({}, { troops: 40 })
    expect(ev(act(s, { type: 'attack', unit: 'a', target: 'd' }).events, 'countered')).toHaveLength(0)
    const weak = duel({ troops: 30 }, { troops: 3000, war: 100 })
    const r = act(weak, { type: 'attack', unit: 'a', target: 'd' })
    expect(r.state.units.find((x) => x.id === 'a')).toBeUndefined()
    expect(ev(r.events, 'routed').map((e) => e.unit)).toEqual(['a'])
  })
})

describe('R-ATK-4 defender turns to face the attacker', () => {
  it('R-ATK-4 a surviving melee defender faces the attacker after the counter', () => {
    const s = duel({}, { facing: 'N', troops: 3000 })
    const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
    expect(u(r.state, 'd').facing).toBe('W')
    expect(ev(r.events, 'turned').map((e) => e.unit)).toContain('d')
  })
  it('R-ATK-4 a confused defender does not turn; a ranged hit does not turn either', () => {
    const s = duel({}, { facing: 'N', confused: true, troops: 3000 })
    expect(u(act(s, { type: 'attack', unit: 'a', target: 'd' }).state, 'd').facing).toBe('N')
    const r = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5 }, { id: 'd', side: 'yellow', x: 7, y: 5, facing: 'N', troops: 3000 }] })
    expect(u(act(r, { type: 'attack', unit: 'k', target: 'd' }).state, 'd').facing).toBe('N')
  })
  it('R-ATK-4 the attacker turns toward its target (R-TURN-5)', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, facing: 'W' }, { id: 'd', side: 'yellow', x: 5, y: 6, facing: 'W' }] })
    expect(u(act(s, { type: 'attack', unit: 'a', target: 'd' }).state, 'a').facing).toBe('S')
  })
})

describe('R-ATK-5 preview', () => {
  it('R-ATK-5 preview shows min/max, counter range, arc and each multiplier, and matches the real result', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = mk({
        seed,
        units: [
          { id: 'a', side: 'han', x: 5, y: 5, war: 88, troops: 1800 },
          { id: 'd', side: 'yellow', x: 6, y: 5, facing: 'N', lead: 61, troops: 2400 },
        ],
      })
      const p = query.attackPreview(s, 'a', 'd')!
      expect(p.arc).toBe('side')
      expect(p.multipliers.map((m) => m.id)).toEqual(['stat', 'arc'])
      const r = act(s, { type: 'attack', unit: 'a', target: 'd' })
      const hit = ev(r.events, 'damaged').find((e) => e.source === 'attack')!.amount
      expect(hit).toBeGreaterThanOrEqual(p.damage.min)
      expect(hit).toBeLessThanOrEqual(p.damage.max)
      const c = ev(r.events, 'damaged').find((e) => e.source === 'counter')!.amount
      expect(c).toBeGreaterThanOrEqual(p.counter.min)
      expect(c).toBeLessThanOrEqual(p.counter.max)
    }
  })
  it('R-ATK-5 preview is null when the target cannot be attacked from here', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 1, y: 5 }, { id: 'd', side: 'yellow', x: 8, y: 5 }] })
    expect(query.attackPreview(s, 'a', 'd')).toBeNull()
    expect(query.attackPreview(s, 'a', 'nobody')).toBeNull()
  })
})

describe('attack rejections', () => {
  const s = duel()
  it('rejects attacking an ally, an unknown unit, the wrong phase, a done unit, a confused unit', () => {
    const t = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'b', side: 'han', x: 6, y: 5 }, { id: 'd', side: 'yellow', x: 5, y: 6 }] })
    reject(t, { type: 'attack', unit: 'a', target: 'b' }, 'targetNotEnemy')
    reject(t, { type: 'attack', unit: 'a', target: 'zzz' }, 'unknownTarget')
    reject(t, { type: 'attack', unit: 'zzz', target: 'd' }, 'unknownUnit')
    reject(t, { type: 'attack', unit: 'd', target: 'a' }, 'notYourPhase')
    const done = act(t, { type: 'attack', unit: 'a', target: 'd' }).state
    reject(done, { type: 'attack', unit: 'a', target: 'd' }, 'unitDone')
    const conf = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, confused: true }, { id: 'd', side: 'yellow', x: 5, y: 6 }] })
    reject(conf, { type: 'attack', unit: 'a', target: 'd' }, 'unitConfused')
    expect(s.result).toBeNull()
  })
})
