// The figure factory used by the board and the battle cut-ins. The exported names and the FigureFactory signature
// are frozen (rig.ts); the builders live in heroes.ts (seven unique heroes), officerKit.ts (every other officer),
// troops.ts (infantry / archer / cavalry / rebel) and horse.ts. Clips are pure pose helpers in clips.ts.
import { buildHeroRig, HERO_IDS } from './heroes'
import { buildOfficer } from './officerKit'
import { type FigureFactory, type SidePalette, type TroopKind } from './rig'
import { buildTroopRig } from './troops'

export * from './rig'
export { applyClip, drawBow, fallBack, gallop, idle, rest, swingOverhead, thrust, travel, walk } from './clips'
export type { Clip } from './clips'
export { buildOfficer, OFFICER_IDS } from './officerKit'
export { disposeFigureCaches } from './kit'

export const figures: FigureFactory = {
  /** The seven unique heroes get their own design; any other officer id gets the named-officer kit (default look by id). */
  buildHero: (officerId: string) => buildHeroRig(officerId) ?? buildOfficer(officerId),
  buildTroop: (kind: TroopKind, side: SidePalette, variant?: number) => buildTroopRig(kind, side, variant ?? 0),
  heroIds: () => HERO_IDS,
}
