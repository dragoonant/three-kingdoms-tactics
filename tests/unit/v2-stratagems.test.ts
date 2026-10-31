import { describe, expect, it } from 'vitest'
import type { StratagemDef } from '../../src/data/types'
import { legalActions, query, step } from '../../src/engine'
import { act, endPhases, ev, reject, strat, u } from './helpers'
import { mk2 } from './v2-helpers'

describe('R2-AREA ring2 and multi-tile ignite', () => {
  it('R2-AREA-1 ring2 is every tile within Manhattan distance 1..2 of the caster', () => {
    const s = mk2({ units: [{ id: 'c', side: 'han', x: 5, y: 5, strats: ['bridge-roar'], qi: 5, war: 100 }, { id: 'e', side: 'cao', x: 7, y: 5, facing: 'W' }] })
    const pv = query.stratagemPreview(s, 'c', 'bridge-roar', { x: 5, y: 5 })!
    expect(pv.tiles).toHaveLength(12)
    expect(pv.tiles.every((t) => { const d = Math.abs(t.x - 5) + Math.abs(t.y - 5); return d >= 1 && d <= 2 })).toBe(true)
    expect(pv.targets.map((t) => t.unit)).toEqual(['e'])
    expect(pv.targets[0]!.provokes).toBe(true)
    // a foe at distance 3 is out of the ring
    const far = mk2({ units: [{ id: 'c', side: 'han', x: 5, y: 5, strats: ['bridge-roar'], qi: 5 }, { id: 'e', side: 'cao', x: 8, y: 5 }] })
    expect(query.stratagemTargets(far, 'c', 'bridge-roar')).toEqual([])
  })

  it('R2-AREA-1 ring2 hits every foe in the ring, including diagonals, and spares allies', () => {
    const s = mk2({
      units: [
        { id: 'c', side: 'han', x: 5, y: 5, strats: ['bridge-roar'], qi: 5, war: 100 },
        { id: 'e1', side: 'cao', x: 6, y: 6 }, { id: 'e2', side: 'cao', x: 3, y: 5 }, { id: 'e3', side: 'cao', x: 5, y: 8 },
        { id: 'ally', side: 'han', x: 5, y: 4, troops: 500 },
      ],
    })
    const r = act(s, strat('c', 'bridge-roar', 5, 5))
    expect(ev(r.events, 'damaged').map((d) => d.unit).sort()).toEqual(['e1', 'e2'])
    expect(u(r.state, 'ally').troops).toBe(500)
  })

  it('R2-AREA-2 an ignite effect on a multi-tile area ignites every flammable tile in it, not only the anchor', () => {
    const s = mk2({
      map: ['............', '............', '............', '............', '............', '..ff........', '.ff=f.......', '..ff........', ...Array(4).fill('............')],
      units: [{ id: 'c', side: 'han', type: 'archers', x: 3, y: 3, strats: ['valley-blaze'], qi: 6, int: 100 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
    })
    // anchor (3,6) is road (not flammable) but the cross around it holds farm: still castable
    expect(query.stratagemTargets(s, 'c', 'valley-blaze').some((a) => a.x === 3 && a.y === 6)).toBe(true)
    const r = act(s, strat('c', 'valley-blaze', 3, 6))
    const lit = ev(r.events, 'ignited').map((e) => [e.x, e.y])
    expect(lit).toEqual([[3, 5], [4, 6], [3, 7], [2, 6]]) // area order: anchor (road, skipped), N, E, S, W
    for (const [x, y] of lit) expect(r.state.burn[y! * 12 + x!]).toBe(2)
    expect(r.state.burn[6 * 12 + 3]).toBe(0)
    expect(query.stratagemPreview(s, 'c', 'valley-blaze', { x: 3, y: 6 })!.igniteTiles).toHaveLength(4)
  })

  it('R2-AREA-2 a single-tile ignite still lights only the anchor', () => {
    const s = mk2({
      map: ['............', '............', '............', '............', '............', '..ff........', ...Array(6).fill('............')],
      units: [{ id: 'c', side: 'han', type: 'archers', x: 2, y: 3, strats: ['fire-attack'], qi: 5 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
    })
    const r = act(s, strat('c', 'fire-attack', 2, 5))
    expect(ev(r.events, 'ignited')).toHaveLength(1)
  })
})

describe('R2-STRAT-1 wind', () => {
  const caster = (extra = {}) =>
    mk2({
      wind: [{ round: 1, dir: 'N', strength: 'breeze' }],
      turnLimit: 10,
      units: [{ id: 'z', side: 'han', type: 'archers', x: 5, y: 5, strats: ['borrow-the-wind'], qi: 6 }, { id: 'e', side: 'cao', x: 11, y: 11 }],
      ...extra,
    })

  it('R2-STRAT-1 casting turns the wind (windChanged by the caster) and costs Qi', () => {
    let s = caster()
    const anchors = query.stratagemTargets(s, 'z', 'borrow-the-wind')
    expect(anchors.map((a) => `${a.x},${a.y}`).sort()).toEqual(['4,5', '5,4', '5,6', '6,5'])
    const pv = query.stratagemPreview(s, 'z', 'borrow-the-wind', { x: 4, y: 5 })!
    expect(pv.wind).toEqual({ dir: 'W', strength: 'gale', rounds: 3 })
    const r = act(s, strat('z', 'borrow-the-wind', 4, 5))
    s = r.state
    expect(ev(r.events, 'windChanged')).toEqual([{ kind: 'windChanged', dir: 'W', strength: 'gale', round: 1, by: 'z', strat: 'borrow-the-wind', rounds: 3 }])
    expect(s.wind).toEqual({ dir: 'W', strength: 'gale' })
    expect(u(s, 'z').qi).toBe(0)
    expect(u(s, 'z').done).toBe(true)
  })

  it('R2-STRAT-1 the override lasts rounds r..r+N-1 and the schedule resumes at round r+N', () => {
    let s = caster({ wind: [{ round: 1, dir: 'N', strength: 'breeze' }, { round: 3, dir: 'S', strength: 'gale' }] })
    s = act(s, strat('z', 'borrow-the-wind', 6, 5)).state // E gale for rounds 1..3
    const seen: string[] = []
    for (let i = 0; i < 4; i++) {
      seen.push(`${s.round}:${s.wind.dir}${s.wind.strength}`)
      s = endPhases(s, 2)
    }
    seen.push(`${s.round}:${s.wind.dir}${s.wind.strength}`)
    expect(seen).toEqual(['1:Egale', '2:Egale', '3:Egale', '4:Sgale', '5:Sgale'])
  })

  it('R2-STRAT-1 a wind that would not change anything is not castable; a fixed-direction wind is anchored on the caster', () => {
    const s = caster({ wind: [{ round: 1, dir: 'E', strength: 'gale' }] })
    expect(query.stratagemTargets(s, 'z', 'borrow-the-wind').map((a) => `${a.x},${a.y}`).sort()).toEqual(['4,5', '5,4', '5,6']) // E gale already
    const fixed: StratagemDef = { id: 'steady-west', name: 'Steady West', tag: 'Command', cost: 2, range: { min: 0, max: 0 }, area: 'self', power: 0, stat: null, effect: { type: 'wind', dir: 'W', strength: 'breeze', rounds: 2 }, follows: [], text: 't' }
    const f = mk2({ stratagems: [fixed], units: [{ id: 'z', side: 'han', x: 5, y: 5, strats: ['steady-west'], qi: 2 }, { id: 'e', side: 'cao', x: 11, y: 11 }] })
    expect(query.stratagemTargets(f, 'z', 'steady-west')).toEqual([{ x: 5, y: 5 }])
    expect(act(f, strat('z', 'steady-west', 5, 5)).state.wind).toEqual({ dir: 'W', strength: 'breeze' })
  })

  it('R2-STRAT-1 the new wind drives the very next fire step', () => {
    let s = mk2({
      map: ['............', '............', '............', '............', '............', '.fffff......', ...Array(6).fill('............')],
      wind: [{ round: 1, dir: 'W', strength: 'gale' }],
      units: [
        { id: 'z', side: 'han', type: 'archers', x: 1, y: 3, strats: ['borrow-the-wind', 'fire-attack'], qi: 6 },
        { id: 'y', side: 'han', type: 'archers', x: 2, y: 3, strats: ['fire-attack'], qi: 5 },
        { id: 'e', side: 'cao', x: 11, y: 11 },
      ],
    })
    s = act(s, strat('y', 'fire-attack', 2, 5)).state // fire on (2,5); gale blows west
    s = act(s, strat('z', 'borrow-the-wind', 2, 3)).state // z turns it east
    const end = endPhases(s, 2)
    expect(end.burn[5 * 12 + 3]).toBeGreaterThan(0) // east neighbour caught
  })
})

describe('R2-STRAT-2 buff', () => {
  const mkBuff = () =>
    mk2({
      units: [
        { id: 'liu', side: 'han', x: 5, y: 5, commander: true, strats: ['benevolent-banner'], qi: 4 },
        { id: 'near', side: 'han', x: 6, y: 6, lead: 50 },
        { id: 'far', side: 'han', x: 1, y: 1, lead: 50 },
        { id: 'foe', side: 'cao', x: 7, y: 6, facing: 'W', war: 80 },
      ],
      turnLimit: 10,
    })

  it('R2-STRAT-2 buffs every ally in the aura (self included), shows as a status, and changes the numbers query.* reports', () => {
    let s = mkBuff()
    const before = query.attackPreview(act(s, { type: 'endPhase' }).state, 'foe', 'near')!.damage.expected
    const r = act(s, strat('liu', 'benevolent-banner', 5, 5))
    s = r.state
    expect(ev(r.events, 'buffed').map((e) => [e.unit, e.stat, e.amount, e.until])).toEqual([['liu', 'lead', 10, 3], ['near', 'lead', 10, 3]])
    expect(u(s, 'near').buffs).toEqual([{ id: 'benevolent-banner', stat: 'lead', amount: 10, until: 3, by: 'liu' }])
    expect(u(s, 'far').buffs).toBeUndefined()
    const after = query.attackPreview(act(s, { type: 'endPhase' }).state, 'foe', 'near')!.damage.expected
    expect(after).toBeLessThan(before)
    expect(query.stratagemPreview(mkBuff(), 'liu', 'benevolent-banner', { x: 5, y: 5 })!.buffs).toEqual([{ unit: 'liu', stat: 'lead', amount: 10, rounds: 2 }, { unit: 'near', stat: 'lead', amount: 10, rounds: 2 }])
  })

  it('R2-STRAT-2 expires at the end of the owner\'s phase after N rounds, with a buffExpired event', () => {
    let s = act(mkBuff(), strat('liu', 'benevolent-banner', 5, 5)).state // round 1, until 3
    s = endPhases(s, 1) // end of han phase r1
    expect(u(s, 'near').buffs).toBeDefined()
    s = endPhases(s, 2) // enemy r1 -> han r2 start; end han r2
    expect(u(s, 'near').buffs).toBeDefined()
    s = endPhases(s, 1) // enemy r2 -> han r3
    expect(s.round).toBe(3)
    expect(u(s, 'near').buffs).toBeDefined() // still active during han's phase of round 3
    const r = act(s, { type: 'endPhase' }) // end of han's phase in round 3
    expect(ev(r.events, 'buffExpired').map((e) => [e.unit, e.strat])).toEqual([['liu', 'benevolent-banner'], ['near', 'benevolent-banner']])
    expect(u(r.state, 'near').buffs).toBeUndefined()
  })

  it('R2-STRAT-2 cannot be cast again while everyone in the aura already has it', () => {
    const s = act(mkBuff(), strat('liu', 'benevolent-banner', 5, 5)).state
    const next = endPhases(s, 2)
    expect(query.stratagemTargets({ ...next, units: next.units.map((x) => (x.id === 'liu' ? { ...x, qi: 9 } : x)) }, 'liu', 'benevolent-banner')).toEqual([])
  })
})

describe('R2-STRAT-3 provoke', () => {
  const goad: StratagemDef = { id: 'goad', name: 'Goad', tag: 'Shout', cost: 2, range: { min: 1, max: 3 }, area: 'single', power: 0.1, stat: 'war', effect: { type: 'provoke' }, follows: [], text: 't' }
  const duel = (extra = {}) =>
    mk2({
      stratagems: [goad],
      units: [
        { id: 'c', side: 'han', x: 3, y: 5, strats: ['goad'], qi: 2, troops: 5000 },
        { id: 'bait', side: 'han', x: 9, y: 1, troops: 5000 },
        { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', troops: 5000 },
      ],
      ...extra,
    })

  it('R2-STRAT-3 the target is marked provoked (event + status) with no random roll', () => {
    const s = duel()
    const rngBefore = [...s.rng]
    const r = act(s, strat('c', 'goad', 6, 5))
    expect(ev(r.events, 'provoked')).toEqual([{ kind: 'provoked', unit: 'e', by: 'c' }])
    expect(u(r.state, 'e').provoked).toBe('c')
    expect(r.state.rng).not.toEqual(rngBefore) // only the damage variance was drawn
    expect(r.events.some((e) => e.kind === 'confused')).toBe(false)
  })

  it('R2-STRAT-3 legalActions offers a provoked unit only attacks on the provoker or moves toward it', () => {
    let s = act(duel(), strat('c', 'goad', 6, 5)).state
    s = act(s, { type: 'endPhase' }).state // enemy phase
    const mine = legalActions(s).filter((a) => a.type !== 'endPhase' && a.unit === 'e')
    expect(mine.length).toBeGreaterThan(0)
    for (const a of mine) {
      expect(a.type).toBe('move')
      if (a.type === 'move') expect(Math.abs(a.x - 3) + Math.abs(a.y - 5)).toBeLessThan(3)
    }
    // step enforces the same
    reject(s, { type: 'wait', unit: 'e', facing: 'N' }, 'provoked')
    reject(s, { type: 'move', unit: 'e', x: 9, y: 5 }, 'provoked')
    const toward = mine[0]!
    const m = act(s, toward)
    // after moving adjacent it may only attack the provoker
    const atk = legalActions(m.state).filter((a) => a.type !== 'endPhase' && a.unit === 'e')
    if (Math.abs(u(m.state, 'e').x - 3) + Math.abs(u(m.state, 'e').y - 5) === 1) expect(atk.map((a) => a.type)).toEqual(['attack'])
  })

  it('R2-STRAT-3 attacking the provoker is legal; attacking someone else is rejected', () => {
    const s = mk2({
      stratagems: [goad],
      units: [
        { id: 'c', side: 'han', x: 5, y: 5, strats: ['goad'], qi: 2, troops: 5000 },
        { id: 'bait', side: 'han', x: 6, y: 6, troops: 5000 },
        { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', troops: 5000 },
      ],
    })
    const p = act(act(s, strat('c', 'goad', 6, 5)).state, { type: 'endPhase' }).state
    reject(p, { type: 'attack', unit: 'e', target: 'bait' }, 'provoked')
    const ok = act(p, { type: 'attack', unit: 'e', target: 'c' })
    expect(ev(ok.events, 'attacked')[0]!.target).toBe('c')
  })

  it('R2-STRAT-3 it is cleared at the end of the provoked unit\'s phase and when the provoker is gone', () => {
    let s = act(duel(), strat('c', 'goad', 6, 5)).state
    s = endPhases(s, 2) // enemy phase ends -> cleared
    expect(u(s, 'e').provoked).toBeUndefined()
    // a provoker that has been routed no longer binds the target
    let t = act(duel(), strat('c', 'goad', 6, 5)).state
    t = { ...t, units: t.units.filter((x) => x.id !== 'c') }
    t = act({ ...t, side: 'cao', phaseIndex: 1 }, { type: 'wait', unit: 'e', facing: 'N' }).state
    expect(u(t, 'e').done).toBe(true)
  })

  it('R2-STRAT-3 a provoked unit that can neither attack nor approach the provoker is unrestricted', () => {
    const s = mk2({
      stratagems: [goad],
      map: ['............', '............', '............', '............', '....#.......', '...#e#......', '....#.......', ...Array(5).fill('............')],
      units: [{ id: 'c', side: 'han', x: 4, y: 8, strats: ['goad'], qi: 2, type: 'archers' }, { id: 'e', side: 'cao', x: 4, y: 5, type: 'infantry', facing: 'S' }],
    })
    const r = act(s, strat('c', 'goad', 4, 5))
    expect(u(r.state, 'e').provoked).toBe('c')
    const p = act(r.state, { type: 'endPhase' }).state
    const acts = legalActions(p).filter((a) => a.type !== 'endPhase' && a.unit === 'e')
    expect(acts.length).toBe(4) // only the four facings: no move or attack complies, so the unit is free to wait
    expect(acts.every((a) => a.type === 'wait')).toBe(true)
    // once it has moved but cannot attack the provoker, only waiting remains
    const open = mk2({ stratagems: [goad], units: [{ id: 'c', side: 'han', x: 2, y: 5, strats: ['goad'], qi: 2 }, { id: 'e', side: 'cao', x: 5, y: 5, facing: 'W' }] })
    const goaded = act(act(open, strat('c', 'goad', 5, 5)).state, { type: 'endPhase' }).state
    const approach = legalActions(goaded).find((a) => a.type === 'move' && a.unit === 'e' && a.x === 4 && a.y === 5)!
    const moved = act(goaded, approach).state
    expect(legalActions(moved).filter((a) => a.type !== 'endPhase' && a.unit === 'e').every((a) => a.type === 'wait')).toBe(true)
  })

  it('R2-STRAT-3 bridge-roar combines damage, a confuse roll and provoke', () => {
    const s = mk2({ units: [{ id: 'c', side: 'han', x: 5, y: 5, strats: ['bridge-roar'], qi: 5, war: 100 }, { id: 'e', side: 'cao', x: 6, y: 5, facing: 'W', lead: 10, troops: 3000 }] })
    const r = act(s, strat('c', 'bridge-roar', 5, 5))
    expect(ev(r.events, 'provoked')).toHaveLength(1)
    expect(ev(r.events, 'damaged')).toHaveLength(1)
    expect(query.stratagemPreview(s, 'c', 'bridge-roar', { x: 5, y: 5 })!.targets[0]!.confuseChance).toBeGreaterThan(0)
    void step
  })
})
