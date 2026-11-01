// The audio facade the game, the cinema page and the audition page talk to. It owns the engine, the manifest and the music
// director, and remembers what was asked for before the first user gesture (when no AudioContext may exist yet) so it can
// be applied the moment audio unlocks.
import { AudioEngine, type AudioSettings, type CtxState } from './audioEngine'
import { dbToGain, EMPTY_MANIFEST, fetchManifest, type Manifest, type Mood, type StingerCue, type TrackEntry } from './manifest'
import { MusicDirector, type CutinKind, type DirectorDebug, type Voice } from './musicDirector'
import { WebMusicGraph } from './webGraph'

export interface AudioStatus {
  manifestReady: boolean
  trackCount: number
  ctx: CtxState
  settings: AudioSettings
  mood: Mood | null
  version: number
}

class AudioFacade {
  readonly engine = new AudioEngine()
  manifest: Manifest = EMPTY_MANIFEST
  private manifestReady = false
  private graph: WebMusicGraph | null = null
  private director: MusicDirector | null = null
  private mood: Mood | null = null
  private cutin: { kind: CutinKind; seconds: number } | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Set<() => void>()
  private readonly auditioned = new Map<string, Voice>()
  private version = 0
  private snap: AudioStatus

  constructor() {
    this.snap = this.makeSnap()
    if (typeof window === 'undefined') return
    this.engine.on((e) => {
      if (e === 'created') this.build()
      this.notify()
    })
    this.engine.attach()
    // ?test=1 exposes the facade for the e2e tests (the same switch the game and the cinema page use).
    try {
      if (new URLSearchParams(window.location.search).get('test') === '1') (window as unknown as { __audio?: AudioFacade }).__audio = this
    } catch {
      /* no location */
    }
    void fetchManifest().then((m) => {
      this.manifest = m
      this.manifestReady = true
      this.build()
      this.notify()
    })
  }

  private build(): void {
    if (this.director || !this.engine.ctx || !this.manifestReady) return
    this.graph = new WebMusicGraph(this.engine)
    this.director = new MusicDirector(this.graph, this.manifest)
    // The polling only reads the audio clock (failsafe, retiring fades); every musical event is scheduled on that clock.
    this.timer = setInterval(() => this.director?.tick(), 100)
    if (this.mood) this.director.setMood(this.mood)
    if (this.cutin) this.director.cutinStart(this.cutin.kind, this.cutin.seconds)
  }

  // ---- the API the game uses
  setMood(m: Mood): void {
    if (m === this.mood) return
    this.mood = m
    if (m === 'victory' || m === 'defeat') this.cutin = null
    this.director?.setMood(m)
    this.notify()
  }
  /** Fade all music out. */
  silence(): void {
    this.mood = null
    this.cutin = null
    this.director?.silence()
    this.notify()
  }
  getMood(): Mood | null {
    return this.mood
  }
  /** A cut-in begins ('full' for stratagems and chains, 'short' for a normal attack). `seconds` is the scene length, for the failsafe. */
  cutinStart(kind: CutinKind = 'full', seconds?: number): void {
    this.cutin = { kind, seconds: seconds ?? 7 }
    this.director?.cutinStart(kind, seconds)
  }
  cutinEnd(): void {
    this.cutin = null
    this.director?.cutinEnd()
  }
  cutinSkip(): void {
    this.cutin = null
    this.director?.cutinSkip()
  }
  stinger(cue: StingerCue): void {
    this.director?.stinger(cue)
  }
  impact(): void {
    this.stinger('impact')
  }
  seal(): void {
    this.stinger('seal')
  }

  // ---- settings and status
  setSettings(p: Partial<AudioSettings>): void {
    this.engine.setSettings(p)
  }
  hasFiles(): boolean {
    return this.manifest.tracks.length > 0
  }
  /** Immutable snapshot, replaced only when something changes (for useSyncExternalStore). */
  status(): AudioStatus {
    return this.snap
  }
  private makeSnap(): AudioStatus {
    return {
      manifestReady: this.manifestReady,
      trackCount: this.manifest.tracks.length,
      ctx: this.engine.state,
      settings: this.engine.settings,
      mood: this.mood,
      version: this.version,
    }
  }
  private notify(): void {
    this.version++
    this.snap = this.makeSnap()
    this.listeners.forEach((f) => f())
  }
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  levels(): { bed: number; charge: number } {
    return this.director?.levels() ?? { bed: 0, charge: 0 }
  }
  debug(): DirectorDebug | null {
    return this.director?.debug() ?? null
  }
  now(): number {
    return this.engine.now()
  }

  // ---- audition (sounds.html): play one manifest entry on its own, outside the director
  async audition(track: TrackEntry): Promise<boolean> {
    this.engine.unlock()
    if (!this.graph) return false
    this.stopAudition(track.id)
    const info = await this.graph.load(track)
    if (!info) return false
    const g = dbToGain(track.gainDb)
    const now = this.graph.now()
    if (track.role === 'stinger') {
      return this.graph.startOnce(track, now, track.mood ? 'music' : 'sfx', g) !== null
    }
    const v = this.graph.startLoop(track, now, 0, g)
    if (!v) return false
    this.auditioned.set(track.id, v)
    this.notify()
    return true
  }
  stopAudition(id?: string): void {
    const now = this.graph?.now() ?? 0
    for (const [k, v] of this.auditioned) {
      if (id === undefined || k === id) {
        v.stop(now)
        this.auditioned.delete(k)
      }
    }
    this.notify()
  }
  auditioning(): string[] {
    return [...this.auditioned.keys()]
  }
  /** Await pending loads in tests / the demo. */
  async settled(): Promise<void> {
    await this.director?.settled()
  }
}

export const audio = new AudioFacade()
export type { AudioFacade }
export type { Mood, CutinKind }
