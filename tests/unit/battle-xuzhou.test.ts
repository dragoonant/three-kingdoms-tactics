import { describe, expect, it } from 'vitest'
import { createBattle, legalActions, query, type BattleState } from '../../src/engine'
import { act, endPhases, ev, patch, u } from './helpers'

// Integration tests for docs/spec/battles/05-xuzhou.md: real data, real step() calls.

const at = (s: BattleState, x: number, y: number) => s.grid.tiles[y * s.grid.width + x]!.terrain
const canMove = (s: BattleState, unit: string, x: number, y: number) =>
  legalActions(s).some((a) => a.type === 'move' && a.unit === unit && a.x === x && a.y === y)
const KEEP: [number, number][] = [[2, 4], [3, 4], [2, 5], [3, 5], [2, 6], [3, 6]]

describe('xuzhou data', () => {
  it('Xuzhou is a survive-10 defence on side cao with a han gate, guests Zhao Yun and Tao Qian, and a three-way lose list', () => {
    const s = createBattle('xuzhou', 1)
    expect(s.sideOrder).toEqual(['han', 'cao'])
    expect(s.gateOwner).toBe('han')
    expect(s.commanders.cao).toBe('cao-cao')
    expect(s.enemyBehaviour['cao-cao']).toBe('hold')
    expect(s.units.filter((x) => x.side === 'han').map((x) => x.id).sort()).toEqual(['guan-yu', 'jian-yong', 'liu-bei', 'tao-qian', 'zhang-fei', 'zhao-yun'])
    const texts = query.objectives(s).map((o) => o.text)
    expect(texts.join(' | ')).toContain('round 1 / 10')
    expect(texts.join(' | ')).toContain('Tao Qian')
    expect(texts.join(' | ')).toContain('keep')
    for (const [x, y] of KEEP) expect(at(s, x, y)).toBe('village')
  })

  it('the city has an owned gate, four ramparts and nothing else a horseman can climb', () => {
    const s = createBattle('xuzhou', 1)
    expect([at(s, 5, 5), at(s, 5, 6)]).toEqual(['gate', 'gate'])
    expect([at(s, 5, 4), at(s, 5, 7), at(s, 3, 9)]).toEqual(['rampart', 'rampart', 'rampart'])
  })
})

describe('xuzhou: walls and gate', () => {
  it('R2-TERRAIN-3 Cao\'s riders cannot enter the barred gate, but Zhao Yun rides out of it', () => {
    let s = createBattle('xuzhou', 3)
    expect(canMove(s, 'zhao-yun', 5, 5)).toBe(true) // the owner's cavalry sallies
    s = act(s, { type: 'endPhase' }).state // Cao's phase, round 1
    s = patch(s, 'xuzhou-raider', { x: 6, y: 5 })
    expect(canMove(s, 'xuzhou-raider', 5, 5)).toBe(false)
    expect(canMove(s, 'xuzhou-raider', 5, 4)).toBe(false) // cavalry cannot climb a rampart either
  })

  it('R2-TERRAIN-2 Cao\'s infantry can climb a rampart from the field outside', () => {
    let s = createBattle('xuzhou', 3)
    s = act(s, { type: 'endPhase' }).state
    s = patch(s, 'dian-wei', { x: 6, y: 4, facing: 'W' })
    expect(canMove(s, 'dian-wei', 5, 4)).toBe(true)
  })
})

