// Roads to War run layer (src/run), named by rule id (docs/spec/10-rules.md section 11).
import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../../src/campaign'
import { createBattle, type BattleState, type GameEvent } from '../../src/engine'
import {
  ERA1, RUN_SAVE_KEY, applyBattle, applyOutcome, battleOptions, beginRoad, capOf, checkDeploy, choiceView, choose, clearRun, dayRow,
  defaultDeploy, drawRoad, edgesFrom, finaleBriefing, finaleForecast, hireLevies, hud, legOptions, levyCost, loadAnnals, loadRun,
  makeCamp, marketMax, newRun, riceDays, roadView, saveRun, sealDeploy, sendHome, stopDef, stream, toFinaleDeploy, travel, upkeep,
  writeAnnal, P_FATE, type BattleOutcome, type DeployPick, type RunState,
} from '../../src/run'

const era = ERA1
const R = era.rules

/** A run standing at `stopId` (tier, stream index) with optional overrides. */
function atStop(stopId: string, over: Partial<RunState> = {}, tier = 3, index = 5): RunState {
  const s = newRun(11)
  return { ...s, phase: 'stop', stop: { id: stopId, tier, index }, path: [[tier, 0]], node: [tier, 0], stopIndex: index + 1, ...over }
}
/** A run waiting on deploy for a road battle. */
function atDeploy(over: Partial<RunState> = {}, battleId = 'daxing-hill'): RunState {
  const s = newRun(11)
  return {
    ...s, phase: 'deploy', node: [1, 0], path: [[0, 0], [1, 0]], stopIndex: 2,
    pending: { battleId, tier: 1, stopId: 'daxing-hill', choiceId: 'fight', win: { rice: 30, renown: 8, recruit: 'jian-yong' }, enemyScale: 0.85, index: 1 },
    ...over,
  }
}
const won = (over: Partial<BattleOutcome> = {}): BattleOutcome => ({ won: true, commanderRouted: false, lost: {}, routed: [], xp: {}, recruits: [], ...over })

/** A fixed policy for whole runs: the first payable choice that is not a battle (else the first), hire nobody, the first leg. */
function autoRun(seed: number, battle: (s: RunState) => BattleOutcome = () => won()): RunState {
  let s = beginRoad(era, newRun(seed))
  for (let guard = 0; guard < 200 && !s.end; guard++) {
    if (s.phase === 'stop') {
      const st = stopDef(era, s.stop!.id)
      const views = st.choices.map((c) => choiceView(era, s, st, c.id)).filter((v) => v.payable)
      const v = views.find((x) => x.kind !== 'battle') ?? views[0]!
      s = choose(era, s, v.id)
    } else if (s.phase === 'market') s = hireLevies(era, s, 0)
    else if (s.phase === 'road') s = travel(era, s, legOptions(era, s)[0]!.target)
    else if (s.phase === 'finale') s = toFinaleDeploy(era, s)
    else if (s.phase === 'deploy') {
      const p = defaultDeploy(era, s)
      const n = sealDeploy(era, s, p)
      if (n === s) break
      s = applyOutcome(era, n, battle(n)).state
    } else break
  }
  return s
}

