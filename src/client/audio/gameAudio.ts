// Minimal hook from the game store to the music: screen + result + commander health pick the bed. No rules maths here.
// The in-game cut-in integration (later) calls audio.cutinStart / cutinEnd / cutinSkip itself.
import { useGame } from '../store/game'
import { audio } from './index'
import type { Mood } from './manifest'
import { moodFor } from './moods'

export function currentMood(previous: Mood | null): Mood {
  const s = useGame.getState()
  const r = s.state.result
  // The last blow is still being shown: hold the music until the battle screen hands over to the result.
  if (s.screen === 'battle' && r) return previous ?? 'battle'
  const hanId = s.state.commanders['han']
  const cmd = hanId ? s.scene.units.find((u) => u.id === hanId) : undefined
  return moodFor({
    screen: s.screen,
    playerWon: r ? r.winner === 'han' : null,
    commanderFrac: cmd && cmd.maxTroops > 0 ? cmd.troops / cmd.maxTroops : null,
    previous,
  })
}

/** Subscribe the music to the store. Returns the unsubscribe function. */
export function bindGameAudio(): () => void {
  let last: Mood | null = null
  const apply = (): void => {
    last = currentMood(last)
    audio.setMood(last)
  }
  apply()
  let sc = useGame.getState().screen
  let res = useGame.getState().state.result
  let scene = useGame.getState().scene
  return useGame.subscribe((s) => {
    if (s.screen === sc && s.state.result === res && s.scene === scene) return
    sc = s.screen
    res = s.state.result
    scene = s.scene
    apply()
  })
}
