// The scribe's ledger: one player-facing line per engine event. The mapped type forces a formatter for every kind.
import type { BattleState, EventKind, Facing, GameEvent, Pos, Side, WindStrength } from '../engine'
import { nameOfUnit, sideTitle } from './names'

export type Tone = 'info' | 'hit' | 'good' | 'bad' | 'fire' | 'wind' | 'round'
export interface LedgerLine {
  text: string
  tone: Tone
}
export interface LedgerEntry extends LedgerLine {
  id: number
  round: number
}

const FACING_WORD: Record<Facing, string> = { N: 'north', E: 'east', S: 'south', W: 'west' }
export const facingWord = (f: Facing): string => FACING_WORD[f]
export const num = (n: number): string => n.toLocaleString('en-US')

export function windWord(dir: Facing | null, strength: WindStrength): string {
  if (strength === 'calm' || dir === null) return 'calm'
  return `${strength === 'gale' ? 'gale' : 'breeze'} toward ${FACING_WORD[dir]}`
}

const COLS = 'ABCDEFGHIJKLMNOP'
/** Board reference such as "F3": column letter, row number. */
export const tileRef = (p: Pos): string => `${COLS[p.x] ?? '?'}${p.y + 1}`
const tileWord = (s: BattleState, p: Pos): string => {
  const t = s.grid.tiles[p.y * s.grid.width + p.x]
  const name = t ? s.data.terrain[t.terrain].name.toLowerCase() : 'ground'
  return `the ${name} at ${tileRef(p)}`
}

type Formatters = { [K in EventKind]: (ev: Extract<GameEvent, { kind: K }>, s: BattleState) => LedgerLine }

const stratName = (s: BattleState, id: string): string => s.data.stratagems[id]?.name ?? id
const who = (s: BattleState, id: string): string => nameOfUnit(s, id)
const sideWord = (side: Side): string => (side === 'han' ? 'the Han' : 'the rebels')
const statWord: Record<string, string> = { war: 'War', int: 'Intellect', lead: 'Leadership', cha: 'Charisma' }

