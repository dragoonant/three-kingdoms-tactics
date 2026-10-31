// Typed loader for the JSON content plus referential-integrity validation.
import terrainJson from './terrain.json'
import stratagemsJson from './stratagems.json'
import officersJson from './officers.json'
import daxingHillJson from './battles/daxing-hill.json'
import type {
  BattleDef,
  GameData,
  OfficerDef,
  StratagemDef,
  TerrainDef,
  TerrainId,
} from './types'

export type * from './types'

const terrain = terrainJson as unknown as Record<TerrainId, TerrainDef>
const stratagemList = stratagemsJson as unknown as StratagemDef[]
const officerList = officersJson as unknown as OfficerDef[]

const battles: Record<string, BattleDef> = {
  'daxing-hill': daxingHillJson as unknown as BattleDef,
}

function indexBy<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const item of list) out[item.id] = item
  return out
}

export const GAME_DATA: GameData = {
  terrain,
  stratagems: indexBy(stratagemList),
  officers: indexBy(officerList),
}

export function getBattleDef(id: string): BattleDef | undefined {
  return battles[id]
}

export function listBattleIds(): string[] {
  return Object.keys(battles)
}

export const ALL_BATTLES: Record<string, BattleDef> = battles
export const ALL_STRATAGEMS: StratagemDef[] = stratagemList
export const ALL_OFFICERS: OfficerDef[] = officerList

const TAGS = ['Strike', 'Charge', 'Volley', 'Fire', 'Shout', 'Ruse', 'Command']
const AREAS = ['single', 'cross', 'sweep', 'adjacent', 'aura']
const FACINGS = ['N', 'E', 'S', 'W']
const TROOPS = ['infantry', 'cavalry', 'archers']
const TERRAIN_IDS = ['plain', 'farm', 'forest', 'hill', 'village', 'road', 'ford', 'river', 'ash']
const SOURCES = ['Romance ch.1', 'invented']

