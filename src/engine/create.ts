import { GAME_DATA, getBattleDef } from '../data'
import type { BattleDef, CreateOptions, DeployEntry, GameData, OfficerDef, PlayerStart, UnitDef } from '../data/types'
import { PLAYER_SIDE } from '../data/types'
import { seedRng } from './rng'
import type { BattleState, Grid, PendingReinforcement, Terrain } from './types'
import { startPhase } from './turn'
import { windForRound } from './fire'
import { unitFromDef } from './ops'
import { fireTimeline } from './terrain'

/** The player's commander in every campaign battle. */
export const PLAYER_COMMANDER = 'liu-bei'
/** Troops of a roster officer deployed without options (tests, sim, quick battle). */
export const DEFAULT_TROOPS = 2000

const capStat = (v: number): number => Math.max(1, Math.min(100, v))

/** The deploy entries used when no options.deploy is given. */
export function defaultDeployEntries(def: BattleDef, data: GameData): DeployEntry[] {
  return (def.defaultDeploy ?? []).map((id) => ({
    officerId: id,
    level: 1,
    statBonus: { war: 0, int: 0, lead: 0, cha: 0 },
    maxTroops: DEFAULT_TROOPS,
    troops: DEFAULT_TROOPS,
    stratagems: (data.officers[id]?.stratagems ?? []).slice(),
  }))
}

function deployUnit(d: DeployEntry, st: PlayerStart, data: GameData): UnitDef {
  return {
    id: d.officerId,
    officer: d.officerId,
    side: PLAYER_SIDE,
    type: data.officers[d.officerId]?.type ?? 'infantry',
    x: st.x,
    y: st.y,
    facing: st.facing,
    troops: d.troops,
    maxTroops: d.maxTroops,
    commander: d.officerId === PLAYER_COMMANDER,
  }
}

/** Officer record as deployed: base + statBonus (cap 100) and the chosen stratagems. */
function deployedOfficer(base: OfficerDef, d: DeployEntry): OfficerDef | null {
  const b = d.statBonus
  const same =
    b.war === 0 && b.int === 0 && b.lead === 0 && b.cha === 0 &&
    d.stratagems.length === base.stratagems.length && d.stratagems.every((s, i) => s === base.stratagems[i])
  if (same) return null
  return {
    ...base,
    war: capStat(base.war + b.war),
    int: capStat(base.int + b.int),
    lead: capStat(base.lead + b.lead),
    cha: capStat(base.cha + b.cha),
    stratagems: d.stratagems.slice(),
  }
}

/** Build a battle from an explicit definition and data tables (tests use this with hand-made data). */
export function createBattleFromDef(def: BattleDef, data: GameData, seed: number, options?: CreateOptions): BattleState {
  const height = def.map.length
  const width = def.map[0]?.length ?? 0
  const tiles: Grid['tiles'] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = def.map[y]![x]!
      tiles.push({ x, y, terrain: (def.legend[ch] ?? 'plain') as Terrain })
    }
  }

  // ---- who starts where. With playerStarts the player side is deploy + guests; otherwise `units` is everything.
  const defs: UnitDef[] = []
  const pending: PendingReinforcement[] = []
  let tables = data
  const starts = def.playerStarts
  if (starts) {
    const deploy = (options?.deploy ?? defaultDeployEntries(def, data)).slice(0, starts.length)
    const heldBack = new Set((def.reinforcements ?? []).filter((r) => r.side === PLAYER_SIDE && r.slot !== undefined).map((r) => r.slot!))
    const officers: Record<string, OfficerDef> = { ...data.officers }
    let changed = false
    deploy.forEach((d, i) => {
      const base = data.officers[d.officerId]
      if (base) {
        const o = deployedOfficer(base, d)
        if (o) {
          officers[d.officerId] = o
          changed = true
        }
      }
      const st = starts[i]!
      const ud = deployUnit(d, st, data)
      if (st.arrivesRound !== undefined) {
        pending.push({ round: st.arrivesRound, side: PLAYER_SIDE, units: [ud], entry: [[st.x, st.y]] })
      } else if (!heldBack.has(i)) defs.push(ud)
    })
    if (changed) tables = { ...data, officers }
    for (const g of def.guests ?? []) defs.push(g)
    for (const u of def.units) if (u.side !== PLAYER_SIDE) defs.push(u)
    for (const r of def.reinforcements ?? []) {
      const units = r.units.slice()
      if (r.slot !== undefined) {
        const d = deploy[r.slot]
        if (d) units.unshift(deployUnit(d, { x: r.entry[0]![0], y: r.entry[0]![1], facing: starts[r.slot]?.facing ?? 'E' }, data))
      }
      pending.push({ round: r.round, side: r.side, units, entry: r.entry.map(([x, y]) => [x, y] as [number, number]) })
    }
  } else {
    for (const u of def.units) defs.push(u)
    for (const r of def.reinforcements ?? [])
      pending.push({ round: r.round, side: r.side, units: r.units.slice(), entry: r.entry.map(([x, y]) => [x, y] as [number, number]) })
  }
  pending.sort((a, b) => a.round - b.round)

  const commanders: Record<string, string> = {}
  for (const u of [...defs, ...pending.flatMap((p) => p.units)]) if (u.commander) commanders[u.side] = u.id

  const state: BattleState = {
    battleId: def.id,
    seed,
    rng: seedRng(seed),
    grid: { width, height, tiles },
    burn: new Array<number>(width * height).fill(0),
    units: defs.map(unitFromDef),
    defeated: [],
    round: 1,
    turnLimit: def.turnLimit,
    sideOrder: def.sideOrder.slice(),
    phaseIndex: 0,
    side: def.sideOrder[0]!,
    onTimeout: def.onTimeout,
    windSchedule: def.wind.map((w) => ({ ...w })),
    wind: { dir: null, strength: 'calm' },
    swayTried: [],
    result: null,
    data: tables,
    sides: (def.sides ?? def.sideOrder.map((id) => ({ id, name: id, colourToken: id }))).map((s) => ({ ...s })),
    gateOwner: def.gateOwner ?? null,
    objectives: def.objectives ? JSON.parse(JSON.stringify(def.objectives)) : null,
    reinforcements: pending,
    timeline: def.timeline ?? [],
    escaped: [],
    retreated: [],
    windUntil: null,
    opening: [],
    commanders,
    enemyBehaviour: def.enemyBehaviour ?? {},
  }
  state.wind = windForRound(state, 1)
  // The first phase starts immediately (Qi +2) after round-1 'start' timeline items. Their events go to state.opening;
  // the phaseStarted event is not returned.
  const ev: BattleState['opening'] = []
  fireTimeline(state, ev, 1, 'start')
  startPhase(state, ev)
  state.opening = ev.filter((e) => e.kind !== 'phaseStarted')
  return state
}

/** [contract] createBattle(battleId, seed, options?). Throws only for an unknown battle id (a programming error). */
export function createBattle(battleId: string, seed: number, options?: CreateOptions): BattleState {
  const def = getBattleDef(battleId)
  if (!def) throw new Error(`unknown battle: ${battleId}`)
  return createBattleFromDef(def, GAME_DATA, seed, options)
}
