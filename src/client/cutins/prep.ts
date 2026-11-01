// Cut-in warm-up and prebuilding (docs/spec/51 "Performance: warm-up and reuse"). Pure bookkeeping: no three, no React.
//
// The cut-in canvas is mounted once per battle and keeps a few hidden "slots", each one world (or the warm-up gallery):
//   - warm:    the battle's sample scenes and the gallery, mounted one at a time behind the battle's intro so every shader
//              program, every shared geometry and every crowd bake exists before the first turn;
//   - next:    the scene(s) of the action the player is about to confirm, or of the action the AI has chosen, built in idle
//              time so the cut-in starts on an already built world;
//   - live:    the world on screen.
// The view (CutinLayer / CutinView) renders the slots and reports when each is mounted and when it is compiled ("ready").
// Scenes are keyed by their link plan, which is plain data from the engine's events: the speculative plan of a previewed
// action equals the real one because the engine is a pure function of (state, action).
import { step, type Action, type BattleState } from '../../engine'
import { kindOf, paletteOf, planCutins, sceneForAttack, sceneForStratagem, type ActorPlan, type LinkPlan, type SceneId, type SequencePlan } from './plan'
import { buildScene, samplePlan } from './scenes'
import { groundKind, type GroundKind } from './scenes/act'
import { getCutinSettings } from './settings'
import type { CutinScene } from './timeline'

export type SlotKind = 'warm' | 'next' | 'live'

/** The warm-up gallery: every figure, troop crowd and ground this battle can show, under the cut-in lights. */
export interface GallerySpec {
  actors: { actor: ActorPlan; mounted: boolean }[]
  crowds: { kind: ActorPlan['kind']; palette: ActorPlan['palette'] }[]
  grounds: GroundKind[]
}

export interface Slot {
  key: string
  kind: SlotKind
  scene: CutinScene | null
  gallery: GallerySpec | null
  mounted: boolean
  ready: boolean
}

/** At most this many prebuilt worlds wait at once (a chain's links); the memory cap of the prebuild. */
export const MAX_NEXT = 4

export const planKey = (l: LinkPlan): string => JSON.stringify(l)

type Waiter = { keys: string[]; resolve: () => void }

export interface WarmState {
  running: boolean
  done: boolean
  total: number
  step: number
}

const idle = (ms = 120): Promise<void> =>
  new Promise((r) => {
    const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => r(), { timeout: ms })
    else setTimeout(r, 16)
  })

export class CutinPrep {
  private slots: Slot[] = []
  private snap: readonly Slot[] = []
  private readonly listeners = new Set<() => void>()
  private waiters: Waiter[] = []
  private warmRun = 0
  private warm: WarmState = { running: false, done: false, total: 0, step: 0 }
  private warmSnap: WarmState = this.warm
  /** The view is mounted (a battle with cut-ins on is loaded). Requests made without it resolve at once. */
  attached = false
  /** A cut-in is on screen (set by the view): the warm-up waits rather than build a world under it. */
  busy: () => boolean = () => false
  /** Counts for tests and the probe. */
  stats = { prebuilt: 0, built: 0, warmed: 0 }

  // ---- React binding
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = (): readonly Slot[] => this.snap
  getWarm = (): WarmState => this.warmSnap
  private emit(): void {
    this.snap = this.slots.slice()
    this.warmSnap = { ...this.warm }
    this.listeners.forEach((f) => f())
    this.settle()
  }
  private settle(): void {
    if (!this.waiters.length) return
    const ok = (k: string): boolean => {
      const s = this.slots.find((x) => x.key === k)
      return !s || s.ready
    }
    const keep: Waiter[] = []
    for (const w of this.waiters) {
      if (w.keys.every(ok)) w.resolve()
      else keep.push(w)
    }
    this.waiters = keep
  }
  private wait(keys: string[]): Promise<void> {
    if (!this.attached) return Promise.resolve()
    return new Promise((resolve) => {
      this.waiters.push({ keys, resolve })
      this.settle()
    })
  }

  // ---- reported by the view
  mounted(key: string): void {
    const s = this.slots.find((x) => x.key === key)
    if (!s || s.mounted) return
    s.mounted = true
    // the live world is drawn at once; the hidden ones wait for the view's compile pass
    if (s.kind === 'live') s.ready = true
    this.emit()
  }
  ready(key: string): void {
    const s = this.slots.find((x) => x.key === key)
    if (!s || s.ready) return
    s.ready = true
    this.emit()
  }
  attach(on: boolean): void {
    this.attached = on
    if (!on) {
      this.slots = []
      this.warm = { running: false, done: false, total: 0, step: 0 }
      this.warmRun++
      const w = this.waiters
      this.waiters = []
      w.forEach((x) => x.resolve())
    }
    this.emit()
  }

