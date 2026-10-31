import { describe, expect, it } from 'vitest'
import {
  DRILL_COST, MUSTER_COST, PREBATTLE_KEY, SAVE_KEY, addXp, applyBattleResult, campaignBattleOptions, clearCampaign, createMemoryStorage,
  deployList, drill, loadCampaign, loadPrebattle, makeRecord, muster, newCampaign, recordOf, retryBattle, saveCampaign, savePrebattle,
  xpFromLog, type CampaignState, type KeyValueStorage,
} from '../../src/campaign'
import { ARC } from '../../src/data'
import { createBattle, legalActions, step, type Action, type BattleState, type GameEvent } from '../../src/engine'
import { chooseAction, makePolicyRng } from '../../tools/policy'

// ---------------------------------------------------------------- helpers
const dmg = (by: string, unit: string, amount = 100, source: 'attack' | 'counter' | 'stratagem' | 'fire' = 'attack'): GameEvent => ({
  kind: 'damaged', unit, amount, troopsBefore: 1000, troopsAfter: 1000 - amount, source, by,
})
const opener = (unit: string, strat = 'twin-blades'): GameEvent => ({ kind: 'stratagem', unit, strat, anchor: { x: 1, y: 1 }, tiles: [], cost: 3, link: 0 })
const link = (unit: string, from: string, k: number): GameEvent => ({ kind: 'chainLink', link: k, unit, strat: 'twin-blades', anchor: { x: 1, y: 1 }, tiles: [], cost: 3, from, bond: false, multiplier: 1.2 })
const routedEv = (unit: string, side: string, by?: string): GameEvent => ({ kind: 'routed', unit, side, ...(by ? { by } : {}) })

/** A finished copy of a real battle state: result, round, who was routed (removed from the board). */
function finish(s: BattleState, o: { won: boolean; round?: number; routed?: string[]; units?: BattleState['units'] }): BattleState {
  const routed = o.routed ?? []
  return {
    ...s,
    round: o.round ?? 8,
    result: { winner: o.won ? 'han' : s.sideOrder.find((x) => x !== 'han')!, reason: 'commander' },
    defeated: [...s.defeated, ...routed],
    units: (o.units ?? s.units).filter((u) => !routed.includes(u.id)),
  }
}
const daxing = (c: CampaignState) => createBattle(ARC[c.battleIndex]!, 1, campaignBattleOptions(c, { officers: [] }))
const rec = (c: CampaignState, id: string) => recordOf(c, id)!

describe('C-NEW campaign start', () => {
  it('C-NEW-1 newCampaign: the starting roster of campaign.json at level 3, no provisions, battle 1, JSON-serialisable', () => {
    const c = newCampaign(42, true)
    expect(c).toMatchObject({ version: 1, seed: 42, ironOath: true, battleIndex: 0, provisions: 0 })
    expect(c.roster.map((r) => [r.officerId, r.level, r.xp, r.maxTroops, r.wounded, r.status])).toEqual([
      ['liu-bei', 3, 0, 2000, false, 'active'], ['guan-yu', 3, 0, 2000, false, 'active'], ['zhang-fei', 3, 0, 2000, false, 'active'],
    ])
    expect(rec(c, 'liu-bei').stratagems).toEqual(['twin-blades', 'rally'])
    expect(JSON.parse(JSON.stringify(c))).toEqual(c)
    expect(newCampaign(1, false).ironOath).toBe(false)
  })
})

