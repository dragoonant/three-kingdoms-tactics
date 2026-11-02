// [RL-ROAD-1..6] Road generation from the era template. Pure and deterministic (stream "road").
import { P_ROAD, stream } from './era'
import type { Edge, EraData, NodeRef, Road } from './types'

function weighted<T extends { weight: number }>(rng: () => number, items: T[]): T {
  const tot = items.reduce((a, x) => a + x.weight, 0)
  let r = rng() * tot
  for (const x of items) if ((r -= x.weight) < 0) return x
  return items[items.length - 1]!
}
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

/**
 * Draw the road once from the run seed (RL-ROAD-1): fixed and anchor stops first, then a battle stop for each mid tier
 * (RL-ROAD-6), then every tier filled to two nodes from its pool (RL-ROAD-2; an anchor's partner is never a battle stop),
 * each tier's lane order shuffled; edges per RL-ROAD-3/4; the mountain path per RL-ROAD-5.
 */
export function drawRoad(era: EraData, seed: number): Road {
  const rng = stream(seed, P_ROAD, 0)
  const isBattle = (id: string): boolean => era.road.battleStops.includes(id)
  const long = rng() < 0.5
  const defs = era.road.tiers.filter((t) => long || !t.longOnly)
  const used = new Set<string>()
  const tiers: string[][] = defs.map(() => [])
  defs.forEach((def, ti) => {
    if (def.kind === 'fixed') for (const s of def.stops ?? []) (tiers[ti]!.push(s), used.add(s))
    if (def.kind === 'anchor' && def.anchor) (tiers[ti]!.push(def.anchor), used.add(def.anchor))
  })
  defs.forEach((def, ti) => {
    if (def.kind !== 'mid' || !def.battleRequired) return
    const cands = (era.road.pools.mid ?? []).filter((s) => isBattle(s) && !used.has(s))
    if (cands.length) {
      const s = pick(rng, cands)
      tiers[ti]!.push(s)
      used.add(s)
    }
  })
  defs.forEach((def, ti) => {
    if (def.kind === 'fixed') return
    const pool = era.road.pools[def.pool ?? ''] ?? []
    while (tiers[ti]!.length < 2) {
      const cands = pool.filter((s) => !used.has(s) && !(def.kind === 'anchor' && isBattle(s)))
      if (!cands.length) break
      const s = pick(rng, cands)
      tiers[ti]!.push(s)
      used.add(s)
    }
    if (rng() < 0.5) tiers[ti]!.reverse()
  })
  const edges: Edge[] = []
  for (let ti = 0; ti < tiers.length - 1; ti++) {
    for (let a = 0; a < tiers[ti]!.length; a++) {
      for (let b = 0; b < tiers[ti + 1]!.length; b++) {
        const same = tiers[ti]!.length === 1 || a === b
        if (same || rng() < 0.5) edges.push({ from: [ti, a], to: [ti + 1, b], days: weighted(rng, era.road.legDays).days, kind: 'road' })
      }
    }
  }
  const mt = pick(rng, era.road.mountainPath.fromTiers)
  for (let a = 0; a < (tiers[mt]?.length ?? 0); a++) {
    if (mt + 2 < tiers.length) edges.push({ from: [mt, a], to: [mt + 2, a], days: era.road.mountainPath.days, kind: 'mountain' })
  }
  return { seed, long, tiers, edges, mountainTier: mt }
}

export const sameNode = (a: NodeRef, b: NodeRef): boolean => a[0] === b[0] && a[1] === b[1]

export function edgesFrom(road: Road, node: NodeRef): Edge[] {
  return road.edges.filter((e) => sameNode(e.from, node))
}

export const isLastTier = (road: Road, node: NodeRef): boolean => node[0] === road.tiers.length - 1
