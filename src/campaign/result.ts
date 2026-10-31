// [C-RES-1..] Fold a finished battle into the campaign: XP and level-ups, losses, recruits, story, provisions.
import { ARC, GAME_DATA, PLAYER_SIDE } from '../data'
import type { BattleState, GameEvent } from '../engine'
import { addXp, joinLevel, makeRecord, storyFor, xpBreakdownFromLog, XP_SURVIVE } from './progress'
import { currentBattle, currentBattleId } from './state'
import { CAMPAIGN_VERSION, type BattleReport, type CampaignState, type OfficerRecord, type XpLine } from './types'

export const PROVISIONS_VICTORY = 100
export const PROVISIONS_PER_ROUT = 10
export const PROVISIONS_PER_ROUND_UNDER_PAR = 5

/** Longest chain (opener plus links) in the log. */
export function bestChainIn(events: GameEvent[]): number {
  let best = 0
  let cur = 0
  for (const e of events) {
    if (e.kind === 'stratagem') {
      cur = 1
      best = Math.max(best, cur)
    } else if (e.kind === 'chainLink') {
      cur += 1
      best = Math.max(best, cur)
    }
  }
  return best
}

/**
 * [C-RES-1] Apply a finished battle to the campaign. `final` is the battle's last state, `log` its events (all batches, in order).
 * A lost battle changes nothing but the defeat count (you retry from the pre-battle save); with Iron Oath on and the commander
 * routed it also records the fall (`finished: 'lost'`).
 */
export function applyBattleResult(state: CampaignState, final: BattleState, log: GameEvent[]): { state: CampaignState; report: BattleReport } {
  const battleId = currentBattleId(state) ?? final.battleId
  const def = currentBattle(state)
  const won = final.result?.winner === PLAYER_SIDE
  const rounds = final.round
  const report: BattleReport = {
    battleId,
    won,
    rounds,
    xp: [],
    wounded: [],
    fallen: [],
    recruited: [],
    joined: [],
    departed: [],
    provisions: { victory: 0, routed: 0, underPar: 0, total: 0 },
    ironOathBroken: false,
  }
  const commanderId = final.commanders[PLAYER_SIDE]

  if (!won) {
    const broken = state.ironOath && commanderId !== undefined && final.defeated.includes(commanderId)
    report.ironOathBroken = broken
    const next: CampaignState = { ...state, version: CAMPAIGN_VERSION, stats: { ...state.stats, defeats: state.stats.defeats + 1 } }
    if (broken) {
      next.finished = 'lost'
      report.finished = 'lost'
    }
    return { state: next, report }
  }

  // ---- who took part: roster officers whose unit appeared in the battle
  const byId = new Map<string, OfficerRecord>(state.roster.map((r) => [r.officerId, r]))
  const onField = new Set<string>([...final.units.filter((u) => u.side === PLAYER_SIDE).map((u) => u.id), ...final.escaped])
  const routed = new Set(final.defeated)
  const took = (id: string): boolean => (onField.has(id) || routed.has(id)) && byId.get(id)?.status === 'active'
  const mineIds = new Set([...byId.keys()].filter(took))
  const parts = xpBreakdownFromLog(log, PLAYER_SIDE, (id) => (mineIds.has(id) ? PLAYER_SIDE : undefined))

  // ---- XP and level-ups (every officer who took part; survivors also get the bonus)
  let roster = state.roster.map((r) => ({ ...r, statBonus: { ...r.statBonus }, stratagems: r.stratagems.slice() }))
  for (const id of mineIds) {
    const p = parts[id] ?? { attacks: 0, stratagems: 0, routs: 0, sways: 0 }
    const survived = onField.has(id) ? XP_SURVIVE : 0
    const gained = p.attacks + p.stratagems + p.routs + p.sways + survived
    const idx = roster.findIndex((r) => r.officerId === id)
    const { rec, levelUps } = addXp(roster[idx]!, gained)
    roster[idx] = rec
    const line: XpLine = { officerId: id, gained, parts: { attacks: p.attacks, stratagems: p.stratagems, routs: p.routs, sways: p.sways, survived }, levelUps }
    report.xp.push(line)
  }

  // ---- wounded flags: the previous ones are cleared; officers routed this battle are wounded, or fallen with Iron Oath
  roster = roster.map((r) => (r.wounded ? { ...r, wounded: false } : r))
  for (const id of mineIds) {
    if (!routed.has(id)) continue
    const idx = roster.findIndex((r) => r.officerId === id)
    if (state.ironOath) {
      roster[idx] = { ...roster[idx]!, status: 'fallen' }
      report.fallen.push(id)
    } else {
      roster[idx] = { ...roster[idx]!, wounded: true }
      report.wounded.push(id)
    }
  }

  // ---- recruitment: a swayed, recruitable, named enemy still on the field joins
  const level = joinLevel({ ...state, roster })
  for (const e of log) {
    if (e.kind !== 'swayed' || e.side !== PLAYER_SIDE) continue
    const unit = final.units.find((u) => u.id === e.target && u.side === PLAYER_SIDE)
    const off = unit ? GAME_DATA.officers[unit.officer] : undefined
    if (!unit || !off?.recruitable || off.invented) continue
    if (roster.some((r) => r.officerId === off.id)) continue
    roster.push(makeRecord(off.id, level))
    report.recruited.push(off.id)
  }

  // ---- story joins and departures
  const story = storyFor(battleId)
  for (const id of story.joins) {
    if (roster.some((r) => r.officerId === id)) continue
    roster.push(makeRecord(id, level))
    report.joined.push(id)
  }
  for (const id of story.departs) {
    const idx = roster.findIndex((r) => r.officerId === id && r.status === 'active')
    if (idx < 0) continue
    roster[idx] = { ...roster[idx]!, status: 'departed' }
    report.departed.push(id)
  }

  // ---- provisions
  const enemyOut = log.filter((e) => (e.kind === 'routed' || e.kind === 'retreated') && e.side !== PLAYER_SIDE).length
  const par = def?.par ?? rounds
  const prov = {
    victory: PROVISIONS_VICTORY,
    routed: PROVISIONS_PER_ROUT * enemyOut,
    underPar: PROVISIONS_PER_ROUND_UNDER_PAR * Math.max(0, par - rounds),
    total: 0,
  }
  prov.total = prov.victory + prov.routed + prov.underPar
  report.provisions = prov

  const swayedCount = log.filter((e) => e.kind === 'swayed' && e.side === PLAYER_SIDE).length
  const commanderFell = commanderId !== undefined && routed.has(commanderId)
  const battleIndex = state.battleIndex + 1
  const next: CampaignState = {
    ...state,
    version: CAMPAIGN_VERSION,
    battleIndex,
    roster,
    provisions: state.provisions + prov.total,
    stats: {
      ...state.stats,
      battlesWon: state.stats.battlesWon + 1,
      bestChain: Math.max(state.stats.bestChain, bestChainIn(log)),
      foesRouted: state.stats.foesRouted + enemyOut,
      officersLost: state.stats.officersLost + report.fallen.length,
      swayed: state.stats.swayed + swayedCount,
    },
    camp: { drilled: [], mustered: {} },
  }
  if (state.ironOath && commanderFell) {
    next.finished = 'lost'
    report.finished = 'lost'
    report.ironOathBroken = true
  } else if (battleIndex >= ARC.length) {
    next.finished = 'won'
    report.finished = 'won'
  }
  return { state: next, report }
}

