// Which bed the game wants: screen + battle result + the player's commander health. Pure and presentation-only; no rules
// maths (the one number it reads is the commander's troops over max, exactly as drawn on the board).
import type { Mood } from './manifest'

export interface MoodInput {
  screen: string
  /** Battle winner is the player's side; null while undecided. */
  playerWon: boolean | null
  /** The player's commander troops / max troops as presented on the board, null when unknown. */
  commanderFrac: number | null
  /** The mood last chosen, for hysteresis on `tense`. */
  previous: Mood | null
}

/** Below this the bed turns tense; it relaxes again above TENSE_OFF so a nibbled commander does not flap the music. */
export const TENSE_ON = 0.35
export const TENSE_OFF = 0.5

export function moodFor(i: MoodInput): Mood {
  switch (i.screen) {
    case 'title':
    case 'howto':
    case 'briefing':
    case 'newcampaign':
      return 'title'
    case 'scene':
    case 'cbrief':
      return 'calm'
    case 'camp':
    case 'deploy':
      return 'camp'
    case 'results':
    case 'summary':
      return 'victory'
    case 'defeat':
      return 'defeat'
    case 'end':
      return i.playerWon === false ? 'defeat' : 'victory'
    case 'battle': {
      if (i.playerWon !== null) return i.playerWon ? 'victory' : 'defeat'
      const f = i.commanderFrac
      if (f === null) return 'battle'
      if (i.previous === 'tense') return f < TENSE_OFF ? 'tense' : 'battle'
      return f < TENSE_ON ? 'tense' : 'battle'
    }
    default:
      return 'calm'
  }
}
