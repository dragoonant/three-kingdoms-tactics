import { describe, expect, it } from 'vitest'
import { GAME_DATA } from '../../src/data'
import { createBattle, legalActions, query, type DeployEntry } from '../../src/engine'
import { act, endPhases, ev, u } from './helpers'
import { mk2 } from './v2-helpers'

const entry = (officerId: string, o: Partial<DeployEntry> = {}): DeployEntry => ({
  officerId, level: 3, statBonus: { war: 0, int: 0, lead: 0, cha: 0 }, maxTroops: 2000, troops: 2000,
  stratagems: GAME_DATA.officers[officerId]!.stratagems.slice(), ...o,
})

describe('R2-OPT-1 battle options', () => {
  it('R2-OPT-1 without options Daxing Hill has exactly its built-in roster, positions and troops', () => {
    const s = createBattle('daxing-hill', 5)
    expect(s.units.map((x) => [x.id, x.side, x.type, x.x, x.y, x.facing, x.troops, x.maxTroops, x.commander])).toEqual([
      ['liu-bei', 'han', 'infantry', 1, 6, 'E', 2000, 2000, true],
      ['guan-yu', 'han', 'cavalry', 3, 4, 'E', 2000, 2000, false],
      ['zhang-fei', 'han', 'infantry', 3, 8, 'E', 2000, 2000, false],
      ['zou-jing', 'han', 'archers', 2, 5, 'E', 2500, 2500, false],
      ['jian-yong', 'han', 'archers', 2, 7, 'E', 1500, 1500, false],
      ['cheng-yuanzhi', 'yellow', 'infantry', 11, 4, 'W', 3000, 3000, true],
      ['deng-mao', 'yellow', 'infantry', 10, 7, 'W', 2500, 2500, false],
      ['captain-gao', 'yellow', 'infantry', 9, 2, 'W', 1500, 1500, false],
      ['captain-sun', 'yellow', 'infantry', 9, 9, 'W', 1500, 1500, false],
      ['captain-ma', 'yellow', 'cavalry', 10, 6, 'W', 1500, 1500, false],
      ['captain-wu', 'yellow', 'archers', 11, 3, 'W', 1500, 1500, false],
      ['taiping-adept', 'yellow', 'archers', 12, 5, 'W', 1200, 1200, false],
    ])
    expect(s.data).toBe(GAME_DATA) // no per-battle copy when nothing is customised
    expect(s.objectives).toBeNull()
    expect(s.opening).toEqual([])
  })

  it('R2-OPT-1 options.deploy places the officers on playerStarts in order with troops and stratagems from the entry', () => {
    const s = createBattle('proving-ground', 3, {
      deploy: [
        entry('liu-bei', { troops: 1000, maxTroops: 2100, stratagems: ['rally'] }),
        entry('zhang-fei'),
        entry('guan-yu'),
      ],
    })
    const han = s.units.filter((x) => x.side === 'han' && x.id !== 'zou-jing')
    expect(han.map((x) => [x.id, x.x, x.y])).toEqual([['liu-bei', 1, 5], ['zhang-fei', 2, 4], ['guan-yu', 2, 6]])
    const liu = u(s, 'liu-bei')
    expect([liu.troops, liu.maxTroops, liu.commander]).toEqual([1000, 2100, true])
    expect(s.data.officers['liu-bei']!.stratagems).toEqual(['rally'])
    expect(u(s, 'zhang-fei').type).toBe('infantry')
    expect(u(s, 'guan-yu').type).toBe('cavalry')
  })

  it('R2-OPT-1 stats in battle = base + statBonus, capped at 100; the shared tables are untouched', () => {
    const s = createBattle('proving-ground', 3, {
      deploy: [entry('liu-bei'), entry('guan-yu', { statBonus: { war: 9, int: 2, lead: 0, cha: 0 } })],
    })
    expect(s.data.officers['guan-yu']!.war).toBe(100) // 97 + 9 capped
    expect(s.data.officers['guan-yu']!.int).toBe(77)
    expect(GAME_DATA.officers['guan-yu']!.war).toBe(97)
    expect(s.data.officers['liu-bei']).toBe(GAME_DATA.officers['liu-bei']) // unmodified entries are shared
  })

  it('R2-OPT-1 more deploy entries than playerStarts are ignored', () => {
    const ids = ['liu-bei', 'guan-yu', 'zhang-fei', 'zhuge-liang', 'jian-yong', 'guan-ping', 'zhao-yun']
    const s = createBattle('proving-ground', 3, { deploy: ids.map((i) => entry(i)) })
    expect(s.units.find((x) => x.id === 'zhao-yun')).toBeUndefined()
    expect(s.reinforcements.some((r) => r.units.some((x) => x.id === 'zhao-yun'))).toBe(false)
  })
})

