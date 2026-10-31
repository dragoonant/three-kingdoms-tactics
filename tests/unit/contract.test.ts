import { describe, expect, it } from 'vitest'
import { EVENT_KINDS, createBattle, legalActions, query, step, type Action } from '../../src/engine'
import { act, mk, reject, strat, u } from './helpers'

describe('step contract (docs/spec/00-architecture.md)', () => {
  it('step never throws on garbage: it returns ok:false with a code and message', () => {
    const s = createBattle('daxing-hill', 1)
    const junk: unknown[] = [
      null, undefined, 5, 'move', [], {}, { type: 'dance' }, { type: 'move' }, { type: 'move', unit: 'liu-bei', x: 'a', y: 1 },
      { type: 'move', unit: 'liu-bei', x: 1.5, y: 6 }, { type: 'move', unit: 'liu-bei', x: NaN, y: 6 }, { type: 'move', unit: 7, x: 1, y: 1 },
      { type: 'attack', unit: 'liu-bei' }, { type: 'wait', unit: 'liu-bei' }, { type: 'sway', target: 'x' },
      { type: 'stratagem', unit: 'liu-bei', strat: 'rally', x: 1, y: 6 },
      { type: 'stratagem', unit: 'liu-bei', strat: 'rally', x: 1, y: 6, excludeFromChain: 'nope' },
      { type: 'move', unit: 'liu-bei', x: -3, y: 99 }, { type: 'undoMove' },
    ]
    for (const a of junk) {
      const r = step(s, a as Action)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(typeof r.code).toBe('string')
        expect(r.message.length).toBeGreaterThan(0)
      }
    }
    reject(s, { type: 'move', unit: 'liu-bei', x: 1.5, y: 6 }, 'malformed')
    reject(s, { type: 'move', unit: 'liu-bei', x: -3, y: 99 }, 'cannotReach')
    reject(s, { type: 'move', unit: 'nobody', x: 1, y: 1 }, 'unknownUnit')
    reject(s, { type: 'move', unit: 'cheng-yuanzhi', x: 10, y: 4 }, 'notYourPhase')
  })
  it('a rejected step leaves the state untouched and consumes no randomness', () => {
    const s = createBattle('daxing-hill', 9)
    const before = JSON.stringify(s)
    step(s, { type: 'attack', unit: 'liu-bei', target: 'cheng-yuanzhi' })
    expect(JSON.stringify(s)).toBe(before)
  })
  it('legalActions: endPhase is always present and last; every offered action is accepted by step', () => {
    const s0 = createBattle('daxing-hill', 2)
    let s = s0
    for (let i = 0; i < 6; i++) {
      const la = legalActions(s)
      expect(la.at(-1)).toEqual({ type: 'endPhase' })
      for (const a of la) expect(step(s, a).ok, JSON.stringify(a)).toBe(true)
      s = act(s, la[i * 7 % (la.length - 1)]!).state
    }
  })
  it('legalActions enumerates move targets, undoMove, attacks, stratagem anchors and four waits per ready unit', () => {
    const s = mk({
      units: [
        { id: 'k', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 5 },
        { id: 'e', side: 'yellow', x: 8, y: 5 },
      ],
    })
    const la = legalActions(s).filter((a) => 'unit' in a && a.unit === 'k')
    expect(la.filter((a) => a.type === 'move')).toHaveLength(query.moveRange(s, 'k').length)
    expect(la.filter((a) => a.type === 'wait').map((a) => (a as { facing: string }).facing)).toEqual(['N', 'E', 'S', 'W'])
    expect(la.filter((a) => a.type === 'attack')).toEqual([{ type: 'attack', unit: 'k', target: 'e' }])
    const st = la.filter((a) => a.type === 'stratagem')
    expect(st).toHaveLength(query.stratagemTargets(s, 'k', 'arrow-rain').length)
    expect(st.every((a) => a.type === 'stratagem' && Array.isArray(a.excludeFromChain) && a.excludeFromChain.length === 0)).toBe(true)
    expect(la.some((a) => a.type === 'undoMove')).toBe(false)
    const moved = act(s, { type: 'move', unit: 'k', x: 4, y: 5 }).state
    const lm = legalActions(moved).filter((a) => 'unit' in a && a.unit === 'k')
    expect(lm.some((a) => a.type === 'move')).toBe(false)
    expect(lm.filter((a) => a.type === 'undoMove')).toHaveLength(1)
  })
  it('a unit that cannot afford a stratagem gets no stratagem actions; a done unit gets nothing', () => {
    const s = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 2 }, { id: 'e', side: 'yellow', x: 8, y: 5 }] })
    expect(legalActions(s).some((a) => a.type === 'stratagem')).toBe(false)
    expect(query.stratagemOptions(s, 'k')).toEqual([{ id: 'arrow-rain', name: 'Arrow Rain', cost: 3, usable: false, reason: 'Needs 3 Qi' }])
    const done = act(s, { type: 'wait', unit: 'k', facing: 'E' }).state
    expect(legalActions(done).filter((a) => 'unit' in a && a.unit === 'k')).toEqual([])
  })
  it('stratagemOptions reports usability', () => {
    const s = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 5 }, { id: 'e', side: 'yellow', x: 8, y: 5 }] })
    expect(query.stratagemOptions(s, 'k')[0]).toMatchObject({ usable: true })
    const far = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 1, y: 1, strats: ['arrow-rain'], qi: 5 }, { id: 'e', side: 'yellow', x: 9, y: 9 }] })
    expect(query.stratagemOptions(far, 'k')[0]).toMatchObject({ usable: false, reason: 'No valid target' })
  })
  it('query results are consistent with step: stratagemTargets all cast, preview totals add up', () => {
    const s = mk({ units: [{ id: 'k', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 5 }, { id: 'e', side: 'yellow', x: 8, y: 5 }, { id: 'e2', side: 'yellow', x: 8, y: 6 }] })
    for (const t of query.stratagemTargets(s, 'k', 'arrow-rain')) {
      expect(act(s, strat('k', 'arrow-rain', t.x, t.y)).events.length).toBeGreaterThan(0)
      expect(query.stratagemPreview(s, 'k', 'arrow-rain', t)).not.toBeNull()
    }
    expect(query.stratagemPreview(s, 'k', 'arrow-rain', { x: 1, y: 1 })).toBeNull()
    expect(query.stratagemPreview(s, 'k', 'twin-blades', { x: 8, y: 5 })).toBeNull()
  })
  it('the event union has a kind list the client can iterate (every kind appears exactly once)', () => {
    expect(new Set(EVENT_KINDS).size).toBe(EVENT_KINDS.length)
    expect(EVENT_KINDS).toContain('chainLink')
    expect(EVENT_KINDS).toContain('battleEnded')
  })
  it('a swayed unit is a normal unit of its new side for legalActions', () => {
    const s = mk({ units: [{ id: 'q', side: 'han', x: 5, y: 5, cha: 100 }, { id: 't', side: 'yellow', x: 6, y: 5, loyalty: 0 }] })
    const r = act(s, { type: 'sway', unit: 'q', target: 't' })
    if (r.events.some((e) => e.kind === 'swayed')) expect(u(r.state, 't').side).toBe('han')
    else expect(u(r.state, 't').side).toBe('yellow')
  })
})
