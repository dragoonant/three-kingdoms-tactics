// Paper sim for the roguelike "Roads to War", era 1 (docs/spec/16-roguelike-era1.md, rules RL-* in docs/spec/10-rules.md).
// It runs on the game's own run layer (src/run, via tsx), so the sim and the game share one implementation of the road,
// the economy, the stops, the gambles, the market, the march, deploy and the result. Data: src/data/eras/era1.json.
//
//   npx tsx tools/roguelike/paper-sim.mjs [--seeds 500] [--first 1] [--md] [--narrate <seed>] [--policies a,b]
//
// It draws a road per seed (RL-ROAD-*) and plays it with four simple policies: benevolent, ruthless, balanced and
// greedy-fighter. BATTLES ARE NOT PLAYED: the battle outcome comes from the placeholder model below and is folded in with
// src/run's applyOutcome, exactly as a real battle's result is. It stands in for the RL4 run bench, which will play every
// battle with the real engine and the utility AI.
//
// PLACEHOLDER BATTLE MODEL (docs/spec/16-roguelike-era1-sim.md section 1; constants in MODEL below):
//   S = sum over fielded officers of soldiers_i * q_i * forged_i * (1 + 0.04 * qiMod_i) * (tired ? 0.93 : 1) * (1 + sulk) + guests
//   E = battle.E * the battle's enemy scale (tier scale x pre-battle modifiers; finale: day-table mult * (1 + echo and Renown deltas))
//   r = S / E;  P(win) = 1 / (1 + exp(-6 (r - 0.8)))
//   on a win: soldiers lost = fielded * clamp(0.22 / r, 0.06, 0.45), half killed and half wounded (RL-LOSS-1);
//             each fielded non-commander officer is routed with chance clamp(0.10 / r, 0.02, 0.25) (RL-FALL-1);
//             every fielded officer gains 100 XP, one level (command cap +100; stands in for the campaign XP of RL-XP-1).
//   on a loss: the run ends (RL-END-1).
// qiMod: Renown spirit (RL-REN-4) + rest bonus + per-officer echoes; hungry (RL-HUNGER-1) sets it to -2 for everyone.
// The policies are simple utility scorers (POLICIES below). They see every printed number and stated odds, never a hidden echo.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import * as RUN from '../../src/run/index.ts'

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const DATA = RUN.ERA1
const R = DATA.rules
const STOPS = RUN.stopsOf(DATA)
const { stream, P_FATE } = RUN
export const drawRoad = (seed) => RUN.drawRoad(DATA, seed)

// ---------- views of the run state ----------
const capOf = (st, id) => RUN.capOf(DATA, st, id)
const pool = (st) => st.soldiers + st.wounded
const upkeep = (st) => RUN.upkeep(DATA, st)
const riceDays = (st) => RUN.riceDays(DATA, st)
const spirit = (st) => RUN.spirit(st.renown)
const inBand = (st, id) => !!RUN.officerOf(st, id)
const bandIds = (st) => RUN.activeBand(st).map((o) => o.rec.officerId)
const flatEffects = (st, e) => RUN.flatEffects(st, e)
const riceOf = (st, e) => RUN.riceOf(DATA, st, e)
const qiAll = (st) => st.qiMods.filter((m) => !m.officer).reduce((a, m) => a + m.qi, 0)
const qiOf = (st, id) => st.qiMods.filter((m) => m.officer === id).reduce((a, m) => a + m.qi, 0)
const sulkOf = (st) => (st.flags.includes('zhang-fei-sulks') && !st.fired.includes('zhang-fei-sulks') ? DATA.flags['zhang-fei-sulks'].effect.nextBattleS : 0)
function log(st, text) {
  st.simLog.push(`day ${String(st.day).padStart(2)} | rice ${String(st.rice).padStart(3)} (${String(riceDays(st)).padStart(2)}d) | men ${st.soldiers}+${st.wounded}w | renown ${st.renown} | ${text}`)
}
/** Carry the sim's own bookkeeping across the run layer's immutable steps. */
function step(st, next) {
  next.simLog = st.simLog
  return next
}

