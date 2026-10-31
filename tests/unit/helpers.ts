// Hand-built battle states for rule tests. Real data tables, synthetic officers.
import { expect } from 'vitest'
import { GAME_DATA } from '../../src/data'
import type { BattleDef, GameData, OfficerDef, Side, TroopType, WindEntry, Facing, UnitDef } from '../../src/data/types'
import {
  createBattleFromDef,
  legalActions,
  step,
  type Action,
  type BattleState,
  type GameEvent,
  type RejectCode,
  type Unit,
} from '../../src/engine'

export interface TU {
  id: string
  side: Side
  type?: TroopType
  x: number
  y: number
  facing?: Facing
  troops?: number
  war?: number
  int?: number
  lead?: number
  cha?: number
  loyalty?: number | null
  strats?: string[]
  bonds?: string[]
  qi?: number
  commander?: boolean
  confused?: boolean
}

export interface MkOpts {
  w?: number
  h?: number
  /** Rows of legend characters (the Daxing Hill legend); defaults to all plain. */
  map?: string[]
  units: TU[]
  wind?: WindEntry[]
  seed?: number
  turnLimit?: number
  /** Side whose phase it is (default han). */
  side?: Side
}

export const LEGEND = {
  '.': 'plain', f: 'farm', T: 'forest', h: 'hill', v: 'village', '=': 'road', '~': 'river', o: 'ford', a: 'ash',
} as const

export function mk(o: MkOpts): BattleState {
  const w = o.w ?? 12
  const h = o.h ?? 12
  const map = o.map ?? Array.from({ length: h }, () => '.'.repeat(w))
  const officers: Record<string, OfficerDef> = { ...GAME_DATA.officers }
  const units: UnitDef[] = []
  const all = [...o.units]
  for (const side of ['han', 'yellow'] as Side[]) {
    if (!all.some((u) => u.side === side && u.commander)) {
      all.push({ id: `${side}-cmd`, side, x: side === 'han' ? 0 : w - 1, y: side === 'han' ? 0 : h - 1, troops: 9990, commander: true })
    }
  }
  for (const u of all) {
    const oid = `o-${u.id}`
    officers[oid] = {
      id: oid, name: u.id, war: u.war ?? 70, int: u.int ?? 50, lead: u.lead ?? 50, cha: u.cha ?? 50,
      loyalty: u.loyalty === undefined ? null : u.loyalty, bonds: (u.bonds ?? []).map((b) => `o-${b}`),
      stratagems: u.strats ?? [], source: 'invented', invented: true,
    }
    units.push({
      id: u.id, officer: oid, side: u.side, type: u.type ?? 'infantry', x: u.x, y: u.y, facing: u.facing ?? 'E',
      troops: u.troops ?? 1000, commander: u.commander ?? false,
    })
  }
  const data: GameData = { ...GAME_DATA, officers }
  const def: BattleDef = {
    id: 'test', name: 'test', year: 0, map, legend: { ...LEGEND }, bridges: [], turnLimit: o.turnLimit ?? 15, onTimeout: 'yellow',
    sideOrder: ['han', 'yellow'], units,
    wind: o.wind ?? [{ round: 1, dir: null, strength: 'calm' }],
  }
  let s = createBattleFromDef(def, data, o.seed ?? 1)
  // createBattleFromDef already applied the start of han's phase (+2 Qi). Tests set Qi explicitly.
  s = { ...s, units: s.units.map((u) => ({ ...u, qi: all.find((x) => x.id === u.id)!.qi ?? 0, confused: all.find((x) => x.id === u.id)!.confused ?? false })) }
  if (o.side === 'yellow') s = { ...s, side: 'yellow', phaseIndex: 1 }
  return s
}

export function act(s: BattleState, a: Action): { state: BattleState; events: GameEvent[] } {
  const r = step(s, a)
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message} for ${JSON.stringify(a)}`)
  return { state: r.state, events: r.events }
}

export function reject(s: BattleState, a: Action, code: RejectCode): void {
  const r = step(s, a)
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.code).toBe(code)
}

export function u(s: BattleState, id: string): Unit {
  const f = s.units.find((x) => x.id === id)
  if (!f) throw new Error(`no unit ${id}`)
  return f
}

export function kinds(events: GameEvent[]): string[] {
  return events.map((e) => e.kind)
}

export function ev<K extends GameEvent['kind']>(events: GameEvent[], kind: K): Extract<GameEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind)
}

/** End phases until it is `side`'s phase in the given round (uses real step calls). */
export function endPhases(s: BattleState, n: number): BattleState {
  let cur = s
  for (let i = 0; i < n; i++) cur = act(cur, { type: 'endPhase' }).state
  return cur
}

export function strat(unit: string, strat: string, x: number, y: number, excludeFromChain: string[] = []): Action {
  return { type: 'stratagem', unit, strat, x, y, excludeFromChain }
}

/** Replace fields on one unit (returns a new state). */
export function patch(s: BattleState, id: string, p: Partial<Unit>): BattleState {
  return { ...s, units: s.units.map((x) => (x.id === id ? { ...x, ...p } : x)) }
}

export function burnAt(s: BattleState, x: number, y: number): number {
  return s.burn[y * s.grid.width + x]!
}

export function setBurn(s: BattleState, x: number, y: number, n: number): BattleState {
  const burn = s.burn.slice()
  burn[y * s.grid.width + x] = n
  return { ...s, burn }
}

/** legalActions restricted to the given units (plus endPhase); hides the auto-added commanders. */
export function legalOf(s: BattleState, ...ids: string[]): Action[] {
  return legalActions(s).filter((a) => a.type === 'endPhase' || ids.includes((a as { unit: string }).unit))
}
