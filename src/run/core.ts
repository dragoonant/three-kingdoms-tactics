// The run between battles: start state, upkeep, losses, Renown, stops and their choices, markets, the road and rests.
// Pure and deterministic (RL-RNG-1): every public action takes a RunState and returns a new one. Rule ids: 10-rules.md section 11.
import { makeRecord } from '../campaign/progress'
import { AFTERMATH_OFFSET, ERA1, isMarket, isTown, P_FATE, stopDef, stream } from './era'
import { drawRoad, edgesFrom, isLastTier } from './road'
import { RUN_VERSION, type Cond, type Effects, type EraData, type RunEndKind, type RunOfficer, type RunState, type StopDef } from './types'

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
export const round10 = (n: number): number => Math.round(n / 10) * 10

// ------------------------------------------------------------------ numbers

export const poolOf = (s: RunState): number => s.soldiers + s.wounded
/** [RL-UPKEEP-1] bags a day. */
export const upkeepFor = (era: EraData, pool: number): number => Math.ceil(pool / era.rules.upkeepPer)
export const upkeep = (era: EraData, s: RunState): number => upkeepFor(era, poolOf(s))
/** [RL-UPKEEP-2] "Rice lasts N days" (99 when nobody eats). */
export function riceDaysFor(era: EraData, rice: number, pool: number): number {
  const u = upkeepFor(era, pool)
  return u > 0 ? Math.max(0, Math.floor(rice / u)) : 99
}
export const riceDays = (era: EraData, s: RunState): number => riceDaysFor(era, s.rice, poolOf(s))
/** [RL-REN-4] battle spirit. */
export function spirit(renown: number): number {
  if (renown >= 70) return 2
  if (renown >= 40) return 1
  if (renown < 20) return -1
  return 0
}
/** [RL-REN-2] rice from a trade (and the market price divisor). */
export function tradeMult(era: EraData, renown: number): number {
  if (renown >= era.rules.giftAt) return era.rules.tradeHigh
  if (renown < 20) return era.rules.tradeLow
  return 1
}
/** [RL-REN-6] Liu Bei's sway bonus in percentage points. */
export const swayBonusFor = (renown: number): number => Math.floor((renown - 30) / 10)
/** [RL-POOL-5] bags per 100 levies. */
export const levyPrice = (era: EraData, renown: number): number => Math.round((era.rules.levyPrice / tradeMult(era, renown)) * 10) / 10
export const levyCost = (era: EraData, renown: number, n: number): number => Math.ceil((n / 100) * levyPrice(era, renown))

export const activeBand = (s: RunState): RunOfficer[] => s.band.filter((o) => o.rec.status === 'active')
export const officerOf = (s: RunState, id: string): RunOfficer | undefined => s.band.find((o) => o.rec.officerId === id && o.rec.status === 'active')
export const nameOf = (era: EraData, id: string): string => era.officers[id]?.name ?? id
export const commanderId = (era: EraData): string => Object.entries(era.officers).find(([, o]) => o.commander)?.[0] ?? 'liu-bei'

/** [RL-POOL-2] command cap = 20 x Lead + 100 x level, rounded down to 50, plus stop bonuses; halved while hurt (min 250). */
export function capOf(era: EraData, s: RunState, id: string): number {
  const o = s.band.find((b) => b.rec.officerId === id)
  const lead = era.officers[id]?.lead ?? 50
  if (!o) return 0
  const R = era.rules
  let cap = Math.floor((R.capPerLead * lead + R.capPerLevel * o.rec.level + o.capBonus) / R.sliderStep) * R.sliderStep
  if (o.hurt) cap = Math.floor(cap / 2 / R.sliderStep) * R.sliderStep
  return Math.max(cap, R.minPerOfficer)
}

// ------------------------------------------------------------------ state