describe('C-XP experience from the battle log', () => {
  it('C-XP-1 +10 per normal attack that deals damage (counterstrikes and stratagem damage do not count)', () => {
    const log = [dmg('guan-yu', 'x'), dmg('guan-yu', 'y'), dmg('zhang-fei', 'x'), dmg('zhang-fei', 'x', 100, 'counter'), dmg('zhang-fei', 'x', 100, 'stratagem'), dmg('guan-yu', 'x', 100, 'fire')]
    expect(xpFromLog(log, 'han')).toEqual({ 'guan-yu': 20, 'zhang-fei': 10 })
  })
  it('C-XP-2 +15 per stratagem link performed (opener or chain link)', () => {
    const log = [opener('liu-bei'), link('guan-yu', 'liu-bei', 1), link('zhang-fei', 'guan-yu', 2), opener('guan-yu')]
    expect(xpFromLog(log, 'han')).toEqual({ 'liu-bei': 15, 'guan-yu': 30, 'zhang-fei': 15 })
  })
  it('C-XP-3 +30 per enemy unit routed (a retreat counts; routing an ally does not)', () => {
    const log: GameEvent[] = [
      routedEv('e1', 'yellow', 'guan-yu'), routedEv('e2', 'yellow', 'guan-yu'),
      { kind: 'retreated', unit: 'lubu', side: 'dong', x: 1, y: 1, by: 'zhang-fei' },
      routedEv('ally', 'han', 'guan-yu'), routedEv('e3', 'yellow'),
    ]
    expect(xpFromLog(log, 'han')).toEqual({ 'guan-yu': 60, 'zhang-fei': 30 })
  })
  it('C-XP-4 +25 per successful sway (a failed sway earns nothing)', () => {
    const log: GameEvent[] = [
      { kind: 'swayed', unit: 'liu-bei', target: 'gao', chance: 50, side: 'han' },
      { kind: 'swayFailed', unit: 'liu-bei', target: 'ma', chance: 20 },
    ]
    expect(xpFromLog(log, 'han')).toEqual({ 'liu-bei': 25 })
  })
  it('C-XP-5 the other side\'s actions earn nothing for `side`', () => {
    const log = [dmg('captain-gao', 'liu-bei'), opener('captain-gao'), routedEv('captain-gao', 'yellow'), dmg('guan-yu', 'captain-gao')]
    expect(xpFromLog(log, 'han')).toEqual({ 'guan-yu': 10 })
    // a unit whose side the log does not reveal counts for `side` unless the caller says otherwise
    expect(xpFromLog(log, 'yellow', (id) => (id === 'guan-yu' ? 'han' : undefined))).toEqual({ 'captain-gao': 25 })
  })
  it('C-XP-6 +20 for being on the field when the battle is won; routed officers miss it', () => {
    const c = newCampaign(1, false)
    const final = finish(daxing(c), { won: true, routed: ['zhang-fei'] })
    const { report } = applyBattleResult(c, final, [])
    const bonus = Object.fromEntries(report.xp.map((x) => [x.officerId, x.parts.survived]))
    expect(bonus).toEqual({ 'liu-bei': 20, 'guan-yu': 20, 'zhang-fei': 0 })
  })
})

