import type { BattleState, Side } from '../engine'

/** Display name of a unit even after it has been routed (unit ids equal officer ids in the shipped battles). */
export function nameOfUnit(state: BattleState, id: string): string {
  const u = state.units.find((x) => x.id === id)
  const off = u ? state.data.officers[u.officer] : state.data.officers[id]
  return off?.name.replace(/\*$/, '') ?? id
}

/** Short name for tight spaces: "Rebel Captain Gao" becomes "Captain Gao". */
export function shortName(name: string): string {
  return name.replace(/^Rebel /, '')
}

/** Display name of a side from the battle's side data ([R2-SIDE-1]). */
export function sideName(state: BattleState, side: Side): string {
  return state.sides.find((s) => s.id === side)?.name ?? side
}

/** Title of a side's phase, in the player's frame. */
export function sideTitle(state: BattleState, side: Side): string {
  if (side === 'han') return "Liu Bei's forces"
  const n = sideName(state, side)
  return /army$/i.test(n) ? `The ${n}` : `The ${n} host`
}

/** Short phase label for the top bar. */
export function phaseLabel(state: BattleState, side: Side): string {
  if (side === 'han') return "Liu Bei's forces"
  const n = sideName(state, side)
  return /army$/i.test(n) ? n : `${n}s`
}

export function surname(name: string): string {
  const n = shortName(name.replace(/\*$/, ''))
  const last = n.split(' ').filter(Boolean)
  return (last[last.length - 1] ?? n).charAt(0).toUpperCase()
}
