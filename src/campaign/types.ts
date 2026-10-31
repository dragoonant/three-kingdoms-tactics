// Campaign state (docs/spec/12-campaign.md section 2). JSON-serialisable and versioned. Pure data, no behaviour.
import type { BuffStat } from '../data/types'

export const CAMPAIGN_VERSION = 1

export type OfficerStatus = 'active' | 'fallen' | 'departed'

export interface OfficerRecord {
  officerId: string
  /** 1..10 */
  level: number
  /** Progress toward the next level, 0..99. */
  xp: number
  statBonus: Record<BuffStat, number>
  maxTroops: number
  /** Every stratagem the officer knows (base list first, then learned ones in order). */
  stratagems: string[]
  /** Starts the next battle at 50% troops. */
  wounded: boolean
  status: OfficerStatus
}

export interface CampaignStats {
  battlesWon: number
  defeats: number
  /** Longest linked-stratagem chain (links) performed in any won battle. */
  bestChain: number
  foesRouted: number
  officersLost: number
  swayed: number
}

/** What has been spent in the camp before the current battle (reset after every won battle). */
export interface CampState {
  drilled: string[]
  mustered: Record<string, number>
}

export interface CampaignState {
  version: 1
  seed: number
  ironOath: boolean
  /** 0-based index into the arc. */
  battleIndex: number
  roster: OfficerRecord[]
  provisions: number
  stats: CampaignStats
  camp: CampState
  finished?: 'won' | 'lost'
}

/** What the player picks on the deploy screen. Required officers are always deployed first. */
export interface DeployChoice {
  /** Roster officers to fill the remaining slots, in the order of the start tiles. */
  officers: string[]
  /** Chosen stratagems (at most 3) per officer; defaults to the first three known. */
  stratagems?: Record<string, string[]>
}

export interface LevelUp {
  officerId: string
  from: number
  to: number
  learned: string[]
  statGains: Record<BuffStat, number>
}

export interface XpLine {
  officerId: string
  gained: number
  /** Breakdown by source (from the log) plus the survival bonus. */
  parts: { attacks: number; stratagems: number; routs: number; sways: number; survived: number }
  levelUps: LevelUp[]
}

export interface BattleReport {
  battleId: string
  won: boolean
  rounds: number
  xp: XpLine[]
  wounded: string[]
  fallen: string[]
  recruited: string[]
  joined: string[]
  departed: string[]
  provisions: { victory: number; routed: number; underPar: number; total: number }
  /** Iron Oath: the commander fell and the run is over (a retry is still allowed). */
  ironOathBroken: boolean
  finished?: 'won' | 'lost'
}

export const STAT_KEYS: BuffStat[] = ['war', 'int', 'lead', 'cha']
