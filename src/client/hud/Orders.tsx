// Action slips fanned from the officer panel, the silk order card with its exact previews, and the cinnabar seal.
import { useMemo } from 'react'
import { legalActions, query, type Facing, type Pos } from '../../engine'
import { facingWord, num } from '../ledger'
import { nameOfUnit, shortName } from '../names'
import { useGame } from '../store/game'
import { canControl, pendingOrder, stratagemRange } from '../store/orders'
import { ARROW } from './parts'

const range = (a: number, b: number): string => (a === b ? num(a) : `${num(a)}–${num(b)}`)

export function ActionFan() {
  const state = useGame((s) => s.state)
  const playing = useGame((s) => s.playing)
  const ui = useGame((s) => s.ui)
  const setMode = useGame((s) => s.setMode)
  const undo = useGame((s) => s.undo)
  const sel = state.units.find((u) => u.id === ui.selectedId)
  const info = useMemo(() => {
    if (!sel || !canControl(state, sel)) return null
    const attack = query.attackTargets(state, sel.id)
    const sway = query.swayTargets(state, sel.id)
    const strat = query.stratagemOptions(state, sel.id)
    const canUndo = legalActions(state).some((a) => a.type === 'undoMove' && a.unit === sel.id)
    const canEscape = query.canEscape(state, sel.id)
    return { attack, sway, strat, canUndo, canEscape }
  }, [state, sel])
  if (!sel || !info || playing) return null
  const anyStrat = info.strat.some((o) => o.usable)
  const stratWhy = info.strat.length === 0 ? 'No stratagems' : (info.strat.find((o) => !o.usable)?.reason ?? '')
  const slips: { key: string; label: string; mode: 'attack' | 'stratagem' | 'sway' | 'wait'; ok: boolean; why: string }[] = [
    { key: 'attack', label: 'Attack', mode: 'attack', ok: info.attack.length > 0, why: 'No foe in reach' },
    { key: 'stratagem', label: 'Stratagem', mode: 'stratagem', ok: anyStrat, why: stratWhy },
    { key: 'sway', label: 'Sway', mode: 'sway', ok: info.sway.length > 0, why: 'No one to sway within 2 tiles' },
    { key: 'wait', label: 'Wait', mode: 'wait', ok: true, why: '' },
  ]
  return (
    <nav className="fan" aria-label="Orders">
      {slips.map((s, i) => (
        <button
          key={s.key}
          type="button"
          className={`fan-slip f${i}${ui.mode === s.mode ? ' picked' : ''}`}
          disabled={!s.ok}
          data-testid={`act-${s.key}`}
          aria-pressed={ui.mode === s.mode}
          aria-label={s.ok ? s.label : `${s.label}, unavailable: ${s.why}`}
          onClick={() => setMode(ui.mode === s.mode ? 'none' : s.mode)}
        >
          <span className="fan-label">{s.label}</span>
          {!s.ok && <span className="fan-why">{s.why}</span>}
        </button>
      ))}
      {info.canEscape && (
        <button
          type="button"
          className={`fan-slip escape${ui.mode === 'escape' ? ' picked' : ''}`}
          data-testid="act-escape"
          aria-pressed={ui.mode === 'escape'}
          onClick={() => setMode(ui.mode === 'escape' ? 'none' : 'escape')}
        >
          <span className="fan-label">Escape</span>
        </button>
      )}
      {info.canUndo && (
        <button type="button" className="fan-slip undo" data-testid="act-undo" onClick={undo}>
          <span className="fan-label">Undo move</span>
        </button>
      )}
    </nav>
  )
}

const COMPASS: { f: Facing; cls: string }[] = [
  { f: 'N', cls: 'n' },
  { f: 'W', cls: 'w' },
  { f: 'E', cls: 'e' },
  { f: 'S', cls: 's' },
]

