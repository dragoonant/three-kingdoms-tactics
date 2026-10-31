// Engine types. BattleState is plain JSON-able data (plus a shared, read-only `data` table reference).
// States are immutable by convention: step() returns a new object and never mutates its input.
import type {
  BuffStat,
  CreateOptions,
  DeployEntry,
  EnemyBehaviour,
  Facing,
  GameData,
  Objectives,
  Cond,
  ReinforcementDef,
  Side,
  SideDef,
  StratTag,
  TerrainId,
  TimelineEvent,
  TroopType,
  UnitDef,
  WindStrength,
} from '../data/types'

export { PLAYER_SIDE } from '../data/types'
export type { Facing, Side, TroopType, StratTag, WindStrength, BuffStat, CreateOptions, DeployEntry, Objectives, Cond, TimelineEvent, SideDef, UnitDef, ReinforcementDef }
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
  /** [R2-OBJ-2] retreat when troops <= retreatAt * maxTroops. */
  retreatAt?: number
  /** [R2-STRAT-2] active buffs. */
  buffs?: Buff[]
  /** [R2-STRAT-3] id of the unit this one is provoked by (cleared at the end of its side's phase). */
  provoked?: string
}

export interface Buff {
  /** Stratagem id that applied it. */
  id: string
  stat: BuffStat
  amount: number
  /** Expires at the end of the owner's phase of this round. */
  until: number
  by: string
}

/** A reinforcement wave that has not arrived yet (slot already resolved into a unit). */
export interface PendingReinforcement {
  round: number
  side: Side
  units: UnitDef[]
  entry: [number, number][]
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
  reason: 'commander' | 'annihilation' | 'timeout' | 'objective'
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

  // ---- engine v2
  /** [R2-SIDE-1] side ids, display names and banner colour tokens. */
  sides: SideDef[]
  /** Side that may pass gate tiles (null = nobody; gates are walls). */
  gateOwner: Side | null
  /** [R2-OBJ-1] null = the old rules (R-WIN-1/2). */
  objectives: Objectives | null
  /** Waves not yet arrived. */
  reinforcements: PendingReinforcement[]
  timeline: TimelineEvent[]
  /** Ids of player units that escaped / units of any side that retreated, in order. */
  escaped: string[]
  retreated: string[]
  /** Round at whose start the wind schedule resumes after a stratagem/timeline override (null = none). */
  windUntil: number | null
  /** Events produced while the battle was being created (round-1 timeline items). */
  opening: GameEvent[]
  /** Commander unit id per side (including commanders who have not arrived yet). */
  commanders: Record<string, string>
  enemyBehaviour: Record<string, EnemyBehaviour>
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: 'move'; unit: string; x: number; y: number }
  | { type: 'undoMove'; unit: string }
  | { type: 'attack'; unit: string; target: string }
  | { type: 'stratagem'; unit: string; strat: string; x: number; y: number; excludeFromChain: string[] }
  | { type: 'sway'; unit: string; target: string }
  | { type: 'wait'; unit: string; facing: Facing }
  | { type: 'escape'; unit: string }
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
  | 'cannotEscape'
  | 'provoked'
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
  /** [R2-OBJ-2] the unit left the board at its retreat threshold (counts as routed for rout objectives). */
  | { kind: 'retreated'; unit: string; side: Side; x: number; y: number; by?: string }
  /** [R2-OBJ-1] a player unit left the board by an exit tile. */
  | { kind: 'escaped'; unit: string; side: Side; x: number; y: number }
  /** [R2-REIN-1] a unit arrived; the event carries everything needed to draw it. */
  | {
      kind: 'reinforced'
      unit: string
      officer: string
      side: Side
      type: TroopType
      x: number
      y: number
      facing: Facing
      troops: number
      maxTroops: number
      commander: boolean
      round: number
    }
  /** [R2-TIME-1] tiles changed terrain (flood, gate opened, bridge destroyed, burnt deck). */
  | { kind: 'terrainChanged'; tiles: Pos[]; to: Terrain; cause: 'timeline' | 'burnout' }
  | { kind: 'timelineMessage'; text: string; round: number }
  | { kind: 'buffed'; unit: string; by: string; strat: string; stat: BuffStat; amount: number; until: number }
  | { kind: 'buffExpired'; unit: string; strat: string; stat: BuffStat }
  | { kind: 'provoked'; unit: string; by: string }
  /** [R2-OBJ-1] HUD tracker update; `current/target` are the numbers of query.objectives. */
  | { kind: 'objectiveProgress'; side: 'win' | 'lose'; index: number; text: string; current: number; target: number }
  | { kind: 'healed'; unit: string; amount: number; source: 'village' | 'rally'; by?: string }
  | { kind: 'swayed'; unit: string; target: string; chance: number; side: Side }
  | { kind: 'swayFailed'; unit: string; target: string; chance: number }
  | { kind: 'windChanged'; dir: Facing | null; strength: WindStrength; round: number; by?: string; strat?: string; rounds?: number }
  | { kind: 'phaseStarted'; side: Side; round: number }
  | { kind: 'roundStarted'; round: number }
  | { kind: 'battleEnded'; winner: Side; reason: BattleResult['reason'] }

export type EventKind = GameEvent['kind']
export const EVENT_KINDS: EventKind[] = [
  'moved', 'turned', 'waited', 'attacked', 'countered', 'damaged', 'routed', 'stratagem', 'chainLink',
  'sawThrough', 'confused', 'recovered', 'ignited', 'fireSpread', 'burnedOut', 'healed', 'swayed',
  'swayFailed', 'windChanged', 'phaseStarted', 'roundStarted', 'battleEnded',
  'retreated', 'escaped', 'reinforced', 'terrainChanged', 'timelineMessage', 'buffed', 'buffExpired', 'provoked',
  'objectiveProgress',
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
  /** True when the stratagem provokes this target. */
  provokes?: boolean
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
  /** Every tile that would be set alight (multi-tile areas ignite all flammable tiles, R2-AREA-2). */
  igniteTiles?: Pos[]
  /** Allies that would be buffed (R2-STRAT-2). */
  buffs?: { unit: string; stat: BuffStat; amount: number; rounds: number }[]
  /** Wind the cast would create (R2-STRAT-1). */
  wind?: { dir: Facing; strength: WindStrength; rounds: number }
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

// ---------------------------------------------------------------- v2 queries

export interface ObjectiveStatus {
  side: 'win' | 'lose'
  index: number
  cond: Cond
  text: string
  /** Numeric progress, when the condition has one (round counters, escape counts). */
  current: number | null
  target: number | null
  met: boolean
}

export interface TimelineItemPreview {
  round: number
  phase: 'start' | 'end'
  kind: 'terrain' | 'wind' | 'message' | 'ignite' | 'reinforcement'
  text: string
  tiles: Pos[]
}
