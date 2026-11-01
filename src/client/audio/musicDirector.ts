// The music director: pure scheduling logic with no Web Audio and no DOM, so a fake clock and a fake graph can test it
// (tests/unit/audio-director.test.ts). Everything musical is placed on the audio clock (`graph.now()`), never on timers;
// `tick()` only polls that clock to retire finished voices and to fire the cut-in failsafe.
//
// Layers: one BED per mood (2 s crossfades), one CHARGE overlay layer that a cut-in lays over the ducked bed (the owner's
// request, 2026-11-01: charging music during cut-ins, removed when they end), and STINGERS (impact, seal) on the sfx bus.
// A missing or undecodable file is silence: the director never throws and never starts a voice for a track it cannot load.
import { candidatesForCharge, candidatesForMood, dbToGain, stingerFor, type Manifest, type Mood, type StingerCue, type TrackEntry } from './manifest'

export interface Voice {
  /** Linear gain ramp: hold `from` until `start`, reach `to` at `start + dur`. */
  ramp(from: number, to: number, start: number, dur: number): void
  /** Stop playback at audio-clock time `when`. */
  stop(when: number): void
}
export interface LoadedInfo {
  /** Decoded length in seconds. */
  duration: number
}
export interface MusicGraph {
  /** The audio clock (AudioContext.currentTime). */
  now(): number
  /** Fetch + decode (cached). Resolves null for a missing or undecodable file. */
  load(track: TrackEntry): Promise<LoadedInfo | null>
  /** Start a looping voice on the music bus at `when`, reading from `offset` seconds into the file. Null if not loaded. */
  startLoop(track: TrackEntry, when: number, offset: number, gain0: number): Voice | null
  /** Start a one-shot voice. */
  startOnce(track: TrackEntry, when: number, bus: 'music' | 'sfx', gain: number): Voice | null
}

export type CutinKind = 'full' | 'short'

export const CFG = {
  crossfade: 2,
  /** A victory/defeat jingle takes over faster than a bed crossfade. */
  stingerFade: 1,
  duckDb: -6,
  duckRamp: 0.3,
  chargeIn: { full: 0.4, short: 0.25 } as Record<CutinKind, number>,
  chargeOut: { full: 1.2, short: 0.8 } as Record<CutinKind, number>,
  skipOut: 0.5,
  failsafeMin: 12,
  failsafeExtra: 2,
  /** Scene length assumed when the caller does not pass one. */
  defaultScene: 7,
  /** A beat closer than this to "now" is too late to schedule; take the next one. */
  lockLookahead: 0.05,
  stingerGap: 0.15,
  maxStingers: 6,
}

/** A piecewise-linear model of one gain parameter. Mirrors what the voice's AudioParam is told, so levels can be read back. */
export class Envelope {
  private t0 = 0
  private v0: number
  private t1 = 0
  private v1: number
  constructor(v = 0) {
    this.v0 = v
    this.v1 = v
  }
  value(t: number): number {
    if (t <= this.t0) return this.v0
    if (t >= this.t1) return this.v1
    return this.v0 + ((this.v1 - this.v0) * (t - this.t0)) / (this.t1 - this.t0)
  }
  /** Ramp from whatever the value is at `start` to `target`; returns that starting value. A ramp that had not begun is replaced. */
  rampTo(target: number, start: number, dur: number): number {
    const from = this.value(start)
    this.t0 = start
    this.v0 = from
    this.t1 = start + Math.max(0, dur)
    this.v1 = target
    return from
  }
  set(v: number): void {
    this.t0 = this.t1 = 0
    this.v0 = this.v1 = v
  }
}

/** Position inside the file after `elapsed` seconds of playback from offset 0 with a loop region. */
export function loopPosition(elapsed: number, loopStart: number, loopEnd: number): number {
  if (loopEnd <= loopStart || elapsed < loopEnd) return elapsed
  return loopStart + ((elapsed - loopStart) % (loopEnd - loopStart))
}

export interface BeatLock {
  /** Audio-clock time of the beat. */
  time: number
  /** Beat counted from the start of the bed's file loop, 0-based. */
  beatIndex: number
  /** Position in its bar, 0..beatsPerBar-1. */
  beatInBar: number
}

/** The first beat of a bed that began at `startTime` (offset 0) at or after `after`. */
export function nextBeat(startTime: number, bpm: number, beatsPerBar: number, loopStart: number, loopEnd: number, after: number): BeatLock {
  const beat = 60 / bpm
  const elapsed = Math.max(0, after - startTime)
  const k = Math.ceil(elapsed / beat - 1e-9)
  const pos = loopPosition(k * beat, loopStart, loopEnd)
  const beatIndex = Math.round(pos / beat)
  return { time: startTime + k * beat, beatIndex, beatInBar: ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar }
}

