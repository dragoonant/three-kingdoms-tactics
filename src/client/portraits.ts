// Officer portraits (docs/spec/50-presentation.md "Portraits"). One 256x256 webp per officer at public/portraits/<officerId>.webp, plus a generic
// one per side and troop kind (generic-<side>-<kind>.webp) for any unit without its own. Today they are rendered from our own 3D figures
// (tools/render-portraits.mjs); the Hugging Face generator (tools/portraits/gen-hf.mjs) writes the same paths, so it swaps in without a code change.
// Everything here is pure: the HUD asks for a URL and falls back to the letter seal when the file is missing.
import { ALL_BATTLES, ALL_OFFICERS } from '../data'
import type { TroopType } from '../data'

export const PORTRAIT_PX = 256
export const PORTRAIT_SIDES = ['han', 'yellow', 'cao', 'dong', 'lu'] as const
export type PortraitSide = (typeof PORTRAIT_SIDES)[number]
/** Troop kind of a portrait: the troop rig kinds (Yellow Turban infantry are rebels). */
export type PortraitKind = 'infantry' | 'archer' | 'cavalry' | 'rebel'

/** The troop kind a unit of `type` on `side` is drawn as (matches the board figures). */
export function portraitKind(type: TroopType, side: string): PortraitKind {
  return type === 'archers' ? 'archer' : type === 'cavalry' ? 'cavalry' : side === 'yellow' ? 'rebel' : 'infantry'
}

/** Id of the generic portrait for a unit type on a side (a side token such as `han`, `yellow`, `cao`). */
export function genericPortraitId(side: string, type: TroopType): string {
  const s = (PORTRAIT_SIDES as readonly string[]).includes(side) ? side : 'han'
  return `generic-${s}-${portraitKind(type, s)}`
}

/** URL of a portrait file (the file may not exist: the caller falls back). */
export function portraitUrl(id: string): string {
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL : '/'
  return `${base}portraits/${id}.webp`
}

/** Same hash the board uses to pick a troop variant for a unit id, so a local officer's portrait matches the figure on the table. */
export function variantOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) % 3
}

export interface PortraitSubject {
  id: string
  name: string
  /** hero: unique design; officer: named-officer kit; local: invented officer of one battle (troop rig); generic: a side and troop kind. */
  group: 'hero' | 'officer' | 'local' | 'generic'
  side: PortraitSide
  kind: PortraitKind
  troop: TroopType
  /** Troop rig variant (0..2) for local and generic portraits. */
  variant: number
}

const HEROES = new Set(['liu-bei', 'guan-yu', 'zhang-fei', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'cao-cao'])

function sideOf(token: string): PortraitSide {
  return (PORTRAIT_SIDES as readonly string[]).includes(token) ? (token as PortraitSide) : 'han'
}

/** Every portrait the game can ask for, in a stable order: heroes, named officers, battle-local officers, then the generics. */
export function portraitSubjects(): PortraitSubject[] {
  const out: PortraitSubject[] = []
  const seen = new Set<string>()
  // which side an officer fights for: the first battle that fields it (heroes and the player's officers are Han)
  const sideFor = new Map<string, PortraitSide>()
  const local: { id: string; name: string; type: TroopType }[] = []
  for (const def of Object.keys(ALL_BATTLES).sort().map((id) => ALL_BATTLES[id]!)) {
    const token = (side: string): PortraitSide => sideOf(def.sides?.find((s) => s.id === side)?.colourToken ?? side)
    const fielded = [...def.units, ...(def.guests ?? []), ...(def.reinforcements ?? []).flatMap((r) => r.units)]
    for (const u of fielded) if (!sideFor.has(u.officer)) sideFor.set(u.officer, token(u.side))
    for (const o of def.officers ?? []) if (!local.some((l) => l.id === o.id)) local.push({ id: o.id, name: o.name, type: o.type ?? 'infantry' })
  }
  const named = ALL_OFFICERS
  for (const group of ['hero', 'officer'] as const) {
    for (const o of named) {
      if ((group === 'hero') !== HEROES.has(o.id) || seen.has(o.id)) continue
      seen.add(o.id)
      out.push({ id: o.id, name: o.name, group, side: sideFor.get(o.id) ?? 'han', kind: 'infantry', troop: o.type ?? 'infantry', variant: 0 })
    }
  }
  for (const l of local) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    const side = sideFor.get(l.id) ?? 'han'
    out.push({ id: l.id, name: l.name, group: 'local', side, kind: portraitKind(l.type, side), troop: l.type, variant: variantOf(l.id) })
  }
  for (const side of PORTRAIT_SIDES) {
    for (const troop of ['infantry', 'archers', 'cavalry'] as const) {
      out.push({ id: genericPortraitId(side, troop), name: `${side} ${troop}`, group: 'generic', side, kind: portraitKind(troop, side), troop, variant: 0 })
    }
  }
  return out
}
