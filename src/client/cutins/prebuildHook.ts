// Prebuilds the cut-in of the order the player has lined up (docs/spec/51 "Performance: warm-up and reuse"): when the attack
// or stratagem preview is open, the order's scene is planned from a speculative engine step and its world built in idle
// time, so confirming starts the cut-in on a world that is already built and compiled.
import { pendingOrder, PLAYER_SIDE } from '../store/orders'
import { useGame } from '../store/game'
import { prebuildFor, prep } from './prep'

export function installPreviewPrebuild(): () => void {
  let last = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const check = (): void => {
    timer = null
    const st = useGame.getState()
    if (!prep.attached || st.screen !== 'battle' || st.playing || st.state.result) return
    const order = pendingOrder(st.state, st.ui)
    const a = order?.action
    if (!a || (a.type !== 'attack' && a.type !== 'stratagem')) return
    const key = `${st.events.length}|${JSON.stringify(a)}|${st.speed}`
    if (key === last) return
    last = key
    void prebuildFor(st.state, a, st.speed, PLAYER_SIDE)
  }
  const unsub = useGame.subscribe((s, p) => {
    if (s.ui === p.ui && s.state === p.state && s.playing === p.playing) return
    // let the preview render first; the plan and the build run after it
    if (timer) clearTimeout(timer)
    timer = setTimeout(check, 60)
  })
  return () => {
    unsub()
    if (timer) clearTimeout(timer)
  }
}