describe('the run and the road', () => {
  it('[RL-RUN-1] a run starts with the era start state and its seed', () => {
    const s = newRun(42)
    expect(s.rice).toBe(50)
    expect(s.soldiers).toBe(1500)
    expect(s.wounded).toBe(0)
    expect(s.renown).toBe(30)
    expect(s.day).toBe(0)
    expect(s.band.map((o) => [o.rec.officerId, o.rec.level])).toEqual([['liu-bei', 3], ['guan-yu', 3], ['zhang-fei', 3]])
    expect(s.seed).toBe(42)
    expect(s.phase).toBe('prologue')
    const b = beginRoad(era, s)
    expect(b.phase).toBe('stop')
    expect(b.stop!.id).toBe('zhuo-notice')
  })

  it('[RL-ROAD-1] the road is drawn once from the seed: 7 or 8 tiers, the same for the same seed', () => {
    expect(drawRoad(era, 5)).toEqual(drawRoad(era, 5))
    const lens = new Set<number>()
    for (let sd = 1; sd <= 40; sd++) {
      const r = drawRoad(era, sd)
      lens.add(r.tiers.length)
      expect(r.tiers[0]).toEqual(['zhuo-notice'])
      expect(r.tiers[1]).toEqual(['daxing-hill'])
      expect(r.tiers[2]).toContain('qingzhou-relief')
    }
    expect([...lens].sort()).toEqual([7, 8])
  })

  it('[RL-ROAD-2] each stop at most once; aftermaths never on the road; an anchor partner is never a battle stop', () => {
    for (let sd = 1; sd <= 60; sd++) {
      const r = drawRoad(era, sd)
      const all = r.tiers.flat()
      expect(new Set(all).size).toBe(all.length)
      expect(all).not.toContain('dong-zhuo-snub')
      const partner = r.tiers[2]!.find((x) => x !== 'qingzhou-relief')!
      expect(era.road.battleStops).not.toContain(partner)
      expect(era.road.pools.early).toContain(partner)
      for (const id of r.tiers[r.tiers.length - 1]!) expect(era.road.pools.late).toContain(id)
    }
  })

  it('[RL-ROAD-3] same lane always connects; tier 0 reaches all of tier 1; the last tier leads to the finale', () => {
    for (let sd = 1; sd <= 30; sd++) {
      const r = drawRoad(era, sd)
      for (let t = 1; t < r.tiers.length - 1; t++)
        for (let l = 0; l < r.tiers[t]!.length; l++) {
          const to = r.tiers[t + 1]!.length === 1 ? 0 : l
          expect(r.edges.some((e) => e.kind === 'road' && e.from[0] === t && e.from[1] === l && e.to[0] === t + 1 && e.to[1] === to)).toBe(true)
        }
      expect(edgesFrom(r, [0, 0]).filter((e) => e.kind === 'road').length).toBe(r.tiers[1]!.length)
    }
    const s = { ...atStop('guangzong-eve'), phase: 'road' as const, node: [7, 0] as [number, number] }
    s.road = drawRoad(era, 3)
    s.node = [s.road.tiers.length - 1, 0]
    expect(legOptions(era, s).map((o) => o.target)).toEqual(['finale'])
    expect(legOptions(era, s)[0]!.days).toBe(2)
  })

  it('[RL-ROAD-4] legs are 1, 2 or 3 days and travelling one passes them with upkeep', () => {
    for (let sd = 1; sd <= 30; sd++) for (const e of drawRoad(era, sd).edges) if (e.kind === 'road') expect([1, 2, 3]).toContain(e.days)
    let s = beginRoad(era, newRun(9))
    s = choose(era, s, 'estate')
    s = hireLevies(era, s, 0)
    const leg = legOptions(era, s)[0]!
    const rice = s.rice
    const t = travel(era, s, leg.target)
    expect(t.day).toBe(s.day + leg.days)
    expect(t.rice).toBe(rice - leg.days * upkeep(era, s))
    expect(t.stop!.id).toBe('daxing-hill')
  })

  it('[RL-ROAD-5] the mountain path skips a tier, takes 2 days, costs 5% and cannot be force-marched', () => {
    const road = drawRoad(era, 4)
    const m = road.edges.filter((e) => e.kind === 'mountain')
    expect(m.length).toBeGreaterThan(0)
    for (const e of m) {
      expect(e.to[0]).toBe(e.from[0] + 2)
      expect(e.to[1]).toBe(e.from[1])
      expect(e.days).toBe(2)
    }
    const e = m[0]!
    const s: RunState = { ...newRun(4), road, phase: 'road', node: e.from, soldiers: 2000 }
    const o = legOptions(era, s).find((x) => x.kind === 'mountain')!
    expect(o.canMarch).toBe(false)
    expect(o.mountainLoss).toBe(100)
    const t = travel(era, s, o.target, true)
    expect(t.node).toEqual(e.to)
    expect(t.day).toBe(2)
    expect(t.soldiers).toBe(1900)
    expect(t.wounded).toBe(50)
    expect(t.tired).toBe(false)
  })

  it('[RL-ROAD-6] every mid tier holds a battle stop; the road shows two tiers ahead', () => {
    for (let sd = 1; sd <= 60; sd++) {
      const r = drawRoad(era, sd)
      const defs = era.road.tiers.filter((t) => r.long || !t.longOnly)
      defs.forEach((d, i) => {
        if (d.kind === 'mid') expect(r.tiers[i]!.some((id) => era.road.battleStops.includes(id))).toBe(true)
      })
    }
    const s = beginRoad(era, newRun(6))
    const v = roadView(era, s)
    expect(v.nodes.filter((n) => n.state === 'ahead').every((n) => n.tier <= 2)).toBe(true)
    expect(v.nodes.filter((n) => n.tier > 2).every((n) => n.state === 'hidden')).toBe(true)
  })
})