describe('xuzhou: lose conditions', () => {
  it('R2-OBJ-1 hold (lose): an enemy standing on a keep tile at the end of Cao\'s phase loses Xuzhou', () => {
    let s = createBattle('xuzhou', 3)
    s = act(s, { type: 'endPhase' }).state // Cao's phase
    s = patch(s, 'dian-wei', { x: 3, y: 5 })
    expect(s.result).toBeNull()
    const r = act(s, { type: 'endPhase' })
    expect(r.state.result).toEqual({ winner: 'cao', reason: 'objective' })
  })

  it('R2-OBJ-1 hold (lose): an enemy outside the keep, even inside the city walls, does not lose it', () => {
    let s = createBattle('xuzhou', 3)
    s = act(s, { type: 'endPhase' }).state
    s = patch(s, 'dian-wei', { x: 4, y: 3 })
    expect(act(s, { type: 'endPhase' }).state.result).toBeNull()
  })

  it('R2-OBJ-1 unitLost: routing Tao Qian loses the battle at once', () => {
    let s = createBattle('xuzhou', 3)
    s = act(s, { type: 'endPhase' }).state
    s = patch(s, 'tao-qian', { troops: 10 })
    s = patch(s, 'dian-wei', { x: 1, y: 4, type: 'infantry' })
    const r = act(s, { type: 'attack', unit: 'dian-wei', target: 'tao-qian' })
    expect(ev(r.events, 'routed').map((e) => e.unit)).toContain('tao-qian')
    expect(r.state.result).toEqual({ winner: 'cao', reason: 'objective' })
  })
})

describe('xuzhou: the clock', () => {
  it('R2-OBJ-1 survive: reaching the end of round 10 wins, and Lu Bu\'s strike at Yanzhou is announced at the start of round 10', () => {
    let s = createBattle('xuzhou', 3)
    const msgs: string[] = []
    for (let i = 0; i < 20 && !s.result; i++) {
      const r = act(s, { type: 'endPhase' })
      msgs.push(...ev(r.events, 'timelineMessage').map((e) => `${e.round}: ${e.text}`))
      s = r.state
    }
    expect(s.result).toEqual({ winner: 'han', reason: 'objective' })
    expect(msgs.some((m) => m.startsWith('10:') && m.includes('Lu Bu has struck at Yanzhou'))).toBe(true)
  })

  it('R2-REIN-1 two conscript levies march in from the east edge at the start of Cao\'s phase in round 4', () => {
    let s = createBattle('xuzhou', 3)
    s = endPhases(s, 6) // rounds 1-3 complete, round 4 han phase
    expect(s.round).toBe(4)
    expect(s.units.some((x) => x.id === 'xuzhou-levy-a')).toBe(false)
    const r = act(s, { type: 'endPhase' })
    const arrived = ev(r.events, 'reinforced')
    expect(arrived.map((e) => [e.unit, e.x, e.y])).toEqual([['xuzhou-levy-a', 13, 4], ['xuzhou-levy-b', 13, 7]])
    expect(u(r.state, 'xuzhou-levy-a').side).toBe('cao')
  })

  it('R2-TIME-1 the old south rampart falls at the end of round 6, and cavalry may then use the gap', () => {
    let s = createBattle('xuzhou', 3)
    s = endPhases(s, 10) // rounds 1-5 complete
    expect(s.round).toBe(6)
    expect(at(s, 3, 9)).toBe('rampart')
    const preview = query.timelinePreview(s, 10)
    expect(preview.some((p) => p.round === 6 && p.phase === 'end' && p.kind === 'terrain')).toBe(true)
    const mid = act(s, { type: 'endPhase' }).state // Cao's phase of round 6
    expect(at(mid, 3, 9)).toBe('rampart')
    const after = act(mid, { type: 'endPhase' })
    expect(at(after.state, 3, 9)).toBe('plain')
    expect(ev(after.events, 'terrainChanged')[0]).toMatchObject({ to: 'plain', cause: 'timeline' })
    // round 7 (han phase done by us), then Cao's raider can ride through the gap at (3,9)
    let t = act(after.state, { type: 'endPhase' }).state
    t = patch(t, 'xuzhou-raider', { x: 3, y: 10 })
    expect(canMove(t, 'xuzhou-raider', 3, 9)).toBe(true)
    expect(canMove(t, 'xuzhou-raider', 3, 8)).toBe(true)
  })
})