describe('R2-GUEST-1 / R2-SLOT-1 guests and slots', () => {
  it('R2-GUEST-1 guests stand at their own starts whatever is deployed, and are never part of the deploy list', () => {
    for (const deploy of [undefined, [entry('liu-bei')]]) {
      const s = createBattle('proving-ground', 3, deploy ? { deploy } : undefined)
      const g = u(s, 'zou-jing')
      expect([g.side, g.x, g.y, g.troops, g.commander]).toEqual(['han', 2, 5, 2500, false])
    }
    const d = createBattle('daxing-hill', 1, { deploy: [entry('liu-bei')] })
    expect(d.units.filter((x) => x.side === 'han').map((x) => x.id)).toEqual(['liu-bei', 'zou-jing', 'jian-yong'])
  })

  it('R2-GUEST-1 defaultDeploy lists the roster officers used when no options.deploy is given', () => {
    const s = createBattle('proving-ground', 3)
    const han = s.units.filter((x) => x.side === 'han').map((x) => x.id)
    // slot 4 (jian-yong) is a held-back reinforcement and slot 5 (guan-ping) arrives in round 3
    expect(han).toEqual(['liu-bei', 'guan-yu', 'zhang-fei', 'zhuge-liang', 'zou-jing'])
    expect(s.reinforcements.filter((r) => r.side === 'han').flatMap((r) => r.units.map((x) => x.id)).sort()).toEqual(['guan-ping', 'jian-yong'])
  })

  it('R2-SLOT-1 arrivesRound: that slot arrives as a reinforcement in that round on that tile; ambush has no rule effect', () => {
    let s = createBattle('proving-ground', 3)
    expect(s.units.find((x) => x.id === 'guan-ping')).toBeUndefined()
    s = endPhases(s, 4) // through round 2
    expect(s.round).toBe(3)
    const r = act(s, { type: 'endPhase' }) // (cao phase of round 3 follows the han phase; arrivals happen at han's phase start earlier)
    expect(r.state.units.find((x) => x.id === 'guan-ping')).toBeDefined()
    const gp = u(r.state, 'guan-ping')
    expect([gp.x, gp.y]).toEqual([3, 9])
    // zhuge-liang sits on the ambush start (1,3) and behaves like anyone else
    expect(u(createBattle('proving-ground', 3), 'zhuge-liang').qi).toBe(2)
  })

  it('R2-REIN-1 a reinforcement may name a deploy slot: the n-th chosen officer arrives in that round on the entry tile', () => {
    let s = createBattle('proving-ground', 3)
    expect(s.units.find((x) => x.id === 'jian-yong')).toBeUndefined()
    s = endPhases(s, 6) // rounds 1..3 complete; round 4 han phase starts
    expect(s.round).toBe(4)
    const jy = s.units.find((x) => x.id === 'jian-yong')
    expect(jy).toBeDefined()
    expect([jy!.x, jy!.y, jy!.side, jy!.type]).toEqual([0, 9, 'han', 'archers'])
  })
})

