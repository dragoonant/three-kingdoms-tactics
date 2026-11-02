// Roguelike battle modifiers (CreateOptions.run, docs/spec/10-rules.md section 11 "Battle modifiers", RL-MOD-1..5).
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { GAME_DATA, getBattleDef, listBattleIds } from '../../src/data'
import type { DeployEntry } from '../../src/data/types'
import { createBattle, createBattleFromDef, legalActions, query, replay, step, type Action, type BattleState } from '../../src/engine'
import { act, u } from './helpers'
import { mk2 } from './v2-helpers'

const entry = (officerId: string, troops = 1800): DeployEntry => ({
  officerId,
  level: 3,
  statBonus: { war: 0, int: 0, lead: 0, cha: 0 },
  maxTroops: troops,
  troops,
  stratagems: GAME_DATA.officers[officerId]!.stratagems.slice(),
})

describe('RL-MOD-5 no run modifiers: every battle is unchanged', () => {
  it('RL-MOD-5 an empty run, or none, builds the same state for every registry battle', () => {
    for (const id of listBattleIds()) {
      const a = createBattle(id, 3)
      const b = createBattle(id, 3, {})
      const c = createBattle(id, 3, { run: {} })
      const d = createBattle(id, 3, { run: { enemyTroopScale: 1, startQiAll: 0, swayBonus: 0, removeUnits: [], startQi: {} } })
      expect(isDeepStrictEqual(a, b), id).toBe(true)
      expect(isDeepStrictEqual(a, c), id).toBe(true)
      expect(isDeepStrictEqual(a, d), id).toBe(true)
      expect('swayBonus' in a).toBe(false)
    }
  })
})

describe('RL-MOD-1 start Qi', () => {
  it('RL-MOD-1 startQiAll goes to deployed officers after the opening +2, startQi to listed officers (guests too)', () => {
    const base = createBattle('daxing-hill', 1)
    expect(u(base, 'liu-bei').qi).toBe(2)
    const s = createBattle('daxing-hill', 1, { run: { startQiAll: 2, startQi: { 'zhang-fei': 1, 'zou-jing': 3 } } })
    expect(u(s, 'liu-bei').qi).toBe(4)
    expect(u(s, 'guan-yu').qi).toBe(4)
    expect(u(s, 'zhang-fei').qi).toBe(5)
    // guests do not get startQiAll, but a listed guest gets its own bonus
    expect(u(s, 'jian-yong').qi).toBe(2)
    expect(u(s, 'zou-jing').qi).toBe(5)
    // enemies are untouched
    for (const x of s.units.filter((y) => y.side !== 'han')) expect(x.qi).toBe(0)
  })

  it('RL-MOD-1 the sum is clamped to 0..10 (hunger: -2 gives 0)', () => {
    const hungry = createBattle('daxing-hill', 1, { run: { startQiAll: -2, startQi: { 'guan-yu': -3 } } })
    expect(u(hungry, 'liu-bei').qi).toBe(0)
    expect(u(hungry, 'guan-yu').qi).toBe(0)
    const full = createBattle('daxing-hill', 1, { run: { startQiAll: 5, startQi: { 'guan-yu': 9 } } })
    expect(u(full, 'guan-yu').qi).toBe(10)
    expect(u(full, 'liu-bei').qi).toBe(7)
  })

  it('RL-MOD-1 a deployed officer arriving later gets the bonus on top of the arrival Qi 4', () => {
    const deploy = ['liu-bei', 'jian-yong', 'guan-yu', 'zhang-fei'].map((id) => entry(id))
    let s = createBattle('qingzhou', 1, { deploy, run: { startQiAll: 1, startQi: { 'guan-yu': 2 } } })
    const wave = s.reinforcements.find((r) => r.units.some((x) => x.id === 'guan-yu'))!
    expect(wave.qiBonus).toEqual({ 'guan-yu': 3 })
    for (let i = 0; i < 4; i++) s = act(s, { type: 'endPhase' }).state
    expect(s.round).toBe(3)
    expect(u(s, 'guan-yu').qi).toBe(7)
    expect(u(s, 'zhang-fei').qi).toBe(5)
    // the governor is a fixed reinforcement, not a deployed officer: no startQiAll
    for (let i = 0; i < 4; i++) s = act(s, { type: 'endPhase' }).state
    expect(u(s, 'gong-jing').qi).toBe(4)
  })
})

describe('RL-MOD-2 enemy troop scale', () => {
  it('RL-MOD-2 scales every non-player unit and wave, rounded to 10; guests and the player side are not scaled', () => {
    const base = createBattle('qingzhou', 1)
    const s = createBattle('qingzhou', 1, { run: { enemyTroopScale: 0.85 } })
    for (const x of base.units) {
      const y = u(s, x.id)
      if (x.side === 'han') expect([y.troops, y.maxTroops]).toEqual([x.troops, x.maxTroops])
      else {
        expect(y.troops).toBe(Math.round((x.troops * 0.85) / 10) * 10)
        expect(y.maxTroops).toBe(Math.round((x.maxTroops * 0.85) / 10) * 10)
        expect(y.troops % 10).toBe(0)
      }
    }
    // the chief: 3600 x 0.85 = 3060
    expect(u(s, 'qz-rebel-chief').troops).toBe(3060)
    // the han reinforcement (Gong Jing) keeps its troops
    const gj = s.reinforcements.flatMap((r) => r.units).find((x) => x.id === 'gong-jing')!
    expect(gj.troops).toBe(2000)
  })

  it('RL-MOD-2 enemy reinforcement waves are scaled too, and troops never exceed max troops', () => {
    const s = createBattle('proving-ground', 1, { run: { enemyTroopScale: 1.13 } })
    const base = createBattle('proving-ground', 1)
    const foeWaves = (st: BattleState) => st.reinforcements.filter((r) => r.side !== 'han').flatMap((r) => r.units)
    expect(foeWaves(base).length).toBeGreaterThan(0)
    foeWaves(s).forEach((x, i) => {
      const b = foeWaves(base)[i]!
      expect(x.troops).toBe(Math.round((b.troops * 1.13) / 10) * 10)
      expect(x.troops).toBeLessThanOrEqual(x.maxTroops!)
    })
    for (const x of s.units) expect(x.troops).toBeLessThanOrEqual(x.maxTroops)
  })
})

