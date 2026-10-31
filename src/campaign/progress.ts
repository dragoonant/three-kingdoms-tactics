// Experience, levels and roster records (12-campaign.md section 3). Pure.
import { GAME_DATA, CAMPAIGN } from '../data'
import type { BuffStat, OfficerDef } from '../data/types'
import type { GameEvent } from '../engine'
import { PLAYER_SIDE } from '../data/types'
import { STAT_KEYS, type CampaignState, type LevelUp, type OfficerRecord } from './types'

export const XP_PER_LEVEL = 100
export const MAX_LEVEL = 10
export const TROOPS_BASE = 1700
export const TROOPS_PER_LEVEL = 100
export const XP_ATTACK = 10
export const XP_STRATAGEM_LINK = 15
export const XP_ROUT = 30
export const XP_SWAY = 25
export const XP_SURVIVE = 20
export const WOUNDED_TROOPS = 0.5
export const MAX_CARRIED_STRATAGEMS = 3

export const maxTroopsFor = (level: number): number => TROOPS_BASE + TROOPS_PER_LEVEL * level
export const round10 = (n: number): number => Math.round(n / 10) * 10

export const noBonus = (): Record<BuffStat, number> => ({ war: 0, int: 0, lead: 0, cha: 0 })

export function officerDef(id: string): OfficerDef | undefined {
  return GAME_DATA.officers[id]
}

/** A roster record for an officer entering at `level` with no stat bonus; knows every stratagem it would have learned by then. */
export function makeRecord(officerId: string, level: number): OfficerRecord {
  const def = officerDef(officerId)
  const lv = Math.max(1, Math.min(MAX_LEVEL, level))
  const known = (def?.stratagems ?? []).slice()
  for (const l of def?.learns ?? []) if (l.level <= lv && !known.includes(l.strat)) known.push(l.strat)
  return { officerId, level: lv, xp: 0, statBonus: noBonus(), maxTroops: maxTroopsFor(lv), stratagems: known, wounded: false, status: 'active' }
}

/** Per-stat XP-independent growth: the officer's `growth`, default 1 each. */
export function growthOf(officerId: string): Record<BuffStat, number> {
  const g = officerDef(officerId)?.growth ?? {}
  return { war: g.war ?? 1, int: g.int ?? 1, lead: g.lead ?? 1, cha: g.cha ?? 1 }
}

/** Add XP to a record; returns the updated record and the level-ups it caused. XP carries over; at level 10 it is dropped. */
export function addXp(rec: OfficerRecord, amount: number): { rec: OfficerRecord; levelUps: LevelUp[] } {
  const def = officerDef(rec.officerId)
  const growth = growthOf(rec.officerId)
  let r: OfficerRecord = { ...rec, statBonus: { ...rec.statBonus }, stratagems: rec.stratagems.slice(), xp: rec.xp + Math.max(0, amount) }
  const levelUps: LevelUp[] = []
  while (r.xp >= XP_PER_LEVEL && r.level < MAX_LEVEL) {
    r.xp -= XP_PER_LEVEL
    const from = r.level
    r.level += 1
    r.maxTroops += TROOPS_PER_LEVEL
    const gains = noBonus()
    for (const k of STAT_KEYS) {
      const room = def ? Math.max(0, 100 - (def[k] + r.statBonus[k])) : growth[k]
      const g = Math.min(growth[k], room)
      r.statBonus[k] += g
      gains[k] = g
    }
    const learned: string[] = []
    for (const l of def?.learns ?? []) if (l.level === r.level && !r.stratagems.includes(l.strat)) {
      r.stratagems.push(l.strat)
      learned.push(l.strat)
    }
    levelUps.push({ officerId: r.officerId, from, to: r.level, learned, statGains: gains })
  }
  if (r.level >= MAX_LEVEL) r = { ...r, xp: 0 }
  return { rec: r, levelUps }
}

/** The level a story join or recruit enters at: one below the mean level of the active roster (minimum 1). */
export function joinLevel(state: CampaignState): number {
  const active = state.roster.filter((r) => r.status === 'active')
  if (active.length === 0) return 1
  const mean = active.reduce((n, r) => n + r.level, 0) / active.length
  return Math.max(1, Math.round(mean) - 1)
}

export interface LogXp {
  attacks: number
  stratagems: number
  routs: number
  sways: number
}

/**
 * [C-XP-1..4] XP earned per officer from a battle's event log, for the units of `side`:
 * +10 per normal attack that deals damage, +15 per stratagem link performed (opener or chain link),
 * +30 per enemy unit routed (a retreat counts), +25 per successful sway. The +20 survival bonus is added by applyBattleResult.
 */
export function xpBreakdownFromLog(events: GameEvent[], side: string = PLAYER_SIDE, unitSide?: (unitId: string) => string | undefined): Record<string, LogXp> {
  const out: Record<string, LogXp> = {}
  // Which side a unit is on, as far as the log (and the optional resolver) can tell. Unknown units count.
  const known = new Map<string, string>()
  for (const e of events) if (e.kind === 'routed' || e.kind === 'retreated' || e.kind === 'escaped' || e.kind === 'reinforced') known.set(e.unit, e.side)
  const mine = (id: string): boolean => (unitSide?.(id) ?? known.get(id) ?? side) === side
  const get = (id: string): LogXp => (out[id] ??= { attacks: 0, stratagems: 0, routs: 0, sways: 0 })
  for (const e of events) {
    switch (e.kind) {
      case 'damaged':
        if (e.source === 'attack' && e.by !== undefined && e.amount > 0 && mine(e.by)) get(e.by).attacks += XP_ATTACK
        break
      case 'stratagem':
      case 'chainLink':
        if (mine(e.unit)) get(e.unit).stratagems += XP_STRATAGEM_LINK
        break
      case 'routed':
      case 'retreated':
        if (e.by !== undefined && e.side !== side && mine(e.by)) get(e.by).routs += XP_ROUT
        break
      case 'swayed':
        if (e.side === side && mine(e.unit)) get(e.unit).sways += XP_SWAY
        break
      default:
        break
    }
  }
  return out
}

/** XP per officer id (attacks + stratagem links + routs + sways). */
export function xpFromLog(events: GameEvent[], side: string = PLAYER_SIDE, unitSide?: (unitId: string) => string | undefined): Record<string, number> {
  const b = xpBreakdownFromLog(events, side, unitSide)
  const out: Record<string, number> = {}
  for (const [id, x] of Object.entries(b)) out[id] = x.attacks + x.stratagems + x.routs + x.sways
  return out
}

export function storyFor(battleId: string): { joins: string[]; departs: string[] } {
  const s = CAMPAIGN.story[battleId]
  return { joins: s?.joins ?? [], departs: s?.departs ?? [] }
}
