// The in-game cut-in player (docs/spec/51 "Chains", "Settings and pacing"; docs/spec/60 §1). It owns the cut-in clock for one
// sequence of links (one scene for an attack or a lone stratagem, several for a chain): it builds each link's scene from the
// plan, plays link 1 from its dive, plays links 2+ from their action beat at ~60% of their length with a 0.4 s seal-stamp
// interstitial between links, tells the director when the board's result should land (as the camera rises out) and when the
// whole thing is over, and drives the music (one `cutinStart` for the whole chain, one `cutinEnd`, `cutinSkip` on a click).
//
// It is a small state machine over a CutinController (pure) with no React in it. The React layer (CutinLayer) renders its
// snapshot and reports when the world is mounted. Wall time is read in one place (the rAF tick); tests and the capture tools
// call `step(dt)` themselves (manual mode) so a battle's cut-in can be stepped frame by frame.
import { audio } from '../audio'
import { CutinController } from './controller'
import { sequenceTiming, type LinkPlan, type LinkTiming, type SceneId, type SequencePlan } from './plan'
import { perf } from './perf'
import { INTERSTITIAL } from './sceneInfo'
import { prep } from './prep'
import { buildScene, samplePlan } from './scenes'
import type { CutinScene } from './timeline'

export interface PlayerHooks {
  /** The camera has started to rise out of the last link: the board shows the result now. */
  onResult(): void
  /** The sequence ran to its end. (Not called when it is cancelled.) */
  onDone(): void
}

export interface PlayerView {
  active: boolean
  /** Changes with every link: the layer remounts the world on it. */
  linkKey: number
  /** The link's world in the persistent canvas (cutins/prep.ts), and whether it was prebuilt before the link started. */
  key: string | null
  prebuilt: boolean
  link: number
  links: number
  phase: 'scene' | 'seal'
  /** Seals stamped so far in the chain row. */
  seals: { bond: boolean }[]
  scene: CutinScene | null
  /** Set once the last link starts its final stretch: the layer fades out over the last FADE_OUT seconds. */
  last: boolean
  plan: SequencePlan | null
}

const IDLE: PlayerView = { active: false, linkKey: 0, key: null, prebuilt: false, link: 0, links: 0, phase: 'scene', seals: [], scene: null, last: false, plan: null }

export class CutinPlayer {
  readonly controller: CutinController
  private view: PlayerView = IDLE
  private readonly listeners = new Set<() => void>()
  private plan: SequencePlan | null = null
  private timing: LinkTiming[] = []
  private hooks: PlayerHooks | null = null
  private i = 0
  private ready = false
  private resultFired = false
  private sealT = 0
  private raf = 0
  private last = 0
  private key = 0
  /** Manual clock: nothing advances by itself; `step(dt)` does. */
  manual = false
  /** Total seconds the active sequence is expected to take (for the music failsafe). */
  seconds = 0
  /** The scenes played in the active/most recent sequence (for tests and the capture tools). */
  history: CutinScene[] = []

  constructor() {
    // the controller needs a scene to exist; it is replaced by every link
    this.controller = new CutinController(buildScene({ ...PLACEHOLDER }))
  }