// ---------- battles (placeholder model) ----------
function finaleSetup(st) {
  const f = DATA.finale
  const { row, effectiveDay } = RUN.dayRow(DATA, st)
  const lines = []
  let eDelta = 0
  let g = DATA.battles[f.battle].guests
  lines.push(row.text.replace('{day}', st.day) + (effectiveDay !== st.day ? ` (counts as day ${effectiveDay})` : ''))
  for (const fl of st.flags) {
    const ef = DATA.flags[fl]?.effect || {}
    if (ef.E) eDelta += ef.E
    if (ef.G) g += ef.G
    if (ef.E || ef.G || ef.dayShift) lines.push(DATA.flags[fl].text)
  }
  for (const rr of f.renown) {
    if ((rr.gte !== undefined && st.renown >= rr.gte) || (rr.lt !== undefined && st.renown < rr.lt)) {
      if (rr.E) eDelta += rr.E
      if (rr.G) g += rr.G
      lines.push(rr.text.replace('{renown}', st.renown))
    }
  }
  return { E: DATA.battles[f.battle].E * row.E * (1 + eDelta), G: g, row, lines }
}
function officersFor(st, slots) {
  const ids = bandIds(st).sort((a, b) => {
    if (DATA.officers[a].commander) return -1
    if (DATA.officers[b].commander) return 1
    return DATA.officers[b].q - DATA.officers[a].q
  })
  return ids.slice(0, slots)
}
function strength(st, alloc, guests, hungry) {
  let s = 0
  const base = spirit(st) + qiAll(st)
  for (const [id, n] of Object.entries(alloc)) {
    const m = hungry ? -2 : base + qiOf(st, id)
    const forged = st.flags.includes('forged-weapons') && ['liu-bei', 'guan-yu', 'zhang-fei'].includes(id) ? 1.04 : 1
    s += n * DATA.officers[id].q * forged * (1 + 0.04 * m)
  }
  if (st.tired) s *= 0.93
  s *= 1 + sulkOf(st)
  return s + guests
}
const MODEL = { slope: 6, mid: 0.8, loss: 0.22, lossMin: 0.06, lossMax: 0.45, rout: 0.1 }
const pWin = (r) => 1 / (1 + Math.exp(-MODEL.slope * (r - MODEL.mid)))
const lossFracOf = (r) => Math.min(MODEL.lossMax, Math.max(MODEL.lossMin, MODEL.loss / r))
/** Fill officers in order up to their caps with `total` soldiers (RL-DEPLOY-1/2). */
function allocate(st, ids, total) {
  const alloc = {}
  let left = total
  for (const id of ids) {
    const n = Math.min(capOf(st, id), Math.max(R.minPerOfficer, left))
    if (left < R.minPerOfficer) break
    alloc[id] = Math.floor(n / R.sliderStep) * R.sliderStep
    left -= alloc[id]
  }
  return alloc
}
function evalDeploy(st, ids, total, E, guests) {
  const alloc = allocate(st, ids, total)
  const picks = Object.entries(alloc).map(([id, soldiers]) => ({ id, soldiers }))
  const chk = RUN.checkDeploy(DATA, st, picks) // RL-DEPLOY-3, RL-HUNGER-1 from the run layer
  const S = strength(st, alloc, guests, chk.hungry)
  const r = S / E
  // the allocation is valid by construction; the model may field the era's 5 finale slots before the battle has its fifth start
  const ok = chk.riceAfter >= 1 && chk.fielded <= st.soldiers
  return { alloc, picks, fielded: chk.fielded, cost: chk.rice, after: chk.riceAfter, hungry: chk.hungry, ok, S, r, p: pWin(r) }
}
function chooseDeploy(st, pol, E, guests, slots, finale) {
  const ids = officersFor(st, slots)
  const maxField = Math.min(st.soldiers, ids.reduce((a, id) => a + capOf(st, id), 0))
  const opts = []
  for (let t = R.minPerOfficer; t <= maxField; t += 250) {
    const ev = evalDeploy(st, ids, t, E, guests)
    if (ev.ok) opts.push(ev)
  }
  if (maxField >= R.minPerOfficer) {
    const ev = evalDeploy(st, ids, maxField, E, guests)
    if (ev.ok) opts.push(ev)
  }
  if (!opts.length) return null
  if (finale) return opts.reduce((a, b) => (b.p > a.p + 1e-9 ? b : a))
  const ok = opts.filter((o) => o.p >= pol.targetP && !o.hungry && o.after >= (pol.reserveDays + 1) * upkeep(st))
  if (ok.length) return ok[0]
  return opts.reduce((a, b) => (b.p - (b.hungry ? 0.02 : 0) > a.p - (a.hungry ? 0.02 : 0) ? b : a))
}
/** A road battle: deploy and seal through the run layer, roll the model, fold the outcome in with applyOutcome. */
function fight(st, pol, rng, label) {
  const pend = st.pending
  const bd = DATA.battles[pend.battleId]
  const E = bd.E * pend.enemyScale
  const dep = chooseDeploy(st, pol, E, bd.guests, RUN.deploySlots(DATA, pend.battleId), false)
  if (!dep) {
    log(st, `${label}: not enough rice to field a single company: the army scatters`)
    return step(st, RUN.scatter(st, 'Not enough rice to field a single company.'))
  }
  st = step(st, RUN.sealDeploy(DATA, st, dep.picks))
  const won = rng() < dep.p
  const head = `${label} [${pend.battleId}]: field ${dep.fielded} (rice -${dep.cost}${dep.hungry ? ', HUNGRY' : ''}) vs E ${Math.round(E)}, odds ${(dep.p * 100).toFixed(0)}%`
  const cmd = RUN.commanderId(DATA)
  const lost = won ? Math.round((dep.fielded * lossFracOf(dep.r)) / 10) * 10 : 0
  const routed = []
  if (won) for (const id of Object.keys(dep.alloc)) if (id !== cmd && rng() < Math.min(0.25, Math.max(0.02, MODEL.rout / dep.r))) routed.push(id)
  const xp = Object.fromEntries(Object.keys(dep.alloc).map((id) => [id, { gained: 100, parts: { attacks: 0, stratagems: 0, routs: 0, sways: 0, survived: 0 } }]))
  const r = RUN.applyOutcome(DATA, st, { won, commanderRouted: false, lost: { [cmd]: lost }, routed, xp, recruits: [] })
  const marks = r.report.officers.filter((o) => o.mark !== 'none').map((o) => `${DATA.officers[o.id].name} ${o.mark === 'fallen' ? 'FALLS' : 'routed (wounded)'}`)
  log(st, won ? `${head}: won, -${r.report.lost} men (${r.report.killed} killed)${marks.length ? ', ' + marks.join(', ') : ''}${r.report.spoils.length ? '; spoils ' + r.report.spoils.join(', ') : ''}` : `${head}: DEFEAT, the run ends`)
  return step(st, r.state)
}

