// The cut-in clock. Wall time t is the only state; everything drawn is evaluate(scene, t). The controller owns playback
// (play, pause, speed, loop) and can render a frame synchronously for scrubbing and for frame-exact capture.
import { evaluate, type CutinScene, type Evaluated } from './timeline'

type Listener = (ev: Evaluated) => void
/** Transport events for side effects such as the music: playback started, paused, ran to its end, looped, or was jumped. */
export type Transport = 'play' | 'pause' | 'finish' | 'wrap' | 'seek'

export class CutinController {
  scene: CutinScene
  readonly frame: { current: Evaluated }
  t = 0
  playing = false
  speed = 1
  loop = true
  free = false
  /** Set by the canvas bridge: render the current frame now. */
  renderNow: (() => void) | null = null
  private readonly listeners = new Set<Listener>()
  private readonly stateListeners = new Set<() => void>()
  private raf = 0
  private last = 0
  private ticking = false
  private readonly transportListeners = new Set<(e: Transport) => void>()

  constructor(scene: CutinScene) {
    this.scene = scene
    this.frame = { current: evaluate(scene, 0) }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** For UI state (playing, speed...) so React can re-render controls. */
  onState(fn: () => void): () => void {
    this.stateListeners.add(fn)
    return () => this.stateListeners.delete(fn)
  }

  onTransport(fn: (e: Transport) => void): () => void {
    this.transportListeners.add(fn)
    return () => this.transportListeners.delete(fn)
  }

  private emitTransport(e: Transport): void {
    this.transportListeners.forEach((f) => f(e))
  }

  private emitState(): void {
    this.stateListeners.forEach((f) => f())
  }

  setScene(scene: CutinScene): void {
    this.scene = scene
    this.windowEnd = null
    this.setTime(0)
    this.emitState()
  }

  /** Jump to wall time t, notify, and render synchronously. */
  setTime(t: number): void {
    if (!this.ticking) this.emitTransport('seek')
    this.t = Math.min(this.scene.duration, Math.max(0, t))
    this.frame.current = evaluate(this.scene, this.t)
    this.listeners.forEach((f) => f(this.frame.current))
    this.render()
  }

  /** Scene time at which playback finishes (a non-final chain link stops before its pull-out). Defaults to the scene's end. */
  windowEnd: number | null = null
  private get endAt(): number {
    return this.windowEnd ?? this.scene.duration
  }

  /**
   * Advance the clock by `dt` real seconds (times the speed), render, and report the end of the window. Used by the rAF loop
   * below and, directly, by the in-game player and by tests that step the clock themselves (no wall time involved).
   */
  advance(dt: number): void {
    if (!this.playing) return
    let nt = this.t + dt * this.speed
    let ev: Transport | null = null
    if (nt >= this.endAt) {
      if (this.loop) {
        nt = nt % this.endAt
        ev = 'wrap'
      } else {
        nt = this.endAt
        this.playing = false
        this.emitState()
        ev = 'finish'
      }
    }
    this.ticking = true
    try {
      this.setTime(nt)
    } finally {
      this.ticking = false
    }
    if (ev) this.emitTransport(ev)
  }

  play(): void {
    if (this.playing) return
    if (this.t >= this.endAt - 1e-6) this.t = 0
    this.playing = true
    this.last = performance.now()
    const tick = (now: number): void => {
      if (!this.playing) return
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.advance(dt)
      if (this.playing) this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
    this.emitState()
    this.emitTransport('play')
  }

  /** Mark the clock as running with no rAF loop of its own: the caller calls `advance(dt)`. */
  playExternal(): void {
    if (this.playing) return
    if (this.t >= this.endAt - 1e-6) this.t = 0
    this.playing = true
    this.emitState()
    this.emitTransport('play')
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf)
    this.emitState()
    this.emitTransport('pause')
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  restart(): void {
    this.setTime(0)
    this.play()
  }

  setSpeed(s: number): void {
    this.speed = s
    this.emitState()
  }

  setLoop(l: boolean): void {
    this.loop = l
    this.emitState()
  }

  setFree(f: boolean): void {
    this.free = f
    this.emitState()
    this.render()
  }

  private rendering = false
  /** Draw the current frame; re-entrant calls (OrbitControls change events during a render) are ignored. */
  render(): void {
    if (this.rendering || !this.renderNow) return
    this.rendering = true
    try {
      this.renderNow()
    } finally {
      this.rendering = false
    }
  }

  dispose(): void {
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.listeners.clear()
    this.stateListeners.clear()
    this.transportListeners.clear()
  }
}
