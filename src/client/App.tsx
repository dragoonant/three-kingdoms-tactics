import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { greedyAction } from '../ai/greedy'
import { legalActions, query } from '../engine'
import { bindGameAudio } from './audio/gameAudio'
import { BoardCanvas } from './board/BoardCanvas'
import { viewApi } from './board/layout'
import { Hud } from './hud/Hud'
import { Briefing, End, HowTo, Title } from './screens/Screens'
import { Camp, CampaignBriefing, Defeat, Deploy, NewCampaign, Results, Scene, Summary } from './screens/CampaignScreens'
import { installCampaignHook } from './campaign/testHook'
import { RunRoot } from './run/RunScreens'
import { installRunHook } from './run/testHook'
import { cutinTestApi, player } from './cutins/player'
import { TEST_MODE, useGame } from './store/game'
import { EMPTY_UI } from './store/orders'
import type { Action } from '../engine'
import { useCutinSettings } from './cutins/settings'
import { installPreviewPrebuild } from './cutins/prebuildHook'
import './theme.css'
import './hud.css'
import './campaign.css'

// The cut-in layer (and with it every scene's world) loads with the battle and stays mounted for it: its canvas warms up
// behind the briefing and the intro and is reused by every cut-in (docs/spec/51 "Performance: warm-up and reuse").
const CutinLayer = lazy(() => import('./cutins/CutinLayer'))
const CUTIN_SCREENS = new Set(['briefing', 'cbrief', 'deploy', 'battle', 'end'])
const battleNow = () => useGame.getState().state

declare global {
  interface Window {
    __app?: { ready: boolean }
    __cutin?: ReturnType<typeof cutinTestApi>
  }
}

function installTestHook(): void {
  const g = () => useGame.getState()
  ;(window as unknown as { __game: unknown }).__game = {
    state: () => g().state,
    scene: () => g().scene,
    legal: () => legalActions(g().state),
    act: (a: Parameters<ReturnType<typeof g>['act']>[0]) => g().act(a),
    /** True when nothing is playing and it is the player's phase (or the battle is over). */
    idle: () => !g().playing && (g().state.side === 'han' || !!g().state.result),
    setSpeed: (s: 'full' | 'quick' | 'instant') => g().setSpeed(s),
    /** The greedy bot's choice for the side to move (handy for scripted games). */
    suggest: () => greedyAction(g().state),
    screen: () => g().screen,
    go: (s: Parameters<ReturnType<typeof g>['go']>[0]) => g().go(s),
    begin: () => g().begin(),
    skip: () => g().skip(),
    /** Select a unit as a click on it would (clicks on crowded figures can land on a neighbour). */
    select: (id: string | null) => g().select(id),
    /** Open the order preview for an action as the HUD would (the seal waits for a confirm): the cut-in prebuild starts. */
    preview: (a: Action) => {
      if (a.type === 'attack') useGame.setState({ ui: { ...EMPTY_UI, selectedId: a.unit, mode: 'attack', pendingTarget: a.target } })
      else if (a.type === 'stratagem') useGame.setState({ ui: { ...EMPTY_UI, selectedId: a.unit, mode: 'stratagem', strat: a.strat, pendingAnchor: { x: a.x, y: a.y }, exclude: a.excludeFromChain ?? [] } })
    },
    log: () => g().log,
    ledger: () => g().ledger,
    stats: () => g().stats,
    query,
    tileToScreen: (x: number, y: number) => viewApi.tileToScreen(x, y),
    unitToScreen: (id: string) => viewApi.unitToScreen(id),
    camera: () => viewApi.camera(),
    setView: (p: Parameters<typeof viewApi.setView>[0]) => viewApi.setView(p),
    focusUnit: (id: string, zoom?: number) => viewApi.focusUnit(id, zoom),
    resetView: () => viewApi.reset(),
    ...installCampaignHook(),
    ...installRunHook(),
  }
  window.__cutin = cutinTestApi()
}

export function App() {
  const screen = useGame((s) => s.screen)
  const cutinActive = useSyncExternalStore(player.subscribe, () => player.getSnapshot().active, () => false)
  const scenesOn = useCutinSettings((s) => s.battleScenes !== 'off')
  const battleKey = useGame((s) => `${s.state.battleId}:${s.seed}`)
  const cutinHost = scenesOn && CUTIN_SCREENS.has(screen)

  useEffect(() => {
    if (TEST_MODE) installTestHook()
  }, [])

  // The music follows the screen and the battle result (docs/spec/60-audio.md).
  useEffect(() => bindGameAudio(), [])

  // Prebuild the cut-in of the order the player is about to confirm.
  useEffect(() => installPreviewPrebuild(), [])

  // Any press skips the batch being played; the click that follows is swallowed so it cannot also act.
  useEffect(() => {
    let swallow = false
    const down = (e: PointerEvent): void => {
      swallow = false
      const st = useGame.getState()
      // The sound panel stays usable while a replay plays.
      if (e.target instanceof Element && e.target.closest('[data-sound-ui]')) return
      if (st.playing && st.screen === 'battle') {
        st.skip()
        swallow = true
        e.stopPropagation()
      }
    }
    const click = (e: MouseEvent): void => {
      if (swallow) {
        swallow = false
        e.stopPropagation()
        e.preventDefault()
      }
    }
    const key = (e: KeyboardEvent): void => {
      const st = useGame.getState()
      if (e.key === 'Escape' && st.screen === 'battle') st.cancel()
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('click', click, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('click', click, true)
      window.removeEventListener('keydown', key)
    }
  }, [])

  return (
    <div className="app" data-screen={screen}>
      <BoardCanvas />
      {screen === 'title' && <Title />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'howto' && <HowTo />}
      {screen === 'newcampaign' && <NewCampaign />}
      {screen === 'scene' && <Scene />}
      {screen === 'cbrief' && <CampaignBriefing />}
      {screen === 'camp' && <Camp />}
      {screen === 'deploy' && <Deploy />}
      {screen === 'results' && <Results />}
      {screen === 'defeat' && <Defeat />}
      {screen === 'summary' && <Summary />}
      {screen === 'run' && <RunRoot />}
      {(screen === 'battle' || screen === 'end') && <Hud />}
      {(cutinHost || cutinActive) && (
        <Suspense fallback={null}>
          <CutinLayer battleKey={battleKey} battle={battleNow} note={screen === 'battle'} />
        </Suspense>
      )}
      {screen === 'end' && <End />}
    </div>
  )
}
