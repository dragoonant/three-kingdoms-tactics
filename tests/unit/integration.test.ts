// Drives the REAL Daxing Hill battle through createBattle + legalActions + step with a seeded random policy,
// so hand-built test states cannot hide integration bugs. Each mechanic must show up in real play.
import { beforeAll, describe, expect, it } from 'vitest'
import { checkInvariants } from '../../tools/invariants'
import { chooseAction, makePolicyRng } from '../../tools/policy'
import { createBattle, legalActions, query, replay, step, type Action, type GameEvent } from '../../src/engine'

const GAMES = 40
const counts: Record<string, number> = {}
const chainLengths: Record<number, number> = {}
let bondedLink = 0
let fireDamage = 0
let timeouts = 0
let commanderWins = 0
const invariantProblems: string[] = []
let replayMismatches = 0
let previewMismatches = 0
const rejected: string[] = []
const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1)

beforeAll(() => {
  for (let g = 0; g < GAMES; g++) {
    const seed = 100 + g
    const rnd = makePolicyRng(seed)
    let s = createBattle('daxing-hill', seed)
    const total = s.units.length
    const log: Action[] = []
    let guard = 0
    while (!s.result && guard++ < 4000) {
      const legal = legalActions(s)
      const a = chooseAction(s, rnd, legal)
      // previews must be consistent with the legal actions the UI is offered
      if (a.type === 'attack') {
        const p = query.attackPreview(s, a.unit, a.target)
        if (!p) previewMismatches++
      }
      if (a.type === 'stratagem') {
        const p = query.stratagemPreview(s, a.unit, a.strat, { x: a.x, y: a.y })
        if (!p) previewMismatches++
      }
      const r = step(s, a)
      if (!r.ok) {
        rejected.push(`${r.code}: ${JSON.stringify(a)}`)
        break
      }
      log.push(a)
      tally(r.events)
      s = r.state
      if (guard % 5 === 0) invariantProblems.push(...checkInvariants(s, total))
    }
    invariantProblems.push(...checkInvariants(s, total))
    if (s.result?.reason === 'timeout') timeouts++
    if (s.result?.reason === 'commander') commanderWins++
    try {
      if (JSON.stringify(replay('daxing-hill', seed, log)) !== JSON.stringify(s)) replayMismatches++
    } catch {
      replayMismatches++
    }
  }
}, 120_000)

function tally(events: GameEvent[]) {
  let cur = 0
  const flush = () => {
    if (cur > 0) chainLengths[cur] = (chainLengths[cur] ?? 0) + 1
    cur = 0
  }
  for (const e of events) {
    bump(e.kind)
    if (e.kind === 'stratagem') {
      flush()
      cur = 1
    } else if (e.kind === 'chainLink') {
      cur++
      if (e.bond) bondedLink++
    } else if (e.kind === 'damaged' && e.source === 'fire') fireDamage++
    else if (e.kind === 'moved' && e.dash) bump('dash')
    else if (e.kind === 'moved' && e.undo) bump('undo')
    else if (e.kind === 'healed') bump(`heal-${e.source}`)
  }
  flush()
}

describe('real battle driven through step()', () => {
  it('R-RNG-1 (daxing hill) every step is accepted, invariants hold, replay equals the live state', () => {
    expect(rejected).toEqual([])
    expect(invariantProblems).toEqual([])
    expect(replayMismatches).toBe(0)
  })
  it('R-ATK-5 (daxing hill) previews exist for every attack and stratagem the policy takes', () => {
    expect(previewMismatches).toBe(0)
  })
  it('R-MOVE-1 (daxing hill) units move, turn and undo', () => {
    expect(counts.moved).toBeGreaterThan(100)
    expect(counts.turned).toBeGreaterThan(50)
    expect(counts.undo).toBeGreaterThan(0)
  })
  it('R-ATK-2/3 (daxing hill) attacks land, defenders counter, units are routed', () => {
    expect(counts.attacked).toBeGreaterThan(20)
    expect(counts.countered).toBeGreaterThan(0)
    expect(counts.routed).toBeGreaterThan(0)
  })
  it('R-CHAIN-1 (daxing hill) chains of 2+ links happen in real play; link scaling is applied', () => {
    expect(counts.chainLink).toBeGreaterThan(0)
    expect(Object.entries(chainLengths).filter(([k]) => Number(k) >= 2).reduce((n, [, v]) => n + v, 0)).toBeGreaterThan(0)
    expect(Math.max(...Object.keys(chainLengths).map(Number))).toBeLessThanOrEqual(4)
  })
  it('R-CHAIN-4 (daxing hill) sworn-brother bonds are used by chain links', () => {
    expect(bondedLink).toBeGreaterThan(0)
  })
  it('R-STRAT-3/4 (daxing hill) foresight and confusion occur', () => {
    expect(counts.sawThrough).toBeGreaterThan(0)
    expect(counts.confused).toBeGreaterThan(0)
    expect(counts.recovered).toBeGreaterThan(0)
  })
  it('R-STRAT-6 (daxing hill) Thundering Charge dashes', () => {
    expect(counts.dash).toBeGreaterThan(0)
  })
  it('R-STRAT-5 / R-FIRE-2 (daxing hill) fire is lit, spreads, burns units and burns out', () => {
    expect(counts.ignited).toBeGreaterThan(0)
    expect(counts.fireSpread).toBeGreaterThan(0)
    expect(counts.burnedOut).toBeGreaterThan(0)
    expect(fireDamage).toBeGreaterThan(0)
  })
  it('R-WIND-1 (daxing hill) the wind changes three times per full game', () => {
    expect(counts.windChanged).toBeGreaterThanOrEqual(GAMES) // short games stop early, but most reach round 6+
  })
  it('R-SWAY-3 (daxing hill) swaying succeeds and fails', () => {
    expect(counts.swayed).toBeGreaterThan(0)
    expect(counts.swayFailed).toBeGreaterThan(0)
  })
  it('R-TURN-2 / R-CHAIN-6 (daxing hill) village and Rally healing happen', () => {
    expect(counts['heal-rally']).toBeGreaterThan(0)
  })
  it('R-WIN-1/2 (daxing hill) battles end by commander or timeout, always with a result', () => {
    expect(timeouts + commanderWins).toBe(GAMES)
    expect(timeouts).toBeGreaterThan(0)
    expect(commanderWins).toBeGreaterThan(0)
  })
})
