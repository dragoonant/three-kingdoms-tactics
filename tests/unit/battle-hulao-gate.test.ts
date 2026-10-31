import { describe, expect, it } from 'vitest'
import { createBattle, legalActions, query, step, type BattleState } from '../../src/engine'
import { act, endPhases, ev, patch, strat, u } from './helpers'

// Integration tests for docs/spec/battles/04-hulao-gate.md: real data, real step() calls.

const at = (s: BattleState, x: number, y: number) => s.grid.tiles[y * s.grid.width + x]!.terrain
const place = (s: BattleState, id: string, x: number, y: number, p: Partial<ReturnType<typeof u>> = {}) => patch(s, id, { x, y, ...p })
/** Moves the three brothers and the chain to open ground west of the stubble, Lu Bu in the middle. */
function duelGround(seed = 11): BattleState {
  let s = createBattle('hulao-gate', seed)
  // everyone ready with plenty of Qi; Lu Bu out on the road below the wall
  s = place(s, 'lu-bu', 6, 5, { facing: 'W' })
  s = place(s, 'zhang-fei', 5, 5, { facing: 'E', qi: 6 })
  s = place(s, 'guan-yu', 6, 2, { facing: 'S', qi: 6 })
  s = place(s, 'liu-bei', 6, 6, { facing: 'N', qi: 6 })
  // keep the rest of the board out of the way
  s = place(s, 'zhang-liao', 13, 9)
  s = place(s, 'hulao-gate-guard', 13, 10)
  s = place(s, 'gongsun-zan', 1, 5)
  s = place(s, 'jian-yong', 1, 7)
  return s
}

describe('hulao-gate data and map', () => {
  it('Hulao Gate is a campaign battle on side dong with a barred gate, ramparts and Lu Bu set to retreat at half strength', () => {
    const s = createBattle('hulao-gate', 1)
    expect(s.sideOrder).toEqual(['han', 'dong'])
    expect(s.gateOwner).toBe('dong')
    expect(u(s, 'lu-bu').retreatAt).toBe(0.5)
    expect(u(s, 'lu-bu').commander).toBe(false)
    expect(s.commanders.dong).toBe('li-jue')
    expect(at(s, 9, 5)).toBe('gate')
    expect(at(s, 9, 6)).toBe('gate')
    expect(at(s, 10, 3)).toBe('rampart')
    expect(s.units.filter((x) => x.side === 'dong' && at(s, x.x, x.y) === 'rampart').map((x) => x.id).sort()).toEqual([
      'hulao-gate-archer-n', 'hulao-gate-archer-s', 'hulao-gate-firebow',
    ])
    expect(u(s, 'lu-bu').troops).toBe(3200)
    // Gongsun Zan is a fixed guest, the brothers and Jian Yong are the default deploy
    expect(s.units.filter((x) => x.side === 'han').map((x) => x.id)).toEqual(['liu-bei', 'guan-yu', 'zhang-fei', 'jian-yong', 'gongsun-zan'])
    expect(query.objectives(s).find((o) => o.side === 'win')!.text).toContain('Lu Bu')
  })
})

describe('hulao-gate: the barred gate', () => {
  it('R2-TERRAIN-3 the coalition cannot step onto the barred gate but Dong can; the bar splits in round 6', () => {
    let s = createBattle('hulao-gate', 3)
    s = place(s, 'guan-yu', 8, 6) // beside the gate, in the open
    const cav = (st: BattleState, uid: string, x: number, y: number) =>
      legalActions(st).some((a) => a.type === 'move' && a.unit === uid && a.x === x && a.y === y)
    expect(cav(s, 'guan-yu', 9, 6)).toBe(false)
    // rounds 1-5 pass with the gate shut; at the start of round 6 it becomes road
    for (let i = 0; i < 9; i++) s = act(s, { type: 'endPhase' }).state
    expect(s.round).toBe(5)
    expect(s.side).toBe('dong')
    expect(at(s, 9, 5)).toBe('gate')
    const r = step(s, { type: 'endPhase' })
    if (!r.ok) throw new Error('rejected')
    expect(r.state.round).toBe(6)
    expect(at(r.state, 9, 5)).toBe('road')
    expect(at(r.state, 9, 6)).toBe('road')
    expect(ev(r.events, 'terrainChanged')[0]).toMatchObject({ to: 'road', cause: 'timeline' })
    expect(ev(r.events, 'timelineMessage').map((e) => e.text).join(' ')).toContain('bar splits')
  })

  it('R2-TERRAIN-3 Dong\'s own riders can use the barred gate', () => {
    let s = createBattle('hulao-gate', 3)
    s = act(s, { type: 'endPhase' }).state // Dong phase, round 1
    expect(s.side).toBe('dong')
    // Lu Bu inside the wall can reach the open ground outside through the gate (9,5)/(9,6)
    s = patch(s, 'hulao-gate-guard', { x: 13, y: 10 })
    const moves = legalActions(s).filter((a) => a.type === 'move' && a.unit === 'lu-bu')
    expect(moves.some((a) => a.type === 'move' && a.x === 8 && a.y === 6)).toBe(true)
  })
})

