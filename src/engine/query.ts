// query.* owns every number the UI shows.
import { alliesOf, cloneWork, getUnit, officerOf, unitAt } from './board'
import { attackTargets as attackTargetUnits, previewAttack } from './combat'
import { fireForecast, windInfo } from './fire'
import { moveOptions } from './movement'
import { EXPECTED_ROLLER } from './rng'
import { evalLink, healAmount, legalAnchors, runStratagem } from './stratagems'
import { previewSway, swayTargets as swayTargetUnits } from './sway'
import type {
  AttackPreview,
  BattleState,
  FireForecast,
  MoveOption,
  Pos,
  StratagemOption,
  StratagemPreview,
  SwayPreview,
  Unit,
  WindInfo,
} from './types'
import { areaTiles } from './geometry'

function canAct(u: Unit | undefined): u is Unit {
  return !!u && !u.done && !u.confused
}

/** Reachable tiles (excluding the start tile) with cost; [] if the unit cannot move now. */
export function moveRange(state: BattleState, unitId: string): MoveOption[] {
  const u = getUnit(state, unitId)
  if (!canAct(u) || u.moved) return []
  return moveOptions(state, u)
}

/** Ids of enemies the unit can attack from where it stands. */
export function attackTargets(state: BattleState, unitId: string): string[] {
  const u = getUnit(state, unitId)
  if (!canAct(u)) return []
  return attackTargetUnits(state, u).map((t) => t.id)
}

export function attackPreview(state: BattleState, unitId: string, targetId: string): AttackPreview | null {
  const u = getUnit(state, unitId)
  const t = getUnit(state, targetId)
  if (!u || !t) return null
  return previewAttack(state, u, t)
}

/** Legal anchor tiles (empty if the unit lacks the stratagem or the Qi). */
export function stratagemTargets(state: BattleState, unitId: string, stratId: string): Pos[] {
  const u = getUnit(state, unitId)
  const s = state.data.stratagems[stratId]
  if (!canAct(u) || !s || !officerOf(state, u).stratagems.includes(s.id) || u.qi < s.cost) return []
  return legalAnchors(state, u, s)
}

/** Each stratagem the unit knows, with whether it can be cast right now. */
export function stratagemOptions(state: BattleState, unitId: string): StratagemOption[] {
  const u = getUnit(state, unitId)
  if (!u) return []
  return officerOf(state, u).stratagems.flatMap((sid) => {
    const s = state.data.stratagems[sid]
    if (!s) return []
    let reason: string | undefined
    if (u.confused) reason = 'Confused'
    else if (u.done) reason = 'Already acted'
    else if (u.qi < s.cost) reason = `Needs ${s.cost} Qi`
    else if (legalAnchors(state, u, s).length === 0) reason = 'No valid target'
    return [{ id: s.id, name: s.name, cost: s.cost, usable: reason === undefined, ...(reason ? { reason } : {}) }]
  })
}

export function stratagemPreview(
  state: BattleState,
  unitId: string,
  stratId: string,
  target: Pos,
  excludeFromChain: string[] = [],
): StratagemPreview | null {
  const u = getUnit(state, unitId)
  const s = state.data.stratagems[stratId]
  if (!canAct(u) || !s || !officerOf(state, u).stratagems.includes(s.id) || u.qi < s.cost) return null
  if (!legalAnchors(state, u, s).some((a) => a.x === target.x && a.y === target.y)) return null
  const anchor = { x: target.x, y: target.y }
  if (s.tag === 'Command') {
    const tiles = areaTiles('aura', u, u, s.range.max).filter((t) => t.x >= 0 && t.y >= 0 && t.x < state.grid.width && t.y < state.grid.height)
    const pct = s.effect?.type === 'heal' ? s.effect.pct : 0
    const heals = alliesOf(state, u.side)
      .filter((a) => tiles.some((t) => t.x === a.x && t.y === a.y))
      .map((a) => ({ unit: a.id, amount: healAmount(a, pct) }))
      .filter((h) => h.amount > 0)
    return {
      unit: u.id, strat: s.id, anchor, cost: s.cost, tiles, targets: [], dashTo: null, ignites: false, heals, chain: [], totalExpected: 0,
    }
  }
  const ev0 = evalLink(state, u, s, anchor, 0, false)
  const sim = cloneWork(state)
  const links = runStratagem(sim, [], EXPECTED_ROLLER, getUnit(sim, u.id)!, s, anchor, excludeFromChain)
  const chain = links.map((l) => ({
    link: l.link,
    unit: l.unit,
    strat: l.strat,
    target: l.anchor,
    tiles: l.tiles,
    bond: l.bond,
    multiplier: l.multiplier,
    expected: l.damage,
  }))
  return {
    unit: u.id,
    strat: s.id,
    anchor,
    cost: s.cost,
    tiles: ev0.tiles,
    targets: ev0.targets.map((t) => ({
      unit: t.unit.id,
      min: t.min,
      max: t.max,
      expected: t.expected,
      multipliers: t.calc ? t.calc.multipliers : [],
      ...(t.arc ? { arc: t.arc } : {}),
      foresightChance: t.foresightChance,
      confuseChance: t.confuseChance,
      routsAtMax: t.max >= t.unit.troops && t.max > 0,
    })),
    dashTo: ev0.dashTo,
    ignites: s.effect?.type === 'ignite',
    heals: [],
    chain,
    totalExpected: chain.reduce((n, l) => n + l.expected, 0),
  }
}

export function swayTargets(state: BattleState, unitId: string): string[] {
  const u = getUnit(state, unitId)
  if (!canAct(u)) return []
  return swayTargetUnits(state, u).map((t) => t.id)
}

export function swayChance(state: BattleState, unitId: string, targetId: string): SwayPreview | null {
  const u = getUnit(state, unitId)
  const t = getUnit(state, targetId)
  if (!u || !t) return null
  return previewSway(state, u, t)
}

export function wind(state: BattleState): WindInfo {
  return windInfo(state)
}

export { fireForecast }

export function unitAtTile(state: BattleState, x: number, y: number): Unit | undefined {
  return unitAt(state, x, y)
}

export function readyUnits(state: BattleState, side = state.side): Unit[] {
  return state.units.filter((u) => u.side === side && !u.done && !u.confused)
}

export const query = {
  moveRange,
  attackTargets,
  attackPreview,
  stratagemTargets,
  stratagemOptions,
  stratagemPreview,
  swayTargets,
  swayChance,
  fireForecast: (state: BattleState): FireForecast => fireForecast(state),
  wind,
  unitAt: unitAtTile,
  readyUnits,
}
