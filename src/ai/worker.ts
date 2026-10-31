// Web Worker entry for the utility AI. The page posts { id, state, tier, seed } and gets back { id, decision }.
// handleRequest is the same code path without the worker plumbing, so tests (and the in-thread fallback) can call it.
import type { BattleState } from '../engine'
import { decide, type Decision, type Tier } from './decider'

export interface BotRequest {
  id: number
  state: BattleState
  tier: Tier
  seed: number
  budgetMs?: number
}

export type BotResponse = { id: number; decision: Decision } | { id: number; error: string }

export function handleRequest(req: BotRequest): BotResponse {
  try {
    const decision = decide(req.state, {
      tier: req.tier,
      seed: req.seed,
      ...(req.budgetMs !== undefined ? { budgetMs: req.budgetMs } : {}),
    })
    return { id: req.id, decision }
  } catch (e) {
    return { id: req.id, error: e instanceof Error ? e.message : String(e) }
  }
}

declare const WorkerGlobalScope: (new () => unknown) | undefined

interface WorkerScope {
  onmessage: ((e: { data: BotRequest }) => void) | null
  postMessage(msg: BotResponse): void
}

// Only wire the message handler when this module really is the worker's global scope.
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof (WorkerGlobalScope as unknown as new () => unknown)) {
  const scope = self as unknown as WorkerScope
  scope.onmessage = (e) => scope.postMessage(handleRequest(e.data))
}
