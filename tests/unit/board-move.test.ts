import { describe, expect, it } from 'vitest'
import { GAME_DATA } from '../../src/data'
import { FACINGS, arcOf, createBattle, facingToward, legalActions, query } from '../../src/engine'
import { act, ev, mk, reject, setBurn, u } from './helpers'

describe('R-BOARD-1 grid and facing', () => {
  it('R-BOARD-1 the board is W x H with x west-east and y north-south; facings are N E S W', () => {
    const s = createBattle('daxing-hill', 1)
    expect(s.grid.width).toBe(14)
    expect(s.grid.height).toBe(12)
    expect(s.grid.tiles[6 * 14 + 8]).toEqual({ x: 8, y: 6, terrain: 'road' })
    expect(s.grid.tiles[2 * 14 + 8]!.terrain).toBe('ford')
    expect(s.grid.tiles[0]!.terrain).toBe('forest')
    expect(FACINGS).toEqual(['N', 'E', 'S', 'W'])
    const east = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }] })
    const moved = act(east, { type: 'move', unit: 'a', x: 6, y: 5 })
    expect(u(moved.state, 'a').facing).toBe('E')
  })
})

describe('R-BOARD-2 one unit per tile', () => {
  const s = mk({
    units: [
      { id: 'a', side: 'han', x: 4, y: 5 },
      { id: 'b', side: 'han', x: 5, y: 5 },
      { id: 'e', side: 'yellow', x: 5, y: 8 },
    ],
  })
  it('R-BOARD-2 cannot stop on an ally but can pass through one', () => {
    reject(s, { type: 'move', unit: 'a', x: 5, y: 5 }, 'cannotReach')
    const r = act(s, { type: 'move', unit: 'a', x: 6, y: 5 })
    expect(u(r.state, 'a').x).toBe(6)
  })
  it('R-BOARD-2 cannot pass through an enemy', () => {
    const w = mk({
      units: [
        { id: 'a', side: 'han', x: 4, y: 5 },
        { id: 'e', side: 'yellow', x: 5, y: 5 },
      ],
      map: ['............', '............', '............', '............', '~~~~~~~~~~~~', '~~~~.~~~~~~~', '~~~~~~~~~~~~', '............', '............', '............', '............', '............'],
    })
    // a stands in a one-tile-wide corridor surrounded by river: cannot pass the enemy
    reject(w, { type: 'move', unit: 'a', x: 6, y: 5 }, 'cannotReach')
    expect(query.moveRange(w, 'a')).toEqual([])
  })
  it('R-BOARD-2 moving onto an occupied tile is rejected', () => {
    reject(s, { type: 'move', unit: 'b', x: 4, y: 5 }, 'cannotReach')
  })
})