export function OrdersCard() {
  const state = useGame((s) => s.state)
  const playing = useGame((s) => s.playing)
  const ui = useGame((s) => s.ui)
  const act = useGame((s) => s.act)
  const cancel = useGame((s) => s.cancel)
  const pickFacing = useGame((s) => s.pickFacing)
  const toggleExclude = useGame((s) => s.toggleExclude)
  const sel = state.units.find((u) => u.id === ui.selectedId)
  const mine = !!sel && canControl(state, sel) && !playing
  const order = useMemo(() => (mine ? pendingOrder(state, ui) : null), [mine, state, ui])

  // hover preview of a strike while no order is open
  const hoverAttack = useMemo(() => {
    if (!mine || !sel || ui.mode !== 'none' || !ui.hover) return null
    const t = query.unitAt(state, ui.hover.x, ui.hover.y)
    if (!t || t.side === sel.side) return null
    const pv = query.attackPreview(state, sel.id, t.id)
    return pv ? { t, pv, inReach: query.attackTargets(state, sel.id).includes(t.id) } : null
  }, [mine, sel, state, ui.mode, ui.hover])

  const stratFocus: Pos | null = useMemo(() => {
    if (!mine || !sel || ui.mode !== 'stratagem' || !ui.strat) return null
    if (ui.pendingAnchor) return ui.pendingAnchor
    const anchors = query.stratagemTargets(state, sel.id, ui.strat)
    return ui.hover && anchors.some((a) => a.x === ui.hover!.x && a.y === ui.hover!.y) ? ui.hover : null
  }, [mine, sel, state, ui.mode, ui.strat, ui.pendingAnchor, ui.hover])
  const stratPv = useMemo(
    () => (sel && ui.strat && stratFocus ? query.stratagemPreview(state, sel.id, ui.strat, stratFocus, ui.exclude) : null),
    [sel, ui.strat, stratFocus, state, ui.exclude],
  )
  const basePv = useMemo(
    () => (sel && ui.strat && stratFocus ? query.stratagemPreview(state, sel.id, ui.strat, stratFocus, []) : null),
    [sel, ui.strat, stratFocus, state],
  )

  if (!mine || !sel) return null
  const def = ui.strat ? state.data.stratagems[ui.strat] : undefined
  const nm = (id: string): string => shortName(nameOfUnit(state, id))

  let body: React.ReactNode = null
  if (ui.mode === 'wait') {
    body = (
      <div className="waitbody">
        <div>
          <h3>Wait — choose a facing</h3>
          <p className="muted">The unit holds its ground and its turn ends. Facing decides which arc foes strike.</p>
        </div>
        <div className="compass" role="group" aria-label="Facing">
          {COMPASS.map(({ f, cls }) => (
            <button
              key={f}
              type="button"
              className={`arrow ${cls}${ui.pendingFacing === f ? ' picked' : ''}`}
              data-testid={`face-${f}`}
              aria-label={`Face ${facingWord(f)}`}
              aria-pressed={ui.pendingFacing === f}
              onClick={() => pickFacing(f)}
            >
              {ARROW[f]}
              <small>{f}</small>
            </button>
          ))}
          <span className="compass-centre" aria-hidden="true" />
        </div>
      </div>
    )
  } else if (ui.mode === 'escape') {
    const progress = query
      .objectives(state)
      .filter((o) => o.cond.type === 'escape')
      .map((o) => o.text)
    body = (
      <>
        <h3>Escape — {nm(sel.id)}</h3>
        <p>{nm(sel.id)} slips off the table by this exit. They leave the battle at once and count toward the objective.</p>
        {progress.length > 0 && <p className="muted">{progress.join(' · ')}</p>}
      </>
    )
  } else if (ui.mode === 'attack') {
    const pv = order?.preview?.attack
    body = pv ? (
      <>
        <h3>Attack — {nm(pv.target)}</h3>
        <p className="big">
          {range(pv.damage.min, pv.damage.max)} damage{pv.routsAtMax ? (pv.routsAtMin ? ' · routs them' : ' · may rout') : ''}
        </p>
        <p className="muted">
          {pv.multipliers.map((m) => `${m.name} ×${m.value.toFixed(2)}`).join(' · ')}
        </p>
        <p>
          Troops after: {range(Math.max(0, pv.targetTroopsAfter.min), Math.max(0, pv.targetTroopsAfter.max))} ·{' '}
          {pv.counter.possible ? `Counterstrike ${range(pv.counter.min, pv.counter.max)}` : `No counterstrike (${pv.counter.reason ?? 'none'})`}
        </p>
      </>
    ) : (
      <>
        <h3>Attack</h3>
        <p className="muted">Click a foe outlined in red on the table.</p>
      </>
    )
  } else if (ui.mode === 'sway') {
    const pv = order?.preview?.sway
    body = pv ? (
      <>
        <h3>Sway — {nm(ui.pendingTarget!)}</h3>
        <p className="big">{pv.chance}% chance to join us</p>
        <p className="muted">One try per pair. A swayed unit keeps its troops and is done for this phase.</p>
      </>
    ) : (
      <>
        <h3>Sway</h3>
        <p className="muted">Click a captain outlined in red (within 2 tiles). Commanders cannot be swayed.</p>
      </>
    )
  } else if (ui.mode === 'stratagem') {
    if (!def) {
      body = (
        <>
          <h3>Stratagem</h3>
          <p className="muted">Pick a slip from the officer panel.</p>
        </>
      )
    } else if (!stratPv) {
      body = (
        <>
          <h3>{def.name}</h3>
          <p>{def.text}</p>
          <p className="muted">Costs {def.cost} Qi · range {def.range.min}–{def.range.max}. Click a tile outlined in red; hover first to read the numbers.</p>
        </>
      )
    } else {
      const r = stratagemRange(stratPv)
      const links = basePv?.chain.slice(1) ?? []
      body = (
        <>
          <h3>
            {def.name} <small>({def.tag})</small>
          </h3>
          {stratPv.targets.length > 0 ? (
            <ul className="tgt">
              {stratPv.targets.map((t) => (
                <li key={t.unit}>
                  <b>{nm(t.unit)}</b> {t.max > 0 ? range(t.min, t.max) : 'no damage'}
                  {t.arc ? ` · ${t.arc} arc` : ''}
                  {t.confuseChance > 0 ? ` · confuse ${t.confuseChance}%` : ''}
                  {t.foresightChance > 0 ? ` · sees through ${t.foresightChance}%` : ''}
                  {t.routsAtMax ? ' · may rout' : ''}
                </li>
              ))}
            </ul>
          ) : stratPv.heals.length > 0 ? (
            <ul className="tgt">
              {stratPv.heals.map((h) => (
                <li key={h.unit}>
                  <b>{nm(h.unit)}</b> +{num(h.amount)} troops
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No foe is struck directly.</p>
          )}
          {stratPv.ignites && <p>Sets the tile alight afterwards.</p>}
          {stratPv.dashTo && <p>Dashes in to tile {String.fromCharCode(65 + stratPv.dashTo.x)}{stratPv.dashTo.y + 1} first.</p>}
          {stratPv.targets.length > 0 && <p className="muted">Opening strike {range(r.min, r.max)} in all.</p>}
          {links.length > 0 && (
            <div className="chainplan">
              <h4>
                Planned chain ×{stratPv.chain.length} · about {num(Math.round(stratPv.totalExpected))} damage in all
              </h4>
              <ul>
                {links.map((l) => {
                  const off = ui.exclude.includes(l.unit)
                  return (
                    <li key={l.link}>
                      <label className={off ? 'off' : ''}>
                        <input type="checkbox" checked={!off} onChange={() => toggleExclude(l.unit)} data-testid={`chain-${l.unit}`} />
                        <span>
                          Link {l.link + 1}: <b>{nm(l.unit)}</b> — {state.data.stratagems[l.strat]?.name}
                          {l.bond ? ' (sworn bond)' : ''} ×{l.multiplier.toFixed(2)}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )
    }
  } else if (hoverAttack) {
    const { t, pv, inReach } = hoverAttack
    body = (
      <>
        <h3>Strike preview — {nm(t.id)}</h3>
        <p className="big">
          {range(pv.damage.min, pv.damage.max)} damage · {pv.arc} arc ×{(pv.multipliers.find((m) => m.id === 'arc')?.value ?? 1).toFixed(2)}
        </p>
        <p className="muted">
          {pv.counter.possible ? `Counterstrike ${range(pv.counter.min, pv.counter.max)}` : `No counterstrike (${pv.counter.reason ?? 'none'})`}
          {inReach ? '' : ` · not in reach from here (${pv.distance} tiles)`}
        </p>
      </>
    )
  }

  const showCard = body !== null
  if (!showCard) return null
  return (
    <section className="orders" data-testid="orders-card" aria-live="polite">
      <div className="orders-body">{body}</div>
      <div className="orders-actions">
        {ui.mode !== 'none' && (
          <button type="button" className="back" onClick={cancel} data-testid="orders-cancel">
            Back
          </button>
        )}
        {order && (
          <button type="button" className="seal" data-testid="seal" onClick={() => act(order.action)}>
            <span className="seal-mark" aria-hidden="true">
              令
            </span>
            <span className="seal-text">{order.label}</span>
          </button>
        )}
      </div>
    </section>
  )
}