describe('RL-MOD-3 sway bonus', () => {
  it("RL-MOD-3 adds the points to Liu Bei's sway chance only, before the clamp, and query shows the same number", () => {
    const units = [
      { id: 'lb', side: 'han', x: 1, y: 1, cha: 50 },
      { id: 'other', side: 'han', x: 1, y: 3, cha: 50 },
      { id: 'foe', side: 'cao', x: 2, y: 2, loyalty: 30 },
    ]
    const plain = mk2({ units })
    const withBonus = mk2({ units, options: { run: { swayBonus: 7 } } })
    // mk2 officers are synthetic; point Liu Bei's unit at the real liu-bei record with the same charisma via a patch
    const asLiuBei = (s: BattleState): BattleState => ({
      ...s,
      data: { ...s.data, officers: { ...s.data.officers, 'liu-bei': { ...s.data.officers['o-lb']!, id: 'liu-bei' } } },
      units: s.units.map((x) => (x.id === 'lb' ? { ...x, officer: 'liu-bei' } : x)),
    })
    const a = asLiuBei(plain)
    const b = asLiuBei(withBonus)
    expect(b.swayBonus).toBe(7)
    expect(query.swayChance(a, 'lb', 'foe')!.chance).toBe(20)
    expect(query.swayChance(b, 'lb', 'foe')!.chance).toBe(27)
    expect(query.swayChance(b, 'other', 'foe')!.chance).toBe(20)
    // the clamp still applies: a big negative bonus floors at 5
    const c = asLiuBei(mk2({ units, options: { run: { swayBonus: -30 } } }))
    expect(query.swayChance(c, 'lb', 'foe')!.chance).toBe(5)
  })

  it('RL-MOD-3 the step uses the same chance (the swayed event carries it)', () => {
    const s = createBattle('rl-bandit-pass', 2, { run: { swayBonus: 5 } })
    const near = { ...s, units: s.units.map((x) => (x.id === 'liu-bei' ? { ...x, x: 6, y: 5 } : x)) }
    const chance = query.swayChance(near, 'liu-bei', 'zhou-cang')!.chance
    expect(chance).toBe(98 - 45 + 5)
    const r = step(near, { type: 'sway', unit: 'liu-bei', target: 'zhou-cang' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const e = r.events.find((x) => x.kind === 'swayed' || x.kind === 'swayFailed') as { chance: number }
      expect(e.chance).toBe(chance)
    }
  })
})

describe('RL-MOD-4 removed units', () => {
  it('RL-MOD-4 removes fixed units, guests and wave units by unit or officer id; commanders are kept', () => {
    const s = createBattle('qingzhou', 1, { run: { removeUnits: ['qz-bowman-a', 'zou-jing', 'gong-jing', 'qz-rebel-chief'] } })
    const ids = s.units.map((x) => x.id)
    expect(ids).not.toContain('qz-bowman-a')
    expect(ids).not.toContain('zou-jing')
    expect(ids).toContain('qz-rebel-chief')
    expect(s.reinforcements.flatMap((r) => r.units).map((x) => x.id)).not.toContain('gong-jing')
    expect(s.commanders['yellow']).toBe('qz-rebel-chief')
    // deployed officers are never removed
    const t = createBattle('daxing-hill', 1, { run: { removeUnits: ['guan-yu'] } })
    expect(t.units.map((x) => x.id)).toContain('guan-yu')
  })

  it('RL-MOD-4 a battle without playerStarts honours removeUnits too', () => {
    const def = { ...getBattleDef('daxing-hill')! }
    delete (def as { playerStarts?: unknown }).playerStarts
    const s = createBattleFromDef(def, GAME_DATA, 1, { run: { removeUnits: ['captain-gao'] } })
    expect(s.units.map((x) => x.id)).not.toContain('captain-gao')
  })
})

describe('RL-MOD-5 modified battles replay and keep their modifiers', () => {
  it('RL-MOD-5 a modified battle is deterministic: the same seed, options and actions give the same state', () => {
    const opts = { run: { startQiAll: 1, enemyTroopScale: 1.1, swayBonus: 3, removeUnits: ['bp-bowman-b'] } }
    const log: Action[] = []
    const play = (): BattleState => {
      let s = createBattle('rl-bandit-pass', 9, opts)
      log.length = 0
      for (let i = 0; i < 12 && !s.result; i++) {
        const la = legalActions(s)
        const a = la[(i * 7) % la.length]!
        log.push(a)
        s = act(s, a).state
      }
      expect(log.length).toBeGreaterThan(0)
      return s
    }
    const end = play()
    expect(isDeepStrictEqual(end, play())).toBe(true)
    expect(isDeepStrictEqual(replay('rl-bandit-pass', 9, log, opts), end)).toBe(true)
    // without the options the start differs
    expect(isDeepStrictEqual(createBattle('rl-bandit-pass', 9, opts), replay('rl-bandit-pass', 9, []))).toBe(false)
  })
})
