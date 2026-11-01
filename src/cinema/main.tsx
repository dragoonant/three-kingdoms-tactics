// Cut-in review page (docs/spec/51-battle-cutins.md): scene picker, transport, beat-marked scrubber, beat list, free camera,
// safe frame, and a figure gallery. `?scene=A|B&t=<s>&ui=0` renders one frozen frame (for capture); `?test=1` adds
// window.__cinema for the e2e tests and the renderer.
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { CutinController } from '../client/cutins/controller'
import { CutinView } from '../client/cutins/CutinView'
import { makeFireArrows } from '../client/cutins/scenes/fireArrows'
import { makeThunderingCharge } from '../client/cutins/scenes/thunderingCharge'
import type { CutinScene, Evaluated } from '../client/cutins/timeline'
import { Gallery } from './Gallery'
import './cinema.css'

type SceneId = 'A' | 'B'

const SCENES: Record<SceneId, CutinScene> = {
  A: makeFireArrows(420, 2),
  B: makeThunderingCharge(1060, 4),
}

interface CinemaApi {
  ready: boolean
  setTime(t: number): Promise<void>
  scene(id?: string): string
  duration(): number
  time(): number
  beats(): { id: string; start: number; end: number; label: string }[]
}
declare global {
  interface Window {
    __cinema?: CinemaApi
  }
}

const params = new URLSearchParams(window.location.search)
const initialScene: SceneId = params.get('scene') === 'B' ? 'B' : 'A'
const initialT = params.has('t') ? Number(params.get('t')) : null
const uiOff = params.get('ui') === '0'
const testMode = params.get('test') === '1'

const fmt = (t: number): string => t.toFixed(2)
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

function useController(): CutinController {
  const ref = useRef<CutinController | null>(null)
  if (!ref.current) ref.current = new CutinController(SCENES[initialScene])
  return ref.current
}

function useCtl(c: CutinController): { ev: Evaluated; tick: number } {
  const [ev, setEv] = useState<Evaluated>(c.frame.current)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const a = c.subscribe(setEv)
    const b = c.onState(() => setTick((n) => n + 1))
    return () => {
      a()
      b()
    }
  }, [c])
  return { ev, tick }
}

function Scrubber({ c, ev }: { c: CutinController; ev: Evaluated }) {
  const ref = useRef<HTMLDivElement>(null)
  const sc = c.scene
  const seek = useCallback(
    (clientX: number) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const u = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
      c.pause()
      c.setTime(u * sc.duration)
    },
    [c, sc.duration],
  )
  const drag = useRef(false)
  const onDown = (e: RPointerEvent): void => {
    drag.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    seek(e.clientX)
  }
  const pct = (t: number): string => `${(t / sc.duration) * 100}%`
  return (
    <div
      ref={ref}
      className="cin-track"
      role="slider"
      tabIndex={0}
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={sc.duration}
      aria-valuenow={Number(fmt(ev.t))}
      data-testid="scrubber"
      onPointerDown={onDown}
      onPointerMove={(e) => drag.current && seek(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onPointerCancel={() => (drag.current = false)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.5 : 1 / 30
        if (e.key === 'ArrowRight') {
          c.pause()
          c.setTime(c.t + step)
        } else if (e.key === 'ArrowLeft') {
          c.pause()
          c.setTime(c.t - step)
        }
      }}
    >
      {sc.beats.map((b) => (
        <div key={b.id} className={`cin-seg${ev.beat.id === b.id ? ' cur' : ''}`} style={{ left: pct(b.start), width: `calc(${pct(b.end - b.start)})` }}>
          {b.id}
        </div>
      ))}
      {sc.timeScale.map((s, i) => (
        <div key={i} className={`cin-flag ${s.kind}`} style={{ left: pct(s.start), width: pct(s.end - s.start) }} />
      ))}
      <div className="cin-head-line" style={{ left: pct(ev.t) }} />
    </div>
  )
}

interface PanelProps {
  c: CutinController
  sceneId: SceneId
  setSceneId: (id: SceneId) => void
  onReady: () => void
}

