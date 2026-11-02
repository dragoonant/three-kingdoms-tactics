// Roads to War: the run state and the era data shapes (docs/spec/15-roguelike.md, 16-roguelike-era1.md; rules RL-* in
// 10-rules.md section 11). Pure data; JSON-serialisable; versioned.
import type { OfficerRecord } from '../campaign/types'

export const RUN_VERSION = 1

// ------------------------------------------------------------------ era data (src/data/eras/<era>.json)

export interface Cond {
  renownGte?: number
  flag?: string
  notFlag?: string
}

/** A choice's effects. Every key is optional; see spec 16 section 3 for the meaning of each. */
export interface Effects {
  rice?: number
  /** Rice from a trade: x1.25 at Renown 50+, x0.5 under 20 (RL-REN-2). */
  riceTrade?: number
  /** Rice only at Renown 50+. */
  giftRice?: number
  soldiers?: number
  /** Losses from the healthy soldiers: `n` men or `pct` of the healthy; `killed` is the killed share (default half, RL-LOSS-1). */
  casualties?: { n?: number; pct?: number; killed?: number }
  renown?: number
  days?: number
  flags?: string[]
  recruit?: string
  capBonus?: Record<string, number>
  qiNext?: number
  qiNextOfficer?: Record<string, number>
  tired?: boolean
  woundOfficer?: string
  rest?: boolean
  healWounded?: 'half'
  nextLegDays?: number
  /** Next battle's enemy troops x (1 + this). */
  nextBattleE?: number
  slowLegs?: { legs: number; days: number }
  noVolunteers?: boolean
  /** Volunteers come although the stop is not a town or village. */
  volunteers?: boolean
  volunteersMult?: number
  conditional?: { if: Cond; then?: Effects; else?: Effects }[]
  gamble?: { odds: number; win: Effects; lose: Effects }
  battle?: { id: string; win: Effects; aftermath?: string }
}

export interface SlipLine {
  /** An officer id or 'narrator'. */
  speaker: string
  /** Display name for a speaker who is not in the officer table. */
  name?: string
  text: string
}

export interface ChoiceDef {
  id: string
  label: string
  tension: string
  effects: Effects
}

export interface StopDef {
  id: string
  title: string
  source: string
  tags: string[]
  scene: string[]
  slips: SlipLine[]
  choices: ChoiceDef[]
  aftermathOnly?: boolean
  prologue?: string
}

export interface FlagDef {
  visible: boolean
  set: string
  pays: string
  effect: { E?: number; G?: number; dayShift?: number; nextBattleS?: number }
  text: string
}

export interface TierDef {
  name: string
  kind: 'fixed' | 'anchor' | 'mid' | 'late'
  stops?: string[]
  anchor?: string
  pool?: string
  battleRequired?: boolean
  longOnly?: boolean
}

export interface EraRules {
  upkeepPer: number
  battleRicePer: number
  hungryDays: number
  minPerOfficer: number
  sliderStep: number
  capPerLead: number
  capPerLevel: number
  killedShare: number
  volunteersPerRenown: number
  renownMax: number
  battleDays: number
  forcedMarchPctPerDaySaved: number
  mountainPathAttritionPct: number
  makeCampDays: number
  deserterPct: number
  tradeHigh: number
  tradeLow: number
  levyPrice: number
  marketMax: number
  giftAt: number
  giftDiv: number
}

export interface DayRow {
  maxDay: number
  label: string
  E: number
  text: string
}

export interface EraData {
  version: number
  era: string
  note: string
  rules: EraRules
  start: { rice: number; soldiers: number; wounded: number; renown: number; day: number; band: { officer: string; level: number }[] }
  officers: Record<string, { name: string; lead: number; q: number; commander?: boolean; joinLevel?: number; new?: boolean; alt?: string }>
  road: {
    tiersShort: number
    tiersLong: number
    legDays: { days: number; weight: number }[]
    finaleLegDays: number
    mountainPath: { fromTiers: number[]; days: number; skips: number; attritionPct?: number }
    tiers: TierDef[]
    pools: Record<string, string[]>
    battleStops: string[]
    tierScale: number[]
  }
  battles: Record<string, { new: boolean; E: number; guests: number; slots: number; finale?: boolean }>
  finale: {
    battle: string
    dayTable: DayRow[]
    renown: { gte?: number; lt?: number; E?: number; G?: number; text: string }[]
  }
  flags: Record<string, FlagDef>
  prologue: SlipLine[]
  stops: StopDef[]
}