// ---------- policies ----------
const POLICIES = {
  // wRice per bag, wSold per 100 soldiers, wRen per Renown point (negatives x renNeg), dayExtra = the policy's guess at what a
  // day costs at Guangzong, risk = aversion to a gamble's spread, targetP = the odds it wants before a road battle.
  benevolent: { name: 'benevolent', wRice: 1.0, wSold: 3.0, wRen: 2.2, renNeg: 1.5, dayExtra: 3, risk: 0.35, targetP: 0.95, reserveDays: 4, campAt: 0.18, restBias: 12, march: false, mountain: false, dismissDays: 2, battleBias: 6, hireKeepDays: 14 },
  ruthless: { name: 'ruthless', wRice: 1.6, wSold: 2.6, wRen: 0.0, renNeg: 1, dayExtra: 7, risk: 0, targetP: 0.95, reserveDays: 3, campAt: 0.35, march: true, mountain: true, dismissDays: 2, battleBias: 0, hireKeepDays: 8 },
  balanced: { name: 'balanced', wRice: 1.2, wSold: 3.0, wRen: 0.9, renNeg: 1.2, dayExtra: 4, risk: 0.15, targetP: 0.95, reserveDays: 4, campAt: 0.25, restBias: 3, march: 'late', mountain: 'hungry', dismissDays: 2, battleBias: 2, hireKeepDays: 11 },
  'greedy-fighter': { name: 'greedy-fighter', wRice: 0.6, wSold: 3.0, wRen: 0.5, renNeg: 1, dayExtra: 2, risk: 0, targetP: 0.97, reserveDays: 0, campAt: 0.45, march: false, mountain: false, dismissDays: 0, battleBias: 1000, careless: true, hireKeepDays: 12 },
}
function riceWeight(st, pol) {
  if (pol.careless) return pol.wRice * (1 + Math.max(0, 3 - riceDays(st)) / 2)
  return pol.wRice * (1 + Math.max(0, 7 - riceDays(st)) / 2)
}
const FINALE_VALUE = 150
const LOSS_PENALTY = 200
function utilSimple(st, pol, e) {
  let u = 0
  u += riceWeight(st, pol) * riceOf(st, e)
  u += (pol.wSold * (e.soldiers || 0)) / 100
  if (e.casualties) {
    const n = e.casualties.n ?? e.casualties.pct * st.soldiers
    u -= (pol.wSold * n * (0.5 + 0.5 * (e.casualties.killed ?? R.killedShare))) / 100
  }
  const ren = e.renown || 0
  u += pol.wRen * ren * (ren < 0 ? pol.renNeg : 1)
  const days = (e.days || 0) + (e.slowLegs ? e.slowLegs.legs * e.slowLegs.days : 0) + (e.nextLegDays || 0)
  u -= days * (riceWeight(st, pol) * upkeep(st) + pol.dayExtra)
  for (const f of e.flags || []) {
    const fd = DATA.flags[f]
    if (!fd || !fd.visible) continue
    if (fd.effect.E) u -= fd.effect.E * FINALE_VALUE
    if (fd.effect.G) u += (fd.effect.G / 8000) * FINALE_VALUE
    if (fd.effect.dayShift) u += 2 * -fd.effect.dayShift
    if (f === 'outlaw') u -= 4
    if (f === 'forged-weapons') u += 8
  }
  if (e.recruit && !inBand(st, e.recruit)) u += 14
  for (const v of Object.values(e.capBonus || {})) u += v / 100
  u += 3 * (e.qiNext || 0)
  for (const v of Object.values(e.qiNextOfficer || {})) u += 1.5 * v
  if (e.tired) u -= 6
  if (e.nextBattleE) u -= e.nextBattleE * 60
  if (e.woundOfficer && inBand(st, e.woundOfficer)) u -= 6
  if (e.rest) u += (pol.restBias || 0) + (pol.wSold * st.wounded) / 100 + (st.tired ? 4 : 0) + 2 * RUN.activeBand(st).filter((b) => b.hurt).length
  if (e.healWounded === 'half') u += (pol.wSold * st.wounded) / 200
  if (pol.name === 'benevolent' && (e.renown || 0) >= 8) u += 6
  return u
}
function utilChoice(st, pol, stop, ch, tier) {
  const e = flatEffects(st, ch.effects)
  if (!RUN.choicePayable(DATA, st, ch.effects).ok) return null // RL-CHOICE-2
  let u = utilSimple(st, pol, e)
  const ren = Math.max(0, Math.min(100, st.renown + (e.renown || 0)))
  u += (pol.wSold * RUN.volunteersFor(DATA, stop, e, ren)) / 100
  u += riceWeight(st, pol) * RUN.giftFor(DATA, stop, e, ren)
  if (e.gamble) {
    const g = e.gamble
    const uw = utilSimple(st, pol, flatEffects(st, g.win))
    const ul = utilSimple(st, pol, flatEffects(st, g.lose))
    u += g.odds * uw + (1 - g.odds) * ul - pol.risk * Math.abs(uw - ul) * Math.sqrt(g.odds * (1 - g.odds))
  }
  if (!pol.careless) {
    const days = (e.days || 0) + (e.battle ? R.battleDays : 0)
    const gr = e.gamble ? e.gamble.odds * riceOf(st, flatEffects(st, e.gamble.win)) + (1 - e.gamble.odds) * riceOf(st, flatEffects(st, e.gamble.lose)) : 0
    const after = st.rice + riceOf(st, e) + gr - days * upkeep(st)
    const short = 4 - after / Math.max(1, upkeep(st))
    if (short > 0) u -= 15 * short
  }
  if (e.battle) {
    const bd = DATA.battles[e.battle.id]
    const scale = (DATA.road.tierScale[Math.min(tier, DATA.road.tierScale.length - 1)] ?? 1) * (1 + st.nextBattleE)
    const dep = chooseDeploy({ ...st, pending: { battleId: e.battle.id, finale: false }, phase: 'deploy' }, pol, bd.E * scale, bd.guests, RUN.deploySlots(DATA, e.battle.id), false)
    if (!dep) return pol.careless ? 1e6 : -1e6
    const winU = utilSimple(st, pol, flatEffects(st, e.battle.win)) - (pol.wSold * dep.fielded * lossFracOf(dep.r) * 0.75) / 100
    u += dep.p * winU - (1 - dep.p) * LOSS_PENALTY - riceWeight(st, pol) * dep.cost - (riceWeight(st, pol) * upkeep(st) + pol.dayExtra) * R.battleDays
    u += pol.battleBias
    if (e.battle.aftermath) u += 3
  }
  if (pol.name === 'greedy-fighter' && (e.gamble || e.battle)) u += e.battle ? 0 : 3
  return u
}
function chooseChoice(st, pol, stop, tier) {
  let best = null
  for (const ch of stop.choices) {
    const u = utilChoice(st, pol, stop, ch, tier)
    if (u === null) continue
    if (!best || u > best.u) best = { ch, u }
  }
  return best ? best.ch : null
}