describe('rice, upkeep and the pool', () => {
  it('[RL-UPKEEP-1] [RL-UPKEEP-2] upkeep is 1 bag per 500 (rounded up); rice lasts floor(rice / upkeep)', () => {
    const s = { ...newRun(1), soldiers: 1500, wounded: 1 }
    expect(upkeep(era, s)).toBe(4)
    expect(riceDays(era, { ...s, rice: 15 })).toBe(3)
    expect(hud(era, { ...s, rice: 15 }).lasts).toBe(3)
  })

  it('[RL-SCATTER-1] the army scatters when a day cannot be paid, or rice reaches 0', () => {
    let s: RunState = { ...newRun(1), phase: 'road', rice: 6, soldiers: 1500 } // 3 a day
    s.road = drawRoad(era, 1)
    s.node = [0, 0]
    const leg = legOptions(era, s)[0]!
    s = travel(era, { ...s, rice: 6 }, leg.target)
    if (leg.days >= 2) expect(s.end?.kind).toBe('starved')
    const t = makeCamp(era, { ...newRun(1), phase: 'road', rice: 5, soldiers: 1500 })
    expect(t.end?.kind).toBe('starved')
    expect(t.rice).toBe(0)
  })

  it('[RL-HUNGER-1] a battle that leaves under 3 days of rice is hungry: everyone starts at 0 Qi', () => {
    const s = atDeploy({ rice: 20, soldiers: 1500, renown: 75 })
    const picks: DeployPick[] = [{ id: 'liu-bei', soldiers: 1000 }, { id: 'guan-yu', soldiers: 500 }]
    const c = checkDeploy(era, s, picks)
    expect(c.rice).toBe(6)
    expect(c.riceAfter).toBe(14)
    expect(c.lastsDays).toBe(4)
    expect(c.hungry).toBe(false)
    const h = checkDeploy(era, { ...s, rice: 14 }, picks)
    expect(h.lastsDays).toBe(2)
    expect(h.hungry).toBe(true)
    expect(h.startQi).toBeNull()
    expect(h.qi.filter((l) => l.qi !== 0).every((l) => l.ignored)).toBe(true)
    const sealed = sealDeploy(era, { ...s, rice: 14 }, picks)
    expect(battleOptions(era, sealed).run?.startQiAll).toBe(-2)
    expect(battleOptions(era, sealed).run?.startQi).toBeUndefined()
  })

  it('[RL-HUNGER-2] the finale forecast = the finale field at the current pool + 3 days of upkeep', () => {
    const s = newRun(1)
    const slots = Math.min(5, 4) // guangzong has 4 player starts until RL1b adds the fifth
    expect(slots).toBe(4)
    // 1,500 healthy fit the three caps: 6 bags; upkeep 3 a day: 9
    expect(finaleForecast(era, s)).toBe(Math.ceil(1500 / 250) + 3 * 3)
    expect(hud(era, s).forecast).toBe(15)
  })

  it('[RL-POOL-1] only healthy soldiers can be fielded', () => {
    const s = atDeploy({ soldiers: 800, wounded: 2000, rice: 99 })
    const c = checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 1000 }])
    expect(c.ok).toBe(false)
    expect(c.reason).toMatch(/800 healthy/)
  })

  it('[RL-POOL-2] [RL-FALL-2] command cap = 20 x Lead + 100 x level; hurt halves it (to 50) until a full rest', () => {
    const s = newRun(1)
    expect(capOf(era, s, 'liu-bei')).toBe(1850)
    expect(capOf(era, s, 'guan-yu')).toBe(2200)
    expect(capOf(era, s, 'zhang-fei')).toBe(2000)
    s.band[2]!.hurt = true
    expect(capOf(era, s, 'zhang-fei')).toBe(1000)
    s.band[1]!.capBonus = -300
    expect(capOf(era, s, 'guan-yu')).toBe(1900)
    const r = choose(era, atStop('rest-or-push', { band: s.band }), 'rest')
    expect(capOf(era, r, 'zhang-fei')).toBe(2000)
  })

  it('[RL-POOL-3] [RL-REN-3] [RL-REN-2] volunteers and the gift at a town after the choice', () => {
    let s = beginRoad(era, newRun(2))
    s = choose(era, s, 'feast') // Renown 30 -> 45, 1 day, rice -8
    expect(s.renown).toBe(45)
    expect(s.soldiers).toBe(1500 + 450)
    expect(s.rice).toBe(50 - 8 - 3)
    expect(s.phase).toBe('market')
    const hi = choose(era, atStop('hungry-county', { renown: 60 }), 'harvest') // trade x1.25, Renown 65 after
    expect(hi.soldiers).toBe(1500 + 650)
    expect(hi.rice).toBe(50 + 31 + 13 - 2 * 3)
    const no = choose(era, atStop('hungry-county', { renown: 60 }), 'seize')
    expect(no.soldiers).toBe(1500 + 300)
  })

  it('[RL-POOL-4] soldiers sent home leave for good', () => {
    const s = { ...newRun(1), phase: 'road' as const, soldiers: 2000, wounded: 300 }
    const t = sendHome(era, s, 500, 300)
    expect(t.soldiers).toBe(1500)
    expect(t.wounded).toBe(0)
    expect(upkeep(era, t)).toBe(3)
  })

  it('[RL-POOL-5] the market sells 100 levies per 5 bags (4 at 50+, 10 under 20), up to 500, never down to 0 rice', () => {
    const s = { ...newRun(1), phase: 'market' as const, rice: 100 }
    expect(levyCost(era, 30, 500)).toBe(25)
    expect(levyCost(era, 55, 500)).toBe(20)
    expect(levyCost(era, 10, 500)).toBe(50)
    expect(marketMax(era, s)).toBe(500)
    expect(marketMax(era, { ...s, rice: 11 })).toBe(200)
    const t = hireLevies(era, s, 300)
    expect(t.soldiers).toBe(1800)
    expect(t.rice).toBe(85)
    expect(t.phase).toBe('road')
    expect(hireLevies(era, s, 900).soldiers).toBe(1500)
  })
})

