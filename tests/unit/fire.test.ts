import { describe, expect, it } from 'vitest'
import { createBattle, query, windFactor } from '../../src/engine'
import { act, burnAt, endPhases, ev, kinds, mk, setBurn, strat, u, type MkOpts } from './helpers'

const FARM = Array.from({ length: 12 }, () => 'ffffffffffff')
const PLAIN = Array.from({ length: 12 }, () => '............')
const away = [{ id: 'far-a', side: 'han' as const, x: 1, y: 10 }, { id: 'far-e', side: 'yellow' as const, x: 10, y: 1 }]

const gale = (dir: 'E' | 'W' | 'N' | 'S') => [{ round: 1, dir, strength: 'gale' as const }]
const breeze = (dir: 'E' | 'W' | 'N' | 'S') => [{ round: 1, dir, strength: 'breeze' as const }]

describe('R-FIRE-1 burning tiles', () => {
  it('R-FIRE-1 a stratagem ignite sets burn = 2 on a flammable tile', () => {
    const s = mk({
      map: FARM,
      units: [{ id: 'j', side: 'han', type: 'archers', x: 2, y: 5, strats: ['fire-attack'], qi: 5 }, { id: 'e', side: 'yellow', x: 10, y: 1 }],
    })
    const r = act(s, strat('j', 'fire-attack', 4, 5))
    expect(burnAt(r.state, 4, 5)).toBe(2)
    expect(ev(r.events, 'ignited')).toEqual([{ kind: 'ignited', x: 4, y: 5, by: 'j', strat: 'fire-attack' }])
  })
  it('R-FIRE-1 only tiles with flammability > 0 can ignite (village, road, ford, river, ash cannot)', () => {
    const map = ['............', '............', '............', '............', '............', '..v=o~a.....', '............', '............', '............', '............', '............', '............']
    const s = mk({ map, units: [{ id: 'j', side: 'han', type: 'archers', x: 4, y: 4, strats: ['fire-attack'], qi: 5 }, { id: 'e', side: 'yellow', x: 10, y: 1 }] })
    const t = (x: number, y: number) => query.stratagemTargets(s, 'j', 'fire-attack').some((p) => p.x === x && p.y === y)
    expect(t(3, 3)).toBe(true) // plain
    expect(t(4, 6)).toBe(true)
    for (const [x, y] of [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5]] as [number, number][]) expect(t(x, y)).toBe(false)
  })
  it('R-FIRE-1 an enemy standing on a village is damaged but the village does not ignite', () => {
    const map = ['............', '............', '............', '............', '............', '....v.......', '............', '............', '............', '............', '............', '............']
    const s = mk({ map, units: [{ id: 'j', side: 'han', type: 'archers', x: 2, y: 5, strats: ['fire-attack'], qi: 5, int: 90 }, { id: 'e', side: 'yellow', x: 4, y: 5, int: 10 }] })
    const r = act(s, strat('j', 'fire-attack', 4, 5))
    expect(ev(r.events, 'damaged').length).toBeGreaterThan(0)
    expect(burnAt(r.state, 4, 5)).toBe(0)
    expect(ev(r.events, 'ignited')).toHaveLength(0)
  })
  it('R-FIRE-1 an already burning tile is not a legal ignite target', () => {
    const j = mk({ map: FARM, units: [{ id: 'j', side: 'han', type: 'archers', x: 2, y: 5, strats: ['fire-attack'], qi: 5 }, { id: 'e', side: 'yellow', x: 10, y: 1 }] })
    const lit = setBurn(j, 4, 5, 2)
    expect(query.stratagemTargets(lit, 'j', 'fire-attack').some((p) => p.x === 4 && p.y === 5)).toBe(false)
    expect(query.stratagemTargets(j, 'j', 'fire-attack').some((p) => p.x === 4 && p.y === 5)).toBe(true)
  })
})