  // ---- the player
  /** The scene of a link about to play: the prebuilt one when there is one (no build at start), otherwise built now. */
  live(link: LinkPlan): { key: string; scene: CutinScene; prebuilt: boolean } {
    const key = planKey(link)
    const s = this.slots.find((x) => x.key === key && x.scene)
    if (s) {
      s.kind = 'live'
      if (s.mounted) s.ready = true
      this.stats.prebuilt++
      this.emit()
      return { key, scene: s.scene!, prebuilt: s.mounted }
    }
    const scene = buildScene(link)
    this.stats.built++
    // listed even before the view attaches (its chunk may still be loading): it renders the live slot when it mounts
    this.slots.push({ key, kind: 'live', scene, gallery: null, mounted: false, ready: false })
    this.emit()
    return { key, scene, prebuilt: false }
  }
  /** A link is over: drop its world. */
  drop(key: string): void {
    const n = this.slots.length
    this.slots = this.slots.filter((x) => x.key !== key)
    if (this.slots.length !== n) this.emit()
  }
  /** The sequence is over: drop every live world, and any prebuilt one it did not use (the battle has moved on). */
  endSequence(): void {
    const n = this.slots.length
    this.slots = this.slots.filter((x) => x.kind === 'warm')
    if (this.slots.length !== n) this.emit()
  }

  // ---- prebuilding
  /**
   * Build these links' worlds now, hidden (replacing the previous prebuild). Resolves when they are mounted and compiled, or
   * at once when no view is attached.
   */
  async want(links: readonly LinkPlan[]): Promise<void> {
    if (!this.attached) return
    const keys = links.slice(0, MAX_NEXT).map(planKey)
    const drop = this.slots.filter((x) => x.kind === 'next' && !keys.includes(x.key))
    if (drop.length) {
      this.slots = this.slots.filter((x) => !drop.includes(x))
      this.emit()
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (this.slots.some((x) => x.key === key)) continue
      // one world per idle slice: the mount is a single main-thread task
      await idle()
      if (!this.attached) return
      if (this.slots.some((x) => x.key === key)) continue
      this.slots.push({ key, kind: 'next', scene: buildScene(links[i]!), gallery: null, mounted: false, ready: false })
      this.emit()
      await this.wait([key])
    }
    await this.wait(keys)
  }
  /** Whether a link's world is built and compiled. */
  isReady(link: LinkPlan): boolean {
    const s = this.slots.find((x) => x.key === planKey(link))
    return !!s && s.ready
  }

  // ---- warm-up
  /** Mount each warm item in turn behind the intro, wait for its compile pass, drop it. */
  async warmUp(items: readonly ({ link: LinkPlan } | { gallery: GallerySpec })[]): Promise<void> {
    if (!this.attached) return
    const run = ++this.warmRun
    this.warm = { running: true, done: false, total: items.length, step: 0 }
    this.emit()
    for (let i = 0; i < items.length; i++) {
      await idle(250)
      while (this.busy() && run === this.warmRun) await new Promise((r) => setTimeout(r, 200))
      if (run !== this.warmRun || !this.attached) return
      const it = items[i]!
      const key = `warm:${i}:${'link' in it ? planKey(it.link) : 'gallery'}`
      this.slots.push({ key, kind: 'warm', scene: 'link' in it ? buildScene(it.link) : null, gallery: 'gallery' in it ? it.gallery : null, mounted: false, ready: false })
      this.emit()
      await this.wait([key])
      if (run !== this.warmRun) return
      this.slots = this.slots.filter((x) => x.key !== key)
      this.warm.step = i + 1
      this.stats.warmed++
      this.emit()
    }
    this.warm = { ...this.warm, running: false, done: true }
    this.emit()
  }
}

export const prep = new CutinPrep()

// ---- what to prebuild ------------------------------------------------------------------------------------------------

/** The cut-in sequence an action would play, from a speculative engine step (the engine is pure); null when it plays none. */
export function planForAction(state: BattleState, action: Action, speed: 'full' | 'quick' | 'instant', playerSide: string): SequencePlan | null {
  if (action.type !== 'attack' && action.type !== 'stratagem') return null
  const settings = getCutinSettings()
  if (settings.battleScenes === 'off' || speed === 'instant') return null
  const r = step(state, action)
  if (!r.ok) return null
  return planCutins(r.events, state, { settings, speed, playerSide })[0]?.plan ?? null
}

/** Prebuild the scenes of an action (the player's previewed order, or the AI's choice). Resolves when they are ready. */
export function prebuildFor(state: BattleState, action: Action, speed: 'full' | 'quick' | 'instant', playerSide: string): Promise<void> {
  if (!prep.attached) return Promise.resolve()
  const plan = planForAction(state, action, speed, playerSide)
  if (!plan) return Promise.resolve()
  return prep.want(plan.links)
}

