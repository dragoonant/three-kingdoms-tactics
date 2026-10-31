import { describe, expect, it } from 'vitest'
import { GAME_DATA, getBattleDef } from '../../src/data'
import type { DeployEntry } from '../../src/data/types'
import { createBattle, query, type BattleState, type GameEvent } from '../../src/engine'
import { act, ev, patch, strat, u } from './helpers'

// Battle 9: Red Cliffs. Signature mechanics: the chained fleet of contiguous deck tiles, the wind that blows back on the
// Han until round 5 and then turns to a gale up the river, Huang Gai's fire ships arriving in round 5, burnt decks that
// sink, and Cao Cao's retreat at half strength.

const terrainAt = (s: BattleState, x: number, y: number): string => s.grid.tiles[y * s.grid.width + x]!.terrain
const burning = (s: BattleState): number => s.burn.filter((b) => b > 0).length

function pass(s: BattleState, n: number): { state: BattleState; events: GameEvent[] } {
  let cur = s
  const events: GameEvent[] = []
  for (let i = 0; i < n; i++) {
    const r = act(cur, { type: 'endPhase' })
    cur = r.state
    events.push(...r.events)
  }
  return { state: cur, events }
}

/** Han phase of round 5, where Huang Gai has just arrived. */
function atRoundFive(): { state: BattleState; events: GameEvent[] } {
  return pass(createBattle('red-cliffs', 1), 8)
}

