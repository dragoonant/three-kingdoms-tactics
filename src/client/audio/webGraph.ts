// The Web Audio implementation of MusicGraph: lazy fetch + decode with a cache, voices on the music / sfx buses.
// A file that is missing, 404s, or fails to decode is logged once and cached as null: the caller treats it as silence.
import type { AudioEngine } from './audioEngine'
import type { LoadedInfo, MusicGraph, Voice } from './musicDirector'
import { audioUrl, warnOnce, type TrackEntry } from './manifest'

class WebVoice implements Voice {
  private stopped = false
  constructor(
    private readonly src: AudioBufferSourceNode,
    private readonly gain: GainNode,
  ) {
    src.addEventListener('ended', () => {
      try {
        src.disconnect()
        gain.disconnect()
      } catch {
        /* already gone */
      }
    })
  }
  ramp(from: number, to: number, start: number, dur: number): void {
    const p = this.gain.gain
    try {
      p.cancelScheduledValues(start)
      p.setValueAtTime(from, start)
      if (dur > 0) p.linearRampToValueAtTime(to, start + dur)
      else p.setValueAtTime(to, start)
    } catch {
      /* a non-finite value from a caller must not take the page down */
    }
  }
  stop(when: number): void {
    if (this.stopped) return
    this.stopped = true
    try {
      this.src.stop(when)
    } catch {
      /* never started or already stopped */
    }
  }
}

export class WebMusicGraph implements MusicGraph {
  private readonly buffers = new Map<string, AudioBuffer | null>()
  private readonly inflight = new Map<string, Promise<LoadedInfo | null>>()

  constructor(
    private readonly engine: AudioEngine,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  now(): number {
    return this.engine.now()
  }

  buffer(id: string): AudioBuffer | null {
    return this.buffers.get(id) ?? null
  }

  load(track: TrackEntry): Promise<LoadedInfo | null> {
    const cached = this.buffers.get(track.id)
    if (cached !== undefined) return Promise.resolve(cached ? { duration: cached.duration } : null)
    let p = this.inflight.get(track.id)
    if (!p) {
      p = this.fetchDecode(track).finally(() => this.inflight.delete(track.id))
      this.inflight.set(track.id, p)
    }
    return p
  }

  private async fetchDecode(track: TrackEntry): Promise<LoadedInfo | null> {
    const ctx = this.engine.ctx
    if (!ctx) return null
    for (const file of [track.file, track.alt]) {
      if (!file) continue
      try {
        const res = await this.fetchFn(audioUrl(file))
        if (!res.ok) {
          warnOnce(`file:${file}`, `audio file ${file} not found (${res.status}); "${track.id}" is silent`)
          continue
        }
        const buf = await ctx.decodeAudioData(await res.arrayBuffer())
        this.buffers.set(track.id, buf)
        return { duration: buf.duration }
      } catch {
        warnOnce(`file:${file}`, `audio file ${file} could not be decoded; "${track.id}" is silent`)
      }
    }
    this.buffers.set(track.id, null)
    return null
  }

  private voice(track: TrackEntry, when: number, offset: number, gain0: number, loop: boolean, bus: 'music' | 'sfx'): Voice | null {
    const ctx = this.engine.ctx
    const buf = this.buffers.get(track.id)
    const out = bus === 'music' ? this.engine.musicBus : this.engine.sfxBus
    if (!ctx || !buf || !out) return null
    const src = ctx.createBufferSource()
    src.buffer = buf
    if (loop) {
      src.loop = true
      src.loopStart = track.loopStart
      if (track.loopEnd > track.loopStart) src.loopEnd = Math.min(track.loopEnd, buf.duration)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(gain0, 0)
    src.connect(gain)
    gain.connect(out)
    const at = Math.max(when, ctx.currentTime)
    try {
      src.start(at, buf.duration > 0 ? offset % buf.duration : 0)
    } catch {
      return null
    }
    return new WebVoice(src, gain)
  }

  startLoop(track: TrackEntry, when: number, offset: number, gain0: number): Voice | null {
    return this.voice(track, when, offset, gain0, true, 'music')
  }

  startOnce(track: TrackEntry, when: number, bus: 'music' | 'sfx', gain: number): Voice | null {
    return this.voice(track, when, 0, gain, false, bus)
  }
}