describe('R-BOARD-3 terrain table', () => {
  it('R-BOARD-3 data matches the spec table', () => {
    const t = GAME_DATA.terrain
    const row = (id: keyof typeof t) => [t[id].move && [t[id].move!.infantry, t[id].move!.cavalry, t[id].move!.archers], t[id].def, t[id].elev, t[id].flammability]
    expect(row('plain')).toEqual([[1, 1, 1], 1, 0, 0.5])
    expect(row('farm')).toEqual([[1, 1, 1], 1, 0, 1])
    expect(row('forest')).toEqual([[2, 3, 2], 0.8, 0, 1])
    expect(row('hill')).toEqual([[2, 2, 2], 0.9, 1, 0.5])
    expect(row('village')).toEqual([[1, 1, 1], 0.85, 0, 0])
    expect(row('road')).toEqual([[1, 1, 1], 1, 0, 0])
    expect(row('ford')).toEqual([[2, 3, 2], 1.2, 0, 0])
    expect(row('river')).toEqual([null, 1, 0, 0])
    expect(row('ash')).toEqual([[1, 1, 1], 1, 0, 0])
  })
  it('R-BOARD-3 move cost by troop type: forest 2/3/2, ford 2/3/2, hill 2', () => {
    const map = ['............', '.T..........', '.o..........', '.h..........', '............', '............', '............', '............', '............', '............', '............', '............']
    for (const [type, forest, ford, hill] of [['infantry', 2, 2, 2], ['cavalry', 3, 3, 2], ['archers', 2, 2, 2]] as const) {
      const s = mk({ map, units: [{ id: 'a', side: 'han', type, x: 0, y: 1 }] })
      const cost = (x: number, y: number) => query.moveRange(s, 'a').find((m) => m.x === x && m.y === y)?.cost
      expect(cost(1, 1)).toBe(forest)
      const s2 = mk({ map, units: [{ id: 'a', side: 'han', type, x: 0, y: 2 }] })
      expect(query.moveRange(s2, 'a').find((m) => m.x === 1 && m.y === 2)?.cost).toBe(ford)
      const s3 = mk({ map, units: [{ id: 'a', side: 'han', type, x: 0, y: 3 }] })
      expect(query.moveRange(s3, 'a').find((m) => m.x === 1 && m.y === 3)?.cost).toBe(hill)
    }
  })
  it('R-BOARD-3 river is impassable; village and road cost 1', () => {
    const map = ['............', '.~v=........', '............', '............', '............', '............', '............', '............', '............', '............', '............', '............']
    const s = mk({ map, units: [{ id: 'a', side: 'han', x: 0, y: 1 }] })
    const r = query.moveRange(s, 'a')
    expect(r.find((m) => m.x === 1 && m.y === 1)).toBeUndefined()
    reject(s, { type: 'move', unit: 'a', x: 1, y: 1 }, 'cannotReach')
    const s2 = mk({ map, units: [{ id: 'a', side: 'han', x: 2, y: 2 }] })
    expect(query.moveRange(s2, 'a').find((m) => m.x === 2 && m.y === 1)?.cost).toBe(1)
    expect(query.moveRange(s2, 'a').find((m) => m.x === 3 && m.y === 1)?.cost).toBe(2)
  })
  it('R-BOARD-3 terrain defence multiplies damage taken (forest 0.8, ford 1.2)', () => {
    const map = ['............', '............', '............', '............', '............', '.....Tof....', '............', '............', '............', '............', '............', '............']
    const s = mk({
      map,
      units: [
        { id: 'a', side: 'han', x: 4, y: 5 },
        { id: 'd', side: 'yellow', x: 5, y: 5, facing: 'W' },
      ],
    })
    const m = query.attackPreview(s, 'a', 'd')!.multipliers.find((x) => x.id === 'terrain')
    expect(m?.value).toBe(0.8)
    const s2 = mk({
      map,
      units: [
        { id: 'a', side: 'han', x: 5, y: 5 },
        { id: 'd', side: 'yellow', x: 6, y: 5, facing: 'W' },
      ],
    })
    expect(query.attackPreview(s2, 'a', 'd')!.multipliers.find((x) => x.id === 'terrain')?.value).toBe(1.2)
  })
  it('R-BOARD-3 archers on a hill get +1 max range', () => {
    const map = ['............', '............', '............', '............', '............', '....h.......', '............', '............', '............', '............', '............', '............']
    const hill = mk({ map, units: [{ id: 'a', side: 'han', type: 'archers', x: 4, y: 5 }, { id: 'e', side: 'yellow', x: 8, y: 5 }] })
    expect(query.attackTargets(hill, 'a')).toEqual(['e'])
    const flat = mk({ map, units: [{ id: 'a', side: 'han', type: 'archers', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 9, y: 5 }] })
    expect(query.attackTargets(flat, 'a')).toEqual([])
  })
  it('R-BOARD-3 forest: Charge cannot end in or pass through (dash blocked)', () => {
    const map = ['............', '............', '............', '............', '............', '....T.......', '............', '............', '............', '............', '............', '............']
    const base = [
      { id: 'c', side: 'han' as const, type: 'cavalry' as const, x: 3, y: 5, strats: ['thundering-charge'], qi: 5 },
      { id: 'e', side: 'yellow' as const, x: 6, y: 5, facing: 'W' as const },
    ]
    const s = mk({ map, units: base })
    // path tile (4,5)->(5,5) passes through forest at (4,5)
    expect(query.stratagemTargets(s, 'c', 'thundering-charge')).toEqual([])
    reject(s, { type: 'stratagem', unit: 'c', strat: 'thundering-charge', x: 6, y: 5, excludeFromChain: [] }, 'dashBlocked')
    // destination tile in forest: target at distance 2 with forest right before it
    const s2 = mk({ map, units: [{ ...base[0]!, x: 2, y: 5 }, { ...base[1]!, x: 5, y: 5 }] })
    expect(query.stratagemTargets(s2, 'c', 'thundering-charge')).toEqual([{ x: 5, y: 5 }].filter(() => false))
    const s3 = mk({ map, units: [{ ...base[0]!, x: 2, y: 5 }, { ...base[1]!, x: 6, y: 5 }] })
    expect(query.stratagemTargets(s3, 'c', 'thundering-charge')).toEqual([])
  })
})