describe('deploy and battles', () => {
  it('[RL-DEPLOY-1] Liu Bei is always deployed; a fallen officer cannot deploy', () => {
    const s = atDeploy({ rice: 60 })
    expect(checkDeploy(era, s, [{ id: 'guan-yu', soldiers: 1000 }]).reason).toMatch(/always deployed/)
    s.band[1]!.rec.status = 'fallen'
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 500 }, { id: 'guan-yu', soldiers: 500 }]).ok).toBe(false)
    expect(defaultDeploy(era, s)[0]!.id).toBe('liu-bei')
  })

  it('[RL-DEPLOY-2] 250 to the cap in steps of 50, never more than the healthy pool; troops = max troops in the battle', () => {
    const s = atDeploy({ rice: 60 })
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 200 }]).ok).toBe(false)
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 275 }]).ok).toBe(false)
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 1900 }]).ok).toBe(false)
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 1000 }, { id: 'guan-yu', soldiers: 600 }]).ok).toBe(false) // 1,600 > 1,500
    const picks = [{ id: 'liu-bei', soldiers: 850 }, { id: 'zhang-fei', soldiers: 650 }]
    const sealed = sealDeploy(era, s, picks)
    const o = battleOptions(era, sealed)
    expect(o.deploy!.map((d) => [d.officerId, d.troops, d.maxTroops])).toEqual([['liu-bei', 850, 850], ['zhang-fei', 650, 650]])
    expect(o.run!.enemyTroopScale).toBe(0.85)
    const b = createBattle('daxing-hill', sealed.deployment!.seed, o)
    expect(b.units.find((u) => u.id === 'liu-bei')!.troops).toBe(850)
  })

  it('[RL-DEPLOY-3] the battle costs ceil(fielded / 250), paid at the seal; a deployment leaving 0 rice is refused', () => {
    const s = atDeploy({ rice: 7 })
    const picks = [{ id: 'liu-bei', soldiers: 1000 }, { id: 'guan-yu', soldiers: 500 }]
    const c = checkDeploy(era, s, picks)
    expect(c.rice).toBe(6)
    expect(c.ok).toBe(true)
    expect(sealDeploy(era, s, picks).rice).toBe(1)
    const r = checkDeploy(era, { ...s, rice: 6 }, picks)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/leave no rice/)
    expect(sealDeploy(era, { ...s, rice: 6 }, picks).phase).toBe('deploy')
  })

  it('[RL-DEPLOY-5] an officer who rides as the battle\'s own guest, or has no battle data yet, cannot be deployed; slots never exceed the starts', () => {
    const s = atDeploy({ rice: 99 })
    s.band.push({ rec: { ...s.band[0]!.rec, officerId: 'jian-yong', level: 2 }, hurt: false, capBonus: 0 })
    s.band.push({ rec: { ...s.band[0]!.rec, officerId: 'rl-unbuilt-recruit', level: 2 }, hurt: false, capBonus: 0 })
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 500 }, { id: 'jian-yong', soldiers: 500 }]).reason).toMatch(/allied column/)
    expect(checkDeploy(era, s, [{ id: 'liu-bei', soldiers: 500 }, { id: 'rl-unbuilt-recruit', soldiers: 500 }]).reason).toMatch(/cannot take the field yet/)
    expect(defaultDeploy(era, s).map((p) => p.id)).not.toContain('jian-yong')
    expect(checkDeploy(era, s, []).slots).toBe(4)
    expect(checkDeploy(era, { ...s, pending: { ...s.pending!, battleId: 'guangzong', finale: true } }, []).slots).toBeLessThanOrEqual(5)
  })

  it('[RL-DEPLOY-4] [RL-LOSS-1] a won battle takes a day; losses split half killed (to 10), half wounded', () => {
    const s = sealDeploy(era, atDeploy({ rice: 60 }), [{ id: 'liu-bei', soldiers: 1000 }, { id: 'guan-yu', soldiers: 500 }])
    const { state, report } = applyOutcome(era, s, won({ lost: { 'liu-bei': 230, 'guan-yu': 105 } }))
    expect(report.lost).toBe(335)
    expect(report.killed).toBe(170)
    expect(state.soldiers).toBe(1500 - 335 + 380) // + Renown 38 x 10 volunteers at the town
    expect(state.wounded).toBe(165)
    expect(state.day).toBe(1)
    // spoils, then volunteers at the town and on to the market
    expect(state.band.some((o) => o.rec.officerId === 'jian-yong')).toBe(true)
    expect(state.renown).toBe(38)
    expect(state.phase).toBe('market')
  })

  it('[RL-FALL-1] a routed officer is wounded first and falls on the second rout; Iron Oath makes the first rout a fall', () => {
    let s = sealDeploy(era, atDeploy({ rice: 99 }), [{ id: 'liu-bei', soldiers: 500 }, { id: 'zhang-fei', soldiers: 500 }])
    let r = applyOutcome(era, s, won({ routed: ['zhang-fei'], lost: { 'zhang-fei': 500 } }))
    let zf = r.state.band.find((o) => o.rec.officerId === 'zhang-fei')!
    expect(zf.rec.wounded).toBe(true)
    expect(zf.hurt).toBe(true)
    expect(zf.rec.status).toBe('active')
    expect(r.report.officers.find((o) => o.id === 'zhang-fei')!.mark).toBe('wounded')
    s = { ...r.state, phase: 'deploy', pending: s.pending }
    s = sealDeploy(era, s, [{ id: 'liu-bei', soldiers: 500 }, { id: 'zhang-fei', soldiers: 500 }])
    r = applyOutcome(era, s, won({ routed: ['zhang-fei'] }))
    zf = r.state.band.find((o) => o.rec.officerId === 'zhang-fei')!
    expect(zf.rec.status).toBe('fallen')
    expect(r.state.stats.fell).toEqual(['zhang-fei'])
    const iron = sealDeploy(era, atDeploy({ rice: 99, ironOath: true }), [{ id: 'liu-bei', soldiers: 500 }, { id: 'guan-yu', soldiers: 500 }])
    const ri = applyOutcome(era, iron, won({ routed: ['guan-yu'] }))
    expect(ri.state.band.find((o) => o.rec.officerId === 'guan-yu')!.rec.status).toBe('fallen')
  })

  it('[RL-END-1] [RL-END-2] a lost battle ends the run; Liu Bei routed ends it as a rout', () => {
    const s = sealDeploy(era, atDeploy({ rice: 99 }), [{ id: 'liu-bei', soldiers: 500 }])
    const lost = applyOutcome(era, s, { ...won(), won: false })
    expect(lost.state.end?.kind).toBe('defeated')
    expect(lost.state.phase).toBe('ended')
    const rout = applyOutcome(era, s, { ...won(), won: false, commanderRouted: true })
    expect(rout.state.end?.kind).toBe('routed')
  })

  it('[RL-XP-1] officers gain XP from the battle log as in the campaign; a level raises the cap by 100', () => {
    const s = sealDeploy(era, atDeploy({ rice: 99 }), [{ id: 'liu-bei', soldiers: 1000 }, { id: 'guan-yu', soldiers: 500 }])
    const b = createBattle('daxing-hill', s.deployment!.seed, battleOptions(era, s))
    const events: GameEvent[] = [
      ...Array.from({ length: 8 }, (): GameEvent => ({ kind: 'damaged', unit: 'deng-mao', amount: 100, troopsBefore: 1000, troopsAfter: 900, source: 'attack', by: 'guan-yu' })),
      { kind: 'routed', unit: 'deng-mao', side: 'yellow', by: 'guan-yu' },
    ]
    const final: BattleState = { ...b, result: { winner: 'han', reason: 'commander' }, units: b.units.map((u) => (u.id === 'guan-yu' ? { ...u, troops: 400 } : u)) }
    const { state, report } = applyBattle(era, s, final, events)
    const gy = report.officers.find((o) => o.id === 'guan-yu')!
    expect(gy.xp).toBe(80 + 30 + 20)
    expect(gy.lost).toBe(100)
    expect(gy.levelTo).toBe(4)
    expect(capOf(era, state, 'guan-yu')).toBe(2300)
    expect(report.officers.find((o) => o.id === 'liu-bei')!.xp).toBe(20)
  })
})