/** Play the stop the band stands at (and an aftermath, a battle and the market) through the run layer. */
function playStop(st, pol) {
  while (!st.end && (st.phase === 'stop' || st.phase === 'deploy' || st.phase === 'market')) {
    if (st.phase === 'stop') {
      const stop = STOPS[st.stop.id]
      const ch = chooseChoice(st, pol, stop, st.stop.tier)
      if (!ch) return step(st, RUN.scatter(st, `${stop.title}: no choice can be paid for.`))
      const idx = st.stop.index
      const before = st.annals.length
      st = step(st, RUN.choose(DATA, st, ch.id))
      for (const a of st.annals.slice(before)) log(st, a.text)
      if (st.phase === 'deploy') {
        const rng = stream(st.seed, P_FATE, idx)
        if (flatEffects(st, ch.effects).gamble) rng() // the gamble's draw came first (RL-RNG-1)
        st = fight(st, pol, rng, stop.title)
      }
    } else if (st.phase === 'market') hire(st, pol) && (st = step(st, RUN.hireLevies(DATA, st, st.simHire)))
    else return st
  }
  return st
}

/** RL-POOL-5: at a market stop, rice buys paid levies (price by Renown, RL-REN-2), up to marketMax men. */
function hire(st, pol) {
  let n = 0
  while (n < R.marketMax) {
    const next = n + 100
    const after = st.rice - RUN.levyCost(DATA, st.renown, next)
    const u = Math.ceil((pool(st) + next) / R.upkeepPer)
    if (after < pol.hireKeepDays * u) break
    n = next
  }
  st.simHire = n
  if (n > 0) log(st, `  market: hire ${n} levies for ${RUN.levyCost(DATA, st.renown, n)} rice (${RUN.levyPrice(DATA, st.renown)} per 100)`)
  return true
}

