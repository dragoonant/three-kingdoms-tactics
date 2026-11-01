// The full-screen cut-in over the board (docs/spec/51 v0.3). Mounted by App while the player is active: a CutinView on the
// player's controller, the chain's seal row and the seal-stamp interstitial between links, and a "click to skip" note.
// Input is locked: App's capture handler turns any press into a skip. The layer fades in over 0.25 s and out over the last
// 0.35 s of the sequence, which is when the board's result lands underneath.
import { useCallback, useRef, useSyncExternalStore } from 'react'
import { CutinView } from './CutinView'
import { player } from './player'
import { FADE_OUT, SCENE_INFO } from './sceneInfo'
import type { Evaluated } from './timeline'
import './cutins.css'

export default function CutinLayer() {
  const v = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot)
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef(v)
  viewRef.current = v

  const onFrame = useCallback((ev: Evaluated) => {
    const el = ref.current
    const cur = viewRef.current
    if (!el || !cur.scene) return
    // the final stretch of the last link fades into the board, which now shows the result
    const out = cur.last && cur.phase === 'scene' ? Math.min(1, Math.max(0, (cur.scene.duration - ev.t) / FADE_OUT)) : 1
    el.style.opacity = String(out)
  }, [])
  const onWorldMount = useCallback(() => {
    player.controller.setTime(player.controller.t)
    player.markReady()
  }, [])

  if (!v.active || !v.scene) return null
  const p = v.scene.params
  const seals = (v.plan?.links ?? []).slice(0, v.seals.length)
  return (
    <div
      ref={ref}
      className="co-layer"
      data-testid="cutin-layer"
      data-scene={v.scene.id}
      data-officer={v.scene.officer}
      data-title={v.scene.title}
      data-damage={p ? String(p.damage) : ''}
      data-falls={p ? String(p.falls) : ''}
      data-link={String(v.link)}
      data-links={String(v.links)}
      data-phase={v.phase}
      data-kind={v.plan?.full ? 'full' : 'short'}
      data-enemy={v.plan?.enemy ? '1' : '0'}
    >
      <CutinView controller={player.controller} full dpr={typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === '1' ? 1 : Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 1.5)} sceneKey="game" worldKey={String(v.linkKey)} scene={v.scene} onFrame={onFrame} onWorldMount={onWorldMount} />
      {v.phase === 'seal' && <div className="co-inter" data-testid="cutin-interstitial" />}
      {seals.length > 0 && (
        <div className="co-sealrow" data-testid="cutin-seals" data-count={seals.length}>
          {seals.map((l, i) => (
            <span key={i} className={`co-sealchip${v.seals[i]?.bond ? ' bond' : ''}${i === seals.length - 1 && v.phase === 'seal' ? ' stamp' : ''}`}>
              {SCENE_INFO[l.scene].glyph}
            </span>
          ))}
        </div>
      )}
      <div className="co-skipnote" aria-hidden="true">
        Click to skip
      </div>
    </div>
  )
}