/** Checks referential integrity and shape of every data file. Returns a list of problems (empty = ok). */
export function validateData(): string[] {
  const errs: string[] = []
  const err = (m: string) => errs.push(m)

  // terrain
  for (const id of TERRAIN_IDS) {
    const t = (terrain as Record<string, TerrainDef | undefined>)[id]
    if (!t) {
      err(`terrain: missing ${id}`)
      continue
    }
    if (t.id !== id) err(`terrain ${id}: id mismatch (${t.id})`)
    if (t.move !== null) for (const k of TROOPS) if (!(Number((t.move as Record<string, number>)[k]) >= 1)) err(`terrain ${id}: bad move cost for ${k}`)
    if (!(t.def > 0)) err(`terrain ${id}: bad def`)
    if (!(t.flammability >= 0 && t.flammability <= 1)) err(`terrain ${id}: bad flammability`)
  }
  for (const id of Object.keys(terrain)) if (!TERRAIN_IDS.includes(id)) err(`terrain: unknown id ${id}`)

  // stratagems
  const seenStrat = new Set<string>()
  for (const s of stratagemList) {
    if (seenStrat.has(s.id)) err(`stratagem ${s.id}: duplicate id`)
    seenStrat.add(s.id)
    if (!TAGS.includes(s.tag)) err(`stratagem ${s.id}: bad tag ${s.tag}`)
    if (!AREAS.includes(s.area)) err(`stratagem ${s.id}: bad area ${s.area}`)
    if (!(s.cost >= 0 && s.cost <= 10)) err(`stratagem ${s.id}: bad cost`)
    if (!(s.range.min >= 0 && s.range.max >= s.range.min)) err(`stratagem ${s.id}: bad range`)
    if (!(s.power >= 0)) err(`stratagem ${s.id}: bad power`)
    if (s.power > 0 && s.stat !== 'war' && s.stat !== 'int') err(`stratagem ${s.id}: damaging stratagem needs stat`)
    for (const f of s.follows) if (!TAGS.includes(f)) err(`stratagem ${s.id}: bad follows tag ${f}`)
    if (s.effect) {
      if (!['confuse', 'ignite', 'heal', 'dash'].includes(s.effect.type)) err(`stratagem ${s.id}: bad effect`)
      if (s.effect.type === 'heal' && !(s.effect.pct > 0)) err(`stratagem ${s.id}: heal needs pct`)
    }
    if (s.tag === 'Command' && (s.follows.length > 0 || s.area !== 'aura')) err(`stratagem ${s.id}: Command must be aura and follow nothing`)
    if (s.area === 'aura' && s.tag !== 'Command') err(`stratagem ${s.id}: only Command may be aura`)
    if ((s.area === 'adjacent' || s.area === 'aura') && (s.range.min !== 0 || s.range.max > 2)) err(`stratagem ${s.id}: adjacent/aura ranges are caster-centred`)
    if (s.effect?.type === 'dash' && s.area !== 'single') err(`stratagem ${s.id}: dash must be single`)
    if (!s.text) err(`stratagem ${s.id}: missing text`)
  }

  // officers
  const officers = indexBy(officerList)
  if (Object.keys(officers).length !== officerList.length) err('officers: duplicate id')
  for (const o of officerList) {
    for (const k of ['war', 'int', 'lead', 'cha'] as const) if (!(Number.isInteger(o[k]) && o[k] >= 1 && o[k] <= 100)) err(`officer ${o.id}: ${k} out of 1..100`)
    if (o.loyalty !== null && !(o.loyalty >= 0 && o.loyalty <= 100)) err(`officer ${o.id}: bad loyalty`)
    if (!SOURCES.includes(o.source)) err(`officer ${o.id}: bad source ${o.source}`)
    if ((o.source === 'invented') !== (o.invented === true)) err(`officer ${o.id}: invented flag must match source`)
    if (o.stratagems.length < 1 || o.stratagems.length > 3) err(`officer ${o.id}: needs 1-3 stratagems`)
    for (const sid of o.stratagems) if (!seenStrat.has(sid)) err(`officer ${o.id}: unknown stratagem ${sid}`)
    for (const b of o.bonds) {
      if (!officers[b]) err(`officer ${o.id}: unknown bond ${b}`)
      else if (!officers[b]!.bonds.includes(o.id)) err(`officer ${o.id}: bond with ${b} is not mutual`)
    }
  }

  // battles
  for (const [key, b] of Object.entries(battles)) {
    const p = `battle ${key}`
    if (b.id !== key) err(`${p}: id mismatch`)
    if (!(b.map.length === 12)) err(`${p}: map must have 12 rows (has ${b.map.length})`)
    const width = b.map[0]?.length ?? 0
    for (let y = 0; y < b.map.length; y++) {
      const row = b.map[y]!
      if (row.length !== 14) err(`${p}: map row ${y} must be 14 chars (is ${row.length})`)
      for (const ch of row) if (!b.legend[ch]) err(`${p}: map row ${y} has unknown char '${ch}'`)
    }
    for (const [ch, t] of Object.entries(b.legend)) {
      if (ch.length !== 1) err(`${p}: legend key '${ch}' must be one char`)
      if (!TERRAIN_IDS.includes(t)) err(`${p}: legend '${ch}' -> unknown terrain ${t}`)
    }
    const terrainAt = (x: number, y: number): TerrainDef | undefined => {
      const ch = b.map[y]?.[x]
      const tid = ch ? b.legend[ch] : undefined
      return tid ? terrain[tid] : undefined
    }
    for (const br of b.bridges) {
      const t = terrainAt(br.x, br.y)
      if (!t || t.move === null) err(`${p}: bridge at ${br.x},${br.y} is not passable`)
    }
    if (!(b.turnLimit >= 1)) err(`${p}: bad turnLimit`)
    if (b.sideOrder.length !== 2 || b.sideOrder[0] === b.sideOrder[1]) err(`${p}: sideOrder must list two distinct sides`)
    if (!b.sideOrder.includes(b.onTimeout)) err(`${p}: onTimeout not in sideOrder`)
    if (b.wind.length === 0 || b.wind[0]!.round !== 1) err(`${p}: wind schedule must start at round 1`)
    let prev = 0
    for (const w of b.wind) {
      if (!(w.round > prev)) err(`${p}: wind schedule must be strictly ascending`)
      prev = w.round
      if (!['calm', 'breeze', 'gale'].includes(w.strength)) err(`${p}: bad wind strength`)
      if (w.strength === 'calm' ? w.dir !== null : !FACINGS.includes(w.dir ?? '')) err(`${p}: wind round ${w.round}: calm needs null dir, otherwise N/E/S/W`)
    }
    const ids = new Set<string>()
    const tiles = new Set<string>()
    const commanders: Record<string, number> = {}
    for (const s of b.sideOrder) commanders[s] = 0
    for (const u of b.units) {
      if (ids.has(u.id)) err(`${p}: duplicate unit id ${u.id}`)
      ids.add(u.id)
      if (!officers[u.officer]) err(`${p}: unit ${u.id} unknown officer ${u.officer}`)
      if (!b.sideOrder.includes(u.side)) err(`${p}: unit ${u.id} unknown side ${u.side}`)
      if (!TROOPS.includes(u.type)) err(`${p}: unit ${u.id} bad type`)
      if (!FACINGS.includes(u.facing)) err(`${p}: unit ${u.id} bad facing`)
      if (!(u.troops > 0)) err(`${p}: unit ${u.id} bad troops`)
      const t = terrainAt(u.x, u.y)
      if (!t) err(`${p}: unit ${u.id} starts off the map`)
      else if (t.move === null) err(`${p}: unit ${u.id} starts on impassable ${t.id}`)
      const key2 = `${u.x},${u.y}`
      if (tiles.has(key2)) err(`${p}: two units start on ${key2}`)
      tiles.add(key2)
      if (u.commander) commanders[u.side] = (commanders[u.side] ?? 0) + 1
    }
    for (const s of b.sideOrder) if (commanders[s] !== 1) err(`${p}: side ${s} has ${commanders[s]} commanders (need exactly 1)`)
    void width
  }
  return errs
}
