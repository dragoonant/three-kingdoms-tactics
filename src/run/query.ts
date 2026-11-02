// query-style helpers: every number the run screens show comes from here (RL-CHOICE-1, RL-UPKEEP-2, RL-HUNGER-2). Pure.
import { getBattleDef } from '../data'
import { hasBattleChoice, isMarket, isTown, stopDef } from './era'
import {
  activeBand, capOf, choicePayable, commanderId, condTrue, finaleName, firedEchoes, flatEffects, giftFor, legOptions, levyCost, levyPrice,
  lossOf, marketMax, nameOf, poolOf, riceDays, riceDaysFor, riceOf, spirit, tradeMult, upkeep, upkeepFor, volunteersFor,
} from './core'
import { battleName, dayRow, deploySlots } from './battle'
import type { Effects, EraData, NodeRef, RunState, StopDef } from './types'

export type ChipTone = 'plus' | 'minus' | 'neutral' | 'battle' | 'flag' | 'echo' | 'note'
export interface Chip {
  text: string
  tone: ChipTone
}

const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/** Chips for a plain effects object at the current state (hidden echoes never appear). */
export function describe(era: EraData, s: RunState, e: Effects): Chip[] {
  const out: Chip[] = []
  const rice = riceOf(era, s, e)
  if (rice || e.riceTrade || e.giftRice) {
    let note = ''
    if (e.riceTrade) {
      const m = tradeMult(era, s.renown)
      note = m === 1 ? ' (a trade)' : ` (a trade, x${m} at Renown ${s.renown})`
    }
    if (e.giftRice && s.renown < era.rules.giftAt) note = ` (Renown ${era.rules.giftAt}+ would add ${e.giftRice})`
    if (rice) out.push({ text: `rice ${sign(rice)}${note}`, tone: rice > 0 ? 'plus' : 'minus' })
    else if (note) out.push({ text: `no rice${note}`, tone: 'neutral' })
  }
  if (e.soldiers) out.push({ text: `${sign(e.soldiers)} soldiers`, tone: 'plus' })
  if (e.casualties) {
    const c = lossOf(era, s, e.casualties)
    const how = c.killed === c.n ? 'all killed' : `${c.killed} killed, ${c.n - c.killed} wounded`
    out.push({ text: `lose ${c.n} men (${how})`, tone: 'minus' })
  }
  if (e.renown) {
    const to = Math.max(0, Math.min(era.rules.renownMax, s.renown + e.renown))
    const sp0 = spirit(s.renown)
    const sp1 = spirit(to)
    out.push({ text: `Renown ${sign(e.renown)} -> ${to}${sp1 !== sp0 ? ` (${sign(sp1)} Qi)` : ''}`, tone: e.renown > 0 ? 'plus' : 'minus' })
  }
  if (e.days) out.push({ text: `${e.days} day${e.days === 1 ? '' : 's'} (rice -${e.days * upkeep(era, s)})`, tone: 'minus' })
  for (const f of e.flags ?? []) if (era.flags[f]?.visible) out.push({ text: era.flags[f]!.text, tone: 'flag' })
  if (e.recruit && !s.band.some((o) => o.rec.officerId === e.recruit)) out.push({ text: `${nameOf(era, e.recruit)} joins`, tone: 'plus' })
  for (const [id, v] of Object.entries(e.capBonus ?? {})) out.push({ text: `${nameOf(era, id)} command cap ${sign(v)}`, tone: v > 0 ? 'plus' : 'minus' })
  if (e.qiNext) out.push({ text: `every officer ${sign(e.qiNext)} Qi in the next battle`, tone: e.qiNext > 0 ? 'plus' : 'minus' })
  for (const [id, v] of Object.entries(e.qiNextOfficer ?? {})) out.push({ text: `${nameOf(era, id)} ${sign(v)} Qi in the next battle`, tone: v > 0 ? 'plus' : 'minus' })
  if (e.tired) out.push({ text: 'arrive tired: -1 move in round 1', tone: 'minus' })
  if (e.woundOfficer) {
    const cap = capOf(era, s, e.woundOfficer)
    out.push({ text: `${nameOf(era, e.woundOfficer)} hurt (cap ${cap} -> ${Math.max(era.rules.minPerOfficer, Math.floor(cap / 2 / 50) * 50)} until a rest)`, tone: 'minus' })
  }
  if (e.rest) out.push({ text: `rest: all ${s.wounded} wounded return, hurt officers recover, tiredness clears`, tone: 'plus' })
  if (e.healWounded === 'half') out.push({ text: `${Math.floor(s.wounded / 2 / 10) * 10} wounded return`, tone: 'plus' })
  if (e.nextLegDays) out.push({ text: `next leg ${sign(e.nextLegDays)} days`, tone: e.nextLegDays < 0 ? 'plus' : 'minus' })
  if (e.nextBattleE) out.push({ text: `the battle's enemy troops x${Math.round((1 + e.nextBattleE) * 100) / 100}`, tone: 'plus' })
  if (e.slowLegs) out.push({ text: `the next ${e.slowLegs.legs} legs +${e.slowLegs.days} day each`, tone: 'minus' })
  if (e.noVolunteers) out.push({ text: 'no volunteers', tone: 'neutral' })
  return out
}

