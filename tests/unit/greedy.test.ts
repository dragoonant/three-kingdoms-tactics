import { describe, expect, it } from 'vitest'
import { checkInvariants } from '../../tools/invariants'
import { chooseAction, makePolicyRng } from '../../tools/policy'
import { greedyAction } from '../../src/ai/greedy'
import { createBattle, legalActions, step, type Action, type BattleState, type Side } from '../../src/engine'

interface Outcome {
  state: BattleState
  steps: number
  problems: string[]
  log: Action[]
}

function play(seed: number, players: Record<Side, 'greedy' | 'random'>): Outcome {
  const rnd = makePolicyRng(seed * 31)
  let s = createBattle('daxing-hill', seed)
  const total = s.units.length
  const problems = [...checkInvariants(s, total)]
  const log: Action[] = []
  let guard = 0
  while (!s.result && guard++ < 2500) {
    const a = players[s.side] === 'greedy' ? greedyAction(s) : chooseAction(s, rnd)
    const legal = legalActions(s)
    if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(a))) problems.push(`seed ${seed}: bot chose an illegal action ${JSON.stringify(a)}`)
    const r = step(s, a)
    if (!r.ok) {
      problems.push(`seed ${seed}: rejected ${JSON.stringify(a)} ${r.code}`)
      break
    }
    log.push(a)
    s = r.state
    problems.push(...checkInvariants(s, total))
  }
  return { state: s, steps: guard, problems, log }
}

describe('greedy bot (M3)', () => {
  it('greedy vs greedy finishes inside the turn limit with no invariant errors', () => {
    for (const seed of [1, 2, 3]) {
      const o = play(seed, { han: 'greedy', yellow: 'greedy' })
      expect(o.problems).toEqual([])
      expect(o.state.result).not.toBeNull()
      expect(o.state.round).toBeLessThanOrEqual(o.state.turnLimit)
    }
  }, 120_000)

  it('greedy (han) vs a random policy finishes with no invariant errors', () => {
    let wins = 0
    const seeds = [11, 12, 13, 14]
    for (const seed of seeds) {
      const o = play(seed, { han: 'greedy', yellow: 'random' })
      expect(o.problems).toEqual([])
      expect(o.state.result).not.toBeNull()
      if (o.state.result?.winner === 'han') wins++
    }
    // Not a strength guarantee, only a smoke check that the bot is not worse than chance against noise.
    expect(wins).toBeGreaterThanOrEqual(1)
  }, 120_000)

  it('ends the phase when no unit is ready', () => {
    let s = createBattle('daxing-hill', 5)
    // Mark every han unit done by waiting each one in place.
    for (const u of s.units.filter((x) => x.side === 'han')) {
      const r = step(s, { type: 'wait', unit: u.id, facing: 'E' })
      if (r.ok) s = r.state
    }
    expect(greedyAction(s)).toEqual({ type: 'endPhase' })
  })
})
