import { describe, expect, it } from 'vitest'
import { checkInvariants, unitBudget } from '../../tools/invariants'
import { chooseAction, makePolicyRng } from '../../tools/policy'
import { ALL_BATTLES, ARC, CAMPAIGN, GAME_DATA, getBattleDef, listBattleIds, validateData } from '../../src/data'
import { SCENES } from '../../src/data/scenes'
import { createBattle, legalActions, replay, step, type Action, type BattleState } from '../../src/engine'
import { isDeepStrictEqual } from 'node:util'

// docs/spec/14-campaign-battles.md: W/I/L/C, type
const TABLE: [string, number, number, number, number, string][] = [
  ['liu-bei', 72, 74, 78, 98, 'infantry'], ['guan-yu', 97, 75, 95, 85, 'cavalry'], ['zhang-fei', 98, 30, 85, 45, 'infantry'],
  ['jian-yong', 40, 72, 50, 80, 'archers'], ['zou-jing', 55, 60, 70, 60, 'archers'], ['gong-jing', 50, 55, 60, 60, 'infantry'],
  ['gongsun-zan', 80, 60, 78, 70, 'cavalry'], ['zhao-yun', 96, 76, 90, 82, 'cavalry'], ['tao-qian', 25, 58, 40, 75, 'infantry'],
  ['mi-zhu', 30, 70, 45, 85, 'infantry'], ['sun-qian', 35, 72, 48, 82, 'archers'], ['cao-cao', 72, 94, 98, 96, 'cavalry'],
  ['guan-ping', 78, 60, 72, 65, 'infantry'], ['zhuge-liang', 38, 100, 92, 95, 'archers'], ['xiahou-dun', 92, 58, 88, 70, 'cavalry'],
  ['xiahou-yuan', 90, 55, 85, 66, 'archers'], ['cao-ren', 86, 62, 90, 68, 'infantry'], ['yu-jin', 80, 66, 85, 58, 'infantry'],
  ['dian-wei', 98, 30, 60, 50, 'infantry'], ['xu-chu', 97, 32, 66, 45, 'infantry'], ['zhang-he', 90, 68, 86, 60, 'cavalry'],
  ['li-dian', 76, 72, 76, 60, 'infantry'], ['lu-bu', 100, 28, 90, 40, 'cavalry'], ['chen-gong', 52, 92, 75, 64, 'archers'],
  ['gao-shun', 86, 50, 88, 55, 'infantry'], ['zhang-liao', 93, 78, 94, 76, 'cavalry'], ['li-jue', 76, 32, 60, 30, 'cavalry'],
  ['guo-si', 74, 30, 58, 28, 'cavalry'], ['zhang-liang', 80, 60, 72, 66, 'infantry'], ['zhang-bao', 70, 78, 62, 60, 'archers'],
  ['zhou-yu', 76, 96, 96, 90, 'archers'], ['huang-gai', 80, 68, 82, 72, 'infantry'], ['gan-ning', 94, 62, 82, 55, 'cavalry'],
  ['cai-mao', 66, 70, 74, 40, 'archers'],
]