describe('C-LV levels, growth and learning', () => {
  it('C-LV-1 100 XP per level, the remainder carries over, several levels at once', () => {
    const r = makeRecord('liu-bei', 3)
    expect(addXp(r, 99).rec).toMatchObject({ level: 3, xp: 99 })
    const up = addXp(addXp(r, 99).rec, 1)
    expect(up.rec).toMatchObject({ level: 4, xp: 0 })
    expect(up.levelUps).toHaveLength(1)
    const big = addXp(r, 250)
    expect(big.rec).toMatchObject({ level: 5, xp: 50 })
    expect(big.levelUps.map((l) => [l.from, l.to])).toEqual([[3, 4], [4, 5]])
  })
  it('C-LV-2 levels run 1..10: no XP is kept at the top', () => {
    const top = addXp(makeRecord('zhang-fei', 9), 5000)
    expect(top.rec).toMatchObject({ level: 10, xp: 0 })
    expect(top.levelUps).toHaveLength(1)
    expect(makeRecord('zhang-fei', 99).level).toBe(10)
    expect(makeRecord('zhang-fei', 0).level).toBe(1)
  })
  it('C-LV-3 per level: the officer\'s growth (default 1/1/1/1) and +100 max troops, each stat capped at 100', () => {
    const g = addXp(makeRecord('guan-yu', 3), 100).rec
    expect(g.statBonus).toEqual({ war: 2, int: 1, lead: 2, cha: 1 })
    expect(g.maxTroops).toBe(2100)
    const d = addXp(makeRecord('jian-yong', 3), 100).rec
    expect(d.statBonus).toEqual({ war: 1, int: 1, lead: 1, cha: 1 })
    // Zhuge Liang: int 100 is already the cap
    const z = addXp(makeRecord('zhuge-liang', 3), 300).rec
    expect(z.statBonus.int).toBe(0)
    expect(z.statBonus.lead).toBe(6) // 92 + 6 = 98, still under the cap
    const capped = addXp({ ...makeRecord('guan-yu', 3), statBonus: { war: 2, int: 0, lead: 4, cha: 0 } }, 100).rec
    expect(capped.statBonus.war).toBe(3) // 97 + 2 would be 99... grows 2 -> war 3 (97+3=100)
    expect(capped.statBonus.lead).toBe(5) // 95 + 5 = 100 (growth 2 clipped to 1)
  })
  it('C-LV-4 learning: reaching the level adds the stratagem; a record made at a higher level already knows earlier ones', () => {
    expect(addXp(makeRecord('liu-bei', 3), 100)).toMatchObject({ rec: { stratagems: ['twin-blades', 'rally', 'benevolent-banner'] } })
    const lu = addXp(makeRecord('liu-bei', 3), 100).levelUps[0]!
    expect(lu.learned).toEqual(['benevolent-banner'])
    expect(addXp(makeRecord('guan-yu', 4), 100).rec.stratagems).toEqual(['crescent-sweep', 'thundering-charge', 'green-dragon-cleave'])
    expect(addXp(makeRecord('zhang-fei', 4), 100).rec.stratagems).toContain('bridge-roar')
    expect(makeRecord('jian-yong', 5).stratagems).toContain('kindling')
    expect(makeRecord('jian-yong', 2).stratagems).not.toContain('kindling')
    // skipping across two learn levels in one go
    expect(addXp(makeRecord('zhuge-liang', 5), 300).rec.stratagems).toEqual(['valley-blaze', 'eight-trigrams', 'borrow-the-wind'])
  })
})

