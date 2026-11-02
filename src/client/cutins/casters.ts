// The caster's figure: the unique hero design when the officer has one, else the named-officer kit (default look by id, troop
// type and side), mounted when the unit rides. Mirrors board/Figure.tsx's buildUnitRig, but with shared materials (the cut-ins
// never tint a figure) and an explicit `mounted`.
import type { Rig } from '../figures'
import { compactRig } from '../figures/compact'
import { lowGeometry } from './crowd/bake'
import { specNow } from './quality'
import { buildHeroRig, isHeroId } from '../figures/heroes'
import { buildOfficer } from '../figures/officerKit'
import type { ActorPlan } from './plan'

export function buildCasterRig(a: ActorPlan, mounted: boolean): Rig {
  return cutinRig(isHeroId(a.officer) ? buildHeroRig(a.officer, { mounted })! : buildOfficer(a.officer, { type: a.kind, side: a.palette, mounted }), true)
}

/**
 * Every rig a cut-in shows goes through here: its meshes are merged per joint (figures/compact.ts), a few dozen draw calls
 * fewer per figure with the same picture (docs/spec/51 "Performance: per-frame budgets and quality tiers").
 */
export function cutinRig(rig: Rig, lead = false): Rig {
  // the phone tier (Low) draws the figures' generated primitives with fewer segments, as the instanced ranks do
  compactRig(rig, specNow().lod === 'lo' ? { reduce: lowGeometry } : {})
  // the named officers: the ones that keep their shadow on the phone tier (casterPolicy.ts)
  if (lead) rig.group.userData.lead = true
  return rig
}