describe('v2 data: officers, stratagems, registry', () => {
  it('R2-DATA-1 every officer of the 14-campaign-battles table is in officers.json with its numbers and type', () => {
    for (const [id, w, i, l, c, type] of TABLE) {
      const o = GAME_DATA.officers[id]
      expect(o, id).toBeDefined()
      expect([o!.war, o!.int, o!.lead, o!.cha, o!.type], id).toEqual([w, i, l, c, type])
    }
  })

  it('R2-DATA-1 growth, learns and recruitable follow the table', () => {
    const g = (id: string) => GAME_DATA.officers[id]!
    expect(g('guan-yu').growth).toEqual({ war: 2, int: 1, lead: 2, cha: 1 })
    expect(g('zhang-fei').growth).toMatchObject({ war: 2, lead: 2 })
    expect(g('zhao-yun').growth).toMatchObject({ war: 2, lead: 2 })
    expect(g('zhuge-liang').growth).toMatchObject({ int: 2, lead: 2 })
    expect(g('liu-bei').growth).toEqual({ war: 1, int: 1, lead: 2, cha: 1 })
    const learns = (id: string) => (g(id).learns ?? []).map((l) => `${l.level}:${l.strat}`)
    expect(learns('liu-bei')).toEqual(['4:benevolent-banner'])
    expect(learns('guan-yu')).toEqual(['5:green-dragon-cleave'])
    expect(learns('zhang-fei')).toEqual(['5:bridge-roar'])
    expect(learns('jian-yong')).toEqual(['3:kindling'])
    expect(learns('zhao-yun')).toEqual(['6:lone-rider'])
    expect(learns('zhuge-liang')).toEqual(['7:borrow-the-wind'])
    expect(g('zhuge-liang').stratagems).toEqual(['valley-blaze', 'eight-trigrams'])
    expect(learns('mi-zhu')).toEqual(['3:supply-train'])
    expect(learns('sun-qian')).toEqual(['3:envoys-tongue'])
    expect(learns('guan-ping')).toEqual(['4:fathers-shadow'])
    expect(g('guan-ping').bonds).toContain('guan-yu')
    expect(TABLE.filter(([id]) => g(id).recruitable).map(([id]) => id).sort()).toEqual(['chen-gong', 'gao-shun'])
    expect(g('zhang-liao').recruitable).toBeUndefined()
  })

  it('R2-DATA-1 every learnable stratagem plus call-the-storm and fire-ships exists with the specified shape', () => {
    const s = GAME_DATA.stratagems
    expect(s['benevolent-banner']).toMatchObject({ tag: 'Command', cost: 4, range: { min: 0, max: 2 }, area: 'aura', effect: { type: 'buff', stat: 'lead', amount: 10, rounds: 2 } })
    expect(s['green-dragon-cleave']).toMatchObject({ tag: 'Strike', cost: 5, power: 1.8, stat: 'war', follows: ['Strike', 'Volley', 'Shout', 'Charge'] })
    expect(s['bridge-roar']).toMatchObject({ tag: 'Shout', cost: 5, range: { min: 0, max: 2 }, area: 'ring2', power: 0.3, effect: { type: 'confuse' }, also: { type: 'provoke' }, follows: ['Strike', 'Charge'] })
    expect(s['kindling']).toMatchObject({ tag: 'Fire', cost: 3, range: { min: 1, max: 2 }, area: 'single', power: 0.6, stat: 'int', effect: { type: 'ignite' } })
    expect(s['lone-rider']).toMatchObject({ tag: 'Charge', cost: 5, range: { min: 2, max: 4 }, power: 1.4, effect: { type: 'dash' } })
    expect(s['valley-blaze']).toMatchObject({ tag: 'Fire', cost: 6, range: { min: 2, max: 4 }, area: 'cross', power: 1.1, stat: 'int', effect: { type: 'ignite' }, follows: ['Volley', 'Fire', 'Ruse'] })
    expect(s['eight-trigrams']).toMatchObject({ tag: 'Command', cost: 4, effect: { type: 'buff', stat: 'lead', amount: 15, rounds: 2 } })
    expect(s['borrow-the-wind']).toMatchObject({ tag: 'Command', cost: 6, area: 'self', effect: { type: 'wind', dir: 'toward-target', strength: 'gale', rounds: 3 } })
    expect(s['supply-train']).toMatchObject({ tag: 'Command', cost: 4, effect: { type: 'heal', pct: 10 } })
    expect(s['envoys-tongue']).toMatchObject({ tag: 'Ruse', cost: 3, range: { min: 1, max: 3 }, effect: { type: 'confuse' }, follows: ['Shout', 'Fire'] })
    expect(s['fathers-shadow']).toMatchObject({ tag: 'Strike', cost: 3, power: 1.3, follows: ['Strike', 'Charge'] })
    expect(s['call-the-storm']).toMatchObject({ tag: 'Command', cost: 6, effect: { type: 'wind', dir: 'toward-target', strength: 'gale', rounds: 2 } })
    expect(s['fire-ships']).toMatchObject({ tag: 'Fire', cost: 4, range: { min: 1, max: 1 }, area: 'cross', power: 1.2, stat: 'war', effect: { type: 'ignite' } })
  })

  it('R2-DATA-2 the registry holds the nine arc battles plus the proving ground; the arc order matches campaign.json', () => {
    expect(ARC).toEqual(['daxing-hill', 'qingzhou', 'guangzong', 'hulao-gate', 'xuzhou', 'xiapi', 'bowang', 'changban', 'red-cliffs'])
    expect(listBattleIds().sort()).toEqual([...ARC, 'proving-ground'].sort())
    for (const id of ARC) expect(SCENES[id], id).toBeDefined()
    expect([CAMPAIGN.prologue, CAMPAIGN.epilogue].every((id) => SCENES[id])).toBe(true)
    expect(CAMPAIGN.startRoster).toEqual([{ officerId: 'liu-bei', level: 3 }, { officerId: 'guan-yu', level: 3 }, { officerId: 'zhang-fei', level: 3 }])
    expect(CAMPAIGN.story['daxing-hill']!.joins).toEqual(['jian-yong'])
  })

  it('R2-DATA-2 stubs are marked, valid and playable; the real battles are not stubs', () => {
    const stubs = ARC.filter((id) => getBattleDef(id)!.stub)
    expect(stubs).toEqual(ARC.slice(1))
    expect(getBattleDef('daxing-hill')!.stub).toBeUndefined()
    for (const id of stubs) expect(SCENES[id]!.stub, id).toBe(true)
    expect(SCENES.prologue!.stub).toBe(true)
  })

  it('R2-DATA-3 the validator is clean on all shipped data', () => {
    expect(validateData()).toEqual([])
  })

  it('R2-DATA-3 Daxing Hill carries the campaign fields without changing its default behaviour', () => {
    const d = getBattleDef('daxing-hill')!
    expect(d.deploySlots).toBe(5)
    expect(d.required).toEqual(['liu-bei', 'guan-yu', 'zhang-fei'])
    expect(d.playerStarts!.length).toBeGreaterThanOrEqual(5)
    expect(d.guests!.map((g) => g.id)).toEqual(['zou-jing', 'jian-yong'])
    expect(d.defaultDeploy).toEqual(['liu-bei', 'guan-yu', 'zhang-fei'])
    expect(d.joins!.map((j) => j.officer)).toEqual(['jian-yong'])
    expect(d.objectives).toBeUndefined()
    expect(d.par).toBeGreaterThan(0)
  })

  it('R2-DATA-3 the proving ground exercises every v2 mechanic', () => {
    const d = getBattleDef('proving-ground')!
    const terrains = new Set(Object.values(d.legend))
    for (const t of ['wall', 'rampart', 'gate', 'shallows', 'reeds', 'deck', 'water', 'bridge']) expect(terrains.has(t as never), t).toBe(true)
    expect(d.gateOwner).toBe('cao')
    expect(d.reinforcements!.map((r) => r.side).sort()).toEqual(['cao', 'han'])
    expect(d.timeline!.map((t) => t.kind).sort()).toEqual(['ignite', 'message', 'message', 'terrain', 'terrain', 'terrain', 'wind'])
    expect(d.objectives!.win.map((c) => c.type)).toContain('escape')
    expect(d.units.some((u) => u.retreatAt !== undefined)).toBe(true)
    expect(d.playerStarts!.some((s) => s.arrivesRound !== undefined)).toBe(true)
    expect(d.playerStarts!.some((s) => s.ambush)).toBe(true)
    expect(d.officers!.some((o) => o.stratagems.includes('call-the-storm'))).toBe(true)
  })

  it('R2-DATA-3 every battle in the registry builds, replays and keeps the invariants for a few random games', () => {
    for (const id of listBattleIds()) {
      for (const seed of [1, 2]) {
        const rnd = makePolicyRng(seed * 31)
        let s: BattleState = createBattle(id, seed)
        const total = unitBudget(s)
        const log: Action[] = []
        let guard = 0
        const bad: string[] = checkInvariants(s, total)
        while (!s.result && guard++ < 3000) {
          const a = chooseAction(s, rnd, legalActions(s))
          const r = step(s, a)
          if (!r.ok) throw new Error(`${id} seed ${seed}: ${r.code} ${r.message}`)
          log.push(a)
          s = r.state
          bad.push(...checkInvariants(s, total))
        }
        expect(bad, `${id} seed ${seed}`).toEqual([])
        expect(s.result, id).not.toBeNull()
        expect(isDeepStrictEqual(replay(id, seed, log), s), `${id} replay`).toBe(true)
      }
    }
  })
})