// between stops: send men home, make camp (RL-POOL-4, RL-REST-2)
function between(st, pol, nextDays) {
  if (pol.dismissDays >= 0) {
    const need = nextDays + pol.dismissDays
    if (riceDays(st) < need) {
      const keep = Math.max(0, Math.floor(st.rice / (need + 1)) * R.upkeepPer)
      let excess = pool(st) - keep
      if (excess > 0) {
        const w = Math.min(excess, st.wounded)
        excess -= w
        const h = Math.max(0, Math.min(excess, st.soldiers - 1500))
        if (w + h > 0) {
          st = step(st, RUN.sendHome(DATA, st, h, w))
          log(st, `send ${w} wounded and ${h} men home to stretch the rice`)
        }
      }
    }
  }
  const woundedShare = pool(st) ? st.wounded / pool(st) : 0
  if (woundedShare >= pol.campAt && riceDays(st) > nextDays + R.makeCampDays + 3) {
    log(st, 'make camp for 2 days')
    st = step(st, RUN.makeCamp(DATA, st))
  }
  return st
}

function stopValue(st, pol, stopId, tier) {
  const stop = STOPS[stopId]
  let best = -1e9
  for (const ch of stop.choices) {
    const u = utilChoice(st, pol, stop, ch, tier)
    if (u !== null && u > best) best = u
  }
  if (pol.name === 'greedy-fighter' && RUN.hasBattleChoice(stop)) best += 1000
  return best
}