  // ---- React binding
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): PlayerView => this.view
  private set(patch: Partial<PlayerView>): void {
    this.view = { ...this.view, ...patch }
    this.listeners.forEach((f) => f())
  }

  get active(): boolean {
    return this.view.active
  }
  /** The world of the current link is mounted and the clock may run. */
  get isReady(): boolean {
    return this.ready
  }

  // ---- control
  start(plan: SequencePlan, hooks: PlayerHooks): void {
    if (this.view.active) this.cancel()
    this.plan = plan
    this.hooks = hooks
    const t = sequenceTiming(plan)
    this.timing = t.links
    this.seconds = t.seconds
    this.i = 0
    this.resultFired = false
    this.sealT = 0
    this.history = []
    this.ready = false
    perf.trigger(plan.links.length > 1 ? 'chain' : plan.full ? 'full' : 'short', plan.links.map((l) => l.scene), plan.enemy)
    audio.cutinStart(plan.full ? 'full' : 'short', t.seconds)
    this.beginLink(0, [])
    this.startLoop()
  }

  /** The layer reports that the world of the current link is mounted and has drawn its first frame. */
  markReady(): void {
    if (!this.view.active) return
    this.ready = true
    this.controller.hold = false
    perf.mark('ready')
    this.last = performance.now()
  }

  /** Stop at once with `cutinSkip`, without telling anyone (the director cancels us when a click skips its batch). */
  cancel(): void {
    if (!this.view.active) return
    this.stopLoop()
    this.controller.pause()
    this.controller.hold = false
    audio.cutinSkip()
    perf.end()
    prep.endSequence()
    this.hooks = null
    this.set({ ...IDLE, linkKey: this.key })
  }

  /** Jump to the end: stop, then report the result and the end to the director so it carries on (tests and tools). */
  skip(): void {
    if (!this.view.active) return
    const hooks = this.hooks
    this.cancel()
    hooks?.onResult()
    hooks?.onDone()
  }

  private beginLink(i: number, seals: PlayerView['seals']): void {
    const plan = this.plan!
    this.i = i
    const link = plan.links[i]!
    perf.link(i)
    const prev = this.view.key
    const { key, scene, prebuilt } = perf.measure('scene-plan', () => prep.live(link))
    if (prev && prev !== key) prep.drop(prev)
    perf.mark(prebuilt ? 'prebuilt-hit' : 'built-at-start')
    this.history.push(scene)
    const tm = this.timing[i]!
    const c = this.controller
    // nothing is drawn until the layer reports the link's world on screen (markReady)
    c.hold = true
    c.setScene(scene)
    c.windowEnd = tm.end
    c.speed = tm.rate
    c.loop = false
    c.setTime(tm.start)
    c.playing = false
    c.playExternal()
    this.ready = false
    this.set({ active: true, linkKey: ++this.key, key, prebuilt, link: i, links: plan.links.length, phase: 'scene', seals, scene, last: i === plan.links.length - 1, plan })
  }

  /** Advance the clock by dt real seconds. No-op until the world of the current link is mounted. */
  step(dt: number): void {
    if (!this.view.active || !this.ready || !this.plan) return
    const c = this.controller
    if (this.view.phase === 'seal') {
      this.sealT += dt
      if (this.sealT >= INTERSTITIAL) this.beginLink(this.i + 1, this.view.seals)
      return
    }
    c.advance(dt)
    const sc = c.scene
    const isLast = this.i === this.plan.links.length - 1
    if (isLast && !this.resultFired && c.t >= (sc.chain?.resultAt ?? sc.duration)) {
      this.resultFired = true
      this.hooks?.onResult()
    }
    if (!c.playing) {
      if (isLast) this.finish()
      else {
        this.sealT = 0
        const link = this.plan.links[this.i]!
        this.set({ phase: 'seal', seals: [...this.view.seals, { bond: link.bond }] })
      }
    }
  }

  private finish(): void {
    if (!this.resultFired) {
      this.resultFired = true
      this.hooks?.onResult()
    }
    const hooks = this.hooks
    this.stopLoop()
    this.controller.hold = false
    this.hooks = null
    audio.cutinEnd()
    perf.end()
    prep.endSequence()
    this.set({ ...IDLE, linkKey: this.key })
    hooks?.onDone()
  }

  // ---- the wall clock
  private startLoop(): void {
    this.stopLoop()
    if (typeof requestAnimationFrame === 'undefined') return
    this.last = performance.now()
    const tick = (now: number): void => {
      if (!this.view.active) return
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      if (!this.manual) this.step(dt)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }
  private stopLoop(): void {
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}

// a minimal plan just to give the controller a valid scene before the first link
const PLACEHOLDER = {
  scene: 'R' as const,
  link: 0,
  links: 1,
  caster: { unit: 'x', officer: 'x', name: 'x', side: 'han', palette: 'han' as const, kind: 'infantry' as const, type: 'infantry' as const, mounted: false, troopsBefore: 1, maxTroops: 1 },
  defender: null,
  strat: null,
  stratName: '',
  tag: null,
  terrain: 'plain' as const,
  damage: 0,
  targets: 0,
  falls: 0,
  routed: false,
  confused: 0,
  principalConfused: false,
  ignited: false,
  arc: 'front' as const,
  ranged: false,
  trail: 'line' as const,
  wind: null,
  bond: false,
  counter: null,
}

export const player = new CutinPlayer()

/** `?test=1`: the player for the e2e tests and the capture tools (manual stepping, frame by frame). */
export interface CutinTestApi {
  active(): boolean
  ready(): boolean
  view(): PlayerView
  /** Stop the wall clock from advancing the cut-in; the caller steps it with `step`. */
  manual(on: boolean): void
  step(dt: number): void
  /** Advance until the sequence is over (or a later link's world is still mounting: call again once ready), `dt` per step; returns the steps taken. */
  run(dt?: number, max?: number): number
  skip(): void
  /** Play a sequence of sample links (scene ids, each with plan overrides) with no engine behind it: for the capture tools. */
  play(links: { scene: string; over?: Record<string, unknown> }[], full?: boolean): void
  history(): { id: string; officer: string; title: string; damage: string; params: unknown }[]
  time(): number
  /** The persistent canvas's warm-up and prebuilt worlds (docs/spec/51 "Performance"). */
  prep(): { warm: { running: boolean; done: boolean; total: number; step: number }; slots: { kind: string; mounted: boolean; ready: boolean; scene: string | null }[]; stats: { prebuilt: number; built: number; warmed: number }; attached: boolean }
}
export function cutinTestApi(): CutinTestApi {
  return {
    active: () => player.active,
    ready: () => player.isReady,
    view: () => player.getSnapshot(),
    manual: (on) => {
      player.manual = on
    },
    step: (dt) => player.step(dt),
    run: (dt = 1 / 15, max = 4000) => {
      let n = 0
      while (player.active && player.isReady && n < max) {
        player.step(dt)
        n++
      }
      return n
    },
    skip: () => player.skip(),
    play: (links, full = true) => {
      const plan: SequencePlan = {
        full,
        enemy: false,
        rate: 1,
        links: links.map((l, i) => ({ ...samplePlan(l.scene as SceneId, (l.over ?? {}) as Partial<LinkPlan>), link: i, links: links.length })),
      }
      player.start(plan, { onResult: () => {}, onDone: () => {} })
    },
    history: () => player.history.map((s) => ({ id: s.id, officer: s.officer, title: s.title, damage: s.overlays.damage.text, params: s.params })),
    time: () => player.controller.t,
    prep: () => ({ warm: prep.getWarm(), slots: prep.getSnapshot().map((s) => ({ kind: s.kind, mounted: s.mounted, ready: s.ready, scene: s.scene?.id ?? null })), stats: { ...prep.stats }, attached: prep.attached }),
  }
}
