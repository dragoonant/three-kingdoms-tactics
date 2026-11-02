// Deploy (RL-DEPLOY-*, RL-HUNGER-1), the battle's CreateOptions (run modifiers), the result (RL-LOSS-1, RL-FALL-1, RL-XP-1,
// RL-END-*) and the finale briefing (RL-CAL-1, RL-ECHO-2, RL-REN-7). Pure.
import { addXp, makeRecord, xpBreakdownFromLog, XP_SURVIVE } from '../campaign/progress'
import { carriedStratagems } from '../campaign/deploy'
import { GAME_DATA, getBattleDef, PLAYER_SIDE } from '../data'
import type { CreateOptions, DeployEntry, RunModifiers } from '../data/types'
import type { BattleState, GameEvent } from '../engine'
import { battleSeedFor, FINALE_INDEX, stopDef } from './era'
import {
  activeBand, applySimple, capOf, clone, commanderId, endRun, finishStop, flatEffects, log, nameOf, officerOf, openAftermath,
  passDays, round10, spirit, swayBonusFor, upkeep, upkeepFor, riceDaysFor, poolOf, finaleName,
} from './core'
import type { DayRow, EraData, RunState } from './types'

// ------------------------------------------------------------------ deploy

export interface DeployPick {
  id: string
  soldiers: number
}

/** Deploy slots for a battle: the era's slots, never more than the battle's player starts. */
export function deploySlots(era: EraData, battleId: string): number {
  const slots = era.battles[battleId]?.slots ?? 3
  const starts = getBattleDef(battleId)?.playerStarts?.length
  return starts ? Math.min(slots, starts) : slots
}

/** Officers who ride as the battle's own guests (e.g. Jian Yong in Zou Jing's column at Daxing Hill) cannot also be deployed (RL-DEPLOY-5). */
export const guestIds = (battleId: string): string[] => (getBattleDef(battleId)?.guests ?? []).map((g) => g.officer)

/** [RL-DEPLOY-5] Can this officer take the field in this battle? He must be in the game's officer table (new recruits wait
 * for their data) and not already on the field as one of the battle's guests. */
export const canField = (id: string, battleId = ''): boolean => !!GAME_DATA.officers[id] && !guestIds(battleId).includes(id)

export interface QiLine {
  cause: string
  /** Applies to one officer, or to all when absent. */
  officer?: string
  qi: number
  /** Not applied because the band is hungry. */
  ignored?: boolean
}

export interface BattleNote {
  text: string
  /** False when the engine has no field for it yet (shown, not applied). */
  engine: boolean
  echo?: boolean
}

export interface DeployCheck {
  ok: boolean
  reason: string | null
  slots: number
  fielded: number
  /** [RL-DEPLOY-3] bags this battle costs. */
  rice: number
  riceAfter: number
  /** [RL-UPKEEP-2] after the battle's rice, at the current pool. */
  lastsDays: number
  /** The battle day's upkeep (RL-DEPLOY-4). */
  dayUpkeep: number
  /** [RL-HUNGER-1] */
  hungry: boolean
  qi: QiLine[]
  /** Starting Qi bonus per deployed officer (before the battle's own start Qi); null when hungry (everyone starts at 0). */
  startQi: Record<string, number> | null
  notes: BattleNote[]
  caps: Record<string, number>
}