describe('R2-REIN-1 reinforcements', () => {
  const wave = (extra = {}) =>
    mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      reinforcements: [{ round: 2, side: 'cao', units: [{ id: 'r1', side: 'cao', x: 0, y: 0, type: 'cavalry', troops: 800 }, { id: 'r2', side: 'cao', x: 0, y: 0, troops: 700 }], entry: [[8, 2], [9, 2]] }],
      ...extra,
    })

  it('R2-REIN-1 a wave arrives at the start of that side\'s phase in that round, ready to act with Qi 4', () => {
    let s = wave()
    expect(s.reinforcements).toHaveLength(1)
    s = endPhases(s, 2) // round 1 done -> round 2, han phase: not yet
    expect(s.round).toBe(2)
    expect(s.units.find((x) => x.id === 'r1')).toBeUndefined()
    const r = act(s, { type: 'endPhase' }) // cao phase of round 2
    expect(ev(r.events, 'reinforced').map((e) => [e.unit, e.x, e.y, e.round, e.troops])).toEqual([['r1', 8, 2, 2, 800], ['r2', 9, 2, 2, 700]])
    const r1 = u(r.state, 'r1')
    expect([r1.qi, r1.done, r1.moved, r1.side]).toEqual([4, false, false, 'cao'])
    expect(r.state.reinforcements).toHaveLength(0)
    expect(legalActions(r.state).some((a) => a.type !== 'endPhase' && a.unit === 'r1')).toBe(true)
  })

  it('R2-REIN-1 a blocked entry tile shifts to the nearest free passable tile (row-major tie-break)', () => {
    let s = wave({ units: [{ id: 'a', side: 'han', x: 8, y: 2 }, { id: 'e', side: 'cao', x: 10, y: 10 }] })
    s = endPhases(s, 3)
    const r1 = u(s, 'r1')
    // (8,2) is held by the han unit; ring-1 candidates (8,1) (7,2) (9,2) (8,3): (8,1) is first in row-major order... but (9,2) is r2's own entry, placed after
    expect([r1.x, r1.y]).toEqual([8, 1])
    expect([u(s, 'r2').x, u(s, 'r2').y]).toEqual([9, 2])
  })

  it('R2-REIN-1 a wall tile is never an arrival tile', () => {
    const s0 = wave({ map: ['............', '............', '........#...', ...Array(9).fill('............')] })
    const s = endPhases({ ...s0, reinforcements: s0.reinforcements.map((r) => ({ ...r, entry: [[8, 2], [9, 2]] as [number, number][] })) }, 3)
    const r1 = u(s, 'r1')
    expect(s.grid.tiles[r1.y * s.grid.width + r1.x]!.terrain).not.toBe('wall')
    expect([r1.x, r1.y]).toEqual([8, 1])
  })

  it('R2-REIN-1 the proving ground wave for the enemy arrives in round 3', () => {
    let s = createBattle('proving-ground', 9)
    s = endPhases(s, 4)
    expect(s.units.find((x) => x.id === 'pg-raider-a')).toBeUndefined()
    s = act(s, { type: 'endPhase' }).state
    s = act(s, { type: 'endPhase' }).state
    // round 3 han -> cao phase start spawned them
    expect(s.units.find((x) => x.id === 'pg-raider-a')).toBeDefined()
  })
})

describe('R2-SIDE-1 side ids are data', () => {
  it('R2-SIDE-1 any enemy side id works and sides come from the battle', () => {
    for (const [id, side] of [['hulao-gate', 'dong'], ['xuzhou', 'cao'], ['xiapi', 'lu'], ['guangzong', 'yellow']] as const) {
      const s = createBattle(id, 2)
      expect(s.sideOrder).toEqual(['han', side])
      expect(s.sides.map((x) => x.id)).toEqual(['han', side])
      expect(s.units.some((x) => x.side === side)).toBe(true)
      const e = act(s, { type: 'endPhase' })
      expect(e.state.side).toBe(side)
      expect(e.events.some((x) => x.kind === 'phaseStarted' && x.side === side)).toBe(true)
    }
  })

  it('R2-SIDE-1 a swayed unit joins the player side whatever the enemy side is called', () => {
    const joined = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const s = mk2({ seed, enemy: 'lu', units: [{ id: 'q', side: 'han', x: 5, y: 5, cha: 100 }, { id: 'x', side: 'lu', x: 6, y: 5, loyalty: 0, troops: 100 }] })
      return u(act(s, { type: 'sway', unit: 'q', target: 'x' }).state, 'x').side
    })
    expect(joined).toContain('han')
    expect(joined.every((side) => side === 'han' || side === 'lu')).toBe(true)
  })
})

