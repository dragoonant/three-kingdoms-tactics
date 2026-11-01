// The music director on a fake clock and a fake graph (no Web Audio): ramps, phase-lock maths, chains, failsafe, silence.
import { describe, expect, it } from 'vitest'
import { dbToGain, type Manifest, type TrackEntry } from '../../src/client/audio/manifest'
import { CFG, Envelope, loopPosition, MusicDirector, nextBeat, type LoadedInfo, type MusicGraph, type Voice } from '../../src/client/audio/musicDirector'

interface Ramp {
  from: number
  to: number
  start: number
  dur: number
}
class FakeVoice implements Voice {
  ramps: Ramp[] = []
  stopped: number | null = null
  constructor(
    readonly track: TrackEntry,
    readonly when: number,
    readonly offset: number,
    readonly gain0: number,
    readonly kind: 'loop' | 'once',
    readonly bus: 'music' | 'sfx',
  ) {}
  ramp(from: number, to: number, start: number, dur: number): void {
    this.ramps.push({ from, to, start, dur })
  }
  stop(when: number): void {
    this.stopped = when
  }
  get last(): Ramp {
    return this.ramps[this.ramps.length - 1]!
  }
}
class FakeGraph implements MusicGraph {
  t = 0
  voices: FakeVoice[] = []
  missing = new Set<string>()
  loads: string[] = []
  gate: Promise<void> | null = null
  now(): number {
    return this.t
  }
  async load(track: TrackEntry): Promise<LoadedInfo | null> {
    this.loads.push(track.id)
    if (this.gate) await this.gate
    return this.missing.has(track.id) ? null : { duration: track.loopEnd || 10 }
  }
  startLoop(track: TrackEntry, when: number, offset: number, gain0: number): Voice | null {
    if (this.missing.has(track.id)) return null
    const v = new FakeVoice(track, when, offset, gain0, 'loop', 'music')
    this.voices.push(v)
    return v
  }
  startOnce(track: TrackEntry, when: number, bus: 'music' | 'sfx', gain: number): Voice | null {
    if (this.missing.has(track.id)) return null
    const v = new FakeVoice(track, when, 0, gain, 'once', bus)
    this.voices.push(v)
    return v
  }
  of(id: string): FakeVoice[] {
    return this.voices.filter((v) => v.track.id === id)
  }
}

const bed = (id: string, mood: TrackEntry['mood'], over: Partial<TrackEntry> = {}): TrackEntry => ({
  id, file: `${id}.ogg`, bpm: 120, beatsPerBar: 4, loopStart: 0, loopEnd: 16, gainDb: 0, role: 'bed', mood, ...over,
})
const CHARGE: TrackEntry = { id: 'charge', file: 'charge.ogg', bpm: 120, beatsPerBar: 4, loopStart: 0, loopEnd: 8, gainDb: -3, role: 'charge' }
const FULL: Manifest = {
  version: 1,
  tracks: [
    bed('battle', 'battle'),
    bed('tense', 'tense'),
    bed('title', 'title', { bpm: 80 }),
    bed('camp', 'camp', { bpm: 80 }),
    { ...bed('victory', 'victory'), role: 'stinger', loopEnd: 6 },
    CHARGE,
    { id: 'impact', file: 'impact.ogg', bpm: 0, beatsPerBar: 4, loopStart: 0, loopEnd: 0, gainDb: -6, role: 'stinger', cue: 'impact' },
    { id: 'seal', file: 'seal.ogg', bpm: 0, beatsPerBar: 4, loopStart: 0, loopEnd: 0, gainDb: 0, role: 'stinger', cue: 'seal' },
  ],
}
const DUCK = dbToGain(CFG.duckDb)
const near = (a: number, b: number, d = 1e-6): void => expect(Math.abs(a - b)).toBeLessThan(d)

async function battle(m: Manifest = FULL, startAt = 0): Promise<{ g: FakeGraph; d: MusicDirector }> {
  const g = new FakeGraph()
  g.t = startAt
  const d = new MusicDirector(g, m)
  d.setMood('battle')
  await d.settled()
  return { g, d }
}