/** [RL-DEPLOY-1..3] [RL-HUNGER-1] Check a deployment and price it. Every number the deploy screen shows comes from here. */
export function checkDeploy(era: EraData, s: RunState, picks: DeployPick[]): DeployCheck {
  const battleId = s.pending?.battleId ?? ''
  const slots = deploySlots(era, battleId)
  const R = era.rules
  const cmd = commanderId(era)
  const caps: Record<string, number> = {}
  for (const o of activeBand(s)) caps[o.rec.officerId] = capOf(era, s, o.rec.officerId)
  const fielded = picks.reduce((a, p) => a + p.soldiers, 0)
  const rice = Math.ceil(fielded / R.battleRicePer)
  const riceAfter = s.rice - rice
  const pool = poolOf(s)
  const lastsDays = riceDaysFor(era, riceAfter, pool)
  const hungry = riceAfter < R.hungryDays * upkeepFor(era, pool)
  let reason: string | null = null
  const ids = picks.map((p) => p.id)
  if (!s.pending || (s.phase !== 'deploy' && s.phase !== 'finale')) reason = 'There is no battle to deploy for.'
  else if (!ids.includes(cmd)) reason = `${nameOf(era, cmd)} commands: he is always deployed.`
  else if (picks.length > slots) reason = `This field has ${slots} slots.`
  else if (new Set(ids).size !== ids.length) reason = 'An officer is listed twice.'
  else {
    for (const p of picks) {
      const o = officerOf(s, p.id)
      if (!o) reason = `${nameOf(era, p.id)} is not with the band.`
      else if (!canField(p.id, battleId)) reason = guestIds(battleId).includes(p.id) ? `${nameOf(era, p.id)} is already on this field with the allied column.` : `${nameOf(era, p.id)} cannot take the field yet.`
      else if (p.soldiers < R.minPerOfficer) reason = `${nameOf(era, p.id)} needs at least ${R.minPerOfficer} soldiers.`
      else if (p.soldiers % R.sliderStep !== 0) reason = `Soldiers go in steps of ${R.sliderStep}.`
      else if (p.soldiers > (caps[p.id] ?? 0)) reason = `${nameOf(era, p.id)} can command ${caps[p.id]} at most.`
      if (reason) break
    }
  }
  if (!reason && fielded > s.soldiers) reason = `Only ${s.soldiers} healthy soldiers can take the field.`
  if (!reason && riceAfter < 1) reason = `This battle costs ${rice} bags and would leave no rice: the army would scatter. Field fewer men.`

  // Qi lines (RL-REN-4, rests and echoes; RL-HUNGER-1 overrides them all)
  const qi: QiLine[] = []
  const sp = spirit(s.renown)
  if (sp) qi.push({ cause: `Renown ${s.renown} (${s.renown >= 70 ? '70+' : s.renown >= 40 ? '40+' : 'under 20'})`, qi: sp })
  for (const m of s.qiMods) qi.push(m.officer ? { cause: m.cause, officer: m.officer, qi: m.qi } : { cause: m.cause, qi: m.qi })
  let startQi: Record<string, number> | null = null
  if (hungry) {
    for (const l of qi) l.ignored = true
    qi.push({ cause: `Hungry: after this battle the rice lasts ${lastsDays} day${lastsDays === 1 ? '' : 's'}, so every officer starts at 0 Qi`, qi: 0 })
  } else {
    startQi = {}
    for (const id of ids) startQi[id] = qi.reduce((a, l) => a + (!l.officer || l.officer === id ? l.qi : 0), 0)
  }
  const notes: BattleNote[] = []
  if (s.flags.includes('forged-weapons')) notes.push({ text: era.flags['forged-weapons']?.text ?? 'Forged weapons: War +4.', engine: true })
  if (s.tired) notes.push({ text: 'Tired from the march: every unit has -1 move in round 1 (RL-MARCH-2).', engine: false })
  if (s.flags.includes('zhang-fei-sulks') && ids.includes('zhang-fei') && !s.fired.includes('zhang-fei-sulks'))
    notes.push({ text: era.flags['zhang-fei-sulks']!.text, engine: false, echo: true })
  if (s.pending && !s.pending.finale && s.pending.enemyScale !== 1) notes.push({ text: `Enemy troops x${s.pending.enemyScale} (the road's tier${s.nextBattleE ? ' and your raid' : ''}).`, engine: true })
  notes.push({ text: `Liu Bei's sway chance ${swayBonusFor(s.renown) >= 0 ? '+' : ''}${swayBonusFor(s.renown)} points (Renown ${s.renown}, RL-REN-6).`, engine: true })
  return { ok: reason === null, reason, slots, fielded, rice, riceAfter, lastsDays, dayUpkeep: upkeep(era, s), hungry, qi, startQi, notes, caps }
}

