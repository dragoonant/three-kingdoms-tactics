import { afterEach, describe, expect, it, vi } from 'vitest'
import { greedyAction } from '../../src/ai/greedy'
import { createBattle, step, type Action, type BattleState, type GameEvent } from '../../src/engine'
import { beatDuration, planBeats, BANNER_MS, type Beat } from '../../src/client/presentation/beats'
import { Director } from '../../src/client/presentation/director'
import { applyEvents, comparable, sceneFromState, type Scene } from '../../src/client/presentation/scene'
import { act, ev, mk, strat } from './helpers'

interface Batch {
  before: BattleState
  after: BattleState
  events: GameEvent[]
}

function batches(seed: number, policy: (s: BattleState) => Action): Batch[] {
  const out: Batch[] = []
  let s = createBattle('daxing-hill', seed)
  let guard = 0
  while (!s.result && guard++ < 2500) {
    const r = step(s, policy(s))
    if (!r.ok) throw new Error(r.message)
    out.push({ before: s, after: r.state, events: r.events })
    s = r.state
  }
  return out
}

function check(b: Batch): Beat[] {
  const beats = planBeats(b.events, b.before)
  // every event is committed by exactly one beat
  const committed = beats.flatMap((x) => x.commit)
  expect(committed).toHaveLength(b.events.length)
  expect(new Set(committed).size).toBe(b.events.length)
  for (const e of b.events) expect(committed).toContain(e)
  // replaying the commits on the old presented scene reaches the live state's picture
  const end = beats.reduce<Scene>((sc, x) => applyEvents(sc, x.commit), sceneFromState(b.before))
  expect(comparable(end, !b.after.result)).toEqual(comparable(sceneFromState(b.after), !b.after.result))
  for (const x of beats) {
    expect(x.ms).toBeGreaterThan(0)
    expect(beatDuration(x, 'instant')).toBe(0)
    expect(beatDuration(x, 'quick')).toBeLessThanOrEqual(x.ms)
    expect(beatDuration(x, 'full')).toBe(x.ms)
  }
  return beats
}

describe('presentation director: beat planning (pure)', () => {
  it('commits every event once and the presented scene converges to the live state, over whole games', () => {
    const seen = new Set<string>()
    for (const seed of [1, 2, 3]) {
      for (const b of batches(seed, greedyAction)) for (const x of check(b)) seen.add(x.fx.t)
    }
    // the greedy games must have exercised the main kinds of beat
    for (const t of ['move', 'turn', 'lunge', 'damage', 'stratagem', 'banner', 'rout', 'wait', 'confuse']) expect(seen.has(t)).toBe(true)
  }, 60_000)

  it('passing every phase crosses wind changes: wind beat, then round scroll, nothing lost', () => {
    const bs = batches(7, () => ({ type: 'endPhase' }))
    const kinds: string[] = []
    for (const b of bs) for (const x of check(b)) kinds.push(x.fx.t)
    expect(kinds.filter((k) => k === 'wind').length).toBeGreaterThanOrEqual(3) // rounds 6, 9, 12
    const banners = bs.flatMap((b) => planBeats(b.events, b.before)).filter((x) => x.fx.t === 'banner')
    expect(banners.every((x) => x.ms === BANNER_MS)).toBe(true)
    expect(banners.length).toBeGreaterThanOrEqual(15)
    expect(kinds[kinds.length - 1]).toBe('end')
  })

  it('a round rollover plays the wind beat before the round scroll, which commits roundStarted and phaseStarted', () => {
    const bs = batches(7, () => ({ type: 'endPhase' }))
    const roll = bs.find((b) => b.events.some((e) => e.kind === 'windChanged' && e.round === 6))!
    const beats = planBeats(roll.events, roll.before)
    const wi = beats.findIndex((x) => x.fx.t === 'wind')
    const bi = beats.findIndex((x) => x.fx.t === 'banner')
    expect(wi).toBeGreaterThanOrEqual(0)
    expect(wi).toBeLessThan(bi)
    expect(beats[bi]!.commit.map((e) => e.kind)).toEqual(['roundStarted', 'phaseStarted'])
    const f = beats[bi]!.fx
    expect(f.t === 'banner' && f.title).toBe('Round 6')
  })

  it('a 4-link chain plans one seal beat per link, in order, with damage beats between', () => {
    const base = mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, strats: ['arrow-rain'], qi: 3 },
        { id: 'b1', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 4 },
        { id: 'c1', side: 'han', x: 6, y: 4, strats: ['serpent-thrust'], qi: 3 },
        { id: 'f1', side: 'han', x: 7, y: 5, strats: ['twin-blades'], qi: 3 },
        { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000, lead: 50 },
      ],
    })
    const r = act(base, strat('a1', 'arrow-rain', 6, 5))
    expect(ev(r.events, 'chainLink').length).toBe(3)
    const beats = planBeats(r.events, base)
    const seals = beats.filter((x) => x.fx.t === 'stratagem').map((x) => (x.fx.t === 'stratagem' ? [x.fx.link, x.fx.chainSize] : []))
    expect(seals).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
    ])
    // between consecutive seals there is at least one damage beat (each link hit the target)
    const order = beats.map((x) => x.fx.t)
    const firstSeal = order.indexOf('stratagem')
    expect(order[firstSeal + 1]).toBe('damage')
    expect(check({ before: base, after: r.state, events: r.events })).toHaveLength(beats.length)
  })

  it('plays a strike as lunge, then damage, then the counter lunge and its damage', () => {
    const s0 = mk({
      units: [
        { id: 'p', side: 'han', x: 4, y: 4, facing: 'E', qi: 0 },
        { id: 'q', side: 'yellow', x: 5, y: 4, facing: 'W', troops: 5000 },
      ],
    })
    const r = act(s0, { type: 'attack', unit: 'p', target: 'q' })
    const order = planBeats(r.events, s0).map((x) => x.fx.t + (x.fx.t === 'lunge' && x.fx.counter ? '*' : ''))
    expect(order.slice(order.indexOf('lunge'), order.indexOf('lunge') + 4)).toEqual(['lunge', 'damage', 'lunge*', 'damage'])
  })
})

