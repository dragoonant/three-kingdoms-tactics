// The cut-in clock. Wall time t is the only state; everything drawn is evaluate(scene, t). The controller owns playback
// (play, pause, speed, loop) and can render a frame synchronously for scrubbing and for frame-exact capture.
import { evaluate, type CutinScene, type Evaluated } from './timeline'

type Listener = (ev: Evaluated) => void

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

  private emitState(): void {
    this.stateListeners.forEach((f) => f())
  }

  setScene(scene: CutinScene): void {
    this.scene = scene
    this.setTime(0)
    this.emitState()
  }

  /** Jump to wall time t, notify, and render synchronously. */
  setTime(t: number): void {
    this.t = Math.min(this.scene.duration, Math.max(0, t))
    this.frame.current = evaluate(this.scene, this.t)
    this.listeners.forEach((f) => f(this.frame.current))
    this.render()
  }

  play(): void {
    if (this.playing) return
    if (this.t >= this.scene.duration - 1e-6) this.t = 0
    this.playing = true
    this.last = performance.now()
    const tick = (now: number): void => {
      if (!this.playing) return
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      let nt = this.t + dt * this.speed
      if (nt >= this.scene.duration) {
        if (this.loop) nt = nt % this.scene.duration
        else {
          nt = this.scene.duration
          this.playing = false
          this.emitState()
        }
      }
      this.setTime(nt)
      if (this.playing) this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
    this.emitState()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.emitState()
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
  }
}
