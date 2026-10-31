import { ARC, CAMPAIGN, getBattleDef } from '../data'
import type { BattleDef } from '../data/types'
import { CAMPAIGN_VERSION, type CampaignState, type OfficerRecord } from './types'
import { makeRecord } from './progress'

/** [C-NEW-1] A fresh campaign: the starting roster of campaign.json, no provisions, battle 1 next. */
export function newCampaign(seed: number, ironOath: boolean): CampaignState {
  return {
    version: CAMPAIGN_VERSION,
    seed: seed >>> 0,
    ironOath,
    battleIndex: 0,
    roster: CAMPAIGN.startRoster.map((r) => makeRecord(r.officerId, r.level)),
    provisions: CAMPAIGN.startProvisions ?? 0,
    stats: { battlesWon: 0, defeats: 0, bestChain: 0, foesRouted: 0, officersLost: 0, swayed: 0 },
    camp: { drilled: [], mustered: {} },
  }
}

export function currentBattleId(state: CampaignState): string | undefined {
  return ARC[state.battleIndex]
}

export function currentBattle(state: CampaignState): BattleDef | undefined {
  const id = currentBattleId(state)
  return id ? getBattleDef(id) : undefined
}

export function recordOf(state: CampaignState, officerId: string): OfficerRecord | undefined {
  return state.roster.find((r) => r.officerId === officerId)
}

export function activeRoster(state: CampaignState): OfficerRecord[] {
  return state.roster.filter((r) => r.status === 'active')
}

export function replaceRecord(state: CampaignState, rec: OfficerRecord): CampaignState {
  return { ...state, roster: state.roster.map((r) => (r.officerId === rec.officerId ? rec : r)) }
}
