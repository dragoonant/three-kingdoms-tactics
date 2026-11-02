// `?test=1` Roads to War helpers, merged into window.__game. They use only the public stores and the engine's public API.
//
//   runNew(seed?, ironOath?)  start a run exactly as the seal on the New run screen does; returns the RunState
//   runState()                the live RunState (null before a run)
//   runView()                 which run view is up ('new' | 'slips' | 'stop' | 'market' | 'road' | 'finale' | 'deploy' | 'report' | 'end')
//   runReport()               the last battle report, or null
//   runLoadSave(state)        write `state` as the saved run and Continue it, as a reload would (tests craft edge cases this way)
//   runAutoBattle()           play the current run battle at Instant speed, the player's side moved by the greedy bot (the enemy is
//                             the store's bot); resolves 'won' | 'lost' | 'stalled'. It never edits a state.
import { greedyAction } from '../../ai/greedy'
import { useGame } from '../store/game'
import { PLAYER_SIDE } from '../store/orders'
import { saveRun, type RunState } from '../../run'
import { browserStorage } from '../campaign/storage'
import { useRun, viewOf } from './store'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function autoBattle(): Promise<'won' | 'lost' | 'stalled'> {
  const first = useGame.getState()
  if (first.screen !== 'battle') return 'stalled'
  const prev = first.speed
  first.setSpeed('instant')
  const t0 = Date.now()
  while (Date.now() - t0 < 240_000) {
    const st = useGame.getState()
    if (st.screen !== 'battle') break
    if (!st.playing && !st.state.result && st.state.side === PLAYER_SIDE) {
      const r = st.act(greedyAction(st.state))
      if (!r.ok) st.act({ type: 'endPhase' })
    }
    await sleep(2)
  }
  useGame.getState().setSpeed(prev)
  if (useGame.getState().screen === 'battle') return 'stalled'
  return useRun.getState().report?.won ? 'won' : 'lost'
}

export function installRunHook(): Record<string, unknown> {
  const r = (): ReturnType<typeof useRun.getState> => useRun.getState()
  return {
    runNew: (seed = 1, ironOath = false) => r().startNew(seed, ironOath),
    runState: () => r().run,
    runView: () => viewOf(r().run, r().slips, r().report),
    runReport: () => r().report,
    runAutoBattle: () => autoBattle(),
    runLoadSave: (state: RunState): boolean => {
      saveRun(browserStorage(), state)
      return r().continueRun()
    },
  }
}
