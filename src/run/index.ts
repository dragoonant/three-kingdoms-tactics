// Roads to War: the run layer. Pure TypeScript, deterministic, no DOM/React/three/Math.random; storage is injected.
// Spec: docs/spec/15-roguelike.md, 16-roguelike-era1.md; rules RL-* in 10-rules.md section 11.
export * from './types'
export { ERA1, ERAS, eraOf, stopDef, stopsOf, stream, battleSeedFor, P_ROAD, P_FATE, P_BATTLE, FINALE_INDEX, isTown, isMarket, hasBattleChoice } from './era'
export { drawRoad, edgesFrom, isLastTier, sameNode } from './road'
export {
  newRun, beginRoad, choose, hireLevies, travel, makeCamp, sendHome, legOptions, marketMax, levyCost, levyPrice, capOf, upkeep, upkeepFor,
  riceDays, riceDaysFor, spirit, tradeMult, swayBonusFor, poolOf, activeBand, officerOf, nameOf, commanderId, flatEffects, riceOf,
  volunteersFor, giftFor, choicePayable, lossOf, legDays, finaleName, clone, scatter, type LegOption,
} from './core'
export {
  checkDeploy, defaultDeploy, sealDeploy, battleOptions, battleSeed, applyBattle, applyOutcome, outcomeOf, finaleBriefing, toFinaleDeploy,
  deploySlots, dayRow, battleName, canField, guestIds, type DeployPick, type DeployCheck, type QiLine, type BattleNote, type BattleOutcome,
  type RunBattleReport, type FinaleBriefing, type FinaleLine,
} from './battle'
export { describe, choiceView, hud, finaleForecast, roadView, marksOf, stopCount, pendingBattleName, type Chip, type ChoiceView, type Hud, type RoadNodeView, type StopMarks } from './query'
export { saveRun, loadRun, clearRun, isRunState, writeAnnal, loadAnnals, annalOf, RUN_SAVE_KEY, ANNALS_KEY, type AnnalEntry, type RunLoad } from './save'
