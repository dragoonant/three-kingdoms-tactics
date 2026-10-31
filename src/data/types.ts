// Content schema. These types describe the JSON files in this folder.
// The engine imports types from here; the JSON itself is validated by validateData().

export type Side = 'han' | 'yellow'
export type Facing = 'N' | 'E' | 'S' | 'W'
export type TroopType = 'infantry' | 'cavalry' | 'archers'
export type TerrainId = 'plain' | 'farm' | 'forest' | 'hill' | 'village' | 'road' | 'ford' | 'river' | 'ash'
export type StratTag = 'Strike' | 'Charge' | 'Volley' | 'Fire' | 'Shout' | 'Ruse' | 'Command'
export type AreaKind = 'single' | 'cross' | 'sweep' | 'adjacent' | 'aura'
export type StratStat = 'war' | 'int'
export type WindStrength = 'calm' | 'breeze' | 'gale'

export type StratEffect =
  | { type: 'confuse' }
  | { type: 'ignite' }
  | { type: 'heal'; pct: number }
  | { type: 'dash' }

export interface TerrainDef {
  id: TerrainId
  name: string
  /** Move cost by troop type, or null when impassable. */
  move: Record<TroopType, number> | null
  /** Multiplier on damage taken by the occupant. */
  def: number
  elev: number
  flammability: number
  notes: string
}

export interface StratagemDef {
  id: string
  name: string
  tag: StratTag
  cost: number
  range: { min: number; max: number }
  area: AreaKind
  power: number
  stat: StratStat | null
  effect: StratEffect | null
  follows: StratTag[]
  /** Damage multiplier for the non-anchor tiles of a cross. */
  neighborMult?: number
  text: string
}

export interface OfficerDef {
  id: string
  name: string
  war: number
  int: number
  lead: number
  cha: number
  /** null = cannot be swayed. */
  loyalty: number | null
  bonds: string[]
  stratagems: string[]
  /** "Romance ch.1" or "invented". */
  source: string
  invented?: boolean
  note?: string
}

export interface UnitDef {
  id: string
  officer: string
  side: Side
  type: TroopType
  x: number
  y: number
  facing: Facing
  troops: number
  commander: boolean
}

export interface WindEntry {
  round: number
  /** Direction the wind blows toward; null when calm. */
  dir: Facing | null
  strength: WindStrength
}

export interface BattleDef {
  id: string
  name: string
  year: number
  /** Rows of terrain characters (row index = y, column index = x). */
  map: string[]
  legend: Record<string, TerrainId>
  bridges: { x: number; y: number }[]
  turnLimit: number
  onTimeout: Side
  sideOrder: Side[]
  wind: WindEntry[]
  units: UnitDef[]
}

/** The static tables the engine needs. Shared by reference, never mutated. */
export interface GameData {
  terrain: Record<TerrainId, TerrainDef>
  stratagems: Record<string, StratagemDef>
  officers: Record<string, OfficerDef>
}
