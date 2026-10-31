import { describe, expect, it } from 'vitest'
import { legalActions, query, step } from '../../src/engine'
import { act, endPhases, ev, patch, reject, u } from './helpers'
import { mk2 } from './v2-helpers'

const dead = (id: string, x: number, y: number, extra = {}) => ({ id, side: 'cao', x, y, troops: 10, ...extra })

describe('R2-OBJ-1 objectives', () => {
  it('R2-OBJ-1 routCommander: win when the enemy commander is routed (and not before)', () => {
    let s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'boss', side: 'cao', x: 6, y: 5, facing: 'W', troops: 10, commander: true }, { id: 'minion', side: 'cao', x: 10, y: 10, troops: 500 }],
      objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }] },
    })
    expect(s.result).toBeNull()
    expect(query.objectives(s).find((o) => o.side === 'win')!.text).toContain('Rout the enemy commander')
    const r = act(s, { type: 'attack', unit: 'a', target: 'boss' })
    s = r.state
    expect(s.result).toEqual({ winner: 'han', reason: 'commander' })
    expect(ev(r.events, 'battleEnded')).toHaveLength(1)
    expect(legalActions(s)).toEqual([])
  })

  it('R2-OBJ-1 with objectives the enemy commander falling is not a win unless a win condition says so', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'boss', side: 'cao', x: 6, y: 5, facing: 'W', troops: 10, commander: true }],
      objectives: { win: [{ type: 'survive', round: 3 }], lose: [{ type: 'commanderLost' }] },
    })
    const r = act(s, { type: 'attack', unit: 'a', target: 'boss' })
    expect(r.state.result).toBeNull()
    expect(r.state.defeated).toEqual(['boss'])
  })

  it('R2-OBJ-1 routAll: no enemy units left on the board', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, dead('e1', 6, 5, { facing: 'W' }), { id: 'boss', side: 'cao', x: 11, y: 11, commander: true, troops: 10 }],
      objectives: { win: [{ type: 'routAll' }], lose: [{ type: 'commanderLost' }] },
    })
    const a = act(s, { type: 'attack', unit: 'a', target: 'e1' })
    expect(a.state.result).toBeNull() // the commander is still out there
    const t = patch(a.state, 'a', { done: false })
    expect(t.units.filter((x) => x.side === 'cao')).toHaveLength(1)
    expect(query.objectives(t)[0]!.text).toContain('1 remain')
  })

  it('R2-OBJ-1 routUnits: every listed enemy routed or retreated (a retreat counts)', () => {
    let s = mk2({
      units: [
        { id: 'a', side: 'han', x: 5, y: 5, war: 100 },
        { id: 'b', side: 'han', x: 5, y: 7, war: 100 },
        { id: 'e1', side: 'cao', x: 6, y: 5, facing: 'W', troops: 10 },
        { id: 'e2', side: 'cao', x: 6, y: 7, facing: 'W', troops: 3000, retreatAt: 0.99 },
      ],
      objectives: { win: [{ type: 'routUnits', units: ['e1', 'e2'] }], lose: [{ type: 'commanderLost' }] },
    })
    s = act(s, { type: 'attack', unit: 'a', target: 'e1' }).state
    expect(s.result).toBeNull()
    expect(query.objectives(s)[0]!.current).toBe(1)
    const r = act(s, { type: 'attack', unit: 'b', target: 'e2' })
    expect(ev(r.events, 'retreated')).toHaveLength(1)
    expect(r.state.result).toEqual({ winner: 'han', reason: 'objective' })
  })

  it('R2-OBJ-1 survive: the end of that round is reached; the HUD shows round progress', () => {
    let s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      objectives: { win: [{ type: 'survive', round: 2 }], lose: [{ type: 'commanderLost' }] },
      turnLimit: 5,
    })
    expect(query.objectives(s)[0]!.text).toBe('Survive: round 1 / 2')
    s = endPhases(s, 2) // end of round 1
    expect(s.result).toBeNull()
    expect(s.round).toBe(2)
    expect(query.objectives(s)[0]!.text).toBe('Survive: round 2 / 2')
    const r1 = step(s, { type: 'endPhase' })
    if (!r1.ok) throw new Error('rejected')
    const r2 = step(r1.state, { type: 'endPhase' })
    if (!r2.ok) throw new Error('rejected')
    expect(r2.state.result).toEqual({ winner: 'han', reason: 'objective' })
    expect(ev(r2.events, 'objectiveProgress').length).toBeGreaterThan(0)
  })

  it('R2-OBJ-1 hold (win): at the end of the round no enemy stands on the listed tiles', () => {
    const base = {
      objectives: { win: [{ type: 'hold' as const, tiles: [[3, 3]] as [number, number][], round: 2 }], lose: [{ type: 'commanderLost' as const }] },
      turnLimit: 6,
    }
    const quiet = mk2({ units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }], ...base })
    expect(endPhases(quiet, 4).result).toEqual({ winner: 'han', reason: 'objective' })
    const sat = mk2({ units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 3, y: 3 }], ...base })
    const after = endPhases(sat, 4)
    expect(after.result).toBeNull()
    expect(after.round).toBe(3)
  })

  it('R2-OBJ-1 hold (lose): an enemy standing on a listed tile at the end of an enemy phase loses the battle', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 3, y: 3, type: 'cavalry' }],
      objectives: { win: [{ type: 'survive', round: 5 }], lose: [{ type: 'hold', tiles: [[4, 3]] }] },
      turnLimit: 6,
    })
    const p = act(s, { type: 'endPhase' }).state // enemy phase
    expect(p.result).toBeNull()
    const moved = act(p, { type: 'move', unit: 'e', x: 4, y: 3 }).state
    expect(moved.result).toBeNull() // only checked when the enemy phase ends
    const done = act(moved, { type: 'endPhase' })
    expect(done.state.result).toEqual({ winner: 'cao', reason: 'objective' })
  })

  it('R2-OBJ-1 commanderLost and unitLost are lose conditions; lose is checked first', () => {
    const s = mk2({
      units: [
        { id: 'k', side: 'han', x: 5, y: 5, commander: true, troops: 10 },
        { id: 'tao', side: 'han', x: 8, y: 8, troops: 10 },
        { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', war: 100, commander: true, troops: 10 },
        { id: 'e2', side: 'cao', x: 8, y: 9, facing: 'N', war: 100, troops: 1000 },
      ],
      objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'unitLost', unit: 'tao' }] },
    })
    const p = act(s, { type: 'endPhase' }).state
    // tao falls first -> unitLost
    const t = act(p, { type: 'attack', unit: 'e2', target: 'tao' })
    expect(t.state.result).toEqual({ winner: 'cao', reason: 'objective' })
    // both commanders fall in one exchange: the counterstrike routs the attacker too -> lose is checked first
    const mutual = mk2({
      units: [
        { id: 'k', side: 'han', x: 5, y: 5, commander: true, troops: 10, facing: 'E', war: 100 },
        { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', commander: true, troops: 3000 },
      ],
      objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }] },
    })
    const m = act(mutual, { type: 'attack', unit: 'k', target: 'e' })
    expect(m.state.result?.winner).toBe('cao')
  })

  it('R2-OBJ-1 timeout: the end of that round passes -> lose', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'timeout', round: 2 }] },
      turnLimit: 9,
    })
    const end = endPhases(s, 4)
    expect(end.result).toEqual({ winner: 'cao', reason: 'timeout' })
  })

  it('R2-OBJ-1 with no lose list the default is commanderLost', () => {
    const s = mk2({
      units: [
        { id: 'k', side: 'han', x: 5, y: 5, commander: true, troops: 10 },
        { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', war: 100, troops: 3000 },
      ],
      objectives: { win: [{ type: 'survive', round: 5 }], lose: [] },
    })
    const p = act(s, { type: 'endPhase' }).state
    expect(act(p, { type: 'attack', unit: 'e', target: 'k' }).state.result?.winner).toBe('cao')
  })

  it('R2-OBJ-1 old rules still apply when a battle has no objectives (R-WIN-1)', () => {
    const s = mk2({ units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'boss', side: 'cao', x: 6, y: 5, facing: 'W', troops: 10, commander: true }] })
    expect(s.objectives).toBeNull()
    expect(act(s, { type: 'attack', unit: 'a', target: 'boss' }).state.result).toEqual({ winner: 'han', reason: 'commander' })
  })
})