describe('C-DEP deploying the roster', () => {
  it('C-DEP-1 wounded officers start at 50% troops, others at max; statBonus and level carry', () => {
    let c = newCampaign(1, false)
    c = { ...c, roster: c.roster.map((r) => (r.officerId === 'guan-yu' ? { ...r, wounded: true, statBonus: { war: 3, int: 0, lead: 0, cha: 0 }, maxTroops: 2300, level: 5 } : r)) }
    const o = campaignBattleOptions(c, { officers: ['guan-yu', 'zhang-fei'] })
    const by = Object.fromEntries(o.deploy!.map((d) => [d.officerId, d]))
    expect(by['guan-yu']).toMatchObject({ troops: 1150, maxTroops: 2300, level: 5, statBonus: { war: 3, int: 0, lead: 0, cha: 0 } })
    expect(by['zhang-fei']).toMatchObject({ troops: 2000, maxTroops: 2000 })
    const s = createBattle('daxing-hill', 1, o)
    expect(s.units.find((u) => u.id === 'guan-yu')).toMatchObject({ troops: 1150, maxTroops: 2300 })
    expect(s.data.officers['guan-yu']!.war).toBe(100) // 97 + 3
  })
  it('C-DEP-2 required officers come first; the choice fills the remaining slots in order up to deploySlots; inactive officers are skipped', () => {
    let c = newCampaign(1, false)
    c = { ...c, battleIndex: 2, roster: [...c.roster, makeRecord('jian-yong', 3), { ...makeRecord('mi-zhu', 3), status: 'fallen' }, { ...makeRecord('sun-qian', 3), status: 'departed' }] }
    expect(deployList(c, { officers: ['jian-yong', 'mi-zhu', 'sun-qian', 'zhang-fei', 'guan-yu'] })).toEqual(['liu-bei', 'jian-yong', 'zhang-fei', 'guan-yu']) // guangzong: 4 slots, only liu-bei required
    expect(deployList(c, { officers: [] })).toEqual(['liu-bei'])
    expect(deployList(c, { officers: ['liu-bei', 'liu-bei', 'guan-yu'] })).toEqual(['liu-bei', 'guan-yu'])
    // qingzhou requires all four so that the deploy list order is fixed (slots 2 and 3 are the brothers who arrive in round 3)
    expect(deployList({ ...c, battleIndex: 1 }, { officers: ['zhang-fei'] })).toEqual(['liu-bei', 'jian-yong', 'guan-yu', 'zhang-fei'])
  })
  it('C-DEP-3 at most 3 stratagems are carried: the chosen ones the officer knows, else the first three', () => {
    let c = newCampaign(1, false)
    c = { ...c, roster: c.roster.map((r) => (r.officerId === 'zhang-fei' ? { ...r, stratagems: ['serpent-thrust', 'thunder-roar', 'bridge-roar', 'mob-rush'] } : r)) }
    const d = (choice: Record<string, string[]>) => campaignBattleOptions(c, { officers: ['zhang-fei'], stratagems: choice }).deploy!.find((x) => x.officerId === 'zhang-fei')!.stratagems
    expect(d({})).toEqual(['serpent-thrust', 'thunder-roar', 'bridge-roar'])
    expect(d({ 'zhang-fei': ['bridge-roar', 'mob-rush'] })).toEqual(['bridge-roar', 'mob-rush'])
    expect(d({ 'zhang-fei': ['mob-rush', 'bridge-roar', 'serpent-thrust', 'thunder-roar'] })).toEqual(['mob-rush', 'bridge-roar', 'serpent-thrust'])
    expect(d({ 'zhang-fei': ['twin-blades'] })).toEqual(['serpent-thrust', 'thunder-roar', 'bridge-roar']) // not known: ignored
    const s = createBattle('daxing-hill', 1, campaignBattleOptions(c, { officers: ['zhang-fei'], stratagems: { 'zhang-fei': ['bridge-roar'] } }))
    expect(s.data.officers['zhang-fei']!.stratagems).toEqual(['bridge-roar'])
  })
})

