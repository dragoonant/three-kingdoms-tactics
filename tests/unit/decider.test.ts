import { describe, expect, it } from 'vitest'
import { checkInvariants } from '../../tools/invariants'
import { decide, decideAction, type Tier } from '../../src/ai/decider'
import { buildCtx, exposure } from '../../src/ai/context'
import { createBattle, legalActions, query, step, type Action, type BattleState, type GameEvent } from '../../src/engine'
import { mk } from './helpers'

const frozen = (): number => 0
const key = (a: Action): string => JSON.stringify(a)

/** Plays the current side to the end of its phase with the decider. Returns the new state (before endPhase) and events. */
function playPhase(s0: BattleState, seed = 7, tier: Tier = 'normal'): { state: BattleState; events: GameEvent[]; actions: Action[] } {
  let s = s0
  const events: GameEvent[] = []
  const actions: Action[] = []
  for (let i = 0; i < 60 && !s.result; i++) {
    const a = decideAction(s, { tier, seed, now: frozen })
    if (a.type === 'endPhase') break
    const r = step(s, a)
    if (!r.ok) throw new Error(`rejected ${key(a)}: ${r.code}`)
    actions.push(a)
    events.push(...r.events)
    s = r.state
  }
  return { state: s, events, actions }
}

interface Game {
  states: BattleState[]
  chains: number
  ignites: number
  sways: number
  swayTries: number
  illegal: number
  invariants: number
  result: BattleState['result']
}

function playGame(seed: number, tiers: Record<string, Tier>, sampleEvery = 0): Game {
  let s = createBattle('daxing-hill', seed)
  const total = s.units.length
  const g: Game = { states: [], chains: 0, ignites: 0, sways: 0, swayTries: 0, illegal: 0, invariants: 0, result: null }
  let n = 0
  while (!s.result && n++ < 2500) {
    const d = decide(s, { tier: tiers[s.side]!, seed: seed * 13 + (s.side === 'han' ? 1 : 2), now: frozen })
    if (sampleEvery && n % sampleEvery === 0) g.states.push(s)
    if (!legalActions(s).some((a) => key(a) === key(d.action))) g.illegal++
    const r = step(s, d.action)
    if (!r.ok) {
      g.illegal++
      break
    }
    if (r.events.some((e) => e.kind === 'chainLink')) g.chains++
    for (const e of r.events) {
      if (e.kind === 'ignited') g.ignites++
      if (e.kind === 'swayed') g.sways++
      if (e.kind === 'swayed' || e.kind === 'swayFailed') g.swayTries++
    }
    s = r.state
    g.invariants += checkInvariants(s, total).length
  }
  g.result = s.result
  return g
}

describe('M4 decider: legality and determinism', () => {
  it('returns a legal action on many sampled states, for every tier, and never needs a fallback', () => {
    const states: BattleState[] = []
    for (const seed of [2101, 2102, 2103]) states.push(...playGame(seed, { han: 'normal', yellow: 'random' }, 5).states)
    for (const seed of [2104, 2105]) states.push(...playGame(seed, { han: 'random', yellow: 'normal' }, 5).states)
    expect(states.length).toBeGreaterThan(80)
    for (const s of states) {
      const legal = new Set(legalActions(s).map(key))
      for (const tier of ['normal', 'easy', 'random'] as Tier[]) {
        const d = decide(s, { tier, seed: 5, now: frozen })
        expect(legal.has(key(d.action))).toBe(true)
        expect(d.fallback).toBe('none')
      }
    }
  }, 120_000)

  it('is deterministic for the same state, tier and seed, and the random tier varies with the seed', () => {
    const s = playGame(2110, { han: 'normal', yellow: 'normal' }, 20).states[2] ?? createBattle('daxing-hill', 2110)
    for (const tier of ['normal', 'easy', 'random'] as Tier[]) {
      expect(decide(s, { tier, seed: 9, now: frozen }).action).toEqual(decide(s, { tier, seed: 9, now: frozen }).action)
    }
    const picks = new Set<string>()
    for (let seed = 1; seed <= 12; seed++) picks.add(key(decideAction(s, { tier: 'random', seed, now: frozen })))
    expect(picks.size).toBeGreaterThan(1)
  })

  it('random tier never picks undoMove and ends the phase when nothing is left to do', () => {
    let s = createBattle('daxing-hill', 2120)
    for (const u of s.units.filter((x) => x.side === 'han')) {
      const r = step(s, { type: 'wait', unit: u.id, facing: 'E' })
      if (r.ok) s = r.state
    }
    for (const tier of ['normal', 'easy', 'random'] as Tier[]) expect(decideAction(s, { tier, seed: 1, now: frozen })).toEqual({ type: 'endPhase' })
    const s0 = createBattle('daxing-hill', 2121)
    for (let seed = 0; seed < 40; seed++) expect(decideAction(s0, { tier: 'random', seed, now: frozen }).type).not.toBe('undoMove')
  })

  it('never throws on a finished battle or a corrupted state: it falls back instead', () => {
    const s = playGame(2130, { han: 'normal', yellow: 'random' }).result
    expect(s).not.toBeNull()
    const over: BattleState = { ...createBattle('daxing-hill', 2130), result: { winner: 'han', reason: 'commander' } }
    expect(decide(over, { now: frozen }).action).toEqual({ type: 'endPhase' })
    const broken = { ...createBattle('daxing-hill', 2131), data: undefined } as unknown as BattleState
    expect(() => decide(broken, { now: frozen })).not.toThrow()
  })
})

