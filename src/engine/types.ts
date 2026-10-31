// Engine types. BattleState is plain JSON-able data (plus a shared, read-only `data` table reference).
// States are immutable by convention: step() returns a new object and never mutates its input.
import type {
  Facing,
  GameData,
  Side,
  StratTag,
  TerrainId,
  TroopType,
  WindStrength,
} from '../data/types'

export type { Facing, Side, TroopType, StratTag, WindStrength }
export type Terrain = TerrainId

export interface Pos {
  x: number
  y: number
}

export interface Tile {
  x: number
  y: number
  terrain: Terrain
}

export interface Grid {
  width: number
  height: number
  tiles: Tile[]
}

export interface Unit {
  /** Unit id (equals the officer id in the shipped battles). */
  id: string
  /** Key into state.data.officers. */
  officer: string
  side: Side
  type: TroopType
  x: number
  y: number
  facing: Facing
  troops: number
  maxTroops: number
  /** 0..10 */
  qi: number
  commander: boolean
  confused: boolean
  /** Has used its move this activation. */
  moved: boolean
  /** Has used its action this activation (the unit is "done"). */
  done: boolean
  /** Where to return on undoMove; non-null only while moved && !done. */
  undo: { x: number; y: number; facing: Facing } | null
}

export interface Wind {
  /** Direction the wind blows toward; null when calm. */
  dir: Facing | null
  strength: WindStrength
}

export interface WindScheduleEntry extends Wind {
  round: number
}

export type BattleResult = {
  winner: Side
  reason: 'commander' | 'annihilation' | 'timeout'
}

export interface BattleState {
  battleId: string
  seed: number
  /** sfc32 state (4 x uint32). */
  rng: [number, number, number, number]
  grid: Grid
  /** Rounds of burning left per tile (index = y*width + x); 0 = not burning. */
  burn: number[]
  units: Unit[]
  /** Ids of routed units, in the order they fell. */
  defeated: string[]
  round: number
  turnLimit: number
  sideOrder: Side[]
  /** Index into sideOrder of the side whose phase it is. */
  phaseIndex: number
  /** The side whose phase it is (= sideOrder[phaseIndex]). */
  side: Side
  onTimeout: Side
  windSchedule: WindScheduleEntry[]
  wind: Wind
  /** "casterUnitId>targetUnitId" pairs already tried. */
  swayTried: string[]
  result: BattleResult | null
  /** Static tables (shared by reference, never mutated). */
  data: GameData
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'move'; unit: string; x: number; y: number }
  | { type: 'undoMove'; unit: string }
  | { type: 'attack'; unit: string; target: string }
  | { type: 'stratagem'; unit: string; strat: string; x: number; y: number; excludeFromChain: string[] }
  | { type: 'sway'; unit: string; target: string }
  | { type: 'wait'; unit: string; facing: Facing }
  | { type: 'endPhase' }

export type RejectCode =
  | 'malformed'
  | 'battleOver'
  | 'unknownUnit'
  | 'notYourPhase'
  | 'unitDone'
  | 'unitConfused'
  | 'alreadyMoved'
  | 'nothingToUndo'
  | 'startTileOccupied'
  | 'cannotReach'
  | 'unknownTarget'
  | 'targetNotEnemy'
  | 'outOfRange'
  | 'targetTooClose'
  | 'unknownStratagem'
  | 'stratagemNotKnown'
  | 'notEnoughQi'
  | 'noValidTarget'
  | 'dashBlocked'
  | 'commanderCannotBeSwayed'
  | 'cannotBeSwayed'
  | 'swayAlreadyTried'
  | 'badFacing'
  | 'internalError'

export type StepResult =
  | { ok: true; state: BattleState; events: GameEvent[] }
  | { ok: false; code: RejectCode; message: string }

// ---------------------------------------------------------------- events

export type Arc = 'front' | 'side' | 'rear'
export type DamageSource = 'attack' | 'counter' | 'stratagem' | 'fire'

