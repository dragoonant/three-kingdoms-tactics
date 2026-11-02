// Cut-in quality tiers (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32). This module owns them:
// what each tier sets, which tier is on, how Auto picks and steps down, and the manual override (settings panel, `?quality=`).
//
//   - High (desktop, the look the scenes were authored at), Medium and Low (phones).
//   - Auto (default) starts from the device (touch with a small screen, or iOS: Medium; else High), then from the frame time the
//     board shows while the warm-up runs, and steps down one tier live when a cut-in's median frame interval stays above
//     STEP_MS over WINDOW frames. A step down is remembered (localStorage, in try/catch). It never steps up mid-scene.
//   - A tier change never creates a WebGL context and never changes a shader program: MSAA and the shadow-map type are context /
//     program choices, so they are fixed when the cut-in canvas is created (the tier at mount); everything else (resolution,
//     shadow-map size, who casts, crowd density, background melee, particle counts) follows the live tier.
//
// The selection logic is pure (unit-tested); the store and the device probe sit at the bottom. No three, no React components.
import { create } from 'zustand'

export type Tier = 'high' | 'medium' | 'low'
export type QualityChoice = 'auto' | Tier
export const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low']

export interface TierSpec {
  label: string
  /** Device pixel ratio cap of the cut-in canvas. */
  dpr: number
  /** MSAA (antialias) on the cut-in canvas: fixed at canvas creation. */
  msaa: boolean
  /** Shadow-map type (fixed at canvas creation: it is part of every program) and the key light's map size. */
  shadowType: 'pcf' | 'basic'
  shadowMap: number
  /** Who casts shadows (casterPolicy.ts): everything, the figures and the stage dressing, or the scene's own rigs only. */
  casters: 'all' | 'near' | 'heroes'
  /** Instanced ranks: `?crowd=` profile (full: 2 variants and shadows; lite: 60%, 1 variant, no crowd shadows; off). */
  crowd: 'full' | 'lite' | 'off'
  /** Background melee (scenes/melee.ts): full, lite (half the knots, no riders), off. */
  melee: 'full' | 'lite' | 'off'
  /** Figure detail: `lo` rebuilds the figures' generated primitives with fewer segments (as the instanced ranks), at build. */
  lod: 'hi' | 'lo'
  /** Share of the particles drawn (embers, sparks, smoke, dust). */
  fx: number
  /** Peak draw calls a frame, shadow pass included, that the tier must stay under (tests/e2e/cutin-budget.spec.ts). */
  budget: number
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { label: 'High', dpr: 1.5, msaa: true, shadowType: 'pcf', shadowMap: 1536, casters: 'all', crowd: 'full', melee: 'full', lod: 'hi', fx: 1, budget: 800 },
  medium: { label: 'Medium', dpr: 1.25, msaa: true, shadowType: 'pcf', shadowMap: 1024, casters: 'near', crowd: 'lite', melee: 'lite', lod: 'hi', fx: 0.6, budget: 500 },
  low: { label: 'Low', dpr: 1, msaa: false, shadowType: 'basic', shadowMap: 1024, casters: 'heroes', crowd: 'lite', melee: 'off', lod: 'lo', fx: 0.4, budget: 300 },
}

export const QUALITY_CHOICES: { value: QualityChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

/** Auto's live step-down: the median of the last WINDOW frame intervals of a cut-in above STEP_MS. */
export const STEP_MS = 25
export const WINDOW = 15
/** Intervals longer than this are a pause (a hidden tab, a stall between links), not a frame. */
export const MAX_INTERVAL_MS = 400

export const isTier = (v: unknown): v is Tier => v === 'high' || v === 'medium' || v === 'low'
export const isChoice = (v: unknown): v is QualityChoice => v === 'auto' || isTier(v)

export const lower = (t: Tier): Tier => TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)]!
export const lowest = (a: Tier, b: Tier): Tier => (TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b)

export interface DeviceInfo {
  touch: boolean
  /** The screen's shorter side, CSS px. */
  minSide: number
  ios: boolean
}

/** Auto's starting tier from the device alone: iOS, or touch with a phone-sized screen, starts at Medium. */
export function deviceTier(d: DeviceInfo): Tier {
  if (d.ios) return 'medium'
  if (d.touch && d.minSide <= 820) return 'medium'
  return 'high'
}

/** Auto's starting tier: the device's, or lower when a step down was remembered on this device. */
export function startTier(d: DeviceInfo, remembered: Tier | null): Tier {
  const t = deviceTier(d)
  return remembered ? lowest(t, remembered) : t
}

/** After the warm-up: the board's median frame interval over about a second; above STEP_MS the device starts a tier lower. */
export function afterWarm(t: Tier, boardMedianMs: number | null): Tier {
  return boardMedianMs !== null && boardMedianMs > STEP_MS ? lower(t) : t
}

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0
}

/** Auto's live governor: feed it a cut-in's frame intervals; it says when to step down (once per full window, never up). */
export class Governor {
  private xs: number[] = []
  constructor(
    readonly window = WINDOW,
    readonly limit = STEP_MS,
  ) {}
  /** Returns true when the tier should step down now. */
  feed(intervalMs: number): boolean {
    if (!(intervalMs > 0) || intervalMs > MAX_INTERVAL_MS) return false
    this.xs.push(intervalMs)
    if (this.xs.length > this.window) this.xs.shift()
    if (this.xs.length < this.window) return false
    if (median(this.xs) <= this.limit) return false
    this.xs = []
    return true
  }
  reset(): void {
    this.xs = []
  }
  get size(): number {
    return this.xs.length
  }
}

