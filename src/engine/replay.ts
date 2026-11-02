import { createBattle } from './create'
import { step } from './step'
import type { Action, BattleState, CreateOptions } from './types'

/**
 * Rebuild a battle from its seed and action log. Throws if an action in the log is rejected (the log is corrupt).
 * `options` (deploy, run modifiers [RL-MOD-5]) must be the ones the battle was created with.
 */
export function replay(battleId: string, seed: number, actions: Action[], options?: CreateOptions): BattleState {
  let s = createBattle(battleId, seed, options)
  for (let i = 0; i < actions.length; i++) {
    const r = step(s, actions[i]!)
    if (!r.ok) throw new Error(`replay: action ${i} (${actions[i]!.type}) rejected: ${r.code} ${r.message}`)
    s = r.state
  }
  return s
}
