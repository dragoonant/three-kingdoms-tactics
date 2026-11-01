// Troop formations for the cut-ins. `formationSlots` is pure (where each figure stands in its formation's own frame) and
// `spawnFormation` is the ONE place a scene turns "N troops of this kind and side" into figures. Today it builds N full
// per-rig troops; the instanced crowd pass replaces this function alone (docs/spec/51 "More troops").
import { figures, type Rig } from '../../figures'
import type { SidePalette, TroopKindName } from '../plan'
import { rand, srand } from '../rng'

/** infantry block, archer line, cavalry wedge, ragged rebel line */
export type FormationLayout = 'block' | 'line' | 'wedge' | 'ragged'

export interface Slot {
  /** Lateral offset, to the formation's right (units: tiles). */
  r: number
  /** How far behind the front rank (tiles, >= 0). */
  b: number
  /** Front rank flag. */
  front: boolean
}

/**
 * Slots of `count` figures. The front rank holds `ceil(count / rows)` figures and further ranks stand behind; `spacing` is the
 * lateral gap. Pure and seeded (the ragged line wobbles).
 */
export function formationSlots(layout: FormationLayout, count: number, spacing = 0.46, seed = 1): Slot[] {
  const out: Slot[] = []
  if (count <= 0) return out
  switch (layout) {
    case 'line': {
      for (let i = 0; i < count; i++) out.push({ r: (i - (count - 1) / 2) * spacing, b: 0, front: true })
      break
    }
    case 'wedge': {
      // the leader at the tip, then pairs stepping back and out
      out.push({ r: 0, b: 0, front: true })
      for (let i = 1; i < count; i++) {
        const k = Math.ceil(i / 2)
        out.push({ r: (i % 2 ? -1 : 1) * 0.62 * k * (spacing / 0.46), b: 0.66 * k * (spacing / 0.46), front: k === 1 })
      }
      break
    }
    case 'ragged': {
      for (let i = 0; i < count; i++) out.push({ r: (i - (count - 1) / 2) * spacing + srand(seed, i, 1) * 0.07, b: srand(seed, i, 2) * 0.08 + 0.08 + (i % 2) * 0.05, front: true })
      break
    }
    default: {
      // block: the front rank is about 60% of the figures when there is more than one rank
      const rows = count > 6 ? 2 : 1
      const frontN = Math.ceil(count / rows)
      for (let i = 0; i < count; i++) {
        const row = i < frontN ? 0 : 1
        const inRow = row === 0 ? i : i - frontN
        const n = row === 0 ? frontN : count - frontN
        out.push({ r: (inRow - (n - 1) / 2) * spacing + (row ? spacing * 0.5 * 0 : 0), b: row * spacing * 1.15 + srand(seed, i, 3) * 0.03, front: row === 0 })
      }
    }
  }
  return out
}

export interface FormationFigure {
  rig: Rig
  slot: Slot
  index: number
}

/** One troop figure of a kind and side; `variant` picks the headgear and weapon angle so a squad is not cloned. */
export function spawnTroop(kind: TroopKindName, palette: SidePalette, variant: number): Rig {
  return figures.buildTroop(kind, palette, variant)
}

/**
 * Figures for one formation of `count` troops. This is the single swap point for the crowd pass: callers use only the
 * rigs and slots returned here.
 */
export function spawnFormation(kind: TroopKindName, palette: SidePalette, count: number, layout: FormationLayout, seed = 1): FormationFigure[] {
  const slots = formationSlots(layout, count, 0.46, seed)
  return slots.map((slot, index) => ({ rig: spawnTroop(kind, palette, Math.floor(rand(seed, index, 5) * 3)), slot, index }))
}