/** The live tier for a choice: a manual tier is used as is; Auto uses its own (device, warm-up, step-downs). */
export function resolveTier(choice: QualityChoice, auto: Tier): Tier {
  return choice === 'auto' ? auto : choice
}

// ---------------------------------------------------------------------------------------------------------------- the store

export const QUALITY_KEY = 'tkt.cutinQuality.v1'
export const AUTO_KEY = 'tkt.cutinQuality.auto.v1'

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
function read(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function write(key: string, v: string): void {
  try {
    storage()?.setItem(key, v)
  } catch {
    /* holds for this session */
  }
}
function query(name: string): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name)
  } catch {
    return null
  }
}

export function detectDevice(): DeviceInfo {
  try {
    const nav = typeof navigator === 'undefined' ? null : navigator
    const touch = !!nav && ((nav.maxTouchPoints ?? 0) > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window))
    const ua = nav?.userAgent ?? ''
    // iPadOS reports a Mac user agent with touch points
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav?.maxTouchPoints ?? 0) > 1)
    const minSide = typeof screen === 'undefined' ? 1080 : Math.min(screen.width, screen.height)
    return { touch, minSide, ios }
  } catch {
    return { touch: false, minSide: 1080, ios: false }
  }
}

const TEST = query('test') === '1'
const q = query('quality')
/** `?quality=` wins for the session; in `?test=1` the default is High with no live stepping, unless `?quality=auto`. */
const forced: QualityChoice | null = isChoice(q) ? q : TEST ? 'high' : null

function initialChoice(): QualityChoice {
  if (forced) return forced
  const s = read(QUALITY_KEY)
  return isChoice(s) ? s : 'auto'
}
function initialAuto(): Tier {
  const rem = read(AUTO_KEY)
  return startTier(detectDevice(), isTier(rem) ? rem : null)
}

interface QualityStore {
  choice: QualityChoice
  /** Auto's own tier (device, warm-up, step-downs). */
  auto: Tier
  /** The tier in force. */
  tier: Tier
  /** How many live step-downs Auto has made this session. */
  steps: number
  setChoice(c: QualityChoice): void
  /** Auto steps down one tier (remembered on this device). */
  stepDown(reason: string): void
  /** Auto's start after the warm-up (may lower, never raises). */
  settleStart(t: Tier): void
}

export const useQuality = create<QualityStore>((set, get) => {
  const choice = initialChoice()
  const auto = initialAuto()
  return {
    choice,
    auto,
    tier: resolveTier(choice, auto),
    steps: 0,
    setChoice(c) {
      write(QUALITY_KEY, c)
      set({ choice: c, tier: resolveTier(c, get().auto) })
    },
    stepDown(reason) {
      const s = get()
      if (s.choice !== 'auto' || s.auto === 'low') return
      const auto = lower(s.auto)
      write(AUTO_KEY, auto)
      log.push({ at: typeof performance === 'undefined' ? 0 : performance.now(), from: s.auto, to: auto, reason })
      set({ auto, tier: auto, steps: s.steps + 1 })
    },
    settleStart(t) {
      const s = get()
      const auto = lowest(s.auto, t)
      if (auto === s.auto) return
      set({ auto, tier: resolveTier(s.choice, auto) })
    },
  }
})

const log: { at: number; from: Tier; to: Tier; reason: string }[] = []

/** The tier in force now (outside React). */
export const tierNow = (): Tier => useQuality.getState().tier
export const specNow = (): TierSpec => TIERS[tierNow()]

// ---------------------------------------------------------------------------------------------------------------- live frames

const governor = new Governor()
/** Test hook (`?test=1`): once set, every measured interval reads as a 60 fps frame plus this many ms (the software GL's own
 * pace is ignored), to force Auto down or hold it. */
let inflate: number | null = null
let lastFrame = 0
/** Live stepping runs for Auto, except in `?test=1` unless the page asked for `?quality=auto`. */
const live = (): boolean => useQuality.getState().choice === 'auto' && (!TEST || q === 'auto')

/** A cut-in frame was drawn on the wall clock (the cut-in canvas calls this). */
export function cutinFrame(now: number): void {
  const dt = lastFrame ? now - lastFrame : 0
  lastFrame = now
  if (!live() || dt <= 0) return
  const measured = inflate === null ? dt : 1000 / 60 + inflate
  if (governor.feed(measured)) useQuality.getState().stepDown(`median frame over ${STEP_MS} ms for ${WINDOW} frames`)
}
/** The cut-in stopped (ended, skipped or paused): the next frame starts a new interval. */
export function cutinIdle(): void {
  lastFrame = 0
}

/** After the warm-up: watch the board for about a second; Auto starts a tier lower when it is already slow. */
export function measureBoardStart(ms = 1000): void {
  if (!live() || typeof requestAnimationFrame === 'undefined') return
  const xs: number[] = []
  let last = 0
  const t0 = performance.now()
  const tick = (now: number): void => {
    if (last) xs.push(inflate === null ? now - last : 1000 / 60 + inflate)
    last = now
    if (now - t0 < ms) requestAnimationFrame(tick)
    else if (xs.length >= 5) useQuality.getState().settleStart(afterWarm(useQuality.getState().auto, median(xs.filter((x) => x <= MAX_INTERVAL_MS))))
  }
  requestAnimationFrame(tick)
}

if (typeof window !== 'undefined' && TEST) {
  ;(window as unknown as { __cutinQuality?: unknown }).__cutinQuality = Object.assign(
    () => {
      const s = useQuality.getState()
      return { choice: s.choice, auto: s.auto, tier: s.tier, steps: s.steps, log: log.slice() }
    },
    {
    inflate: (ms: number | null) => {
      inflate = ms
    },
    governor: () => governor.size,
    },
  )
}