/** A sensible starting deployment: Liu Bei and the highest caps, the largest field (steps of 250 a head) that is not hungry. */
export function defaultDeploy(era: EraData, s: RunState): DeployPick[] {
  const battleId = s.pending?.battleId ?? ''
  const slots = deploySlots(era, battleId)
  const R = era.rules
  const cmd = commanderId(era)
  const ids = activeBand(s)
    .map((o) => o.rec.officerId)
    .filter((id) => canField(id, battleId))
    .sort((a, b) => (a === cmd ? -1 : b === cmd ? 1 : capOf(era, s, b) - capOf(era, s, a)))
    .slice(0, slots)
  // every officer who fits gets 250 first, then the rest is poured in order up to the caps
  const fill = (total: number): DeployPick[] => {
    const n = Math.max(1, Math.min(ids.length, Math.floor(total / R.minPerOfficer)))
    const out: DeployPick[] = ids.slice(0, n).map((id) => ({ id, soldiers: R.minPerOfficer }))
    let left = total - n * R.minPerOfficer
    for (const p of out) {
      const add = Math.max(0, Math.floor(Math.min(capOf(era, s, p.id) - p.soldiers, left) / R.sliderStep) * R.sliderStep)
      p.soldiers += add
      left -= add
    }
    return out
  }
  const maxField = Math.min(s.soldiers, ids.reduce((a, id) => a + capOf(era, s, id), 0))
  let best = fill(Math.min(R.minPerOfficer, maxField))
  for (let t = R.minPerOfficer; t <= maxField; t += 250) {
    const p = fill(t)
    const c = checkDeploy(era, s, p)
    if (c.ok && !c.hungry) best = p
  }
  const full = fill(maxField)
  const cf = checkDeploy(era, s, full)
  if (cf.ok && !cf.hungry) best = full
  return best.length ? best : [{ id: cmd, soldiers: R.minPerOfficer }]
}

/** [RL-DEPLOY-3] Seal the deployment: its rice is paid, the battle seed is fixed (RL-RNG-1). */
export function sealDeploy(era: EraData, state: RunState, picks: DeployPick[]): RunState {
  const c = checkDeploy(era, state, picks)
  if (!c.ok || !state.pending) return state
  const s = clone(state)
  const cmd = commanderId(era)
  const ordered = [...picks].sort((a, b) => (a.id === cmd ? -1 : b.id === cmd ? 1 : 0))
  s.rice -= c.rice
  s.deployment = { officers: ordered.map((p) => ({ id: p.id, soldiers: p.soldiers })), rice: c.rice, hungry: c.hungry, seed: battleSeedFor(s.seed, s.pending!.finale ? FINALE_INDEX : s.pending!.index) }
  if (c.notes.some((n) => n.echo)) {
    s.fired.push('zhang-fei-sulks')
    log(s, era.flags['zhang-fei-sulks']!.text, 'echo')
  }
  s.stats.battles += 1
  s.phase = 'battle'
  log(s, `${battleName(s.pending!.battleId)}: ${c.fielded} soldiers take the field for ${c.rice} bags${c.hungry ? ', hungry' : ''}.`, 'battle')
  return s
}

export const battleName = (id: string): string => getBattleDef(id)?.title ?? getBattleDef(id)?.name ?? id

// ------------------------------------------------------------------ battle options

/** The battle's CreateOptions from the sealed deployment: deploy entries (troops from the pool) and the run modifiers. */
export function battleOptions(era: EraData, s: RunState): CreateOptions {
  const dep = s.deployment
  if (!dep || !s.pending) return {}
  const forged = s.flags.includes('forged-weapons')
  const brothers = ['liu-bei', 'guan-yu', 'zhang-fei']
  const deploy: DeployEntry[] = []
  for (const p of dep.officers) {
    const o = officerOf(s, p.id)
    if (!o) continue
    const statBonus = { ...o.rec.statBonus }
    if (forged && brothers.includes(p.id)) statBonus.war += 4
    deploy.push({ officerId: p.id, level: o.rec.level, statBonus, maxTroops: p.soldiers, troops: p.soldiers, stratagems: carriedStratagems(o.rec) })
  }
  const run: RunModifiers = { swayBonus: swayBonusFor(s.renown) }
  if (dep.hungry) run.startQiAll = -2
  else {
    const all = spirit(s.renown) + s.qiMods.filter((m) => !m.officer).reduce((a, m) => a + m.qi, 0)
    if (all) run.startQiAll = all
    const per: Record<string, number> = {}
    for (const m of s.qiMods) if (m.officer && dep.officers.some((d) => d.id === m.officer)) per[m.officer] = (per[m.officer] ?? 0) + m.qi
    for (const k of Object.keys(per)) if (per[k] === 0) delete per[k]
    if (Object.keys(per).length) run.startQi = per
  }
  if (s.pending.finale) {
    const f = finaleBriefing(era, s)
    if (f.removeUnits.length) run.removeUnits = f.removeUnits
    if (f.enemyTroopScale !== 1) run.enemyTroopScale = f.enemyTroopScale
  } else if (s.pending.enemyScale !== 1) run.enemyTroopScale = s.pending.enemyScale
  return { deploy, run }
}