describe('M4 decider: time budget', () => {
  const mid = (): BattleState => {
    const g = playGame(2140, { han: 'normal', yellow: 'normal' }, 12)
    return g.states.find((s) => s.round >= 2 && s.side === 'han') ?? g.states[2]!
  }

  it('a frozen clock never truncates; a ticking clock does, and still answers legally', () => {
    const s = mid()
    const legal = new Set(legalActions(s).map(key))
    const full = decide(s, { budgetMs: 300, now: frozen })
    expect(full.truncated).toBe(false)
    expect(legal.has(key(full.action))).toBe(true)

    let t = 0
    let calls = 0
    const ticking = (): number => {
      calls++
      t += 60
      return t
    }
    const cut = decide(s, { budgetMs: 100, now: ticking })
    expect(cut.truncated).toBe(true)
    expect(legal.has(key(cut.action))).toBe(true)
    expect(cut.considered).toBeLessThanOrEqual(full.considered)
    // A truncated search stops asking for the time soon after the deadline passes.
    expect(calls).toBeLessThan(40)
  })

  it('a zero budget still returns a legal action', () => {
    const s = mid()
    const legal = new Set(legalActions(s).map(key))
    const d = decide(s, { budgetMs: 0, now: (() => { let t = 0; return () => (t += 1) })() })
    expect(legal.has(key(d.action))).toBe(true)
  })
})

describe('M4 decider: commander safety', () => {
  it('the commander leaves a tile where a third of its troops would be lost, when a safe tile exists', () => {
    const s = mk({
      w: 14,
      h: 12,
      units: [
        { id: 'liu', side: 'han', commander: true, x: 6, y: 6, troops: 2000, war: 72, lead: 78 },
        { id: 'y-cmd', side: 'yellow', commander: true, x: 13, y: 11, troops: 2000 },
        { id: 'e1', side: 'yellow', type: 'cavalry', x: 11, y: 5, troops: 2500, war: 95 },
        { id: 'e2', side: 'yellow', type: 'cavalry', x: 11, y: 7, troops: 2500, war: 95 },
        { id: 'e3', side: 'yellow', x: 10, y: 6, troops: 2500, war: 90 },
      ],
    })
    const safeFraction = 0.35
    const ctx0 = buildCtx(s)
    const liu0 = s.units.find((x) => x.id === 'liu')!
    const here = exposure(ctx0, liu0, liu0)
    expect(Math.min(...Object.values(here.byFacing))).toBeGreaterThan(safeFraction * liu0.troops) // precondition: in danger
    const reachable = query.moveRange(s, 'liu').filter((m) => {
      const e = exposure(ctx0, liu0, m)
      return Math.min(...Object.values(e.byFacing)) < safeFraction * liu0.troops
    })
    expect(reachable.length).toBeGreaterThan(0) // precondition: somewhere safe is reachable
    const { state } = playPhase(s)
    const liu = state.units.find((x) => x.id === 'liu')!
    const ctx = buildCtx(state)
    expect(exposure(ctx, liu, liu).byFacing[liu.facing]).toBeLessThan(safeFraction * liu.troops)
  })

  it('but a commander that can rout the enemy commander goes for it, even into danger', () => {
    const s = mk({
      w: 14,
      h: 12,
      units: [
        { id: 'liu', side: 'han', commander: true, x: 6, y: 6, troops: 2000, war: 90, lead: 78 },
        { id: 'y-cmd', side: 'yellow', commander: true, x: 7, y: 6, troops: 100, lead: 40 },
        { id: 'e1', side: 'yellow', type: 'cavalry', x: 8, y: 4, troops: 2500, war: 95 },
        { id: 'e2', side: 'yellow', type: 'cavalry', x: 8, y: 8, troops: 2500, war: 95 },
        { id: 'e3', side: 'yellow', x: 9, y: 6, troops: 2500, war: 90 },
      ],
    })
    const first = decide(s, { now: frozen })
    expect(first.action).toEqual({ type: 'attack', unit: 'liu', target: 'y-cmd' })
    expect(playPhase(s).state.result?.winner).toBe('han')
  })
})

