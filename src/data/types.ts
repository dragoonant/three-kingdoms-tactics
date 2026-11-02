// Content schema. These types describe the JSON files in this folder.
// The engine imports types from here; the JSON itself is validated by validateData().

/** Side ids are data (R2-SIDE-1). The player side is always PLAYER_SIDE; the enemy side id comes from the battle. */
export type Side = string
export const PLAYER_SIDE = 'han'
export type Facing = 'N' | 'E' | 'S' | 'W'
export type TroopType = 'infantry' | 'cavalry' | 'archers'
export type TerrainId =
  | 'plain' | 'farm' | 'forest' | 'hill' | 'village' | 'road' | 'ford' | 'river' | 'ash'
  | 'wall' | 'rampart' | 'gate' | 'shallows' | 'reeds' | 'deck' | 'water' | 'bridge'
export type StratTag = 'Strike' | 'Charge' | 'Volley' | 'Fire' | 'Shout' | 'Ruse' | 'Command'
export type AreaKind = 'single' | 'cross' | 'sweep' | 'adjacent' | 'aura' | 'ring2' | 'self'
export type BuffStat = 'war' | 'int' | 'lead' | 'cha'
export type StratStat = 'war' | 'int'
export type WindStrength = 'calm' | 'breeze' | 'gale'

export type StratEffect =
  | { type: 'confuse' }
  | { type: 'ignite' }
  | { type: 'heal'; pct: number }
  | { type: 'dash' }
  /** [R2-STRAT-1] dir 'toward-target' = the cardinal direction from the caster toward the chosen tile. */
  | { type: 'wind'; dir: Facing | 'toward-target'; strength: Exclude<WindStrength, 'calm'>; rounds: number }
  /** [R2-STRAT-2] aura buff on allies, lasts `rounds` rounds. */
  | { type: 'buff'; stat: BuffStat; amount: number; rounds: number }
  /** [R2-STRAT-3] the target must move toward and attack the caster. */
  | { type: 'provoke' }

export interface TerrainDef {
  id: TerrainId
  name: string
  /** Move cost by troop type (null for a type that cannot enter), or null when impassable for everyone. */
  move: Record<TroopType, number | null> | null
  /** Only the battle's gateOwner side may enter (R2 terrain table: gate). */
  gate?: boolean
  /** Archers standing here get +1 max range (hill, rampart). */
  rangeBonus?: number
  /** Terrain a burnt-out tile becomes (default 'ash'; deck becomes 'water'). */
  burnsTo?: TerrainId
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
  /** A second effect, applied after `effect` (e.g. bridge-roar: confuse + provoke). */
  also?: StratEffect
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
  /** "Romance ch.1", "Romance" or "invented". */
  source: string
  invented?: boolean
  note?: string
  /** Troop type when this officer is deployed from the roster or used as a guest. Required in shipped data. */
  type?: TroopType
  /** Stat growth per level (default 1/1/1/1). */
  growth?: Partial<Record<BuffStat, number>>
  /** Stratagems learned on reaching a level. */
  learns?: { level: number; strat: string }[]
  /** A swayed copy of this named enemy may join the campaign roster. */
  recruitable?: boolean
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
  /** Defaults to `troops`. */
  maxTroops?: number
  commander: boolean
  /** [R2-OBJ-2] leaves the board when troops fall to this fraction of max or below. */
  retreatAt?: number
}

/** [R2-OPT-1] one deployed player officer. */
export interface DeployEntry {
  officerId: string
  level: number
  statBonus: Record<BuffStat, number>
  maxTroops: number
  troops: number
  stratagems: string[]
}

/** Roguelike run modifiers (spec 15 section 7, spec 16; rules RL-* in 10-rules.md section 11). Frozen contract for RL1. */
export interface RunModifiers {
  /** Added to each listed player officer's starting Qi after the battle's own start Qi (Renown, rest, hunger, tired, echoes). Clamped by the engine's Qi bounds. */
  startQi?: Record<string, number>
  /** Same bonus for every player officer (applied before startQi). */
  startQiAll?: number
  /** Multiplies every non-player, non-guest unit's troops and maxTroops (spec 16 `tierScale`), rounded to 10. Default 1. */
  enemyTroopScale?: number
  /** Added to Liu Bei's sway chance, in percentage points (RL-REN sway bonus). */
  swayBonus?: number
  /** Officer ids removed from the battle before it starts (echo roster changes). */
  removeUnits?: string[]
}