describe('R-BOARD-4 height', () => {
  const map = ['............', '............', '............', '............', '............', '....hh......', '............', '............', '............', '............', '............', '............']
  it('R-BOARD-4 attacker on higher ground deals x1.15, on lower ground x0.90', () => {
    const up = mk({ map, units: [{ id: 'a', side: 'han', x: 4, y: 5 }, { id: 'd', side: 'yellow', x: 3, y: 5, facing: 'E' }] })
    // a on hill (elev 1) vs d on plain
    expect(query.attackPreview(up, 'a', 'd')!.multipliers.find((m) => m.id === 'height')?.value).toBe(1.15)
    const down = mk({ map, units: [{ id: 'a', side: 'han', x: 3, y: 5 }, { id: 'd', side: 'yellow', x: 4, y: 5, facing: 'W' }] })
    expect(query.attackPreview(down, 'a', 'd')!.multipliers.find((m) => m.id === 'height')?.value).toBe(0.9)
    const level = mk({ map, units: [{ id: 'a', side: 'han', x: 4, y: 5 }, { id: 'd', side: 'yellow', x: 5, y: 5, facing: 'W' }] })
    expect(query.attackPreview(level, 'a', 'd')!.multipliers.find((m) => m.id === 'height')).toBeUndefined()
  })
})