export const LEDGER_FORMATTERS: Formatters = {
  moved: (e, s) =>
    e.undo
      ? { text: `${who(s, e.unit)} takes back the move.`, tone: 'info' }
      : e.dash
        ? { text: `${who(s, e.unit)} charges to ${tileRef(e.to)}.`, tone: 'hit' }
        : { text: `${who(s, e.unit)} moves to ${tileRef(e.to)}, facing ${FACING_WORD[e.facing]}.`, tone: 'info' },
  turned: (e, s) => ({ text: `${who(s, e.unit)} turns ${FACING_WORD[e.to]}.`, tone: 'info' }),
  waited: (e, s) => ({ text: `${who(s, e.unit)} holds, facing ${FACING_WORD[e.facing]}.`, tone: 'info' }),
  attacked: (e, s) => ({
    text: `${who(s, e.unit)} ${e.ranged ? 'looses arrows at' : 'strikes'} ${who(s, e.target)}${e.arc === 'front' ? '' : ` from the ${e.arc}`}.`,
    tone: 'hit',
  }),
  countered: (e, s) => ({ text: `${who(s, e.unit)} strikes back at ${who(s, e.target)}.`, tone: 'hit' }),
  damaged: (e, s) => ({
    text:
      e.source === 'fire'
        ? `Fire burns ${who(s, e.unit)} for ${num(e.amount)} (${num(e.troopsAfter)} left).`
        : `${who(s, e.unit)} loses ${num(e.amount)} troops (${num(e.troopsAfter)} left).`,
    tone: e.source === 'fire' ? 'fire' : 'hit',
  }),
  routed: (e, s) => ({ text: `${who(s, e.unit)}'s troops are routed!`, tone: e.side === 'han' ? 'bad' : 'good' }),
  stratagem: (e, s) => ({ text: `${who(s, e.unit)} casts ${stratName(s, e.strat)}.`, tone: 'hit' }),
  chainLink: (e, s) => ({
    text: `Chain ×${e.link + 1}: ${who(s, e.unit)} follows with ${stratName(s, e.strat)}${e.bond ? ' (sworn bond)' : ''}.`,
    tone: 'good',
  }),
  sawThrough: (e, s) => ({ text: `${who(s, e.unit)} sees through ${stratName(s, e.strat)}.`, tone: 'info' }),
  confused: (e, s) => ({
    text: e.source === 'fire' ? `${who(s, e.unit)} is dazed by the smoke.` : `${who(s, e.unit)} is thrown into confusion.`,
    tone: 'bad',
  }),
  recovered: (e, s) => ({ text: `${who(s, e.unit)} recovers their wits.`, tone: 'good' }),
  ignited: (e, s) => ({ text: e.by === 'timeline' ? `Fire breaks out on ${tileWord(s, e)}.` : `${who(s, e.by)} sets ${tileWord(s, e)} alight.`, tone: 'fire' }),
  fireSpread: (e, s) => ({ text: `Fire spreads to ${tileWord(s, e.to)}.`, tone: 'fire' }),
  burnedOut: (e, s) => ({ text: `The fire on ${tileWord(s, e)} burns out, leaving ash.`, tone: 'fire' }),
  healed: (e, s) => ({
    text:
      e.source === 'village'
        ? `${who(s, e.unit)} is tended in the village, +${num(e.amount)}.`
        : `${who(s, e.unit)} is rallied, +${num(e.amount)}.`,
    tone: 'good',
  }),
  swayed: (e, s) => ({ text: `${who(s, e.target)} is won over by ${who(s, e.unit)} and joins ${sideWord(e.side)}! (${e.chance}%)`, tone: 'good' }),
  swayFailed: (e, s) => ({ text: `${who(s, e.target)} refuses ${who(s, e.unit)} (${e.chance}% chance).`, tone: 'info' }),
  windChanged: (e, s) => ({
    text: e.by ? `${who(s, e.by)} calls the wind: ${windWord(e.dir, e.strength)}${e.rounds ? ` for ${e.rounds} rounds` : ''}.` : `The wind shifts: ${windWord(e.dir, e.strength)}.`,
    tone: 'wind',
  }),
  phaseStarted: (e, s) => ({ text: `${sideTitle(s, e.side)} take the field.`, tone: 'round' }),
  roundStarted: (e) => ({ text: `Round ${e.round} begins.`, tone: 'round' }),
  battleEnded: (e) => ({
    text:
      e.winner === 'han'
        ? e.reason === 'timeout'
          ? 'The rebels melt away. The Han hold the hill.'
          : e.reason === 'objective'
            ? 'Victory! The objective is met.'
            : 'Victory! The rising is broken.'
        : e.reason === 'timeout'
          ? 'Round limit reached. The rebels hold the field.'
          : e.reason === 'objective'
            ? 'Defeat. The objective is lost.'
            : 'Defeat. Liu Bei has fallen.',
    tone: e.winner === 'han' ? 'good' : 'bad',
  }),
  retreated: (e, s) => ({ text: `${who(s, e.unit)} breaks off and retreats from the field.`, tone: e.side === 'han' ? 'bad' : 'good' }),
  escaped: (e, s) => ({ text: `${who(s, e.unit)} slips away by ${tileRef(e)}!`, tone: 'good' }),
  reinforced: (e, s) => ({ text: `Reinforcements: ${s.data.officers[e.officer]?.name ?? e.unit} arrives at ${tileRef(e)}.`, tone: e.side === 'han' ? 'good' : 'bad' }),
  terrainChanged: (e, s) => ({
    text: `${e.tiles.length === 1 ? tileRef(e.tiles[0]!) : `${e.tiles.length} tiles`} turn${e.tiles.length === 1 ? 's' : ''} to ${s.data.terrain[e.to].name.toLowerCase()}.`,
    tone: e.cause === 'burnout' ? 'fire' : 'info',
  }),
  timelineMessage: (e) => ({ text: e.text, tone: 'info' }),
  buffed: (e, s) => ({ text: `${who(s, e.unit)} is steadied: ${statWord[e.stat] ?? e.stat} ${e.amount > 0 ? '+' : ''}${e.amount} until round ${e.until}.`, tone: 'good' }),
  buffExpired: (e, s) => ({ text: `${who(s, e.unit)}'s ${stratName(s, e.strat)} fades.`, tone: 'info' }),
  provoked: (e, s) => ({ text: `${who(s, e.unit)} is goaded and must come for ${who(s, e.by)}.`, tone: 'bad' }),
  objectiveProgress: (e) => ({ text: `Objective: ${e.text}`, tone: 'info' }),
}

export function lineFor(ev: GameEvent, state: BattleState): LedgerLine {
  const f = LEDGER_FORMATTERS[ev.kind] as (e: GameEvent, s: BattleState) => LedgerLine
  return f(ev, state)
}

/** Lines for a whole batch. The state is the one the events were produced from. */
export function linesFor(events: GameEvent[], before: BattleState): LedgerLine[] {
  return events.map((e) => lineFor(e, before))
}