export function playRun(seed, polName, narrate = false) {
  const pol = POLICIES[polName]
  let st = RUN.newRun(seed, false, DATA)
  st.simLog = []
  st = step(st, RUN.beginRoad(DATA, st))
  st = playStop(st, pol)
  while (!st.end && st.phase === 'road') {
    let opts = RUN.legOptions(DATA, st)
    if (opts[0]?.target === 'finale') {
      st = between(st, pol, opts[0].days)
      if (st.end) break
      st = step(st, RUN.travel(DATA, st, 'finale', false))
      break
    }
    const useMountain = pol.mountain === true || (pol.mountain === 'hungry' && riceDays(st) < 6)
    const pref = opts.filter((o) => (useMountain ? o.kind === 'mountain' : o.kind !== 'mountain'))
    if (pref.length) opts = pref
    let best = null
    for (const o of opts) {
      const v = stopValue(st, pol, o.stopId, RUN.edgesFrom(st.road, st.node)[o.target].to[0]) - o.days * (upkeep(st) + pol.dayExtra)
      if (!best || v > best.v) best = { o, v }
    }
    const o = best.o
    const to = RUN.edgesFrom(st.road, st.node)[o.target].to
    const behind = st.day > 2.3 * (to[0] + 1)
    const march = o.canMarch && (pol.march === true || (pol.march === 'late' && behind))
    st = between(st, pol, o.days)
    if (st.end) break
    const before = st.annals.length
    st = step(st, RUN.travel(DATA, st, o.target, march))
    for (const a of st.annals.slice(before)) log(st, a.text)
    st = playStop(st, pol)
  }
  let result = { seed, policy: polName, end: st.end?.kind ?? null, day: st.day, renown: st.renown, battles: st.stats.battles, picks: st.picks }
  if (!st.end && st.phase === 'finale') {
    const fs = finaleSetup(st)
    const arrive = { rice: st.rice, riceDays: riceDays(st), soldiers: st.soldiers, wounded: st.wounded }
    log(st, `ARRIVE AT GUANGZONG: ${fs.lines.join(' / ')}`)
    st = step(st, RUN.toFinaleDeploy(DATA, st))
    const slots = RUN.deploySlots(DATA, DATA.finale.battle)
    const slotsModel = DATA.battles.guangzong.slots // the sim fields the era's 5 slots (RL1b adds the fifth start)
    let dep = chooseDeploy(st, pol, fs.E, fs.G, Math.max(slots, slotsModel), true)
    if (!pol.careless && st.wounded > 0) {
      const w = st.wounded
      const alt0 = step(st, RUN.sendHome(DATA, st, 0, w))
      const alt = chooseDeploy(alt0, pol, fs.E, fs.G, Math.max(slots, slotsModel), true)
      if (alt && (!dep || alt.p > dep.p + 0.005)) {
        st = alt0
        dep = alt
        log(st, `send ${w} wounded home before the battle (upkeep -> ${upkeep(st)})`)
      }
    }
    if (!dep) {
      st = step(st, RUN.scatter(st, 'No rice to field the army at Guangzong.'))
      log(st, 'no rice to field the army at Guangzong: scattered')
      result.end = 'starved'
    } else {
      const won = stream(seed, P_FATE, RUN.FINALE_INDEX)() < dep.p
      log(st, `GUANGZONG: field ${dep.fielded} + guests ${fs.G} (rice -${dep.cost}${dep.hungry ? ', HUNGRY' : ''}) vs E ${Math.round(fs.E)}, odds ${(dep.p * 100).toFixed(0)}% -> ${won ? 'VICTORY' : 'DEFEAT'}`)
      result.end = won ? 'won' : 'lost-finale'
      result.fielded = dep.fielded
      result.finaleOdds = dep.p
      result.hungryFinale = dep.hungry
    }
    result = { ...result, ...arrive, reached: true, bracket: fs.row.label }
  } else if (st.end) {
    result.end = st.end.kind === 'defeated' || st.end.kind === 'routed' ? 'defeated' : st.end.kind
  }
  result.renown = st.renown
  result.killed = st.stats.killed
  result.fell = st.stats.fell
  result.officers = RUN.activeBand(st).length
  result.battles = st.stats.battles - (result.fielded ? 0 : 0)
  if (narrate) result.log = st.simLog
  return result
}