describe('R-MOVE movement', () => {
  it('R-MOVE-1 move values are infantry 4, cavalry 6, archers 3 on open plain', () => {
    for (const [type, mv] of [['infantry', 4], ['cavalry', 6], ['archers', 3]] as const) {
      const s = mk({ units: [{ id: 'a', side: 'han', type, x: 5, y: 5 }] })
      const r = query.moveRange(s, 'a')
      expect(Math.max(...r.map((m) => m.cost))).toBe(mv)
      expect(r.some((m) => m.x === 5 + mv && m.y === 5)).toBe(true)
      expect(r.some((m) => m.x === 5 + mv + 1 && m.y === 5)).toBe(false)
      expect(r.some((m) => m.x === 5 && m.y === 5)).toBe(false)
    }
  })
  it('R-MOVE-1 entering a tile next to an enemy ends movement (zone of control)', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 2, y: 5 }, { id: 'e', side: 'yellow', x: 6, y: 5 }] })
    const r = query.moveRange(s, 'a')
    const cost = (x: number, y: number) => r.find((m) => m.x === x && m.y === y)?.cost
    // (5,5) is adjacent to e: reachable (cost 3). (6,4) is also in ZOC and costs 5 around it: out of reach.
    expect(cost(5, 5)).toBe(3)
    expect(cost(6, 4)).toBeUndefined()
    expect(cost(5, 4)).toBe(4)
  })
  it('R-MOVE-1 ZOC: cannot continue past a zone-of-control tile', () => {
    const corridor = ['~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '............', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~']
    const s = mk({ map: corridor, units: [{ id: 'a', side: 'han', x: 1, y: 4 }, { id: 'e', side: 'yellow', x: 4, y: 3 }] })
    // e is on a river tile in this synthetic test; ZOC still applies. (4,4) is adjacent to e.
    const r = query.moveRange(s, 'a')
    expect(r.some((m) => m.x === 4 && m.y === 4)).toBe(true)
    expect(r.some((m) => m.x === 5 && m.y === 4)).toBe(false)
  })
  it('R-MOVE-1 a unit may leave a tile that is in enemy ZOC', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 6, y: 5 }] })
    const r = query.moveRange(s, 'a')
    expect(r.some((m) => m.x === 2 && m.y === 5)).toBe(true)
  })
  it('R-MOVE-1 a move above the unit Move value is rejected', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', type: 'archers', x: 5, y: 5 }] })
    reject(s, { type: 'move', unit: 'a', x: 9, y: 5 }, 'cannotReach')
  })
  it('R-MOVE-2 entering a burning tile costs +2 and is allowed; fire damage follows', () => {
    let s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'yellow', x: 11, y: 8 }] })
    s = setBurn(s, 6, 5, 2)
    const r = query.moveRange(s, 'a')
    expect(r.find((m) => m.x === 6 && m.y === 5)?.cost).toBe(3)
    const moved = act(s, { type: 'move', unit: 'a', x: 6, y: 5 })
    expect(u(moved.state, 'a').x).toBe(6)
    let cur = moved.state
    cur = act(cur, { type: 'endPhase' }).state
    const end = act(cur, { type: 'endPhase' })
    expect(ev(end.events, 'damaged').some((d) => d.unit === 'a' && d.source === 'fire')).toBe(true)
  })
  it('R-MOVE-1 the move event carries the path, cost and last-step facing', () => {
    const s = mk({ units: [{ id: 'a', side: 'han', x: 5, y: 5 }] })
    const r = act(s, { type: 'move', unit: 'a', x: 5, y: 3 })
    const m = ev(r.events, 'moved')[0]!
    expect(m.path).toEqual([{ x: 5, y: 4 }, { x: 5, y: 3 }])
    expect(m.cost).toBe(2)
    expect(m.facing).toBe('N')
  })
})

describe('real battle (daxing hill)', () => {
  it('R-MOVE-1 (daxing hill) Guan Yu rides south onto the road, ends facing south and may undo', () => {
    let s = createBattle('daxing-hill', 7)
    expect(query.moveRange(s, 'guan-yu').find((m) => m.x === 3 && m.y === 6)?.cost).toBe(2)
    s = act(s, { type: 'move', unit: 'guan-yu', x: 3, y: 6 }).state
    expect(u(s, 'guan-yu')).toMatchObject({ x: 3, y: 6, facing: 'S', moved: true })
    expect(legalActions(s).some((a) => a.type === 'undoMove' && a.unit === 'guan-yu')).toBe(true)
    s = act(s, { type: 'undoMove', unit: 'guan-yu' }).state
    expect(u(s, 'guan-yu')).toMatchObject({ x: 3, y: 4, facing: 'E', moved: false })
    expect(arcOf({ x: 1, y: 1, facing: 'N' }, { x: 1, y: 3 })).toBe('rear')
    expect(facingToward({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe('E')
  })
  it('R-BOARD-2 (daxing hill) the river blocks: Zhang Fei cannot walk into the river tile', () => {
    const s = createBattle('daxing-hill', 3)
    reject(s, { type: 'move', unit: 'zhang-fei', x: 8, y: 8 }, 'cannotReach')
    expect(s.grid.tiles[8 * 14 + 8]!.terrain).toBe('river')
  })
})