// ------------------------------------------------------------------ road

export type NodeRef = [tier: number, lane: number]

export interface Edge {
  from: NodeRef
  to: NodeRef
  days: number
  kind: 'road' | 'mountain'
}

export interface Road {
  seed: number
  long: boolean
  /** Stop ids per tier (1 or 2 lanes). */
  tiers: string[][]
  edges: Edge[]
  mountainTier: number
}

// ------------------------------------------------------------------ run state

/** A band officer: the campaign's record (level, XP, stratagems) plus the run's marks. `rec.wounded` is the RL-FALL-1 wounded mark. */
export interface RunOfficer {
  rec: OfficerRecord
  /** RL-FALL-2: half command cap until a full rest. */
  hurt: boolean
  /** Command cap bonus (or malus) from stops. */
  capBonus: number
}

export type RunPhase = 'prologue' | 'stop' | 'market' | 'deploy' | 'battle' | 'road' | 'finale' | 'ended'

export interface PendingBattle {
  battleId: string
  tier: number
  /** The stop and choice that called the battle (for the after-stop volunteers and the annals). */
  stopId: string
  choiceId: string
  win: Effects
  aftermath?: string
  finale?: boolean
  /** Enemy troop scale for this battle (tier scale x pre-battle modifiers). */
  enemyScale: number
  /** Stop index for the RNG streams. */
  index: number
}

export interface Deployment {
  officers: { id: string; soldiers: number }[]
  rice: number
  hungry: boolean
  seed: number
}

export interface CurrentStop {
  id: string
  tier: number
  /** RNG stream index (RL-RNG-1). */
  index: number
  /** For an aftermath stop: the stop and choice whose after-stop step (volunteers, gift, market) still has to run. */
  after?: { stopId: string; choiceId: string }
}

export interface AnnalLine {
  day: number
  text: string
  tone?: 'good' | 'bad' | 'echo' | 'battle'
}

export interface QiMod {
  /** Officer id, or absent for every officer. */
  officer?: string
  qi: number
  cause: string
}

export type RunEndKind = 'won' | 'defeated' | 'routed' | 'starved'

export interface RunStats {
  battles: number
  battlesWon: number
  killed: number
  wounded: number
  volunteers: number
  fell: string[]
  gambles: number
  gamblesWon: number
}

export interface RunState {
  version: typeof RUN_VERSION
  era: string
  seed: number
  ironOath: boolean
  road: Road
  rice: number
  soldiers: number
  wounded: number
  renown: number
  day: number
  band: RunOfficer[]
  /** Every flag set so far (stated and hidden). */
  flags: string[]
  /** Hidden echoes that have paid off (and so may be named). */
  fired: string[]
  /** Start-Qi modifiers for the next battle, each with its cause (cleared after a battle). */
  qiMods: QiMod[]
  tired: boolean
  /** Tiredness from a stop lasts through the next leg (RL-MARCH-2). */
  tiredFresh: boolean
  slowLegs: { legs: number; days: number } | null
  nextLegDays: number
  nextBattleE: number
  /** Current road node. */
  node: NodeRef
  /** Stops visited (the RNG stream index of the next stop). */
  stopIndex: number
  phase: RunPhase
  stop: CurrentStop | null
  pending: PendingBattle | null
  deployment: Deployment | null
  /** Levies hired at the current market stop. */
  hired: number
  /** Nodes visited, in order. */
  path: NodeRef[]
  /** Legs travelled. */
  legs: { from: NodeRef; to: NodeRef | 'finale'; days: number; march: boolean; kind: Edge['kind'] | 'finale' }[]
  /** Stop choices taken, `stop/choice`. */
  picks: string[]
  annals: AnnalLine[]
  stats: RunStats
  end: { kind: RunEndKind; day: number; text: string } | null
}