describe('presentation director: playback', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function rig(speed: 'full' | 'quick' | 'instant') {
    const s0 = createBattle('daxing-hill', 3)
    const r = step(s0, { type: 'endPhase' })
    if (!r.ok) throw new Error('x')
    let scene = sceneFromState(s0)
    const log: string[] = []
    const committed: GameEvent[] = []
    let idle = 0
    const d = new Director({
      speed: () => speed,
      scene: () => scene,
      setScene: (s) => {
        scene = s
      },
      beatStart: (b, ms) => log.push(`${b.fx.t}:${ms}`),
      committed: (e) => committed.push(...e),
      idle: () => {
        idle++
      },
    })
    return { s0, r, d, get scene() { return scene }, log, committed, get idle() { return idle } }
  }

  it('plays beats on a timer and ends on the final scene', () => {
    vi.useFakeTimers()
    const t = rig('full')
    t.d.play(planBeats(t.r.events, t.s0), sceneFromState(t.r.state))
    expect(t.d.playing).toBe(true)
    expect(t.scene.side).toBe('han') // still the old picture
    vi.advanceTimersByTime(BANNER_MS + 10)
    expect(t.d.playing).toBe(false)
    expect(t.idle).toBe(1)
    expect(t.scene.side).toBe('yellow')
    expect(t.committed).toHaveLength(t.r.events.length)
  })

  it('a skip snaps to the final scene at once and still commits every event', () => {
    vi.useFakeTimers()
    const t = rig('full')
    t.d.play(planBeats(t.r.events, t.s0), sceneFromState(t.r.state))
    t.d.skip()
    expect(t.d.playing).toBe(false)
    expect(t.scene.side).toBe('yellow')
    expect(t.committed).toHaveLength(t.r.events.length)
    expect(t.idle).toBe(1)
  })

  it('instant speed completes synchronously', () => {
    const t = rig('instant')
    t.d.play(planBeats(t.r.events, t.s0), sceneFromState(t.r.state))
    expect(t.d.playing).toBe(false)
    expect(t.log.every((l) => l.endsWith(':0'))).toBe(true)
    expect(t.scene.side).toBe('yellow')
  })
})
