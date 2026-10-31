// The utility AI. decide(state, options) answers with ONE action from legalActions(state) for the side to move.
// The client calls it again after every action, so a whole phase is a sequence of calls; the unit with the
// best-scoring activation goes first. Pure and deterministic given (state, tier, seed); the clock is injected so tests
// can freeze it. Never throws: any failure falls back to the greedy bot, then to endPhase.
import { legalActions, type Action, type BattleState } from '../engine'
import { greedyAction } from './greedy'
import { buildCtx, posScore, threatenFrom, type Ctx } from './context'
import { candidatesForUnit, escapeCandidates, rollout, type Cand } from './evaluate'
import type { Goals } from './goals'
import { hash32, makeRng } from './prng'

export type Tier = 'random' | 'easy' | 'normal'
export const TIERS: Tier[] = ['random', 'easy', 'normal']

export interface DeciderOptions {
  tier?: Tier
  /** Any integer; the same (state, tier, seed) always gives the same action. Defaults to state.seed. */
  seed?: number
  /** Wall-clock budget for the search in milliseconds (default 300). */
  budgetMs?: number
  /** Injected clock in ms. Tests freeze it; the default is performance.now / Date.now. */
  now?: () => number
  /** Replaces the goals derived from the state (see goals.ts). */
  goals?: Goals
  /** Destinations considered per unit (default 12). */
  maxDests?: number
  /** How many top candidates to re-price by sampling the engine (default 5) and with how many samples (default 5). */
  refine?: number
  samples?: number
}

export type FallbackKind = 'none' | 'greedy' | 'endPhase'

export interface Decision {
  action: Action
  tier: Tier
  /** Gain of the chosen candidate over doing nothing with that unit (utility tier only). */
  gain: number
  /** Candidates priced. */
  considered: number
  /** The search stopped early because the time budget ran out. */
  truncated: boolean
  /** The utility search failed or found nothing legal and another policy answered. */
  fallback: FallbackKind
  /** Short human-readable reason (debugging, the bench and tests). */
  label: string
  /** Wall-clock milliseconds the decision took (measured with performance.now, independent of the injected clock). */
  ms: number
}

const DEFAULT_BUDGET_MS = 300
const EPSILON_GAIN = 2

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

const key = (a: Action): string => JSON.stringify(a)

function stateSalt(state: BattleState): number {
  let h = state.round * 31 + state.phaseIndex
  for (const u of state.units) h = (Math.imul(h, 31) + u.x * 17 + u.y * 7 + (u.done ? 3 : 0) + (u.moved ? 5 : 0) + u.troops) | 0
  return h >>> 0
}

// ------------------------------------------------------------------ random tier

// undoMove is never chosen: the tier is stateless, so a move/undo pair could repeat forever.
const RANDOM_WEIGHTS: Record<string, number> = { stratagem: 6, attack: 5, sway: 2, move: 3, wait: 1 }

function randomAction(state: BattleState, legal: Action[], seed: number): Action {
  const rnd = makeRng(hash32(seed, stateSalt(state)))
  const byType = new Map<string, Action[]>()
  for (const a of legal) {
    if (a.type === 'endPhase' || a.type === 'undoMove') continue
    const l = byType.get(a.type)
    if (l) l.push(a)
    else byType.set(a.type, [a])
  }
  if (byType.size === 0) return { type: 'endPhase' }
  let total = 0
  for (const t of byType.keys()) total += RANDOM_WEIGHTS[t] ?? 1
  let r = rnd() * total
  for (const [t, list] of byType) {
    r -= RANDOM_WEIGHTS[t] ?? 1
    if (r <= 0) return list[Math.floor(rnd() * list.length)]!
  }
  const first = [...byType.values()][0]!
  return first[0]!
}

// ------------------------------------------------------------------ utility tier

interface Search {
  best: Cand | null
  considered: number
  truncated: boolean
  ranked: Cand[]
}

