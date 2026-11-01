// The unit card (docs/spec/50-presentation.md "Unit card"): a small card with only the pertinent facts (face, name, troops, Qi, status chips,
// side colour, troop type) and a "More" button that opens the full detail sheet as an overlay drawer, so the board is never covered or moved.
// Every number comes from the engine queries; the stratagem slips of an open Stratagem order live in their own compact picker.
import { useEffect, useMemo, useState } from 'react'
import { PLAYER_SIDE } from '../../data/types'
import { XP_PER_LEVEL } from '../../campaign'
import { query, type Unit } from '../../engine'
import { facingWord, num } from '../ledger'
import { buffChips, isGuestUnit, lyingInWait, retreatText } from '../campaign/helpers'
import { sideToken } from '../board/layout'
import { nameOfUnit, shortName, sideName } from '../names'
import { useCampaign } from '../store/campaign'
import { useGame } from '../store/game'
import { canControl } from '../store/orders'
import { BrushBar, Coins, Portrait, TroopIcon } from './parts'

const TYPE_LABEL = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' } as const

interface Chip {
  key: string
  text: string
  cls: string
  testid?: string
}

/** Status chips of a unit, most pertinent first (the card shows the first few, the sheet all of them). */
function unitChips(state: ReturnType<typeof useGame.getState>['state'], live: Unit, withLoyalty: boolean): Chip[] {
  const chips: Chip[] = []
  const off = state.data.officers[live.officer]
  const provoker = query.provokedBy(state, live.id)
  if (live.confused) chips.push({ key: 'confused', text: 'Confused', cls: 'bad' })
  if (provoker) chips.push({ key: 'provoked', text: `Provoked by ${shortName(nameOfUnit(state, provoker))}`, cls: 'bad', testid: 'chip-provoked' })
  const retreat = retreatText(live)
  if (retreat) chips.push({ key: 'retreat', text: retreat, cls: 'retreat', testid: 'chip-retreat' })
  if (lyingInWait(state, live)) chips.push({ key: 'wait', text: 'Lying in wait', cls: 'wait', testid: 'chip-wait' })
  if (isGuestUnit(state, live)) chips.push({ key: 'guest', text: 'Guest', cls: 'guest', testid: 'chip-guest' })
  for (const c of buffChips(state, live)) chips.push({ key: `buff-${c}`, text: c, cls: 'buff', testid: 'chip-buff' })
  if (live.done && !live.confused) chips.push({ key: 'acted', text: 'Acted', cls: '' })
  else if (live.moved && !live.done) chips.push({ key: 'moved', text: 'Moved', cls: '' })
  if (withLoyalty && off && off.loyalty !== null) chips.push({ key: 'loyalty', text: `Loyalty ${off.loyalty}`, cls: '' })
  return chips
}

const CARD_CHIPS = 3