export function battleSeed(s: RunState): number {
  return s.deployment?.seed ?? 1
}

// ------------------------------------------------------------------ result

export interface BattleOutcome {
  won: boolean
  /** Liu Bei was routed (RL-END-2). */
  commanderRouted: boolean
  /** Soldiers lost per deployed officer (fielded - troops left; all of them if routed). */
  lost: Record<string, number>
  /** Non-commander officers routed (RL-FALL-1). */
  routed: string[]
  /** XP gained per officer, with its breakdown. */
  xp: Record<string, { gained: number; parts: { attacks: number; stratagems: number; routs: number; sways: number; survived: number } }>
  /** Officers who join by the battle itself (a swayed recruitable officer). */
  recruits: string[]
}

export interface RunBattleReport {
  battleId: string
  won: boolean
  finale: boolean
  fielded: number
  lost: number
  killed: number
  wounded: number
  rice: number
  officers: { id: string; fielded: number; lost: number; xp: number; levelFrom: number; levelTo: number; mark: 'none' | 'wounded' | 'fallen' }[]
  recruits: string[]
  spoils: string[]
  end: RunState['end']
}

/** Read the engine's final state and log into an outcome (pure; never edits the battle state). */
export function outcomeOf(era: EraData, s: RunState, final: BattleState, events: GameEvent[]): BattleOutcome {
  const dep = s.deployment
  const won = final.result?.winner === PLAYER_SIDE
  const cmd = commanderId(era)
  const lost: Record<string, number> = {}
  const routed: string[] = []
  const ids = new Set((dep?.officers ?? []).map((d) => d.id))
  for (const d of dep?.officers ?? []) {
    const u = final.units.find((x) => x.id === d.id && x.side === PLAYER_SIDE)
    if (u) lost[d.id] = Math.max(0, d.soldiers - u.troops)
    else if (final.defeated.includes(d.id)) {
      lost[d.id] = d.soldiers
      if (d.id !== cmd) routed.push(d.id)
    } else lost[d.id] = 0 // escaped or retreated off the board: counted whole
  }
  const parts = xpBreakdownFromLog(events, PLAYER_SIDE, (id) => (ids.has(id) ? PLAYER_SIDE : undefined))
  const xp: BattleOutcome['xp'] = {}
  for (const id of ids) {
    const p = parts[id] ?? { attacks: 0, stratagems: 0, routs: 0, sways: 0 }
    const survived = final.defeated.includes(id) ? 0 : XP_SURVIVE
    xp[id] = { gained: p.attacks + p.stratagems + p.routs + p.sways + survived, parts: { ...p, survived } }
  }
  const recruits: string[] = []
  for (const e of events) {
    if (e.kind !== 'swayed' || e.side !== PLAYER_SIDE) continue
    const unit = final.units.find((u) => u.id === e.target && u.side === PLAYER_SIDE)
    const off = unit ? GAME_DATA.officers[unit.officer] : undefined
    if (!unit || !off?.recruitable || off.invented) continue
    if (s.band.some((b) => b.rec.officerId === off.id) || recruits.includes(off.id)) continue
    recruits.push(off.id)
  }
  return { won, commanderRouted: final.defeated.includes(cmd), lost, routed, xp, recruits }
}

