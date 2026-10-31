import { describe, expect, it } from 'vitest'
import { createBattle, legalActions, query } from '../../src/engine'
import { act, endPhases, ev, kinds, legalOf, mk, patch, reject, setBurn, u } from './helpers'

const VILLAGE_MAP = ['............', '............', '............', '............', '............', '.....v......', '............', '............', '............', '............', '............', '............']

describe('R-TURN-1 rounds and phases', () => {
  it('R-TURN-1 each round every side gets one phase in side order; the round counter rises after the last', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 9, y: 9 }] })
    expect([s.round, s.side]).toEqual([1, 'han'])
    const p1 = act(s, { type: 'endPhase' })
    expect([p1.state.round, p1.state.side]).toEqual([1, 'yellow'])
    expect(ev(p1.events, 'phaseStarted')).toEqual([{ kind: 'phaseStarted', side: 'yellow', round: 1 }])
    const p2 = act(p1.state, { type: 'endPhase' })
    expect([p2.state.round, p2.state.side]).toEqual([2, 'han'])
    expect(kinds(p2.events)).toEqual(['roundStarted', 'phaseStarted'])
  })
  it('R-TURN-1 (daxing hill) the han player moves first', () => {
    const s = createBattle('daxing-hill', 1)
    expect(s.side).toBe('han')
    expect(s.sideOrder).toEqual(['han', 'yellow'])
    expect(legalActions(s).every((a) => a.type === 'endPhase' || s.units.find((x) => x.id === a.unit)!.side === 'han')).toBe(true)
  })
})

describe('R-TURN-2 start of phase', () => {
  it('R-TURN-2 Qi +2 for that side only, and village heals 5% of max troops', () => {
    let s = mk({ map: VILLAGE_MAP, units: [{ id: 'a', side: 'han', x: 5, y: 5, troops: 2000 }, { id: 'e', side: 'yellow', x: 9, y: 9, troops: 2000 }] })
    s = patch(s, 'a', { troops: 1500 })
    s = patch(s, 'e', { troops: 1500 })
    const t = act(act(s, { type: 'endPhase' }).state, { type: 'endPhase' })
    expect(u(t.state, 'a').troops).toBe(1600)
    expect(ev(t.events, 'healed')).toEqual([{ kind: 'healed', unit: 'a', amount: 100, source: 'village' }])
    expect(u(t.state, 'e').troops).toBe(1500) // not on a village
    expect(u(t.state, 'a').qi).toBe(2)
    // the heal never exceeds max troops
    const full = patch(s, 'a', { troops: 1950 })
    expect(u(act(act(full, { type: 'endPhase' }).state, { type: 'endPhase' }).state, 'a').troops).toBe(2000)
  })
  it('R-TURN-2 a unit confused earlier stays confused through its phase and recovers at its end', () => {
    let s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 5, y: 6 }], side: 'yellow' })
    s = patch(s, 'a', { confused: true }) // confused during the enemy phase
    const han = act(s, { type: 'endPhase' }).state // yellow ends; han phase begins
    expect(u(han, 'a').confused).toBe(true)
    reject(han, { type: 'attack', unit: 'a', target: 'e' }, 'unitConfused')
    reject(han, { type: 'move', unit: 'a', x: 4, y: 5 }, 'unitConfused')
    expect(legalOf(han, 'a')).toEqual([{ type: 'endPhase' }])
    const end = act(han, { type: 'endPhase' })
    expect(ev(end.events, 'recovered')).toEqual([{ kind: 'recovered', unit: 'a' }])
    expect(u(end.state, 'a').confused).toBe(false)
  })
})

