// Typed loader for the JSON content plus referential-integrity validation.
import terrainJson from './terrain.json'
import stratagemsJson from './stratagems.json'
import officersJson from './officers.json'
import campaignJson from './campaign.json'
import { BATTLE_REGISTRY } from './battles'
import { SCENES } from './scenes'
import { PLAYER_SIDE } from './types'
import type {
  BattleDef,
  CampaignDef,
  Cond,
  GameData,
  OfficerDef,
  StratagemDef,
  TerrainDef,
  TerrainId,
  UnitDef,
} from './types'

export type * from './types'
export { PLAYER_SIDE } from './types'

const terrain = terrainJson as unknown as Record<TerrainId, TerrainDef>
const stratagemList = stratagemsJson as unknown as StratagemDef[]
const officerList = officersJson as unknown as OfficerDef[]

const battles: Record<string, BattleDef> = BATTLE_REGISTRY

export const CAMPAIGN: CampaignDef = campaignJson as unknown as CampaignDef

function indexBy<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const item of list) out[item.id] = item
  return out
}

/** Battle-local officers/stratagems are merged into the shared tables (the validator reports id collisions). */
const mergedOfficers = [...officerList, ...Object.values(battles).flatMap((b) => b.officers ?? [])]
const mergedStratagems = [...stratagemList, ...Object.values(battles).flatMap((b) => b.stratagems ?? [])]
export const GAME_DATA: GameData = {
  terrain,
  stratagems: indexBy(mergedStratagems),
  officers: indexBy(mergedOfficers),
}

export function getBattleDef(id: string): BattleDef | undefined {
  return battles[id]
}

export function listBattleIds(): string[] {
  return Object.keys(battles)
}

/** The nine campaign battle ids, in order. */
export const ARC: string[] = CAMPAIGN.arc

export const ALL_BATTLES: Record<string, BattleDef> = battles
/** The shared tables only (officers.json / stratagems.json); battle-local entries are in GAME_DATA. */
export const ALL_STRATAGEMS: StratagemDef[] = stratagemList
export const ALL_OFFICERS: OfficerDef[] = officerList

const TAGS = ['Strike', 'Charge', 'Volley', 'Fire', 'Shout', 'Ruse', 'Command']
const AREAS = ['single', 'cross', 'sweep', 'adjacent', 'aura', 'ring2', 'self']
const FACINGS = ['N', 'E', 'S', 'W']
const TROOPS = ['infantry', 'cavalry', 'archers']
const TERRAIN_IDS = [
  'plain', 'farm', 'forest', 'hill', 'village', 'road', 'ford', 'river', 'ash',
  'wall', 'rampart', 'gate', 'shallows', 'reeds', 'deck', 'water', 'bridge',
]
const STATS = ['war', 'int', 'lead', 'cha']
const EFFECTS = ['confuse', 'ignite', 'heal', 'dash', 'wind', 'buff', 'provoke']
const SOURCE_RE = /^(Romance( ch\.\d+)?|invented)$/
const BEHAVIOUR_RE = /^(advance|hold|guard:.+|ambush:\d+|pursue:.+|advance-to:\d+,\d+|flee:(west|east|north|south))$/

/** Roster officer ids that can be deployed in the battle at arc index `i` (start roster plus story joins and departs before it). */
export function rosterBefore(i: number): Set<string> {
  const set = new Set(CAMPAIGN.startRoster.map((r) => r.officerId))
  for (let k = 0; k < i && k < CAMPAIGN.arc.length; k++) {
    const st = CAMPAIGN.story[CAMPAIGN.arc[k]!]
    for (const j of st?.joins ?? []) set.add(j)
    for (const d of st?.departs ?? []) set.delete(d)
  }
  return set
}

