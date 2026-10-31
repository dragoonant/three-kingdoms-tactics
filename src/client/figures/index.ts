// The figure factory used by the board and the battle cut-ins. heroes.ts / troops.ts / horse.ts replace the
// placeholder implementation below; the exported names and the FigureFactory signature are frozen (rig.ts).
import { placeholderRig, type FigureFactory, type SidePalette, type TroopKind } from './rig'

export * from './rig'

const SIDE_COLOUR: Record<SidePalette, string> = { han: '#2f6b5e', yellow: '#d4a72c', cao: '#34495e', dong: '#6b1f2a', lu: '#5b2c6f' }
const HERO_IDS = ['liu-bei', 'guan-yu', 'zhang-fei', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'cao-cao'] as const

export const figures: FigureFactory = {
  buildHero: (officerId: string) => placeholderRig(HERO_IDS.includes(officerId as (typeof HERO_IDS)[number]) ? 'hero' : 'officer'),
  buildTroop: (kind: TroopKind, side: SidePalette) => placeholderRig(kind, SIDE_COLOUR[side]),
  heroIds: () => HERO_IDS,
}
