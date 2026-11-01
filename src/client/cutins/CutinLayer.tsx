// The full-screen cut-in over the board (docs/spec/51 v0.3). Mounted by App for the whole battle (docs/spec/51 "Performance:
// warm-up and reuse"): the cut-in canvas is created once, warms up behind the battle's intro, and waits hidden and idle
// between cut-ins; it never creates a WebGL context mid-battle. While a cut-in plays it shows a CutinView on the player's
// controller, the chain's seal row and the seal-stamp interstitial between links, and a "click to skip" note.
// Input is locked: App's capture handler turns any press into a skip. The layer fades in over 0.25 s and out over the last
// 0.35 s of the sequence, which is when the board's result lands underneath.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { WebGLRenderer } from 'three'
import type { BattleState } from '../../engine'
import { activateSlot, CutinView } from './CutinView'
import { bakeStats, pinBakes, pinnedBakes, unpinBakes } from './crowd/bake'
import { cacheStats } from '../figures/kit'
import { perf } from './perf'
import { player } from './player'
import { prep, warmItems } from './prep'
import { FADE_OUT, SCENE_INFO } from './sceneInfo'
import type { Evaluated } from './timeline'
import './cutins.css'

perf.mark('chunk-loaded')
// the warm pool's size for the probe (docs/spec/51 "Performance": memory)
perf.pool(() => {
  const k = cacheStats()
  const b = bakeStats()
  return { kitGeometries: k.geometries, kitBytes: k.bytes, bakeSets: b.sets, bakeBytes: b.bytes, pinnedBakes: pinnedBakes() }
})

const TEST = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === '1'
const DPR = typeof window === 'undefined' ? 1 : TEST ? 1 : Math.min(window.devicePixelRatio, 1.5)

export interface CutinLayerProps {
  /** Changes when another battle loads: the warm-up runs again for its units. */
  battleKey: string
  /** The battle being fought (read when the warm-up starts). */
  battle: () => BattleState
  /** Show the "Preparing the field" note while the warm-up runs (the battle screen). */
  note?: boolean
}

export default function CutinLayer({ battleKey, battle, note = true }: CutinLayerProps) {
  const v = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot)
  const slots = useSyncExternalStore(prep.subscribe, prep.getSnapshot, prep.getSnapshot)
  const warm = useSyncExternalStore(prep.subscribe, prep.getWarm, prep.getWarm)
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef(v)
  viewRef.current = v
  const [gl, setGl] = useState<WebGLRenderer | null>(null)

  // the battle holds its crowd bakes and its compiled programs until it is unloaded
  useEffect(() => {
    prep.attach(true)
    prep.busy = () => player.active
    pinBakes(true)
    return () => {
      prep.attach(false)
      unpinBakes()
    }
  }, [])

  // warm up once the renderer exists, for this battle's units; again if the context is lost and restored
  useEffect(() => {
    const r = gl
    if (!r || !battleKey) return
    void prep.warmUp(warmItems(battle()))
    const canvas = r.domElement
    const restored = (): void => void prep.warmUp(warmItems(battle()))
    canvas.addEventListener('webglcontextrestored', restored)
    return () => canvas.removeEventListener('webglcontextrestored', restored)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleKey, gl])

  const onFrame = useCallback((ev: Evaluated) => {
    const el = ref.current
    const cur = viewRef.current
    if (!el || !cur.scene || !cur.active) return
    // the final stretch of the last link fades into the board, which now shows the result
    const out = cur.last && cur.phase === 'scene' ? Math.min(1, Math.max(0, (cur.scene.duration - ev.t) / FADE_OUT)) : 1
    el.style.opacity = String(out)
  }, [])

  // the link's world is on screen: start the clock. On the wall clock the first frame is drawn by the player's next animation
  // frame, not here: a draw outside the animation frame lets the next one queue straight behind it on a busy GPU. The canvas
  // was cleared when the last cut-in ended, so nothing stale shows meanwhile (and the layer is still fading in from 0).
  // Stepped by hand (tests, capture tools) it draws at once, as before.
  const start = useCallback(() => {
    activateSlot(viewRef.current.key)
    player.markReady()
    if (player.manual) player.controller.setTime(player.controller.t)
  }, [])
  const onSlotMount = useCallback(
    (key: string) => {
      prep.mounted(key)
      const cur = viewRef.current
      if (cur.active && cur.key === key && !player.isReady) start()
    },
    [start],
  )
  const onSlotReady = useCallback((key: string) => prep.ready(key), [])
  const busy = useCallback(() => player.active, [])
  // a prebuilt world is mounted already: start in the same commit that shows it
  useLayoutEffect(() => {
    if (!v.active || !v.key || player.isReady) return
    if (slots.some((s) => s.key === v.key && s.mounted)) start()
  }, [v.active, v.key, v.linkKey, slots, start])
  useLayoutEffect(() => {
    if (v.active) {
      perf.mark('layer-mount')
      return
    }
    if (ref.current) ref.current.style.opacity = ''
    // idle: nothing on show, and a blank canvas for the next cut-in's first moment
    activateSlot(null)
    if (gl) {
      gl.setRenderTarget(null)
      gl.clear()
    }
  }, [v.active, gl])

  const onRenderer = useCallback((r: WebGLRenderer) => setGl(r), [])

  const p = v.scene?.params
  const seals = (v.plan?.links ?? []).slice(0, v.seals.length)
  const live = v.active && !!v.scene
  return (
    <>
      <div
        ref={ref}
        className={`co-layer${live ? '' : ' co-idle'}`}
        aria-hidden={live ? undefined : true}
        {...(live
          ? {
              'data-testid': 'cutin-layer',
              'data-scene': v.scene!.id,
              'data-officer': v.scene!.officer,
              'data-title': v.scene!.title,
              'data-damage': p ? String(p.damage) : '',
              'data-falls': p ? String(p.falls) : '',
              'data-link': String(v.link),
              'data-links': String(v.links),
              'data-phase': v.phase,
              'data-kind': v.plan?.full ? 'full' : 'short',
              'data-enemy': v.plan?.enemy ? '1' : '0',
              'data-prebuilt': v.prebuilt ? '1' : '0',
            }
          : { 'data-testid': 'cutin-host', 'data-warm': warm.done ? 'done' : warm.running ? 'running' : 'idle' })}
      >
        <CutinView
          controller={player.controller}
          full
          dpr={DPR}
          sceneKey="game"
          slots={slots}
          activeKey={live ? v.key : null}
          onSlotMount={onSlotMount}
          onSlotReady={onSlotReady}
          busy={busy}
          overlays={live}
          onFrame={onFrame}
          onRenderer={onRenderer}
        />
        {live && v.phase === 'seal' && <div className="co-inter" data-testid="cutin-interstitial" />}
        {live && seals.length > 0 && (
          <div className="co-sealrow" data-testid="cutin-seals" data-count={seals.length}>
            {seals.map((l, i) => (
              <span key={i} className={`co-sealchip${v.seals[i]?.bond ? ' bond' : ''}${i === seals.length - 1 && v.phase === 'seal' ? ' stamp' : ''}`}>
                {SCENE_INFO[l.scene].glyph}
              </span>
            ))}
          </div>
        )}
        {live && (
          <div className="co-skipnote" aria-hidden="true">
            Click to skip
          </div>
        )}
      </div>
      {note && warm.running && !live && (
        <div className="co-preparing" role="status" data-testid="cutin-preparing">
          Preparing the field…
        </div>
      )}
    </>
  )
}