describe('R2-OBJ-1 escape', () => {
  const base = () =>
    mk2({
      units: [
        { id: 'liu', side: 'han', x: 2, y: 1, commander: true },
        { id: 'b', side: 'han', x: 3, y: 1 },
        { id: 'c', side: 'han', x: 5, y: 5 },
        { id: 'e', side: 'cao', x: 10, y: 10 },
      ],
      objectives: { win: [{ type: 'escape', units: ['liu'], count: 2, tiles: [[2, 0], [3, 0]] }], lose: [{ type: 'commanderLost' }] },
    })

  it('R2-OBJ-1 only a unit standing on an exit tile may escape; legalActions offers it there', () => {
    const s = base()
    expect(legalActions(s).some((a) => a.type === 'escape')).toBe(false)
    reject(s, { type: 'escape', unit: 'liu' }, 'cannotEscape')
    const moved = act(s, { type: 'move', unit: 'liu', x: 2, y: 0 }).state
    expect(legalActions(moved).filter((a) => a.type === 'escape')).toEqual([{ type: 'escape', unit: 'liu' }])
    expect(query.canEscape(moved, 'liu')).toBe(true)
  })

  it('R2-OBJ-1 escaping removes the unit as escaped (not routed) and the objective counts escapes incl. every listed unit', () => {
    let s = base()
    s = act(s, { type: 'move', unit: 'b', x: 3, y: 0 }).state
    let r = act(s, { type: 'escape', unit: 'b' })
    s = r.state
    expect(ev(r.events, 'escaped')).toEqual([{ kind: 'escaped', unit: 'b', side: 'han', x: 3, y: 0 }])
    expect(s.units.find((x) => x.id === 'b')).toBeUndefined()
    expect(s.escaped).toEqual(['b'])
    expect(s.defeated).toEqual([])
    expect(s.result).toBeNull() // liu must escape too
    expect(query.objectives(s)[0]!.text).toContain('Escaped 1 / 2')
    s = act(s, { type: 'move', unit: 'liu', x: 2, y: 0 }).state
    r = act(s, { type: 'escape', unit: 'liu' })
    expect(r.state.result).toEqual({ winner: 'han', reason: 'objective' })
  })

  it('R2-OBJ-1 an enemy cannot escape', () => {
    const s = act(base(), { type: 'endPhase' }).state
    reject(s, { type: 'escape', unit: 'e' }, 'cannotEscape')
  })

  it('R2-OBJ-1 an escaped commander is not a lost commander', () => {
    let s = mk2({
      units: [{ id: 'liu', side: 'han', x: 2, y: 0, commander: true }, { id: 'c', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      objectives: { win: [{ type: 'escape', count: 2, tiles: [[2, 0]] }], lose: [{ type: 'commanderLost' }] },
    })
    s = act(s, { type: 'escape', unit: 'liu' }).state
    expect(s.result).toBeNull()
    expect(s.escaped).toEqual(['liu'])
  })
})

describe('R2-OBJ-2 retreat', () => {
  it('R2-OBJ-2 a unit with retreatAt leaves the board after the damage that took it to the fraction, and is not routed', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100, troops: 3000 }, { id: 'lubu', side: 'cao', x: 6, y: 5, facing: 'W', troops: 1800, lead: 0, retreatAt: 0.5, maxTroops: 3000 }],
      objectives: { win: [{ type: 'routUnits', units: ['lubu'] }], lose: [{ type: 'commanderLost' }] },
    })
    const r = act(s, { type: 'attack', unit: 'a', target: 'lubu' })
    const kinds = r.events.map((e) => e.kind)
    expect(kinds.indexOf('damaged')).toBeLessThan(kinds.indexOf('retreated'))
    expect(kinds).not.toContain('routed')
    expect(r.state.retreated).toEqual(['lubu'])
    expect(r.state.defeated).toEqual([])
    expect(r.state.units.find((x) => x.id === 'lubu')).toBeUndefined()
    expect(r.state.result).toEqual({ winner: 'han', reason: 'objective' })
  })

  it('R2-OBJ-2 above the threshold the unit stays; retreat after a counterattack too', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 60, troops: 1000, maxTroops: 2000, retreatAt: 0.5 }, { id: 'tank', side: 'cao', x: 6, y: 5, facing: 'W', troops: 5000, war: 100, lead: 0 }],
    })
    // 1000/2000 is already <= 0.5: the first damage taken (the counter) retreats the attacker
    const r = act(s, { type: 'attack', unit: 'a', target: 'tank' })
    expect(ev(r.events, 'retreated').map((e) => e.unit)).toEqual(['a'])
    expect(u(r.state, 'tank')).toBeDefined()
    expect(r.state.retreated).toEqual(['a'])
  })

  it('R2-OBJ-2 retreated counts as routed for routCommander', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 5, y: 5, war: 100 }, { id: 'boss', side: 'cao', x: 6, y: 5, facing: 'W', troops: 500, maxTroops: 1000, retreatAt: 0.9, commander: true, lead: 0 }],
      objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }] },
    })
    const r = act(s, { type: 'attack', unit: 'a', target: 'boss' })
    expect(r.state.result).toEqual({ winner: 'han', reason: 'commander' })
    expect(r.state.retreated).toEqual(['boss'])
  })
})