describe('pure helpers', () => {
  it('loopPosition wraps inside the loop region and passes through the intro', () => {
    expect(loopPosition(3, 0, 16)).toBe(3)
    expect(loopPosition(17.5, 0, 16)).toBe(1.5)
    expect(loopPosition(21, 4, 16)).toBe(9) // 4 + (17 % 12)
    expect(loopPosition(5, 0, 0)).toBe(5)
  })
  it('Envelope ramps linearly, replaces a ramp that has not begun, and continues from the live value', () => {
    const e = new Envelope(0)
    e.rampTo(1, 10, 2)
    near(e.value(9), 0)
    near(e.value(11), 0.5)
    near(e.value(13), 1)
    const from = e.rampTo(0, 11, 1)
    near(from, 0.5)
    near(e.value(11.5), 0.25)
    e.rampTo(1, 20, 1) // future ramp
    e.rampTo(0.2, 15, 0) // cancels it (start earlier than the pending ramp)
    near(e.value(21), 0.2)
  })
  it('nextBeat finds the next beat at or after a time, with its bar position across a loop', () => {
    const b = nextBeat(10, 120, 4, 0, 16, 13.1)
    near(b.time, 13.5)
    expect(b.beatIndex).toBe(7)
    expect(b.beatInBar).toBe(3)
    const w = nextBeat(10, 120, 4, 0, 16, 27.25)
    near(w.time, 27.5)
    expect(w.beatIndex).toBe(3) // 17.5 s into a 16 s loop is 1.5 s in
    expect(w.beatInBar).toBe(3)
    near(nextBeat(10, 120, 4, 0, 16, 12).time, 12) // exactly on a beat counts
  })
})

describe('beds', () => {
  it('starts the bed for a mood with a 2 s fade-in at its track gain', async () => {
    const g = new FakeGraph()
    g.t = 5
    const d = new MusicDirector(g, { version: 1, tracks: [bed('battle', 'battle', { gainDb: -6 })] })
    d.setMood('battle')
    await d.settled()
    const v = g.of('battle')[0]!
    expect(v.kind).toBe('loop')
    expect(v.when).toBe(5)
    expect(v.last).toEqual({ from: 0, to: dbToGain(-6), start: 5, dur: 2 })
  })
  it('crossfades on a mood change over 2 s and stops the old voice afterwards', async () => {
    const { g, d } = await battle()
    g.t = 30
    d.setMood('title')
    await d.settled()
    expect(g.of('battle')[0]!.last).toEqual({ from: 1, to: 0, start: 30, dur: 2 })
    expect(g.of('title')[0]!.last).toEqual({ from: 0, to: 1, start: 30, dur: 2 })
    d.tick()
    expect(g.of('battle')[0]!.stopped).toBeNull()
    g.t = 32.2
    d.tick()
    expect(g.of('battle')[0]!.stopped).toBe(32.2)
    expect(d.debug().bed).toBe('title')
  })
  it('falls back from tense to the battle bed without restarting it', async () => {
    const { g, d } = await battle({ version: 1, tracks: [bed('battle', 'battle')] })
    d.setMood('tense')
    await d.settled()
    expect(g.of('battle')).toHaveLength(1)
    expect(g.of('battle')[0]!.stopped).toBeNull()
    expect(d.debug().bed).toBe('battle')
  })
  it('a missing file falls through to the next candidate, and to silence when none loads', async () => {
    const g = new FakeGraph()
    g.missing.add('tense')
    const d = new MusicDirector(g, FULL)
    d.setMood('tense')
    await d.settled()
    expect(d.debug().bed).toBe('battle')
    g.missing.add('battle')
    g.t = 3
    d.setMood('camp')
    await d.settled()
    d.setMood('battle')
    await d.settled()
    expect(d.debug().bed).toBeNull()
    expect(() => d.tick()).not.toThrow()
  })
  it('a victory jingle (stinger role) plays once and takes over faster than a crossfade', async () => {
    const { g, d } = await battle()
    g.t = 50
    d.setMood('victory')
    await d.settled()
    const v = g.of('victory')[0]!
    expect(v.kind).toBe('once')
    expect(g.of('battle')[0]!.last.dur).toBe(CFG.stingerFade)
    g.t = 57
    d.tick()
    expect(d.debug().bed).toBeNull() // the jingle ran out
  })
  it('is silent with an empty manifest: no voices, no throws, zero levels', async () => {
    const g = new FakeGraph()
    const d = new MusicDirector(g, { version: 1, tracks: [] })
    d.setMood('battle')
    d.cutinStart('full', 7)
    await d.settled()
    expect(d.stinger('impact')).toBe(false)
    d.cutinEnd()
    d.cutinSkip()
    d.tick()
    expect(g.voices).toHaveLength(0)
    expect(d.levels()).toEqual({ bed: 0, charge: 0 })
    expect(d.debug().charge).toBe('idle')
  })
})

