import { describe, expect, it } from 'vitest'
import { legalActions, createBattle, type Action } from '../../src/engine'
import { handleRequest, type BotRequest, type BotResponse } from '../../src/ai/worker'
import { createBotClient, type WorkerLike } from '../../src/ai/workerClient'

const key = (a: Action): string => JSON.stringify(a)
const state = createBattle('daxing-hill', 77)

class FakeWorker implements WorkerLike {
  onmessage: ((e: { data: BotResponse }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  terminated = false
  posted: BotRequest[] = []
  constructor(private mode: 'echo' | 'silent' | 'crash' | 'error') {}
  postMessage(msg: BotRequest): void {
    this.posted.push(msg)
    if (this.mode === 'echo') queueMicrotask(() => this.onmessage?.({ data: handleRequest(msg) }))
    else if (this.mode === 'crash') queueMicrotask(() => this.onerror?.(new Error('boom')))
    else if (this.mode === 'error') queueMicrotask(() => this.onmessage?.({ data: { id: msg.id, error: 'bad' } }))
  }
  terminate(): void {
    this.terminated = true
  }
  /** Answers a request late, like a slow worker that was already given up on. */
  late(msg: BotRequest): void {
    this.onmessage?.({ data: handleRequest(msg) })
  }
}

describe('M4 worker protocol', () => {
  it('handleRequest answers with a legal decision and carries the request id', () => {
    const r = handleRequest({ id: 5, state, tier: 'normal', seed: 3 })
    expect('decision' in r && r.id === 5).toBe(true)
    if ('decision' in r) expect(legalActions(state).some((a) => key(a) === key(r.decision.action))).toBe(true)
  })

  it('handleRequest turns an exception into an error response instead of throwing', () => {
    const bad = { id: 1, state: undefined, tier: 'normal', seed: 1 } as unknown as BotRequest
    const r = handleRequest(bad)
    expect(r.id).toBe(1)
    // decide() itself catches and falls back, so either a fallback decision or an error is acceptable; it must not throw.
    expect('decision' in r || 'error' in r).toBe(true)
  })
})

describe('M4 bot client', () => {
  it('returns the worker decision when it answers in time', async () => {
    const w = new FakeWorker('echo')
    const c = createBotClient({ factory: () => w, timeoutMs: 500 })
    const d = await c.decide(state, { tier: 'normal', seed: 1 })
    expect(d.fallback).toBe('none')
    expect(legalActions(state).some((a) => key(a) === key(d.action))).toBe(true)
    expect(w.posted).toHaveLength(1)
    c.dispose()
  })

  it('falls back to greedy after the timeout, terminates the wedged worker, and ignores a late answer', async () => {
    const w = new FakeWorker('silent')
    const c = createBotClient({ factory: () => w, timeoutMs: 25 })
    const t0 = Date.now()
    const d = await c.decide(state, { tier: 'normal', seed: 1 })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(d.fallback).toBe('greedy')
    expect(legalActions(state).some((a) => key(a) === key(d.action))).toBe(true)
    expect(w.terminated).toBe(true)
    expect(() => w.late(w.posted[0]!)).not.toThrow()
    c.dispose()
  })

  it('uses a fresh worker for the next request after a timeout', async () => {
    const made: FakeWorker[] = []
    const c = createBotClient({
      timeoutMs: 25,
      factory: () => {
        const w = new FakeWorker(made.length === 0 ? 'silent' : 'echo')
        made.push(w)
        return w
      },
    })
    expect((await c.decide(state, { tier: 'normal', seed: 1 })).fallback).toBe('greedy')
    expect((await c.decide(state, { tier: 'normal', seed: 1 })).fallback).toBe('none')
    expect(made).toHaveLength(2)
    c.dispose()
  })

  it('falls back to greedy when the worker crashes or reports an error', async () => {
    for (const mode of ['crash', 'error'] as const) {
      const c = createBotClient({ factory: () => new FakeWorker(mode), timeoutMs: 500 })
      const d = await c.decide(state, { tier: 'normal', seed: 1 })
      expect(d.fallback).toBe('greedy')
      expect(legalActions(state).some((a) => key(a) === key(d.action))).toBe(true)
      c.dispose()
    }
  })

  it('runs the decider in-thread when no Worker is available', async () => {
    const c = createBotClient({ factory: () => null })
    const d = await c.decide(state, { tier: 'normal', seed: 1 })
    expect(d.fallback).toBe('none')
    expect(legalActions(state).some((a) => key(a) === key(d.action))).toBe(true)
  })
})
