// Pure helpers for the campaign screens and the HUD additions. No React, no three, no storage: unit-tested.
import { getBattleDef } from '../../data'
import type { BattleDef, OfficerDef } from '../../data/types'
import type { BattleState, ObjectiveStatus, TimelineItemPreview, Unit } from '../../engine'
import { MAX_CARRIED_STRATAGEMS, type CampaignState, type OfficerRecord } from '../../campaign'
import { windWord } from '../ledger'

/** Battle seed for a campaign battle: the campaign seed, the battle's place in the arc and the attempt (a retry is a new throw of the dice). */
export function battleSeed(campaignSeed: number, battleIndex: number, attempt: number): number {
  let h = (campaignSeed ^ Math.imul(battleIndex + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return (h % 0x7fffffff) + 1
}

// ------------------------------------------------------------------ objectives and timeline (HUD tracker)

export interface TrackerLine {
  key: string
  side: 'win' | 'lose'
  text: string
  /** 0..1 when the condition has numeric progress, else null. */
  progress: number | null
  met: boolean
}

/** Map `query.objectives` into tracker lines. The text is the engine's own; only the progress fraction is derived. */
export function trackerLines(statuses: ObjectiveStatus[]): TrackerLine[] {
  return statuses.map((s) => ({
    key: `${s.side}-${s.index}`,
    side: s.side,
    text: s.text,
    progress: s.current !== null && s.target !== null && s.target > 0 ? Math.max(0, Math.min(1, s.current / s.target)) : null,
    met: s.met,
  }))
}

/** The one line the phone shows when the tracker is collapsed: the first win condition. */
export function trackerHeadline(lines: TrackerLine[]): string {
  return lines.find((l) => l.side === 'win')?.text ?? lines[0]?.text ?? ''
}

/** "Round 5: ..." label for a timeline preview item. */
export function timelineLabel(item: TimelineItemPreview): string {
  return `Round ${item.round}${item.phase === 'end' ? ' (end)' : ''}: ${item.text}`
}

// ------------------------------------------------------------------ unit panel status

/** Ambush units stay put until a player unit comes within n tiles or they are attacked (13-engine-v2.md section 7). */
export function lyingInWait(state: BattleState, unit: Unit): boolean {
  const b = state.enemyBehaviour[unit.id]
  if (!b || !b.startsWith('ambush')) return false
  const n = Number(b.split(':')[1] ?? 2)
  if (unit.troops < unit.maxTroops) return false
  return !state.units.some((u) => u.side !== unit.side && u.side === 'han' && Math.abs(u.x - unit.x) + Math.abs(u.y - unit.y) <= (Number.isFinite(n) ? n : 2))
}

/** "Retreats at 50%" for a unit with a retreat threshold. */
export function retreatText(unit: Unit): string | null {
  if (unit.retreatAt === undefined) return null
  return `Retreats at ${Math.round(unit.retreatAt * 100)}%`
}

/** True for the fixed allies a battle brings along (they are not on the roster). */
export function isGuestUnit(state: BattleState, unit: Unit): boolean {
  return !!getBattleDef(state.battleId)?.guests?.some((g) => g.id === unit.id)
}

const STAT_WORD: Record<string, string> = { war: 'War', int: 'Int', lead: 'Lead', cha: 'Cha' }
/** Buff chips such as "War +10 · 2 rounds". */
export function buffChips(state: BattleState, unit: Unit): string[] {
  return (unit.buffs ?? []).map((b) => {
    // a buff is removed at the end of its owner's phase of round `until`, so it covers `until - round + 1` rounds from now
    const left = Math.max(0, b.until - state.round + 1)
    return `${STAT_WORD[b.stat] ?? b.stat} ${b.amount > 0 ? '+' : ''}${b.amount}${left > 0 ? ` · ${left} round${left === 1 ? '' : 's'}` : ''}`
  })
}

// ------------------------------------------------------------------ deploy

export interface DeployMark {
  x: number
  y: number
  /** 1-based slot number (index into the deploy list + 1). */
  n: number
  kind: 'start' | 'ambush' | 'late'
  label: string
  officer: string | null
}

/** Numbered markers for a battle's start tiles. `names` is the deploy list in slot order. */
export function deployMarks(def: BattleDef, names: (string | null)[]): DeployMark[] {
  const starts = def.playerStarts ?? []
  const late = new Map<number, number>()
  for (const r of def.reinforcements ?? []) if (r.side === 'han' && r.slot !== undefined) late.set(r.slot, r.round)
  return starts.map((st, i) => {
    const arrives = st.arrivesRound ?? late.get(i)
    const officer = names[i] ?? null
    if (arrives !== undefined) return { x: st.x, y: st.y, n: i + 1, kind: 'late' as const, label: `Arrives round ${arrives}`, officer }
    if (st.ambush) return { x: st.x, y: st.y, n: i + 1, kind: 'ambush' as const, label: 'Ambush post', officer }
    return { x: st.x, y: st.y, n: i + 1, kind: 'start' as const, label: '', officer }
  })
}

/** Where a held-back slot's officer enters when the slot is a reinforcement with an entry tile of its own. */
export function slotEntry(def: BattleDef, slot: number): { x: number; y: number } | null {
  const r = (def.reinforcements ?? []).find((q) => q.side === 'han' && q.slot === slot)
  const e = r?.entry[0]
  return e ? { x: e[0], y: e[1] } : null
}

/** Initial optional picks for the deploy screen: the battle's default line-up first, then the rest of the active roster, up to the free slots. */
export function defaultPick(state: CampaignState, def: BattleDef): string[] {
  const slots = def.deploySlots ?? (def.required ?? []).length
  const required = (def.required ?? []).filter((id) => state.roster.some((r) => r.officerId === id && r.status === 'active'))
  const free = Math.max(0, slots - required.length)
  const active = state.roster.filter((r) => r.status === 'active').map((r) => r.officerId)
  const preferred = (def.defaultDeploy ?? []).filter((id) => active.includes(id))
  const rest = active.filter((id) => !preferred.includes(id))
  return [...preferred, ...rest].filter((id) => !required.includes(id)).slice(0, free)
}

/** Toggle an officer in the optional picks, keeping the count within the free slots. Returns the new picks. */
export function togglePick(picks: string[], id: string, free: number): string[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id)
  if (picks.length >= free) return picks
  return [...picks, id]
}

// ------------------------------------------------------------------ camp: stratagem loadout

/** A loadout kept to what the officer knows, topped up to three from the known list in order. */
export function normaliseLoadout(rec: OfficerRecord, current: string[] | undefined): string[] {
  const out = (current ?? []).filter((s, i, a) => rec.stratagems.includes(s) && a.indexOf(s) === i).slice(0, MAX_CARRIED_STRATAGEMS)
  for (const s of rec.stratagems) {
    if (out.length >= MAX_CARRIED_STRATAGEMS) break
    if (!out.includes(s)) out.push(s)
  }
  return out
}

/** Click on a stratagem chip: remove it (never the last one), add it, or swap out the oldest pick when three are carried. */
export function toggleStratagem(current: string[], known: string[], strat: string): string[] {
  if (!known.includes(strat)) return current
  if (current.includes(strat)) return current.length > 1 ? current.filter((s) => s !== strat) : current
  const next = [...current, strat]
  return next.length > MAX_CARRIED_STRATAGEMS ? next.slice(next.length - MAX_CARRIED_STRATAGEMS) : next
}

// ------------------------------------------------------------------ briefing

/** "Round 1: breeze toward east · Round 6: calm" from the battle's wind schedule. */
export function windScheduleText(def: BattleDef): string[] {
  return def.wind.map((w) => `Round ${w.round}: ${windWord(w.dir, w.strength)}`)
}

export function officerName(id: string, officers: Record<string, OfficerDef>): string {
  return officers[id]?.name ?? id
}

/** Years and place line for a briefing, "184 · Qingzhou". */
export function briefingKicker(def: BattleDef): string {
  return [def.year, def.place].filter((x) => x !== undefined && x !== '').join(' · ')
}

/** Stats shown on a roster slip: base plus campaign bonus. */
export function statLine(base: OfficerDef | undefined, rec: OfficerRecord): { key: 'war' | 'int' | 'lead' | 'cha'; label: string; value: number; bonus: number }[] {
  const keys: ['war' | 'int' | 'lead' | 'cha', string][] = [
    ['war', 'War'],
    ['int', 'Int'],
    ['lead', 'Lead'],
    ['cha', 'Cha'],
  ]
  return keys.map(([k, label]) => ({ key: k, label, value: Math.min(100, (base?.[k] ?? 0) + rec.statBonus[k]), bonus: rec.statBonus[k] }))
}
