// Paper sim for the roguelike "Roads to War", era 1 (docs/spec/16-roguelike-era1.md, rules RL-* in docs/spec/10-rules.md).
// Plain Node, no dependencies, deterministic (seeded sfc32, the same generator and seeding as src/engine/rng.ts).
//
//   node tools/roguelike/paper-sim.mjs [--seeds 500] [--first 1] [--md] [--narrate <seed>] [--data docs/spec/data/era1-stops.json]
//
// It reads the era-1 stop data, draws a road per seed (RL-ROAD-*), and plays it with four simple policies:
// benevolent, ruthless, balanced and greedy-fighter. The road economy (rice, soldiers, wounded, Renown, days, echoes,
// gambles) follows the RL rules exactly. BATTLES ARE NOT PLAYED: they use the placeholder loss model below. It stands in
// for the RL4 run bench, which will play every battle with the real engine and the utility AI.
//
// PLACEHOLDER BATTLE MODEL (documented in docs/spec/16-roguelike-era1-sim.md section 1; constants in MODEL below):
//   S = sum over fielded officers of soldiers_i * q_i * forged_i * (1 + 0.04 * qiMod_i) * (tired ? 0.93 : 1) * (1 + sulk) + guests
//   E = battle.E * tierScale[tier] * (1 + pre-battle modifiers)   (finale: E * day-table mult * (1 + echo and Renown deltas))
//   r = S / E;  P(win) = 1 / (1 + exp(-6 (r - 0.8)))
//   on a win: soldiers lost = fielded * clamp(0.22 / r, 0.06, 0.45), half killed and half wounded (RL-LOSS-1);
//             each fielded non-commander officer is routed with chance clamp(0.10 / r, 0.02, 0.25) (RL-FALL-1);
//             every fielded officer gains one level (command cap +100; stands in for the campaign XP of RL-XP-1).
//   on a loss: the run ends (RL-END-1).
// qiMod: Renown spirit (RL-REN-4) + rest bonus + per-officer echoes; hungry (RL-HUNGER-1) sets it to -2 for everyone.
// The policies are simple utility scorers (POLICIES below). They see every printed number and stated odds, never a hidden echo.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)
const DATA = JSON.parse(readFileSync(resolve(opt('data', resolve(here, '../../docs/spec/data/era1-stops.json'))), 'utf8'))
const R = DATA.rules
const STOPS = Object.fromEntries(DATA.stops.map((s) => [s.id, s]))

