import { describe, expect, it } from 'vitest'
import { greedyAction } from '../../src/ai/greedy'
import { EVENT_KINDS, createBattle, step, type GameEvent } from '../../src/engine'
import { LEDGER_FORMATTERS, lineFor } from '../../src/client/ledger'

describe('event ledger', () => {
  it('has a player-facing formatter for every engine event kind (and no stray ones)', () => {
    expect(Object.keys(LEDGER_FORMATTERS).sort()).toEqual([...EVENT_KINDS].sort())
    for (const k of EVENT_KINDS) expect(typeof LEDGER_FORMATTERS[k]).toBe('function')
  })

  it('every event of real games, including wind, fire and the end, reads as a clean sentence', () => {
    const kinds = new Set<string>()
    for (const seed of [1, 2, 3, 4]) {
      let s = createBattle('daxing-hill', seed)
      let guard = 0
      while (!s.result && guard++ < 2500) {
        const r = step(s, greedyAction(s))
        if (!r.ok) throw new Error(r.message)
        for (const e of r.events as GameEvent[]) {
          const line = lineFor(e, s)
          kinds.add(e.kind)
          expect(line.text.length).toBeGreaterThan(5)
          expect(line.text).not.toMatch(/undefined|NaN|\[object|null/)
        }
        s = r.state
      }
    }
    for (const k of ['moved', 'attacked', 'damaged', 'routed', 'stratagem', 'phaseStarted', 'roundStarted', 'battleEnded']) expect(kinds.has(k)).toBe(true)
  }, 60_000)

  it('covers the kinds random play rarely produces by formatting hand-made events', () => {
    const s = createBattle('daxing-hill', 1)
    const samples: GameEvent[] = [
      { kind: 'windChanged', dir: 'W', strength: 'gale', round: 9 },
      { kind: 'windChanged', dir: null, strength: 'calm', round: 6 },
      { kind: 'burnedOut', x: 5, y: 3 },
      { kind: 'fireSpread', from: { x: 5, y: 3 }, to: { x: 6, y: 3 } },
      { kind: 'ignited', x: 5, y: 3, by: 'jian-yong', strat: 'fire-attack' },
      { kind: 'healed', unit: 'liu-bei', amount: 100, source: 'village' },
      { kind: 'healed', unit: 'liu-bei', amount: 100, source: 'rally', by: 'liu-bei' },
      { kind: 'swayed', unit: 'liu-bei', target: 'captain-gao', chance: 70, side: 'han' },
      { kind: 'swayFailed', unit: 'liu-bei', target: 'captain-gao', chance: 70 },
      { kind: 'sawThrough', unit: 'zhang-fei', by: 'jian-yong', strat: 'sow-discord', chance: 40 },
      { kind: 'confused', unit: 'zhang-fei', source: 'fire', chance: 50 },
      { kind: 'recovered', unit: 'zhang-fei' },
      { kind: 'battleEnded', winner: 'han', reason: 'commander' },
      { kind: 'battleEnded', winner: 'yellow', reason: 'timeout' },
    ]
    for (const e of samples) expect(lineFor(e, s).text).toMatch(/\w/)
  })
})
