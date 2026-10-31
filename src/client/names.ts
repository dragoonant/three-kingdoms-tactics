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

const TITLES = new Set(['Rebel', 'Captain', 'Commander', 'Lieutenant', 'Admiral', 'General', 'Marshal'])

export function surname(name: string): string {
  // Chinese names put the family name first (Liu Bei -> L, Zhuge Liang -> Z). Titled invented names put it last
  // (Rebel Captain Gao -> G).
  const words = name.replace(/\*$/, '').split(' ').filter(Boolean)
  const pick = words.length >= 3 || (words.length === 2 && TITLES.has(words[0]!)) ? words[words.length - 1] : words[0]
  return (pick ?? name).charAt(0).toUpperCase()
}
