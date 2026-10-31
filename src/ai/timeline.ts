// What the scheduled world is about to do to us, read from the engine's open information only
// (query.timelinePreview: hidden items never appear) plus the pending reinforcement waves in the state.
//
//   shifts     tiles that change terrain soon (flood, gate opened, bridge destroyed): do not park units on them
//   ignite     tiles that will be set alight by the timeline: counted as fire
//   arrivals   enemy reinforcements that appear on their entry tiles and act in the enemy's next phase: they are added
//              to the threat map as phantom units, so a unit does not end its move next to an entry tile
//   threat state/foes  the board plus those phantoms (for the threat estimator only; they are never targets)
import { canStandOn, query, type BattleState, type Pos, type Terrain, type Unit } from '../engine'
import { unitFromDef } from '../engine/ops'
import { nearestFreeTile } from '../engine/terrain'

export interface Shift {
  to: Terrain
  /** 1 when it lands before our next activation, less when it is further off. */
  weight: number
}

export interface TimelineFacts {
  /** Per tile index. */
  shifts: Map<number, Shift>
  igniteTiles: Pos[]
  /** Phantom enemy units for the next enemy phase. */
  arrivals: Unit[]
  /** The state with the phantoms added; equal to the real state when nobody is due. */
  threatState: BattleState
  threatFoes: Unit[]
  /** Short notes (tests, debugging). */
  notes: string[]
}

const sameTiles = (a: Pos[], b: [number, number][]): boolean => a.length === b.length && a.every((p, i) => p.x === b[i]![0] && p.y === b[i]![1])

/** Round in which `side`'s phase next comes up after the current phase. */
export function nextPhaseRound(state: BattleState, side: string): number {
  const idx = state.sideOrder.indexOf(side)
  return idx > state.phaseIndex ? state.round : state.round + 1
}

export function timelineFacts(state: BattleState, me: string): TimelineFacts {
  const shifts = new Map<number, Shift>()
  const igniteTiles: Pos[] = []
  const notes: string[] = []
  const now = state.round * 2
  for (const item of query.timelinePreview(state, 16)) {
    if (item.kind === 'reinforcement') continue
    const delta = item.round * 2 + (item.phase === 'end' ? 1 : 0) - now
    const weight = delta <= 2 ? 1 : delta <= 4 ? 0.4 : 0
    if (weight === 0) continue
    if (item.kind === 'terrain') {
      // The preview names the change; the timeline entry it came from carries the terrain id.
      const src = state.timeline.find((t) => t.kind === 'terrain' && !t.hidden && t.round === item.round && t.phase === item.phase && sameTiles(item.tiles, t.tiles))
      if (!src || src.kind !== 'terrain') continue
      for (const p of item.tiles) {
        const i = p.y * state.grid.width + p.x
        const old = shifts.get(i)
        if (!old || old.weight < weight) shifts.set(i, { to: src.to, weight })
      }
      notes.push(`terrain ${src.to} x${item.tiles.length} at round ${item.round} ${item.phase}`)
    } else if (item.kind === 'ignite' && weight >= 1) {
      igniteTiles.push(...item.tiles)
      notes.push(`ignite x${item.tiles.length} at round ${item.round} ${item.phase}`)
    }
  }

  // Enemy waves due in the enemy's next phase appear after phaseStarted and act at once (Qi 4).
  const arrivals: Unit[] = []
  const taken = new Set(state.units.map((u) => u.id))
  const probe: BattleState = { ...state }
  for (const side of state.sideOrder) {
    if (side === me) continue
    const due = nextPhaseRound(state, side)
    for (const r of state.reinforcements) {
      if (r.side !== side || r.round !== due) continue
      r.units.forEach((d, i) => {
        if (taken.has(d.id)) return
        const e = r.entry[Math.min(i, r.entry.length - 1)]!
        let at: Pos = { x: e[0], y: e[1] }
        const occupied = (p: Pos): boolean => state.units.some((u) => u.x === p.x && u.y === p.y) || arrivals.some((u) => u.x === p.x && u.y === p.y)
        if (occupied(at) || !canStandOn(state, at.x, at.y, d.side, d.type)) {
          const free = nearestFreeTile({ ...probe, units: [...state.units, ...arrivals] }, { ...at, side: d.side, type: d.type }, at)
          if (!free) return
          at = free
        }
        const u = unitFromDef({ ...d, x: at.x, y: at.y })
        u.qi = 4
        arrivals.push(u)
        notes.push(`arrival ${u.id} at ${at.x},${at.y} round ${r.round}`)
      })
    }
  }
  const threatState: BattleState = arrivals.length > 0 ? { ...state, units: [...state.units, ...arrivals] } : state
  const threatFoes = threatState.units.filter((u) => u.side !== me)
  return { shifts, igniteTiles, arrivals, threatState, threatFoes, notes }
}