export type GameEvent =
  | {
      kind: 'moved'
      unit: string
      from: Pos
      to: Pos
      /** Tiles entered, in order (excludes `from`). Empty for undo. */
      path: Pos[]
      cost: number
      facing: Facing
      undo?: boolean
      /** True for the dash of a Charge stratagem. */
      dash?: boolean
    }
  | { kind: 'turned'; unit: string; from: Facing; to: Facing }
  | { kind: 'waited'; unit: string; facing: Facing }
  | { kind: 'attacked'; unit: string; target: string; arc: Arc; ranged: boolean; distance: number }
  | { kind: 'countered'; unit: string; target: string }
  | {
      kind: 'damaged'
      unit: string
      amount: number
      troopsBefore: number
      troopsAfter: number
      source: DamageSource
      /** The unit that dealt it (absent for fire). */
      by?: string
      strat?: string
      /** Linked-stratagem index of the hit (0 = opener) for stratagem damage. */
      link?: number
    }
  | { kind: 'routed'; unit: string; side: Side; by?: string }
  | {
      kind: 'stratagem'
      unit: string
      strat: string
      anchor: Pos
      /** Every tile of the affected area (in-bounds). */
      tiles: Pos[]
      cost: number
      link: 0
    }
  | {
      kind: 'chainLink'
      /** 1..3 */
      link: number
      unit: string
      strat: string
      anchor: Pos
      tiles: Pos[]
      cost: number
      /** Unit that cast the previous link. */
      from: string
      bond: boolean
      /** Damage multiplier of this link (1 + 0.2*link, times 1.15 when bonded). */
      multiplier: number
    }
  | { kind: 'sawThrough'; unit: string; by: string; strat: string; chance: number }
  | { kind: 'confused'; unit: string; source: 'stratagem' | 'fire'; by?: string; chance: number }
  | { kind: 'recovered'; unit: string }
  | { kind: 'ignited'; x: number; y: number; by: string; strat: string }
  | { kind: 'fireSpread'; from: Pos; to: Pos }
  | { kind: 'burnedOut'; x: number; y: number }
  | { kind: 'healed'; unit: string; amount: number; source: 'village' | 'rally'; by?: string }
  | { kind: 'swayed'; unit: string; target: string; chance: number; side: Side }
  | { kind: 'swayFailed'; unit: string; target: string; chance: number }
  | { kind: 'windChanged'; dir: Facing | null; strength: WindStrength; round: number }
  | { kind: 'phaseStarted'; side: Side; round: number }
  | { kind: 'roundStarted'; round: number }
  | { kind: 'battleEnded'; winner: Side; reason: BattleResult['reason'] }

export type EventKind = GameEvent['kind']
export const EVENT_KINDS: EventKind[] = [
  'moved', 'turned', 'waited', 'attacked', 'countered', 'damaged', 'routed', 'stratagem', 'chainLink',
  'sawThrough', 'confused', 'recovered', 'ignited', 'fireSpread', 'burnedOut', 'healed', 'swayed',
  'swayFailed', 'windChanged', 'phaseStarted', 'roundStarted', 'battleEnded',
]

// ---------------------------------------------------------------- previews

export interface Multiplier {
  id: string
  name: string
  value: number
}

export interface MoveOption {
  x: number
  y: number
  cost: number
}

export interface DamageRange {
  min: number
  max: number
  /** At variance 1.00. */
  expected: number
}

export interface AttackPreview {
  unit: string
  target: string
  arc: Arc
  distance: number
  ranged: boolean
  /** 150 + troops * 0.08 */
  base: number
  multipliers: Multiplier[]
  damage: DamageRange
  /** Target troops after the attack: [at max damage, at min damage]. */
  targetTroopsAfter: { min: number; max: number }
  /** True when the minimum roll already routs the target. */
  routsAtMin: boolean
  routsAtMax: boolean
  counter: {
    possible: boolean
    /** Why not (when !possible). */
    reason?: string
    min: number
    max: number
    multipliers: Multiplier[]
  }
}

export interface StratagemTargetPreview {
  unit: string
  min: number
  max: number
  expected: number
  multipliers: Multiplier[]
  arc?: Arc
  /** Percent chance (0..60) that the target sees through. 0 when not applicable. */
  foresightChance: number
  /** Percent chance of confusion (0 when the stratagem has none). */
  confuseChance: number
  routsAtMax: boolean
}

export interface ChainLinkPreview {
  /** 0 = opener */
  link: number
  unit: string
  strat: string
  target: Pos
  tiles: Pos[]
  bond: boolean
  multiplier: number
  /** Expected total damage of the link across its targets. */
  expected: number
}

export interface StratagemPreview {
  unit: string
  strat: string
  anchor: Pos
  cost: number
  tiles: Pos[]
  targets: StratagemTargetPreview[]
  /** Dash destination for Charge stratagems. */
  dashTo: Pos | null
  /** Whether the anchor tile would be set alight. */
  ignites: boolean
  /** Allies healed (Command). */
  heals: { unit: string; amount: number }[]
  /** Planned chain assuming every link hits, opener first. */
  chain: ChainLinkPreview[]
  totalExpected: number
}

export interface SwayPreview {
  legal: boolean
  reason?: string
  /** Percent, 5..90 (0 when illegal). */
  chance: number
}

export interface StratagemOption {
  id: string
  name: string
  cost: number
  usable: boolean
  reason?: string
}

export interface FireForecast {
  wind: Wind
  burning: { x: number; y: number; burn: number }[]
  /** Combined chance (0..1) each unlit flammable tile ignites at the next end of round. */
  spread: { x: number; y: number; chance: number }[]
  /** Units standing on tiles that are burning now (they will take this damage). */
  unitDamage: { unit: string; amount: number; confuseChance: number }[]
}

export interface WindInfo {
  current: Wind
  next: WindScheduleEntry | null
}