/** [RL-LOSS-1] [RL-FALL-1] [RL-XP-1] [RL-END-1] [RL-END-2] Fold a battle outcome into the run. */
export function applyOutcome(era: EraData, state: RunState, o: BattleOutcome): { state: RunState; report: RunBattleReport } {
  const s = clone(state)
  const pend = s.pending!
  const dep = s.deployment ?? { officers: [], rice: 0, hungry: false, seed: 1 }
  const fielded = dep.officers.reduce((a, d) => a + d.soldiers, 0)
  const lostTotal = Math.min(s.soldiers, Object.values(o.lost).reduce((a, b) => a + b, 0))
  const killed = Math.min(lostTotal, round10(lostTotal * era.rules.killedShare))
  const report: RunBattleReport = {
    battleId: pend.battleId, won: o.won, finale: !!pend.finale, fielded, lost: lostTotal, killed, wounded: lostTotal - killed, rice: dep.rice,
    officers: [], recruits: [], spoils: [], end: null,
  }
  const name = battleName(pend.battleId)
  if (!o.won) {
    s.soldiers -= lostTotal
    s.wounded += lostTotal - killed
    s.stats.killed += killed
    s.deployment = null
    if (o.commanderRouted) endRun(s, 'routed', `${name}: Liu Bei is routed, and the band breaks.`)
    else endRun(s, 'defeated', `${name} is lost, and the band breaks.`)
    report.end = s.end
    for (const d of dep.officers) report.officers.push({ id: d.id, fielded: d.soldiers, lost: o.lost[d.id] ?? 0, xp: 0, levelFrom: officerOf(s, d.id)?.rec.level ?? 1, levelTo: officerOf(s, d.id)?.rec.level ?? 1, mark: 'none' })
    return { state: s, report }
  }
  s.soldiers -= lostTotal
  s.wounded += lostTotal - killed
  s.stats.killed += killed
  s.stats.wounded += lostTotal - killed
  s.stats.battlesWon += 1
  for (const d of dep.officers) {
    const ob = officerOf(s, d.id)
    if (!ob) continue
    const from = ob.rec.level
    const x = o.xp[d.id]?.gained ?? 0
    ob.rec = addXp(ob.rec, x).rec
    let mark: 'none' | 'wounded' | 'fallen' = 'none'
    if (o.routed.includes(d.id)) {
      if (s.ironOath || ob.rec.wounded) {
        ob.rec = { ...ob.rec, status: 'fallen' }
        s.stats.fell.push(d.id)
        mark = 'fallen'
        log(s, `${nameOf(era, d.id)} falls at ${name}.`, 'bad')
      } else {
        ob.rec = { ...ob.rec, wounded: true }
        ob.hurt = true
        mark = 'wounded'
        log(s, `${nameOf(era, d.id)} is routed and wounded: a second rout and he falls.`, 'bad')
      }
    }
    report.officers.push({ id: d.id, fielded: d.soldiers, lost: o.lost[d.id] ?? 0, xp: x, levelFrom: from, levelTo: ob.rec.level, mark })
  }
  for (const id of o.recruits) {
    if (s.band.some((b) => b.rec.officerId === id)) continue
    s.band.push({ rec: makeRecord(id, era.officers[id]?.joinLevel ?? 2), hurt: false, capBonus: 0 })
    report.recruits.push(id)
    log(s, `${nameOf(era, id)} is won over and joins the band.`, 'good')
  }
  log(s, `${name} is won: ${lostTotal} men lost (${killed} killed, ${lostTotal - killed} wounded).`, 'battle')
  s.tired = false
  s.tiredFresh = false
  s.qiMods = []
  s.nextBattleE = 0
  s.deployment = null
  if (pend.finale) {
    endRun(s, 'won', `${finaleName(era)} falls on day ${s.day}. The rising is broken, and the brothers' names are written in the annals.`)
    report.end = s.end
    return { state: s, report }
  }
  passDays(era, s, era.rules.battleDays)
  if (s.end) {
    report.end = s.end
    return { state: s, report }
  }
  const stop = stopDef(era, pend.stopId)
  const win = flatEffects(s, pend.win)
  const before = new Set(s.band.map((b) => b.rec.officerId))
  report.spoils = applySimple(era, s, win, `${stop.title}: victory`)
  for (const b of s.band) if (!before.has(b.rec.officerId)) report.recruits.push(b.rec.officerId)
  if (report.spoils.length) log(s, `Spoils: ${report.spoils.join(', ')}.`, 'good')
  s.pending = null
  if (s.end) {
    report.end = s.end
    return { state: s, report }
  }
  if (pend.aftermath) openAftermath(era, s, pend.aftermath, pend.index, { stopId: pend.stopId, choiceId: pend.choiceId })
  else finishStop(era, s, pend.stopId, pend.choiceId)
  report.end = s.end
  return { state: s, report }
}