export interface CreateOptions {
  deploy?: DeployEntry[]
  /** Roguelike run modifiers; absent for the campaign, tests and quick battles. */
  run?: RunModifiers
}

export type Tile2 = [number, number]

/** [R2-OBJ-1] conditions, evaluated for the player side (`han`). `label` overrides the HUD wording. */
export type Cond = (
  | { type: 'routCommander' }
  | { type: 'routAll' }
  | { type: 'routUnits'; units: string[] }
  | { type: 'survive'; round: number }
  | { type: 'hold'; tiles: Tile2[]; round?: number }
  | { type: 'escape'; units?: string[]; count: number; tiles: Tile2[] }
  | { type: 'commanderLost' }
  | { type: 'unitLost'; unit: string }
  | { type: 'timeout'; round: number }
) & { label?: string }

export interface Objectives {
  win: Cond[]
  lose: Cond[]
}

/** [R2-REIN-1] */
export interface ReinforcementDef {
  round: number
  side: Side
  units: UnitDef[]
  entry: Tile2[]
  /** Player side: also places the deploy-list officer at this index (0-based) as the first arrival. */
  slot?: number
}

/** [R2-TIME-1] */
export type TimelineEvent = (
  | { kind: 'terrain'; tiles: Tile2[]; to: TerrainId }
  | { kind: 'wind'; dir: Facing | null; strength: WindStrength }
  | { kind: 'message'; text: string }
  | { kind: 'ignite'; tiles: Tile2[] }
) & { round: number; phase: 'start' | 'end'; /** true = not shown by query.timelinePreview */ hidden?: boolean }

export interface SideDef {
  id: Side
  name: string
  /** CSS/theme token for the banner colour, e.g. 'yellow', 'dong', 'cao', 'lu'. */
  colourToken: string
}

export type EnemyBehaviour = string

export interface PlayerStart {
  x: number
  y: number
  facing: Facing
  /** Shown as an "ambush post" in deploy UI only. */
  ambush?: boolean
  /** The officer for this slot arrives as a reinforcement in this round, on this tile. */
  arrivesRound?: number
}

export interface Join {
  officer: string
  /** Text for the Results screen. */
  note?: string
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
  /**
   * Fixed units. When `playerStarts` is present the player-side (`han`) entries here are legacy placeholders and are
   * ignored: the player side comes from deploy + guests.
   */
  units: UnitDef[]

  // ---- engine v2 (all optional; absent = old behaviour)
  sides?: SideDef[]
  /** Side that may pass through `gate` tiles. */
  gateOwner?: Side
  objectives?: Objectives
  reinforcements?: ReinforcementDef[]
  timeline?: TimelineEvent[]
  /** Enemy behaviour hints for the AI (ignored by the rules). */
  enemyBehaviour?: Record<string, EnemyBehaviour>
  guests?: UnitDef[]
  playerStarts?: PlayerStart[]
  /** Officer ids deployed when no options.deploy is given. */
  defaultDeploy?: string[]

  // ---- campaign (12-campaign.md section 6)
  title?: string
  place?: string
  blurb?: string[]
  deploySlots?: number
  required?: string[]
  par?: number
  /** Optional mirror of campaign.json story (the validator requires them to agree). */
  joins?: Join[]
  departs?: Join[]
  /** Placeholder battle; a content builder will replace the file. */
  stub?: boolean
  /** Battle-local officers/stratagems, merged into the global tables by the loader. */
  officers?: OfficerDef[]
  stratagems?: StratagemDef[]
}

/** The static tables the engine needs. Shared by reference, never mutated. */
export interface GameData {
  terrain: Record<TerrainId, TerrainDef>
  stratagems: Record<string, StratagemDef>
  officers: Record<string, OfficerDef>
}

/** src/data/campaign.json */
export interface CampaignDef {
  /** Battle ids in order. */
  arc: string[]
  startRoster: { officerId: string; level: number }[]
  startProvisions?: number
  /** Story joins and departs, applied after the named battle is won. */
  story: Record<string, { joins?: string[]; departs?: string[] }>
  /** Scene ids (files in src/data/scenes). */
  prologue: string
  epilogue: string
}