describe('C-RES applying a finished battle', () => {
  it('C-RES-1 a win: XP from the log plus survival, battle index advances, provisions = 100 + 10 per rout + 5 per round under par', () => {
    const c = newCampaign(7, false)
    const final = finish(daxing(c), { won: true, round: 7 }) // Daxing par is 10
    const log = [dmg('guan-yu', 'e'), dmg('guan-yu', 'e'), routedEv('e', 'yellow', 'guan-yu'), routedEv('f', 'yellow', 'zhang-fei'), opener('liu-bei')]
    const { state, report } = applyBattleResult(c, final, log)
    expect(report.won).toBe(true)
    expect(state.battleIndex).toBe(1)
    expect(report.provisions).toEqual({ victory: 100, routed: 20, underPar: 15, total: 135 })
    expect(state.provisions).toBe(135)
    expect(report.xp.find((x) => x.officerId === 'guan-yu')).toMatchObject({ gained: 20 + 30 + 20 })
    expect(report.xp.find((x) => x.officerId === 'zhang-fei')!.gained).toBe(30 + 20)
    expect(report.xp.find((x) => x.officerId === 'liu-bei')!.gained).toBe(15 + 20)
    expect(rec(state, 'guan-yu').xp).toBe(70)
    expect(state.stats).toMatchObject({ battlesWon: 1, foesRouted: 2, bestChain: 1 })
    expect(c.battleIndex).toBe(0) // the input state is untouched
  })
  it('C-RES-2 taking longer than par earns no round bonus (never negative)', () => {
    const c = newCampaign(7, false)
    const { report } = applyBattleResult(c, finish(daxing(c), { won: true, round: 15 }), [])
    expect(report.provisions.underPar).toBe(0)
    expect(report.provisions.total).toBe(100)
  })
  it('C-RES-3 level-ups are reported with the stratagem learned', () => {
    let c = newCampaign(1, false)
    c = { ...c, roster: c.roster.map((r) => (r.officerId === 'liu-bei' ? { ...r, xp: 90 } : r)) }
    const { report, state } = applyBattleResult(c, finish(daxing(c), { won: true }), [])
    const line = report.xp.find((x) => x.officerId === 'liu-bei')!
    expect(line.levelUps).toHaveLength(1)
    expect(line.levelUps[0]).toMatchObject({ from: 3, to: 4, learned: ['benevolent-banner'] })
    expect(rec(state, 'liu-bei').stratagems).toContain('benevolent-banner')
  })
  it('C-RES-4 Iron Oath off: a routed officer comes back wounded (50% next battle); the flag is cleared after that battle', () => {
    const c0 = newCampaign(1, false)
    const w = applyBattleResult(c0, finish(daxing(c0), { won: true, routed: ['guan-yu'] }), [])
    expect(w.report.wounded).toEqual(['guan-yu'])
    expect(rec(w.state, 'guan-yu')).toMatchObject({ wounded: true, status: 'active' })
    const next = campaignBattleOptions(w.state, { officers: ['guan-yu'] })
    expect(next.deploy!.find((d) => d.officerId === 'guan-yu')!.troops).toBe(1000)
    const second = applyBattleResult(w.state, finish(createBattle('qingzhou', 1, next), { won: true }), [])
    expect(rec(second.state, 'guan-yu').wounded).toBe(false)
  })
  it('C-RES-5 Iron Oath on: a routed officer in a won battle is fallen for good and cannot be deployed', () => {
    const c0 = newCampaign(1, true)
    const r = applyBattleResult(c0, finish(daxing(c0), { won: true, routed: ['zhang-fei'] }), [])
    expect(r.report.fallen).toEqual(['zhang-fei'])
    expect(rec(r.state, 'zhang-fei').status).toBe('fallen')
    expect(r.state.stats.officersLost).toBe(1)
    expect(deployList(r.state, { officers: ['zhang-fei', 'guan-yu'] })).toEqual(['liu-bei', 'jian-yong', 'guan-yu']) // qingzhou requires the brothers; the fallen one is skipped
    expect(r.state.finished).toBeUndefined()
  })
  it('C-RES-6 a lost battle never kills anyone and changes nothing but the defeat count (retry from the pre-battle save)', () => {
    const c0 = newCampaign(1, true)
    const r = applyBattleResult(c0, finish(daxing(c0), { won: false, routed: ['guan-yu'] }), [dmg('guan-yu', 'e')])
    expect(r.report.won).toBe(false)
    expect(r.state.roster).toEqual(c0.roster)
    expect(r.state.battleIndex).toBe(0)
    expect(r.state.provisions).toBe(0)
    expect(r.state.stats.defeats).toBe(1)
    expect(r.state.finished).toBeUndefined()
  })
  it('C-RES-7 Iron Oath on and Liu Bei routed: the campaign records the fall (finished: lost); off: it does not', () => {
    const on = newCampaign(1, true)
    const lost = applyBattleResult(on, finish(daxing(on), { won: false, routed: ['liu-bei'] }), [])
    expect(lost.state.finished).toBe('lost')
    expect(lost.report.ironOathBroken).toBe(true)
    const off = newCampaign(1, false)
    expect(applyBattleResult(off, finish(daxing(off), { won: false, routed: ['liu-bei'] }), []).state.finished).toBeUndefined()
  })
  it('C-RES-8 a swayed named enemy with recruitable: true joins the roster; invented and non-recruitable officers do not', () => {
    let c = newCampaign(1, false)
    c = { ...c, battleIndex: 5 } // xiapi
    const s = createBattle('xiapi', 1, campaignBattleOptions(c, { officers: [] }))
    const swayed = (id: string): GameEvent => ({ kind: 'swayed', unit: 'liu-bei', target: id, chance: 50, side: 'han' })
    const flip = (ids: string[]) => ({ ...s, units: s.units.map((u) => (ids.includes(u.id) ? { ...u, side: 'han' } : u)) })
    const final = finish(flip(['gao-shun', 'chen-gong']), { won: true })
    const r = applyBattleResult(c, final, [swayed('gao-shun'), swayed('chen-gong')])
    expect(r.report.recruited.sort()).toEqual(['chen-gong', 'gao-shun'])
    expect(rec(r.state, 'gao-shun')).toMatchObject({ status: 'active', wounded: false })
    expect(rec(r.state, 'gao-shun').level).toBeGreaterThanOrEqual(1)
    expect(r.state.stats.swayed).toBe(2)
    // zhang-liao is named but not recruitable
    const z = applyBattleResult(c, finish(flip(['zhang-liao']), { won: true }), [swayed('zhang-liao')])
    expect(z.report.recruited).toEqual([])
    expect(recordOf(z.state, 'zhang-liao')).toBeUndefined()
    // recruitable but routed afterwards: not on the field, does not join
    const gone = applyBattleResult(c, finish(flip(['gao-shun']), { won: true, routed: ['gao-shun'] }), [swayed('gao-shun')])
    expect(recordOf(gone.state, 'gao-shun')).toBeUndefined()
    // an invented captain swayed in Daxing Hill never joins
    const d = newCampaign(1, false)
    const ds = createBattle('daxing-hill', 1, campaignBattleOptions(d, { officers: [] }))
    const dsw = { ...ds, units: ds.units.map((u) => (u.id === 'captain-gao' ? { ...u, side: 'han' } : u)) }
    expect(applyBattleResult(d, finish(dsw, { won: true }), [swayed('captain-gao')]).report.recruited).toEqual([])
  })
  it('C-RES-9 story joins and departures come from campaign.json and show in the report', () => {
    const c = newCampaign(1, false)
    const r1 = applyBattleResult(c, finish(daxing(c), { won: true }), [])
    expect(r1.report.joined).toEqual(['jian-yong'])
    expect(rec(r1.state, 'jian-yong')).toMatchObject({ status: 'active', wounded: false })
    expect(rec(r1.state, 'jian-yong').stratagems).toContain('fire-attack')
    // a departing roster officer is marked departed; non-roster departures (guests) are ignored
    let x = { ...r1.state, battleIndex: 4, roster: [...r1.state.roster, makeRecord('zhao-yun', 4)] }
    const r5 = applyBattleResult(x, finish(createBattle('xuzhou', 1, campaignBattleOptions(x, { officers: [] })), { won: true }), [])
    expect(r5.report.joined.sort()).toEqual(['mi-zhu', 'sun-qian'])
    expect(r5.report.departed).toEqual(['zhao-yun'])
    expect(rec(r5.state, 'zhao-yun').status).toBe('departed')
    x = { ...r1.state, battleIndex: 1 }
    const r2 = applyBattleResult(x, finish(createBattle('qingzhou', 1, campaignBattleOptions(x, { officers: [] })), { won: true }), [])
    expect(r2.report.departed).toEqual([]) // Zou Jing was a guest, never on the roster
  })
  it('C-RES-10 winning the last battle finishes the campaign; the camp counters reset after every win', () => {
    let c: CampaignState = { ...newCampaign(1, false), battleIndex: ARC.length - 1, camp: { drilled: ['liu-bei'], mustered: { 'liu-bei': 2 } } }
    const r = applyBattleResult(c, finish(createBattle('red-cliffs', 1, campaignBattleOptions(c, { officers: [] })), { won: true }), [])
    expect(r.state.finished).toBe('won')
    expect(r.state.camp).toEqual({ drilled: [], mustered: {} })
    c = newCampaign(1, false)
    expect(applyBattleResult(c, finish(daxing(c), { won: true }), []).state.finished).toBeUndefined()
  })
  it('C-RES-11 the longest chain of the log is kept as bestChain', () => {
    const c = newCampaign(1, false)
    const log = [opener('liu-bei'), opener('guan-yu'), link('zhang-fei', 'guan-yu', 1), link('liu-bei', 'zhang-fei', 2), opener('liu-bei')]
    expect(applyBattleResult(c, finish(daxing(c), { won: true }), log).state.stats.bestChain).toBe(3)
  })
  it('C-RES-12 end to end with real step() calls: deploy from the campaign, play a stub battle, apply the result', () => {
    let c = newCampaign(3, false)
    c = { ...c, battleIndex: 1, roster: [...c.roster, makeRecord('jian-yong', 3)] }
    let applied: ReturnType<typeof applyBattleResult> | null = null
    for (let seed = 1; seed <= 40 && !applied; seed++) {
      const opts = campaignBattleOptions(c, { officers: ['guan-yu', 'zhang-fei', 'jian-yong'] })
      let s = createBattle('qingzhou', seed, opts)
      const rnd = makePolicyRng(seed)
      const log: GameEvent[] = [...s.opening]
      let guard = 0
      while (!s.result && guard++ < 3000) {
        const a: Action = chooseAction(s, rnd, legalActions(s))
        const r = step(s, a)
        if (!r.ok) throw new Error(r.message)
        log.push(...r.events)
        s = r.state
      }
      if (s.result?.winner === 'han') applied = applyBattleResult(c, s, log)
    }
    expect(applied).not.toBeNull()
    expect(applied!.state.battleIndex).toBe(2)
    expect(applied!.report.provisions.total).toBeGreaterThanOrEqual(100)
    expect(applied!.report.xp.length).toBeGreaterThan(0)
    expect(applied!.report.xp.every((x) => ['liu-bei', 'guan-yu', 'zhang-fei', 'jian-yong'].includes(x.officerId))).toBe(true)
    expect(JSON.parse(JSON.stringify(applied!.state))).toEqual(applied!.state)
  })
})