describe('battle modifiers reach the engine (RL1b)', () => {
  it('[RL-HUNGER-1] [RL-REN-4] start Qi from the run lands on the deployed officers (hungry: 0)', () => {
    const fed = sealDeploy(era, atDeploy({ renown: 75, rice: 99 }), [{ id: 'liu-bei', soldiers: 500 }, { id: 'guan-yu', soldiers: 500 }])
    const b = createBattle('daxing-hill', fed.deployment!.seed, battleOptions(era, fed))
    const q0 = createBattle('daxing-hill', fed.deployment!.seed, { deploy: battleOptions(era, fed).deploy }).units.find((u) => u.id === 'guan-yu')!.qi
    expect(b.units.find((u) => u.id === 'guan-yu')!.qi).toBe(Math.min(10, q0 + 2))
    const hungry = sealDeploy(era, atDeploy({ renown: 75, rice: 6 }), [{ id: 'liu-bei', soldiers: 500 }, { id: 'guan-yu', soldiers: 500 }])
    expect(hungry.deployment!.hungry).toBe(true)
    const h = createBattle('daxing-hill', hungry.deployment!.seed, battleOptions(era, hungry))
    expect(h.units.find((u) => u.id === 'guan-yu')!.qi).toBe(0)
    expect(h.units.find((u) => u.id === 'liu-bei')!.qi).toBe(0)
  })

  it('[RL-ECHO-2] lu-zhi-letter gives the imperial guests +2 Qi at Guangzong; granary-burned removes two sortie units', () => {
    const s0 = { ...atDeploy({ rice: 99, day: 18, flags: ['lu-zhi-letter', 'granary-burned'] }, 'guangzong') }
    s0.pending = { ...s0.pending!, battleId: 'guangzong', finale: true, enemyScale: 1, stopId: 'finale', choiceId: 'finale' }
    const s = sealDeploy(era, s0, [{ id: 'liu-bei', soldiers: 500 }])
    const o = battleOptions(era, s)
    expect(o.run!.startQi).toEqual({ 'gz-imperial-spears': 2, 'gz-imperial-bows': 2 })
    const b = createBattle('guangzong', s.deployment!.seed, o)
    expect(b.units.some((u) => u.id === 'gz-horse')).toBe(false)
    expect(b.units.some((u) => u.id === 'gz-vanguard-b')).toBe(false)
  })

  it('[RL-REN-5] a swayed recruitable officer (Zhou Cang at the bandit pass) joins the band from the battle log', () => {
    const s0 = atDeploy({ rice: 99 }, 'rl-bandit-pass')
    s0.pending = { ...s0.pending!, stopId: 'bandit-offer', choiceId: 'clear', win: { rice: 25, renown: 5 }, tier: 3 }
    const s = sealDeploy(era, s0, [{ id: 'liu-bei', soldiers: 500 }])
    const b = createBattle('rl-bandit-pass', s.deployment!.seed, battleOptions(era, s))
    const zc = b.units.find((u) => u.officer === 'zhou-cang')!
    const final: BattleState = { ...b, result: { winner: 'han', reason: 'commander' }, units: b.units.map((u) => (u.id === zc.id ? { ...u, side: 'han' } : u)) }
    const ev: GameEvent[] = [{ kind: 'swayed', unit: 'liu-bei', target: zc.id, chance: 50, side: 'han' }]
    const { state, report } = applyBattle(era, s, final, ev)
    expect(report.recruits).toContain('zhou-cang')
    expect(state.band.some((o) => o.rec.officerId === 'zhou-cang' && o.rec.level === 2)).toBe(true)
  })
})