export function sameTempo(a: TrackEntry, b: TrackEntry): boolean {
  return a.bpm > 0 && b.bpm > 0 && Math.abs(a.bpm - b.bpm) < 0.05 && a.beatsPerBar === b.beatsPerBar
}

interface Channel {
  track: TrackEntry
  voice: Voice
  env: Envelope
  startTime: number
  loop: boolean
  loopStart: number
  loopEnd: number
  /** Voice may be stopped once the clock passes this. */
  stopAt: number | null
}

export type ChargeState = 'idle' | 'pending' | 'active' | 'releasing'

export interface DirectorDebug {
  mood: Mood | null
  bed: string | null
  charge: ChargeState
  chargeTrack: string | null
  ducked: boolean
  /** The beat the charge layer was locked to, when it was. */
  lock: (BeatLock & { offset: number }) | null
  kind: CutinKind
  deadline: number | null
}

export class MusicDirector {
  private mood: Mood | null = null
  private moodToken = 0
  private bed: Channel | null = null
  private readonly retiring: Channel[] = []
  private pendingMood: Promise<void> = Promise.resolve()

  private chargeState: ChargeState = 'idle'
  private chargeToken = 0
  private charge: Channel | null = null
  private pendingCharge: Promise<void> = Promise.resolve()
  private kind: CutinKind = 'full'
  private deadline: number | null = null
  private releaseEnd = 0
  private ducked = false
  private lock: (BeatLock & { offset: number }) | null = null

  private readonly lastCue = new Map<StingerCue, number>()
  private readonly stingerEnds: number[] = []
  private disposed = false

  constructor(
    private readonly graph: MusicGraph,
    private manifest: Manifest,
  ) {}

  setManifest(m: Manifest): void {
    this.manifest = m
  }

  // ---------------------------------------------------------------- beds

  setMood(mood: Mood): void {
    if (this.disposed) return
    if (mood === this.mood) return
    this.mood = mood
    const token = ++this.moodToken
    if (mood === 'victory' || mood === 'defeat') this.release(CFG.skipOut)
    if (mood === 'battle' || mood === 'tense') this.preloadCharge()
    this.pendingMood = this.applyMood(mood, token).catch(() => {})
  }

  private bedTarget(track: TrackEntry): number {
    return dbToGain(track.gainDb) * (this.ducked ? dbToGain(CFG.duckDb) : 1)
  }

  private async applyMood(mood: Mood, token: number): Promise<void> {
    let pick: TrackEntry | null = null
    let info: LoadedInfo | null = null
    for (const c of candidatesForMood(this.manifest, mood)) {
      const i = await this.graph.load(c)
      if (token !== this.moodToken || this.disposed) return
      if (i) {
        pick = c
        info = i
        break
      }
    }
    if (!pick || !info) {
      this.retireBed(CFG.crossfade)
      return
    }
    if (this.bed && this.bed.track.id === pick.id && (this.bed.loop || this.bed.stopAt === null)) return
    const now = this.graph.now()
    const once = pick.role === 'stinger'
    const fade = once ? CFG.stingerFade : CFG.crossfade
    this.retireBed(fade)
    const target = this.bedTarget(pick)
    const voice = once ? this.graph.startOnce(pick, now, 'music', 0) : this.graph.startLoop(pick, now, 0, 0)
    if (!voice) return
    const ch: Channel = {
      track: pick,
      voice,
      env: new Envelope(0),
      startTime: now,
      loop: !once,
      loopStart: pick.loopStart,
      loopEnd: pick.loopEnd > pick.loopStart ? pick.loopEnd : info.duration,
      stopAt: once ? now + info.duration + 0.1 : null,
    }
    this.ramp(ch, target, now, once ? 0.05 : fade)
    this.bed = ch
  }

  private retireBed(fade: number): void {
    const b = this.bed
    if (!b) return
    const now = this.graph.now()
    this.ramp(b, 0, now, fade)
    b.stopAt = Math.max(b.stopAt ?? 0, now + fade + 0.05)
    this.retiring.push(b)
    this.bed = null
  }

  private ramp(ch: Channel, target: number, start: number, dur: number): void {
    const from = ch.env.rampTo(target, start, dur)
    ch.voice.ramp(from, target, start, dur)
  }

  // ---------------------------------------------------------------- charge overlay