describe('C-CAMP camp actions', () => {
  const rich = (): CampaignState => ({ ...newCampaign(1, false), provisions: 500 })
  it('C-CAMP-1 drill: 60 provisions for +50 XP, once per officer per camp', () => {
    const r = drill(rich(), 'guan-yu')
    if (!r.ok) throw new Error(r.reason)
    expect(r.state.provisions).toBe(500 - DRILL_COST)
    expect(rec(r.state, 'guan-yu').xp).toBe(50)
    const again = drill(r.state, 'guan-yu')
    expect(again).toEqual({ ok: false, reason: 'Already drilled in this camp' })
    expect(drill(r.state, 'zhang-fei').ok).toBe(true)
    expect(drill({ ...rich(), provisions: 59 }, 'guan-yu').ok).toBe(false)
    expect(drill(rich(), 'nobody').ok).toBe(false)
  })
  it('C-CAMP-2 drill can level an officer up and reports it', () => {
    let c = rich()
    c = { ...c, roster: c.roster.map((r) => (r.officerId === 'liu-bei' ? { ...r, xp: 60 } : r)) }
    const r = drill(c, 'liu-bei')
    if (!r.ok) throw new Error(r.reason)
    expect(r.levelUps).toHaveLength(1)
    expect(rec(r.state, 'liu-bei')).toMatchObject({ level: 4, xp: 10 })
  })
  it('C-CAMP-3 muster: 80 provisions for +200 max troops, at most twice per officer per camp', () => {
    let c = rich()
    for (let i = 0; i < 2; i++) {
      const r = muster(c, 'zhang-fei')
      if (!r.ok) throw new Error(r.reason)
      c = r.state
    }
    expect(rec(c, 'zhang-fei').maxTroops).toBe(2400)
    expect(c.provisions).toBe(500 - 2 * MUSTER_COST)
    expect(muster(c, 'zhang-fei').ok).toBe(false)
    expect(muster(c, 'guan-yu').ok).toBe(true)
    expect(muster({ ...rich(), provisions: 79 }, 'guan-yu').ok).toBe(false)
  })
  it('C-CAMP-4 fallen and departed officers cannot be drilled or mustered', () => {
    const c = rich()
    const f = { ...c, roster: c.roster.map((r) => (r.officerId === 'guan-yu' ? { ...r, status: 'fallen' as const } : r)) }
    expect(drill(f, 'guan-yu').ok).toBe(false)
    expect(muster(f, 'guan-yu').ok).toBe(false)
  })
  it('C-CAMP-5 mustered troops carry into the battle', () => {
    const r = muster(rich(), 'liu-bei')
    if (!r.ok) throw new Error(r.reason)
    const s = createBattle('daxing-hill', 1, campaignBattleOptions(r.state, { officers: [] }))
    expect(s.units.find((u) => u.id === 'liu-bei')).toMatchObject({ troops: 2200, maxTroops: 2200 })
  })
})