export function UnitCard() {
  const state = useGame((s) => s.state)
  const scene = useGame((s) => s.scene)
  const ui = useGame((s) => s.ui)
  const [open, setOpen] = useState(false)
  const live: Unit | undefined = state.units.find((u) => u.id === ui.selectedId)
  const vis = scene.units.find((u) => u.id === ui.selectedId)
  const off = live ? state.data.officers[live.officer] : undefined
  const chips = useMemo(() => (live ? unitChips(state, live, false) : []), [state, live])

  // the sheet follows the selection and closes with it
  const selected = live?.id ?? null
  useEffect(() => {
    if (selected === null) setOpen(false)
  }, [selected])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  if (!live || !vis || !off) return null
  const shown = chips.slice(0, CARD_CHIPS)
  const more = chips.length - shown.length
  return (
    <>
      <aside
        className={`ucard ${sideToken(live.side)}`}
        data-testid="officer-panel"
        aria-label={`Officer ${off.name}`}
        onClick={() => setOpen(true)}
      >
        <Portrait id={live.officer} type={live.type} name={off.name} side={live.side} size={58} />
        <div className="uc-main">
          <div className="uc-top">
            <h2>{shortName(off.name)}</h2>
            <TroopIcon type={live.type} size={15} />
            {live.commander && <span className="uc-cmd" aria-label="Commander">将</span>}
            <button
              type="button"
              className="uc-more"
              data-testid="unit-more"
              aria-expanded={open}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(!open)
              }}
            >
              More
            </button>
          </div>
          <div className="uc-troops">
            <b data-testid="troops">{num(vis.troops)}</b>
            <BrushBar value={vis.troops} max={live.maxTroops} side={live.side} />
            <span className="uc-qi" role="img" aria-label={`Qi ${live.qi} of 10`}>
              <i className="coin full" aria-hidden="true" />
              Qi {live.qi}/10
            </span>
          </div>
          {chips.length > 0 && (
            <div className="uc-chips">
              {shown.map((c) => (
                <span key={c.key} className={`chip ${c.cls}`} data-testid={c.testid}>
                  {c.text}
                </span>
              ))}
              {more > 0 && <span className="chip">+{more}</span>}
            </div>
          )}
        </div>
      </aside>
      {open && <UnitSheet unit={live} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The compact stratagem slips shown while a Stratagem order is open: name, cost, and the effect or why it cannot be cast. */
export function StratPicker() {
  const state = useGame((s) => s.state)
  const playing = useGame((s) => s.playing)
  const ui = useGame((s) => s.ui)
  const pickStrat = useGame((s) => s.pickStrat)
  const live = state.units.find((u) => u.id === ui.selectedId)
  const options = useMemo(() => (live ? query.stratagemOptions(state, live.id) : []), [state, live])
  if (!live || playing || ui.mode !== 'stratagem' || !canControl(state, live)) return null
  return (
    <ul className="strat-picker" aria-label="Stratagems" data-testid="strat-picker">
      {options.map((o) => {
        const def = state.data.stratagems[o.id]
        return (
          <li key={o.id}>
            <button
              type="button"
              className={`strat-slip${ui.strat === o.id ? ' picked' : ''}${o.usable && ui.strat === null ? ' invite' : ''}`}
              disabled={!o.usable}
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
  )
}

/** The full detail sheet: stats, level and XP, stratagems with costs and why-not reasons, terrain and cover, bonds, loyalty. An overlay drawer. */
function UnitSheet({ unit: live, onClose }: { unit: Unit; onClose: () => void }) {
  const state = useGame((s) => s.state)
  const scene = useGame((s) => s.scene)
  const campaign = useCampaign((c) => c.campaign)
  const off = state.data.officers[live.officer]
  const vis = scene.units.find((u) => u.id === live.id)
  const options = useMemo(() => query.stratagemOptions(state, live.id), [state, live])
  if (!off || !vis) return null
  const chips = unitChips(state, live, true)
  const rec = live.side === PLAYER_SIDE ? campaign?.roster.find((r) => r.officerId === live.officer) : undefined
  const terr = state.data.terrain[scene.terrain[live.y * state.grid.width + live.x] ?? 'plain']
  const bonds = (off.bonds ?? []).map((id) => ({ id, name: shortName(state.data.officers[id]?.name ?? id), here: state.units.some((u) => u.officer === id && u.side === live.side) }))
  return (
    <aside className={`usheet ${sideToken(live.side)}`} data-testid="unit-sheet" role="dialog" aria-label={`${off.name}, details`}>
      <header>
        <Portrait id={live.officer} type={live.type} name={off.name} side={live.side} size={84} />
        <div className="who">
          <h2>{shortName(off.name)}</h2>
          <p>
            <TroopIcon type={live.type} size={14} /> {TYPE_LABEL[live.type]} · {sideName(state, live.side)}
            {live.commander ? ' · Commander' : ''}
          </p>
          {rec && (
            <p className="lvl" data-testid="sheet-level">
              Level {rec.level} · XP {rec.xp} / {XP_PER_LEVEL}
            </p>
          )}
        </div>
        <button type="button" className="sheet-close" data-testid="unit-sheet-close" onClick={onClose} aria-label="Close details">
          Close
        </button>
      </header>
      <div className="sheet-body">
        <section className="troops">
          <b>{num(vis.troops)}</b>
          <span> / {num(live.maxTroops)} troops</span>
          <BrushBar value={vis.troops} max={live.maxTroops} side={live.side} />
          <div className="qi">
            <Coins qi={live.qi} />
            <span className="qi-n">Qi {live.qi} / 10</span>
          </div>
        </section>
        <dl className="stats">
          {(
            [
              ['War', off.war],
              ['Int', off.int],
              ['Lead', off.lead],
              ['Cha', off.cha],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {chips.length > 0 && (
          <div className="chips" data-testid="sheet-chips">
            {chips.map((c) => (
              <span key={c.key} className={`chip ${c.cls}`}>
                {c.text}
              </span>
            ))}
          </div>
        )}
        {terr && (
          <p className="sheet-terrain" data-testid="sheet-terrain">
            <b>{terr.name}</b> · faces {facingWord(live.facing)} · cover ×{terr.def.toFixed(2)}
            {terr.elev > 0 ? ' · high ground' : ''}
          </p>
        )}
        {bonds.length > 0 && (
          <p className="sheet-bonds" data-testid="sheet-bonds">
            <b>Bonds</b>{' '}
            {bonds.map((b, i) => (
              <span key={b.id}>
                {i > 0 ? ', ' : ''}
                {b.name}
                {b.here ? ' (here)' : ''}
              </span>
            ))}
          </p>
        )}
        <h3>Stratagems</h3>
        <ul className="sheet-strats" aria-label="Stratagems">
          {options.map((o) => {
            const def = state.data.stratagems[o.id]
            return (
              <li key={o.id} className={o.usable ? '' : 'off'}>
                <span className="strat-name">{o.name}</span>
                <span className="strat-cost">{o.cost}</span>
                <span className="strat-tag">{def?.tag}</span>
                <span className="strat-note">{o.usable ? def?.text : o.reason}</span>
              </li>
            )
          })}
          {options.length === 0 && <li className="strat-none">No stratagems</li>}
        </ul>
        {live.side !== PLAYER_SIDE && <p className="readonly">Enemy officer. Select one of your own units, then hover this one to read the strike numbers.</p>}
      </div>
    </aside>
  )
}