// ---------- report ----------
const median = (xs) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(0) + '%' : '-')
function summarise(runs) {
  const n = runs.length
  const reached = runs.filter((r) => r.reached)
  return {
    n,
    win: runs.filter((r) => r.end === 'won').length / n,
    starved: runs.filter((r) => r.end === 'starved').length / n,
    defeatedRoad: runs.filter((r) => r.end === 'defeated').length / n,
    lostFinale: runs.filter((r) => r.end === 'lost-finale').length / n,
    reached: reached.length / n,
    riceDaysMed: median(reached.map((r) => r.riceDays)),
    lowRice: reached.filter((r) => r.riceDays <= 3).length / Math.max(1, reached.length),
    fieldedMed: median(reached.filter((r) => r.fielded).map((r) => r.fielded)),
    renownMed: median(runs.map((r) => r.renown)),
    dayMed: median(reached.map((r) => r.day)),
    battlesMed: median(reached.map((r) => r.battles)),
    hungryFinale: reached.filter((r) => r.hungryFinale).length / Math.max(1, reached.length),
    officersMed: median(reached.map((r) => r.officers)),
    fellAny: runs.filter((r) => r.fell.length).length / n,
    battleDist: [0, 1, 2, 3, 4, 5].map((k) => reached.filter((r) => r.battles === k).length),
  }
}

