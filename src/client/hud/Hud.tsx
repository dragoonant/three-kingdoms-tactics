import { useMemo } from 'react'
import { query } from '../../engine'
import { facingWord, num, windWord } from '../ledger'
import { phaseLabel, shortName } from '../names'
import { viewApi } from '../board/layout'
import type { Speed } from '../presentation/beats'
import { useGame } from '../store/game'
import { canControl } from '../store/orders'
import { Banners } from './Banners'
import { OfficerPanel } from './OfficerPanel'
import { ActionFan, OrdersCard } from './Orders'
import { Pennant } from './parts'

const SPEEDS: { id: Speed; label: string }[] = [
  { id: 'full', label: 'Full' },
  { id: 'quick', label: 'Quick' },
  { id: 'instant', label: 'Instant' },
]

function TopBar() {
  const scene = useGame((s) => s.scene)
  const state = useGame((s) => s.state)
  const speed = useGame((s) => s.speed)
  const setSpeed = useGame((s) => s.setSpeed)
  const ledgerOpen = useGame((s) => s.ledgerOpen)
  const toggleLedger = useGame((s) => s.toggleLedger)
  const go = useGame((s) => s.go)
  return (
    <header className="topbar" data-testid="topbar">
      <div className="round">
        <span className="round-n" data-testid="round">
          Round {scene.round}
        </span>
        <span className="round-of">of {state.turnLimit}</span>
        <span className={`phase-pip ${scene.side}`} aria-hidden="true" />
        <span className="phase" data-testid="phase">
          {phaseLabel(state, scene.side)}
        </span>
      </div>
      <div className="speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button key={s.id} type="button" className={speed === s.id ? 'on' : ''} aria-pressed={speed === s.id} data-testid={`speed-${s.id}`} onClick={() => setSpeed(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="bar-btns">
        <button type="button" className={ledgerOpen ? 'on' : ''} aria-pressed={ledgerOpen} onClick={toggleLedger} data-testid="ledger-toggle">
          Ledger
        </button>
        <button type="button" onClick={() => viewApi.rotate(-1)} aria-label="Rotate view left" className="rot">
          ⟲
        </button>
        <button type="button" onClick={() => viewApi.rotate(1)} aria-label="Rotate view right" className="rot">
          ⟳
        </button>
        <button type="button" onClick={() => go('title')} data-testid="menu">
          Leave
        </button>
      </div>
    </header>
  )
}

function Ledger() {
  const ledger = useGame((s) => s.ledger)
  const open = useGame((s) => s.ledgerOpen)
  const toggle = useGame((s) => s.toggleLedger)
  const recent = ledger.slice(-3)
  const all = useMemo(() => ledger.slice().reverse(), [ledger])
  return (
    <>
      <ol className="ledger-recent" aria-label="Latest events" data-testid="ledger-recent">
        {recent.map((l) => (
          <li key={l.id} className={`tone-${l.tone}`}>
            {l.text}
          </li>
        ))}
      </ol>
      <aside className={`ledger-drawer${open ? ' open' : ''}`} aria-hidden={!open} aria-label="Scribe's ledger">
        <header>
          <h2>The Scribe's Ledger</h2>
          <button type="button" onClick={toggle} aria-label="Close ledger">
            Close
          </button>
        </header>
        <ol data-testid="ledger-full">
          {all.map((l) => (
            <li key={l.id} className={`tone-${l.tone}`}>
              <span className="r">R{l.round}</span> {l.text}
            </li>
          ))}
          {all.length === 0 && <li className="muted">Nothing has happened yet.</li>}
        </ol>
      </aside>
    </>
  )
}

function WindSlip() {
  const scene = useGame((s) => s.scene)
  const state = useGame((s) => s.state)
  const w = useMemo(() => query.wind({ ...state, wind: scene.wind, round: scene.round }), [state, scene.wind, scene.round])
  const calm = w.current.strength === 'calm' || !w.current.dir
  return (
    <aside className="windslip" data-testid="wind">
      <Pennant dir={w.current.dir} calm={calm} />
      <div>
        <p className="now">
          Wind: {windWord(w.current.dir, w.current.strength)}
          {w.next ? ` · Round ${w.next.round}: ${windWord(w.next.dir, w.next.strength)}` : ''}
        </p>
      </div>
    </aside>
  )
}

