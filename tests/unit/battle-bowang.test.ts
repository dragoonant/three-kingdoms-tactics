// Bowang Slope (207): the wind turns south in round 4 and carries Zhuge Liang's fire down the reed valley;
// Xiahou Dun retreats at half strength; the forest slopes are flagged ambush posts.
import { describe, expect, it } from 'vitest'
import { GAME_DATA, getBattleDef } from '../../src/data'
import { createBattle, legalActions, query, type BattleState } from '../../src/engine'
import { act, endPhases, ev, patch, strat, u } from './helpers'

const burning = (s: BattleState, x: number, y: number): boolean => s.burn[y * s.grid.width + x]! > 0

describe('Bowang: the valley wind (R-WIND-1)', () => {
  it('calm until round 4, then a south breeze that holds to the end', () => {
    let s = createBattle('bowang', 3)
    expect([s.wind.dir, s.wind.strength]).toEqual([null, 'calm'])
    s = endPhases(s, 5) // through the cao phase of round 3 is still pending
    expect(s.round).toBe(3)
    expect(s.wind.strength).toBe('calm')
    const r = act(s, { type: 'endPhase' })
    expect(r.state.round).toBe(4)
    expect(ev(r.events, 'windChanged')).toEqual([{ kind: 'windChanged', dir: 'S', strength: 'breeze', round: 4 }])
    expect([r.state.wind.dir, r.state.wind.strength]).toEqual(['S', 'breeze'])
    expect(ev(r.events, 'timelineMessage').map((e) => e.text).join(' ')).toContain('south')
  })

  it('Zhuge Liang can cast Valley Blaze in round 4 (Qi 8), and the fire runs south with the wind, never north', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    let spreads = 0
    for (const seed of seeds) {
      let s = createBattle('bowang', seed)
      s = endPhases(s, 6)
      expect(s.round).toBe(4)
      expect(u(s, 'zhuge-liang').qi).toBeGreaterThanOrEqual(6)
      const cast = act(s, strat('zhuge-liang', 'valley-blaze', 6, 6))
      expect(ev(cast.events, 'ignited').length).toBeGreaterThanOrEqual(1)
      for (const [x, y] of [[6, 6], [5, 6], [7, 6], [6, 5], [6, 7]] as [number, number][]) expect(burning(cast.state, x, y)).toBe(true)
      // end the han phase, then the cao phase: the end of round 4 resolves the fire under the south breeze
      const end = act(act(cast.state, { type: 'endPhase' }).state, { type: 'endPhase' })
      for (const e of ev(end.events, 'fireSpread')) {
        spreads++
        expect(e.to.y).toBe(e.from.y + 1) // downwind only (breeze: the single downwind neighbour)
        expect(e.to.x).toBe(e.from.x)
      }
      expect(burning(end.state, 6, 4)).toBe(false) // north of the blaze stays cold
      expect(burning(end.state, 4, 6)).toBe(false) // and so do the sides
    }
    expect(spreads).toBeGreaterThan(0)
  })

  it('the camp yard and the road mouth do not burn: the fire stops at the yard', () => {
    const def = getBattleDef('bowang')!
    for (const [x, y] of [[4, 11], [6, 11], [8, 11], [6, 12], [6, 2]] as [number, number][]) {
      const ch = def.map[y]![x]!
      expect(['road', 'village']).toContain(def.legend[ch])
    }
    const s = createBattle('bowang', 1)
    expect(GAME_DATA.terrain[s.grid.tiles[11 * s.grid.width + 6]!.terrain].flammability).toBe(0)
  })
})

describe('Bowang: Xiahou Dun retreats at half strength (R2-OBJ-2)', () => {
  it('a hit that takes him to 50% or below removes him from the board and wins the battle', () => {
    let s = createBattle('bowang', 4)
    expect(u(s, 'xiahou-dun')).toMatchObject({ commander: true, retreatAt: 0.5, troops: 3000, maxTroops: 3000 })
    // bring him next to Zhao Yun (the bait) at 1510 troops
    s = patch(s, 'xiahou-dun', { x: 6, y: 7, facing: 'N', troops: 1510 })
    expect(u(s, 'zhao-yun')).toMatchObject({ x: 6, y: 8 })
    const r = act(s, { type: 'attack', unit: 'zhao-yun', target: 'xiahou-dun' })
    const dmg = ev(r.events, 'damaged').find((e) => e.unit === 'xiahou-dun')!
    expect(dmg.troopsAfter).toBeLessThanOrEqual(1500)
    expect(ev(r.events, 'retreated').map((e) => e.unit)).toEqual(['xiahou-dun'])
    expect(r.state.units.some((x) => x.id === 'xiahou-dun')).toBe(false)
    expect(r.state.result).toMatchObject({ winner: 'han' })
    expect(r.state.retreated).toContain('xiahou-dun')
  })
})

describe('Bowang: the setup', () => {
  it('Zhao Yun stands in the neck as bait; four forest slots are flagged ambush posts', () => {
    const def = getBattleDef('bowang')!
    expect(def.required).toEqual(['liu-bei', 'zhuge-liang', 'zhao-yun'])
    expect(def.deploySlots).toBe(7)
    expect(def.stub).toBeUndefined()
    const ambush = (def.playerStarts ?? []).map((p, i) => [i, p.ambush === true] as const).filter(([, a]) => a).map(([i]) => i)
    expect(ambush).toEqual([3, 4, 5, 6])
    for (const i of ambush) {
      const p = def.playerStarts![i]!
      expect(def.legend[def.map[p.y]![p.x]!]).toBe('forest')
    }
    const s = createBattle('bowang', 2)
    expect(u(s, 'zhao-yun')).toMatchObject({ x: 6, y: 8 })
    expect(u(s, 'zhuge-liang')).toMatchObject({ x: 3, y: 7 })
    expect(u(s, 'liu-bei')).toMatchObject({ x: 6, y: 12, commander: true })
  })

  it('the enemy pursues Zhao Yun and the cautious generals hold the valley mouth', () => {
    const s = createBattle('bowang', 2)
    expect(s.enemyBehaviour['xiahou-dun']).toBe('pursue:zhao-yun')
    expect(s.enemyBehaviour['yu-jin']).toBe('hold')
    expect(['xiahou-dun', 'yu-jin', 'li-dian'].every((id) => u(s, id).side === 'cao')).toBe(true)
  })

  it('Zhuge Liang opens with Valley Blaze and Eight Trigrams, and Valley Blaze reaches the reed valley from his post', () => {
    const s = createBattle('bowang', 2)
    expect(s.data.officers['zhuge-liang']!.stratagems).toEqual(['valley-blaze', 'eight-trigrams'])
    // round 1: Qi 2, no casts yet
    expect(legalActions(s).some((a) => a.type === 'stratagem' && a.unit === 'zhuge-liang')).toBe(false)
    const hot = endPhases(s, 4) // round 3, Qi 6
    expect(query.stratagemTargets(hot, 'zhuge-liang', 'valley-blaze').some((p) => p.x === 6 && p.y === 6)).toBe(true)
  })
})