/** [RL-RUN-1] A fresh run: the era's start state, its road drawn from the seed; the prologue plays first. */
export function newRun(seed: number, ironOath = false, era: EraData = ERA1): RunState {
  const st = era.start
  const sd = seed >>> 0
  return {
    version: RUN_VERSION,
    era: era.era,
    seed: sd,
    ironOath,
    road: drawRoad(era, sd),
    rice: st.rice,
    soldiers: st.soldiers,
    wounded: st.wounded,
    renown: st.renown,
    day: st.day,
    band: st.band.map((b) => ({ rec: makeRecord(b.officer, b.level), hurt: false, capBonus: 0 })),
    flags: [],
    fired: [],
    qiMods: [],
    tired: false,
    tiredFresh: false,
    slowLegs: null,
    nextLegDays: 0,
    nextBattleE: 0,
    node: [0, 0],
    stopIndex: 0,
    phase: 'prologue',
    stop: null,
    pending: null,
    deployment: null,
    hired: 0,
    path: [],
    legs: [],
    picks: [],
    annals: [{ day: st.day, text: `The brothers swear their oath and march with ${st.soldiers} men and ${st.rice} bags of rice.` }],
    stats: { battles: 0, battlesWon: 0, killed: 0, wounded: 0, volunteers: 0, fell: [], gambles: 0, gamblesWon: 0 },
    end: null,
  }
}

export function log(s: RunState, text: string, tone?: RunState['annals'][number]['tone']): void {
  s.annals.push(tone ? { day: s.day, text, tone } : { day: s.day, text })
}

export function endRun(s: RunState, kind: RunEndKind, text: string): void {
  if (s.end) return
  s.end = { kind, day: s.day, text }
  s.phase = 'ended'
  s.stop = null
  s.pending = null
  log(s, text, kind === 'won' ? 'good' : 'bad')
}

/** [RL-UPKEEP-1] [RL-SCATTER-1] Pass days, paying each day's upkeep; the army scatters when it cannot. */
export function passDays(era: EraData, s: RunState, n: number): void {
  for (let i = 0; i < n && !s.end; i++) {
    s.day += 1
    const u = upkeep(era, s)
    if (s.rice < u || s.rice - u <= 0) {
      s.rice = Math.max(0, s.rice - u)
      endRun(s, 'starved', `Day ${s.day}: the last of the rice is gone and the band scatters.`)
      return
    }
    s.rice -= u
  }
}

/** [RL-LOSS-1] Losses from the healthy soldiers: half killed (rounded to 10), the rest wounded, unless `killed` says otherwise. */
export function lossOf(era: EraData, s: RunState, c: NonNullable<Effects['casualties']>): { n: number; killed: number } {
  let n = c.n ?? round10((c.pct ?? 0) * s.soldiers)
  n = Math.max(0, Math.min(n, s.soldiers))
  const killed = round10(n * (c.killed ?? era.rules.killedShare))
  return { n, killed: Math.min(n, killed) }
}
export function casualties(era: EraData, s: RunState, c: NonNullable<Effects['casualties']>): { n: number; killed: number } {
  const r = lossOf(era, s, c)
  s.soldiers -= r.n
  s.wounded += r.n - r.killed
  s.stats.killed += r.killed
  s.stats.wounded += r.n - r.killed
  return r
}

/** [RL-REN-1] */
export function addRenown(era: EraData, s: RunState, n: number): void {
  s.renown = Math.max(0, Math.min(era.rules.renownMax, s.renown + n))
}

/** [RL-REST-1] (full) and [RL-REST-2] (half): the wounded return; tiredness clears; a full rest heals hurt officers; [RL-REN-4] desertion under 20. */
export function rest(era: EraData, s: RunState, full: boolean): { back: number; deserted: number } {
  const back = full ? s.wounded : Math.floor(s.wounded / 2 / 10) * 10
  s.wounded -= back
  s.soldiers += back
  s.tired = false
  s.tiredFresh = false
  if (full) for (const o of s.band) o.hurt = false
  let deserted = 0
  if (s.renown < 20) {
    deserted = round10(s.soldiers * era.rules.deserterPct)
    s.soldiers -= deserted
  }
  return { back, deserted }
}

// ------------------------------------------------------------------ effects

export function condTrue(s: RunState, c: Cond): boolean {
  if (c.renownGte !== undefined && s.renown < c.renownGte) return false
  if (c.flag !== undefined && !s.flags.includes(c.flag)) return false
  if (c.notFlag !== undefined && s.flags.includes(c.notFlag)) return false
  return true
}

/** Hidden flags whose conditions fire for this effects object now (RL-ECHO-1: their cause is then named). */
export function firedEchoes(era: EraData, s: RunState, eff: Effects): string[] {
  const out: string[] = []
  for (const c of eff.conditional ?? []) {
    const f = c.if.flag
    if (f && !era.flags[f]?.visible && condTrue(s, c.if) && c.then && Object.keys(c.then).length) out.push(f)
  }
  return out
}