describe('C-SAVE storage, snapshots and retry', () => {
  it('C-SAVE-1 save and load round-trip through the injected storage under tkt.campaign.v1', () => {
    const st = createMemoryStorage()
    const c = { ...newCampaign(9, true), provisions: 77 }
    expect(saveCampaign(st, c)).toBe(true)
    expect(st.data.has('tkt.campaign.v1')).toBe(true)
    expect(SAVE_KEY).toBe('tkt.campaign.v1')
    expect(PREBATTLE_KEY).toBe('tkt.campaign.v1.prebattle')
    expect(loadCampaign(st)).toEqual({ ok: true, state: c })
    expect(loadCampaign(createMemoryStorage())).toEqual({ ok: false, reason: 'missing' })
  })
  it('C-SAVE-2 a different version is refused; corrupt JSON and wrong shapes are refused without throwing', () => {
    const st = createMemoryStorage()
    st.setItem(SAVE_KEY, JSON.stringify({ ...newCampaign(1, false), version: 2 }))
    expect(loadCampaign(st)).toEqual({ ok: false, reason: 'version' })
    st.setItem(SAVE_KEY, '{nope')
    expect(loadCampaign(st)).toEqual({ ok: false, reason: 'corrupt' })
    st.setItem(SAVE_KEY, JSON.stringify({ version: 1, seed: 'x' }))
    expect(loadCampaign(st)).toEqual({ ok: false, reason: 'corrupt' })
    st.setItem(SAVE_KEY, JSON.stringify({ ...newCampaign(1, false), roster: [{ officerId: 'liu-bei' }] }))
    expect(loadCampaign(st)).toEqual({ ok: false, reason: 'corrupt' })
  })
  it('C-SAVE-3 unavailable storage (null, or one that throws) never throws: the game just does not persist', () => {
    const boom: KeyValueStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    for (const st of [null, undefined, boom]) {
      expect(saveCampaign(st, newCampaign(1, false))).toBe(false)
      expect(loadCampaign(st).ok).toBe(false)
      expect(savePrebattle(st, newCampaign(1, false))).toBe(false)
      expect(retryBattle(st).ok).toBe(false)
      expect(() => clearCampaign(st)).not.toThrow()
    }
  })
  it('C-SAVE-4 retry restores the pre-battle snapshot written when the camp opened, and makes it the current save', () => {
    const st = createMemoryStorage()
    let c = { ...newCampaign(5, false), provisions: 300 }
    savePrebattle(st, c) // camp opens
    saveCampaign(st, c)
    // the player spends provisions, plays and loses
    const spent = drill(c, 'guan-yu')
    if (!spent.ok) throw new Error(spent.reason)
    c = spent.state
    saveCampaign(st, c)
    expect(loadCampaign(st)).toMatchObject({ ok: true, state: { provisions: 240 } })
    const back = retryBattle(st)
    expect(back).toMatchObject({ ok: true, state: { provisions: 300 } })
    expect(loadCampaign(st)).toMatchObject({ ok: true, state: { provisions: 300 } })
    expect(loadPrebattle(st).ok).toBe(true)
    clearCampaign(st)
    expect(loadCampaign(st).ok).toBe(false)
    expect(loadPrebattle(st).ok).toBe(false)
  })
})
