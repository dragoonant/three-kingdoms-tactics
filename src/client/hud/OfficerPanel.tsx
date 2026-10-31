import { useMemo } from 'react'
import { query, type Unit } from '../../engine'
import { num } from '../ledger'
import { shortName } from '../names'
import { useGame } from '../store/game'
import { canControl } from '../store/orders'
import { BrushBar, Coins, Cord, Portrait } from './parts'

const TYPE_LABEL = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' } as const

export function OfficerPanel() {
  const state = useGame((s) => s.state)
  const scene = useGame((s) => s.scene)
  const playing = useGame((s) => s.playing)
  const ui = useGame((s) => s.ui)
  const pickStrat = useGame((s) => s.pickStrat)
  // read-only view of any unit the player clicked; hover does not replace the selection
  const live: Unit | undefined = state.units.find((u) => u.id === ui.selectedId)
  const vis = scene.units.find((u) => u.id === ui.selectedId)
  const options = useMemo(() => (live ? query.stratagemOptions(state, live.id) : []), [state, live])
  if (!live || !vis) return null
  const off = state.data.officers[live.officer]
  if (!off) return null
  const mine = canControl(state, live) && !playing
  const acted = live.done
  const stratMode = ui.mode === 'stratagem'
  return (
    <aside className={`officer ${live.side}`} data-testid="officer-panel" aria-label={`Officer ${off.name}`}>
      <Cord top />
      <Cord />
      <header>
        <Portrait name={off.name} side={live.side} />
        <div className="who">
          <h2>{shortName(off.name)}</h2>
          <p>
            {TYPE_LABEL[live.type]} · {live.side === 'han' ? 'Han' : 'Yellow Turban'}
            {live.commander ? ' · Commander' : ''}
          </p>
        </div>
      </header>
      <div className="troops">
        <b data-testid="troops">{num(vis.troops)}</b>
        <span> / {num(live.maxTroops)} troops</span>
        <BrushBar value={vis.troops} max={live.maxTroops} side={live.side} />
      </div>
      <div className="qi">
        <Coins qi={live.qi} />
        <span className="qi-n">Qi {live.qi}</span>
      </div>
      <dl className="stats">
        <div>
          <dt>War</dt>
          <dd>{off.war}</dd>
        </div>
        <div>
          <dt>Int</dt>
          <dd>{off.int}</dd>
        </div>
        <div>
          <dt>Lead</dt>
          <dd>{off.lead}</dd>
        </div>
        <div>
          <dt>Cha</dt>
          <dd>{off.cha}</dd>
        </div>
      </dl>
      <div className="chips">
        {live.confused && <span className="chip bad">Confused</span>}
        {acted && !live.confused && <span className="chip">Acted</span>}
        {live.moved && !acted && <span className="chip">Moved</span>}
        {off.loyalty !== null && <span className="chip">Loyalty {off.loyalty}</span>}
      </div>
      <ul className="strats" aria-label="Stratagems">
        {options.map((o) => {
          const def = state.data.stratagems[o.id]
          const on = mine && o.usable
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`strat-slip${ui.strat === o.id && stratMode ? ' picked' : ''}${on && stratMode && ui.strat === null ? ' invite' : ''}`}
                disabled={!on}
                aria-label={`Stratagem ${o.name}, cost ${o.cost} Qi${o.usable ? '' : ', unavailable: ' + (o.reason ?? '')}`}
                data-testid={`strat-${o.id}`}
                onClick={() => pickStrat(o.id)}
              >
                <span className="strat-name">{o.name}</span>
                <span className="strat-cost">{o.cost}</span>
                <span className="strat-tag">{def?.tag}</span>
                <span className="strat-note">{o.usable ? def?.text : o.reason}</span>
              </button>
            </li>
          )
        })}
        {options.length === 0 && <li className="strat-none">No stratagems</li>}
      </ul>
      {live.side === 'yellow' && <p className="readonly">Enemy officer. Select one of your own units, then hover this one to read the strike numbers.</p>}
    </aside>
  )
}
