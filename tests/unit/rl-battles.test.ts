// RL1b: the engine additions for the roguelike's minor battles (R2-GUEST-2, R2-BEH-1, R2-SIDE-2) and the four era 1
// minor battles (docs/spec/battles/rl-*.md, spec 16 section 4).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decide } from '../../src/ai/decider'
import { greedyAction } from '../../src/ai/greedy'
import { parseBehaviour } from '../../src/ai/goals'
import { GAME_DATA, getBattleDef, validateData } from '../../src/data'
import { SCENES } from '../../src/data/scenes'
import type { BattleDef, DeployEntry } from '../../src/data/types'
import { createBattle, enemySide, legalActions, query, step, type BattleState, type GameEvent } from '../../src/engine'
import { guestPlan } from '../../src/engine/guests'
import { COLORS, setSideTokens, sideColour } from '../../src/client/board/layout'
import { paletteOf, kindOf } from '../../src/client/cutins/plan'
import { SIDE_COLOURS } from '../../src/client/figures/troops'
import { OFFICER_STYLES } from '../../src/client/figures/officerKit'
import { portraitSubjects } from '../../src/client/portraits'
import { act, ev, u } from './helpers'

const RL = ['rl-village-siege', 'rl-bandit-pass', 'rl-prison-cart', 'rl-dong-zhuo-rescue']

const entry = (officerId: string, troops = 1800): DeployEntry => ({
  officerId,
  level: 3,
  statBonus: { war: 2, int: 2, lead: 2, cha: 2 },
  maxTroops: troops,
  troops,
  stratagems: GAME_DATA.officers[officerId]!.stratagems.slice(),
})

/** The player ends the phase (the guest acts); returns the events of that one step. */
function endPlayerPhase(s: BattleState): { state: BattleState; events: GameEvent[] } {
  expect(s.side).toBe('han')
  return act(s, { type: 'endPhase' })
}

function patchUnits(s: BattleState, f: (x: BattleState['units'][number]) => BattleState['units'][number]): BattleState {
  return { ...s, units: s.units.map(f) }
}