/** Flatten an effects object for the current state: conditionals resolved; gamble and battle stay nested. */
export function flatEffects(s: RunState, eff: Effects): Effects {
  const out: Effects = { ...eff }
  delete out.conditional
  for (const c of eff.conditional ?? []) {
    const part = condTrue(s, c.if) ? c.then : c.else
    if (!part) continue
    for (const [k, v] of Object.entries(part) as [keyof Effects, unknown][]) {
      if (k === 'flags') out.flags = [...(out.flags ?? []), ...(v as string[])]
      else if (typeof v === 'number') (out as Record<string, unknown>)[k] = ((out[k] as number | undefined) ?? 0) + v
      else (out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

/** [RL-REN-2] The rice an effects object gives at the current Renown (trades scaled, gifts at 50+). */
export function riceOf(era: EraData, s: RunState, e: Effects): number {
  let r = e.rice ?? 0
  if (e.riceTrade) r += Math.round(e.riceTrade * tradeMult(era, s.renown))
  if (e.giftRice && s.renown >= era.rules.giftAt) r += e.giftRice
  return r
}

/** [RL-REN-3] Volunteers after a choice, at Renown `ren` (after the choice). */
export function volunteersFor(era: EraData, stop: StopDef, e: Effects, ren: number): number {
  if (e.noVolunteers || (!isTown(stop) && !e.volunteers)) return 0
  return round10(ren * era.rules.volunteersPerRenown * (e.volunteersMult ?? 1))
}

/** [RL-REN-2] The elders' gift at a town or village stop with Renown 50+ after the choice. */
export function giftFor(era: EraData, stop: StopDef, e: Effects, ren: number): number {
  if (!isTown(stop) || e.noVolunteers || ren < era.rules.giftAt) return 0
  return Math.floor(ren / era.rules.giftDiv)
}

/** Apply the plain part of an effects object (no gamble, no battle). Days pass last. Returns the annal phrases. */
export function applySimple(era: EraData, s: RunState, e: Effects, cause: string): string[] {
  const parts: string[] = []
  const rice = riceOf(era, s, e)
  if (rice) {
    s.rice += rice
    parts.push(`rice ${rice > 0 ? '+' : ''}${rice}`)
  }
  if (e.soldiers) {
    s.soldiers += e.soldiers
    parts.push(`+${e.soldiers} men`)
  }
  if (e.casualties) {
    const c = casualties(era, s, e.casualties)
    if (c.n) parts.push(`lost ${c.n} men (${c.killed} killed)`)
  }
  if (e.renown) {
    addRenown(era, s, e.renown)
    parts.push(`Renown ${e.renown > 0 ? '+' : ''}${e.renown}`)
  }
  for (const f of e.flags ?? []) {
    if (!s.flags.includes(f)) s.flags.push(f)
    if (era.flags[f]?.visible) parts.push(era.flags[f]!.text)
  }
  if (e.recruit && !s.band.some((o) => o.rec.officerId === e.recruit)) {
    s.band.push({ rec: makeRecord(e.recruit, era.officers[e.recruit]?.joinLevel ?? 2), hurt: false, capBonus: 0 })
    parts.push(`${nameOf(era, e.recruit)} joins the band`)
  }
  for (const [id, v] of Object.entries(e.capBonus ?? {})) {
    const o = s.band.find((b) => b.rec.officerId === id)
    if (o) {
      o.capBonus += v
      parts.push(`${nameOf(era, id)} command cap ${v > 0 ? '+' : ''}${v}`)
    }
  }
  if (e.qiNext) s.qiMods.push({ qi: e.qiNext, cause })
  for (const [id, v] of Object.entries(e.qiNextOfficer ?? {})) s.qiMods.push({ officer: id, qi: v, cause })
  if (e.tired) {
    s.tired = true
    s.tiredFresh = true
    parts.push('the band is tired')
  }
  if (e.woundOfficer) {
    const o = officerOf(s, e.woundOfficer)
    if (o) {
      o.hurt = true
      parts.push(`${nameOf(era, e.woundOfficer)} is hurt`)
    }
  }
  if (e.rest) {
    const r = rest(era, s, true)
    parts.push(`rested: ${r.back} wounded return${r.deserted ? `, ${r.deserted} desert` : ''}`)
  }
  if (e.healWounded === 'half') {
    const r = rest(era, s, false)
    parts.push(`${r.back} wounded return${r.deserted ? `, ${r.deserted} desert` : ''}`)
  }
  if (e.nextLegDays) s.nextLegDays += e.nextLegDays
  if (e.nextBattleE) s.nextBattleE += e.nextBattleE
  if (e.slowLegs) s.slowLegs = { ...e.slowLegs }
  if (s.rice <= 0) {
    s.rice = 0
    endRun(s, 'starved', 'The rice is gone and the band scatters.')
  }
  if (e.days && !s.end) passDays(era, s, e.days)
  return parts
}

// ------------------------------------------------------------------ stops

/** [RL-CHOICE-2] Can the choice's rice cost be paid? */
export function choicePayable(era: EraData, s: RunState, e: Effects): { ok: boolean; reason?: string } {
  const f = flatEffects(s, e)
  const rice = riceOf(era, s, f)
  if (rice < 0 && s.rice + rice < 1) return { ok: false, reason: `Needs ${-rice} bags; the band holds ${s.rice}.` }
  return { ok: true }
}

function arrive(era: EraData, s: RunState, stopId: string, tier: number, index: number, after?: { stopId: string; choiceId: string }): void {
  s.stop = after ? { id: stopId, tier, index, after } : { id: stopId, tier, index }
  s.phase = 'stop'
  const stop = stopDef(era, stopId)
  if (!stop.choices.some((c) => choicePayable(era, s, c.effects).ok)) endRun(s, 'starved', `${stop.title}: no choice can be paid for, and the band scatters.`)
}

/** After the prologue: the band stands at the first stop (RL-ROAD-1, tier 0). */
export function beginRoad(era: EraData, state: RunState): RunState {
  if (state.phase !== 'prologue') return state
  const s = clone(state)
  s.node = [0, 0]
  s.path = [[0, 0]]
  arrive(era, s, s.road.tiers[0]![0]!, 0, s.stopIndex++)
  return s
}

/** [RL-CHOICE-1] [RL-GAMBLE-1] Take a choice at the current stop. A battle choice leads to deploy; otherwise the after-stop step runs. */
export function choose(era: EraData, state: RunState, choiceId: string): RunState {
  if (state.phase !== 'stop' || !state.stop) return state
  const stop = stopDef(era, state.stop.id)
  const ch = stop.choices.find((c) => c.id === choiceId)
  if (!ch || !choicePayable(era, state, ch.effects).ok) return state
  const s = clone(state)
  const cur = s.stop!
  for (const f of firedEchoes(era, s, ch.effects)) {
    if (!s.fired.includes(f)) s.fired.push(f)
    log(s, era.flags[f]!.text, 'echo')
  }
  s.picks.push(`${stop.id}/${ch.id}`)
  const e = flatEffects(s, ch.effects)
  const cause = `${stop.title}: ${ch.label}`
  const parts = applySimple(era, s, e, cause)
  log(s, `${stop.title}: ${ch.label}${parts.length ? ` (${parts.join(', ')})` : ''}.`)
  if (s.end) return s
  if (e.gamble) {
    const win = stream(s.seed, P_FATE, cur.index)() < e.gamble.odds
    s.stats.gambles += 1
    if (win) s.stats.gamblesWon += 1
    const part = flatEffects(s, win ? e.gamble.win : e.gamble.lose)
    const p2 = applySimple(era, s, part, cause)
    log(s, `The odds (${Math.round(e.gamble.odds * 100)}%) ${win ? 'go our way' : 'go against us'}${p2.length ? `: ${p2.join(', ')}` : ''}.`, win ? 'good' : 'bad')
    if (s.end) return s
  }
  if (e.battle) {
    const scale = era.road.tierScale[Math.min(cur.tier, era.road.tierScale.length - 1)] ?? 1
    s.pending = {
      battleId: e.battle.id,
      tier: cur.tier,
      stopId: cur.after ? cur.after.stopId : stop.id,
      choiceId: cur.after ? cur.after.choiceId : ch.id,
      win: e.battle.win,
      ...(e.battle.aftermath ? { aftermath: e.battle.aftermath } : {}),
      enemyScale: Math.round(scale * (1 + s.nextBattleE) * 1000) / 1000,
      index: cur.index,
    }
    s.phase = 'deploy'
    return s
  }
  const after = cur.after ?? { stopId: stop.id, choiceId: ch.id }
  finishStop(era, s, after.stopId, after.choiceId)
  return s
}

/** The after-stop step: [RL-REN-3] volunteers, [RL-REN-2] the gift, then the [RL-POOL-5] market or the road. */
export function finishStop(era: EraData, s: RunState, stopId: string, choiceId: string): void {
  const stop = stopDef(era, stopId)
  const ch = stop.choices.find((c) => c.id === choiceId)
  const e = ch ? flatEffects(s, ch.effects) : {}
  const vol = volunteersFor(era, stop, e, s.renown)
  if (vol > 0) {
    s.soldiers += vol
    s.stats.volunteers += vol
    log(s, `${vol} volunteers join (Renown ${s.renown}).`, 'good')
  }
  const gift = giftFor(era, stop, e, s.renown)
  if (gift) {
    s.rice += gift
    log(s, `The elders bring ${gift} bags of rice (Renown ${s.renown}).`, 'good')
  }
  s.hired = 0
  s.stop = { id: stopId, tier: s.node[0], index: s.stop?.index ?? s.stopIndex }
  if (isMarket(stop)) s.phase = 'market'
  else s.phase = 'road'
}

/** Most levies the market can sell now (RL-POOL-5): the stop's cap and the rice (never down to 0). */
export function marketMax(era: EraData, s: RunState): number {
  let n = 0
  while (n + 100 <= era.rules.marketMax - s.hired && s.rice - levyCost(era, s.renown, n + 100) >= 1) n += 100
  return n
}

/** [RL-POOL-5] Hire `n` levies (a multiple of 100) and leave the market for the road. 0 just leaves. */
export function hireLevies(era: EraData, state: RunState, n: number): RunState {
  if (state.phase !== 'market') return state
  const s = clone(state)
  const k = Math.max(0, Math.floor(n / 100) * 100)
  if (k > 0 && k <= marketMax(era, s)) {
    const cost = levyCost(era, s.renown, k)
    s.rice -= cost
    s.soldiers += k
    s.hired += k
    log(s, `Market: ${k} levies hired for ${cost} bags.`)
  }
  s.phase = 'road'
  return s
}

// ------------------------------------------------------------------ the road

export interface LegOption {
  /** Index into edgesFrom(node), or 'finale'. */
  target: number | 'finale'
  kind: 'road' | 'mountain' | 'finale'
  stopId: string | null
  /** Days at the normal pace (after stop modifiers). */
  days: number
  canMarch: boolean
  marchDays: number
  marchLoss: number
  mountainLoss: number
}

/** [RL-ROAD-4] Days of a leg after the stop modifiers (refugees +1 a leg, a forced push -2). */
export function legDays(s: RunState, base: number): number {
  return Math.max(0, base + (s.slowLegs ? s.slowLegs.days : 0) + s.nextLegDays)
}

/** The legs open from the current node (RL-ROAD-3..5, RL-MARCH-1). */
export function legOptions(era: EraData, s: RunState): LegOption[] {
  const R = era.rules
  const out: LegOption[] = []
  const marchFor = (days: number): { marchDays: number; marchLoss: number } => {
    const saved = Math.floor(days / 2)
    return { marchDays: days - saved, marchLoss: lossOf(era, s, { pct: R.forcedMarchPctPerDaySaved * saved }).n }
  }
  if (isLastTier(s.road, s.node)) {
    const days = legDays(s, era.road.finaleLegDays)
    out.push({ target: 'finale', kind: 'finale', stopId: null, days, canMarch: days >= 2, ...marchFor(days), mountainLoss: 0 })
    return out
  }
  edgesFrom(s.road, s.node).forEach((e, i) => {
    const days = legDays(s, e.days)
    const mountain = e.kind === 'mountain'
    out.push({
      target: i,
      kind: e.kind,
      stopId: s.road.tiers[e.to[0]]![e.to[1]]!,
      days,
      canMarch: !mountain && days >= 2,
      ...marchFor(days),
      mountainLoss: mountain ? lossOf(era, s, { pct: era.road.mountainPath.attritionPct ?? R.mountainPathAttritionPct }).n : 0,
    })
  })
  return out
}

/** Travel a leg: [RL-ROAD-4] days, [RL-MARCH-1] forced march, [RL-ROAD-5] mountain path, [RL-MARCH-2] tiredness. */
export function travel(era: EraData, state: RunState, target: number | 'finale', march = false): RunState {
  if (state.phase !== 'road') return state
  const opt = legOptions(era, state).find((o) => o.target === target)
  if (!opt) return state
  const s = clone(state)
  const doMarch = march && opt.canMarch
  let days = opt.days
  if (!doMarch && s.tired && !s.tiredFresh) s.tired = false
  s.tiredFresh = false
  const R = era.rules
  const notes: string[] = []
  if (doMarch) {
    const saved = Math.floor(days / 2)
    days -= saved
    const c = casualties(era, s, { pct: R.forcedMarchPctPerDaySaved * saved })
    s.tired = true
    notes.push(`forced march, ${opt.days} days in ${days}, ${c.n} men lost to the road`)
  }
  if (opt.kind === 'mountain') {
    const c = casualties(era, s, { pct: era.road.mountainPath.attritionPct ?? R.mountainPathAttritionPct })
    notes.push(`the mountain path, ${c.n} stragglers`)
  }
  s.nextLegDays = 0
  if (s.slowLegs) {
    s.slowLegs.legs -= 1
    if (s.slowLegs.legs <= 0) s.slowLegs = null
  }
  const from = s.node
  if (opt.target === 'finale') {
    s.legs.push({ from, to: 'finale', days, march: doMarch, kind: 'finale' })
    log(s, `March to ${finaleName(era)}: ${days} day${days === 1 ? '' : 's'}${notes.length ? ` (${notes.join('; ')})` : ''}.`)
    passDays(era, s, days)
    if (s.end) return s
    s.stop = null
    s.phase = 'finale'
    s.pending = {
      battleId: era.finale.battle,
      tier: s.road.tiers.length,
      stopId: 'finale',
      choiceId: 'finale',
      win: {},
      finale: true,
      enemyScale: 1,
      index: 999,
    }
    return s
  }
  const edge = edgesFrom(s.road, s.node)[opt.target]!
  s.legs.push({ from, to: edge.to, days, march: doMarch, kind: edge.kind })
  log(s, `March to ${stopDef(era, opt.stopId!).title}: ${days} day${days === 1 ? '' : 's'}${notes.length ? ` (${notes.join('; ')})` : ''}.`)
  passDays(era, s, days)
  if (s.end) return s
  s.node = edge.to
  s.path.push(edge.to)
  arrive(era, s, opt.stopId!, edge.to[0], s.stopIndex++)
  return s
}

/** [RL-REST-2] Make camp between stops: 2 days, half the wounded return, tiredness clears. */
export function makeCamp(era: EraData, state: RunState): RunState {
  if (state.phase !== 'road') return state
  const s = clone(state)
  const r = rest(era, s, false)
  log(s, `Make camp for ${era.rules.makeCampDays} days: ${r.back} wounded return${r.deserted ? `, ${r.deserted} desert` : ''}.`)
  passDays(era, s, era.rules.makeCampDays)
  return s
}

/** [RL-POOL-4] Send healthy and wounded soldiers home for good (between stops and before deploying). */
export function sendHome(era: EraData, state: RunState, healthy: number, wounded: number): RunState {
  if (state.phase !== 'road' && state.phase !== 'deploy' && state.phase !== 'finale') return state
  const h = Math.max(0, Math.min(state.soldiers, Math.floor(healthy)))
  const w = Math.max(0, Math.min(state.wounded, Math.floor(wounded)))
  if (h + w === 0) return state
  const s = clone(state)
  s.soldiers -= h
  s.wounded -= w
  log(s, `${h + w} men sent home (${h} healthy, ${w} wounded); upkeep now ${upkeep(era, s)} a day.`)
  return s
}

export const finaleName = (era: EraData): string => (era.finale.battle === 'guangzong' ? 'Guangzong' : era.finale.battle)

/** The aftermath stop after a won battle, at the same tier (RL-ROAD-2). */
export function openAftermath(era: EraData, s: RunState, aftermath: string, index: number, after: { stopId: string; choiceId: string }): void {
  arrive(era, s, aftermath, s.node[0], index + AFTERMATH_OFFSET, after)
}

/** No deployment can be paid for (fewer than 250 healthy men, or not 2 bags): the army scatters ([RL-SCATTER-1]). */
export function scatter(state: RunState, why: string): RunState {
  if (state.end) return state
  const s = clone(state)
  endRun(s, 'starved', why)
  return s
}
