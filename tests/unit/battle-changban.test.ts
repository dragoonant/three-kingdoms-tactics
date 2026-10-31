import { describe, expect, it } from 'vitest'
import { GAME_DATA, getBattleDef } from '../../src/data'
import type { DeployEntry } from '../../src/data/types'
import { createBattle, legalActions, query, type BattleState, type GameEvent } from '../../src/engine'
import { act, ev, patch, strat, u } from './helpers'

// Battle 8: Changban. Signature mechanics: the escape objective (Liu Bei + 3 others), the Cao waves from the north
// edge every 2 rounds, the one-tile bridge that Zhang Fei's bridge-roar can plug, and a marsh that burns northward.

const entry = (officerId: string, stratagems?: string[]): DeployEntry => ({
  officerId,
  level: 5,
  statBonus: { war: 0, int: 0, lead: 0, cha: 0 },
  maxTroops: 2000,
  troops: 2000,
  stratagems: stratagems ?? GAME_DATA.officers[officerId]!.stratagems.slice(),
})

const DEFAULT = ['liu-bei', 'zhang-fei', 'guan-yu', 'zhao-yun', 'zhuge-liang', 'guan-ping']

function fresh(seed = 1, deploy: DeployEntry[] = DEFAULT.map((id) => entry(id))): BattleState {
  return createBattle('changban', seed, { deploy })
}

/** End `n` phases with real step calls, collecting every event. */
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