function EndPhase() {
  const state = useGame((s) => s.state)
  const playing = useGame((s) => s.playing)
  const endPhase = useGame((s) => s.endPhase)
  const ready = query.readyUnits(state, 'han').length
  const mine = state.side === 'han' && !state.result
  return (
    <button type="button" className={`endphase${ready === 0 && mine && !playing ? ' pulse' : ''}`} disabled={!mine || playing} onClick={endPhase} data-testid="end-phase">
      <span className="ep-label">End phase</span>
      <span className="ep-count" data-testid="ready-count">
        {state.result ? 'battle over' : mine ? `${ready} ready` : 'rebels move'}
      </span>
    </button>
  )
}

function TileSlip() {
  const state = useGame((s) => s.state)
  const scene = useGame((s) => s.scene)
  const hover = useGame((s) => s.ui.hover)
  const playing = useGame((s) => s.playing)
  const info = useMemo(() => {
    if (!hover || playing) return null
    const idx = hover.y * state.grid.width + hover.x
    const terr = scene.terrain[idx]
    if (!terr) return null
    const def = state.data.terrain[terr]
    const burn = state.burn[idx] ?? 0
    let fire: string | null = null
    if (burn > 0) {
      const f = query.fireForecast(state)
      const around = f.spread
        .filter((s) => Math.abs(s.x - hover.x) + Math.abs(s.y - hover.y) === 1)
        .map((s) => `${String.fromCharCode(65 + s.x)}${s.y + 1} ${Math.round(s.chance * 100)}%`)
      fire = `Burning, ${burn} round${burn === 1 ? '' : 's'} left. Spread at round end: ${around.length ? around.join(', ') : 'nowhere (wind or terrain)'}`
    } else {
      const f = query.fireForecast(state)
      const s = f.spread.find((q) => q.x === hover.x && q.y === hover.y)
      if (s) fire = `Fire may reach here at round end: ${Math.round(s.chance * 100)}%`
    }
    const u = state.units.find((x) => x.x === hover.x && x.y === hover.y)
    return { def, fire, ref: `${String.fromCharCode(65 + hover.x)}${hover.y + 1}`, unit: u }
  }, [hover, playing, state, scene.terrain])
  if (!info) return null
  const mv = info.def.move
  return (
    <aside className="tileslip" data-testid="tile-slip">
      <h4>
        {info.def.name} <small>{info.ref}</small>
      </h4>
      {info.unit && (
        <p>
          {shortName(state.data.officers[info.unit.officer]?.name ?? info.unit.id)} · {num(info.unit.troops)} troops · faces {facingWord(info.unit.facing)}
        </p>
      )}
      <p className="muted">
        {mv ? `Move ${mv.infantry}/${mv.cavalry}/${mv.archers}` : 'Impassable'} · cover ×{info.def.def.toFixed(2)}
        {info.def.elev > 0 ? ' · high ground' : ''}
      </p>
      {info.fire && <p className="fire">{info.fire}</p>}
    </aside>
  )
}

export function Hud() {
  const playing = useGame((s) => s.playing)
  const state = useGame((s) => s.state)
  const lastReject = useGame((s) => s.lastReject)
  const mineToMove = state.side === 'han' && !state.result && !playing
  const ready = state.units.filter((u) => canControl(state, u)).length
  return (
    <div className={`hud${playing ? ' locked' : ''}`} data-testid="hud" data-playing={playing ? '1' : '0'}>
      <div className="vignette" aria-hidden="true" />
      <TopBar />
      <Ledger />
      <WindSlip />
      <TileSlip />
      <EndPhase />
      <div className="dock">
        <OfficerPanel />
        <ActionFan />
        <OrdersCard />
      </div>
      <Banners />
      {mineToMove && ready === 0 && <p className="hint">All your officers have acted. End the phase.</p>}
      {lastReject && <p className="toast">Rejected: {lastReject}</p>}
    </div>
  )
}
