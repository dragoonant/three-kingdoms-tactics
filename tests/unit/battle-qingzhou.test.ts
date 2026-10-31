import { describe, expect, it } from 'vitest'
import { campaignBattleOptions, makeRecord, newCampaign, type CampaignState } from '../../src/campaign'
import { GAME_DATA } from '../../src/data'
import { canStandOn, createBattle, legalActions, query, step, type BattleState, type GameEvent } from '../../src/engine'
import { act, endPhases, ev, u } from './helpers'

/** Play phases with real step() calls, collecting every event. */
function playPhases(s: BattleState, n: number): { state: BattleState; events: GameEvent[] } {
  let cur = s
  const events: GameEvent[] = []
  for (let i = 0; i < n; i++) {
    const r = act(cur, { type: 'endPhase' })
    cur = r.state
    events.push(...r.events)
  }
  return { state: cur, events }
}

describe('battle qingzhou: feigned retreat, ridge reinforcements, the governor sallies', () => {
  it('R2-REIN-1 only Liu Bei, Jian Yong and Zou Jing start on the board; the brothers are held back for round 3', () => {
    const s = createBattle('qingzhou', 1)
    expect(s.units.filter((x) => x.side === 'han').map((x) => x.id).sort()).toEqual(['jian-yong', 'liu-bei', 'zou-jing'])
    expect(s.units.filter((x) => x.side === 'yellow')).toHaveLength(8)
    const waves = s.reinforcements.filter((r) => r.side === 'han').map((r) => [r.round, r.units.map((x) => x.id)])
    expect(waves).toEqual([[3, ['guan-yu']], [3, ['zhang-fei']], [5, ['gong-jing']]])
  })

  it('R2-SLOT-1 Guan Yu rides in from the north ridge and Zhang Fei from the south ridge at the start of round 3', () => {
    const early = playPhases(createBattle('qingzhou', 1), 3) // han1 yellow1 han2: round 2 yellow phase next
    expect(early.state.units.find((x) => x.id === 'guan-yu')).toBeUndefined()
    expect(ev(early.events, 'reinforced')).toHaveLength(0)
    const late = playPhases(early.state, 1) // yellow2 -> round 3 han phase
    expect(late.state.round).toBe(3)
    expect(late.state.side).toBe('han')
    const arrivals = ev(late.events, 'reinforced').map((e) => [e.unit, e.x, e.y, e.round])
    expect(arrivals).toEqual([['guan-yu', 6, 1, 3], ['zhang-fei', 6, 10, 3]])
    const gy = u(late.state, 'guan-yu')
    const zf = u(late.state, 'zhang-fei')
    expect([gy.type, gy.side, gy.qi, gy.done]).toEqual(['cavalry', 'han', 4, false])
    expect([zf.type, zf.side, zf.qi, zf.done]).toEqual(['infantry', 'han', 4, false])
    // they can act at once
    expect(legalActions(late.state).some((a) => a.type === 'move' && a.unit === 'guan-yu')).toBe(true)
  })

  it('R2-REIN-1 Gong Jing sallies from the gate at the start of round 5 and not before', () => {
    const r4 = playPhases(createBattle('qingzhou', 1), 6) // through round 3
    expect(r4.state.round).toBe(4)
    expect(r4.state.units.find((x) => x.id === 'gong-jing')).toBeUndefined()
    const r5 = playPhases(r4.state, 2) // through round 4: round 5 han phase begins
    expect(r5.state.round).toBe(5)
    const gj = u(r5.state, 'gong-jing')
    expect([gj.side, gj.x, gj.y, gj.commander]).toEqual(['han', 12, 6, false])
    expect(ev(r5.events, 'reinforced').map((e) => e.unit)).toEqual(['gong-jing'])
  })

  it('R2-TERRAIN the gate belongs to Han: rebels can never stand on it', () => {
    const s = createBattle('qingzhou', 1)
    expect(s.gateOwner).toBe('han')
    expect(s.grid.tiles[6 * s.grid.width + 12]!.terrain).toBe('gate')
    for (const type of ['infantry', 'cavalry', 'archers'] as const) {
      expect(canStandOn(s, 12, 6, 'yellow', type)).toBe(false)
      expect(canStandOn(s, 12, 6, 'han', type)).toBe(true)
    }
  })

  it('R2-OBJ-1 the Rebel Chief pursues Liu Bei, and routing him wins the battle', () => {
    let s = createBattle('qingzhou', 1)
    expect(s.enemyBehaviour['qz-rebel-chief']).toBe('pursue:liu-bei')
    expect(query.objectives(s).map((o) => [o.side, o.cond.type])).toEqual([['win', 'routCommander'], ['lose', 'commanderLost'], ['lose', 'timeout']])
    // the chief is not within reach of anyone in round 1 or 2: nobody can even target him from the starting line
    const chief = u(s, 'qz-rebel-chief')
    for (const x of s.units.filter((y) => y.side === 'han')) expect(Math.abs(x.x - chief.x) + Math.abs(x.y - chief.y)).toBeGreaterThan(8)
    // force his rout with a real attack chain-free kill: set him to 10 troops next to Liu Bei and attack
    s = { ...s, units: s.units.map((x) => (x.id === 'qz-rebel-chief' ? { ...x, troops: 10, x: 3, y: 5, facing: 'W' as const } : x)) }
    const r = step(s, { type: 'attack', unit: 'liu-bei', target: 'qz-rebel-chief' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.result?.winner).toBe('han')
      expect(r.state.result?.reason).toBe('commander')
    }
  })

  it('R2-OPT-1 with a campaign deploy the brothers keep their levels and troops when they arrive in round 3', () => {
    let c: CampaignState = newCampaign(7, false)
    c = { ...c, battleIndex: 1, roster: [...c.roster, makeRecord('jian-yong', 3)] }
    const opts = campaignBattleOptions(c, { officers: [] })
    expect(opts.deploy!.map((d) => d.officerId)).toEqual(['liu-bei', 'jian-yong', 'guan-yu', 'zhang-fei'])
    const wounded = { ...opts, deploy: opts.deploy!.map((d) => (d.officerId === 'guan-yu' ? { ...d, troops: 1000, level: 5, statBonus: { war: 2, int: 0, lead: 0, cha: 0 } } : d)) }
    let s = createBattle('qingzhou', 3, wounded)
    s = endPhases(s, 4)
    expect(s.round).toBe(3)
    const gy = u(s, 'guan-yu')
    expect([gy.troops, gy.x, gy.y]).toEqual([1000, 6, 1])
    expect(s.data.officers['guan-yu']!.war).toBe(99) // 97 + 2
    expect(GAME_DATA.officers['guan-yu']!.war).toBe(97)
  })

  it('R2-TIME-1 the narrator calls the horns before round 3 and the gate before round 5', () => {
    const s0 = createBattle('qingzhou', 1)
    expect(ev(s0.opening, 'timelineMessage')).toHaveLength(1)
    const a = playPhases(s0, 4)
    expect(ev(a.events, 'timelineMessage').map((e) => e.round)).toEqual([2])
    const b = playPhases(a.state, 4)
    expect(ev(b.events, 'timelineMessage').map((e) => e.round)).toEqual([4])
  })
})
