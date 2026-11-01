// Formation layouts for the cut-in crowds (docs/spec/52-crowds.md). Pure functions of (kind, count, seed): no three, no clock.
// Slots are in crowd-local rig units; +Z is "forward" (toward the enemy), the front rank sits at z = 0 and the ranks extend
// backwards (-Z), centred on x = 0. Slots come out ordered front-first and centre-out, so member 0 is the middle of the front
// rank (the wedge's apex) and "the first K members" is always the front of the formation.
import { mulberry32 } from '../rng'
import type { TroopKind } from '../../figures/rig'

export type FormationName = 'block' | 'line' | 'wedge' | 'mob'

export interface Slot {
  x: number
  z: number
  /** 0 is the front rank. */
  rank: number
  /** Position along the rank, 0 is the leftmost. */
  file: number
}

export interface Spacing {
  x: number
  z: number
}

/** Default spacing in rig units (a footman is about 0.34 wide at the shoulders; a horse about 0.5 wide and 1.0 long). */
export function defaultSpacing(kind: TroopKind, formation: FormationName): Spacing {
  const mounted = kind === 'cavalry'
  switch (formation) {
    case 'block':
      return mounted ? { x: 0.95, z: 1.25 } : { x: 0.62, z: 0.7 }
    case 'line':
      return mounted ? { x: 1.0, z: 1.3 } : { x: kind === 'archer' ? 0.7 : 0.62, z: 0.85 }
    case 'wedge':
      return mounted ? { x: 0.95, z: 1.05 } : { x: 0.62, z: 0.6 }
    default:
      return mounted ? { x: 1.1, z: 1.3 } : { x: 0.7, z: 0.72 }
  }
}

/** Default jitter (a fraction of the spacing) per formation: drilled ranks are nearly straight, a mob is not. */
export const defaultJitter = (formation: FormationName): number => (formation === 'mob' ? 0.5 : formation === 'line' ? 0.05 : 0.07)

/** How far apart the members' gait cycles start (a fraction of a stride): drilled troops step nearly together, a mob does not. */
export const defaultCadenceSpread = (formation: FormationName): number => (formation === 'mob' ? 1 : formation === 'wedge' ? 0.45 : 0.3)

export interface LayoutOpts {
  kind: TroopKind
  formation: FormationName
  count: number
  seed: number
  spacing?: Partial<Spacing> | number
  jitter?: number
  /** block: number of files across the front (default about 1.5 x sqrt(count)); line: members per rank (default up to 14). */
  files?: number
}

const resolveSpacing = (o: LayoutOpts): Spacing => {
  const d = defaultSpacing(o.kind, o.formation)
  if (typeof o.spacing === 'number') return { x: d.x * o.spacing, z: d.z * o.spacing }
  return { x: o.spacing?.x ?? d.x, z: o.spacing?.z ?? d.z }
}

/** Centre-out order of n files: the middle one first, then alternately right and left. */
function centreOut(n: number): number[] {
  const mid = (n - 1) / 2
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)
}

/** Rows of counts for each rank, with the last (rear) rank possibly short and centred. */
function rowsOf(count: number, per: number): number[] {
  const rows: number[] = []
  for (let left = count; left > 0; left -= per) rows.push(Math.min(per, left))
  return rows
}

export function layout(o: LayoutOpts): Slot[] {
  const n = Math.max(0, Math.floor(o.count))
  const sp = resolveSpacing(o)
  const jit = o.jitter ?? defaultJitter(o.formation)
  const rnd = mulberry32((o.seed ^ 0x51ed270b) >>> 0)
  const slots: Slot[] = []
  const place = (rank: number, file: number, x: number, z: number): void => {
    slots.push({ x: x + (rnd() * 2 - 1) * jit * sp.x * 0.5, z: z + (rnd() * 2 - 1) * jit * sp.z * 0.5, rank, file })
  }
  switch (o.formation) {
    case 'block': {
      const per = Math.max(1, Math.min(n, Math.round(o.files ?? Math.sqrt(n * 1.5))))
      rowsOf(n, per).forEach((cnt, r) => {
        for (const f of centreOut(cnt)) place(r, f, (f - (cnt - 1) / 2) * sp.x, -r * sp.z)
      })
      break
    }
    case 'line': {
      const per = Math.max(1, Math.min(n, o.files ?? Math.ceil(n / Math.ceil(n / 14))))
      rowsOf(n, per).forEach((cnt, r) => {
        // the rear ranks stand in the gaps of the rank in front
        const half = r % 2 === 1 ? sp.x * 0.5 : 0
        for (const f of centreOut(cnt)) place(r, f, (f - (cnt - 1) / 2) * sp.x + half, -r * sp.z)
      })
      break
    }
    case 'wedge': {
      let r = 0
      for (let left = n; left > 0; r++) {
        const cnt = Math.min(r + 1, left)
        left -= cnt
        for (const f of centreOut(cnt)) place(r, f, (f - (cnt - 1) / 2) * sp.x, -r * sp.z)
      }
      break
    }
    default: {
      // a mob: a loose grid with large jitter, then a few relaxation passes so nobody stands inside anybody
      const per = Math.max(1, Math.min(n, Math.round(o.files ?? Math.sqrt(n * 1.4))))
      const rows = rowsOf(n, per)
      rows.forEach((cnt, r) => {
        const stagger = r % 2 === 1 ? sp.x * 0.35 : 0
        for (let f = 0; f < cnt; f++) place(r, f, (f - (cnt - 1) / 2) * sp.x + stagger, -r * sp.z)
      })
      const minD = 0.82 * Math.min(sp.x, sp.z)
      for (let pass = 0; pass < 6; pass++) {
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            const a = slots[i]!
            const b = slots[j]!
            const dx = b.x - a.x
            const dz = b.z - a.z
            const d = Math.hypot(dx, dz) || 1e-4
            if (d < minD) {
              const push = (minD - d) / 2
              a.x -= (dx / d) * push
              a.z -= (dz / d) * push
              b.x += (dx / d) * push
              b.z += (dz / d) * push
            }
          }
        }
      }
      // re-centre on x = 0 and put the front at z = 0, then order front-first (the mob's "rank" is the row it started in)
      const maxZ = Math.max(...slots.map((s) => s.z))
      const cx = slots.reduce((a, s) => a + s.x, 0) / Math.max(1, slots.length)
      for (const s of slots) {
        s.z -= maxZ
        s.x -= cx
      }
      slots.sort((a, b) => b.z - a.z || Math.abs(a.x) - Math.abs(b.x))
      slots.forEach((s, i) => {
        s.rank = Math.floor(i / per)
        s.file = i % per
      })
      break
    }
  }
  return slots
}

/** Smallest distance between any two slots (tests, spacing checks). */
export function minSeparation(slots: readonly Slot[]): number {
  let m = Infinity
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) m = Math.min(m, Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z))
  }
  return m
}