  /**
   * A cut-in begins. The bed ducks and the charge layer fades in together (on the next beat of the bed when both share a
   * tempo). A cut-in while the layer is already up (a chain) changes nothing but the failsafe deadline.
   * `kind` 'short' is the 2-3 s normal-attack cut-in: a quicker swell and release. `sceneSeconds` sizes the failsafe.
   */
  cutinStart(kind: CutinKind = 'full', sceneSeconds: number = CFG.defaultScene): void {
    if (this.disposed) return
    const now = this.graph.now()
    this.kind = kind
    this.deadline = now + Math.max(sceneSeconds + CFG.failsafeExtra, CFG.failsafeMin)
    if (this.chargeState === 'active' || this.chargeState === 'pending') return
    if (this.chargeState === 'releasing' && this.charge) {
      // Back to back inside the previous link's fade-out: the same voice swells again, no restart.
      this.ramp(this.charge, this.chargeTarget(this.charge.track), now, CFG.chargeIn[kind])
      this.setDuck(true, now)
      this.chargeState = 'active'
      return
    }
    this.chargeState = 'pending'
    const token = ++this.chargeToken
    this.pendingCharge = this.startCharge(token).catch(() => {
      if (token === this.chargeToken) this.chargeState = 'idle'
    })
  }

  private chargeTarget(t: TrackEntry): number {
    return dbToGain(t.gainDb)
  }

  private preloadCharge(): void {
    for (const c of candidatesForCharge(this.manifest, this.mood)) void this.graph.load(c).catch(() => null)
    for (const cue of ['impact', 'seal'] as const) {
      const s = stingerFor(this.manifest, cue)
      if (s) void this.graph.load(s).catch(() => null)
    }
  }

  private async startCharge(token: number): Promise<void> {
    let pick: TrackEntry | null = null
    let info: LoadedInfo | null = null
    for (const c of candidatesForCharge(this.manifest, this.mood)) {
      const i = await this.graph.load(c)
      if (token !== this.chargeToken || this.disposed) return
      if (i) {
        pick = c
        info = i
        break
      }
    }
    if (!pick || !info) {
      this.chargeState = 'idle' // no file: no duck, no sound
      return
    }
    const now = this.graph.now()
    let when = now
    let offset = 0
    this.lock = null
    const bed = this.bed
    if (bed && bed.loop && sameTempo(bed.track, pick)) {
      const b = nextBeat(bed.startTime, bed.track.bpm, bed.track.beatsPerBar, bed.loopStart, bed.loopEnd, now + CFG.lockLookahead)
      const chargeEnd = pick.loopEnd > pick.loopStart ? pick.loopEnd : info.duration
      when = b.time
      // Enter the charge file at the same bar position as the bed, so its downbeat lands on the bed's downbeat.
      offset = chargeEnd > 0 ? (b.beatInBar * (60 / pick.bpm)) % chargeEnd : 0
      this.lock = { ...b, offset }
    }
    const voice = this.graph.startLoop(pick, when, offset, 0)
    if (!voice) {
      this.chargeState = 'idle'
      this.lock = null
      return
    }
    const ch: Channel = {
      track: pick,
      voice,
      env: new Envelope(0),
      startTime: when,
      loop: true,
      loopStart: pick.loopStart,
      loopEnd: pick.loopEnd > pick.loopStart ? pick.loopEnd : info.duration,
      stopAt: null,
    }
    this.charge = ch
    this.ramp(ch, this.chargeTarget(pick), when, CFG.chargeIn[this.kind])
    this.setDuck(true, when)
    this.chargeState = 'active'
  }

  private setDuck(on: boolean, at: number): void {
    this.ducked = on
    const b = this.bed
    if (b) this.ramp(b, this.bedTarget(b.track), at, on ? CFG.duckRamp : this.kindOut())
  }

  private kindOut(): number {
    return CFG.chargeOut[this.kind]
  }

  /** The cut-in (or last link of a chain) finished: the layer fades out and the bed comes back up. */
  cutinEnd(): void {
    if (this.disposed) return
    if (this.chargeState === 'pending') {
      this.chargeToken++
      this.chargeState = 'idle'
      this.deadline = null
      return
    }
    if (this.chargeState === 'active') this.release(CFG.chargeOut[this.kind])
  }

  /** The player skipped the cut-in (or the review page jumped): a faster fade, also speeding up one already running. */
  cutinSkip(): void {
    if (this.disposed) return
    if (this.chargeState === 'pending') {
      this.cutinEnd()
      return
    }
    if (this.chargeState === 'active') this.release(CFG.skipOut)
    else if (this.chargeState === 'releasing') {
      const now = this.graph.now()
      if (this.releaseEnd - now > CFG.skipOut + 1e-9) this.release(CFG.skipOut, true)
    }
  }