describe('Red Cliffs (battle 9)', () => {
  it('the fleet is one contiguous region of deck tiles over water, and the data is a finished battle', () => {
    const def = getBattleDef('red-cliffs')!
    expect(def.stub).toBeUndefined()
    const decks = new Set<string>()
    def.map.forEach((row, y) => [...row].forEach((ch, x) => def.legend[ch] === 'deck' && decks.add(`${x},${y}`)))
    expect(decks.size).toBeGreaterThanOrEqual(40)
    const seen = new Set<string>()
    const todo = [decks.values().next().value as string]
    while (todo.length > 0) {
      const k = todo.pop()!
      if (seen.has(k)) continue
      seen.add(k)
      const [x, y] = k.split(',').map(Number) as [number, number]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (decks.has(`${x + dx},${y + dy}`)) todo.push(`${x + dx},${y + dy}`)
    }
    expect(seen.size).toBe(decks.size) // chained: every deck tile touches the rest
    expect(def.units.find((x) => x.id === 'cao-cao')).toMatchObject({ commander: true, retreatAt: 0.5 })
    expect(def.objectives!.win).toEqual([{ type: 'routCommander', label: expect.any(String) }])
    // every enemy unit starts on a deck
    for (const e of def.units) expect(def.legend[def.map[e.y]![e.x]!]).toBe('deck')
  })

  it('the wind blows toward the south shore in rounds 1-4 and turns to a northward gale in round 5', () => {
    let s = createBattle('red-cliffs', 1)
    expect(s.wind).toEqual({ dir: 'S', strength: 'breeze' })
    expect(query.wind(s).next).toEqual({ round: 5, dir: 'N', strength: 'gale' })
    const r = pass(s, 7) // through the end of round 4's han phase... then cao's phase ends the round
    s = r.state
    expect(s.round).toBe(4)
    expect(s.wind).toEqual({ dir: 'S', strength: 'breeze' })
    const last = act(s, { type: 'endPhase' })
    expect(last.state.round).toBe(5)
    expect(ev(last.events, 'windChanged')).toEqual([{ kind: 'windChanged', dir: 'N', strength: 'gale', round: 5 }])
    expect(last.state.wind).toEqual({ dir: 'N', strength: 'gale' })
  })

  it('under the early breeze, fire on the fleet is carried the wrong way: south, away from the main body', () => {
    let s = createBattle('red-cliffs', 1)
    const burn = s.burn.slice()
    burn[4 * s.grid.width + 7] = 2 // a deck in the middle of the fleet
    s = { ...s, burn }
    const f = query.fireForecast(s)
    expect(f.spread.map((t) => `${t.x},${t.y}`)).toEqual(['7,5']) // only the tile downwind (south)
    expect(f.spread[0]!.chance).toBeCloseTo(0.6)
  })

  it('Huang Gai arrives in round 5 beside the fleet with Qi for fire-ships, and the Cao reserve comes in round 4', () => {
    const { events } = atRoundFive()
    const arrived = ev(events, 'reinforced')
    expect(arrived.map((e) => `${e.round}:${e.unit}:${e.side}`)).toEqual(['4:red-cliffs-reserve:cao', '5:huang-gai:han'])
    const hg = arrived[1]!
    const { state } = atRoundFive()
    const g = u(state, 'huang-gai')
    expect(g.qi).toBe(4)
    expect(state.round).toBe(5)
    expect(state.side).toBe('han')
    // adjacent to a deck tile of the chained fleet, so fire-ships (range 1) reach it
    expect(terrainAt(state, hg.x, hg.y - 1)).toBe('deck')
    expect(query.stratagemTargets(state, 'huang-gai', 'fire-ships').length).toBeGreaterThan(0)
  })

  it('fire ships under the gale: the fire runs north one row a round, and burnt-out decks sink into the river', () => {
    let s = atRoundFive().state
    const w = s.grid.width
    const cast = act(s, strat('huang-gai', 'fire-ships', 9, 5))
    s = cast.state
    const lit = ev(cast.events, 'ignited').map((e) => `${e.x},${e.y}`).sort()
    expect(lit).toEqual(['10,5', '8,5', '9,4', '9,5']) // the cross around the target; the shallows to the south cannot burn
    expect(burning(s)).toBe(4)
    expect(s.burn[5 * w + 9]).toBe(2)

    // end of round 5: the gale (1.0 to the tile downwind) carries the fire from row 4 to row 3
    let r = pass(s, 2)
    s = r.state
    expect(s.round).toBe(6)
    expect(ev(r.events, 'fireSpread').some((e) => e.from.x === 9 && e.from.y === 4 && e.to.x === 9 && e.to.y === 3)).toBe(true)
    expect(s.burn[3 * w + 9]).toBeGreaterThan(0)
    const afterOne = burning(s)

    // end of round 6: the first rows burn out and sink; the fire has reached row 2
    r = pass(s, 2)
    s = r.state
    expect(ev(r.events, 'terrainChanged').some((e) => e.cause === 'burnout' && e.to === 'water')).toBe(true)
    expect(terrainAt(s, 9, 5)).toBe('water')
    expect(terrainAt(s, 9, 4)).toBe('water')
    expect(s.burn[2 * w + 9]).toBeGreaterThan(0)
    expect(burning(s)).toBeGreaterThan(afterOne)
  })

  it('with three fires lit in round 5 (Huang Gai, Zhou Yu, Zhuge Liang) most of the chained fleet is gone by round 10', () => {
    let s = atRoundFive().state
    s = act(s, strat('huang-gai', 'fire-ships', 9, 5)).state
    s = patch(s, 'zhou-yu', { x: 5, y: 7, qi: 6 })
    s = act(s, strat('zhou-yu', 'fire-attack', 5, 5)).state
    s = patch(s, 'zhuge-liang', { x: 11, y: 8, qi: 6 })
    s = act(s, strat('zhuge-liang', 'valley-blaze', 11, 5)).state
    const def = getBattleDef('red-cliffs')!
    let decksAtStart = 0
    def.map.forEach((row) => [...row].forEach((ch) => def.legend[ch] === 'deck' && decksAtStart++))
    const countDecks = (st: BattleState): number => {
      let n = 0
      for (let y = 0; y < st.grid.height; y++) for (let x = 0; x < st.grid.width; x++) if (terrainAt(st, x, y) === 'deck') n++
      return n
    }
    expect(countDecks(s)).toBe(decksAtStart)
    s = pass(s, 10).state // through the end of round 9
    expect(s.round).toBe(10)
    expect(countDecks(s)).toBeLessThan(decksAtStart * 0.5)
    // the units that stood on the burning fleet have been scorched
    expect(u(s, 'xu-chu').troops).toBeLessThan(3000)
    expect(s.result).toBeNull() // fire alone does not break Cao Cao this early; the Han still have to finish it
  })

  it('a level-7 Zhuge Liang can borrow the gale early: wind N for three rounds, then the schedule resumes', () => {
    const entry = (officerId: string, stratagems?: string[]): DeployEntry => ({
      officerId, level: 7, statBonus: { war: 0, int: 0, lead: 0, cha: 0 }, maxTroops: 2000, troops: 2000,
      stratagems: stratagems ?? GAME_DATA.officers[officerId]!.stratagems.slice(),
    })
    const deploy = ['liu-bei', 'zhuge-liang', 'guan-yu', 'zhang-fei', 'zhao-yun', 'guan-ping'].map((id) => entry(id, id === 'zhuge-liang' ? ['borrow-the-wind'] : undefined))
    let s = createBattle('red-cliffs', 1, { deploy })
    expect(s.wind).toEqual({ dir: 'S', strength: 'breeze' })
    s = patch(s, 'zhuge-liang', { qi: 6 })
    // the anchor is the neighbour tile whose direction from Zhuge Liang sets the wind: the tile north of him
    const z = u(s, 'zhuge-liang')
    const cast = act(s, strat('zhuge-liang', 'borrow-the-wind', z.x, z.y - 1))
    s = cast.state
    expect(ev(cast.events, 'windChanged')[0]).toMatchObject({ dir: 'N', strength: 'gale', by: 'zhuge-liang' })
    expect(s.wind).toEqual({ dir: 'N', strength: 'gale' })
    // now a lit deck in the middle of the fleet threatens the tile to the north with certainty
    const burn = s.burn.slice()
    burn[4 * s.grid.width + 7] = 2
    const f = query.fireForecast({ ...s, burn })
    expect(f.spread.find((t) => t.x === 7 && t.y === 3)!.chance).toBeCloseTo(1)
    // three rounds later the schedule resumes (the early breeze is back until round 5)
    s = pass(s, 6).state // han and cao phases of rounds 1-3 -> round 4 starts
    expect(s.round).toBe(4)
    expect(s.wind).toEqual({ dir: 'S', strength: 'breeze' })
  })

  it('Cao Cao retreats at half strength, which wins the battle', () => {
    let s = createBattle('red-cliffs', 1)
    expect(u(s, 'cao-cao').troops).toBe(5400)
    s = patch(s, 'cao-cao', { troops: 2720 }) // the line is half of 5400 = 2700
    s = patch(s, 'cai-mao', { x: 5, y: 3 }) // a test arrangement: the guard ring on the flagship (7,1) is opened...
    s = patch(s, 'gan-ning', { x: 7, y: 2, facing: 'N' }) // ...and the cavalryman has reached the flagship
    const r = act(s, { type: 'attack', unit: 'gan-ning', target: 'cao-cao' })
    expect(ev(r.events, 'retreated').map((e) => e.unit)).toEqual(['cao-cao'])
    expect(ev(r.events, 'routed').map((e) => e.unit)).not.toContain('cao-cao')
    expect(r.state.retreated).toContain('cao-cao')
    expect(r.state.result).toEqual({ winner: 'han', reason: 'commander' })
  })
})
