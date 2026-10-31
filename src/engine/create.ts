import { GAME_DATA, getBattleDef } from '../data'
import type { BattleDef, GameData } from '../data/types'
import { seedRng } from './rng'
import type { BattleState, Grid, Terrain, Unit } from './types'
import { startPhase } from './turn'
import { windForRound } from './fire'

/** Build a battle from an explicit definition and data tables (tests use this with hand-made data). */
export function createBattleFromDef(def: BattleDef, data: GameData, seed: number): BattleState {
  const height = def.map.length
  const width = def.map[0]?.length ?? 0
  const tiles: Grid['tiles'] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = def.map[y]![x]!
      tiles.push({ x, y, terrain: (def.legend[ch] ?? 'plain') as Terrain })
    }
  }
  const units: Unit[] = def.units.map((d) => ({
    id: d.id,
    officer: d.officer,
    side: d.side,
    type: d.type,
    x: d.x,
    y: d.y,
    facing: d.facing,
    troops: d.troops,
    maxTroops: d.troops,
    qi: 0,
    commander: d.commander,
    confused: false,
    moved: false,
    done: false,
    undo: null,
  }))
  const state: BattleState = {
    battleId: def.id,
    seed,
    rng: seedRng(seed),
    grid: { width, height, tiles },
    burn: new Array<number>(width * height).fill(0),
    units,
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
    data,
  }
  state.wind = windForRound(state, 1)
  // The first phase starts immediately (Qi +2). Its phaseStarted event is not returned.
  startPhase(state, [])
  return state
}

/** [contract] createBattle(battleId, seed). Throws only for an unknown battle id (a programming error). */
export function createBattle(battleId: string, seed: number): BattleState {
  const def = getBattleDef(battleId)
  if (!def) throw new Error(`unknown battle: ${battleId}`)
  return createBattleFromDef(def, GAME_DATA, seed)
}
