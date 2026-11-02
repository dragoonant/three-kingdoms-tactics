// The instanced ranks of the cut-ins (docs/spec/51 "More troops", PLAN D22; API in docs/spec/52-crowds.md). The scenes keep their
// rigged front-rank figures as the hero-level actors; everyone behind them is a Crowd from ../crowd: the same rig, baked and
// instanced, running the same clips. This file turns "N more troops of this kind and side, standing here" into a crowd at the
// cut-in scale, applies the quality profile, and keeps the scene's crowds together (update, stats, dispose).
//
// Scripting: a scene schedules every crowd command up front from its own plan (story times, ascending), then calls
// `set.update(story)` each frame, so the crowds stay a pure function of story time like the rest of the scene.
import { Group, Vector3 } from 'three'
import { createCrowd, crowdScale, type Crowd, type CrowdOptions, type FormationName } from '../crowd'
import type { SidePalette, TroopKindName } from '../plan'
import { specNow } from '../quality'

/**
 * `full` (default): 2 troop variants, shadows on. `lite` (`?crowd=lite`, or `?shadows=0`): 60% of the members, one variant,
 * no crowd shadows. `off` (`?crowd=off`): the front-rank figures only, as before D22.
 */
export type CrowdQuality = 'full' | 'lite' | 'off'

function query(name: string): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name)
  } catch {
    return null
  }
}

/** `?crowd=` (or `?shadows=0`) when the page asks for a profile, else null. */
function crowdQuery(): CrowdQuality | null {
  const q = query('crowd')
  if (q === 'off' || q === '0') return 'off'
  if (q === 'lite' || q === 'lo') return 'lite'
  if (q === 'full') return 'full'
  if (query('shadows') === '0') return 'lite'
  return null
}

/** The instanced ranks' profile: `?crowd=` when given, else the quality tier's (cutins/quality.ts). */
export function crowdQuality(): CrowdQuality {
  return crowdQuery() ?? specNow().crowd
}

/** The background melee's profile: `?crowd=` when given, else the quality tier's. */
export function meleeQuality(): CrowdQuality {
  return crowdQuery() ?? specNow().melee
}

export interface RankSpec {
  kind: TroopKindName
  palette: SidePalette
  /** Members before the quality profile. */
  count: number
  seed: number
  /** World x, z of the middle of the crowd's first rank, and the way it faces (yaw from +z toward +x). */
  at: readonly [number, number]
  facing: number
  formation?: FormationName
  /** Members per rank (block, mob, line). */
  files?: number
  /** World spacing between files and between ranks (tiles); default the crowd's own. */
  gap?: readonly [number, number]
  jitter?: number
  cadence?: number
  /** Full rigs at the front of this crowd (default none: the scene's own rigs are the front rank). */
  rigs?: number
  shadow?: boolean
}

/** The member count a spec gets under a quality profile. */
export function rankCount(count: number, q: CrowdQuality = crowdQuality()): number {
  if (q === 'off') return 0
  return Math.max(0, Math.round(q === 'lite' ? count * 0.6 : count))
}

/** A crowd for the ranks behind a front rank, or null when the profile (or the count) leaves none. */
export function spawnRanks(spec: RankSpec, q: CrowdQuality = crowdQuality()): Crowd | null {
  const rigs = spec.rigs ?? 0
  const n = rigs > 0 ? Math.max(rigs, rigs + rankCount(spec.count - rigs, q)) : rankCount(spec.count, q)
  if (n <= 0) return null
  const k = crowdScale()
  const o: CrowdOptions = {
    kind: spec.kind,
    side: spec.palette,
    count: n,
    seed: spec.seed,
    origin: [spec.at[0], 0, spec.at[1]],
    facing: spec.facing,
    frontRankFull: rigs,
    frontRankMode: 'rig',
    variants: q === 'lite' ? 1 : 2,
    detail: 'lo',
    castShadow: q === 'lite' ? false : (spec.shadow ?? true),
    ...(spec.formation ? { formation: spec.formation } : {}),
    ...(spec.files !== undefined ? { files: spec.files } : {}),
    ...(spec.gap ? { spacing: { x: spec.gap[0] / k, z: spec.gap[1] / k } } : {}),
    ...(spec.jitter !== undefined ? { jitter: spec.jitter } : {}),
    ...(spec.cadence !== undefined ? { cadence: spec.cadence } : {}),
  }
  return createCrowd(o)
}

/** World ground positions of every member at time 0 (for dressing clearances and aiming). */
export function memberSpots(c: Crowd | null): { x: number; z: number }[] {
  if (!c) return []
  const v = new Vector3()
  return c.members.map((m) => {
    c.positionOf(m.index, v, true)
    return { x: v.x, z: v.z }
  })
}

/** World ground position of member i after the last update. */
export function spotOf(c: Crowd, i: number, out = new Vector3()): Vector3 {
  return c.positionOf(i, out, true)
}

/** World direction [x, z] -> the crowd's local frame (for march / flee / fall impulses). */
export function toLocal(c: Crowd, dir: readonly [number, number]): [number, number] {
  const a = -c.group.rotation.y
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  // rotation about +y by a: x' = x cos a + z sin a, z' = -x sin a + z cos a
  return [dir[0] * ca + dir[1] * sa, -dir[0] * sa + dir[1] * ca]
}

/**
 * Commands for several crowds, applied in ascending time whatever order the scene wrote them in (the crowd timeline drops later
 * commands when an earlier one arrives, docs/spec/52 "Determinism"). Ties keep the order they were added.
 */
export class CrowdScript {
  private q: { at: number; n: number; run: () => void }[] = []
  at(t: number, run: () => void): void {
    this.q.push({ at: t, n: this.q.length, run })
  }
  apply(): void {
    this.q.sort((a, b) => a.at - b.at || a.n - b.n)
    for (const e of this.q) e.run()
    this.q = []
  }
}

/** The crowds of one scene: one Group to mount, one update per frame, the counts the review tools report. */
export class CrowdSet {
  readonly group = new Group()
  constructor(tag: 'ranks' | 'melee' = 'ranks') {
    // the frame probe's object groups (tools/perf/cutin-frame.mjs)
    this.group.userData.perf = tag
  }
  readonly list: Crowd[] = []
  add(c: Crowd | null): Crowd | null {
    if (c) {
      this.list.push(c)
      this.group.add(c.group)
    }
    return c
  }
  update(t: number): void {
    for (const c of this.list) c.update(t)
  }
  members(c: Crowd | null): number {
    return c ? c.members.length : 0
  }
  stats(): { members: number; drawCalls: number; triangles: number } {
    let members = 0
    let drawCalls = 0
    let triangles = 0
    for (const c of this.list) {
      const s = c.stats()
      members += s.members
      drawCalls += s.drawCalls
      triangles += s.triangles
    }
    return { members, drawCalls, triangles }
  }
  dispose(): void {
    for (const c of this.list) c.dispose()
    this.list.length = 0
  }
}

/** Troops on screen per side, published for the review tools (render-cutins prints them with the draw calls). */
export function publishTroops(scene: string, atk: number, def: number, crowds: CrowdSet, melee?: { members: [number, number]; drawCalls(): number } | null): void {
  try {
    if (typeof window === 'undefined') return
    const w = window as unknown as { __cutinTroops?: Record<string, unknown> }
    const bg = melee ? { members: melee.members, drawCalls: melee.drawCalls() } : null
    w.__cutinTroops = { ...(w.__cutinTroops ?? {}), [scene]: { atk, def, crowd: crowds.stats(), melee: bg } }
  } catch {
    /* the review numbers are optional */
  }
}
