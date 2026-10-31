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

export function sideName(side: Side): string {
  return side === 'han' ? 'Han' : 'Yellow Turban'
}

/** Title of a side's phase, in the player's frame. */
export function sideTitle(_state: BattleState, side: Side): string {
  return side === 'han' ? "Liu Bei's forces" : 'The Yellow Turban host'
}

export function surname(name: string): string {
  const n = shortName(name.replace(/\*$/, ''))
  const last = n.split(' ').filter(Boolean)
  return (last[last.length - 1] ?? n).charAt(0).toUpperCase()
}