describe('R-TURN-3 activation', () => {
  const base = () => mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 8, y: 5 }] })
  it('R-TURN-3 a unit moves then takes exactly one action, after which it is done', () => {
    let s = act(base(), { type: 'move', unit: 'a', x: 7, y: 5 }).state
    expect(query.attackTargets(s, 'a')).toEqual(['e'])
    s = act(s, { type: 'attack', unit: 'a', target: 'e' }).state
    expect(u(s, 'a').done).toBe(true)
    reject(s, { type: 'wait', unit: 'a', facing: 'N' }, 'unitDone')
    reject(s, { type: 'attack', unit: 'a', target: 'e' }, 'unitDone')
    expect(legalOf(s, 'a')).toEqual([{ type: 'endPhase' }])
  })
  it('R-TURN-3 a unit that has moved may still act (and cannot move twice)', () => {
    const s = act(base(), { type: 'move', unit: 'a', x: 6, y: 5 }).state
    reject(s, { type: 'move', unit: 'a', x: 5, y: 5 }, 'alreadyMoved')
    const acts = legalOf(s, 'a').filter((a) => a.type !== 'endPhase')
    expect(acts.some((a) => a.type === 'wait')).toBe(true)
    expect(acts.some((a) => a.type === 'move')).toBe(false)
    expect(acts.some((a) => a.type === 'undoMove')).toBe(true)
  })
  it('R-TURN-3 a unit may act without moving, and wait counts as its action', () => {
    const s = act(base(), { type: 'wait', unit: 'a', facing: 'N' }).state
    expect(u(s, 'a')).toMatchObject({ done: true, moved: false, facing: 'N' })
  })
  it('R-TURN-3 the other side cannot act during this phase', () => {
    reject(base(), { type: 'wait', unit: 'e', facing: 'N' }, 'notYourPhase')
  })
})

describe('R-TURN-4 undo', () => {
  const base = () => mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, facing: 'S' }, { id: 'e', side: 'yellow', x: 8, y: 5 }] })
  it('R-TURN-4 undoMove restores position and facing and allows moving again', () => {
    const m = act(base(), { type: 'move', unit: 'a', x: 6, y: 5 })
    const r = act(m.state, { type: 'undoMove', unit: 'a' })
    expect(u(r.state, 'a')).toMatchObject({ x: 5, y: 5, facing: 'S', moved: false, undo: null })
    expect(ev(r.events, 'moved')[0]).toMatchObject({ undo: true, to: { x: 5, y: 5 } })
    expect(act(r.state, { type: 'move', unit: 'a', x: 5, y: 7 }).state.units.find((x) => x.id === 'a')!.y).toBe(7)
  })
  it('R-TURN-4 undo is refused once the unit has acted, or if it has not moved', () => {
    reject(base(), { type: 'undoMove', unit: 'a' }, 'nothingToUndo')
    const acted = act(act(base(), { type: 'move', unit: 'a', x: 6, y: 5 }).state, { type: 'wait', unit: 'a', facing: 'E' }).state
    reject(acted, { type: 'undoMove', unit: 'a' }, 'unitDone')
    expect(legalActions(acted).some((a) => a.type === 'undoMove')).toBe(false)
  })
  it('R-TURN-4 undo is refused while another unit stands on the start tile', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'b', side: 'han', x: 4, y: 5 }, { id: 'e', side: 'yellow', x: 9, y: 9 }] })
    let t = act(s, { type: 'move', unit: 'a', x: 5, y: 6 }).state
    t = act(t, { type: 'move', unit: 'b', x: 5, y: 5 }).state
    reject(t, { type: 'undoMove', unit: 'a' }, 'startTileOccupied')
    expect(legalActions(t).some((a) => a.type === 'undoMove' && a.unit === 'a')).toBe(false)
  })
})