// ---------- RNG: sfc32 seeded like src/engine/rng.ts ----------
function seedRng(seed) {
  let s = seed >>> 0
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return (z ^ (z >>> 16)) >>> 0
  }
  const st = [sm(), sm(), sm(), sm()]
  for (let i = 0; i < 12; i++) nextFloat(st)
  return st
}
function nextFloat(st) {
  let [a, b, c, d] = st
  let t = (a + b) | 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) | 0
  c = (c << 21) | (c >>> 11)
  d = (d + 1) | 0
  t = (t + d) | 0
  c = (c + t) | 0
  st[0] = a >>> 0
  st[1] = b >>> 0
  st[2] = c >>> 0
  st[3] = d >>> 0
  return (t >>> 0) / 4294967296
}
/** RL-RNG-1: one stream per (run seed, purpose, stop index), so a choice never shifts a later draw. */
function stream(seed, purpose, index) {
  const h = (Math.imul(seed >>> 0, 0x2545f491) ^ Math.imul(purpose + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0
  const st = seedRng(h)
  return () => nextFloat(st)
}
const P_ROAD = 1, P_FATE = 2

// ---------- road generation (RL-ROAD-1..5) ----------
function weighted(rng, items) {
  const tot = items.reduce((a, x) => a + x.weight, 0)
  let r = rng() * tot
  for (const x of items) if ((r -= x.weight) < 0) return x
  return items[items.length - 1]
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}
function hasBattle(stopId) {
  return DATA.road.battleStops.includes(stopId)
}
export function drawRoad(seed) {
  const rng = stream(seed, P_ROAD, 0)
  const long = rng() < 0.5
  const defs = DATA.road.tiers.filter((t) => long || !t.longOnly)
  const used = new Set()
  const tiers = defs.map(() => [])
  // battle stops for mid tiers first, so every mid tier offers a battle (RL-ROAD-3)
  defs.forEach((def, ti) => {
    if (def.kind === 'fixed') def.stops.forEach((s) => (tiers[ti].push(s), used.add(s)))
    if (def.kind === 'anchor') (tiers[ti].push(def.anchor), used.add(def.anchor))
  })
  defs.forEach((def, ti) => {
    if (def.kind !== 'mid' || !def.battleRequired) return
    const cands = DATA.road.pools.mid.filter((s) => hasBattle(s) && !used.has(s))
    if (cands.length) {
      const s = pick(rng, cands)
      tiers[ti].push(s)
      used.add(s)
    }
  })
  defs.forEach((def, ti) => {
    if (def.kind === 'fixed') return
    while (tiers[ti].length < 2) {
      const cands = DATA.road.pools[def.pool].filter((s) => !used.has(s) && !(def.kind === 'anchor' && hasBattle(s)))
      const s = pick(rng, cands)
      tiers[ti].push(s)
      used.add(s)
    }
    if (rng() < 0.5) tiers[ti].reverse() // lane order
  })
  // edges: same lane always; a crossing with chance 1/2 each way; leg days weighted
  const edges = []
  for (let ti = 0; ti < tiers.length - 1; ti++) {
    for (let a = 0; a < tiers[ti].length; a++) {
      for (let b = 0; b < tiers[ti + 1].length; b++) {
        const same = tiers[ti].length === 1 || a === b
        if (same || rng() < 0.5) edges.push({ from: [ti, a], to: [ti + 1, b], days: weighted(rng, DATA.road.legDays).days, kind: 'road' })
      }
    }
  }
  const mt = pick(rng, DATA.road.mountainPath.fromTiers)
  for (let a = 0; a < tiers[mt].length; a++) {
    edges.push({ from: [mt, a], to: [mt + 2, a], days: DATA.road.mountainPath.days, kind: 'mountain' })
  }
  return { seed, long, tiers, edges, mountainTier: mt }
}

// ---------- state ----------
function capOf(st, id) {
  const o = DATA.officers[id]
  const rec = st.band[id]
  let cap = Math.floor((R.capPerLead * o.lead + R.capPerLevel * rec.level + (rec.capBonus || 0)) / R.sliderStep) * R.sliderStep
  if (rec.hurt) cap = Math.floor(cap / 2 / R.sliderStep) * R.sliderStep // RL-FALL-2: hurt until rested
  return Math.max(cap, R.minPerOfficer)
}
const pool = (st) => st.soldiers + st.wounded
const upkeep = (st) => Math.ceil(pool(st) / R.upkeepPer) // RL-UPKEEP-1
const riceDays = (st) => (upkeep(st) ? Math.floor(st.rice / upkeep(st)) : 99)
function spirit(st) {
  // RL-REN-4
  if (st.renown >= 70) return 2
  if (st.renown >= 40) return 1
  if (st.renown < 20) return -1
  return 0
}
function newState(seed, road) {
  const s = DATA.start
  const band = {}
  for (const b of s.band) band[b.officer] = { level: b.level, routs: 0, hurt: false, capBonus: 0 }
  return {
    seed, road, rice: s.rice, soldiers: s.soldiers, wounded: s.wounded, renown: s.renown, day: s.day, band,
    flags: new Set(), qiNext: 0, qiNextOfficer: {}, tired: false, sulk: 0, slowLegs: null, nextLegDays: 0,
    battles: 0, log: [], end: null, killed: 0, picks: [], fell: [], gambles: 0,
  }
}
function log(st, text) {
  st.log.push(`day ${String(st.day).padStart(2)} | rice ${String(st.rice).padStart(3)} (${String(riceDays(st)).padStart(2)}d) | men ${st.soldiers}+${st.wounded}w | renown ${st.renown} | ${text}`)
}

// passing days: upkeep each day (RL-UPKEEP-1, RL-SCATTER-1)
function passDays(st, n) {
  for (let i = 0; i < n && !st.end; i++) {
    st.day += 1
    const u = upkeep(st)
    if (st.rice < u) {
      st.rice = 0
      st.end = 'starved'
      log(st, 'the rice is gone: the army scatters')
      return
    }
    st.rice -= u
    if (st.rice <= 0) {
      st.end = 'starved'
      log(st, 'the rice is gone: the army scatters')
    }
  }
}
function casualties(st, c) {
  // RL-LOSS-1: split killed / wounded; taken from healthy soldiers
  let n = c.n ?? Math.round((c.pct * st.soldiers) / 10) * 10
  n = Math.min(n, st.soldiers)
  const killedShare = c.killed ?? R.killedShare
  const k = Math.round((n * killedShare) / 10) * 10
  st.soldiers -= n
  st.wounded += n - k
  st.killed += k
  return n
}
function addRenown(st, n) {
  st.renown = Math.max(0, Math.min(R.renownMax, st.renown + n)) // RL-REN-1
}
function rest(st, full) {
  // RL-REST-1 (stop rest) / RL-REST-2 (make camp)
  const back = full ? st.wounded : Math.floor(st.wounded / 2 / 10) * 10
  st.wounded -= back
  st.soldiers += back
  st.tired = false
  if (full) for (const id in st.band) st.band[id].hurt = false
  if (st.renown < 20) {
    const d = Math.round((st.soldiers * R.deserterPct) / 10) * 10 // RL-REN-4
    st.soldiers -= d
  }
}
function condTrue(st, c) {
  if (c.renownGte !== undefined && st.renown < c.renownGte) return false
  if (c.flag !== undefined && !st.flags.has(c.flag)) return false
  if (c.notFlag !== undefined && st.flags.has(c.notFlag)) return false
  return true
}
/** Flatten an effects object for the current state (conditionals resolved; gamble and battle left as nested). */
function flatEffects(st, eff) {
  const out = { ...eff }
  delete out.conditional
  for (const c of eff.conditional || []) {
    const part = condTrue(st, c.if) ? c.then : c.else
    if (!part) continue
    for (const [k, v] of Object.entries(part)) {
      if (k === 'flags') out.flags = [...(out.flags || []), ...v]
      else if (typeof v === 'number') out[k] = (out[k] || 0) + v
      else out[k] = v
    }
  }
  return out
}
function tradeMult(st) {
  // RL-REN-2
  if (st.renown >= 50) return R.tradeHigh
  if (st.renown < 20) return R.tradeLow
  return 1
}
function riceOf(st, e) {
  let r = e.rice || 0
  if (e.riceTrade) r += Math.round(e.riceTrade * tradeMult(st))
  if (e.giftRice && st.renown >= 50) r += e.giftRice
  return r
}
/** Apply the plain (non-gamble, non-battle) part of an effects object. Returns false if the run ended. */
function applySimple(st, e, note) {
  const parts = []
  const rice = riceOf(st, e)
  if (rice) (st.rice += rice, parts.push(`rice ${rice > 0 ? '+' : ''}${rice}`))
  if (e.soldiers) (st.soldiers += e.soldiers, parts.push(`+${e.soldiers} men`))
  if (e.casualties) parts.push(`-${casualties(st, e.casualties)} men`)
  if (e.renown) (addRenown(st, e.renown), parts.push(`renown ${e.renown > 0 ? '+' : ''}${e.renown}`))
  for (const f of e.flags || []) {
    st.flags.add(f)
    parts.push(`[${f}]`)
    st.sulk += DATA.flags[f]?.effect?.nextBattleS || 0 // e.g. zhang-fei-sulks: the next battle only
  }
  if (e.recruit && !st.band[e.recruit]) {
    st.band[e.recruit] = { level: DATA.officers[e.recruit].joinLevel || 2, routs: 0, hurt: false, capBonus: 0 }
    parts.push(`${DATA.officers[e.recruit].name} joins`)
  }
  for (const [id, v] of Object.entries(e.capBonus || {})) if (st.band[id]) st.band[id].capBonus += v
  if (e.qiNext) st.qiNext += e.qiNext
  for (const [id, v] of Object.entries(e.qiNextOfficer || {})) st.qiNextOfficer[id] = (st.qiNextOfficer[id] || 0) + v
  if (e.tired) (st.tired = true, (st.tiredFresh = true))
  if (e.woundOfficer && st.band[e.woundOfficer]) (st.band[e.woundOfficer].hurt = true, parts.push(`${DATA.officers[e.woundOfficer].name} hurt`))
  if (e.rest) (rest(st, true), parts.push('rested'))
  if (e.healWounded === 'half') rest(st, false)
  if (e.nextLegDays) st.nextLegDays += e.nextLegDays
  if (e.nextBattleE) st.nextBattleE = (st.nextBattleE || 0) + e.nextBattleE
  if (e.slowLegs) st.slowLegs = { ...e.slowLegs }
  if (st.rice <= 0) {
    st.rice = 0
    st.end = 'starved'
  }
  if (note !== undefined && (parts.length || !note.startsWith('  '))) log(st, `${note}: ${parts.length ? parts.join(', ') : 'no cost, no gain'}`)
  if (e.days) passDays(st, e.days)
  return !st.end
}

// ---------- battles (placeholder model) ----------
function battleE(st, b, tier) {
  return DATA.battles[b.id].E * DATA.road.tierScale[Math.min(tier, DATA.road.tierScale.length - 1)] * (1 + (st.nextBattleE || 0))
}
function finaleSetup(st) {
  const f = DATA.finale
  let day = st.day
  const lines = []
  let dayShift = 0
  for (const fl of st.flags) dayShift += DATA.flags[fl]?.effect?.dayShift || 0
  const effDay = day + dayShift
  const row = f.dayTable.find((r) => effDay <= r.maxDay)
  let eDelta = 0
  let g = DATA.battles[f.battle].guests
  lines.push(row.text.replace('{day}', day) + (dayShift ? ` (counts as day ${effDay})` : ''))
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
  const ids = Object.keys(st.band).sort((a, b) => {
    if (DATA.officers[a].commander) return -1
    if (DATA.officers[b].commander) return 1
    return DATA.officers[b].q - DATA.officers[a].q
  })
  return ids.slice(0, slots)
}
function strength(st, alloc, guests, hungry) {
  let s = 0
  const base = spirit(st) + st.qiNext
  for (const [id, n] of Object.entries(alloc)) {
    const m = hungry ? -2 : base + (st.qiNextOfficer[id] || 0)
    const forged = st.flags.has('forged-weapons') && ['liu-bei', 'guan-yu', 'zhang-fei'].includes(id) ? 1.04 : 1
    s += n * DATA.officers[id].q * forged * (1 + 0.04 * m)
  }
  if (st.tired) s *= 0.93
  s *= 1 + st.sulk
  return s + guests
}
const MODEL = { slope: 6, mid: 0.8, loss: 0.22, lossMin: 0.06, lossMax: 0.45, rout: 0.1 }
const pWin = (r) => 1 / (1 + Math.exp(-MODEL.slope * (r - MODEL.mid)))
const lossFracOf = (r) => Math.min(MODEL.lossMax, Math.max(MODEL.lossMin, MODEL.loss / r))
/** Fill officers in order up to their caps with `total` soldiers (RL-DEPLOY-1). */
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
function deployOptions(st, slots) {
  const ids = officersFor(st, slots)
  const maxField = Math.min(st.soldiers, ids.reduce((a, id) => a + capOf(st, id), 0))
  return { ids, maxField }
}
function evalDeploy(st, ids, total, E, guests) {
  const alloc = allocate(st, ids, total)
  const fielded = Object.values(alloc).reduce((a, b) => a + b, 0)
  const cost = Math.ceil(fielded / R.battleRicePer) // RL-DEPLOY-3
  const after = st.rice - cost
  const u = upkeep(st)
  const hungry = after < R.hungryDays * u // RL-HUNGER-1
  const S = strength(st, alloc, guests, hungry)
  const r = S / E
  return { alloc, fielded, cost, after, hungry, S, r, p: pWin(r) }
}
/** Policy-chosen deployment; returns the evaluation. */
function chooseDeploy(st, pol, E, guests, slots, finale) {
  const { ids, maxField } = deployOptions(st, slots)
  const opts = []
  for (let t = R.minPerOfficer; t <= maxField; t += 250) {
    const ev = evalDeploy(st, ids, t, E, guests)
    if (ev.after < 1) continue // RL-DEPLOY-3: a deployment that would empty the rice is refused
    opts.push(ev)
  }
  if (maxField >= R.minPerOfficer) {
    const ev = evalDeploy(st, ids, maxField, E, guests)
    if (ev.after >= 1) opts.push(ev)
  }
  if (!opts.length) return null
  if (finale) return opts.reduce((a, b) => (b.p > a.p + 1e-9 ? b : a))
  // road battle: the smallest deployment that reaches the policy's target odds, else the best odds; keep rice days
  const ok = opts.filter((o) => o.p >= pol.targetP && !o.hungry && o.after >= (pol.reserveDays + 1) * upkeep(st))
  if (ok.length) return ok[0]
  return opts.reduce((a, b) => (b.p - (b.hungry ? 0.02 : 0) > a.p - (a.hungry ? 0.02 : 0) ? b : a))
}
function fight(st, pol, b, tier, rng, label) {
  const bd = DATA.battles[b.id]
  let guests = bd.guests
  for (const fl of st.flags) guests += DATA.flags[fl]?.effect?.battleGuests?.[b.id] || 0
  const E = battleE(st, b, tier)
  const dep = chooseDeploy(st, pol, E, guests, bd.slots, false)
  if (!dep) {
    st.end = 'starved'
    log(st, `${label}: not enough rice to field a single company: the army scatters`)
    return false
  }
  st.rice -= dep.cost
  st.battles += 1
  const roll = rng()
  const won = roll < dep.p
  const head = `${label} [${b.id}${b.variant ? '/' + b.variant : ''}]: field ${dep.fielded} (rice -${dep.cost}${dep.hungry ? ', HUNGRY' : ''}) vs E ${Math.round(E)}, odds ${(dep.p * 100).toFixed(0)}%`
  if (!won) {
    st.end = 'defeated'
    log(st, `${head}: DEFEAT, the run ends`)
    return false
  }
  const lossFrac = lossFracOf(dep.r)
  const lost = Math.round((dep.fielded * lossFrac) / 10) * 10
  const k = Math.round((lost * R.killedShare) / 10) * 10
  st.soldiers -= lost
  st.wounded += lost - k
  st.killed += k
  const routs = []
  for (const id of Object.keys(dep.alloc)) {
    if (DATA.officers[id].commander) continue
    if (rng() < Math.min(0.25, Math.max(0.02, MODEL.rout / dep.r))) {
      const rec = st.band[id]
      rec.routs += 1
      if (rec.routs >= 2) {
        delete st.band[id]
        st.fell.push(id)
        routs.push(`${DATA.officers[id].name} FALLS`)
      } else {
        rec.hurt = true
        routs.push(`${DATA.officers[id].name} routed (wounded)`)
      }
    }
  }
  for (const id of Object.keys(dep.alloc)) if (st.band[id] && st.band[id].level < 10) st.band[id].level += 1
  st.tired = false
  st.qiNext = 0
  st.qiNextOfficer = {}
  st.sulk = 0
  st.nextBattleE = 0
  log(st, `${head}: won, -${lost} men (${k} killed)${routs.length ? ', ' + routs.join(', ') : ''}`)
  passDays(st, R.battleDays)
  return !st.end
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
const LOSS_PENALTY = 200 // a lost road battle ends the run // utility of 100% of the finale's enemy strength, for visible finale effects
/** Utility of a plain effects object, from the policy's point of view (hidden echoes are invisible to it). */
function utilSimple(st, pol, e) {
  let u = 0
  u += riceWeight(st, pol) * riceOf(st, e)
  u += (pol.wSold * (e.soldiers || 0)) / 100
  if (e.casualties) {
    const n = e.casualties.n ?? e.casualties.pct * st.soldiers
    u -= (pol.wSold * n * (0.5 + 0.5 * (e.casualties.killed ?? R.killedShare))) / 100
  }
  // renown: the benevolent policy values it for its own sake; everyone values crossing a spirit threshold a little
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
  if (e.recruit && !st.band[e.recruit]) u += 14
  for (const v of Object.values(e.capBonus || {})) u += v / 100
  u += 3 * (e.qiNext || 0)
  for (const v of Object.values(e.qiNextOfficer || {})) u += 1.5 * v
  if (e.tired) u -= 6
  if (e.nextBattleE) u -= e.nextBattleE * 60
  if (e.woundOfficer && st.band[e.woundOfficer]) u -= 6
  if (e.rest) u += (pol.restBias || 0) + (pol.wSold * st.wounded) / 100 + (st.tired ? 4 : 0) + 2 * Object.values(st.band).filter((b) => b.hurt).length
  if (e.healWounded === 'half') u += (pol.wSold * st.wounded) / 200
  if (pol.name === 'benevolent' && (e.renown || 0) >= 8) u += 6 // "protect the people"
  return u
}
function volunteersFor(st, stop, e, renownAfter) {
  // RL-REN-3
  const town = stop.tags.includes('town') || stop.tags.includes('village')
  if (e.noVolunteers || (!town && !e.volunteers)) return 0
  return Math.round((renownAfter * R.volunteersPerRenown * (e.volunteersMult ?? 1)) / 10) * 10
}
/** RL-REN-2: at a town or village stop, Renown 50+ brings Renown / 5 bags as a gift (not when the choice turns on the people). */
function giftFor(st, stop, e, ren) {
  const town = stop.tags.includes('town') || stop.tags.includes('village')
  if (!town || e.noVolunteers || ren < R.giftAt) return 0
  return Math.floor(ren / R.giftDiv)
}
function utilChoice(st, pol, stop, ch, tier) {
  const e = flatEffects(st, ch.effects)
  if (riceOf(st, e) < 0 && st.rice + riceOf(st, e) < 1) return null // RL-CHOICE-2: cannot pay
  let u = utilSimple(st, pol, e)
  const ren = Math.max(0, Math.min(100, st.renown + (e.renown || 0)))
  u += (pol.wSold * volunteersFor(st, stop, e, ren)) / 100
  u += riceWeight(st, pol) * giftFor(st, stop, e, ren)
  if (e.gamble) {
    const g = e.gamble
    const uw = utilSimple(st, pol, flatEffects(st, g.win))
    const ul = utilSimple(st, pol, flatEffects(st, g.lose))
    const ev = g.odds * uw + (1 - g.odds) * ul
    u += ev - pol.risk * Math.abs(uw - ul) * Math.sqrt(g.odds * (1 - g.odds))
  }
  if (!pol.careless) {
    // a sensible player never leaves the stop with less than ~4 days of rice when it can help it
    const days = (e.days || 0) + (e.battle ? R.battleDays : 0)
    const gr = e.gamble ? e.gamble.odds * riceOf(st, flatEffects(st, e.gamble.win)) + (1 - e.gamble.odds) * riceOf(st, flatEffects(st, e.gamble.lose)) : 0
    const after = st.rice + riceOf(st, e) + gr - days * upkeep(st)
    const short = 4 - after / Math.max(1, upkeep(st))
    if (short > 0) u -= 15 * short
  }
  if (e.battle) {
    const bd = DATA.battles[e.battle.id]
    const E = battleE(st, e.battle, tier)
    const dep = chooseDeploy(st, pol, E, bd.guests, bd.slots, false)
    if (!dep) return pol.careless ? 1e6 : -1e6
    const lossFrac = lossFracOf(dep.r)
    const winU = utilSimple(st, pol, flatEffects(st, e.battle.win)) - (pol.wSold * dep.fielded * lossFrac * 0.75) / 100
    u += dep.p * winU - (1 - dep.p) * LOSS_PENALTY - riceWeight(st, pol) * dep.cost - (riceWeight(st, pol) * upkeep(st) + pol.dayExtra) * R.battleDays
    u += pol.battleBias
    if (e.battle.aftermath) u += 3
  }
  if (pol.name === 'greedy-fighter' && (e.gamble || e.battle)) u += e.battle ? 0 : 3
  return u
}

function choose(st, pol, stop, tier) {
  let best = null
  for (const ch of stop.choices) {
    const u = utilChoice(st, pol, stop, ch, tier)
    if (u === null) continue
    if (!best || u > best.u) best = { ch, u }
  }
  return best ? best.ch : null
}

function resolveStop(st, pol, stopId, tier, idx) {
  const stop = STOPS[stopId]
  const rng = stream(st.seed, P_FATE, idx)
  const ch = choose(st, pol, stop, tier)
  if (!ch) {
    // nothing payable: every choice costs rice the army does not have
    st.end = 'starved'
    log(st, `${stop.title}: no choice can be paid for: the army scatters`)
    return
  }
  st.picks.push(`${stopId}/${ch.id}`)
  const e = flatEffects(st, ch.effects)
  const label = `${stop.title} -> ${ch.label}`
  if (!applySimple(st, e, label)) return
  if (e.gamble) {
    st.gambles += 1
    const win = rng() < e.gamble.odds
    const part = flatEffects(st, win ? e.gamble.win : e.gamble.lose)
    log(st, `${stop.title}: gamble ${(e.gamble.odds * 100).toFixed(0)}% -> ${win ? 'WON' : 'lost'}`)
    if (!applySimple(st, part, '  outcome')) return
  }
  if (e.battle) {
    if (!fight(st, pol, e.battle, tier, rng, stop.title)) return
    const w = flatEffects(st, e.battle.win)
    if (!applySimple(st, w, '  spoils')) return
    if (e.battle.aftermath) resolveStop(st, pol, e.battle.aftermath, tier, idx + 100)
    if (st.end) return
  }
  const vol = volunteersFor(st, stop, e, st.renown)
  if (vol > 0) {
    st.soldiers += vol
    log(st, `  ${vol} volunteers join (Renown ${st.renown} x ${R.volunteersPerRenown}${e.volunteersMult ? ' x ' + e.volunteersMult : ''})`)
  }
  const gift = giftFor(st, stop, e, st.renown)
  if (gift) {
    st.rice += gift // RL-REN-2: the elders bring rice to a lord of good name
    log(st, `  the elders bring ${gift} rice (Renown ${st.renown}, 50+)`)
  }
  if (stop.tags.includes('market')) hire(st, pol)
}

/** RL-POOL-5: at a market stop, rice buys paid levies (price by Renown, RL-REN-2), up to marketMax men. */
function hirePrice(st) {
  return Math.round((R.levyPrice / tradeMult(st)) * 10) / 10
}
function hire(st, pol) {
  const price = hirePrice(st)
  const keepDays = pol.hireKeepDays
  let n = 0
  while (n < R.marketMax) {
    const next = n + 100
    const cost = Math.ceil((next / 100) * price)
    const after = st.rice - cost
    const u = Math.ceil((pool(st) + next) / R.upkeepPer)
    if (after < keepDays * u) break
    n = next
  }
  if (n > 0) {
    const cost = Math.ceil((n / 100) * price)
    st.rice -= cost
    st.soldiers += n
    log(st, `  market: hire ${n} levies for ${cost} rice (${price} per 100)`)
  }
}

// between stops: send men home, make camp (RL-POOL-4, RL-REST-2)
function between(st, pol, nextDays) {
  if (pol.dismissDays >= 0) {
    const need = nextDays + pol.dismissDays
    if (riceDays(st) < need) {
      const keep = Math.max(0, Math.floor(st.rice / (need + 1)) * R.upkeepPer)
      let excess = pool(st) - keep
      const floor = 1500
      if (excess > 0) {
        const w = Math.min(excess, st.wounded)
        st.wounded -= w
        excess -= w
        const h = Math.max(0, Math.min(excess, st.soldiers - floor))
        st.soldiers -= h
        if (w + h > 0) log(st, `send ${w} wounded and ${h} men home to stretch the rice`)
      }
    }
  }
  const woundedShare = pool(st) ? st.wounded / pool(st) : 0
  if (woundedShare >= pol.campAt && riceDays(st) > nextDays + R.makeCampDays + 3) {
    log(st, 'make camp for 2 days')
    rest(st, false)
    passDays(st, R.makeCampDays)
  }
}

function edgesFrom(road, node) {
  return road.edges.filter((e) => e.from[0] === node[0] && e.from[1] === node[1])
}
function stopValue(st, pol, stopId, tier) {
  const stop = STOPS[stopId]
  let best = -1e9
  for (const ch of stop.choices) {
    const u = utilChoice(st, pol, stop, ch, tier)
    if (u !== null && u > best) best = u
  }
  if (pol.name === 'greedy-fighter' && hasBattle(stopId)) best += 1000
  return best
}

function legChoice(st, pol, edge) {
  // forced march (RL-MARCH-1) and mountain path (RL-ROAD-4) decisions
  let days = edge.days + (st.slowLegs ? st.slowLegs.days : 0) + st.nextLegDays
  days = Math.max(0, days)
  let march = false
  const behind = st.day > 2.3 * (edge.to[0] + 1)
  if (days >= 2 && (pol.march === true || (pol.march === 'late' && behind))) march = true
  return { days, march }
}

export function playRun(seed, polName, narrate = false) {
  const pol = POLICIES[polName]
  const road = drawRoad(seed)
  const st = newState(seed, road)
  let node = [0, 0]
  let idx = 0
  resolveStop(st, pol, road.tiers[0][0], 0, idx++)
  while (!st.end) {
    const tierCount = road.tiers.length
    if (node[0] === tierCount - 1) {
      // to the finale
      between(st, pol, DATA.road.finaleLegDays)
      if (st.end) break
      if (st.tired && !st.tiredFresh) st.tired = false // RL-MARCH-2
      passDays(st, DATA.road.finaleLegDays)
      break
    }
    let opts = edgesFrom(road, node)
    const useMountain = pol.mountain === true || (pol.mountain === 'hungry' && riceDays(st) < 6)
    if (!useMountain) {
      const nm = opts.filter((o) => o.kind !== 'mountain')
      if (nm.length) opts = nm
    } else {
      const m = opts.filter((o) => o.kind === 'mountain')
      if (m.length) opts = m
    }
    let best = null
    for (const ed of opts) {
      const v = stopValue(st, pol, road.tiers[ed.to[0]][ed.to[1]], ed.to[0]) - ed.days * (upkeep(st) + pol.dayExtra)
      if (!best || v > best.v) best = { ed, v }
    }
    const ed = best.ed
    const leg = legChoice(st, pol, ed)
    between(st, pol, leg.days)
    if (st.end) break
    let days = leg.days
    if (!leg.march && st.tired && !st.tiredFresh) {
      st.tired = false // RL-MARCH-2: a leg at the normal pace walks the tiredness off
      log(st, 'a leg at the normal pace: no longer tired')
    }
    st.tiredFresh = false
    if (leg.march) {
      const saved = Math.floor(days / 2)
      days -= saved
      const n = casualties(st, { pct: R.forcedMarchPctPerDaySaved * saved })
      st.tired = true
      log(st, `forced march: ${leg.days} days in ${days}, -${n} men to the road, tired`)
    }
    if (ed.kind === 'mountain') {
      const n = casualties(st, { pct: DATA.road.mountainPath.attritionPct ?? R.mountainPathAttritionPct })
      log(st, `mountain path (skips a stop): -${n} men`)
    }
    st.nextLegDays = 0
    if (st.slowLegs) {
      st.slowLegs.legs -= 1
      if (st.slowLegs.legs <= 0) st.slowLegs = null
    }
    passDays(st, days)
    if (st.end) break
    node = ed.to
    const stopId = road.tiers[node[0]][node[1]]
    // RL-POOL-4/rest decisions at stops are part of the stop choices; a rest stop with many wounded is valued in utilSimple
    resolveStop(st, pol, stopId, node[0], idx++)
  }
  let result = { seed, policy: polName, end: st.end, day: st.day, renown: st.renown, battles: st.battles, picks: st.picks }
  if (!st.end) {
    const fs = finaleSetup(st)
    const arrive = { rice: st.rice, riceDays: riceDays(st), soldiers: st.soldiers, wounded: st.wounded }
    log(st, `ARRIVE AT GUANGZONG: ${fs.lines.join(' / ')}`)
    let dep = chooseDeploy(st, pol, fs.E, fs.G, DATA.battles.guangzong.slots, true)
    if (!pol.careless && st.wounded > 0) {
      // RL-POOL-4: the wounded eat but cannot fight; sending them home can lift the hunger before the last battle
      const w = st.wounded
      st.wounded = 0
      const alt = chooseDeploy(st, pol, fs.E, fs.G, DATA.battles.guangzong.slots, true)
      if (alt && (!dep || alt.p > dep.p + 0.005)) {
        dep = alt
        log(st, `send ${w} wounded home before the battle (upkeep ${Math.ceil((st.soldiers + w) / R.upkeepPer)} -> ${upkeep(st)})`)
      } else st.wounded = w
    }
    if (!dep) {
      st.end = 'starved'
      log(st, 'no rice to field the army at Guangzong: scattered')
    } else {
      st.rice -= dep.cost
      const won = stream(seed, P_FATE, 999)() < dep.p
      log(st, `GUANGZONG: field ${dep.fielded} + guests ${fs.G} (rice -${dep.cost}${dep.hungry ? ', HUNGRY' : ''}) vs E ${Math.round(fs.E)}, odds ${(dep.p * 100).toFixed(0)}% -> ${won ? 'VICTORY' : 'DEFEAT'}`)
      st.end = won ? 'won' : 'lost-finale'
      result.fielded = dep.fielded
      result.finaleOdds = dep.p
      result.hungryFinale = dep.hungry
    }
    result = { ...result, ...arrive, reached: true, bracket: fs.row.label }
  }
  result.end = st.end
  result.renown = st.renown
  result.killed = st.killed
  result.fell = st.fell
  result.officers = Object.keys(st.band).length
  if (narrate) result.log = st.log
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
    battlesAllMed: median(runs.map((r) => r.battles)),
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
    for (const p of (opt('policies', 'benevolent,ruthless,balanced')).split(',')) {
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
  // choice shares per stop per policy, and the dominance check
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
