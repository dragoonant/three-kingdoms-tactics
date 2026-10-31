// [R-SWAY-1..3]
import { getUnit, officerOf, statOf } from './board'
import { manhattan } from './geometry'
import type { Roller } from './rng'
import type { BattleState, GameEvent, SwayPreview, Unit } from './types'

export const SWAY_RANGE = 2

export function swayKey(casterId: string, targetId: string): string {
  return `${casterId}>${targetId}`
}

export function swayReason(state: BattleState, caster: Unit, target: Unit): string | null {
  if (target.side === caster.side) return 'Not an enemy'
  if (manhattan(caster, target) > SWAY_RANGE) return 'Out of range (2 tiles)'
  if (target.commander) return 'A commander cannot be swayed'
  if (officerOf(state, target).loyalty === null) return 'This officer cannot be swayed'
  if (state.swayTried.includes(swayKey(caster.id, target.id))) return 'Already tried on this officer'
  return null
}

/** Chance in percent, 5..90. */
export function swayPercent(state: BattleState, caster: Unit, target: Unit): number {
  const loyalty = officerOf(state, target).loyalty ?? 100
  const v = statOf(state, caster, 'cha') - loyalty + 40 * (1 - target.troops / target.maxTroops) + (target.confused ? 10 : 0)
  return Math.max(5, Math.min(90, v))
}

export function swayTargets(state: BattleState, caster: Unit): Unit[] {
  return state.units.filter((t) => swayReason(state, caster, t) === null)
}

export function previewSway(state: BattleState, caster: Unit, target: Unit): SwayPreview {
  const reason = swayReason(state, caster, target)
  if (reason) return { legal: false, reason, chance: 0 }
  return { legal: true, chance: swayPercent(state, caster, target) }
}

/** One roll. */
export function resolveSway(w: BattleState, ev: GameEvent[], roller: Roller, casterId: string, targetId: string): void {
  const caster = getUnit(w, casterId)!
  const target = getUnit(w, targetId)!
  const chance = swayPercent(w, caster, target)
  w.swayTried.push(swayKey(casterId, targetId))
  if (roller.chance(chance)) {
    target.side = caster.side
    target.moved = true
    target.done = true
    target.undo = null
    ev.push({ kind: 'swayed', unit: caster.id, target: target.id, chance, side: caster.side })
  } else {
    ev.push({ kind: 'swayFailed', unit: caster.id, target: target.id, chance })
  }
}