function search(state: BattleState, legal: Action[], opts: Required<Pick<DeciderOptions, 'maxDests' | 'refine' | 'samples'>> & DeciderOptions, now: () => number, deadline: number): Search {
  const ctx: Ctx = buildCtx(state, opts.goals)
  const seed = opts.seed ?? state.seed
  const expired = (): boolean => now() > deadline
  const ready = state.units.filter((u) => u.side === ctx.me && !u.done && !u.confused)
  // Best-looking units first, so a truncated search has already seen the moves that matter.
  const order = ready
    .map((u) => ({ u, p: threatenFrom(ctx, u, u) - posScore(ctx, u, u, u.facing).incoming * 0.01 }))
    .sort((a, b) => b.p - a.p || (a.u.id < b.u.id ? -1 : 1))
  const cands: Cand[] = [...escapeCandidates(ctx, legal)]
  let truncated = false
  let bestGain = cands.reduce((m, c) => Math.max(m, c.gain), -Infinity)
  for (const { u } of order) {
    // Out of time: stop as soon as something worthwhile is in hand; otherwise keep looking, cheaply
    // (a few destinations per unit), so a short budget never turns into a pointless early endPhase.
    const late = cands.length > 0 && expired()
    if (late) {
      truncated = true
      if (bestGain > EPSILON_GAIN) break
    }
    for (const c of candidatesForUnit(ctx, u, late ? 3 : opts.maxDests, expired)) {
      cands.push(c)
      if (c.gain > bestGain) bestGain = c.gain
    }
  }
  // Best two per unit keeps the shortlist varied.
  cands.sort((a, b) => b.gain - a.gain || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  const perUnit = new Map<string, number>()
  const short: Cand[] = []
  for (const c of cands) {
    const n = perUnit.get(c.unit) ?? 0
    if (n >= 2) continue
    perUnit.set(c.unit, n + 1)
    short.push(c)
  }
  // Re-price the leaders by sampling the engine with private seeds (common random numbers across candidates).
  if (!expired()) {
    const salt = hash32(seed, stateSalt(state))
    const seeds = Array.from({ length: opts.samples }, (_, i) => hash32(salt, i, 'rollout'))
    const idleCache = new Map<string, number>()
    const idleOf = (c: Cand): number => {
      const hit = idleCache.get(c.unit)
      if (hit !== undefined) return hit
      const u = state.units.find((x) => x.id === c.unit)!
      const v = posScore(ctx, u, u, u.facing).value
      idleCache.set(c.unit, v)
      return v
    }
    let refined = 0
    for (const c of short) {
      if (refined >= opts.refine) break
      if (!c.finish || c.finish.type === 'wait') continue
      if (expired()) {
        truncated = true
        break
      }
      const v = rollout(ctx, c, seeds)
      refined++
      if (v === null) continue
      c.score = v
      c.gain = v - idleOf(c)
    }
    short.sort((a, b) => b.gain - a.gain || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  }
  const legalKeys = new Set(legal.map(key))
  let best: Cand | null = null
  for (const c of short) {
    if (!legalKeys.has(key(c.emit))) continue
    best = c
    break
  }
  return { best, considered: cands.length, truncated, ranked: short }
}

function utilityAction(state: BattleState, legal: Action[], opts: DeciderOptions, now: () => number): Omit<Decision, 'tier' | 'ms'> {
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS
  const start = now()
  const full = { maxDests: opts.maxDests ?? 12, refine: opts.refine ?? 5, samples: opts.samples ?? 5, ...opts }
  const s = search(state, legal, full, now, start + budget)
  if (!s.best || s.best.gain <= EPSILON_GAIN) {
    return { action: { type: 'endPhase' }, gain: 0, considered: s.considered, truncated: s.truncated, fallback: 'none', label: 'endPhase' }
  }
  return { action: s.best.emit, gain: s.best.gain, considered: s.considered, truncated: s.truncated, fallback: 'none', label: s.best.label }
}

// ------------------------------------------------------------------ entry points

export function decide(state: BattleState, options: DeciderOptions = {}): Decision {
  const now = options.now ?? defaultNow
  const t0 = defaultNow()
  const tier: Tier = options.tier ?? 'normal'
  const finish = (d: Omit<Decision, 'tier' | 'ms'>): Decision => ({ ...d, tier, ms: defaultNow() - t0 })
  const stop: Omit<Decision, 'tier' | 'ms'> = { action: { type: 'endPhase' }, gain: 0, considered: 0, truncated: false, fallback: 'none', label: 'endPhase' }
  if (state.result) return finish(stop)
  let legal: Action[]
  try {
    legal = legalActions(state)
  } catch {
    return finish({ ...stop, fallback: 'endPhase', label: 'legalActions threw' })
  }
  if (legal.every((a) => a.type === 'endPhase')) return finish({ ...stop, label: 'nothing to do' })
  const seed = options.seed ?? state.seed
  try {
    if (tier === 'random') return finish({ ...stop, action: randomAction(state, legal, seed), label: 'random' })
    if (tier === 'easy') return finish({ ...stop, action: greedyAction(state), label: 'greedy' })
    const d = utilityAction(state, legal, options, now)
    if (!legal.some((a) => key(a) === key(d.action))) throw new Error('illegal choice')
    return finish(d)
  } catch {
    try {
      const g = greedyAction(state)
      if (legal.some((a) => key(a) === key(g))) return finish({ ...stop, action: g, fallback: 'greedy', label: 'fallback greedy' })
    } catch {
      /* fall through */
    }
    return finish({ ...stop, fallback: 'endPhase', label: 'fallback endPhase' })
  }
}

export function decideAction(state: BattleState, options: DeciderOptions = {}): Action {
  return decide(state, options).action
}
