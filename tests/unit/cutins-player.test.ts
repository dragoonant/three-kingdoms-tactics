// The presentation side of the in-battle cut-ins: planBeats folds the combat events into one cut-in beat, the director waits
// for the cut-in and lands the result when the camera rises out, and the player runs a chain with one music start and one end.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../../src/client/audio'
import { DEFAULT_CUTIN_SETTINGS, planCutins, sequenceTiming, type PlanOptions, type SequencePlan } from '../../src/client/cutins/plan'
import { CutinPlayer } from '../../src/client/cutins/player'
import { SCENE_INFO } from '../../src/client/cutins/sceneInfo'
import { samplePlan } from '../../src/client/cutins/scenes'
import { planBeats, type Beat } from '../../src/client/presentation/beats'
import { Director, type DirectorIO } from '../../src/client/presentation/director'
import { applyEvents, sceneFromState, type Scene } from '../../src/client/presentation/scene'
import type { GameEvent } from '../../src/engine'
import { act, ev, mk, strat } from './helpers'

const opts: PlanOptions = { settings: DEFAULT_CUTIN_SETTINGS, speed: 'full', playerSide: 'han' }

function battle() {
  const s = mk({
    units: [
      { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, strats: ['arrow-rain'], qi: 3 },
      { id: 'b1', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 4 },
      { id: 'c1', side: 'han', x: 6, y: 4, strats: ['serpent-thrust'], qi: 3 },
      { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000, lead: 50 },
    ],
  })
  return s
}

describe('planBeats with cut-ins', () => {
  it('a stratagem chain becomes one cut-in beat that commits every event once, and keeps the board beats as inner', () => {
    const s = battle()
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    const beats = planBeats(r.events, s, opts)
    const cut = beats.filter((b) => b.fx.t === 'cutin')
    expect(cut).toHaveLength(1)
    const committed = beats.flatMap((b) => b.commit)
    expect(committed).toHaveLength(r.events.length)
    expect(new Set(committed).size).toBe(r.events.length)
    const end = beats.reduce<Scene>((sc, b) => applyEvents(sc, b.commit), sceneFromState(s))
    const ref = r.events.reduce<Scene>((sc, e) => applyEvents(sc, [e]), sceneFromState(s))
    expect(end).toEqual(ref)
    const fx = cut[0]!.fx
    if (fx.t !== 'cutin') throw new Error('unreachable')
    expect(fx.plan.links.length).toBe(1 + ev(r.events, 'chainLink').length)
    expect(fx.inner.some((b) => b.fx.t === 'damage')).toBe(true)
    expect(cut[0]!.ms).toBeCloseTo(sequenceTiming(fx.plan).seconds * 1000, 0)
  })

  it('without cut-in options (or at Instant, or Off) the beats are the old ones', () => {
    const s = battle()
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    expect(planBeats(r.events, s).some((b) => b.fx.t === 'cutin')).toBe(false)
    expect(planBeats(r.events, s, { ...opts, speed: 'instant' }).some((b) => b.fx.t === 'cutin')).toBe(false)
    expect(planBeats(r.events, s, { ...opts, settings: { battleScenes: 'off', enemyScenes: 'same' } }).some((b) => b.fx.t === 'cutin')).toBe(false)
  })

  it('a normal attack is one short cut-in; the trailing facing change and end of phase stay ordinary beats', () => {
    const s = battle()
    const r = act(s, { type: 'attack', unit: 'b1', target: 'e' })
    const beats = planBeats(r.events, s, opts)
    expect(beats[0]!.fx.t).toBe('cutin')
    const range = planCutins(r.events, s, opts)[0]!
    expect(range.plan.full).toBe(false)
    expect(beats.flatMap((b) => b.commit)).toHaveLength(r.events.length)
  })
})