/** The battle is over: read the engine's result and fold it in. */
export function applyBattle(era: EraData, s: RunState, final: BattleState, events: GameEvent[]): { state: RunState; report: RunBattleReport } {
  return applyOutcome(era, s, outcomeOf(era, s, final, events))
}

// ------------------------------------------------------------------ finale

export interface FinaleLine {
  kind: 'day' | 'echo' | 'renown' | 'spirit'
  text: string
  /** False when the engine has no modifier for it yet (RL2): shown, not applied. */
  engine: boolean
}

export interface FinaleBriefing {
  day: number
  effectiveDay: number
  row: DayRow
  lines: FinaleLine[]
  removeUnits: string[]
  enemyTroopScale: number
}

/** [RL-CAL-1] The finale's day bracket for an arrival day (stockade-burned counts 4 days earlier). */
export function dayRow(era: EraData, s: RunState, day = s.day): { row: DayRow; effectiveDay: number } {
  let shift = 0
  for (const f of s.flags) shift += era.flags[f]?.effect.dayShift ?? 0
  const effectiveDay = day + shift
  const row = era.finale.dayTable.find((r) => effectiveDay <= r.maxDay) ?? era.finale.dayTable[era.finale.dayTable.length - 1]!
  return { row, effectiveDay }
}

/** What each era-1 finale line changes in the engine today (spec 16 section 6); `engine: false` lines wait for RL2. */
const DAY_REMOVE: Record<string, string[]> = { 'very early': ['gz-bowman-a', 'gz-bowman-b'], early: ['gz-bowman-a'] }
const DAY_ENGINE: Record<string, boolean> = { 'very early': false, early: false, 'on time': true, late: false, 'very late': false, 'too late': false }
const FLAG_REMOVE: Record<string, string[]> = { 'granary-burned': ['gz-vanguard-b', 'gz-horse'] }
const FLAG_ENGINE: Record<string, boolean> = { 'granary-burned': true, 'stockade-burned': true }

/** [RL-ECHO-2] [RL-REN-7] Every finale line with its cause, in order: day bracket, echoes, Renown, spirit. */
export function finaleBriefing(era: EraData, s: RunState): FinaleBriefing {
  const { row, effectiveDay } = dayRow(era, s)
  const lines: FinaleLine[] = []
  const removeUnits: string[] = []
  let scale = 1
  lines.push({ kind: 'day', text: row.text.replace('{day}', String(s.day)) + (effectiveDay !== s.day ? ` (it counts as day ${effectiveDay})` : ''), engine: DAY_ENGINE[row.label] ?? false })
  removeUnits.push(...(DAY_REMOVE[row.label] ?? []))
  for (const f of s.flags) {
    const fd = era.flags[f]
    if (!fd || !(fd.pays === 'finale')) continue
    const engine = FLAG_ENGINE[f] ?? f === 'no-quarter'
    lines.push({ kind: 'echo', text: fd.text, engine })
    removeUnits.push(...(FLAG_REMOVE[f] ?? []))
    if (f === 'no-quarter') scale *= 1.05
  }
  for (const r of era.finale.renown) {
    if ((r.gte !== undefined && s.renown >= r.gte) || (r.lt !== undefined && s.renown < r.lt)) {
      const under = r.lt !== undefined
      lines.push({ kind: 'renown', text: r.text.replace('{renown}', String(s.renown)), engine: under })
      if (under) removeUnits.push('gz-imperial-bows')
    }
  }
  const sb = swayBonusFor(s.renown)
  lines.push({ kind: 'renown', text: `Renown ${s.renown}: Liu Bei's sway chance ${sb >= 0 ? '+' : ''}${sb} points.`, engine: true })
  const sp = spirit(s.renown)
  if (sp) lines.push({ kind: 'spirit', text: `Renown ${s.renown}: every officer starts with ${sp > 0 ? '+' : ''}${sp} Qi.`, engine: true })
  return { day: s.day, effectiveDay, row, lines, removeUnits: [...new Set(removeUnits)], enemyTroopScale: Math.round(scale * 1000) / 1000 }
}

/** From the finale briefing to its deploy screen. */
export function toFinaleDeploy(era: EraData, state: RunState): RunState {
  if (state.phase !== 'finale') return state
  const s = clone(state)
  s.phase = 'deploy'
  for (const f of s.flags) if (era.flags[f]?.pays === 'finale' && !s.fired.includes(f)) s.fired.push(f)
  return s
}