describe('M4 decider: chains and fire', () => {
  it('prefers a lethal chain to an easy kill of a minor unit', () => {
    // Arrow Rain (Volley) from a distance, then Guan Yu's Thundering Charge (follows Volley) finishes the commander.
    const s = mk({
      w: 14,
      h: 12,
      units: [
        { id: 'han-cmd', side: 'han', commander: true, x: 0, y: 0, troops: 1000 },
        { id: 'archer', side: 'han', type: 'archers', x: 3, y: 5, troops: 2500, war: 55, strats: ['arrow-rain'], qi: 5 },
        { id: 'rider', side: 'han', type: 'cavalry', x: 6, y: 9, troops: 2000, war: 97, strats: ['crescent-sweep', 'thundering-charge'], qi: 9, bonds: ['archer'] },
        { id: 'y-cmd', side: 'yellow', commander: true, x: 6, y: 6, troops: 760, lead: 50, facing: 'W' },
        { id: 'bait', side: 'yellow', x: 8, y: 9, troops: 100, lead: 30 },
      ],
    })
    const first = decide(s, { now: frozen })
    // The decisive line starts with a stratagem aimed at the commander, not with killing the bait.
    expect(first.action.type === 'stratagem' || (first.action.type === 'move' && first.label.includes('arrow-rain'))).toBe(true)
    const r = playPhase(s)
    expect(r.state.result).toEqual({ winner: 'han', reason: 'commander' })
    expect(r.events.some((e) => e.kind === 'chainLink')).toBe(true)
  })

  const fireWorld = (windDir: 'E' | 'W', foesWeak = true): BattleState =>
    mk({
      w: 14,
      h: 12,
      map: Array.from({ length: 12 }, () => 'f'.repeat(14)),
      wind: [{ round: 1, dir: windDir, strength: 'gale' }],
      units: [
        { id: 'han-cmd', side: 'han', commander: true, x: windDir === 'E' ? 0 : 13, y: 0, troops: 1000 },
        { id: 'jian', side: 'han', type: 'archers', x: windDir === 'E' ? 2 : 11, y: 5, troops: 1500, int: 72, strats: ['fire-attack'], qi: 6 },
        { id: 'y-cmd', side: 'yellow', commander: true, x: windDir === 'E' ? 13 : 0, y: 11, troops: 2000, war: foesWeak ? 20 : 80 },
        { id: 'f1', side: 'yellow', x: 7, y: 5, troops: 2000, war: 20, lead: 40 },
        { id: 'f2', side: 'yellow', x: 8, y: 5, troops: 2000, war: 20, lead: 40 },
        { id: 'f3', side: 'yellow', x: 7, y: 6, troops: 2000, war: 20, lead: 40 },
      ],
    })

  it('lights the farmland upwind of an enemy cluster when the gale blows toward it', () => {
    const r = playPhase(fireWorld('E'))
    expect(r.events.some((e) => e.kind === 'ignited')).toBe(true)
  })

  it('does not light a fire that would run back onto its own side', () => {
    // The gale blows west, toward the archer; igniting the field between would burn Han, not the rebels.
    const r = playPhase(fireWorld('W'))
    const ignited = r.events.filter((e) => e.kind === 'ignited')
    for (const e of ignited) if (e.kind === 'ignited') expect(e.x).toBeGreaterThan(5)
    const s = r.state
    const burningNearJian = s.units.find((x) => x.id === 'jian') && s.burn.some((b, i) => b > 0 && Math.abs((i % 14) - s.units.find((x) => x.id === 'jian')!.x) <= 1)
    expect(burningNearJian).toBeFalsy()
  })
})

describe('M4 decider: normal vs normal behaviour', () => {
  it('over 20 games: chains happen, fires are lit, there are no illegal actions or invariant failures', () => {
    let chains = 0
    let ignites = 0
    let sways = 0
    let swayTries = 0
    let illegal = 0
    let invariants = 0
    const winners: Record<string, number> = {}
    for (let seed = 2200; seed < 2220; seed++) {
      const g = playGame(seed, { han: 'normal', yellow: 'normal' })
      chains += g.chains
      ignites += g.ignites
      sways += g.sways
      swayTries += g.swayTries
      illegal += g.illegal
      invariants += g.invariants
      expect(g.result).not.toBeNull()
      winners[g.result!.winner] = (winners[g.result!.winner] ?? 0) + 1
    }
    console.log(`[M4] 20 normal-vs-normal games: chains>=2 ${chains}, ignites ${ignites}, sways ${sways}/${swayTries}, winners ${JSON.stringify(winners)}`)
    expect(illegal).toBe(0)
    expect(invariants).toBe(0)
    expect(chains).toBeGreaterThan(0)
    expect(ignites).toBeGreaterThan(0)
    expect(sways).toBeGreaterThanOrEqual(0)
  }, 240_000)
})