function ScenePanel({ c, sceneId, setSceneId, onReady }: PanelProps) {
  const { ev } = useCtl(c)
  const [safe, setSafe] = useState(false)
  const [, force] = useState(0)
  useEffect(() => c.onState(() => force((n) => n + 1)), [c])
  const sc = c.scene

  const pick = (id: SceneId): void => {
    c.pause()
    setSceneId(id)
    c.play()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && (e.target.getAttribute('role') === 'slider' || e.target.tagName === 'INPUT')) return
      if (e.code === 'Space') {
        e.preventDefault()
        c.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [c])

  const jump = (start: number): void => {
    c.pause()
    c.setTime(start + 0.001)
  }

  const rateLabel = ev.hitStop ? 'hit-stop' : ev.rate < 0.999 ? `${ev.rate.toFixed(2)}× story` : ''
  return (
    <div className="cin-main">
      <div className="cin-left">
        <div className="cin-frame-wrap">
          <CutinView controller={c} safe={safe} sceneKey={sceneId} onReady={onReady} />
        </div>
        <div className="cin-bar">
          <div className="cin-transport">
            <button type="button" className="slip" onClick={() => c.toggle()} data-testid="play">
              {c.playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="slip" onClick={() => c.restart()} data-testid="restart">
              Restart
            </button>
            <button type="button" className="slip" aria-pressed={c.loop} onClick={() => c.setLoop(!c.loop)}>
              Loop
            </button>
            <span className="seg" role="group" aria-label="Speed">
              {[0.25, 0.5, 1].map((s) => (
                <button key={s} type="button" className="slip small" aria-pressed={c.speed === s} onClick={() => c.setSpeed(s)}>
                  {s}×
                </button>
              ))}
            </span>
            <span className="grow" />
            <span className="cin-time" data-testid="time">
              {fmt(ev.t)} <em>/ {fmt(sc.duration)} s</em>
            </span>
          </div>
          <Scrubber c={c} ev={ev} />
          <div className="cin-legend">
            <span>
              <i style={{ background: 'var(--lantern)' }} />
              slow motion
            </span>
            <span>
              <i style={{ background: 'var(--cinnabar)' }} />
              hit-stop
            </span>
            <span>{rateLabel ? `now: ${rateLabel}` : 'now: real time'}</span>
          </div>
        </div>
      </div>
      <aside className="cin-side">
        <section className="panel">
          <h2>
            Scene<small>{sc.title}</small>
          </h2>
          <div className="opts">
            <button type="button" className="slip" aria-pressed={sceneId === 'A'} onClick={() => pick('A')} data-testid="scene-A">
              A &middot; Fire Arrows
            </button>
            <button type="button" className="slip" aria-pressed={sceneId === 'B'} onClick={() => pick('B')} data-testid="scene-B">
              B &middot; Charge
            </button>
          </div>
          <div className="opts" style={{ marginTop: 10 }}>
            <button type="button" className="slip small" aria-pressed={c.free} onClick={() => c.setFree(!c.free)} data-testid="free-cam">
              Free camera
            </button>
            <button type="button" className="slip small" aria-pressed={safe} onClick={() => setSafe(!safe)} data-testid="safe-frame">
              Show safe frame
            </button>
          </div>
          <p className="sample">
            Sample event: <b>{sc.sample.damage.toLocaleString('en-US')}</b> damage, <b>{sc.sample.falls}</b> miniatures fall. {sc.officer}, {sc.title}, {sc.duration.toFixed(1)} s.
            {c.free ? ' Free camera is on: pause, then drag to look around.' : ''}
          </p>
        </section>
        <section className="panel">
          <h2>
            Beats<small>click to jump</small>
          </h2>
          <ol className="beats" data-testid="beats">
            {sc.beats.map((b) => (
              <li key={b.id}>
                <button type="button" className={`beat${ev.beat.id === b.id ? ' cur' : ''}`} onClick={() => jump(b.start)} data-testid={`beat-${b.id}`} aria-current={ev.beat.id === b.id ? 'step' : undefined}>
                  <b>{b.id}</b>
                  <span className="tm">
                    {b.start.toFixed(1)}&ndash;{b.end.toFixed(1)}
                  </span>
                  <span>{b.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}

interface AppProps {
  c: CutinController
  sceneId: SceneId
  setSceneId: (id: SceneId) => void
  onReady: () => void
}

function App({ c, sceneId, setSceneId, onReady }: AppProps) {
  const [tab, setTab] = useState<'scenes' | 'gallery'>('scenes')
  useEffect(() => {
    if (initialT === null && !testMode) c.play()
  }, [c])
  return (
    <div className="cin-app">
      <header className="cin-head">
        <h1>
          Battle Cut-ins<small>The table comes alive</small>
        </h1>
        <nav className="cin-tabs" aria-label="Views">
          <button type="button" className="slip" aria-pressed={tab === 'scenes'} onClick={() => setTab('scenes')} data-testid="tab-scenes">
            Scenes
          </button>
          <button
            type="button"
            className="slip"
            aria-pressed={tab === 'gallery'}
            onClick={() => {
              c.pause()
              setTab('gallery')
            }}
            data-testid="tab-gallery"
          >
            Gallery
          </button>
        </nav>
      </header>
      {tab === 'scenes' ? <ScenePanel c={c} sceneId={sceneId} setSceneId={setSceneId} onReady={onReady} /> : <Gallery />}
    </div>
  )
}

function Root() {
  const c = useController()
  const [sceneId, setSceneIdState] = useState<SceneId>(initialScene)
  const apiRef = useRef<CinemaApi | null>(null)

  const setSceneId = useCallback(
    (id: SceneId) => {
      if (apiRef.current) apiRef.current.ready = false
      setSceneIdState(id)
      c.setScene(SCENES[id])
    },
    [c],
  )

  const onReady = useCallback(() => {
    void (async () => {
      await document.fonts.ready
      await nextFrame()
      c.setTime(c.t)
      if (apiRef.current) apiRef.current.ready = true
    })()
  }, [c])

  useEffect(() => {
    if (initialT !== null) queueMicrotask(() => c.setTime(initialT))
    if (testMode) {
      const api: CinemaApi = {
        ready: false,
        async setTime(t: number) {
          c.pause()
          c.setTime(t)
          await nextFrame()
          await nextFrame()
        },
        scene(id?: string) {
          if (id === 'A' || id === 'B') setSceneId(id)
          return id === 'A' || id === 'B' ? id : c.scene.id
        },
        duration: () => c.scene.duration,
        time: () => c.t,
        beats: () => c.scene.beats,
      }
      apiRef.current = api
      window.__cinema = api
    }
    return () => {
      delete window.__cinema
      c.dispose()
    }
  }, [c, setSceneId])

  if (uiOff) {
    return (
      <div className="ui0">
        <CutinView controller={c} dpr={1} sceneKey={sceneId} onReady={onReady} />
      </div>
    )
  }
  return <App c={c} sceneId={sceneId} setSceneId={setSceneId} onReady={onReady} />
}

createRoot(document.getElementById('root')!).render(<Root />)