export interface ChoiceView {
  id: string
  label: string
  tension: string
  chips: Chip[]
  /** Branch note when a condition (Renown threshold, outlaw) decides what the choice gives (RL-REN-5). */
  conditionNote: string | null
  gamble: { odds: number; win: Chip[]; lose: Chip[] } | null
  battle: { id: string; name: string; slots: number; enemyScale: number; win: Chip[]; aftermath: boolean } | null
  volunteers: number
  gift: number
  /** Hidden echoes that pay off now, named in full (RL-ECHO-1). */
  echoes: string[]
  payable: boolean
  reason: string | null
  /** Rice after the choice's sure effects and days. */
  riceAfter: number
  lastsAfter: number
  kind: 'battle' | 'gamble' | 'plain'
}

/** [RL-CHOICE-1] Everything a choice slip prints. */
export function choiceView(era: EraData, s: RunState, stop: StopDef, choiceId: string): ChoiceView {
  const ch = stop.choices.find((c) => c.id === choiceId)!
  const e = flatEffects(s, ch.effects)
  const chips = describe(era, s, e)
  let conditionNote: string | null = null
  for (const c of ch.effects.conditional ?? []) {
    if (c.if.renownGte !== undefined && !condTrue(s, c.if)) conditionNote = `Needs Renown ${c.if.renownGte}+ (you have ${s.renown}): this gives its other branch.`
    else if (c.if.renownGte !== undefined) conditionNote = `Renown ${c.if.renownGte}+: you have ${s.renown}.`
    if (c.if.flag && era.flags[c.if.flag]?.visible && condTrue(s, c.if)) conditionNote = `${era.flags[c.if.flag]!.text}`
  }
  const echoes = firedEchoes(era, s, ch.effects).map((f) => era.flags[f]!.text)
  const pay = choicePayable(era, s, ch.effects)
  const rice = riceOf(era, s, e)
  const ren = Math.max(0, Math.min(era.rules.renownMax, s.renown + (e.renown ?? 0)))
  let renAfter = ren
  let battle: ChoiceView['battle'] = null
  if (e.battle) {
    renAfter = Math.max(0, Math.min(era.rules.renownMax, ren + (flatEffects(s, e.battle.win).renown ?? 0)))
    const tier = s.stop?.tier ?? 0
    const scale = (era.road.tierScale[Math.min(tier, era.road.tierScale.length - 1)] ?? 1) * (1 + s.nextBattleE)
    battle = {
      id: e.battle.id,
      name: battleName(e.battle.id),
      slots: deploySlots(era, e.battle.id),
      enemyScale: Math.round(scale * 100) / 100,
      win: describe(era, s, flatEffects(s, e.battle.win)),
      aftermath: !!e.battle.aftermath,
    }
  }
  const afterStop = s.stop?.after ? stopDef(era, s.stop.after.stopId) : stop
  const volunteers = s.stop?.after ? 0 : volunteersFor(era, afterStop, e, renAfter)
  const gift = s.stop?.after ? 0 : giftFor(era, afterStop, e, renAfter)
  const days = e.days ?? 0
  const riceAfter = s.rice + rice - days * upkeep(era, s) + gift
  const poolAfter = poolOf(s) + (e.soldiers ?? 0) + volunteers - (e.casualties ? lossOf(era, s, e.casualties).killed : 0)
  return {
    id: ch.id,
    label: ch.label,
    tension: ch.tension,
    chips,
    conditionNote,
    gamble: e.gamble ? { odds: e.gamble.odds, win: describe(era, s, flatEffects(s, e.gamble.win)), lose: describe(era, s, flatEffects(s, e.gamble.lose)) } : null,
    battle,
    volunteers,
    gift,
    echoes,
    payable: pay.ok,
    reason: pay.reason ?? null,
    riceAfter,
    lastsAfter: riceDaysFor(era, riceAfter, poolAfter),
    kind: e.battle ? 'battle' : e.gamble ? 'gamble' : 'plain',
  }
}

// ------------------------------------------------------------------ HUD