describe('R-FIRE-2 end-of-round fire', () => {
  it('R-FIRE-2 order a (damage) b (spread) c (burn down); newly lit tiles neither hurt nor spread this step', () => {
    const w = mk({ map: FARM, wind: gale('E'), units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 2000 }, { id: 'w', side: 'han', x: 6, y: 5, troops: 2000 }, ...away] })
    const burning = setBurn(w, 5, 5, 2)
    const t = act(act(burning, { type: 'endPhase' }).state, { type: 'endPhase' })
    const k = kinds(t.events)
    expect(k.indexOf('damaged')).toBeLessThan(k.indexOf('fireSpread'))
    // v lost 10%, w (on the tile that ignites this step) lost nothing
    expect(u(t.state, 'v').troops).toBe(1800)
    expect(u(t.state, 'w').troops).toBe(2000)
    expect(burnAt(t.state, 5, 5)).toBe(1)
    expect(burnAt(t.state, 6, 5)).toBe(2) // downwind, gale x farm = certain
    expect(burnAt(t.state, 7, 5)).toBe(0) // newly lit tile did not spread in the same step
  })
  it('R-FIRE-2 a burning tile lasts two end-of-round steps and then becomes ash', () => {
    const s = setBurn(mk({ map: PLAIN, wind: gale('E'), units: away }), 5, 5, 2)
    const one = act(act(s, { type: 'endPhase' }).state, { type: 'endPhase' })
    expect(burnAt(one.state, 5, 5)).toBe(1)
    expect(ev(one.events, 'burnedOut')).toHaveLength(0)
    const two = act(act(one.state, { type: 'endPhase' }).state, { type: 'endPhase' })
    expect(burnAt(two.state, 5, 5)).toBe(0)
    expect(two.state.grid.tiles[5 * 12 + 5]!.terrain).toBe('ash')
    expect(ev(two.events, 'burnedOut')).toContainEqual({ kind: 'burnedOut', x: 5, y: 5 })
    expect(s.grid.tiles[5 * 12 + 5]!.terrain).toBe('plain') // input state untouched
  })
  it('R-FIRE-2 a unit on a burning tile loses 10% of max troops, forest x1.5, rounded to 10', () => {
    const plain = setBurn(mk({ map: PLAIN, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 1200 }, ...away] }), 5, 5, 2)
    const t = endPhases(plain, 2)
    expect(u(t, 'v').troops).toBe(1200 - 120)
    const forestMap = PLAIN.map((r, i) => (i === 5 ? '.....T......' : r))
    const forest = setBurn(mk({ map: forestMap, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 1200 }, ...away] }), 5, 5, 2)
    expect(u(endPhases(forest, 2), 'v').troops).toBe(1200 - 180)
    // a unit never drops below zero
    const frail = setBurn(mk({ map: PLAIN, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 1200 }, ...away] }), 5, 5, 2)
    const low = { ...frail, units: frail.units.map((x) => (x.id === 'v' ? { ...x, troops: 50 } : x)) }
    expect(endPhases(low, 2).units.find((x) => x.id === 'v')).toBeUndefined() // routed units are removed
  })
  it('R-FIRE-2 units standing in fire are confused with 50% chance (and fire can rout)', () => {
    let confused = 0
    const N = 200
    for (let seed = 1; seed <= N; seed++) {
      const s = setBurn(mk({ seed, map: PLAIN, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 2000 }, ...away] }), 5, 5, 2)
      const t = endPhases(s, 2)
      if (u(t, 'v').confused) confused++
    }
    expect(confused / N).toBeGreaterThan(0.38)
    expect(confused / N).toBeLessThan(0.62)
    const dead = setBurn(mk({ map: PLAIN, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 10 }, ...away] }), 5, 5, 2)
    const r = act(act(dead, { type: 'endPhase' }).state, { type: 'endPhase' })
    expect(ev(r.events, 'routed').map((e) => e.unit)).toEqual(['v'])
    expect(ev(r.events, 'confused')).toHaveLength(0)
  })
})