function harness(cutin: boolean) {
  const log: string[] = []
  let scene = sceneFromState(battle())
  const hooks: { onResult?: () => void; onDone?: () => void } = {}
  const io: DirectorIO = {
    speed: () => 'full',
    scene: () => scene,
    setScene: (sc) => {
      scene = sc
    },
    beatStart: (b) => log.push(`start:${b.fx.t}`),
    committed: (e) => log.push(`commit:${e.length}`),
    idle: () => log.push('idle'),
    ...(cutin
      ? {
          cutin: (_b: Beat, h) => {
            hooks.onResult = h.onResult
            hooks.onDone = h.onDone
            log.push('cutin')
          },
          cutinCancel: () => log.push('cancel'),
          resultLanded: () => log.push('landed'),
        }
      : {}),
  }
  return { io, log, hooks, scene: () => scene }
}

afterEach(() => vi.useRealTimers())

describe('director with a cut-in', () => {
  it('waits for the cut-in, lands the result when it says so (before it ends), then plays the rest', () => {
    vi.useFakeTimers()
    const h = harness(true)
    const s = battle()
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    const d = new Director(h.io)
    const beats = planBeats([...r.events, { kind: 'roundStarted', round: 2 } as GameEvent], s, opts)
    d.play(beats, sceneFromState(r.state))
    expect(h.log).toEqual(['start:cutin', 'cutin'])
    expect(d.inCutin).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(h.log).toEqual(['start:cutin', 'cutin']) // nothing moves on without the cut-in
    h.hooks.onResult!()
    expect(h.log.slice(2)).toEqual(['landed', `commit:${r.events.length}`])
    expect(d.inCutin).toBe(true)
    h.hooks.onResult!() // idempotent
    expect(h.log.filter((x) => x === 'landed')).toHaveLength(1)
    h.hooks.onDone!()
    expect(d.inCutin).toBe(false)
    expect(h.log).toContain('start:banner')
  })

  it('a skip during the cut-in cancels it and commits everything exactly once', () => {
    vi.useFakeTimers()
    const h = harness(true)
    const s = battle()
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    const d = new Director(h.io)
    d.play(planBeats(r.events, s, opts), sceneFromState(r.state))
    d.skip()
    expect(h.log).toContain('cancel')
    expect(h.log.filter((x) => x.startsWith('commit:'))).toEqual([`commit:${r.events.length}`])
    expect(h.log[h.log.length - 1]).toBe('idle')
    expect(d.playing).toBe(false)
    // a late callback from the cancelled cut-in does nothing
    h.hooks.onDone!()
    h.hooks.onResult!()
    expect(h.log.filter((x) => x.startsWith('commit:'))).toHaveLength(1)
  })

  it('a skip after the result landed does not commit twice', () => {
    vi.useFakeTimers()
    const h = harness(true)
    const s = battle()
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    const d = new Director(h.io)
    d.play(planBeats(r.events, s, opts), sceneFromState(r.state))
    h.hooks.onResult!()
    d.skip()
    expect(h.log.filter((x) => x.startsWith('commit:'))).toHaveLength(1)
  })
})

