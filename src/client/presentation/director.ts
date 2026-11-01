// Plays beats one after another on a timer and commits each beat's events to the presented scene.
// It owns no React state: the store hands it callbacks. Any call to skip() snaps to the final scene.
import type { GameEvent } from '../../engine'
import { beatDuration, type Beat, type Speed } from './beats'
import { applyEvents, type Scene } from './scene'

export interface DirectorIO {
  speed(): Speed
  scene(): Scene
  setScene(s: Scene): void
  /** A beat starts (ms is the scaled duration; 0 means it is applied at once). */
  beatStart(b: Beat, ms: number): void
  /** Events committed to the scene (a beat ended, or a skip flushed the rest). */
  committed(events: GameEvent[]): void
  /** The whole batch is over and the scene equals the final one. */
  idle(): void
  /**
   * A battle cut-in begins (a `cutin` beat). The io plays the scene and calls `onResult` when the camera starts to rise out
   * (the board then shows the result) and `onDone` when it has finished. Absent: cut-in beats are skipped over.
   */
  cutin?(b: Beat, hooks: CutinHooks): void
  /** The batch was skipped while a cut-in played: stop it at once (no further hooks will be honoured). */
  cutinCancel?(): void
  /** The board's result lands (before its events are committed): floaters and seals for the cut-in's inner beats. */
  resultLanded?(b: Beat): void
}
export interface CutinHooks {
  onResult(): void
  onDone(): void
}

/** Non-reactive animation clock read by the 3D layer every frame. */
export const anim: { beat: Beat | null; t0: number; ms: number } = { beat: null, t0: 0, ms: 1 }

export function animProgress(): number {
  if (!anim.beat) return 0
  return Math.min(1, Math.max(0, (performance.now() - anim.t0) / Math.max(1, anim.ms)))
}

export class Director {
  private queue: Beat[] = []
  private final: Scene | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private current: Beat | null = null
  private running = false
  private startedAt = 0
  /** Beats whose events have been committed (a cut-in commits at its result moment, before it ends). */
  private landed = new WeakSet<Beat>()

  constructor(private io: DirectorIO) {}

  get playing(): boolean {
    return this.running
  }
  /** A cut-in is on screen. */
  get inCutin(): boolean {
    return this.running && this.current?.fx.t === 'cutin'
  }
  /** ms since the current batch began (for the watchdog). */
  get age(): number {
    return this.running ? performance.now() - this.startedAt : 0
  }

  play(beats: Beat[], finalScene: Scene): void {
    if (this.running) this.skip()
    this.queue = beats.slice()
    this.final = finalScene
    this.running = true
    this.startedAt = performance.now()
    this.pump()
  }

  skip(): void {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const rest: GameEvent[] = []
    if (this.current?.fx.t === 'cutin') this.io.cutinCancel?.()
    if (this.current && !this.landed.has(this.current)) {
      rest.push(...this.current.commit)
      this.landed.add(this.current)
    }
    for (const b of this.queue) rest.push(...b.commit)
    this.current = null
    this.queue = []
    anim.beat = null
    if (rest.length) this.io.committed(rest)
    this.finish()
  }

  private finish(): void {
    if (this.final) this.io.setScene(this.final)
    this.final = null
    this.running = false
    anim.beat = null
    this.io.idle()
  }

  private pump(): void {
    // Zero-length beats (instant speed) are applied in a loop so a whole battle cannot overflow the stack.
    for (;;) {
      const b = this.queue.shift()
      if (!b) {
        this.finish()
        return
      }
      const ms = beatDuration(b, this.io.speed())
      this.current = b
      anim.beat = b
      anim.t0 = performance.now()
      anim.ms = ms
      this.io.beatStart(b, ms)
      if (b.fx.t === 'cutin' && ms > 0 && this.io.cutin) {
        // the cut-in plays itself: the beat ends when it says so, and its events land when the camera rises out
        this.io.cutin(b, {
          onResult: () => this.land(b),
          onDone: () => {
            if (this.current !== b) return
            this.land(b)
            this.current = null
            this.pump()
          },
        })
        return
      }
      if (ms <= 0) {
        this.endBeat(b)
        continue
      }
      this.timer = setTimeout(() => {
        this.timer = null
        this.endBeat(b)
        this.pump()
      }, ms)
      return
    }
  }

  /** Commit a beat's events to the presented scene (once). */
  private land(b: Beat): void {
    if (this.landed.has(b)) return
    this.landed.add(b)
    this.io.resultLanded?.(b)
    this.io.setScene(applyEvents(this.io.scene(), b.commit))
    this.io.committed(b.commit)
  }

  private endBeat(b: Beat): void {
    this.current = null
    this.land(b)
  }
}