describe('R-FIRE-3 spread chance', () => {
  const spread = (wind: MkOpts['wind'], map = FARM) => {
    const s = setBurn(mk({ map, wind, units: away }), 5, 5, 2)
    const out: Record<string, number> = {}
    for (const f of query.fireForecast(s).spread) out[`${f.x},${f.y}`] = Math.round(f.chance * 1000) / 1000
    return out
  }
  it('R-FIRE-3 calm: 0.15 x flammability to each of 4 neighbours', () => {
    expect(spread([{ round: 1, dir: null, strength: 'calm' }])).toEqual({ '5,4': 0.15, '4,5': 0.15, '6,5': 0.15, '5,6': 0.15 })
    expect(spread([{ round: 1, dir: null, strength: 'calm' }], PLAIN)).toEqual({ '5,4': 0.075, '4,5': 0.075, '6,5': 0.075, '5,6': 0.075 })
  })
  it('R-FIRE-3 breeze: 0.60 to the downwind neighbour only', () => {
    expect(spread(breeze('E'))).toEqual({ '6,5': 0.6 })
    expect(spread(breeze('N'))).toEqual({ '5,4': 0.6 })
    expect(spread(breeze('E'), PLAIN)).toEqual({ '6,5': 0.3 })
  })
  it('R-FIRE-3 gale: 1.00 downwind and 0.30 to each perpendicular neighbour', () => {
    expect(spread(gale('E'))).toEqual({ '6,5': 1, '5,4': 0.3, '5,6': 0.3 })
    expect(spread(gale('W'))).toEqual({ '4,5': 1, '5,4': 0.3, '5,6': 0.3 })
    expect(spread(gale('S'))).toEqual({ '5,6': 1, '4,5': 0.3, '6,5': 0.3 })
  })
  it('R-FIRE-3 non-flammable and already burning neighbours are excluded; chances from two fires combine', () => {
    const map = FARM.map((r, i) => (i === 5 ? 'fffff=.fffff' : r))
    const s = setBurn(setBurn(mk({ map: FARM, wind: [{ round: 1, dir: null, strength: 'calm' }], units: away }), 5, 5, 2), 7, 5, 2)
    const f = query.fireForecast(s).spread.find((p) => p.x === 6 && p.y === 5)!
    expect(f.chance).toBeCloseTo(1 - 0.85 * 0.85, 10)
    // (5,5) is a road in this map: it can never be lit by the fire at (4,5)
    const road = setBurn(mk({ map, wind: [{ round: 1, dir: null, strength: 'calm' }], units: away }), 4, 5, 2)
    expect(query.fireForecast(road).spread.some((p) => p.x === 5 && p.y === 5)).toBe(false)
    const both = setBurn(setBurn(mk({ map: FARM, units: away }), 5, 5, 2), 6, 5, 2)
    expect(query.fireForecast(both).spread.some((p) => (p.x === 5 || p.x === 6) && p.y === 5)).toBe(false)
  })
  it('R-FIRE-3 windFactor table', () => {
    expect(windFactor({ dir: null, strength: 'calm' }, 'N')).toBe(0.15)
    expect(windFactor({ dir: 'E', strength: 'breeze' }, 'E')).toBe(0.6)
    expect(windFactor({ dir: 'E', strength: 'breeze' }, 'W')).toBe(0)
    expect(windFactor({ dir: 'E', strength: 'gale' }, 'W')).toBe(0)
    expect(windFactor({ dir: 'E', strength: 'gale' }, 'N')).toBe(0.3)
  })
  it('R-FIRE-3 the real spread frequency matches the forecast (breeze on plain = 0.30)', () => {
    let hit = 0
    const N = 400
    for (let seed = 1; seed <= N; seed++) {
      const s = setBurn(mk({ seed, map: PLAIN, wind: breeze('E'), units: away }), 5, 5, 2)
      const t = act(act(s, { type: 'endPhase' }).state, { type: 'endPhase' })
      if (burnAt(t.state, 6, 5) === 2) hit++
    }
    expect(hit / N).toBeGreaterThan(0.23)
    expect(hit / N).toBeLessThan(0.37)
  })
  it('R-FIRE-2 forecast lists the units that will be burnt now', () => {
    const s = setBurn(mk({ map: PLAIN, units: [{ id: 'v', side: 'han', x: 5, y: 5, troops: 1200 }, ...away] }), 5, 5, 2)
    expect(query.fireForecast(s).unitDamage).toEqual([{ unit: 'v', amount: 120, confuseChance: 0.5 }])
    expect(query.fireForecast(s).burning).toEqual([{ x: 5, y: 5, burn: 2 }])
  })
})

describe('R-WIND-1 wind schedule', () => {
  it('R-WIND-1 wind follows the schedule; the next change is open information', () => {
    const s = mk({ units: away, wind: [{ round: 1, dir: 'E', strength: 'breeze' }, { round: 3, dir: 'W', strength: 'gale' }] })
    expect(query.wind(s)).toEqual({ current: { dir: 'E', strength: 'breeze' }, next: { round: 3, dir: 'W', strength: 'gale' } })
    const r3 = endPhases(s, 4)
    expect(r3.round).toBe(3)
    expect(r3.wind).toEqual({ dir: 'W', strength: 'gale' })
    expect(query.wind(r3).next).toBeNull()
  })
  it('R-WIND-1 (daxing hill) E breeze, calm at round 6, W gale at 9, E breeze at 12', () => {
    let s = createBattle('daxing-hill', 5)
    expect(s.wind).toEqual({ dir: 'E', strength: 'breeze' })
    expect(query.wind(s).next).toEqual({ round: 6, dir: null, strength: 'calm' })
    const seen: [number, string, string | null][] = []
    while (s.round < 12) {
      const r = act(s, { type: 'endPhase' })
      for (const e of ev(r.events, 'windChanged')) seen.push([e.round, e.strength, e.dir])
      s = r.state
    }
    expect(seen).toEqual([[6, 'calm', null], [9, 'gale', 'W'], [12, 'breeze', 'E']])
  })
})

describe('fire in the real battle', () => {
  it('R-FIRE-2 (daxing hill) Jian Yong lights the millet, the east breeze carries it, and it burns down', () => {
    let s = createBattle('daxing-hill', 11)
    s = endPhases(s, 4) // round 3 for han: Qi 6
    expect(s.units.find((x) => x.id === 'jian-yong')!.qi).toBe(6)
    s = act(s, strat('jian-yong', 'fire-attack', 4, 7)).state
    expect(burnAt(s, 4, 7)).toBe(2)
    const f = query.fireForecast(s)
    expect(f.spread.find((p) => p.x === 5 && p.y === 7)?.chance).toBeCloseTo(0.6, 10)
    expect(f.spread.find((p) => p.x === 3 && p.y === 7)).toBeUndefined()
    const t = endPhases(s, 2)
    expect(burnAt(t, 4, 7)).toBe(1)
    const t2 = endPhases(t, 2)
    expect(t2.grid.tiles[7 * 14 + 4]!.terrain).toBe('ash')
  })
})