// ---- what to warm ----------------------------------------------------------------------------------------------------

interface UnitLike {
  id: string
  officer: string
  side: string
  type: BattleState['units'][number]['type']
  troops: number
  maxTroops?: number
}

/**
 * The warm-up list for a battle: one sample world per scene its units can play (their attacks and their stratagems), with the
 * battle's own officers and troops, cycling through the battle's terrains; then a gallery with every officer's figure (mounted
 * when he rides or charges), every troop kind and palette as a crowd, and every ground the samples did not cover. Capped to
 * the units of this battle (on the field and still to arrive).
 */
export function warmItems(state: BattleState): ({ link: LinkPlan } | { gallery: GallerySpec })[] {
  const units: UnitLike[] = [...state.units, ...state.reinforcements.flatMap((r) => r.units)]
  const actor = (u: UnitLike): ActorPlan => {
    const palette = paletteOf(state, u.side)
    const off = state.data.officers[u.officer]
    return { unit: u.id, officer: u.officer, name: (off?.name ?? u.officer).replace(/\*$/, ''), side: u.side, palette, kind: kindOf(u.type, palette), type: u.type, mounted: u.type === 'cavalry', troopsBefore: u.troops, maxTroops: u.maxTroops ?? u.troops }
  }
  const foeOf = (u: UnitLike, i: number): UnitLike | null => {
    const foes = units.filter((x) => x.side !== u.side)
    return foes.length ? foes[i % foes.length]! : null
  }
  const terrains: string[] = []
  for (const t of state.grid.tiles) if (!terrains.includes(t.terrain)) terrains.push(t.terrain)
  // scenes the battle can play, each with the first unit that can play it
  const scenes = new Map<SceneId, { u: UnitLike; strat: string | null }>()
  for (const u of units) {
    const atk: SceneId[] = u.type === 'archers' ? ['S-archer', 'S-melee'] : [sceneForAttack(u.type, false)]
    for (const s of atk) if (!scenes.has(s)) scenes.set(s, { u, strat: null })
    for (const sid of state.data.officers[u.officer]?.stratagems ?? []) {
      const s = sceneForStratagem(state, sid)
      if (s && !scenes.has(s)) scenes.set(s, { u, strat: sid })
    }
  }
  const order: SceneId[] = ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']
  const items: ({ link: LinkPlan } | { gallery: GallerySpec })[] = []
  const grounds = new Set<GroundKind>()
  let n = 0
  for (const id of order) {
    const pick = scenes.get(id)
    if (!pick) continue
    const caster = actor(pick.u)
    const foe = foeOf(pick.u, n)
    const def = pick.strat ? state.data.stratagems[pick.strat] : null
    const terrain = (terrains[n % Math.max(1, terrains.length)] ?? 'plain') as LinkPlan['terrain']
    n++
    const over: Partial<LinkPlan> = {
      caster: id === 'B' ? { ...caster, mounted: true } : caster,
      terrain,
      ...(id !== 'W' && foe ? { defender: actor(foe) } : {}),
      ...(def ? { strat: def.id, stratName: def.name, tag: def.tag } : {}),
    }
    const link = samplePlan(id, over)
    grounds.add(id === 'A' && link.terrain === 'farm' ? 'millet' : groundKind(link.terrain))
    items.push({ link })
  }
  const seen = new Set<string>()
  const actors: GallerySpec['actors'] = []
  for (const u of units) {
    const a = actor(u)
    const charges = (state.data.officers[u.officer]?.stratagems ?? []).some((s) => sceneForStratagem(state, s) === 'B')
    for (const mounted of [...new Set([a.mounted, charges ? true : a.mounted])]) {
      const k = `${a.officer}|${a.kind}|${a.palette}|${mounted}`
      if (seen.has(k)) continue
      seen.add(k)
      actors.push({ actor: a, mounted })
    }
  }
  const crowds: GallerySpec['crowds'] = []
  const addCrowd = (kind: ActorPlan['kind'], palette: ActorPlan['palette']): void => {
    if (!crowds.some((c) => c.kind === kind && c.palette === palette)) crowds.push({ kind, palette })
  }
  for (const u of units) {
    const a = actor(u)
    addCrowd(a.kind, a.palette)
    // the background battle fights in the two palettes, on foot (rebels for the Yellow Turbans) and a few riders
    addCrowd(a.palette === 'yellow' ? 'rebel' : 'infantry', a.palette)
    addCrowd('cavalry', a.palette)
    // scenes A and A' shoot with archers in the caster's palette
    addCrowd('archer', a.palette)
  }
  const extra = terrains.map((t) => groundKind(t as LinkPlan['terrain'])).filter((g, i, a) => a.indexOf(g) === i && !grounds.has(g))
  items.push({ gallery: { actors, crowds, grounds: extra } })
  return items
}
