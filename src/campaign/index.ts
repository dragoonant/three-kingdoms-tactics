// Campaign core: pure TypeScript, no React/DOM/localStorage (storage is injected). See docs/spec/12-campaign.md.
export * from './types'
export {
  XP_PER_LEVEL, MAX_LEVEL, TROOPS_BASE, TROOPS_PER_LEVEL, XP_ATTACK, XP_STRATAGEM_LINK, XP_ROUT, XP_SWAY, XP_SURVIVE,
  WOUNDED_TROOPS, MAX_CARRIED_STRATAGEMS, maxTroopsFor, makeRecord, addXp, joinLevel, xpFromLog, xpBreakdownFromLog,
} from './progress'
export { newCampaign, currentBattle, currentBattleId, recordOf, activeRoster } from './state'
export { campaignBattleOptions, deployList, deployEntry, carriedStratagems } from './deploy'
export { applyBattleResult, bestChainIn, PROVISIONS_VICTORY, PROVISIONS_PER_ROUT, PROVISIONS_PER_ROUND_UNDER_PAR } from './result'
export { drill, muster, DRILL_COST, DRILL_XP, MUSTER_COST, MUSTER_TROOPS, MUSTER_LIMIT, type CampResult } from './camp'
export {
  SAVE_KEY, PREBATTLE_KEY, saveCampaign, loadCampaign, savePrebattle, loadPrebattle, retryBattle, clearCampaign,
  createMemoryStorage, isCampaignState, type KeyValueStorage, type LoadResult,
} from './save'