describe('charge overlay: start', () => {
  it('different tempo: starts at once; the bed ducks -6 dB over 0.3 s and the charge fades in over 0.4 s', async () => {
    const m: Manifest = { version: 1, tracks: [bed('battle', 'battle'), { ...CHARGE, bpm: 100 }] }
    const { g, d } = await battle(m, 20)
    g.t = 30.123
    d.cutinStart('full', 7)
    await d.settled()
    const c = g.of('charge')[0]!
    expect(c.when).toBe(30.123)
    expect(c.offset).toBe(0)
    expect(c.last).toEqual({ from: 0, to: dbToGain(-3), start: 30.123, dur: 0.4 })
    const b = g.of('battle')[0]!
    near(b.last.to, DUCK)
    near(DUCK, 0.5012, 1e-3)
    expect(b.last.start).toBe(30.123)
    expect(b.last.dur).toBe(0.3)
    expect(d.debug().lock).toBeNull()
    expect(d.debug().charge).toBe('active')
  })
  it('same tempo: phase-locks to the next beat of the bed and enters the charge file at the same bar position', async () => {
    const { g, d } = await battle(FULL, 10) // bed started at t=10, 0.5 s beats, 2 s bars
    g.t = 13.1
    d.cutinStart('full', 7)
    await d.settled()
    const c = g.of('charge')[0]!
    near(c.when, 13.5)
    near(c.offset, 1.5) // beat 7 is the 4th beat of its bar
    near(c.last.start, 13.5)
    near(g.of('battle')[0]!.last.start, 13.5) // the duck lands with the charge, not before it
    expect(d.debug().lock?.beatInBar).toBe(3)
    // 0.05 s lookahead: a beat 0.02 s away is too late, the next one is taken
    const { g: g2, d: d2 } = await battle(FULL, 0)
    g2.t = 4.48
    d2.cutinStart('full')
    await d2.settled()
    near(g2.of('charge')[0]!.when, 5)
  })
  it('on a downbeat the charge file starts from its own beginning; across the bed loop the bar position still lines up', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 3.9
    d.cutinStart('full')
    await d.settled()
    near(g.of('charge')[0]!.when, 4)
    expect(g.of('charge')[0]!.offset).toBe(0)
    const { g: g2, d: d2 } = await battle(FULL, 0)
    g2.t = 17.2 // into the second pass of the 16 s loop
    d2.cutinStart('full')
    await d2.settled()
    near(g2.of('charge')[0]!.when, 17.5)
    near(g2.of('charge')[0]!.offset, 1.5)
  })
  it('a different beats-per-bar does not lock', async () => {
    const m: Manifest = { version: 1, tracks: [bed('battle', 'battle'), { ...CHARGE, beatsPerBar: 3 }] }
    const { g, d } = await battle(m, 0)
    g.t = 3.3
    d.cutinStart('full')
    await d.settled()
    expect(g.of('charge')[0]!.when).toBe(3.3)
  })
  it('with no bed playing the charge layer still sounds, immediately', async () => {
    const g = new FakeGraph()
    g.t = 2
    const d = new MusicDirector(g, FULL)
    d.cutinStart('full')
    await d.settled()
    expect(g.of('charge')[0]!.when).toBe(2)
  })
  it('a short cut-in swells in over 0.25 s', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 4
    d.cutinStart('short', 2.5)
    await d.settled()
    expect(g.of('charge')[0]!.last.dur).toBe(0.25)
  })
  it('a missing charge file means no voice and no duck', async () => {
    const g = new FakeGraph()
    g.missing.add('charge')
    const d = new MusicDirector(g, FULL)
    d.setMood('battle')
    await d.settled()
    g.t = 4
    d.cutinStart('full')
    await d.settled()
    expect(g.of('charge')).toHaveLength(0)
    expect(g.of('battle')[0]!.ramps).toHaveLength(1) // only the fade-in
    expect(d.debug()).toMatchObject({ charge: 'idle', ducked: false })
  })
  it('cutinEnd before a slow file has loaded cancels the start: nothing sounds', async () => {
    const g = new FakeGraph()
    const d = new MusicDirector(g, FULL)
    d.setMood('battle')
    await d.settled()
    let open!: () => void
    g.gate = new Promise((r) => (open = r))
    d.cutinStart('full')
    expect(d.debug().charge).toBe('pending')
    d.cutinEnd()
    open()
    await d.settled()
    await new Promise((r) => setTimeout(r, 0))
    expect(g.of('charge')).toHaveLength(0)
    expect(d.debug().charge).toBe('idle')
  })
  it('a beat that has not arrived when the cut-in ends is cancelled and the bed is not left ducked', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 3.1
    d.cutinStart('full')
    await d.settled()
    g.t = 3.2 // the lock beat is at 3.5
    d.cutinEnd()
    expect(g.of('charge')[0]!.stopped).toBe(3.2)
    expect(d.debug()).toMatchObject({ charge: 'idle', ducked: false })
    near(g.of('battle')[0]!.last.to, 1)
  })
})

