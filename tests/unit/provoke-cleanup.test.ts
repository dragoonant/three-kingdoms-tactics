import { describe, expect, it } from 'vitest'
import { createBattle, type BattleState } from '../../src/engine'
import { removeUnit, retreatUnit } from '../../src/engine/ops'
import type { GameEvent } from '../../src/engine/types'

// [R2-STRAT-3] A provoke ends when its provoker leaves the board (found by the AI bench: the invariant fired for every policy).
describe('R2-STRAT-3 provoke cleanup', () => {
  for (const [name, leave] of [
    ['routed', removeUnit],
    ['retreated', retreatUnit],
  ] as const) {
    it(`clears provoked when the provoker is ${name}`, () => {
      const w: BattleState = structuredClone(createBattle('daxing-hill', 1))
      const provoker = w.units.find((u) => u.id === 'zhang-fei')!
      const victim = w.units.find((u) => u.id === 'deng-mao')!
      victim.provoked = provoker.id
      const ev: GameEvent[] = []
      leave(w, ev, provoker)
      expect(w.units.find((u) => u.id === 'deng-mao')!.provoked).toBeUndefined()
    })
  }
})
