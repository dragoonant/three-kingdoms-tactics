// A seeded random policy shared by tools/sim.ts and the unit tests. Not an AI: it only
// slightly prefers attacks and stratagems over waiting. Uses its own tiny PRNG (no Math.random).
import type { Action, BattleState } from '../src/engine'
import { legalActions } from '../src/engine'

export function makePolicyRng(seed: number): () => number {
  let a = (seed ^ 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WEIGHTS: Record<string, number> = {
  stratagem: 6,
  attack: 5,
  sway: 2,
  move: 3,
  wait: 1,
  undoMove: 0.15,
}

/** Choose a legal action. Calls endPhase only when no unit has anything else to do. */
export function chooseAction(state: BattleState, rnd: () => number, legal: Action[] = legalActions(state)): Action {
  const byType = new Map<string, Action[]>()
  for (const a of legal) {
    if (a.type === 'endPhase') continue
    const l = byType.get(a.type)
    if (l) l.push(a)
    else byType.set(a.type, [a])
  }
  if (byType.size === 0) return { type: 'endPhase' }
  let total = 0
  for (const t of byType.keys()) total += WEIGHTS[t] ?? 1
  let r = rnd() * total
  for (const [t, list] of byType) {
    r -= WEIGHTS[t] ?? 1
    if (r <= 0) return list[Math.floor(rnd() * list.length)]!
  }
  const first = [...byType.values()][0]!
  return first[0]!
}