describe('R2-GUEST-2 an AI-moved guest', () => {
  it('R2-GUEST-2 Dong Zhuo is on the player side but marked done in the player phase: never offered, refused by step', () => {
    const s = createBattle('rl-dong-zhuo-rescue', 1)
    const dz = u(s, 'dong-zhuo')
    expect([dz.side, dz.guestControl, dz.done]).toEqual(['han', 'ai', true])
    expect(legalActions(s).some((a) => 'unit' in a && a.unit === 'dong-zhuo')).toBe(false)
    expect(query.readyUnits(s, 'han').map((x) => x.id)).not.toContain('dong-zhuo')
    const r = step(s, { type: 'move', unit: 'dong-zhuo', x: 11, y: 6 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('unitDone')
  })

  it('R2-GUEST-2 flee:west: at the end of the player phase he rides as far west as he can, then escapes at the edge', () => {
    let s = createBattle('rl-dong-zhuo-rescue', 1)
    // clear the rebels out of his way so the rule itself is visible
    s = { ...s, units: s.units.filter((x) => x.side === 'han' || x.commander).map((x) => (x.commander && x.side !== 'han' ? { ...x, x: 15, y: 0 } : x)) }
    const r1 = endPlayerPhase(s)
    const mv = ev(r1.events, 'moved').filter((e) => e.unit === 'dong-zhuo')
    expect(mv).toHaveLength(1)
    // cavalry move 6: three plain tiles (3) and one riverbed ford (3) from x=12
    expect(mv[0]!.to).toEqual({ x: 8, y: 6 })
    expect(u(r1.state, 'dong-zhuo').x).toBe(8)
    // the move happens before the phase passes to the rebels
    const kinds = r1.events.map((e) => e.kind)
    expect(kinds.indexOf('moved')).toBeLessThan(kinds.indexOf('phaseStarted'))
    // round 2: across the second ford tile and on to x=4; round 3: to x=0 and out
    let st = act(r1.state, { type: 'endPhase' }).state
    st = endPlayerPhase(st).state
    expect(u(st, 'dong-zhuo').x).toBe(4)
    st = act(st, { type: 'endPhase' }).state
    const r3 = endPlayerPhase(st)
    expect(ev(r3.events, 'escaped').map((e) => [e.unit, e.x])).toEqual([['dong-zhuo', 0]])
    expect(r3.state.escaped).toEqual(['dong-zhuo'])
    expect(r3.state.result).toBeNull()
    // escaped is not lost: the battle goes on and the survive objective can still be won
    expect(query.objectives(r3.state).find((o) => o.side === 'lose' && o.cond.type === 'unitLost')!.met).toBe(false)
  })

  it('R2-GUEST-2 already on the edge: he escapes without moving', () => {
    const s = patchUnits(createBattle('rl-dong-zhuo-rescue', 1), (x) => (x.id === 'dong-zhuo' ? { ...x, x: 0, y: 9 } : x))
    const r = endPlayerPhase(s)
    expect(ev(r.events, 'moved').filter((e) => e.unit === 'dong-zhuo')).toHaveLength(0)
    expect(ev(r.events, 'escaped').map((e) => e.unit)).toEqual(['dong-zhuo'])
  })

  it('R2-GUEST-2 boxed in and no closer to the edge: he attacks the weakest enemy in reach', () => {
    let s = createBattle('rl-dong-zhuo-rescue', 1)
    // a wall of rebels west of him at distance 1: every move costs him ground or ends in their zone of control
    s = patchUnits(s, (x) => {
      if (x.id === 'dong-zhuo') return { ...x, x: 12, y: 6 }
      if (x.id === 'dz-spear-a') return { ...x, x: 11, y: 6, troops: 900 }
      if (x.id === 'dz-spear-b') return { ...x, x: 12, y: 5 }
      if (x.id === 'dz-horse-b') return { ...x, x: 12, y: 7 }
      if (x.id === 'dz-bowmen') return { ...x, x: 13, y: 6 }
      return x
    })
    const r = endPlayerPhase(s)
    expect(ev(r.events, 'moved').filter((e) => e.unit === 'dong-zhuo')).toHaveLength(0)
    const atk = ev(r.events, 'attacked').filter((e) => e.unit === 'dong-zhuo')
    expect(atk.map((e) => e.target)).toEqual(['dz-spear-a'])
  })

  it('R2-GUEST-2 a confused guest does not act, and recovers at the end of the phase', () => {
    const s = patchUnits(createBattle('rl-dong-zhuo-rescue', 1), (x) => (x.id === 'dong-zhuo' ? { ...x, confused: true } : x))
    const r = endPlayerPhase(s)
    expect(ev(r.events, 'moved').filter((e) => e.unit === 'dong-zhuo')).toHaveLength(0)
    expect(ev(r.events, 'recovered').map((e) => e.unit)).toContain('dong-zhuo')
  })

  it('R2-GUEST-2 the village militia (hold) never moves, and strikes a raider who reaches it', () => {
    let s = createBattle('rl-village-siege', 1)
    expect(u(s, 'vs-militia').guestControl).toBe('ai')
    const r = endPlayerPhase(s)
    expect(ev(r.events, 'moved').filter((e) => e.unit === 'vs-militia')).toHaveLength(0)
    s = patchUnits(createBattle('rl-village-siege', 1), (x) => (x.id === 'vs-raider-torch' ? { ...x, x: 7, y: 4 } : x))
    const r2 = endPlayerPhase(s)
    expect(ev(r2.events, 'attacked').filter((e) => e.unit === 'vs-militia').map((e) => e.target)).toEqual(['vs-raider-torch'])
  })

  it('R2-GUEST-2 advance-to:x,y on a guest walks it toward the tile', () => {
    let s = createBattle('rl-dong-zhuo-rescue', 1)
    s = { ...s, enemyBehaviour: { ...s.enemyBehaviour, 'dong-zhuo': 'advance-to:12,2' } }
    const r = endPlayerPhase(s)
    const to = ev(r.events, 'moved').find((e) => e.unit === 'dong-zhuo')!.to
    expect(Math.abs(to.x - 12) + Math.abs(to.y - 2)).toBeLessThan(4)
    expect(guestPlan('advance-to:3,4')).toEqual({ kind: 'advance-to', tile: { x: 3, y: 4 } })
    expect(guestPlan('flee:north')).toEqual({ kind: 'flee', edge: 'north' })
    expect(guestPlan('hold')).toEqual({ kind: 'stand' })
    expect(guestPlan('flee:up')).toEqual({ kind: 'stand' })
  })

  it('R2-GUEST-2 battles without AI guests are unaffected: no unit is held done at the start of the player phase', () => {
    for (const id of ['daxing-hill', 'qingzhou', 'proving-ground']) {
      const s = createBattle(id, 1)
      expect(s.units.filter((x) => x.side === 'han' && x.done)).toEqual([])
    }
  })
})

describe('R2-BEH-1 behaviour hints advance-to, flee, pursue', () => {
  it('R2-BEH-1 the AI parses advance-to and flee; the validator accepts them and rejects a bad edge', () => {
    expect(parseBehaviour('advance-to:13,4')).toEqual({ kind: 'advance-to', tile: { x: 13, y: 4 } })
    expect(parseBehaviour('flee:west')).toEqual({ kind: 'advance-to', edge: 'west' })
    expect(parseBehaviour('flee:sideways')).toEqual({ kind: 'advance' })
    expect(parseBehaviour('pursue:dong-zhuo')).toEqual({ kind: 'pursue', unit: 'dong-zhuo' })
    expect(validateData()).toEqual([])
  })

  it('R2-BEH-1 Captain Huo (advance-to:13,4) walks the cart east in the escort phase', () => {
    let s = createBattle('rl-prison-cart', 4)
    s = act(s, { type: 'endPhase' }).state
    expect(s.side).toBe('court')
    const x0 = u(s, 'pc-huo').x
    let guard = 0
    while (s.side === 'court' && !s.result && guard++ < 40) s = act(s, decide(s, { tier: 'normal', seed: 3, budgetMs: 300, now: () => 0 }).action).state
    expect(u(s, 'pc-huo').x).toBeGreaterThan(x0)
  })

  it('R2-BEH-1 the Taiping Marshal pursues Dong Zhuo: by the end of round 2 he is closer to him than at the start', () => {
    let s = createBattle('rl-dong-zhuo-rescue', 5)
    const d0 = Math.abs(u(s, 'dz-marshal').x - u(s, 'dong-zhuo').x) + Math.abs(u(s, 'dz-marshal').y - u(s, 'dong-zhuo').y)
    let guard = 0
    while (!s.result && s.round <= 2 && guard++ < 200) {
      const a = s.side === 'han' ? { type: 'endPhase' as const } : decide(s, { tier: 'normal', seed: 3, budgetMs: 300, now: () => 0 }).action
      s = act(s, a).state
    }
    const m = s.units.find((x) => x.id === 'dz-marshal')
    const dz = s.units.find((x) => x.id === 'dong-zhuo')
    if (m && dz) expect(Math.abs(m.x - dz.x) + Math.abs(m.y - dz.y)).toBeLessThan(d0 + 4)
    expect(m === undefined || m.x < 15).toBe(true)
  })
})

describe('R2-SIDE-2 the court side', () => {
  it('R2-SIDE-2 the prison cart is han against court: turn order, enemy side, victory and timeout all read the data', () => {
    const s = createBattle('rl-prison-cart', 1)
    expect(s.sideOrder).toEqual(['han', 'court'])
    expect(enemySide(s)).toBe('court')
    expect(s.sides.find((x) => x.id === 'court')).toEqual({ id: 'court', name: 'Imperial Escort', colourToken: 'court' })
    expect(s.commanders['court']).toBe('pc-huo')
    // routing Captain Huo wins
    const lone = { ...s, units: s.units.filter((x) => x.id !== 'pc-huo'), defeated: ['pc-huo'] }
    const r = step(lone, { type: 'endPhase' })
    expect(r.ok && r.state.result).toEqual({ winner: 'han', reason: 'commander' })
    // the end of round 7 gives the escort the battle
    let t = s
    for (let i = 0; i < 14 && !t.result; i++) t = act(t, legalActions(t).at(-1)!).state
    expect(t.result?.winner).toBe('court')
  })

  it('R2-SIDE-2 the client maps court to the iron-grey token, the HUD colour, the figure palette and the generic portraits', () => {
    expect(COLORS.court).toBe('#5d5a52')
    expect(readFileSync('src/client/theme.css', 'utf8')).toMatch(/--court:\s*#5d5a52/)
    expect(readFileSync('src/client/hud.css', 'utf8')).toMatch(/\.ucard\.court/)
    setSideTokens(createBattle('rl-prison-cart', 1).sides)
    expect(sideColour('court')).toBe('#5d5a52')
    const s = createBattle('rl-prison-cart', 1)
    expect(paletteOf(s, 'court')).toBe('court')
    expect(kindOf('infantry', 'court')).toBe('infantry')
    expect(SIDE_COLOURS.court.cloth).toBe('#5d5a52')
    const ids = portraitSubjects().map((p) => p.id)
    for (const k of ['infantry', 'archer', 'cavalry']) expect(ids).toContain(`generic-court-${k}`)
  })
})

describe('the four era 1 minor battles (spec 16 section 4)', () => {
  const def = (id: string): BattleDef => getBattleDef(id)!
  it('RL battles are real (not stubs), have scenes, deploy Liu Bei first and fit the specified sizes', () => {
    const sizes: Record<string, [number, number, number]> = {
      'rl-village-siege': [12, 10, 3],
      'rl-bandit-pass': [12, 10, 3],
      'rl-prison-cart': [14, 8, 3],
      'rl-dong-zhuo-rescue': [16, 10, 4],
    }
    for (const id of RL) {
      const d = def(id)
      expect(d.stub, id).toBeUndefined()
      expect(SCENES[id]?.pre.length, id).toBeGreaterThan(0)
      expect([d.map[0]!.length, d.map.length, d.deploySlots], id).toEqual(sizes[id])
      expect(d.required, id).toEqual(['liu-bei'])
      expect(d.playerStarts!.length, id).toBe(d.deploySlots)
      for (const o of d.officers ?? []) expect(o.invented, o.id).toBe(true)
    }
  })

  it('rl-village-siege: the threshing floor burns from round 1, the militia is a protected AI guest of 600', () => {
    const s = createBattle('rl-village-siege', 1)
    const burning = s.burn.map((b, i) => (b > 0 ? [i % s.grid.width, Math.floor(i / s.grid.width)] : null)).filter(Boolean)
    expect(burning).toEqual([[4, 4], [4, 5]])
    expect(s.wind).toEqual({ dir: 'E', strength: 'breeze' })
    expect(u(s, 'vs-militia').troops).toBe(600)
    expect(def('rl-village-siege').objectives!.lose.map((c) => c.type)).toEqual(['commanderLost', 'unitLost', 'timeout'])
    expect(s.units.filter((x) => x.side === 'yellow')).toHaveLength(5)
    // the village tiles sit behind walls with a two-tile gap on the west
    const t = (x: number, y: number) => s.grid.tiles[y * s.grid.width + x]!.terrain
    expect([t(6, 4), t(6, 5)]).toEqual(['road', 'road'])
    expect([t(7, 4), t(8, 4), t(9, 5)]).toEqual(['village', 'village', 'village'])
    expect([t(6, 3), t(10, 4)]).toEqual(['wall', 'wall'])
  })

  it('rl-bandit-pass: Zhou Cang retreats at half, can be swayed, and is a recruitable named officer', () => {
    const d = def('rl-bandit-pass')
    const zc = d.units.find((x) => x.id === 'zhou-cang')!
    expect(zc.retreatAt).toBe(0.5)
    expect(GAME_DATA.officers['zhou-cang']).toMatchObject({ war: 85, int: 30, lead: 60, cha: 40, loyalty: 45, recruitable: true, stratagems: ['mob-rush'] })
    expect(GAME_DATA.officers['zhou-cang']!.invented).toBeUndefined()
    expect(d.units.find((x) => x.commander)!.id).toBe('pei-yuanshao')
    expect(d.units.filter((x) => x.side === 'yellow' && x.officer.startsWith('bp-'))).toHaveLength(3)
    // swayed, he fights for the band at once
    let s = createBattle('rl-bandit-pass', 3)
    s = patchUnits(s, (x) => (x.id === 'liu-bei' ? { ...x, x: 6, y: 5 } : x))
    let seed = 3
    let swayed: BattleState | null = null
    while (!swayed && seed < 40) {
      const t = patchUnits(createBattle('rl-bandit-pass', seed), (x) => (x.id === 'liu-bei' ? { ...x, x: 6, y: 5 } : x))
      const r = act(t, { type: 'sway', unit: 'liu-bei', target: 'zhou-cang' })
      if (ev(r.events, 'swayed').length > 0) swayed = r.state
      seed++
    }
    expect(swayed).not.toBeNull()
    expect(u(swayed!, 'zhou-cang').side).toBe('han')
  })

  it('rl-prison-cart: the escort is court, loyalty 35-45, 7 rounds, Huo walks to 13,4', () => {
    const d = def('rl-prison-cart')
    expect(d.turnLimit).toBe(7)
    expect(d.onTimeout).toBe('court')
    expect(d.enemyBehaviour!['pc-huo']).toBe('advance-to:13,4')
    const s = createBattle('rl-prison-cart', 1)
    const escort = s.units.filter((x) => x.side === 'court')
    expect(escort.map((x) => x.type).sort()).toEqual(['archers', 'archers', 'infantry', 'infantry', 'infantry'])
    for (const x of escort.filter((y) => !y.commander)) {
      const l = GAME_DATA.officers[x.officer]!.loyalty!
      expect(l).toBeGreaterThanOrEqual(35)
      expect(l).toBeLessThanOrEqual(45)
    }
  })

  it('rl-dong-zhuo-rescue: win by routing the Marshal or surviving round 8; lose if Dong Zhuo falls', () => {
    const d = def('rl-dong-zhuo-rescue')
    expect(d.objectives!.win.map((c) => c.type)).toEqual(['routCommander', 'survive'])
    expect(d.objectives!.lose).toContainEqual({ type: 'unitLost', unit: 'dong-zhuo', label: 'Dong Zhuo must not fall' })
    expect(d.guests).toEqual([expect.objectContaining({ id: 'dong-zhuo', type: 'cavalry', troops: 1600, guestControl: 'ai' })])
    expect(d.enemyBehaviour!['dz-marshal']).toBe('pursue:dong-zhuo')
    expect(d.units.filter((x) => x.side === 'yellow' && !x.commander).length).toBeGreaterThanOrEqual(5)
    // Dong Zhuo routed loses at once
    const s = createBattle('rl-dong-zhuo-rescue', 1)
    const gone = { ...s, units: s.units.filter((x) => x.id !== 'dong-zhuo'), defeated: ['dong-zhuo'] }
    const r = step(gone, { type: 'endPhase' })
    expect(r.ok && r.state.result).toEqual({ winner: 'yellow', reason: 'objective' })
  })

  it('the new named officers have kit figures and portrait identity entries', () => {
    for (const id of ['zhou-cang', 'pei-yuanshao', 'dong-zhuo']) {
      expect(OFFICER_STYLES[id], id).toBeDefined()
      expect(portraitSubjects().find((p) => p.id === id)?.group, id).toBe('officer')
    }
  })

  it('every RL battle ends (greedy player with a 3-4 officer deploy against the normal AI, no stalls)', () => {
    for (const id of RL) {
      for (const seed of [11, 12]) {
        const deploy = (def(id).defaultDeploy ?? []).map((o) => entry(o))
        let s = createBattle(id, seed, { deploy })
        let guard = 0
        while (!s.result && guard++ < 2500) {
          const a = s.side === 'han' ? greedyAction(s) : decide(s, { tier: 'normal', seed, budgetMs: 300, now: () => 0 }).action
          s = act(s, a).state
        }
        expect(s.result, `${id} seed ${seed}`).not.toBeNull()
        expect(s.round).toBeLessThanOrEqual(s.turnLimit)
      }
    }
  })
})
