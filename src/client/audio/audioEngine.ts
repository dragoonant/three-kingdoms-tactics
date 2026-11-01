// The one AudioContext (KB: iPadOS parked a mixed <audio>/Web Audio context; one context for everything).
// master -> { music bus, sfx bus } -> destination. Settings persist in localStorage (always in try/catch).
//
// Unlock: browsers only let a context run after a user gesture, and iOS Safari resumes only from touchend/pointerup/click
// (Mallet M12). The listeners stay for the whole session and retry `resume()` on every gesture while the context is not
// running (iOS also drops it to 'interrupted' after a call or a tab switch). The context is created on the first gesture,
// so nothing is fetched or decoded, and no autoplay warning is logged, before the player has touched the page.

export interface AudioSettings {
  /** Slider positions, 0..1. */
  master: number
  music: number
  sfx: number
  muted: boolean
}

export const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, music: 0.7, sfx: 0.9, muted: false }
export const SETTINGS_KEY = 'tkt.audio.v1'

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d)

export function parseSettings(raw: string | null | undefined): AudioSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const o = JSON.parse(raw) as Partial<AudioSettings> | null
    if (!o || typeof o !== 'object') return { ...DEFAULT_SETTINGS }
    return {
      master: clamp01(o.master, DEFAULT_SETTINGS.master),
      music: clamp01(o.music, DEFAULT_SETTINGS.music),
      sfx: clamp01(o.sfx, DEFAULT_SETTINGS.sfx),
      muted: o.muted === true,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null | undefined = safeStorage()): AudioSettings {
  try {
    return parseSettings(storage?.getItem(SETTINGS_KEY))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: AudioSettings, storage: Pick<Storage, 'setItem'> | null | undefined = safeStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* private window, quota, blocked: the sliders still work for this session */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** A slider position is perceived loudness, so the gain follows a square law (0.5 is about -12 dB). */
export const sliderToGain = (v: number): number => v * v

/** Linear gains for the three nodes. Mute zeroes the master only, so un-muting restores every slider. */
export function busGains(s: AudioSettings): { master: number; music: number; sfx: number } {
  return { master: s.muted ? 0 : sliderToGain(s.master), music: sliderToGain(s.music), sfx: sliderToGain(s.sfx) }
}

export type EngineEvent = 'created' | 'state' | 'settings'
export type CtxState = 'none' | AudioContextState | 'interrupted'

export class AudioEngine {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  musicBus: GainNode | null = null
  sfxBus: GainNode | null = null
  settings: AudioSettings
  private readonly listeners = new Set<(e: EngineEvent) => void>()
  private hiddenSuspend = false
  private attached = false

  constructor(private readonly win: Window | null = typeof window === 'undefined' ? null : window) {
    this.settings = loadSettings()
  }

  /** Start listening for the gestures that unlock audio. Idempotent; the listeners are never removed. */
  attach(): void {
    const w = this.win
    if (!w || this.attached) return
    this.attached = true
    const unlock = (): void => this.unlock()
    for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) w.addEventListener(type, unlock, { capture: true, passive: true })
    w.document.addEventListener('visibilitychange', () => this.onVisibility())
  }

  /** Create the context on first use, and (re)try to resume it whenever it is not running. Called from gestures. */
  unlock(): void {
    const w = this.win
    if (!w) return
    if (!this.ctx) {
      const Ctor = (w as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (w as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      try {
        this.ctx = new Ctor({ latencyHint: 'interactive' })
      } catch {
        return
      }
      const ctx = this.ctx
      this.master = ctx.createGain()
      this.musicBus = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.musicBus.connect(this.master)
      this.sfxBus.connect(this.master)
      this.master.connect(ctx.destination)
      this.applySettings(true)
      ctx.addEventListener('statechange', () => this.emit('state'))
      this.emit('created')
    }
    const ctx = this.ctx
    if (ctx.state !== 'running' && !(this.win?.document.hidden ?? false)) {
      this.hiddenSuspend = false
      void ctx.resume().then(() => this.emit('state'), () => {})
    }
  }

  private onVisibility(): void {
    const ctx = this.ctx
    if (!ctx || !this.win) return
    if (this.win.document.hidden) {
      if (ctx.state === 'running') {
        this.hiddenSuspend = true
        void ctx.suspend().then(() => this.emit('state'), () => {})
      }
    } else if (ctx.state !== 'running') {
      // May be refused without a fresh gesture (iOS); the next gesture retries.
      this.hiddenSuspend = false
      void ctx.resume().then(() => this.emit('state'), () => {})
    }
  }

  get state(): CtxState {
    return this.ctx ? (this.ctx.state as CtxState) : 'none'
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: EngineEvent): void {
    this.listeners.forEach((f) => f(e))
  }

  setSettings(patch: Partial<AudioSettings>): void {
    const next: AudioSettings = {
      master: clamp01(patch.master ?? this.settings.master, this.settings.master),
      music: clamp01(patch.music ?? this.settings.music, this.settings.music),
      sfx: clamp01(patch.sfx ?? this.settings.sfx, this.settings.sfx),
      muted: patch.muted ?? this.settings.muted,
    }
    this.settings = next
    saveSettings(next)
    this.applySettings(false)
    this.emit('settings')
  }

  private applySettings(immediate: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus) return
    const g = busGains(this.settings)
    const t = ctx.currentTime
    const set = (n: GainNode, v: number): void => {
      n.gain.cancelScheduledValues(t)
      if (immediate) n.gain.setValueAtTime(v, t)
      else n.gain.setTargetAtTime(v, t, 0.03)
    }
    set(this.master, g.master)
    set(this.musicBus, g.music)
    set(this.sfxBus, g.sfx)
  }
}
