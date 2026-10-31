// [C-CAMP-1..] Camp actions: drill and muster. Pure; they return a new state or a reason.
import { addXp } from './progress'
import { recordOf, replaceRecord } from './state'
import type { CampaignState, LevelUp } from './types'

export const DRILL_COST = 60
export const DRILL_XP = 50
export const MUSTER_COST = 80
export const MUSTER_TROOPS = 200
export const MUSTER_LIMIT = 2

export type CampResult = { ok: true; state: CampaignState; levelUps: LevelUp[] } | { ok: false; reason: string }

/** Drill an officer: 60 provisions for +50 XP, at most once per officer per camp. */
export function drill(state: CampaignState, officerId: string): CampResult {
  const rec = recordOf(state, officerId)
  if (!rec || rec.status !== 'active') return { ok: false, reason: 'Not an active officer' }
  if (state.camp.drilled.includes(officerId)) return { ok: false, reason: 'Already drilled in this camp' }
  if (state.provisions < DRILL_COST) return { ok: false, reason: `Needs ${DRILL_COST} provisions` }
  const { rec: next, levelUps } = addXp(rec, DRILL_XP)
  const s = replaceRecord(state, next)
  return {
    ok: true,
    levelUps,
    state: { ...s, provisions: s.provisions - DRILL_COST, camp: { ...s.camp, drilled: [...s.camp.drilled, officerId] } },
  }
}

/** Muster an officer: 80 provisions for +200 max troops, at most twice per officer per camp. */
export function muster(state: CampaignState, officerId: string): CampResult {
  const rec = recordOf(state, officerId)
  if (!rec || rec.status !== 'active') return { ok: false, reason: 'Not an active officer' }
  const n = state.camp.mustered[officerId] ?? 0
  if (n >= MUSTER_LIMIT) return { ok: false, reason: `Mustered ${MUSTER_LIMIT} times already in this camp` }
  if (state.provisions < MUSTER_COST) return { ok: false, reason: `Needs ${MUSTER_COST} provisions` }
  const s = replaceRecord(state, { ...rec, maxTroops: rec.maxTroops + MUSTER_TROOPS })
  return {
    ok: true,
    levelUps: [],
    state: { ...s, provisions: s.provisions - MUSTER_COST, camp: { ...s.camp, mustered: { ...s.camp.mustered, [officerId]: n + 1 } } },
  }
}