/** Run `f` against a temporarily edited registry entry, then restore it. */
function mutated(id: string, edit: (b: ReturnType<typeof structuredClone<typeof ALL_BATTLES[string]>>) => void): string[] {
  const original = ALL_BATTLES[id]!
  ALL_BATTLES[id] = structuredClone(original)
  try {
    edit(ALL_BATTLES[id]! as never)
    return validateData()
  } finally {
    ALL_BATTLES[id] = original
  }
}

describe('R2-DATA-4 validator catches content mistakes', () => {
  it('reinforcement and timeline tiles must be in bounds', () => {
    expect(mutated('proving-ground', (b) => { b.reinforcements![0]!.entry[0] = [99, 0] }).some((e) => /entry 99,0 out of bounds/.test(e))).toBe(true)
    expect(mutated('proving-ground', (b) => { (b.timeline![1] as { tiles: [number, number][] }).tiles[0] = [0, 99] }).some((e) => /timeline\[1\] tile 0,99 out of bounds/.test(e))).toBe(true)
  })
  it('objectives must reference existing units', () => {
    expect(mutated('qingzhou', (b) => { b.objectives!.win = [{ type: 'routUnits', units: ['nobody'] }] }).some((e) => /unknown unit nobody/.test(e))).toBe(true)
    expect(mutated('xuzhou', (b) => { b.objectives!.lose.push({ type: 'unitLost', unit: 'tao-qian' }) }).some((e) => /unknown unit tao-qian/.test(e))).toBe(true)
  })
  it('required officers must be deployable at that point of the arc, and playerStarts must cover deploySlots', () => {
    expect(mutated('qingzhou', (b) => { b.required!.push('zhuge-liang') }).some((e) => /zhuge-liang is not on the roster/.test(e))).toBe(true)
    expect(mutated('qingzhou', (b) => { b.playerStarts!.pop() }).some((e) => /shorter than deploySlots/.test(e))).toBe(true)
  })
  it('a recruitable officer may not be an enemy in a later arc battle', () => {
    const errs = mutated('red-cliffs', (b) => {
      b.units.push({ id: 'gao-shun', officer: 'gao-shun', side: 'cao', type: 'infantry', x: 5, y: 5, facing: 'W', troops: 1000, commander: false })
    })
    expect(errs.some((e) => /recruitable gao-shun appears as an enemy in red-cliffs/.test(e))).toBe(true)
  })
  it('battle-local ids must not collide with shared or other battles\' ids', () => {
    expect(mutated('qingzhou', (b) => { b.officers!.push({ ...GAME_DATA.officers['lu-bu']! }) }).some((e) => /collides with officers.json/.test(e))).toBe(true)
    expect(mutated('qingzhou', (b) => { b.officers!.push({ ...b.officers![0]!, id: 'gz-rebel-a' }) }).some((e) => /gz-rebel-a collides with battle/.test(e))).toBe(true)
    expect(mutated('qingzhou', (b) => { b.stratagems = [{ ...GAME_DATA.stratagems['kindling']! }] }).some((e) => /stratagem kindling collides/.test(e))).toBe(true)
  })
  it('gates need an owner, sides must match sideOrder, retreatAt must be a fraction', () => {
    expect(mutated('proving-ground', (b) => { delete b.gateOwner }).some((e) => /gate tiles but no gateOwner/.test(e))).toBe(true)
    expect(mutated('xuzhou', (b) => { b.sides![1]!.id = 'zzz' }).some((e) => /sides must describe exactly/.test(e))).toBe(true)
    expect(mutated('hulao-gate', (b) => { b.units[1]!.retreatAt = 1.5 }).some((e) => /retreatAt/.test(e))).toBe(true)
  })
  it('units may not start on walls or share a tile', () => {
    expect(mutated('proving-ground', (b) => { b.units[0]!.x = 8; b.units[0]!.y = 0 }).some((e) => /impassable wall/.test(e))).toBe(true)
    expect(mutated('xuzhou', (b) => { b.units[1]!.x = b.units[0]!.x; b.units[1]!.y = b.units[0]!.y }).some((e) => /two units start on/.test(e))).toBe(true)
  })
})
