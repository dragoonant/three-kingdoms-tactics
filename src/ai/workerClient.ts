// Main-thread helper: ask the AI worker for a decision, with a hard timeout and a greedy fallback.
// Never rejects. If Workers are unavailable (tests, old browsers) it runs the decider in-thread instead.
import type { Action, BattleState } from '../engine'
import { greedyAction } from './greedy'
import type { Decision, Tier } from './decider'
import { handleRequest, type BotRequest, type BotResponse } from './worker'

export const BOT_TIMEOUT_MS = 2000

/** The slice of the Worker API the client uses (so tests can inject a fake). */
export interface WorkerLike {
  postMessage(msg: BotRequest): void
  terminate(): void
  onmessage: ((e: { data: BotResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
}

export interface BotClientOptions {
  timeoutMs?: number
  /** Returns a worker, or null when none is available (then the decider runs in-thread). */
  factory?: () => WorkerLike | null
}

export interface BotClient {
  decide(state: BattleState, opts: { tier: Tier; seed: number; budgetMs?: number }): Promise<Decision>
  dispose(): void
}

function defaultFactory(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
  } catch {
    return null
  }
}

function greedyDecision(state: BattleState, why: string): Decision {
  let action: Action
  try {
    action = greedyAction(state)
  } catch {
    action = { type: 'endPhase' }
  }
  return { action, tier: 'easy', gain: 0, considered: 0, truncated: false, fallback: 'greedy', label: `greedy fallback (${why})`, ms: 0 }
}

export function createBotClient(options: BotClientOptions = {}): BotClient {
  const timeoutMs = options.timeoutMs ?? BOT_TIMEOUT_MS
  const factory = options.factory ?? defaultFactory
  let worker: WorkerLike | null = null
  let seq = 0
  const pending = new Map<number, (d: Decision) => void>()

  function drop(): void {
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      try {
        worker.terminate()
      } catch {
        /* already gone */
      }
    }
    worker = null
  }

  function ensure(): WorkerLike | null {
    if (worker) return worker
    const w = factory()
    if (!w) return null
    w.onmessage = (e) => {
      const msg = e.data
      const resolve = pending.get(msg.id)
      if (!resolve) return // a late answer for a request that already timed out
      pending.delete(msg.id)
      resolve('decision' in msg ? msg.decision : greedyDecision(lastState.get(msg.id)!, msg.error))
    }
    w.onerror = () => {
      // The worker died: answer every outstanding request from the greedy bot and start fresh next time.
      for (const [id, resolve] of [...pending]) {
        pending.delete(id)
        resolve(greedyDecision(lastState.get(id)!, 'worker error'))
      }
      drop()
    }
    worker = w
    return w
  }

  const lastState = new Map<number, BattleState>()

  return {
    decide(state, opts) {
      const id = ++seq
      const req: BotRequest = { id, state, tier: opts.tier, seed: opts.seed, ...(opts.budgetMs !== undefined ? { budgetMs: opts.budgetMs } : {}) }
      return new Promise<Decision>((resolve) => {
        lastState.set(id, state)
        let settled = false
        const done = (d: Decision): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          pending.delete(id)
          lastState.delete(id)
          resolve(d)
        }
        const timer = setTimeout(() => {
          // No answer in time: take the greedy move and replace the (possibly wedged) worker.
          done(greedyDecision(state, 'timeout'))
          drop()
        }, timeoutMs)
        pending.set(id, done)
        let w: WorkerLike | null = null
        try {
          w = ensure()
        } catch {
          w = null
        }
        if (!w) {
          // No worker: run the decider right here. It is budgeted, so this stays short.
          const r = handleRequest(req)
          done('decision' in r ? r.decision : greedyDecision(state, r.error))
          return
        }
        try {
          w.postMessage(req)
        } catch {
          done(greedyDecision(state, 'postMessage failed'))
          drop()
        }
      })
    },
    dispose() {
      for (const [id, resolve] of [...pending]) {
        pending.delete(id)
        const st = lastState.get(id)
        resolve(st ? greedyDecision(st, 'disposed') : ({ action: { type: 'endPhase' }, tier: 'easy', gain: 0, considered: 0, truncated: false, fallback: 'endPhase', label: 'disposed', ms: 0 } as Decision))
      }
      drop()
    },
  }
}