describe('charge overlay: end, skip, chains, failsafe', () => {
  async function up(kind: 'full' | 'short' = 'full'): Promise<{ g: FakeGraph; d: MusicDirector }> {
    const r = await battle(FULL, 0)
    r.g.t = 4
    r.d.cutinStart(kind, 7)
    await r.d.settled()
    r.g.t = 10 // fully up
    return r
  }
  it('cutinEnd fades the charge out over 1.2 s, un-ducks the bed, then stops the voice', async () => {
    const { g, d } = await up()
    d.cutinEnd()
    const c = g.of('charge')[0]!
    expect(c.last).toEqual({ from: dbToGain(-3), to: 0, start: 10, dur: 1.2 })
    expect(g.of('battle')[0]!.last).toEqual({ from: DUCK, to: 1, start: 10, dur: 1.2 })
    expect(d.debug().charge).toBe('releasing')
    g.t = 11
    d.tick()
    expect(c.stopped).toBeNull()
    g.t = 11.25
    d.tick()
    expect(c.stopped).toBe(11.25)
    expect(d.debug()).toMatchObject({ charge: 'idle', ducked: false })
    expect(d.levels().charge).toBe(0)
    near(d.levels().bed, 1)
  })
  it('a short cut-in releases over 0.8 s', async () => {
    const { g, d } = await up('short')
    d.cutinEnd()
    expect(g.of('charge')[0]!.last.dur).toBe(0.8)
    expect(g.of('battle')[0]!.last.dur).toBe(0.8)
  })
  it('cutinSkip fades in 0.5 s', async () => {
    const { g, d } = await up()
    d.cutinSkip()
    expect(g.of('charge')[0]!.last).toMatchObject({ to: 0, start: 10, dur: 0.5 })
    expect(g.of('battle')[0]!.last).toMatchObject({ to: 1, start: 10, dur: 0.5 })
  })
  it('a skip during a slow release speeds it up from the current level', async () => {
    const { g, d } = await up()
    d.cutinEnd()
    g.t = 10.4
    d.cutinSkip()
    const r = g.of('charge')[0]!.last
    expect(r.start).toBe(10.4)
    expect(r.dur).toBe(0.5)
    near(r.from, dbToGain(-3) * (1 - 0.4 / 1.2), 1e-6)
    g.t = 10.95
    d.tick()
    expect(g.of('charge')[0]!.stopped).toBe(10.95)
  })
  it('a chain keeps one charge voice: later links change nothing audible', async () => {
    const { g, d } = await up()
    const rampsBefore = g.of('charge')[0]!.ramps.length
    g.t = 12
    d.cutinStart('full', 7)
    g.t = 14
    d.cutinStart('full', 7)
    await d.settled()
    expect(g.of('charge')).toHaveLength(1)
    expect(g.of('charge')[0]!.ramps).toHaveLength(rampsBefore)
    expect(g.of('battle')[0]!.ramps).toHaveLength(2) // fade-in + one duck
    d.cutinEnd() // one end after the last link
    expect(g.of('charge')[0]!.last.to).toBe(0)
  })
  it('a link that starts inside the previous fade-out swells the same voice back up', async () => {
    const { g, d } = await up()
    d.cutinEnd()
    g.t = 10.6 // halfway through the 1.2 s release
    d.cutinStart('full', 7)
    expect(g.of('charge')).toHaveLength(1)
    const r = g.of('charge')[0]!.last
    expect(r).toMatchObject({ start: 10.6, dur: 0.4 })
    near(r.from, dbToGain(-3) * 0.5)
    near(r.to, dbToGain(-3))
    near(g.of('battle')[0]!.last.to, DUCK)
    expect(d.debug().charge).toBe('active')
    g.t = 30
    d.tick() // the earlier release must not stop it
    expect(g.of('charge')[0]!.stopped).toBeNull()
  })
  it('failsafe: with no cutinEnd the layer fades out after max(scene + 2 s, 12 s)', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 4
    d.cutinStart('full', 7) // deadline 4 + 12
    await d.settled()
    g.t = 15.9
    d.tick()
    expect(d.debug().charge).toBe('active')
    g.t = 16
    d.tick()
    expect(d.debug().charge).toBe('releasing')
    expect(g.of('charge')[0]!.last).toMatchObject({ to: 0, start: 16, dur: 1.2 })
    // a long scene waits for scene + 2 s
    const r = await battle(FULL, 0)
    r.g.t = 4
    r.d.cutinStart('full', 15)
    await r.d.settled()
    r.g.t = 20.9
    r.d.tick()
    expect(r.d.debug().charge).toBe('active')
    r.g.t = 21
    r.d.tick()
    expect(r.d.debug().charge).toBe('releasing')
  })
  it('each chain link refreshes the failsafe deadline', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 4
    d.cutinStart('full', 7)
    await d.settled()
    g.t = 12
    d.cutinStart('full', 7) // new deadline 24
    g.t = 20
    d.tick()
    expect(d.debug().charge).toBe('active')
    g.t = 24
    d.tick()
    expect(d.debug().charge).toBe('releasing')
  })
  it('a result jingle (victory) takes the charge layer down quickly', async () => {
    const { g, d } = await up()
    d.setMood('victory')
    expect(g.of('charge')[0]!.last).toMatchObject({ to: 0, dur: CFG.skipOut })
  })
  it('levels() follow the ramps on the audio clock', async () => {
    const { g, d } = await battle(FULL, 0)
    g.t = 4
    d.cutinStart('full')
    await d.settled()
    g.t = 4.4 // the lock beat is 4.5: nothing has moved yet
    expect(d.levels().charge).toBe(0)
    near(d.levels().bed, 1)
    g.t = 4.6
    const mid = d.levels()
    near(mid.charge, dbToGain(-3) * 0.25)
    near(mid.bed, 1 - (1 - DUCK) * (0.1 / 0.3))
    g.t = 5
    near(d.levels().bed, DUCK)
  })
  it('after a mood change during a cut-in the new bed starts already ducked', async () => {
    const { g, d } = await up()
    g.t = 11
    d.setMood('tense')
    await d.settled()
    near(g.of('tense')[0]!.last.to, DUCK)
  })
})

