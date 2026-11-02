// Who casts shadows at a quality tier (cutins/quality.ts `casters`; docs/spec/51 "Performance: per-frame budgets and quality
// tiers"). Every shadow caster is one more draw call in the shadow pass, so the phone tiers keep the shadows that ground the
// action and drop the rest:
//   - all:     as built (High);
//   - near:    the figures (the scene's rigs, the rigged front ranks and their horses) and the stage's dressing, not the
//              instanced ranks, the background melee or the props and arrows;
//   - heroes:  the named officers only (the caster and the hero: cutins/casters.ts marks their rigs `lead`).
// A mesh's built value is kept in userData.cast0, so the policy can change both ways and the warm-up can draw every possible
// caster once (CutinView's Warmer). The object groups are the frame probe's (tools/perf/cutin-frame.mjs): userData.perf tags
// on the stage, the ranks and the melee, and the rig groups named 'figure'.
import type { Object3D } from 'three'
import type { TierSpec } from './quality'

export type CasterGroup = 'lead' | 'hero' | 'rank-rig' | 'rank-inst' | 'melee' | 'stage' | 'props'

/** The probe's object group of a draw-producing object, from its ancestors. */
export function casterGroup(o: Object3D): CasterGroup {
  let top: string | null = null
  let fig = false
  let lead = false
  for (let a: Object3D | null = o; a; a = a.parent) {
    const t = a.userData?.perf as string | undefined
    if (t) top = t
    if (a.name === 'figure') fig = true
    if (a.userData?.lead) lead = true
  }
  if (lead) return 'lead'
  if (top === 'stage') return 'stage'
  if (top === 'melee') return 'melee'
  if (top === 'ranks') return fig ? 'rank-rig' : 'rank-inst'
  return fig ? 'hero' : 'props'
}

const allowed: Record<TierSpec['casters'], ReadonlySet<CasterGroup>> = {
  all: new Set(['lead', 'hero', 'rank-rig', 'rank-inst', 'melee', 'stage', 'props']),
  near: new Set(['lead', 'hero', 'rank-rig', 'stage']),
  heroes: new Set(['lead']),
}

/** Apply a caster policy under root. Returns how many meshes cast after it. */
export function applyCasters(root: Object3D, policy: TierSpec['casters']): number {
  const ok = allowed[policy]
  let n = 0
  root.traverse((o) => {
    const m = o as Object3D & { isMesh?: boolean }
    if (!m.isMesh) return
    if (m.userData.cast0 === undefined) m.userData.cast0 = m.castShadow
    if (!m.userData.cast0) return
    m.castShadow = policy === 'all' || ok.has(casterGroup(m))
    if (m.castShadow) n++
  })
  return n
}