describe('R-TURN-5 facing', () => {
  it('R-TURN-5 a move leaves the unit facing its last step', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }] })
    expect(u(act(s, { type: 'move', unit: 'a', x: 3, y: 5 }).state, 'a').facing).toBe('W')
    expect(u(act(s, { type: 'move', unit: 'a', x: 5, y: 7 }).state, 'a').facing).toBe('S')
    expect(u(act(s, { type: 'move', unit: 'a', x: 5, y: 3 }).state, 'a').facing).toBe('N')
  })
  it('R-TURN-5 attack turns toward the target; a tie in |dx|,|dy| faces horizontally; wait takes an explicit facing', () => {
    const s = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, facing: 'N' }, { id: 'e', side: 'yellow', x: 6, y: 6 }] })
    expect(u(act(s, { type: 'attack', unit: 'k', target: 'e' }).state, 'k').facing).toBe('E')
    const v = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, facing: 'E' }, { id: 'e', side: 'yellow', x: 4, y: 7 }] })
    expect(u(act(v, { type: 'attack', unit: 'k', target: 'e' }).state, 'k').facing).toBe('S')
    const w = act(v, { type: 'wait', unit: 'k', facing: 'W' })
    expect(u(w.state, 'k').facing).toBe('W')
    expect(ev(w.events, 'waited')).toEqual([{ kind: 'waited', unit: 'k', facing: 'W' }])
    reject(v, { type: 'wait', unit: 'k', facing: 'X' as never }, 'badFacing')
  })
})

describe('R-TURN-6 ending the phase', () => {
  it('R-TURN-6 endPhase is always legal and leaves ready units idle', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 9, y: 9 }] })
    expect(legalActions(s).at(-1)).toEqual({ type: 'endPhase' })
    const r = act(s, { type: 'endPhase' })
    expect(u(r.state, 'a')).toMatchObject({ x: 5, y: 5, done: false })
    const done = act(s, { type: 'wait', unit: 'a', facing: 'E' }).state
    expect(legalOf(done, 'a')).toEqual([{ type: 'endPhase' }])
    const confused = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5, confused: true }] })
    expect(legalOf(confused, 'a')).toEqual([{ type: 'endPhase' }])
  })
})

describe('R-TURN-7 end of round', () => {
  it('R-TURN-7 order: fire, then wind, then the round counter', () => {
    let s = mk({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, troops: 2000 }, { id: 'e', side: 'yellow', x: 9, y: 9 }],
      wind: [{ round: 1, dir: 'E', strength: 'breeze' }, { round: 2, dir: null, strength: 'calm' }],
    })
    s = setBurn(s, 5, 5, 2)
    const t = act(act(s, { type: 'endPhase' }).state, { type: 'endPhase' })
    const k = kinds(t.events)
    const iFire = k.indexOf('damaged')
    const iRound = k.indexOf('roundStarted')
    const iWind = k.indexOf('windChanged')
    expect(iFire).toBeGreaterThanOrEqual(0)
    expect(iFire).toBeLessThan(iWind)
    expect(iWind).toBeGreaterThan(iRound - 1)
    expect(k.indexOf('phaseStarted')).toBeGreaterThan(iWind)
    expect(t.state.round).toBe(2)
    expect(t.state.wind).toEqual({ dir: null, strength: 'calm' })
    expect(ev(t.events, 'windChanged')[0]).toEqual({ kind: 'windChanged', dir: null, strength: 'calm', round: 2 })
  })
  it('R-TURN-7 the turn limit is checked after the round: the battle ends at the end of round N', () => {
    const s = mk({ turnLimit: 2, units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 9, y: 9 }] })
    const mid = endPhases(s, 3)
    expect(mid.result).toBeNull()
    expect(mid.round).toBe(2)
    const end = act(mid, { type: 'endPhase' })
    expect(end.state.result).toEqual({ winner: 'yellow', reason: 'timeout' })
    expect(ev(end.events, 'battleEnded')).toEqual([{ kind: 'battleEnded', winner: 'yellow', reason: 'timeout' }])
  })
  it('R-TURN-7 fire resolves before the limit check, so a burnt commander still loses at the limit', () => {
    let s = mk({ turnLimit: 1, units: [{ id: 'e', side: 'yellow', x: 9, y: 9, commander: true, troops: 10 }, { id: 'a', side: 'han', x: 5, y: 5 }] })
    s = setBurn(s, 9, 9, 2)
    const end = act(act(s, { type: 'endPhase' }).state, { type: 'endPhase' })
    expect(end.state.result).toEqual({ winner: 'han', reason: 'commander' })
  })
})
