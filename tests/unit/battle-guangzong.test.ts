import { describe, expect, it } from 'vitest'
import { canStandOn, createBattle, legalActions, query, type BattleState, type GameEvent } from '../../src/engine'
import { act, burnAt, endPhases, ev, u } from './helpers'

/** Han round 1-2: end phases (real step calls) until it is round 3 and Han's turn, with Qi 6 for everyone who has been waiting. */
function toRound3(s: BattleState): BattleState {
  const r = endPhases(s, 4)
  expect(r.round).toBe(3)
  expect(r.side).toBe('han')
  return r
}

/** Jian Yong walks to (2,4) and lights the Han millet at (4,4). */
function lightMillet(s: BattleState): { state: BattleState; events: GameEvent[] } {
  const m = act(s, { type: 'move', unit: 'jian-yong', x: 2, y: 4 })
  const f = act(m.state, { type: 'stratagem', unit: 'jian-yong', strat: 'fire-attack', x: 4, y: 4, excludeFromChain: [] })
  return { state: f.state, events: [...m.events, ...f.events] }
}

describe('battle guangzong: the sorcerer who owns the wind', () => {
  it('R2-STRAT-1 call-the-storm is a Command self-cast with a wind effect and Zhang Bao carries it', () => {
    const s = createBattle('guangzong', 1)
    const storm = s.data.stratagems['call-the-storm']!
    expect([storm.tag, storm.area, storm.effect]).toEqual(['Command', 'self', { type: 'wind', dir: 'toward-target', strength: 'gale', rounds: 2 }])
    expect(s.data.officers['zhang-bao']!.stratagems).toContain('call-the-storm')
    expect(s.data.officers['zhang-bao']!.stratagems).toContain('yellow-sky-hex')
    // out of reach and out of Qi at the start: nobody can cast it before round 3 (6 Qi, +2 a phase)
    expect(u(s, 'zhang-bao').qi).toBe(0)
  })

  it('R2-STRAT-1 the player lights the millet under the east breeze; the enemy turns it into a westerly gale for two rounds', () => {
    let s = toRound3(createBattle('guangzong', 1))
    expect(s.wind).toEqual({ dir: 'E', strength: 'breeze' })
    const lit = lightMillet(s)
    s = lit.state
    expect(burnAt(s, 4, 4)).toBe(2)
    // control: with no storm the fire runs east, the Han belt to its west stays unburnt
    const control = endPhases(s, 2) // yellow phase passes, round 3 ends, round 4 han phase
    expect(burnAt(control, 3, 4)).toBe(0)
    expect(burnAt(control, 5, 4)).toBeGreaterThan(0)
    // the real thing: Zhang Bao casts the storm in the enemy phase
    const end = act(s, { type: 'endPhase' })
    s = end.state
    expect(s.side).toBe('yellow')
    expect(u(s, 'zhang-bao').qi).toBe(6)
    const cast = legalActions(s).find((a) => a.type === 'stratagem' && a.unit === 'zhang-bao' && a.strat === 'call-the-storm' && a.x === 9 && a.y === 1)
    expect(cast).toBeDefined()
    const r = act(s, cast!)
    const wind = ev(r.events, 'windChanged')
    expect(wind).toHaveLength(1)
    expect(wind[0]).toMatchObject({ dir: 'W', strength: 'gale', by: 'zhang-bao', strat: 'call-the-storm', rounds: 2 })
    expect(r.state.wind).toEqual({ dir: 'W', strength: 'gale' })
    expect(u(r.state, 'zhang-bao').qi).toBe(0)
    // end of round 3: the gale carries the fire back across the Han belt (downwind spread on millet is certain)
    const round4 = act(r.state, { type: 'endPhase' }).state
    expect(round4.round).toBe(4)
    expect(burnAt(round4, 3, 4)).toBe(2)
    expect(round4.wind).toEqual({ dir: 'W', strength: 'gale' })
    // the borrowed wind lasts through round 4 and then the schedule resumes at the start of round 5
    const round5 = endPhases(round4, 2)
    expect(round5.round).toBe(5)
    expect(round5.wind).toEqual({ dir: 'E', strength: 'breeze' })
  })

  it('R2-STRAT-1 once Zhang Bao is routed the storm is never cast again (he is the only one who knows it)', () => {
    const s = createBattle('guangzong', 1)
    const knowers = s.units.filter((x) => s.data.officers[x.officer]!.stratagems.includes('call-the-storm')).map((x) => x.id)
    expect(knowers).toEqual(['zhang-bao'])
  })

  it('R2-TERRAIN the palisade stops cavalry and only the camp gap lets horsemen through to Zhang Liang', () => {
    const s = createBattle('guangzong', 1)
    expect(s.grid.tiles[3 * s.grid.width + 11]!.terrain).toBe('rampart')
    expect(canStandOn(s, 11, 3, 'han', 'cavalry')).toBe(false)
    expect(canStandOn(s, 11, 3, 'han', 'infantry')).toBe(true)
    expect(canStandOn(s, 11, 5, 'han', 'cavalry')).toBe(true) // the gap
    expect(canStandOn(s, 11, 6, 'han', 'cavalry')).toBe(true)
    // Zhang Liang is far from every Han unit in the opening rounds
    const liang = u(s, 'zhang-liang')
    for (const x of s.units.filter((y) => y.side === 'han')) expect(Math.abs(x.x - liang.x) + Math.abs(x.y - liang.y)).toBeGreaterThanOrEqual(10)
  })

  it('R2-OBJ-1 Zhang Liang is the objective, the narrator names the sick Zhang Jiao, and the river is crossed only at the ford and the bridge', () => {
    const s = createBattle('guangzong', 1)
    expect(query.objectives(s).map((o) => [o.side, o.cond.type])).toEqual([['win', 'routCommander'], ['lose', 'commanderLost'], ['lose', 'timeout']])
    expect(ev(s.opening, 'timelineMessage')[0]!.text).toMatch(/Zhang Jiao lies sick/)
    const crossable = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((y) => canStandOn(s, 7, y, 'han', 'infantry'))
    expect(crossable).toEqual([2, 6, 9])
    expect(s.enemyBehaviour['zhang-bao']).toBe('guard:10,1')
  })
})