  private release(dur: number, force = false): void {
    const ch = this.charge
    if (this.chargeState === 'pending') {
      this.chargeToken++
      this.chargeState = 'idle'
      return
    }
    if (!ch || (this.chargeState !== 'active' && !force)) return
    const now = this.graph.now()
    this.deadline = null
    if (ch.startTime > now + 1e-9) {
      // Scheduled on a future beat but never audible: cancel it and put the bed back.
      ch.voice.stop(now)
      this.charge = null
      this.lock = null
      this.chargeState = 'idle'
      this.ducked = false
      const b = this.bed
      if (b) this.ramp(b, this.bedTarget(b.track), now, dur)
      return
    }
    this.ramp(ch, 0, now, dur)
    this.ducked = false
    const b = this.bed
    if (b) this.ramp(b, this.bedTarget(b.track), now, dur)
    this.releaseEnd = now + dur
    this.chargeState = 'releasing'
  }

  /** Fade everything out (the audition page's Stop). */
  silence(): void {
    if (this.disposed) return
    this.moodToken++
    this.mood = null
    this.release(CFG.skipOut)
    this.retireBed(CFG.crossfade)
  }

  // ---------------------------------------------------------------- stingers

  /** Impact and seal hits on the sfx bus. Returns whether one sounded (rate-limited; silent if the file is missing or still loading). */
  stinger(cue: StingerCue): boolean {
    if (this.disposed) return false
    const track = stingerFor(this.manifest, cue)
    if (!track) return false
    const now = this.graph.now()
    const last = this.lastCue.get(cue)
    if (last !== undefined && now - last < CFG.stingerGap) return false
    while (this.stingerEnds.length && this.stingerEnds[0]! <= now) this.stingerEnds.shift()
    if (this.stingerEnds.length >= CFG.maxStingers) return false
    // A stinger that arrives late is worse than none: if it is not decoded yet, start the load for next time.
    const voice = this.graph.startOnce(track, now, 'sfx', dbToGain(track.gainDb))
    if (!voice) {
      void this.graph.load(track).catch(() => null)
      return false
    }
    this.lastCue.set(cue, now)
    this.stingerEnds.push(now + 2)
    this.stingerEnds.sort((a, b) => a - b)
    return true
  }

  // ---------------------------------------------------------------- housekeeping

  /** Poll the audio clock: failsafe, finished fades, retired beds. Safe to call at any rate. */
  tick(): void {
    if (this.disposed) return
    const now = this.graph.now()
    if ((this.chargeState === 'active' || this.chargeState === 'pending') && this.deadline !== null && now >= this.deadline) {
      if (this.chargeState === 'pending') this.cutinEnd()
      else this.release(CFG.chargeOut[this.kind])
    }
    if (this.chargeState === 'releasing' && now >= this.releaseEnd) {
      this.charge?.voice.stop(now)
      this.charge = null
      this.lock = null
      this.chargeState = 'idle'
    }
    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const r = this.retiring[i]!
      if (r.stopAt !== null && now >= r.stopAt) {
        r.voice.stop(now)
        this.retiring.splice(i, 1)
      }
    }
    if (this.bed && this.bed.stopAt !== null && now >= this.bed.stopAt) {
      this.bed = null // a one-shot jingle ran out
    }
  }

  /** Resolves when the current mood change and charge start have settled (for tests and the audition page). */
  async settled(): Promise<void> {
    await this.pendingMood
    await this.pendingCharge
  }

  /** Current gains of the bed and the charge layer, read from the envelope model (the audition page's meters). */
  levels(): { bed: number; charge: number } {
    const now = this.graph.now()
    return { bed: this.bed ? this.bed.env.value(now) : 0, charge: this.charge ? this.charge.env.value(now) : 0 }
  }

  debug(): DirectorDebug {
    return {
      mood: this.mood,
      bed: this.bed?.track.id ?? null,
      charge: this.chargeState,
      chargeTrack: this.charge?.track.id ?? null,
      ducked: this.ducked,
      lock: this.lock,
      kind: this.kind,
      deadline: this.deadline,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const now = this.graph.now()
    this.bed?.voice.stop(now)
    this.charge?.voice.stop(now)
    for (const r of this.retiring) r.voice.stop(now)
    this.bed = this.charge = null
    this.retiring.length = 0
  }
}
