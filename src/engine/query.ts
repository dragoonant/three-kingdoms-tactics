// query.* owns every number the UI shows.
import { PLAYER_SIDE } from '../data/types'
import { alliesOf, cloneWork, getUnit, officerOf, unitAt } from './board'
import { attackTargets as attackTargetUnits, previewAttack } from './combat'
import { fireForecast, windInfo } from './fire'
import { moveOptions } from './movement'
import { EXPECTED_ROLLER } from './rng'
import { effectOf, evalLink, healAmount, ignitable, legalAnchors, runStratagem, windDirFor } from './stratagems'
import { isExitTile, objectiveStatuses } from './objectives'
import { previewSway, swayTargets as swayTargetUnits } from './sway'
import type {
  AttackPreview,
  BattleState,
  FireForecast,
  MoveOption,
  Pos,
  ObjectiveStatus,
  StratagemOption,
  StratagemPreview,
  TimelineItemPreview,
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
    const selfArea = s.area === 'self'
    const tiles = selfArea
      ? [{ x: u.x, y: u.y }]
      : areaTiles('aura', u, u, s.range.max).filter((t) => t.x >= 0 && t.y >= 0 && t.x < state.grid.width && t.y < state.grid.height)
    const heal = effectOf(s, 'heal')
    const buff = effectOf(s, 'buff')
    const wind = effectOf(s, 'wind')
    const inAura = alliesOf(state, u.side).filter((a) => tiles.some((t) => t.x === a.x && t.y === a.y))
    const heals = heal
      ? inAura.map((a) => ({ unit: a.id, amount: healAmount(a, heal.pct) })).filter((h) => h.amount > 0)
      : []
    const pv: StratagemPreview = {
      unit: u.id, strat: s.id, anchor, cost: s.cost, tiles, targets: [], dashTo: null, ignites: false, heals, chain: [], totalExpected: 0,
    }
    if (buff) pv.buffs = inAura.map((a) => ({ unit: a.id, stat: buff.stat, amount: buff.amount, rounds: buff.rounds }))
    if (wind) pv.wind = { dir: windDirFor(s, u, anchor)!, strength: wind.strength, rounds: wind.rounds }
    return pv
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
      ...(effectOf(s, 'provoke') ? { provokes: true } : {}),
      routsAtMax: t.max >= t.unit.troops && t.max > 0,
    })),
    dashTo: ev0.dashTo,
    ignites: effectOf(s, 'ignite') !== null,
    igniteTiles: effectOf(s, 'ignite') ? (s.area === 'single' ? [anchor] : ev0.tiles).filter((t) => igniteOk(state, t)) : [],
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

function igniteOk(state: BattleState, p: Pos): boolean {
  return ignitable(state, p)
}

/** [R2-OBJ-1] Every win/lose condition with the engine's progress text. */
export function objectives(state: BattleState): ObjectiveStatus[] {
  return objectiveStatuses(state)
}

/** Can the unit leave the board by an exit tile right now? [R2-OBJ-1] */
export function canEscape(state: BattleState, unitId: string): boolean {
  const u = getUnit(state, unitId)
  return canAct(u) && u.side === PLAYER_SIDE && isExitTile(state, u.x, u.y)
}

/** [R2-STRAT-3] The id of the unit this one must attack or approach (null when not provoked or unable to comply). */
export function provokedBy(state: BattleState, unitId: string): string | null {
  const u = getUnit(state, unitId)
  if (!u || u.provoked === undefined) return null
  const p = getUnit(state, u.provoked)
  if (!p || p.side === u.side) return null
  return p.id
}

function describeTimeline(t: BattleState['timeline'][number], state: BattleState): TimelineItemPreview {
  const base = { round: t.round, phase: t.phase }
  switch (t.kind) {
    case 'terrain':
      return { ...base, kind: 'terrain', text: `${state.data.terrain[t.to].name} spreads over ${t.tiles.length} tile${t.tiles.length === 1 ? '' : 's'}`, tiles: t.tiles.map(([x, y]) => ({ x, y })) }
    case 'wind':
      return { ...base, kind: 'wind', text: t.strength === 'calm' || t.dir === null ? 'The wind drops' : `The wind turns to a ${t.strength} toward ${t.dir}`, tiles: [] }
    case 'message':
      return { ...base, kind: 'message', text: t.text, tiles: [] }
    case 'ignite':
      return { ...base, kind: 'ignite', text: 'Fire breaks out', tiles: t.tiles.map(([x, y]) => ({ x, y })) }
  }
}

/**
 * [R2-TIME-1] The next scheduled timeline items and reinforcement waves that are open information, soonest first.
 * Items whose moment has passed are left out; `hidden` items are never listed.
 */
export function timelinePreview(state: BattleState, limit = 6): TimelineItemPreview[] {
  const upcoming = (round: number, phase: 'start' | 'end'): boolean =>
    round > state.round || (round === state.round && phase === 'end')
  const out: TimelineItemPreview[] = []
  for (const t of state.timeline) {
    if (t.hidden || !upcoming(t.round, t.phase)) continue
    out.push(describeTimeline(t, state))
  }
  for (const r of state.reinforcements) {
    if (r.round < state.round) continue
    out.push({
      round: r.round,
      phase: 'start',
      kind: 'reinforcement',
      text: `${r.units.length} reinforcement${r.units.length === 1 ? '' : 's'} arrive for ${state.sides.find((s) => s.id === r.side)?.name ?? r.side}`,
      tiles: r.entry.map(([x, y]) => ({ x, y })),
    })
  }
  out.sort((a, b) => a.round - b.round || (a.phase === b.phase ? 0 : a.phase === 'start' ? -1 : 1))
  return out.slice(0, limit)
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
  objectives,
  timelinePreview: (state: BattleState, limit?: number): TimelineItemPreview[] => timelinePreview(state, limit),
  canEscape,
  provokedBy,
  unitAt: unitAtTile,
  readyUnits,
}
