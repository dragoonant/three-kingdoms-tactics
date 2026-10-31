// [C-DEP-1..] Turn the campaign roster and the player's deploy choice into engine options.
import type { CreateOptions, DeployEntry } from '../data/types'
import { MAX_CARRIED_STRATAGEMS, round10, WOUNDED_TROOPS } from './progress'
import { activeRoster, currentBattle, recordOf } from './state'
import type { CampaignState, DeployChoice, OfficerRecord } from './types'

/** The stratagems an officer carries into battle: the chosen ones that it knows (max 3), else the first three known. */
export function carriedStratagems(rec: OfficerRecord, chosen?: string[]): string[] {
  const picked = (chosen ?? []).filter((s, i, a) => rec.stratagems.includes(s) && a.indexOf(s) === i).slice(0, MAX_CARRIED_STRATAGEMS)
  return picked.length > 0 ? picked : rec.stratagems.slice(0, MAX_CARRIED_STRATAGEMS)
}

export function deployEntry(rec: OfficerRecord, chosenStratagems?: string[]): DeployEntry {
  return {
    officerId: rec.officerId,
    level: rec.level,
    statBonus: { ...rec.statBonus },
    maxTroops: rec.maxTroops,
    troops: rec.wounded ? Math.max(10, round10(rec.maxTroops * WOUNDED_TROOPS)) : rec.maxTroops,
    stratagems: carriedStratagems(rec, chosenStratagems),
  }
}

/** The officer ids that will be deployed: required officers first (if active), then the choice in order, up to deploySlots. */
export function deployList(state: CampaignState, choice: DeployChoice): string[] {
  const def = currentBattle(state)
  const slots = def?.deploySlots ?? Math.max(1, (def?.required ?? []).length)
  const active = new Set(activeRoster(state).map((r) => r.officerId))
  const ids: string[] = []
  for (const id of def?.required ?? []) if (active.has(id) && !ids.includes(id)) ids.push(id)
  for (const id of choice.officers) if (active.has(id) && !ids.includes(id)) ids.push(id)
  return ids.slice(0, slots)
}

/** [C-DEP-1] createBattle options: wounded start at 50%, statBonus and learned stratagems apply, at most 3 stratagems each. */
export function campaignBattleOptions(state: CampaignState, choice: DeployChoice): CreateOptions {
  const deploy: DeployEntry[] = []
  for (const id of deployList(state, choice)) {
    const rec = recordOf(state, id)
    if (rec) deploy.push(deployEntry(rec, choice.stratagems?.[id]))
  }
  return { deploy }
}