export interface Hud {
  rice: number
  lasts: number
  upkeep: number
  soldiers: number
  wounded: number
  officers: number
  renown: number
  spirit: number
  day: number
  /** The finale bracket if the band arrived today. */
  bracket: string
  bracketBy: number | null
  /** [RL-HUNGER-2] */
  forecast: number
  forecastHungry: boolean
  tired: boolean
  outlaw: boolean
  /** Stated flags held (hidden echoes never listed). */
  stated: string[]
}

/** [RL-HUNGER-2] The finale's rice cost at the current pool (the whole pool up to the slots' caps) + 3 days of upkeep. */
export function finaleForecast(era: EraData, s: RunState): number {
  const slots = deploySlots(era, era.finale.battle)
  const cmd = commanderId(era)
  const caps = activeBand(s)
    .map((o) => ({ id: o.rec.officerId, cap: capOf(era, s, o.rec.officerId) }))
    .sort((a, b) => (a.id === cmd ? -1 : b.id === cmd ? 1 : b.cap - a.cap))
    .slice(0, slots)
  const field = Math.min(s.soldiers, caps.reduce((a, c) => a + c.cap, 0))
  return Math.ceil(field / era.rules.battleRicePer) + era.rules.hungryDays * upkeep(era, s)
}

export function hud(era: EraData, s: RunState): Hud {
  const { row } = dayRow(era, s)
  const idx = era.finale.dayTable.indexOf(row)
  const forecast = finaleForecast(era, s)
  return {
    rice: s.rice,
    lasts: riceDays(era, s),
    upkeep: upkeep(era, s),
    soldiers: s.soldiers,
    wounded: s.wounded,
    officers: activeBand(s).length,
    renown: s.renown,
    spirit: spirit(s.renown),
    day: s.day,
    bracket: row.label,
    bracketBy: idx >= 0 && row.maxDay < 999 ? row.maxDay : null,
    forecast,
    forecastHungry: s.rice < forecast,
    tired: s.tired,
    outlaw: s.flags.includes('outlaw'),
    stated: s.flags.filter((f) => era.flags[f]?.visible).map((f) => era.flags[f]!.text),
  }
}

// ------------------------------------------------------------------ road view

export interface StopMarks {
  battle: boolean
  town: boolean
  market: boolean
  camp: boolean
}
export const marksOf = (st: StopDef): StopMarks => ({ battle: hasBattleChoice(st), town: isTown(st), market: isMarket(st), camp: st.tags.includes('camp') })

export interface RoadNodeView {
  tier: number
  lane: number
  stopId: string
  title: string
  marks: StopMarks
  /** visited, here, ahead (shown), hidden (rolled scroll), passed (a road not taken). */
  state: 'visited' | 'here' | 'ahead' | 'passed' | 'hidden'
  reachable: boolean
}

/** [RL-ROAD-6] The road as the scroll shows it: the next two tiers are open, further is rolled. */
export function roadView(era: EraData, s: RunState): { nodes: RoadNodeView[]; tiers: number; here: NodeRef; tierNames: string[] } {
  const visited = new Set(s.path.map((n) => `${n[0]}:${n[1]}`))
  const here = s.node
  const reach = new Set(legOptions(era, s).filter((o) => o.target !== 'finale').map((o) => o.stopId))
  const nodes: RoadNodeView[] = []
  s.road.tiers.forEach((t, ti) => {
    t.forEach((id, lane) => {
      const st = stopDef(era, id)
      const key = `${ti}:${lane}`
      let state: RoadNodeView['state']
      if (s.phase !== 'prologue' && ti === here[0] && lane === here[1]) state = 'here'
      else if (visited.has(key)) state = 'visited'
      else if (ti <= here[0]) state = 'passed'
      else if (ti <= here[0] + 2) state = 'ahead'
      else state = 'hidden'
      nodes.push({ tier: ti, lane, stopId: id, title: st.title, marks: marksOf(st), state, reachable: s.phase === 'road' && reach.has(id) })
    })
  })
  const defs = era.road.tiers.filter((t) => s.road.long || !t.longOnly)
  return { nodes, tiers: s.road.tiers.length, here, tierNames: defs.map((d) => d.name) }
}

export { legOptions, levyCost, levyPrice, marketMax, finaleName, upkeepFor, riceDaysFor }

/** Stop index of the current stop among the road's stops (for "stop 3 of 8"). */
export function stopCount(s: RunState): { at: number; of: number } {
  return { at: s.path.length, of: s.road.tiers.length }
}

/** The battle a pending deploy is for, as the deploy header names it. */
export function pendingBattleName(s: RunState): string {
  return s.pending ? (getBattleDef(s.pending.battleId)?.title ?? battleName(s.pending.battleId)) : ''
}