describe('rest, march, Renown, echoes and gambles', () => {
  it('[RL-REST-1] a rest choice returns every wounded man and heals the hurt', () => {
    const s = atStop('rest-or-push', { wounded: 400, tired: true })
    s.band[1]!.hurt = true
    const t = choose(era, s, 'rest')
    expect(t.wounded).toBe(0)
    expect(t.soldiers).toBe(1900)
    expect(t.tired).toBe(false)
    expect(t.band[1]!.hurt).toBe(false)
    expect(t.day).toBe(2)
    expect(t.qiMods).toEqual([{ qi: 1, cause: 'Rest or Push On: Rest two days' }])
  })

  it('[RL-REST-2] making camp: 2 days, half the wounded (down to 10) return, the hurt stay hurt', () => {
    const s = { ...newRun(1), phase: 'road' as const, wounded: 335 }
    s.band[2]!.hurt = true
    const t = makeCamp(era, s)
    expect(t.wounded).toBe(335 - 160)
    expect(t.soldiers).toBe(1660)
    expect(t.day).toBe(2)
    expect(t.band[2]!.hurt).toBe(true)
  })

  it('[RL-MARCH-1] [RL-MARCH-2] a forced march takes ceil(L/2) days, 3% per day saved, and the band arrives tired', () => {
    let s = beginRoad(era, newRun(3))
    s = hireLevies(era, choose(era, s, 'estate'), 0)
    const road = s.road
    const e = road.edges.find((x) => x.kind === 'road' && x.days === 3)
    const st: RunState = { ...s, node: e!.from, soldiers: 2000 }
    const o = legOptions(era, st).find((x) => x.kind === 'road' && x.days === 3)!
    expect(o.marchDays).toBe(2)
    expect(o.marchLoss).toBe(60)
    const t = travel(era, st, o.target, true)
    expect(t.day).toBe(st.day + 2)
    expect(t.soldiers).toBe(1940)
    expect(t.wounded).toBe(30)
    expect(t.tired).toBe(true)
    // a later normal-pace leg walks it off
    const n: RunState = { ...t, phase: 'road' }
    const leg = legOptions(era, n)[0]!
    expect(travel(era, n, leg.target, false).tired).toBe(false)
  })

  it('[RL-REN-1] Renown moves only by printed amounts, clamped to 0..100', () => {
    expect(choose(era, atStop('yellow-deserters', { renown: 10 }), 'execute').renown).toBe(0)
    expect(choose(era, atStop('captured-granary', { renown: 95 }), 'give').renown).toBe(100)
  })

  it('[RL-REN-4] battle spirit: +2 at 70+, +1 at 40+, -1 under 20; under 20 a rest loses 5% to desertion', () => {
    const q = (renown: number) => checkDeploy(era, atDeploy({ renown, rice: 99 }), [{ id: 'liu-bei', soldiers: 500 }]).startQi!['liu-bei']
    expect(q(70)).toBe(2)
    expect(q(40)).toBe(1)
    expect(q(30)).toBe(0)
    expect(q(19)).toBe(-1)
    const t = makeCamp(era, { ...newRun(1), phase: 'road', renown: 10, soldiers: 2000 })
    expect(t.soldiers).toBe(1900)
  })

  it('[RL-REN-5] a recruit needs Renown at the choice; below it the slip says so and gives its other branch', () => {
    const lo = atStop('bandit-offer', { renown: 30 })
    const v = choiceView(era, lo, stopDef(era, 'bandit-offer'), 'accept')
    expect(v.conditionNote).toMatch(/Needs Renown 40\+/)
    expect(choose(era, lo, 'accept').rice).toBe(50 - 18)
    const hi = choose(era, atStop('bandit-offer', { renown: 45 }), 'accept')
    expect(hi.band.some((o) => o.rec.officerId === 'zhou-cang')).toBe(true)
    expect(hi.soldiers).toBe(1900)
  })

  it('[RL-REN-6] Liu Bei sway bonus floor((Renown - 30) / 10) goes to the engine', () => {
    for (const [ren, b] of [[0, -3], [25, -1], [30, 0], [79, 4], [100, 7]] as const) {
      const s = sealDeploy(era, atDeploy({ renown: ren, rice: 99 }), [{ id: 'liu-bei', soldiers: 500 }])
      expect(battleOptions(era, s).run!.swayBonus).toBe(b)
    }
  })

  it('[RL-REN-7] [RL-CAL-1] the finale reads the day table (stockade-burned counts 4 days earlier) and Renown', () => {
    const s = { ...newRun(1), day: 15 }
    expect(dayRow(era, s).row.label).toBe('early')
    expect(dayRow(era, { ...s, flags: ['stockade-burned'] }).row.label).toBe('very early')
    expect(dayRow(era, { ...s, day: 29 }).row.label).toBe('too late')
    const f = finaleBriefing(era, { ...s, day: 10, renown: 15, flags: ['granary-burned', 'village-fell'] })
    expect(f.removeUnits.sort()).toEqual(['gz-bowman-a', 'gz-bowman-b', 'gz-horse', 'gz-imperial-bows', 'gz-vanguard-b'].sort())
    expect(f.lines[0]!.text).toMatch(/day 10/)
    expect(f.lines.some((l) => l.text.startsWith('Because you marched past the burning village'))).toBe(true)
    expect(f.lines.some((l) => l.text.includes('Renown 15 (under 20)'))).toBe(true)
  })

  it('[RL-ECHO-1] a hidden echo is never printed when set, and is named in full when it pays off', () => {
    const s = atStop('village-under-siege')
    const v = choiceView(era, s, stopDef(era, 'village-under-siege'), 'pass')
    expect(JSON.stringify(v)).not.toMatch(/village-fell|raiders wait/)
    const t = choose(era, s, 'pass')
    expect(t.flags).toContain('village-fell')
    expect(t.annals.some((a) => a.text.includes('raiders wait'))).toBe(false)
    // dong-zhuo-grudge pays off at Zhu Jun's camp: the slip names it and halves the commissary
    const z = atStop('zhu-jun-camp', { flags: ['dong-zhuo-grudge'] }, 7, 9)
    const zv = choiceView(era, z, stopDef(era, 'zhu-jun-camp'), 'serve')
    expect(zv.echoes[0]).toMatch(/Dong Zhuo's tent/)
    expect(zv.chips.find((c) => c.text.startsWith('rice'))!.text).toMatch(/\+20/)
    const zt = choose(era, z, 'serve')
    expect(zt.fired).toContain('dong-zhuo-grudge')
  })

  it('[RL-ECHO-2] a stated flag is printed on its slip; the finale briefing lists every flag with its cause', () => {
    const v = choiceView(era, atStop('captured-granary'), stopDef(era, 'captured-granary'), 'burn')
    expect(v.chips.some((c) => c.tone === 'flag' && c.text.includes('2 fewer units'))).toBe(true)
    const f = finaleBriefing(era, { ...newRun(1), day: 18, renown: 72, flags: ['granary-burned', 'lu-zhi-letter', 'outlaw'] })
    expect(f.lines.map((l) => l.kind)).toEqual(['day', 'echo', 'echo', 'renown', 'renown', 'spirit'])
  })

  it('[RL-GAMBLE-1] [RL-RNG-1] a gamble prints both outcomes and is one draw from the stop stream', () => {
    const s = atStop('flooded-ford', {}, 3, 4)
    const v = choiceView(era, s, stopDef(era, 'flooded-ford'), 'cross')
    expect(v.gamble!.odds).toBe(0.6)
    expect(v.gamble!.lose.map((c) => c.text)).toEqual(['rice -20', 'lose 400 men (all killed)'])
    const draw = stream(s.seed, P_FATE, 4)()
    const t = choose(era, s, 'cross')
    expect(t.soldiers).toBe(draw < 0.6 ? 1500 : 1100)
    expect(choose(era, s, 'cross')).toEqual(t)
  })

  it('[RL-RNG-1] the same seed and choices give the same run; a choice never shifts a later stop draw', () => {
    const a = autoRun(77)
    const b = autoRun(77)
    expect(a).toEqual(b)
    expect(a.end).not.toBeNull()
    expect(stream(77, P_FATE, 6)()).toBe(stream(77, P_FATE, 6)())
    expect(stream(77, P_FATE, 6)()).not.toBe(stream(77, P_FATE, 7)())
  })

  it('[RL-CHOICE-1] a slip prints its exact effects and the rice after it', () => {
    const s = beginRoad(era, newRun(1))
    const v = choiceView(era, s, stopDef(era, 'zhuo-notice'), 'feast')
    expect(v.chips.map((c) => c.text)).toEqual(['rice -8', 'Renown +15 -> 45 (+1 Qi)', '1 day (rice -3)'])
    expect(v.volunteers).toBe(450)
    expect(v.riceAfter).toBe(50 - 8 - 3)
  })

  it('[RL-CHOICE-2] a choice the band cannot pay is greyed with the reason; no payable choice scatters the army', () => {
    const s = atStop('refugee-column', { rice: 12 })
    const v = choiceView(era, s, stopDef(era, 'refugee-column'), 'feed')
    expect(v.payable).toBe(false)
    expect(v.reason).toMatch(/Needs 15 bags/)
    expect(choose(era, s, 'feed')).toBe(s)
  })

  it('[RL-RUN-2] whole runs end won, lost or scattered, and every end is written to the Annals', () => {
    const ends = new Set<string>()
    for (let sd = 1; sd <= 25; sd++) ends.add(autoRun(sd).end!.kind)
    expect(ends.has('won')).toBe(true)
    const lost = autoRun(5, () => ({ ...won(), won: false }))
    expect(lost.end!.kind).toBe('defeated')
    const st = createMemoryStorage()
    writeAnnal(st, lost)
    expect(loadAnnals(st)[0]!.end).toBe('defeated')
  })
})

describe('saves', () => {
  it('[RL-SAVE-1] save and load round-trip with a version field; a wrong version or junk is refused', () => {
    const st = createMemoryStorage()
    let s = beginRoad(era, newRun(31))
    s = choose(era, s, 'levy')
    expect(saveRun(st, s)).toBe(true)
    const r = loadRun(st)
    expect(r.ok && r.state).toEqual(s)
    st.setItem(RUN_SAVE_KEY, JSON.stringify({ ...s, version: 99 }))
    expect(loadRun(st)).toEqual({ ok: false, reason: 'version' })
    st.setItem(RUN_SAVE_KEY, '{oops')
    expect(loadRun(st)).toEqual({ ok: false, reason: 'corrupt' })
    clearRun(st)
    expect(loadRun(st)).toEqual({ ok: false, reason: 'missing' })
    expect(loadRun(null)).toEqual({ ok: false, reason: 'unavailable' })
  })
})