describe('the player', () => {
  function chainPlan(n: number): SequencePlan {
    return { full: true, enemy: false, rate: 1, links: Array.from({ length: n }, (_, i) => ({ ...samplePlan(i % 2 ? 'C' : 'A'), link: i, links: n, bond: i === 2 })) }
  }

  it('plays a chain: one music start, one end, links in order, a seal after each non-final link, result before done', () => {
    const start = vi.spyOn(audio, 'cutinStart')
    const end = vi.spyOn(audio, 'cutinEnd')
    const skip = vi.spyOn(audio, 'cutinSkip')
    const p = new CutinPlayer()
    p.manual = true
    const calls: string[] = []
    const plan = chainPlan(3)
    p.start(plan, { onResult: () => calls.push('result'), onDone: () => calls.push('done') })
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0]![0]).toBe('full')
    expect(p.history).toHaveLength(1)
    let seals = 0
    let sealPhases = 0
    for (let n = 0; n < 4000 && p.active; n++) {
      // the layer reports the world mounted after each (re)mount
      if (!p.isReady) p.markReady()
      p.step(1 / 20)
      const v = p.getSnapshot()
      if (v.phase === 'seal') sealPhases++
      seals = Math.max(seals, v.seals.length)
    }
    expect(p.active).toBe(false)
    expect(calls).toEqual(['result', 'done'])
    expect(p.history.map((s) => s.id)).toEqual(['A', 'C', 'A'])
    expect(p.history.map((s) => s.params!.link)).toEqual([0, 1, 2])
    expect(seals).toBe(2)
    expect(sealPhases).toBeGreaterThan(0)
    expect(end).toHaveBeenCalledTimes(1)
    expect(skip).not.toHaveBeenCalled()
    start.mockRestore()
    end.mockRestore()
    skip.mockRestore()
  })

  it('short scenes tell the music "short"; a chain never restarts it', () => {
    const start = vi.spyOn(audio, 'cutinStart')
    const p = new CutinPlayer()
    p.manual = true
    p.start({ full: false, enemy: false, rate: 1, links: [samplePlan('S-melee')] }, { onResult: () => {}, onDone: () => {} })
    expect(start.mock.calls[0]![0]).toBe('short')
    p.skip()
    start.mockRestore()
  })

  it('the clock runs only after the world is mounted, and runs at the plan rate', () => {
    const p = new CutinPlayer()
    p.manual = true
    p.start({ full: true, enemy: false, rate: 1.5, links: [samplePlan('C')] }, { onResult: () => {}, onDone: () => {} })
    p.step(1)
    expect(p.controller.t).toBe(0)
    p.markReady()
    p.step(1)
    expect(p.controller.t).toBeCloseTo(1.5, 9)
    p.skip()
  })

  it('the result lands when the camera starts rising out, not before; the sequence length matches the timing', () => {
    const p = new CutinPlayer()
    p.manual = true
    let resultAt = -1
    let time = 0
    const plan: SequencePlan = { full: true, enemy: false, rate: 1, links: [samplePlan('D')] }
    p.start(plan, { onResult: () => (resultAt = p.controller.t), onDone: () => {} })
    p.markReady()
    while (p.active) {
      p.step(0.05)
      time += 0.05
    }
    expect(resultAt).toBeGreaterThanOrEqual(SCENE_INFO.D.resultAt)
    expect(resultAt).toBeLessThan(SCENE_INFO.D.resultAt + 0.1)
    expect(time).toBeCloseTo(sequenceTiming(plan).seconds, 0)
  })

  it('skip() jumps to the end: cutinSkip, then the result and done hooks so the director carries on', () => {
    const skip = vi.spyOn(audio, 'cutinSkip')
    const p = new CutinPlayer()
    p.manual = true
    const calls: string[] = []
    p.start(chainPlan(2), { onResult: () => calls.push('result'), onDone: () => calls.push('done') })
    p.markReady()
    p.step(0.5)
    p.skip()
    expect(p.active).toBe(false)
    expect(calls).toEqual(['result', 'done'])
    expect(skip).toHaveBeenCalledTimes(1)
    skip.mockRestore()
  })

  it('cancel (the director skipped its batch) stops at once: cutinSkip, no hooks, idle', () => {
    const skip = vi.spyOn(audio, 'cutinSkip')
    const end = vi.spyOn(audio, 'cutinEnd')
    const p = new CutinPlayer()
    p.manual = true
    const calls: string[] = []
    p.start(chainPlan(2), { onResult: () => calls.push('result'), onDone: () => calls.push('done') })
    p.markReady()
    p.step(0.5)
    p.cancel()
    expect(p.active).toBe(false)
    expect(calls).toEqual([])
    expect(skip).toHaveBeenCalledTimes(1)
    expect(end).not.toHaveBeenCalled()
    p.step(1)
    expect(calls).toEqual([])
    skip.mockRestore()
    end.mockRestore()
  })
})
