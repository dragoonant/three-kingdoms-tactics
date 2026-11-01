// The caster's figure: the unique hero design when the officer has one, else the named-officer kit (default look by id, troop
// type and side), mounted when the unit rides. Mirrors board/Figure.tsx's buildUnitRig, but with shared materials (the cut-ins
// never tint a figure) and an explicit `mounted`.
import type { Rig } from '../figures'
import { buildHeroRig, isHeroId } from '../figures/heroes'
import { buildOfficer } from '../figures/officerKit'
import type { ActorPlan } from './plan'

export function buildCasterRig(a: ActorPlan, mounted: boolean): Rig {
  if (isHeroId(a.officer)) return buildHeroRig(a.officer, { mounted })!
  return buildOfficer(a.officer, { type: a.kind, side: a.palette, mounted })
}