function main() {
  const seeds = Number(opt('seeds', 500))
  const first = Number(opt('first', 1))
  const md = has('md')
  const narrateSeed = opt('narrate', null)
  if (narrateSeed !== null) {
    const seed = Number(narrateSeed)
    const road = drawRoad(seed)
    console.log(`Road for seed ${seed} (${road.long ? 'long' : 'short'}, mountain path from tier ${road.mountainTier}):`)
    road.tiers.forEach((t, i) => console.log(`  tier ${i}: ${t.join(' | ')}`))
    for (const p of opt('policies', 'benevolent,ruthless,balanced').split(',')) {
      const r = playRun(seed, p, true)
      console.log(`\n### ${p} (seed ${seed}): ${r.end}`)
      for (const l of r.log) console.log('  ' + l)
    }
    return
  }
  const all = {}
  for (const p of Object.keys(POLICIES)) {
    all[p] = []
    for (let s = first; s < first + seeds; s++) all[p].push(playRun(s, p))
  }
  const rows = Object.entries(all).map(([p, runs]) => [p, summarise(runs)])
  const head = '| Policy | Win | Starved | Lost a road battle | Lost the finale | Reached finale | Rice-days at arrival (median) | Arrived with <=3 days | Fielded at finale (median) | Hungry at finale | Renown at end (median) | Arrival day (median) | Battles before finale (median) | Officers at finale (median) | An officer fell |'
  console.log(head)
  console.log('|' + head.split('|').slice(1, -1).map(() => '---').join('|') + '|')
  for (const [p, s] of rows) {
    console.log(`| ${p} | ${pct(s.win * s.n, s.n)} | ${pct(s.starved * s.n, s.n)} | ${pct(s.defeatedRoad * s.n, s.n)} | ${pct(s.lostFinale * s.n, s.n)} | ${pct(s.reached * s.n, s.n)} | ${s.riceDaysMed} | ${pct(s.lowRice * 1000, 1000)} | ${s.fieldedMed} | ${pct(s.hungryFinale * 1000, 1000)} | ${s.renownMed} | ${s.dayMed} | ${s.battlesMed} | ${s.officersMed} | ${pct(s.fellAny * s.n, s.n)} |`)
  }
  const pooled = Object.values(all).flat().filter((r) => r.reached).map((r) => r.battles)
  const pooledSensible = ['benevolent', 'ruthless', 'balanced'].flatMap((p) => all[p]).filter((r) => r.reached).map((r) => r.battles)
  console.log(`\nMedian battles before the finale, all four policies pooled: ${median(pooled)}; the three sensible policies pooled: ${median(pooledSensible)}`)
  console.log('\nBattles before the finale (runs that reached it): ' + rows.map(([p, s]) => `${p} ${s.battleDist.map((c, k) => `${k}:${c}`).join(' ')}`).join(' ; '))
  const shares = {}
  for (const [p, runs] of Object.entries(all)) {
    for (const r of runs) for (const pk of r.picks) {
      const [stop, ch] = pk.split('/')
      shares[stop] ??= {}
      shares[stop][p] ??= {}
      shares[stop][p][ch] = (shares[stop][p][ch] || 0) + 1
    }
  }
  if (md || has('shares')) {
    console.log('\n| Stop | ' + Object.keys(POLICIES).join(' | ') + ' |')
    console.log('|---|' + Object.keys(POLICIES).map(() => '---').join('|') + '|')
    for (const stop of DATA.stops.map((s) => s.id)) {
      if (!shares[stop]) continue
      const cells = Object.keys(POLICIES).map((p) => {
        const c = shares[stop][p] || {}
        const tot = Object.values(c).reduce((a, b) => a + b, 0)
        return tot ? Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / tot)}%`).join(', ') : '-'
      })
      console.log(`| ${stop} | ${cells.join(' | ')} |`)
    }
  }
  const sensible = ['benevolent', 'ruthless', 'balanced']
  const dominant = []
  for (const [stop, byPol] of Object.entries(shares)) {
    const chs = new Set(sensible.flatMap((p) => Object.keys(byPol[p] || {})))
    for (const ch of chs) {
      const everywhere = sensible.every((p) => {
        const c = byPol[p] || {}
        const tot = Object.values(c).reduce((a, b) => a + b, 0)
        return tot > 0 && (c[ch] || 0) / tot >= 0.95
      })
      if (everywhere) dominant.push(`${stop}/${ch}`)
    }
  }
  console.log(`\nDominance check (a choice picked >=95% of the time by every sensible policy): ${dominant.length ? dominant.join(', ') : 'none'}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