describe('stingers', () => {
  it('play on the sfx bus at their gain and are rate-limited per cue', async () => {
    const { g, d } = await battle()
    g.t = 5
    // a stinger that was never decoded is skipped (late is worse than never)
    expect(d.stinger('impact')).toBe(true)
    const s = g.of('impact')[0]!
    expect(s.bus).toBe('sfx')
    expect(s.gain0).toBeCloseTo(dbToGain(-6))
    g.t = 5.05
    expect(d.stinger('impact')).toBe(false)
    expect(d.stinger('seal')).toBe(true)
    g.t = 5.3
    expect(d.stinger('impact')).toBe(true)
  })
  it('caps concurrent stingers', async () => {
    const { g, d } = await battle()
    let n = 0
    for (let i = 0; i < 20; i++) {
      g.t = 5 + i * 0.08 // a burst inside two seconds
      if (d.stinger(i % 2 ? 'seal' : 'impact')) n++
    }
    expect(n).toBe(CFG.maxStingers)
  })
  it('a missing stinger file is silent', async () => {
    const g = new FakeGraph()
    g.missing.add('impact')
    const d = new MusicDirector(g, FULL)
    expect(d.stinger('impact')).toBe(false)
  })
})

describe('lifecycle', () => {
  it('dispose stops everything and later calls do nothing', async () => {
    const { g, d } = await battle()
    g.t = 4
    d.cutinStart('full')
    await d.settled()
    d.dispose()
    expect(g.voices.every((v) => v.stopped !== null)).toBe(true)
    const n = g.voices.length
    d.setMood('title')
    d.cutinStart('full')
    await d.settled()
    expect(g.voices).toHaveLength(n)
  })
  it('silence() fades the bed and the charge layer out', async () => {
    const { g, d } = await battle()
    g.t = 4
    d.cutinStart('full')
    await d.settled()
    g.t = 6
    d.silence()
    expect(g.of('battle')[0]!.last.to).toBe(0)
    expect(g.of('charge')[0]!.last.to).toBe(0)
  })
})
