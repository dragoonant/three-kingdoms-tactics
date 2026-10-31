// The damage formula [R-ATK-2], shared by attacks, counters, stratagems and previews.
import type { StratStat, TroopType } from '../data/types'
import { ARC_MULT, arcOf } from './geometry'
import { officerOf, terrainAt } from './board'
import type { Arc, BattleState, DamageRange, Multiplier, Unit } from './types'

export const BASE_DAMAGE = 150
export const BASE_PER_TROOP = 0.08
export const MATCHUP_MULT = 1.2
/** What each troop type is strong against. [R-UNIT-3] */
export const STRONG_AGAINST: Record<TroopType, TroopType> = {
  infantry: 'cavalry',
  cavalry: 'archers',
  archers: 'infantry',
}
export const HEIGHT_UP = 1.15
export const HEIGHT_DOWN = 0.9
export const VARIANCE_MIN = 0.9
export const VARIANCE_MAX = 1.1

export interface DamageSpec {
  attacker: Unit
  defender: Unit
  power: number
  stat: StratStat
  /** Apply the facing arc (Strike/Charge/attacks)? When false the arc is still reported. */
  useArc: boolean
  useHeight: boolean
  /** Replaces the computed arc multiplier (counterattacks use front = 1.00). */
  arcOverride?: Arc
  extra?: Multiplier[]
}

export interface DamageCalc {
  base: number
  multipliers: Multiplier[]
  product: number
  arc: Arc
  /** Raw damage before variance/rounding at variance 1. */
  raw: number
}

export function calcDamage(state: BattleState, spec: DamageSpec): DamageCalc {
  const { attacker, defender } = spec
  const ao = officerOf(state, attacker)
  const dof = officerOf(state, defender)
  const base = (BASE_DAMAGE + attacker.troops * BASE_PER_TROOP) * spec.power
  const multipliers: Multiplier[] = []
  const statRatio = (100 + ao[spec.stat]) / (100 + dof.lead)
  multipliers.push({
    id: 'stat',
    name: spec.stat === 'war' ? 'War vs Leadership' : 'Intellect vs Leadership',
    value: statRatio,
  })
  const arc = spec.arcOverride ?? arcOf(defender, attacker)
  if (spec.useArc) multipliers.push({ id: 'arc', name: `${arc[0]!.toUpperCase()}${arc.slice(1)} arc`, value: ARC_MULT[arc] })
  if (STRONG_AGAINST[attacker.type] === defender.type)
    multipliers.push({ id: 'matchup', name: 'Troop matchup', value: MATCHUP_MULT })
  const def = terrainAt(state, defender.x, defender.y)
  if (def.def !== 1) multipliers.push({ id: 'terrain', name: `${def.name} cover`, value: def.def })
  if (spec.useHeight) {
    const ea = terrainAt(state, attacker.x, attacker.y).elev
    const ed = def.elev
    if (ea > ed) multipliers.push({ id: 'height', name: 'High ground', value: HEIGHT_UP })
    else if (ea < ed) multipliers.push({ id: 'height', name: 'Uphill', value: HEIGHT_DOWN })
  }
  for (const m of spec.extra ?? []) multipliers.push(m)
  let product = 1
  for (const m of multipliers) product *= m.value
  return { base, multipliers, product, arc, raw: base * product }
}

/** Round to the nearest 10, minimum 10, capped at the defender's troops. */
export function finalizeDamage(raw: number, variance: number, defenderTroops: number): number {
  const r = Math.round((raw * variance) / 10) * 10
  return Math.min(defenderTroops, Math.max(10, r))
}

export function damageRange(calc: DamageCalc, defenderTroops: number): DamageRange {
  return {
    min: finalizeDamage(calc.raw, VARIANCE_MIN, defenderTroops),
    max: finalizeDamage(calc.raw, VARIANCE_MAX, defenderTroops),
    expected: finalizeDamage(calc.raw, 1, defenderTroops),
  }
}
