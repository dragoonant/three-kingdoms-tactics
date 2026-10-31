import { describe, expect, it } from 'vitest'
import { legalActions, query } from '../../src/engine'
import { act, endPhases, ev, reject, setBurn, strat, u } from './helpers'
import { mk2 } from './v2-helpers'

const row = (s: string) => s.padEnd(12, '.')
const mapOf = (rows: Record<number, string>): string[] => Array.from({ length: 12 }, (_, y) => row(rows[y] ?? ''))
const cost = (s: ReturnType<typeof mk2>, id: string, x: number, y: number) => query.moveRange(s, id).find((m) => m.x === x && m.y === y)?.cost

describe('R2-TERRAIN wall, rampart, gate, shallows, reeds, deck, water, bridge', () => {
  it('R2-TERRAIN-1 wall and water are impassable and a wall blocks the walk behind it', () => {
    const s = mk2({ map: mapOf({ 5: '....#ww..' }), units: [{ id: 'a', side: 'han', x: 3, y: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }] })
    expect(cost(s, 'a', 4, 5)).toBeUndefined()
    expect(cost(s, 'a', 5, 5)).toBeUndefined()
    expect(cost(s, 'a', 3, 4)).toBe(1)
  })

  it('R2-TERRAIN-1 a wall blocks the Charge dash', () => {
    const open = mk2({ units: [{ id: 'c', side: 'han', type: 'cavalry', x: 2, y: 5, strats: ['thundering-charge'], qi: 5 }, { id: 'e', side: 'cao', x: 5, y: 5, facing: 'W' }] })
    expect(query.stratagemTargets(open, 'c', 'thundering-charge')).toEqual([{ x: 5, y: 5 }])
    const walled = mk2({ map: mapOf({ 5: '...#' }), units: [{ id: 'c', side: 'han', type: 'cavalry', x: 2, y: 5, strats: ['thundering-charge'], qi: 5 }, { id: 'e', side: 'cao', x: 5, y: 5, facing: 'W' }] })
    expect(query.stratagemTargets(walled, 'c', 'thundering-charge')).toEqual([])
    reject(walled, strat('c', 'thundering-charge', 5, 5), 'dashBlocked')
  })

  it('R2-TERRAIN-2 rampart: infantry and archers cost 2, cavalry cannot enter, 0.75 cover, high ground', () => {
    const s = mk2({
      map: mapOf({ 5: '..r' }),
      units: [{ id: 'i', side: 'han', x: 1, y: 5 }, { id: 'c', side: 'han', type: 'cavalry', x: 1, y: 6 }, { id: 'k', side: 'han', type: 'archers', x: 1, y: 4 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
    })
    expect(cost(s, 'i', 2, 5)).toBe(2) // rampart 2
    expect(cost(s, 'i', 3, 5)).toBe(3)
    expect(cost(s, 'c', 2, 5)).toBeUndefined()
    expect(cost(s, 'k', 2, 5)).toBe(3)
    // cover and elevation in a real preview: an attacker next to a defender on the rampart
    const duel = mk2({ map: mapOf({ 5: '..r' }), units: [{ id: 'a', side: 'han', x: 1, y: 5 }, { id: 'd', side: 'cao', x: 2, y: 5, facing: 'W' }] })
    expect(query.attackPreview(duel, 'a', 'd')!.multipliers.map((m) => [m.id, m.value])).toEqual(expect.arrayContaining([['terrain', 0.75], ['height', 0.9]]))
  })

  it('R2-TERRAIN-2 archers on a rampart get +1 max range (as on a hill)', () => {
    const on = mk2({ map: mapOf({ 5: 'r' }), units: [{ id: 'k', side: 'han', type: 'archers', x: 0, y: 5 }, { id: 'e', side: 'cao', x: 4, y: 5 }] })
    expect(query.attackTargets(on, 'k')).toEqual(['e'])
    const off = mk2({ units: [{ id: 'k', side: 'han', type: 'archers', x: 0, y: 5 }, { id: 'e', side: 'cao', x: 4, y: 5 }] })
    expect(query.attackTargets(off, 'k')).toEqual([])
  })

  it('R2-TERRAIN-3 gate: only the owner side may enter; the other side cannot', () => {
    const theirs = mk2({ map: mapOf({ 5: '....G' }), gateOwner: 'cao', units: [{ id: 'a', side: 'han', x: 3, y: 5 }, { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W' }] })
    expect(query.moveRange(theirs, 'a').some((m) => m.x === 4 && m.y === 5)).toBe(false)
    const mine = mk2({ map: mapOf({ 5: '....G' }), gateOwner: 'han', units: [{ id: 'a', side: 'han', x: 3, y: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }] })
    expect(cost(mine, 'a', 4, 5)).toBe(1)
    expect(cost(mine, 'a', 5, 5)).toBe(2)
    // cover 0.85 on the gate tile
    const duel = mk2({ map: mapOf({ 5: '..G' }), gateOwner: 'cao', units: [{ id: 'a', side: 'han', x: 1, y: 5 }, { id: 'd', side: 'cao', x: 2, y: 5, facing: 'W' }] })
    expect(query.attackPreview(duel, 'a', 'd')!.multipliers.find((m) => m.id === 'terrain')!.value).toBe(0.85)
  })

  it('R2-TERRAIN-3 the proving ground gate stops han but not cao, until it is opened', () => {
    const s = mk2({ map: mapOf({ 5: '.G' }), gateOwner: 'cao', units: [{ id: 'a', side: 'han', x: 0, y: 5 }, { id: 'e', side: 'cao', x: 2, y: 5, facing: 'W' }] })
    const enemyPhase = act(s, { type: 'endPhase' }).state
    expect(legalActions(enemyPhase).some((a) => a.type === 'move' && a.unit === 'e' && a.x === 1 && a.y === 5)).toBe(true)
  })

  it('R2-TERRAIN-4 shallows cost 3/4/3, reeds 2/3/2, deck 1/2/1, bridge 1/1/1', () => {
    const at = (terrain: string, type: 'infantry' | 'cavalry' | 'archers') => {
      const s = mk2({ map: mapOf({ 5: `.${terrain}` }), units: [{ id: 'u', side: 'han', type, x: 0, y: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }] })
      return cost(s, 'u', 1, 5)
    }
    expect(['infantry', 'cavalry', 'archers'].map((t) => at('s', t as 'infantry'))).toEqual([3, 4, 3])
    expect(['infantry', 'cavalry', 'archers'].map((t) => at('e', t as 'infantry'))).toEqual([2, 3, 2])
    expect(['infantry', 'cavalry', 'archers'].map((t) => at('d', t as 'infantry'))).toEqual([1, 2, 1])
    expect(['infantry', 'cavalry', 'archers'].map((t) => at('b', t as 'infantry'))).toEqual([1, 1, 1])
    expect(['infantry', 'cavalry', 'archers'].map((t) => at('w', t as 'infantry'))).toEqual([undefined, undefined, undefined])
    expect(mk2({ units: [{ id: 'a', side: 'han', x: 1, y: 1 }] }).data.terrain.shallows.def).toBe(1.25)
  })

  it('R2-TERRAIN-4 reeds burn (flammability 1.0) and spread fire like farmland', () => {
    const s = mk2({ map: mapOf({ 5: '.eee' }), wind: [{ round: 1, dir: 'E', strength: 'gale' }], units: [{ id: 'k', side: 'han', type: 'archers', x: 0, y: 5, strats: ['fire-attack'], qi: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }] })
    let t = act(s, strat('k', 'fire-attack', 1, 5)).state
    expect(t.burn[5 * 12 + 1]).toBe(2)
    t = endPhases(t, 2)
    expect(t.burn[5 * 12 + 2]).toBeGreaterThan(0) // gale: certain downwind spread into reeds
  })

  it('R2-TERRAIN-5 a burnt-out deck sinks into water and pushes the unit standing on it', () => {
    let s = mk2({
      map: mapOf({ 5: 'dd' }), units: [{ id: 'a', side: 'han', x: 1, y: 5, troops: 2000 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
    })
    s = setBurn(s, 1, 5, 1)
    const r = act(endPhases(s, 1), { type: 'endPhase' })
    const k = r.events.map((e) => e.kind)
    expect(k).toContain('burnedOut')
    expect(ev(r.events, 'terrainChanged')).toEqual([{ kind: 'terrainChanged', tiles: [{ x: 1, y: 5 }], to: 'water', cause: 'burnout' }])
    expect(r.state.grid.tiles[5 * 12 + 1]!.terrain).toBe('water')
    expect(r.state.burn[5 * 12 + 1]).toBe(0)
    expect([u(r.state, 'a').x, u(r.state, 'a').y]).toEqual([1, 4]) // nearest free passable tile, row-major tie-break
    expect(ev(r.events, 'moved')).toHaveLength(1)
    // ordinary burnt tiles still become ash
    let p = mk2({ map: mapOf({ 5: 'f' }), units: [{ id: 'e', side: 'cao', x: 11, y: 11 }, { id: 'a', side: 'han', x: 2, y: 2 }] })
    p = setBurn(p, 0, 5, 1)
    expect(endPhases(p, 2).grid.tiles[5 * 12]!.terrain).toBe('ash')
  })

  it('R2-TERRAIN-6 a destroyed bridge (timeline) leaves water behind', () => {
    const s = mk2({
      map: mapOf({ 5: 'wbw' }), units: [{ id: 'a', side: 'han', x: 1, y: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
      timeline: [{ round: 1, phase: 'end', kind: 'terrain', tiles: [[1, 5]], to: 'water' }],
    })
    expect(cost(s, 'a', 1, 4)).toBe(1)
    const r = act(endPhases(s, 1), { type: 'endPhase' })
    expect(r.state.grid.tiles[5 * 12 + 1]!.terrain).toBe('water')
    expect(u(r.state, 'a').y).not.toBe(5)
  })
})
