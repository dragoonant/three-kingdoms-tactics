// [R-ATK-1..5] normal attacks, counters, previews.
import { getUnit, terrainAt } from './board'
import { calcDamage, damageRange, finalizeDamage, VARIANCE_MAX, VARIANCE_MIN } from './damage'
import { facingToward, manhattan } from './geometry'
import { applyDamage, gainQi, turnUnit } from './ops'
import type { Roller } from './rng'
import type { Arc, AttackPreview, BattleState, GameEvent, Unit } from './types'

export const COUNTER_MULT = 0.5

export function attackRange(state: BattleState, unit: Unit): { min: number; max: number } {
  if (unit.type !== 'archers') return { min: 1, max: 1 }
  return { min: 2, max: 3 + (terrainAt(state, unit.x, unit.y).rangeBonus ?? 0) }
}

export function isRanged(unit: Unit): boolean {
  return unit.type === 'archers'
}

export function attackTargets(state: BattleState, unit: Unit): Unit[] {
  const r = attackRange(state, unit)
  return state.units.filter((t) => {
    if (t.side === unit.side) return false
    const d = manhattan(unit, t)
    return d >= r.min && d <= r.max
  })
}

function counterPossible(attacker: Unit, defender: Unit, arc: Arc): { ok: boolean; reason?: string } {
  if (isRanged(attacker)) return { ok: false, reason: 'Ranged attacks are never countered' }
  if (defender.type === 'archers') return { ok: false, reason: 'Archers do not counter' }
  if (defender.confused) return { ok: false, reason: 'Confused units cannot counter' }
  if (arc === 'rear') return { ok: false, reason: 'No counter against a rear attack' }
  return { ok: true }
}

export function previewAttack(state: BattleState, unit: Unit, target: Unit): AttackPreview | null {
  if (unit.side === target.side) return null
  const r = attackRange(state, unit)
  const d = manhattan(unit, target)
  if (d < r.min || d > r.max) return null
  const calc = calcDamage(state, { attacker: unit, defender: target, power: 1, stat: 'war', useArc: true, useHeight: true })
  const dmg = damageRange(calc, target.troops)
  const ranged = isRanged(unit)
  const arc = calc.arc
  const cp = counterPossible(unit, target, arc)
  let cMin = 0
  let cMax = 0
  let cMults = [] as AttackPreview['counter']['multipliers']
  if (cp.ok) {
    const after = (t: number): Unit => ({ ...target, troops: t })
    const cSpec = (t: number) =>
      calcDamage(state, {
        attacker: after(t),
        defender: unit,
        power: 1,
        stat: 'war',
        useArc: false,
        useHeight: true,
        extra: [{ id: 'counter', name: 'Counterstrike', value: COUNTER_MULT }],
      })
    const tHigh = target.troops - dmg.min
    const tLow = target.troops - dmg.max
    if (tHigh > 0) {
      const cHi = cSpec(tHigh)
      cMax = finalizeDamage(cHi.raw, VARIANCE_MAX, unit.troops)
      cMults = cHi.multipliers
      cMin = tLow > 0 ? finalizeDamage(cSpec(tLow).raw, VARIANCE_MIN, unit.troops) : 0
    }
  }
  return {
    unit: unit.id,
    target: target.id,
    arc,
    distance: d,
    ranged,
    base: calc.base,
    multipliers: calc.multipliers,
    damage: dmg,
    targetTroopsAfter: { min: target.troops - dmg.max, max: target.troops - dmg.min },
    routsAtMin: dmg.min >= target.troops,
    routsAtMax: dmg.max >= target.troops,
    counter: {
      possible: cp.ok && target.troops - dmg.min > 0,
      ...(cp.ok ? {} : { reason: cp.reason! }),
      min: cMin,
      max: cMax,
      multipliers: cMults,
    },
  }
}

/** Resolves one attack on a working copy. Draw order: attack variance, then counter variance. */
export function resolveAttack(w: BattleState, ev: GameEvent[], roller: Roller, attackerId: string, targetId: string): void {
  const a = getUnit(w, attackerId)!
  const t = getUnit(w, targetId)!
  const ranged = isRanged(a)
  turnUnit(ev, a, facingToward(a, t))
  const calc = calcDamage(w, { attacker: a, defender: t, power: 1, stat: 'war', useArc: true, useHeight: true })
  const arc = calc.arc
  ev.push({ kind: 'attacked', unit: a.id, target: t.id, arc, ranged, distance: manhattan(a, t) })
  const dmg = finalizeDamage(calc.raw, roller.variance(), t.troops)
  const routed = applyDamage(w, ev, t, dmg, 'attack', a.id)
  gainQi(t, 1)
  if (routed) return
  // [R-ATK-3] counterattack
  const cp = counterPossible(a, t, arc)
  if (cp.ok) {
    ev.push({ kind: 'countered', unit: t.id, target: a.id })
    const cCalc = calcDamage(w, {
      attacker: t,
      defender: a,
      power: 1,
      stat: 'war',
      useArc: false,
      useHeight: true,
      extra: [{ id: 'counter', name: 'Counterstrike', value: COUNTER_MULT }],
    })
    const cd = finalizeDamage(cCalc.raw, roller.variance(), a.troops)
    const aRouted = applyDamage(w, ev, a, cd, 'counter', t.id)
    if (!aRouted) gainQi(a, 1)
  }
  // [R-ATK-4] melee defender turns to face the attacker
  if (!ranged && !t.confused) turnUnit(ev, t, facingToward(t, a))
}