describe('R2-TIME-1 timeline', () => {
  it('R2-TIME-1 terrain: a unit on a tile that becomes impassable is pushed to the nearest free passable tile (row-major tie-break)', () => {
    const map = ['............', '............', '............', '............', '.....w......', '.....b......', '.....w......', ...Array(5).fill('............')]
    let s = mk2({
      map,
      units: [{ id: 'a', side: 'han', x: 5, y: 5 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      timeline: [{ round: 1, phase: 'end', kind: 'terrain', tiles: [[5, 5]], to: 'water' }],
    })
    s = endPhases(s, 1)
    const r = act(s, { type: 'endPhase' })
    expect(ev(r.events, 'terrainChanged')).toEqual([{ kind: 'terrainChanged', tiles: [{ x: 5, y: 5 }], to: 'water', cause: 'timeline' }])
    const pushed = ev(r.events, 'moved')
    expect(pushed).toHaveLength(1)
    expect([u(r.state, 'a').x, u(r.state, 'a').y]).toEqual([4, 5]) // west before east (row-major)
    expect(r.state.grid.tiles[5 * 12 + 5]!.terrain).toBe('water')
  })

  it('R2-TIME-1 terrain: with no passable free tile left the unit is routed', () => {
    const t = mk2({
      w: 4, h: 4, map: ['.www', 'wwww', 'wbww', 'www.'],
      units: [{ id: 'a', side: 'han', x: 1, y: 2 }, { id: 'ally', side: 'han', x: 0, y: 0, commander: true }, { id: 'e', side: 'cao', x: 3, y: 3, commander: true }],
      timeline: [{ round: 1, phase: 'end', kind: 'terrain', tiles: [[1, 2]], to: 'water' }],
      noAutoCommander: true,
    })
    const r = act(endPhases(t, 1), { type: 'endPhase' })
    expect(ev(r.events, 'routed')).toEqual([{ kind: 'routed', unit: 'a', side: 'han' }])
    expect(r.state.defeated).toEqual(['a'])
  })

  it('R2-TIME-1 terrain: start items fire when the round begins, end items after the fire step', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      timeline: [
        { round: 1, phase: 'end', kind: 'message', text: 'end of one' },
        { round: 2, phase: 'start', kind: 'message', text: 'start of two' },
      ],
    })
    const r = act(endPhases(s, 1), { type: 'endPhase' })
    const k = r.events.map((e) => (e.kind === 'timelineMessage' ? `msg:${e.text}` : e.kind))
    expect(k).toEqual(['msg:end of one', 'roundStarted', 'msg:start of two', 'phaseStarted'])
  })

  it('R2-TIME-1 round-1 start items run during createBattle and are kept in state.opening', () => {
    const s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      timeline: [
        { round: 1, phase: 'start', kind: 'message', text: 'hello' },
        { round: 1, phase: 'start', kind: 'terrain', tiles: [[4, 4]], to: 'wall' },
      ],
    })
    expect(s.opening.map((e) => e.kind)).toEqual(['timelineMessage', 'terrainChanged'])
    expect(s.grid.tiles[4 * 12 + 4]!.terrain).toBe('wall')
    expect(createBattle('proving-ground', 1).opening).toEqual([{ kind: 'timelineMessage', text: 'The proving ground is open.', round: 1 }])
  })

  it('R2-TIME-1 wind overrides the schedule until the next schedule entry', () => {
    let s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      wind: [{ round: 1, dir: 'E', strength: 'breeze' }, { round: 4, dir: 'N', strength: 'gale' }],
      timeline: [{ round: 2, phase: 'start', kind: 'wind', dir: 'W', strength: 'gale' }],
      turnLimit: 6,
    })
    const wind = () => [s.wind.dir, s.wind.strength]
    expect(wind()).toEqual(['E', 'breeze'])
    s = endPhases(s, 2)
    expect(s.round).toBe(2)
    expect(wind()).toEqual(['W', 'gale'])
    s = endPhases(s, 2)
    expect(s.round).toBe(3)
    expect(wind()).toEqual(['W', 'gale']) // no schedule entry yet
    const r = act(endPhases(s, 1), { type: 'endPhase' })
    expect(s.round).toBe(3)
    expect(ev(r.events, 'windChanged')).toEqual([{ kind: 'windChanged', dir: 'N', strength: 'gale', round: 4 }])
  })

  it('R2-TIME-1 ignite sets flammable tiles burning; gate -> road opens the gate', () => {
    let s = mk2({
      map: ['............', '..f.........', '............', '.....G......', ...Array(8).fill('............')],
      gateOwner: 'cao',
      units: [{ id: 'a', side: 'han', x: 3, y: 2, type: 'cavalry' }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      timeline: [
        { round: 1, phase: 'end', kind: 'ignite', tiles: [[2, 1], [3, 1]] },
        { round: 2, phase: 'end', kind: 'terrain', tiles: [[5, 3]], to: 'road' },
      ],
    })
    expect(query.moveRange(s, 'a').some((m) => m.x === 5 && m.y === 3)).toBe(false) // closed gate
    const r = act(endPhases(s, 1), { type: 'endPhase' })
    s = r.state
    expect(ev(r.events, 'ignited').map((e) => [e.x, e.y, e.by])).toEqual([[2, 1, 'timeline'], [3, 1, 'timeline']])
    expect(s.burn[1 * 12 + 2]).toBeGreaterThan(0)
    s = endPhases(s, 3)
    expect(s.grid.tiles[3 * 12 + 5]!.terrain).toBe('road')
    expect(query.moveRange(s, 'a').some((m) => m.x === 5 && m.y === 3)).toBe(true)
  })

  it('R2-TIME-1 query.timelinePreview lists the next open items (hidden ones and the past are left out)', () => {
    let s = mk2({
      units: [{ id: 'a', side: 'han', x: 1, y: 1 }, { id: 'e', side: 'cao', x: 10, y: 10 }],
      reinforcements: [{ round: 3, side: 'cao', units: [{ id: 'r', side: 'cao', x: 0, y: 0 }], entry: [[9, 9]] }],
      timeline: [
        { round: 2, phase: 'end', kind: 'terrain', tiles: [[4, 4], [4, 5]], to: 'shallows' },
        { round: 2, phase: 'start', kind: 'message', text: 'a secret', hidden: true },
        { round: 4, phase: 'start', kind: 'message', text: 'later' },
      ],
    })
    expect(query.timelinePreview(s).map((i) => [i.round, i.phase, i.kind])).toEqual([[2, 'end', 'terrain'], [3, 'start', 'reinforcement'], [4, 'start', 'message']])
    s = endPhases(s, 2)
    expect(query.timelinePreview(s).map((i) => i.kind)).toEqual(['terrain', 'reinforcement', 'message'])
    s = endPhases(s, 2)
    expect(query.timelinePreview(s).map((i) => i.kind)).toEqual(['reinforcement', 'message'])
  })

  it('R2-TIME-1 the proving ground floods, opens its gate and destroys its bridge on schedule', () => {
    let s = createBattle('proving-ground', 4)
    const t = (x: number, y: number) => s.grid.tiles[y * s.grid.width + x]!.terrain
    expect(t(8, 5)).toBe('gate')
    s = endPhases(s, 6)
    expect(t(10, 10)).toBe('shallows') // round 3 end
    s = endPhases(s, 2)
    expect(t(8, 5)).toBe('road') // round 4 end
    s = endPhases(s, 4)
    expect(t(13, 7)).toBe('water') // round 6 end
  })
})