describe('Changban (battle 8)', () => {
  it('the objective is Liu Bei plus three others off the southern road, and the data is the escape shape', () => {
    const def = getBattleDef('changban')!
    expect(def.stub).toBeUndefined()
    expect(def.objectives!.win[0]).toMatchObject({ type: 'escape', units: ['liu-bei'], count: 4 })
    expect(def.objectives!.lose).toEqual([{ type: 'commanderLost' }, { type: 'timeout', round: 12 }])
    const s = fresh()
    expect(query.objectives(s).find((o) => o.side === 'win')!.text).toContain('Escaped 0 / 4')
  })

  it('Cao waves arrive at the north edge in rounds 2, 4 and 6, and Cao Cao holds at the edge', () => {
    let s = fresh()
    const seen: { round: number; unit: string; x: number; y: number }[] = []
    // 12 phases = rounds 1..6 (han, cao each); Han never moves, so nothing is in the way of the entries
    for (let i = 0; i < 11; i++) {
      const r = act(s, { type: 'endPhase' })
      s = r.state
      for (const e of ev(r.events, 'reinforced')) seen.push({ round: e.round, unit: e.unit, x: e.x, y: e.y })
    }
    expect(seen.map((x) => `${x.round}:${x.unit}`)).toEqual(['2:zhang-he', '2:changban-rider-c', '4:xu-chu', '4:xiahou-yuan', '6:cao-cao', '6:cao-ren'])
    expect(seen.every((x) => x.y === 0)).toBe(true) // all enter on the north edge
    const cao = u(s, 'cao-cao')
    expect(s.round).toBe(6)
    expect({ x: cao.x, y: cao.y }).toEqual({ x: 8, y: 0 })
    expect(s.commanders.cao).toBe('cao-cao')
    // the escape objective has no use for Cao Cao: routing him does not end the battle
    expect(s.result).toBeNull()
  })

  it('escaping: three others without Liu Bei is not a win; Liu Bei as the fourth is', () => {
    let s = fresh()
    // move four units onto exit tiles (a test arrangement), then take the real escape actions
    const tiles: Record<string, [number, number]> = { 'guan-yu': [4, 12], 'zhao-yun': [5, 12], 'zhang-fei': [6, 12], 'liu-bei': [8, 12] }
    for (const [id, [x, y]] of Object.entries(tiles)) s = patch(s, id, { x, y })
    for (const id of ['guan-yu', 'zhao-yun', 'zhang-fei']) {
      expect(query.canEscape(s, id)).toBe(true)
      expect(legalActions(s)).toContainEqual({ type: 'escape', unit: id })
      s = act(s, { type: 'escape', unit: id }).state
    }
    expect(s.escaped).toEqual(['guan-yu', 'zhao-yun', 'zhang-fei'])
    expect(s.result).toBeNull() // three escapees, Liu Bei still on the board
    expect(query.objectives(s).find((o) => o.side === 'win')!.text).toContain('Escaped 3 / 4')
    // a fourth non-Liu escapee still does not win
    s = patch(s, 'guan-ping', { x: 9, y: 13 })
    const fourth = act(s, { type: 'escape', unit: 'guan-ping' })
    expect(fourth.state.result).toBeNull()
    const r = act(fourth.state, { type: 'escape', unit: 'liu-bei' })
    expect(ev(r.events, 'escaped')).toHaveLength(1)
    expect(r.state.result).toEqual({ winner: 'han', reason: 'objective' })
    expect(r.state.defeated).toEqual([]) // nobody was routed
  })

  it('a unit that is not on an exit tile cannot escape (the north bank and the marsh are not exits)', () => {
    const s = fresh()
    expect(query.canEscape(s, 'liu-bei')).toBe(false)
    expect(legalActions(s).some((a) => a.type === 'escape')).toBe(false)
  })

  it('Zhang Fei on the south bridgehead plugs the one-tile-wide bridge: a rider on the bridge can only fight him', () => {
    let s = fresh()
    s = act(s, { type: 'move', unit: 'zhang-fei', x: 8, y: 3 }).state
    expect(u(s, 'zhang-fei')).toMatchObject({ x: 8, y: 3 })
    // a Cao rider that has ridden onto the bridge (a test arrangement); then the enemy phase begins
    s = patch(s, 'changban-rider-a', { x: 8, y: 2 })
    s = act(s, { type: 'endPhase' }).state
    expect(s.side).toBe('cao')
    const mine = legalActions(s).filter((a) => 'unit' in a && a.unit === 'changban-rider-a')
    expect(mine.some((a) => a.type === 'attack' && a.target === 'zhang-fei')).toBe(true)
    // no move takes it past the plug: the only free neighbour of (8,2) is the bridge tile behind it
    const moves = mine.filter((a) => a.type === 'move')
    expect(moves.every((a) => a.type === 'move' && a.y <= 2)).toBe(true)
  })

  it('bridge-roar confuses and provokes every rider within two tiles of the bridgehead', () => {
    let s = fresh(1, DEFAULT.map((id) => entry(id, id === 'zhang-fei' ? ['bridge-roar'] : undefined)))
    s = act(s, { type: 'move', unit: 'zhang-fei', x: 8, y: 3 }).state
    // two Cao riders queued on the bridge, (8,2) and (8,1): a test arrangement
    s = patch(s, 'changban-rider-b', { x: 8, y: 2 })
    s = patch(s, 'changban-rider-a', { x: 8, y: 1 })
    s = patch(s, 'zhang-fei', { qi: 5 })
    expect(query.stratagemTargets(s, 'zhang-fei', 'bridge-roar')).toEqual([{ x: 8, y: 3 }])
    const pv = query.stratagemPreview(s, 'zhang-fei', 'bridge-roar', { x: 8, y: 3 })!
    expect(pv.targets.map((t) => t.unit).sort()).toEqual(['changban-rider-a', 'changban-rider-b'])
    expect(pv.targets.every((t) => t.provokes)).toBe(true)
    const cast = act(s, strat('zhang-fei', 'bridge-roar', 8, 3))
    expect(ev(cast.events, 'provoked').map((e) => e.unit).sort()).toEqual(['changban-rider-a', 'changban-rider-b'])
    expect(query.provokedBy(cast.state, 'changban-rider-a')).toBe('zhang-fei')
    expect(query.provokedBy(cast.state, 'changban-rider-b')).toBe('zhang-fei')
  })

  it('the marsh burns toward the north under the opening breeze: a lit reed tile threatens only the tile above it', () => {
    let s = fresh()
    expect(s.wind).toEqual({ dir: 'N', strength: 'breeze' })
    // Jian Yong is not deployed here; light a reed tile directly (a timeline-style ignition) and read the forecast
    const burn = s.burn.slice()
    burn[8 * s.grid.width + 5] = 2 // (5,8) is reeds
    s = { ...s, burn }
    const f = query.fireForecast(s)
    const spread = f.spread.map((t) => `${t.x},${t.y}:${t.chance.toFixed(2)}`)
    expect(spread).toEqual(['5,7:0.60'])
    expect(f.spread.every((t) => t.y < 8)).toBe(true) // nothing spreads south, toward the exit
  })

  it('reaching round 8 calms the wind', () => {
    const { state } = pass(fresh(), 14)
    expect(state.round).toBe(8)
    expect(state.wind.strength).toBe('calm')
  })
})
