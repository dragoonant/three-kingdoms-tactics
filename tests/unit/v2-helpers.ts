// Hand-built engine v2 battles: synthetic officers, real data tables, any side ids, objectives, reinforcements, timeline.
import { GAME_DATA } from '../../src/data'
import type {
  BattleDef, Cond, CreateOptions, Facing, GameData, ReinforcementDef, OfficerDef, PlayerStart, StratagemDef, TerrainId,
  TimelineEvent, TroopType, UnitDef, WindEntry,
} from '../../src/data/types'
import { createBattleFromDef, type BattleState } from '../../src/engine'

export const LEGEND2: Record<string, TerrainId> = {
  '.': 'plain', f: 'farm', T: 'forest', h: 'hill', v: 'village', '=': 'road', '~': 'river', o: 'ford', a: 'ash',
  '#': 'wall', r: 'rampart', G: 'gate', s: 'shallows', e: 'reeds', d: 'deck', w: 'water', b: 'bridge',
}

export interface TU2 {
  id: string
  side: string
  type?: TroopType
  x: number
  y: number
  facing?: Facing
  troops?: number
  maxTroops?: number
  war?: number
  int?: number
  lead?: number
  cha?: number
  loyalty?: number | null
  strats?: string[]
  bonds?: string[]
  qi?: number
  commander?: boolean
  retreatAt?: number
}

export interface Mk2 {
  w?: number
  h?: number
  map?: string[]
  units: TU2[]
  enemy?: string
  wind?: WindEntry[]
  seed?: number
  turnLimit?: number
  objectives?: { win: Cond[]; lose: Cond[] }
  reinforcements?: { round: number; side: string; units: TU2[]; entry: [number, number][]; slot?: number }[]
  timeline?: TimelineEvent[]
  gateOwner?: string
  guests?: TU2[]
  playerStarts?: PlayerStart[]
  defaultDeploy?: string[]
  options?: CreateOptions
  /** Extra stratagems to register (tests invent variants of the shipped ones). */
  stratagems?: StratagemDef[]
  /** Skip auto-adding commanders. */
  noAutoCommander?: boolean
  onTimeout?: string
}

export function mk2(o: Mk2): BattleState {
  const enemy = o.enemy ?? 'cao'
  const w = o.w ?? 12
  const h = o.h ?? 12
  const map = o.map ?? Array.from({ length: h }, () => '.'.repeat(w))
  const officers: Record<string, OfficerDef> = { ...GAME_DATA.officers }
  const stratagems: Record<string, StratagemDef> = { ...GAME_DATA.stratagems }
  for (const s of o.stratagems ?? []) stratagems[s.id] = s
  const synth = (u: TU2): UnitDef => {
    const oid = `o-${u.id}`
    officers[oid] = {
      id: oid, name: u.id, war: u.war ?? 70, int: u.int ?? 50, lead: u.lead ?? 50, cha: u.cha ?? 50,
      loyalty: u.loyalty === undefined ? null : u.loyalty, bonds: (u.bonds ?? []).map((b) => `o-${b}`),
      stratagems: u.strats ?? [], source: 'invented', invented: true, type: u.type ?? 'infantry',
    }
    const d: UnitDef = {
      id: u.id, officer: oid, side: u.side, type: u.type ?? 'infantry', x: u.x, y: u.y, facing: u.facing ?? 'E',
      troops: u.troops ?? 1000, commander: u.commander ?? false,
    }
    if (u.maxTroops !== undefined) d.maxTroops = u.maxTroops
    if (u.retreatAt !== undefined) d.retreatAt = u.retreatAt
    return d
  }
  const all = [...o.units]
  if (!o.noAutoCommander) {
    const covered = (side: string): boolean => all.some((u) => u.side === side && u.commander) || (o.reinforcements ?? []).some((r) => r.units.some((u) => u.side === side && u.commander))
    for (const side of ['han', enemy]) {
      if (!covered(side)) all.push({ id: `${side}-cmd`, side, x: side === 'han' ? 0 : w - 1, y: side === 'han' ? 0 : h - 1, troops: 9990, commander: true })
    }
  }
  const def: BattleDef = {
    id: 'test2', name: 'test2', year: 0, map, legend: { ...LEGEND2 }, bridges: [], turnLimit: o.turnLimit ?? 15,
    onTimeout: o.onTimeout ?? enemy, sideOrder: ['han', enemy], units: all.map(synth),
    wind: o.wind ?? [{ round: 1, dir: null, strength: 'calm' }],
    sides: [{ id: 'han', name: 'Han', colourToken: 'han' }, { id: enemy, name: enemy.toUpperCase(), colourToken: enemy }],
  }
  if (o.objectives) def.objectives = o.objectives
  if (o.gateOwner) def.gateOwner = o.gateOwner
  if (o.timeline) def.timeline = o.timeline
  if (o.reinforcements) {
    def.reinforcements = o.reinforcements.map((r): ReinforcementDef => {
      const rd: ReinforcementDef = { round: r.round, side: r.side, units: r.units.map(synth), entry: r.entry }
      if (r.slot !== undefined) rd.slot = r.slot
      return rd
    })
  }
  if (o.guests) def.guests = o.guests.map(synth)
  if (o.playerStarts) def.playerStarts = o.playerStarts
  if (o.defaultDeploy) def.defaultDeploy = o.defaultDeploy
  const data: GameData = { ...GAME_DATA, officers, stratagems }
  let s = createBattleFromDef(def, data, o.seed ?? 1, o.options)
  // Tests set Qi explicitly (units that were on the board at creation).
  s = { ...s, units: s.units.map((u) => ({ ...u, qi: all.find((x) => x.id === u.id)?.qi ?? 0 })) }
  return s
}
