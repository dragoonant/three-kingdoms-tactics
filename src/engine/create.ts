import { GAME_DATA, getBattleDef } from '../data'
import type { BattleDef, CreateOptions, DeployEntry, GameData, OfficerDef, PlayerStart, RunModifiers, UnitDef } from '../data/types'
import { PLAYER_SIDE } from '../data/types'
import { seedRng } from './rng'
import type { BattleState, Grid, PendingReinforcement, Terrain } from './types'
import { startPhase } from './turn'
import { windForRound } from './fire'
import { gainQi, unitFromDef } from './ops'
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

const round10 = (n: number): number => Math.round(n / 10) * 10

/** [RL-MOD-4] Is this unit removed by the run? Commanders never are. */
function removedByRun(run: RunModifiers | undefined, u: UnitDef): boolean {
  const ids = run?.removeUnits
  if (!ids || ids.length === 0 || u.commander) return false
  return ids.includes(u.id) || ids.includes(u.officer)
}

/** [RL-MOD-2] Troops of a non-player unit scaled by the run, rounded to 10 (min 10, troops <= max). */
function scaledByRun(run: RunModifiers | undefined, u: UnitDef): UnitDef {
  const k = run?.enemyTroopScale
  if (k === undefined || k === 1 || !(k > 0) || u.side === PLAYER_SIDE) return u
  const max = Math.max(10, round10((u.maxTroops ?? u.troops) * k))
  const troops = Math.min(max, Math.max(10, round10(u.troops * k)))
  return { ...u, troops, maxTroops: max }
}

/** [RL-MOD-1] Start-Qi bonus of a player-side unit: startQiAll for deployed officers, plus startQi[officer] for anyone listed. */
function qiBonusOf(run: RunModifiers | undefined, officer: string, deployed: boolean): number {
  if (!run) return 0
  return (deployed ? (run.startQiAll ?? 0) : 0) + (run.startQi?.[officer] ?? 0)
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
  const run = options?.run
  const defs: UnitDef[] = []
  const pending: PendingReinforcement[] = []
  /** Unit ids of deployed officers (RL-MOD-1 startQiAll applies to them, not to guests). */
  const deployedIds = new Set<string>()
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
      deployedIds.add(ud.id)
      if (st.arrivesRound !== undefined) {
        pending.push({ round: st.arrivesRound, side: PLAYER_SIDE, units: [ud], entry: [[st.x, st.y]] })
      } else if (!heldBack.has(i)) defs.push(ud)
    })
    if (changed) tables = { ...data, officers }
    for (const g of def.guests ?? []) if (!removedByRun(run, g)) defs.push(g)
    for (const u of def.units) if (u.side !== PLAYER_SIDE && !removedByRun(run, u)) defs.push(scaledByRun(run, u))
    for (const r of def.reinforcements ?? []) {
      const units = r.units.filter((u) => !removedByRun(run, u)).map((u) => scaledByRun(run, u))
      if (r.slot !== undefined) {
        const d = deploy[r.slot]
        if (d) {
          const ud = deployUnit(d, { x: r.entry[0]![0], y: r.entry[0]![1], facing: starts[r.slot]?.facing ?? 'E' }, data)
          deployedIds.add(ud.id)
          units.unshift(ud)
        }
      }
      pending.push({ round: r.round, side: r.side, units, entry: r.entry.map(([x, y]) => [x, y] as [number, number]) })
    }
  } else {
    for (const u of def.units) if (!removedByRun(run, u)) defs.push(scaledByRun(run, u))
    for (const r of def.reinforcements ?? [])
      pending.push({
        round: r.round,
        side: r.side,
        units: r.units.filter((u) => !removedByRun(run, u)).map((u) => scaledByRun(run, u)),
        entry: r.entry.map(([x, y]) => [x, y] as [number, number]),
      })
  }
  // [RL-MOD-1] late-arriving player units carry their start-Qi bonus to the arrival.
  if (run) {
    for (const p of pending) {
      if (p.side !== PLAYER_SIDE) continue
      for (const u of p.units) {
        const b = qiBonusOf(run, u.officer, deployedIds.has(u.id))
        if (b !== 0) p.qiBonus = { ...(p.qiBonus ?? {}), [u.id]: b }
      }
    }
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
  if (run) {
    // [RL-MOD-1] after the battle's own start Qi
    for (const u of state.units) {
      if (u.side !== PLAYER_SIDE) continue
      const b = qiBonusOf(run, u.officer, deployedIds.has(u.id))
      if (b !== 0) gainQi(u, b)
    }
    // [RL-MOD-3]
    if (run.swayBonus) state.swayBonus = run.swayBonus
  }
  return state
}

/** [contract] createBattle(battleId, seed, options?). Throws only for an unknown battle id (a programming error). */
export function createBattle(battleId: string, seed: number, options?: CreateOptions): BattleState {
  const def = getBattleDef(battleId)
  if (!def) throw new Error(`unknown battle: ${battleId}`)
  return createBattleFromDef(def, GAME_DATA, seed, options)
}