describe('hulao-gate: ramparts', () => {
  it('R2-TERRAIN-2 cavalry cannot climb a rampart; rampart archers out-range the field below', () => {
    const s = createBattle('hulao-gate', 3)
    // Dong cavalry inside the wall cannot stand on the rampart tiles
    const t = patch(act(s, { type: 'endPhase' }).state, 'lu-bu', { x: 11, y: 4 })
    expect(legalActions(t).some((a) => a.type === 'move' && a.unit === 'lu-bu' && a.x === 10 && a.y === 4)).toBe(false)
    // archers on (10,3) reach 4 tiles (3 + the +1 rampart bonus): a coalition unit at (6,3) is hit, one at (5,3) is not
    const near = patch(t, 'liu-bei', { x: 6, y: 3 })
    const far = patch(t, 'liu-bei', { x: 5, y: 3 })
    expect(query.attackTargets(near, 'hulao-gate-archer-n')).toContain('liu-bei')
    expect(query.attackTargets(far, 'hulao-gate-archer-n')).not.toContain('liu-bei')
  })
})

describe('hulao-gate: Lu Bu', () => {
  it('R2-OBJ-2 Lu Bu retreats once he is at half strength or below, and that wins the battle', () => {
    let s = duelGround()
    s = patch(s, 'lu-bu', { troops: 1520 })
    // Zhang Fei is adjacent on the west; one strike takes Lu Bu to or below 1500
    const r = act(s, { type: 'attack', unit: 'zhang-fei', target: 'lu-bu' })
    expect(ev(r.events, 'retreated')).toHaveLength(1)
    expect(ev(r.events, 'routed').some((e) => e.unit === 'lu-bu')).toBe(false)
    expect(r.state.retreated).toEqual(['lu-bu'])
    expect(r.state.units.some((x) => x.id === 'lu-bu')).toBe(false)
    expect(r.state.result).toEqual({ winner: 'han', reason: 'objective' })
  })

  it('R2-OBJ-1 above the threshold Lu Bu stays and fights on', () => {
    let s = duelGround()
    s = patch(s, 'lu-bu', { troops: 3200 })
    const r = act(s, { type: 'attack', unit: 'zhang-fei', target: 'lu-bu' })
    expect(ev(r.events, 'retreated')).toHaveLength(0)
    expect(r.state.result).toBeNull()
    expect(u(r.state, 'lu-bu').troops).toBeGreaterThan(1500)
  })

  it('R-CHAIN-4 the sworn brothers\' bonded chain (Roar, Charge, Twin Blades) takes most of Lu Bu\'s strength and, from the flanks, breaks him', () => {
    const s = duelGround()
    const roar = act(s, strat('zhang-fei', 'thunder-roar', 5, 5))
    const links = ev(roar.events, 'chainLink')
    expect(links.map((l) => [l.unit, l.strat, l.bond])).toEqual([
      ['guan-yu', 'thundering-charge', true],
      ['liu-bei', 'twin-blades', true],
    ])
    expect(links.map((l) => l.link)).toEqual([1, 2])
    // 3200 troops, half is 1600: the chain from the side arcs carries him below it
    expect(ev(roar.events, 'retreated').map((e) => e.unit)).toEqual(['lu-bu'])
    expect(roar.state.result).toEqual({ winner: 'han', reason: 'objective' })
  })

  it('R-CHAIN-2 the engine orders links by expected damage: Liu Bei on Lu Bu\'s rear arc jumps ahead of Guan Yu\'s Charge and cuts the chain short', () => {
    const s = patch(duelGround(), 'lu-bu', { facing: 'N' })
    const roar = act(s, strat('zhang-fei', 'thunder-roar', 5, 5))
    expect(ev(roar.events, 'chainLink').map((l) => l.unit)).toEqual(['liu-bei'])
    expect(ev(roar.events, 'retreated')).toHaveLength(0)
    expect(roar.state.result).toBeNull()
    expect(u(roar.state, 'lu-bu').troops).toBeGreaterThan(1600)
  })

  it('without Liu Bei and Guan Yu the lone Zhang Fei does not break Lu Bu: the bonds are the point', () => {
    const s = duelGround()
    const lone = act(s, strat('zhang-fei', 'thunder-roar', 5, 5, ['guan-yu', 'liu-bei']))
    expect(ev(lone.events, 'chainLink')).toHaveLength(0)
    expect(ev(lone.events, 'retreated')).toHaveLength(0)
    expect(lone.state.result).toBeNull()
    expect(u(lone.state, 'lu-bu').troops).toBeGreaterThan(2800)
  })

  it('Lu Bu stays behind the wall until a coalition unit is within 7 tiles (ambush hint), and the hint is open information', () => {
    const s = createBattle('hulao-gate', 3)
    expect(s.enemyBehaviour['lu-bu']).toBe('ambush:7')
    expect(s.enemyBehaviour['hulao-gate-archer-n']).toBe('hold')
  })
})

describe('hulao-gate: a full pass through the timeline', () => {
  it('the ram message is scheduled for the end of round 5 and shows up in the timeline preview', () => {
    const s = createBattle('hulao-gate', 3)
    const preview = query.timelinePreview(s, 10)
    expect(preview.some((p) => p.round === 6 && p.kind === 'terrain')).toBe(true)
    const done = endPhases(s, 10)
    expect(done.round).toBe(6)
  })
})