/** Checks referential integrity and shape of every data file. Returns a list of problems (empty = ok). */
export function validateData(): string[] {
  const errs: string[] = []
  const err = (m: string) => errs.push(m)
  // read the registry live so tests can validate edited copies
  const localOfficers: OfficerDef[] = Object.values(battles).flatMap((b) => b.officers ?? [])
  const localStratagems: StratagemDef[] = Object.values(battles).flatMap((b) => b.stratagems ?? [])

  // terrain
  for (const id of TERRAIN_IDS) {
    const t = (terrain as Record<string, TerrainDef | undefined>)[id]
    if (!t) {
      err(`terrain: missing ${id}`)
      continue
    }
    if (t.id !== id) err(`terrain ${id}: id mismatch (${t.id})`)
    if (t.move !== null)
      for (const k of TROOPS) {
        const c = (t.move as Record<string, number | null>)[k]
        if (c !== null && !(Number(c) >= 1)) err(`terrain ${id}: bad move cost for ${k}`)
      }
    if (!(t.def > 0)) err(`terrain ${id}: bad def`)
    if (!(t.flammability >= 0 && t.flammability <= 1)) err(`terrain ${id}: bad flammability`)
    if (t.burnsTo && !TERRAIN_IDS.includes(t.burnsTo)) err(`terrain ${id}: bad burnsTo`)
  }
  for (const id of Object.keys(terrain)) if (!TERRAIN_IDS.includes(id)) err(`terrain: unknown id ${id}`)

  // id collisions between the shared tables and battle-local ones
  const globalOfficerIds = new Set(officerList.map((o) => o.id))
  const globalStratIds = new Set(stratagemList.map((s) => s.id))
  const seenLocalOfficer = new Map<string, string>()
  const seenLocalStrat = new Map<string, string>()
  for (const [key, b] of Object.entries(battles)) {
    for (const o of b.officers ?? []) {
      if (globalOfficerIds.has(o.id)) err(`battle ${key}: local officer ${o.id} collides with officers.json`)
      const prev = seenLocalOfficer.get(o.id)
      if (prev) err(`battle ${key}: local officer ${o.id} collides with battle ${prev}`)
      seenLocalOfficer.set(o.id, key)
    }
    for (const s of b.stratagems ?? []) {
      if (globalStratIds.has(s.id)) err(`battle ${key}: local stratagem ${s.id} collides with stratagems.json`)
      const prev = seenLocalStrat.get(s.id)
      if (prev) err(`battle ${key}: local stratagem ${s.id} collides with battle ${prev}`)
      seenLocalStrat.set(s.id, key)
    }
  }

  // stratagems (shared + local)
  const seenStrat = new Set<string>()
  for (const s of [...stratagemList, ...localStratagems]) {
    if (seenStrat.has(s.id)) err(`stratagem ${s.id}: duplicate id`)
    seenStrat.add(s.id)
    if (!TAGS.includes(s.tag)) err(`stratagem ${s.id}: bad tag ${s.tag}`)
    if (!AREAS.includes(s.area)) err(`stratagem ${s.id}: bad area ${s.area}`)
    if (!(s.cost >= 0 && s.cost <= 10)) err(`stratagem ${s.id}: bad cost`)
    if (!(s.range.min >= 0 && s.range.max >= s.range.min)) err(`stratagem ${s.id}: bad range`)
    if (!(s.power >= 0)) err(`stratagem ${s.id}: bad power`)
    if (s.power > 0 && s.stat !== 'war' && s.stat !== 'int') err(`stratagem ${s.id}: damaging stratagem needs stat`)
    for (const f of s.follows) if (!TAGS.includes(f)) err(`stratagem ${s.id}: bad follows tag ${f}`)
    for (const e of [s.effect, s.also]) {
      if (!e) continue
      if (!EFFECTS.includes(e.type)) err(`stratagem ${s.id}: bad effect`)
      if (e.type === 'heal' && !(e.pct > 0)) err(`stratagem ${s.id}: heal needs pct`)
      if (e.type === 'buff' && !(STATS.includes(e.stat) && e.amount !== 0 && e.rounds >= 1)) err(`stratagem ${s.id}: bad buff`)
      if (e.type === 'wind' && !((e.dir === 'toward-target' || FACINGS.includes(e.dir)) && (e.strength === 'breeze' || e.strength === 'gale') && e.rounds >= 1))
        err(`stratagem ${s.id}: bad wind`)
      if ((e.type === 'buff' || e.type === 'wind') && s.tag !== 'Command') err(`stratagem ${s.id}: ${e.type} is a Command effect`)
    }
    if (s.also && s.also.type === 'dash') err(`stratagem ${s.id}: dash cannot be an extra effect`)
    if (s.tag === 'Command' && (s.follows.length > 0 || (s.area !== 'aura' && s.area !== 'self'))) err(`stratagem ${s.id}: Command must be aura or self and follow nothing`)
    if (s.area === 'aura' && s.tag !== 'Command') err(`stratagem ${s.id}: only Command may be aura`)
    if (s.area === 'self' && !(s.tag === 'Command' && s.effect?.type === 'wind')) err(`stratagem ${s.id}: self area is for Command wind stratagems`)
    if (s.effect?.type === 'wind' && s.area !== 'self') err(`stratagem ${s.id}: wind needs area self`)
    if ((s.area === 'adjacent' || s.area === 'aura' || s.area === 'ring2') && (s.range.min !== 0 || s.range.max > 2)) err(`stratagem ${s.id}: adjacent/aura/ring2 ranges are caster-centred`)
    if (s.effect?.type === 'dash' && s.area !== 'single') err(`stratagem ${s.id}: dash must be single`)
    if (!s.text) err(`stratagem ${s.id}: missing text`)
  }

  // officers (shared + local)
  const allOfficers = [...officerList, ...localOfficers]
  const officers = indexBy(allOfficers)
  if (Object.keys(officers).length !== allOfficers.length) err('officers: duplicate id')
  for (const o of allOfficers) {
    for (const k of ['war', 'int', 'lead', 'cha'] as const) if (!(Number.isInteger(o[k]) && o[k] >= 1 && o[k] <= 100)) err(`officer ${o.id}: ${k} out of 1..100`)
    if (o.loyalty !== null && !(o.loyalty >= 0 && o.loyalty <= 100)) err(`officer ${o.id}: bad loyalty`)
    if (!SOURCE_RE.test(o.source)) err(`officer ${o.id}: bad source ${o.source}`)
    if ((o.source === 'invented') !== (o.invented === true)) err(`officer ${o.id}: invented flag must match source`)
    if (!o.type || !TROOPS.includes(o.type)) err(`officer ${o.id}: needs a troop type`)
    if (o.stratagems.length < 1 || o.stratagems.length > 3) err(`officer ${o.id}: needs 1-3 stratagems`)
    for (const sid of o.stratagems) if (!seenStrat.has(sid)) err(`officer ${o.id}: unknown stratagem ${sid}`)
    for (const b of o.bonds) {
      if (!officers[b]) err(`officer ${o.id}: unknown bond ${b}`)
      else if (!officers[b]!.bonds.includes(o.id)) err(`officer ${o.id}: bond with ${b} is not mutual`)
    }
    for (const [k, v] of Object.entries(o.growth ?? {})) if (!STATS.includes(k) || !(Number.isInteger(v) && v >= 0 && v <= 5)) err(`officer ${o.id}: bad growth ${k}`)
    let prevLevel = 1
    for (const l of o.learns ?? []) {
      if (!seenStrat.has(l.strat)) err(`officer ${o.id}: learns unknown stratagem ${l.strat}`)
      if (!(Number.isInteger(l.level) && l.level > prevLevel && l.level <= 10)) err(`officer ${o.id}: learns levels must ascend within 2..10`)
      if (o.stratagems.includes(l.strat)) err(`officer ${o.id}: already knows ${l.strat}`)
      prevLevel = l.level
    }
    if (o.recruitable) {
      if (o.loyalty === null) err(`officer ${o.id}: recruitable needs a loyalty so they can be swayed`)
      if (o.invented) err(`officer ${o.id}: invented captains are never recruitable`)
    }
  }

  // battles
  const idsIn = (b: BattleDef): { fixed: UnitDef[]; all: UnitDef[] } => {
    const fixed = b.playerStarts ? b.units.filter((u) => u.side !== PLAYER_SIDE) : b.units
    const all = [...fixed, ...(b.guests ?? []), ...(b.reinforcements ?? []).flatMap((r) => r.units)]
    return { fixed, all }
  }
  const arcIndex = (id: string): number => CAMPAIGN.arc.indexOf(id)
  for (const [key, b] of Object.entries(battles)) {
    const p = `battle ${key}`
    if (b.id !== key) err(`${p}: id mismatch`)
    const height = b.map.length
    const width = b.map[0]?.length ?? 0
    if (height < 4 || width < 4) err(`${p}: map too small`)
    for (let y = 0; y < b.map.length; y++) {
      const row = b.map[y]!
      if (row.length !== width) err(`${p}: map row ${y} must be ${width} chars (is ${row.length})`)
      for (const ch of row) if (!b.legend[ch]) err(`${p}: map row ${y} has unknown char '${ch}'`)
    }
    for (const [ch, t] of Object.entries(b.legend)) {
      if (ch.length !== 1) err(`${p}: legend key '${ch}' must be one char`)
      if (!TERRAIN_IDS.includes(t)) err(`${p}: legend '${ch}' -> unknown terrain ${t}`)
    }
    const inB = (x: number, y: number): boolean => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height
    const terrainAt = (x: number, y: number): TerrainDef | undefined => {
      const ch = b.map[y]?.[x]
      const tid = ch ? b.legend[ch] : undefined
      return tid ? terrain[tid] : undefined
    }
    const hasGate = b.map.some((row) => [...row].some((ch) => b.legend[ch] === 'gate')) || (b.timeline ?? []).some((t) => t.kind === 'terrain' && t.to === 'gate')
    if (hasGate && !b.gateOwner) err(`${p}: has gate tiles but no gateOwner`)
    if (b.gateOwner && !b.sideOrder.includes(b.gateOwner)) err(`${p}: gateOwner not in sideOrder`)
    const canStand = (x: number, y: number, side: string, type: string): boolean => {
      const t = terrainAt(x, y)
      if (!t || t.move === null) return false
      if (t.gate && side !== b.gateOwner) return false
      return (t.move as Record<string, number | null>)[type] !== null
    }
    for (const br of b.bridges) {
      const t = terrainAt(br.x, br.y)
      if (!t || t.move === null) err(`${p}: bridge at ${br.x},${br.y} is not passable`)
    }
    if (!(b.turnLimit >= 1)) err(`${p}: bad turnLimit`)
    if (b.sideOrder.length !== 2 || b.sideOrder[0] === b.sideOrder[1]) err(`${p}: sideOrder must list two distinct sides`)
    if (!b.sideOrder.includes(PLAYER_SIDE)) err(`${p}: sideOrder must include the player side '${PLAYER_SIDE}'`)
    if (!b.sideOrder.includes(b.onTimeout)) err(`${p}: onTimeout not in sideOrder`)
    if (b.sides) {
      const ids = b.sides.map((s) => s.id).sort().join(',')
      if (ids !== [...b.sideOrder].sort().join(',')) err(`${p}: sides must describe exactly the sideOrder ids`)
      for (const s of b.sides) if (!s.name || !s.colourToken) err(`${p}: side ${s.id} needs name and colourToken`)
    } else if (arcIndex(key) >= 0 && b.sideOrder.some((s) => s !== PLAYER_SIDE && s !== 'yellow')) err(`${p}: campaign battle with a non-default enemy side needs sides[]`)
    if (b.wind.length === 0 || b.wind[0]!.round !== 1) err(`${p}: wind schedule must start at round 1`)
    let prev = 0
    for (const w of b.wind) {
      if (!(w.round > prev)) err(`${p}: wind schedule must be strictly ascending`)
      prev = w.round
      if (!['calm', 'breeze', 'gale'].includes(w.strength)) err(`${p}: bad wind strength`)
      if (w.strength === 'calm' ? w.dir !== null : !FACINGS.includes(w.dir ?? '')) err(`${p}: wind round ${w.round}: calm needs null dir, otherwise N/E/S/W`)
    }

    // units
    const { fixed, all } = idsIn(b)
    const ids = new Set<string>()
    const tiles = new Set<string>()
    const commanders: Record<string, number> = {}
    for (const s of b.sideOrder) commanders[s] = 0
    const checkUnit = (u: UnitDef, where: string, placed: boolean): void => {
      if (ids.has(u.id)) err(`${p}: duplicate unit id ${u.id}`)
      ids.add(u.id)
      if (!officers[u.officer]) err(`${p}: ${where} ${u.id} unknown officer ${u.officer}`)
      if (!b.sideOrder.includes(u.side)) err(`${p}: ${where} ${u.id} unknown side ${u.side}`)
      if (!TROOPS.includes(u.type)) err(`${p}: ${where} ${u.id} bad type`)
      if (!FACINGS.includes(u.facing)) err(`${p}: ${where} ${u.id} bad facing`)
      if (!(u.troops > 0)) err(`${p}: ${where} ${u.id} bad troops`)
      if (u.retreatAt !== undefined && !(u.retreatAt > 0 && u.retreatAt < 1)) err(`${p}: ${where} ${u.id} retreatAt must be in (0,1)`)
      if (placed) {
        if (!inB(u.x, u.y)) err(`${p}: ${where} ${u.id} starts off the map`)
        else if (!canStand(u.x, u.y, u.side, u.type)) err(`${p}: ${where} ${u.id} starts on impassable ${terrainAt(u.x, u.y)?.id}`)
        const key2 = `${u.x},${u.y}`
        if (tiles.has(key2)) err(`${p}: two units start on ${key2}`)
        tiles.add(key2)
      }
      if (u.commander) commanders[u.side] = (commanders[u.side] ?? 0) + 1
    }
    for (const u of fixed) checkUnit(u, 'unit', true)
    for (const u of b.guests ?? []) {
      checkUnit(u, 'guest', true)
      if (u.side !== PLAYER_SIDE) err(`${p}: guest ${u.id} must be on the player side`)
      if (u.commander) err(`${p}: guest ${u.id} cannot be the commander`)
    }
    for (const r of b.reinforcements ?? []) for (const u of r.units) checkUnit(u, 'reinforcement', false)

    // campaign deployment
    const idx = arcIndex(key)
    const deployIds = new Set<string>()
    if (b.playerStarts) {
      const slots = b.deploySlots ?? 0
      if (!(slots >= 1)) err(`${p}: deploySlots must be >= 1`)
      if (b.playerStarts.length < slots) err(`${p}: playerStarts (${b.playerStarts.length}) shorter than deploySlots (${slots})`)
      b.playerStarts.forEach((s, i) => {
        if (!FACINGS.includes(s.facing)) err(`${p}: playerStarts[${i}] bad facing`)
        if (!inB(s.x, s.y)) err(`${p}: playerStarts[${i}] off the map`)
        else {
          const t = terrainAt(s.x, s.y)!
          if (t.move === null || (t.gate && PLAYER_SIDE !== b.gateOwner)) err(`${p}: playerStarts[${i}] on impassable ${t.id}`)
          const k = `${s.x},${s.y}`
          if (tiles.has(k)) err(`${p}: playerStarts[${i}] shares a tile (${k})`)
          tiles.add(k)
        }
        if (s.arrivesRound !== undefined && !(Number.isInteger(s.arrivesRound) && s.arrivesRound >= 2 && s.arrivesRound <= b.turnLimit)) err(`${p}: playerStarts[${i}] bad arrivesRound`)
      })
      const req = b.required ?? []
      if (!req.includes('liu-bei')) err(`${p}: required must include liu-bei (the player commander)`)
      if (req.length > slots) err(`${p}: more required officers than deploySlots`)
      const roster = idx >= 0 ? rosterBefore(idx) : null
      for (const id of req) {
        if (!officers[id]) err(`${p}: required officer ${id} unknown`)
        else if (roster && !roster.has(id)) err(`${p}: required officer ${id} is not on the roster at this point of the arc`)
        deployIds.add(id)
      }
      const dd = b.defaultDeploy ?? []
      if (dd.length === 0) err(`${p}: defaultDeploy is empty`)
      if (dd.length > slots) err(`${p}: defaultDeploy longer than deploySlots`)
      for (const id of dd) {
        if (!officers[id]?.type) err(`${p}: defaultDeploy officer ${id} unknown or has no type`)
        deployIds.add(id)
      }
      if (new Set(dd).size !== dd.length) err(`${p}: defaultDeploy has duplicates`)
      for (const id of deployIds) if (ids.has(id)) err(`${p}: deployable officer ${id} also appears as a fixed unit`)
      for (const r of b.reinforcements ?? [])
        if (r.slot !== undefined && (r.side !== PLAYER_SIDE || !(Number.isInteger(r.slot) && r.slot >= 0 && r.slot < b.playerStarts.length)))
          err(`${p}: reinforcement slot ${r.slot} invalid`)
      if (commanders[PLAYER_SIDE] !== 0) err(`${p}: with playerStarts the player commander is liu-bei from the roster; do not list another`)
      commanders[PLAYER_SIDE] = 1
    } else if (b.deploySlots !== undefined || b.required !== undefined || b.defaultDeploy !== undefined) err(`${p}: deploySlots/required/defaultDeploy need playerStarts`)
    for (const s of b.sideOrder) if (commanders[s] !== 1) err(`${p}: side ${s} has ${commanders[s]} commanders (need exactly 1)`)

    const known = new Set<string>([...all.map((u) => u.id), ...deployIds])
    const unitKnown = (id: string, where: string): void => {
      if (!known.has(id)) err(`${p}: ${where} references unknown unit ${id}`)
    }

    // reinforcements
    for (const [i, r] of (b.reinforcements ?? []).entries()) {
      const w = `reinforcements[${i}]`
      if (!(Number.isInteger(r.round) && r.round >= 2 && r.round <= b.turnLimit)) err(`${p}: ${w} bad round`)
      if (!b.sideOrder.includes(r.side)) err(`${p}: ${w} unknown side`)
      if (!Array.isArray(r.entry) || r.entry.length === 0) err(`${p}: ${w} needs entry tiles`)
      for (const [x, y] of r.entry ?? []) if (!inB(x, y)) err(`${p}: ${w} entry ${x},${y} out of bounds`)
      if (r.units.length === 0 && r.slot === undefined) err(`${p}: ${w} has no units`)
      for (const u of r.units) if (u.side !== r.side) err(`${p}: ${w} unit ${u.id} side differs from the wave`)
    }

    // timeline
    for (const [i, t] of (b.timeline ?? []).entries()) {
      const w = `timeline[${i}]`
      if (!(Number.isInteger(t.round) && t.round >= 1 && t.round <= b.turnLimit)) err(`${p}: ${w} bad round`)
      if (t.phase !== 'start' && t.phase !== 'end') err(`${p}: ${w} bad phase`)
      if (t.kind === 'terrain') {
        if (!TERRAIN_IDS.includes(t.to)) err(`${p}: ${w} unknown terrain ${t.to}`)
        if (t.tiles.length === 0) err(`${p}: ${w} has no tiles`)
        for (const [x, y] of t.tiles) if (!inB(x, y)) err(`${p}: ${w} tile ${x},${y} out of bounds`)
      } else if (t.kind === 'ignite') {
        for (const [x, y] of t.tiles) if (!inB(x, y)) err(`${p}: ${w} tile ${x},${y} out of bounds`)
      } else if (t.kind === 'wind') {
        if (t.strength === 'calm' ? t.dir !== null : !FACINGS.includes(t.dir ?? '')) err(`${p}: ${w} bad wind`)
      } else if (t.kind === 'message') {
        if (!t.text) err(`${p}: ${w} message needs text`)
      } else err(`${p}: ${w} unknown kind`)
    }

    // objectives
    if (b.objectives) {
      const o = b.objectives
      if (!Array.isArray(o.win) || o.win.length === 0) err(`${p}: objectives.win must not be empty`)
      const checkCond = (c: Cond, where: string, isLose: boolean): void => {
        switch (c.type) {
          case 'routCommander':
          case 'routAll':
          case 'commanderLost':
            break
          case 'routUnits':
            if (c.units.length === 0) err(`${p}: ${where} routUnits needs units`)
            for (const id of c.units) unitKnown(id, where)
            break
          case 'survive':
          case 'timeout':
            if (!(Number.isInteger(c.round) && c.round >= 1 && c.round <= b.turnLimit)) err(`${p}: ${where} round out of 1..turnLimit`)
            if (c.type === 'survive' && isLose) err(`${p}: ${where} survive is a win condition`)
            if (c.type === 'timeout' && !isLose) err(`${p}: ${where} timeout is a lose condition`)
            break
          case 'hold':
            if (c.tiles.length === 0) err(`${p}: ${where} hold needs tiles`)
            for (const [x, y] of c.tiles) if (!inB(x, y)) err(`${p}: ${where} tile ${x},${y} out of bounds`)
            if (c.round !== undefined && !(c.round >= 1 && c.round <= b.turnLimit)) err(`${p}: ${where} round out of range`)
            if (!isLose && c.round === undefined) err(`${p}: ${where} hold (win) needs a round`)
            break
          case 'escape':
            if (isLose) err(`${p}: ${where} escape is a win condition`)
            if (!(c.count >= 1)) err(`${p}: ${where} escape count must be >= 1`)
            if (c.tiles.length === 0) err(`${p}: ${where} escape needs exit tiles`)
            for (const [x, y] of c.tiles) {
              if (!inB(x, y)) err(`${p}: ${where} exit ${x},${y} out of bounds`)
              else if (!canStand(x, y, PLAYER_SIDE, 'infantry')) err(`${p}: ${where} exit ${x},${y} is impassable`)
            }
            for (const id of c.units ?? []) unitKnown(id, where)
            if ((c.units ?? []).length > c.count) err(`${p}: ${where} lists more units than count`)
            break
          case 'unitLost':
            unitKnown(c.unit, where)
            break
          default:
            err(`${p}: ${where} unknown condition`)
        }
      }
      o.win.forEach((c, i) => checkCond(c, `objectives.win[${i}]`, false))
      ;(o.lose ?? []).forEach((c, i) => checkCond(c, `objectives.lose[${i}]`, true))
    }

    // enemy behaviour hints
    for (const [id, hint] of Object.entries(b.enemyBehaviour ?? {})) {
      unitKnown(id, 'enemyBehaviour')
      if (!BEHAVIOUR_RE.test(hint)) err(`${p}: enemyBehaviour ${id}: bad hint '${hint}'`)
      const m = /^(?:guard|pursue):(.+)$/.exec(hint)
      if (m && !/^\d+,\d+$/.test(m[1]!)) unitKnown(m[1]!, 'enemyBehaviour')
    }

    // campaign fields
    if (idx >= 0) {
      if (!b.title || !b.place || !Array.isArray(b.blurb) || b.blurb.length === 0) err(`${p}: campaign battle needs title, place and blurb`)
      if (!((b.par ?? 0) >= 1)) err(`${p}: campaign battle needs par`)
      if (!b.playerStarts) err(`${p}: campaign battle needs playerStarts`)
      const st = CAMPAIGN.story[key]
      const same = (a: string[] | undefined, c: string[] | undefined): boolean => JSON.stringify(a ?? []) === JSON.stringify(c ?? [])
      if (b.joins && !same(b.joins.map((j) => j.officer), st?.joins)) err(`${p}: joins differ from campaign.json story`)
      if (b.departs && !same(b.departs.map((j) => j.officer), st?.departs)) err(`${p}: departs differ from campaign.json story`)
    }
  }

  // campaign
  const c = CAMPAIGN
  if (c.arc.length === 0) err('campaign: empty arc')
  if (new Set(c.arc).size !== c.arc.length) err('campaign: duplicate battle id in arc')
  for (const id of c.arc) if (!battles[id]) err(`campaign: arc battle ${id} is not in the registry`)
  for (const r of c.startRoster) {
    if (!officers[r.officerId]?.type) err(`campaign: start roster officer ${r.officerId} unknown or has no type`)
    if (!(Number.isInteger(r.level) && r.level >= 1 && r.level <= 10)) err(`campaign: start roster level for ${r.officerId}`)
  }
  for (const [bid, st] of Object.entries(c.story)) {
    if (!c.arc.includes(bid)) err(`campaign: story entry for ${bid} which is not in the arc`)
    for (const id of [...(st.joins ?? []), ...(st.departs ?? [])]) if (!officers[id]) err(`campaign: story ${bid} references unknown officer ${id}`)
  }
  for (const sceneId of [c.prologue, c.epilogue, ...c.arc]) if (!SCENES[sceneId]) err(`campaign: missing scene ${sceneId}`)
  for (const [sid, sc] of Object.entries(SCENES)) {
    for (const part of ['pre', 'post'] as const) {
      if (!Array.isArray(sc[part])) err(`scene ${sid}: ${part} must be an array`)
      if (sc[part].length > 12) err(`scene ${sid}: ${part} too long`)
      for (const l of sc[part]) {
        if (!l.text) err(`scene ${sid}: empty line`)
        if (l.speaker !== 'narrator' && !officers[l.speaker]) err(`scene ${sid}: unknown speaker ${l.speaker}`)
      }
    }
  }

  // [recruitable officers never appear as enemies in a LATER arc battle]
  for (const o of allOfficers) {
    if (!o.recruitable) continue
    let first = -1
    c.arc.forEach((bid, i) => {
      const b = battles[bid]
      if (!b) return
      const enemy = idsIn(b).all.some((u) => u.officer === o.id && u.side !== PLAYER_SIDE)
      if (!enemy) return
      if (first < 0) first = i
      else if (i > first) err(`recruitable ${o.id} appears as an enemy in ${bid}, after first appearing in ${c.arc[first]}`)
    })
  }
  return errs
}
