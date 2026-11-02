// Roads to War screens: new run, slips, road, stop, market, deploy, finale briefing, battle report, run end.
// Every number comes from src/run (query helpers); this file only lays them out (wireframes docs/wireframes/roguelike/).
import { useEffect, useMemo, useState } from 'react'
import { GAME_DATA } from '../../data'
import {
  activeBand, canField, capOf, checkDeploy, choiceView, edgesFrom, ERA1, finaleBriefing, hud, legOptions, levyCost, levyPrice, marketMax, nameOf,
  roadView, stopDef, type Chip, type RunState,
} from '../../run'
import { Portrait } from '../hud/parts'
import { useRun, viewOf } from './store'
import './run.css'

const era = ERA1
const fmt = (n: number): string => n.toLocaleString('en-US')
const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

function Seal({ id, stamp, title, sub, onClick, disabled }: { id: string; stamp: string; title: string; sub?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="rl-seal" data-testid={id} onClick={onClick} disabled={disabled}>
      <span className="stamp" aria-hidden="true">
        {stamp}
      </span>
      <span>
        {title}
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
}

function Chips({ chips, testid }: { chips: Chip[]; testid?: string }) {
  if (!chips.length) return null
  return (
    <div className="rl-chips" data-testid={testid}>
      {chips.map((c, i) => (
        <span key={i} className={`rl-chip ${c.tone}`}>
          {c.text}
        </span>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ top bar

export function RunHud({ run, title, sub }: { run: RunState; title?: string; sub?: string }) {
  const h = hud(era, run)
  const lastsTone = h.lasts < 3 ? 'bad' : h.lasts < 6 ? 'warn' : ''
  return (
    <header className="rl-top" data-testid="run-hud">
      <div className="era">
        {title ?? 'Roads to War'}
        <small>{sub ?? 'Era 1 · Yellow Turbans'}</small>
      </div>
      <div className={`rl-stat ${lastsTone}`} data-testid="hud-rice">
        <span className="k">Rice</span>
        <span className="v">
          {fmt(h.rice)} bags <em>· lasts {h.lasts} day{h.lasts === 1 ? '' : 's'}</em>
        </span>
        <span className="sub" data-testid="hud-forecast">
          upkeep {h.upkeep} a day · Guangzong will need about {h.forecast} bags
        </span>
      </div>
      <div className="rl-stat" data-testid="hud-soldiers">
        <span className="k">Soldiers</span>
        <span className="v">
          {fmt(h.soldiers)} <em>+ {fmt(h.wounded)} wounded</em>
        </span>
        <span className="sub">
          {h.officers} officers{h.tired ? ' · tired' : ''}{h.outlaw ? ' · outlaws' : ''}
        </span>
      </div>
      <div className="rl-stat" data-testid="hud-renown">
        <span className="k">Renown</span>
        <span className="v">
          {h.renown} <em>· {h.spirit ? `${sign(h.spirit)} Qi` : 'no Qi bonus'}</em>
        </span>
        <div className="rl-meter" aria-hidden="true">
          <i style={{ width: `${h.renown}%` }} />
          {[20, 40, 50, 60, 70, 80].map((t) => (
            <b key={t} style={{ left: `${t}%` }} />
          ))}
        </div>
      </div>
      <div className="rl-stat" data-testid="hud-day">
        <span className="k">Day</span>
        <span className="v">
          {h.day} <em>· {h.bracketBy !== null ? `arrive by day ${h.bracketBy}: ${h.bracket}` : `Guangzong: ${h.bracket}`}</em>
        </span>
        <span className="sub">every day taken strengthens the finale</span>
      </div>
    </header>
  )
}

// ------------------------------------------------------------------ new run

export function RunNew() {
  const hasSave = useRun((s) => s.hasSave)
  const seed = useRun((s) => s.draftSeed)
  const iron = useRun((s) => s.draftIron)
  const annals = useRun((s) => s.annals)
  const setDraft = useRun((s) => s.setDraft)
  const start = useRun((s) => s.startNew)
  const cont = useRun((s) => s.continueRun)
  const toTitle = useRun((s) => s.toTitle)
  return (
    <div className="rl-center">
      <section className="rl-panel" data-testid="run-new">
        <div className="rl-silk">
          <h1 className="brush">Roads to War</h1>
          <p className="kicker">Era 1 · The Yellow Turbans · the road to Guangzong</p>
          <p>
            Lead Liu Bei&apos;s band down a road of hard choices to the rebel stronghold at Guangzong. Rice is the clock: every soldier eats every day, and when the sacks are empty the
            band scatters. Every stop shows its exact costs; some consequences stay hidden until they come back.
          </p>
          <div className="rl-seed" style={{ marginTop: 12 }}>
            <label htmlFor="rl-seed">Road seed</label>
            <input id="rl-seed" data-testid="run-seed" inputMode="numeric" value={seed} onChange={(e) => setDraft(Number(e.target.value.replace(/\D/g, '')) || 1, iron)} />
            <span className="rl-note" style={{ color: 'var(--ink-soft)' }}>
              the same seed draws the same road
            </span>
          </div>
          <button type="button" className="rl-toggle" role="switch" aria-checked={iron} data-testid="run-iron-oath" onClick={() => setDraft(seed, !iron)} style={{ marginTop: 8 }}>
            <span className="sw" aria-hidden="true" />
            <span>
              <b>Iron Oath</b>: {iron ? 'an officer routed in battle falls at once.' : 'off. A routed officer is wounded first and falls on a second rout.'}
            </span>
          </button>
        </div>
        <div className="rl-row">
          <button type="button" className="rl-btn" data-testid="run-back" onClick={toTitle}>
            Back
          </button>
          {hasSave && (
            <button type="button" className="rl-btn" data-testid="run-continue" onClick={() => cont()}>
              Continue the run
            </button>
          )}
        </div>
        <Seal id="run-begin" stamp="誓" title={hasSave ? 'Seal: begin a new run (the saved run is lost)' : 'Seal: swear the oath and march'} sub={`seed ${seed}${iron ? ' · Iron Oath' : ''}`} onClick={() => start()} />
        {annals.length > 0 && (
          <div className="rl-silk" data-testid="run-annals">
            <h2 className="brush">The Annals</h2>
            <table className="rl-table-list">
              <thead>
                <tr>
                  <th>Seed</th>
                  <th>End</th>
                  <th>Day</th>
                  <th>Renown</th>
                  <th>Battles</th>
                </tr>
              </thead>
              <tbody>
                {annals.slice(0, 6).map((a, i) => (
                  <tr key={i}>
                    <td>
                      {a.seed}
                      {a.ironOath ? ' (Iron Oath)' : ''}
                    </td>
                    <td>{endWord(a.end)}</td>
                    <td>{a.day}</td>
                    <td>{a.renown}</td>
                    <td>
                      {a.battlesWon}/{a.battles}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const endWord = (k: string): string => (k === 'won' ? 'Guangzong taken' : k === 'starved' ? 'scattered (no rice)' : k === 'routed' ? 'Liu Bei routed' : 'battle lost')

// ------------------------------------------------------------------ slips

export function RunSlips() {
  const sl = useRun((s) => s.slips)
  const advance = useRun((s) => s.advanceSlip)
  const skip = useRun((s) => s.skipSlips)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        advance()
      }
      if (e.key === 'Escape') skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, skip])
  if (!sl) return null
  const line = sl.lines[sl.index]
  if (!line) return null
  const narrator = line.speaker === 'narrator'
  const known = !!GAME_DATA.officers[line.speaker]
  const name = narrator ? 'Narrator' : (line.name ?? GAME_DATA.officers[line.speaker]?.name ?? line.speaker)
  return (
    <div className="scene rl-slips" data-testid="run-slips">
      <button type="button" className="scene-advance" onClick={advance} aria-label="Next line" data-testid="run-slip-next" />
      <button type="button" className="skip-scene" onClick={skip} data-testid="run-skip">
        Skip scene
      </button>
      <p className="scene-heading">{sl.title}</p>
      <div className={`speech${narrator ? ' narrator' : ''}`} key={`${sl.key}-${sl.index}`} data-testid="speech">
        {!narrator && <Portrait id={known ? line.speaker : undefined} name={name} side={known && ['liu-bei', 'guan-yu', 'zhang-fei', 'zou-jing', 'gong-jing', 'cao-cao'].includes(line.speaker) ? 'han' : 'yellow'} size={84} type="infantry" />}
        <div className="speech-body">
          <h3 data-testid="speaker">{name}</h3>
          <p data-testid="speech-text">{line.text}</p>
        </div>
        <span className="speech-count" aria-hidden="true">
          {sl.index + 1} / {sl.lines.length} · click to go on
        </span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ stop

export function StopScreen({ run }: { run: RunState }) {
  const chosen = useRun((s) => s.chosen)
  const pick = useRun((s) => s.pick)
  const seal = useRun((s) => s.seal)
  const stop = stopDef(era, run.stop!.id)
  const views = useMemo(() => stop.choices.map((c) => choiceView(era, run, stop, c.id)), [run, stop])
  const sel = views.find((v) => v.id === chosen && v.payable) ?? null
  const speaker = stop.slips.find((l) => l.speaker !== 'narrator')
  return (
    <main className="rl-main" data-testid="stop">
      <div className="rl-col rl-stop-left rl-scroll">
        <div className="rl-silk rl-scene">
          <h1 className="brush">{stop.title}</h1>
          <p className="kicker">
            {stop.tags.join(' · ')}
            {stop.tags.includes('town') || stop.tags.includes('village') ? ': volunteers come' : ''}
          </p>
          {stop.scene.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="src">Source: {stop.source}</p>
        </div>
        {speaker && (
          <div className="rl-silk rl-speaker rl-speaker-box">
            <Portrait id={GAME_DATA.officers[speaker.speaker] ? speaker.speaker : undefined} name={speaker.name ?? nameOf(era, speaker.speaker)} side="han" size={52} type="infantry" />
            <div>
              <h3>{speaker.name ?? GAME_DATA.officers[speaker.speaker]?.name ?? speaker.speaker}</h3>
              <p>{speaker.text}</p>
            </div>
          </div>
        )}
        <div className="rl-lacquer rl-note">
          After a choice at a town or village: volunteers = Renown × 10 join, and at Renown 50+ the elders bring Renown ÷ 5 bags. Each slip shows its own numbers; hidden consequences are never
          shown.
        </div>
      </div>
      <div className="rl-col rl-stop-right">
        <div className="rl-head">
          <h2 className="brush">Choose</h2>
          <span className="rl-note">exact costs on every slip</span>
        </div>
        <div className="rl-col rl-scroll" style={{ flex: 1 }}>
          {views.map((v) => (
            <button
              type="button"
              key={v.id}
              className={`rl-slip${chosen === v.id ? ' chosen' : ''}${v.payable ? '' : ' off'}`}
              data-testid={`choice-${v.id}`}
              data-kind={v.kind}
              data-lasts={v.lastsAfter}
              data-payable={v.payable ? 'yes' : 'no'}
              aria-pressed={chosen === v.id}
              aria-disabled={!v.payable}
              onClick={() => v.payable && pick(v.id)}
            >
              <span className="t">
                <span>{v.label}</span>
                <small>{v.kind === 'battle' ? 'battle' : v.kind === 'gamble' ? 'gamble' : ''}</small>
              </span>
              <span className="why">{v.tension}</span>
              <Chips chips={v.chips} />
              {v.battle && (
                <>
                  <div className="rl-chips">
                    <span className="rl-chip battle">
                      Battle: {v.battle.name} · up to {v.battle.slots} officers · enemy troops x{v.battle.enemyScale}
                    </span>
                    <span className="rl-chip minus">1 day · rice: 1 bag per 250 you field (set at deploy)</span>
                  </div>
                  <Chips chips={v.battle.win.map((c) => ({ ...c, text: `if you win: ${c.text}` }))} />
                </>
              )}
              {v.gamble && (
                <div>
                  <div className="rl-odds" aria-label={`${Math.round(v.gamble.odds * 100)} percent`}>
                    <span className="w" style={{ width: `${v.gamble.odds * 100}%` }}>
                      {Math.round(v.gamble.odds * 100)}%
                    </span>
                    <span className="l" style={{ width: `${(1 - v.gamble.odds) * 100}%` }}>
                      {Math.round((1 - v.gamble.odds) * 100)}%
                    </span>
                  </div>
                  <div className="rl-gamble-side">
                    <b>{Math.round(v.gamble.odds * 100)}%:</b> {v.gamble.win.length ? v.gamble.win.map((c) => c.text).join(', ') : 'no loss'}
                  </div>
                  <div className="rl-gamble-side">
                    <b>{Math.round((1 - v.gamble.odds) * 100)}%:</b> {v.gamble.lose.length ? v.gamble.lose.map((c) => c.text).join(', ') : 'no loss'}
                  </div>
                </div>
              )}
              {(v.volunteers > 0 || v.gift > 0) && (
                <Chips
                  chips={[
                    ...(v.volunteers > 0 ? [{ text: `${fmt(v.volunteers)} volunteers${v.battle ? ' (if you win)' : ''}`, tone: 'plus' as const }] : []),
                    ...(v.gift > 0 ? [{ text: `the elders bring ${v.gift} bags`, tone: 'plus' as const }] : []),
                  ]}
                />
              )}
              {v.echoes.map((t, i) => (
                <div key={i} className="rl-chips">
                  <span className="rl-chip echo">{t}</span>
                </div>
              ))}
              {v.conditionNote && <div className="rl-cond">{v.conditionNote}</div>}
              {!v.payable && v.reason && <div className="rl-reason">{v.reason}</div>}
              <div className="rl-after">
                After: rice <b>{v.riceAfter}</b>, lasts <b>{v.lastsAfter} days</b>
                {v.battle ? ' (before the battle’s own rice)' : v.gamble ? ' (before the odds fall)' : ''}
              </div>
            </button>
          ))}
        </div>
        <Seal
          id="stop-seal"
          stamp="準"
          title={sel ? `Seal: ${sel.label}` : 'Pick a slip, then seal it'}
          sub={sel ? `rice ${run.rice} -> ${sel.riceAfter}${sel.gamble ? ` · ${Math.round(sel.gamble.odds * 100)}% gamble` : ''}${sel.battle ? ' · to deploy' : ''}` : undefined}
          onClick={seal}
          disabled={!sel}
        />
      </div>
    </main>
  )
}

// ------------------------------------------------------------------ market

export function MarketScreen({ run }: { run: RunState }) {
  const hire = useRun((s) => s.hire)
  const max = marketMax(era, run)
  const [n, setN] = useState(0)
  const k = Math.min(n, max)
  const cost = levyCost(era, run.renown, k)
  const stop = run.stop ? stopDef(era, run.stop.id) : null
  return (
    <div className="rl-center">
      <section className="rl-panel" data-testid="market">
        <div className="rl-silk">
          <h1 className="brush">The market{stop ? ` at ${stop.title}` : ''}</h1>
          <p className="kicker">rice buys paid levies · {levyPrice(era, run.renown)} bags per 100 at Renown {run.renown} · up to {era.rules.marketMax} a stop</p>
          <p>Levies join the healthy pool now, and eat from tomorrow.</p>
          <div className="rl-home" style={{ marginTop: 10 }}>
            <input type="range" min={0} max={Math.max(0, max)} step={100} value={k} onChange={(e) => setN(Number(e.target.value))} data-testid="hire-slider" disabled={max === 0} aria-label="Levies to hire" />
            <b>{k} men</b>
          </div>
          <p className="rl-note" style={{ color: 'var(--ink-soft)', marginTop: 6 }}>
            Cost {cost} bags · rice {run.rice} -&gt; {run.rice - cost}
            {max === 0 ? ' · the market has nothing you can pay for' : ''}
          </p>
        </div>
        <Seal id="hire-seal" stamp="買" title={k > 0 ? `Seal: hire ${k} levies for ${cost} bags` : 'Seal: hire no one and take the road'} onClick={() => hire(k)} />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ road

const MAP_W = 1000
const MAP_H = 560
function nodeXY(tiers: number, tier: number, lane: number, lanes: number): [number, number] {
  const x = 60 + (tier * (MAP_W - 230)) / Math.max(1, tiers - 1)
  const y = lanes === 1 ? 300 : lane === 0 ? 170 : 410
  return [x, y]
}
const curve = (a: [number, number], b: [number, number]): string => {
  const mx = (a[0] + b[0]) / 2
  return `M${a[0]} ${a[1]} C ${mx} ${a[1]} ${mx} ${b[1]} ${b[0]} ${b[1]}`
}

function FlagMarks({ battle, town, market, camp }: { battle: boolean; town: boolean; market: boolean; camp: boolean }) {
  return (
    <g>
      {battle && <path d="M5 -54 l14 16 M19 -54 l-14 16" stroke="#c8372d" strokeWidth="2.4" />}
      {!battle && town && <path d="M6 -38 l6 -9 l6 9 z M8 -38 v-1 h8 v1" fill="#2f6b5e" />}
      {!battle && !town && camp && <path d="M5 -38 l7 -12 l7 12 z" fill="#4a4338" />}
      {!battle && !town && !camp && market && <path d="M6 -46 h12 M12 -50 v12 M7 -46 l-2 5 h5 z M17 -46 l-2 5 h5 z" stroke="#a07a3a" strokeWidth="1.6" fill="none" />}
    </g>
  )
}

export function RoadScreen({ run }: { run: RunState }) {
  const travel = useRun((s) => s.travel)
  const camp = useRun((s) => s.camp)
  const sendHome = useRun((s) => s.sendHome)
  const view = useMemo(() => roadView(era, run), [run])
  const opts = useMemo(() => legOptions(era, run), [run])
  const [sel, setSel] = useState<number | 'finale'>(opts[0]?.target ?? 0)
  const [march, setMarch] = useState(false)
  const [homeOpen, setHomeOpen] = useState(false)
  const [homeH, setHomeH] = useState(0)
  const [homeW, setHomeW] = useState(0)
  useEffect(() => {
    setSel(opts[0]?.target ?? 0)
    setMarch(false)
  }, [opts])
  const cur = opts.find((o) => o.target === sel) ?? opts[0]
  const h = hud(era, run)
  const lanesOf = (t: number): number => run.road.tiers[t]!.length
  const xy = (t: number, l: number): [number, number] => nodeXY(view.tiers, t, l, lanesOf(t))
  const here = view.here
  const legTaken = new Set(run.legs.map((l) => (l.to === 'finale' ? '' : `${l.from[0]}:${l.from[1]}>${l.to[0]}:${l.to[1]}`)))
  const gz: [number, number] = [MAP_W - 70, 300]
  const doMarch = march && !!cur?.canMarch
  const days = cur ? (doMarch ? cur.marchDays : cur.days) : 0
  const riceAfter = run.rice - days * h.upkeep
  const destName = cur ? (cur.stopId ? stopDef(era, cur.stopId).title : 'Guangzong') : ''
  const visibleTier = here[0] + 2
  const campDays = era.rules.makeCampDays
  const campBack = Math.floor(run.wounded / 2 / 10) * 10
  return (
    <main className="rl-main road" data-testid="road">
      <div className="rl-table rl-sand">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="The road to Guangzong on the scroll map" data-testid="road-map">
          <rect x="6" y="14" width={MAP_W - 150} height="532" fill="#efe6d2" stroke="#bfae86" />
          <path d={`M10 290 C 160 260 260 330 400 300 S 640 250 ${MAP_W - 150} 300`} fill="none" stroke="#6f8c98" strokeWidth="9" opacity="0.5" strokeLinecap="round" />
          <text x="430" y="282" fontFamily="var(--font-display)" fontSize="20" fill="#4a4338" opacity="0.5">
            Yellow River
          </text>
          <g fill="none" stroke="#4a4338" strokeWidth="1.6" opacity="0.45">
            <path d="M80 90 l22 -34 l16 22 l12 -16 l24 28" />
            <path d="M540 86 l20 -32 l18 24 l14 -18 l26 30" />
            <path d="M220 500 l18 -30 l14 18 l16 -24 l22 36" />
          </g>
          {/* edges */}
          {run.road.edges.map((e, i) => {
            const a = xy(e.from[0], e.from[1])
            const b = xy(e.to[0], e.to[1])
            const taken = legTaken.has(`${e.from[0]}:${e.from[1]}>${e.to[0]}:${e.to[1]}`)
            const fromHere = e.from[0] === here[0] && e.from[1] === here[1] && run.phase === 'road'
            const shown = e.to[0] <= visibleTier
            if (!shown && !taken) return null
            const d = e.kind === 'mountain' ? `M${a[0]} ${a[1]} Q ${(a[0] + b[0]) / 2} ${Math.min(a[1], b[1]) - 110} ${b[0]} ${b[1]}` : curve(a, b)
            const isSel = fromHere && edgesFrom(run.road, here).indexOf(e) === sel
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="#1b1a17" strokeLinecap="round" strokeWidth={taken ? 7 : isSel ? 4 : fromHere ? 3 : 2} opacity={taken ? 0.88 : fromHere ? 0.85 : 0.3} strokeDasharray={taken || fromHere ? undefined : e.kind === 'mountain' ? '3 6' : '1 7'} />
                {(fromHere || (e.from[0] >= here[0] && shown)) && (
                  <g transform={`translate(${e.kind === 'mountain' ? (a[0] + b[0]) / 2 : (a[0] + b[0]) / 2} ${e.kind === 'mountain' ? Math.min(a[1], b[1]) - 55 : (a[1] + b[1]) / 2})`} opacity={fromHere ? 1 : 0.55}>
                    <circle r="14" fill="#efe6d2" stroke="#1b1a17" strokeWidth="1.5" />
                    <text y="5" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#1b1a17">
                      {e.days}d
                    </text>
                  </g>
                )}
              </g>
            )
          })}
          {/* the last tier to Guangzong */}
          {run.road.tiers[view.tiers - 1]!.map((_, l) => {
            const a = xy(view.tiers - 1, l)
            const shown = view.tiers - 1 <= visibleTier
            return shown ? <path key={`gz${l}`} d={curve(a, gz)} fill="none" stroke="#1b1a17" strokeWidth={run.legs.some((x) => x.to === 'finale') ? 7 : 2} opacity="0.4" /> : null
          })}
          {/* rolled scroll beyond sight */}
          {visibleTier < view.tiers - 1 && (
            <g>
              <rect x={xy(visibleTier + 1, 0)[0] - 40} y="14" width={MAP_W - 150 - (xy(visibleTier + 1, 0)[0] - 40) + 6} height="532" fill="#cdbf9c" opacity="0.92" />
              <text x={xy(visibleTier + 1, 0)[0] - 20} y="300" fontSize="13" fill="#4a4338">
                the scroll is still rolled
              </text>
            </g>
          )}
          {/* flags */}
          {view.nodes.map((n) => {
            if (n.state === 'hidden') return null
            const [x, y] = xy(n.tier, n.lane)
            const isHere = n.state === 'here'
            const reachIdx = opts.findIndex((o) => o.stopId === n.stopId)
            const reach = run.phase === 'road' && reachIdx >= 0
            const op = n.state === 'passed' ? 0.3 : n.state === 'visited' ? 0.55 : 1
            return (
              <g
                key={`${n.tier}:${n.lane}`}
                transform={`translate(${x} ${y})`}
                opacity={op}
                className={`rl-flag${reach ? ' reach' : ''}`}
                data-testid={`flag-${n.tier}-${n.lane}`}
                onClick={() => reach && setSel(opts[reachIdx]!.target)}
              >
                {isHere && <ellipse rx="30" ry="9" cy="2" fill="#f2b45a" opacity="0.4" />}
                <line y1="0" y2={isHere ? -70 : -58} stroke="#1b1a17" strokeWidth="2.2" />
                {isHere ? (
                  <>
                    <path d="M1 -70 h30 v40 l-15 -8 l-15 8 z" fill="#2f6b5e" stroke="#1b1a17" />
                    <text x="16" y="-44" fontFamily="var(--font-display)" fontSize="20" fill="#efe6d2" textAnchor="middle">
                      劉
                    </text>
                  </>
                ) : (
                  <>
                    <path d="M1 -58 h24 v34 l-12 -7 l-12 7 z" fill="#efe6d2" stroke={n.marks.battle ? '#c8372d' : '#4a4338'} strokeWidth={n.marks.battle ? 2 : 1} />
                    <FlagMarks {...n.marks} />
                  </>
                )}
                <text y="20" textAnchor="middle" fontSize="12.5" fontWeight={isHere || reach ? 700 : 400} fill="#1b1a17">
                  {n.title}
                </text>
                <text y="34" textAnchor="middle" fontSize="11" fill="#4a4338">
                  {isHere ? `you are here · day ${run.day}` : [n.marks.battle && 'battle', n.marks.town && 'town', n.marks.market && 'market', n.marks.camp && 'camp'].filter(Boolean).join(' · ')}
                </text>
              </g>
            )
          })}
          <g transform={`translate(${gz[0]} ${gz[1]})`}>
            <rect x="-48" y="-60" width="96" height="104" fill="#3a1410" stroke="#a07a3a" />
            <text y="-26" textAnchor="middle" fontFamily="var(--font-display)" fontSize="24" fill="#f2b45a">
              廣宗
            </text>
            <text y="-4" textAnchor="middle" fontSize="13" fontWeight="700" fill="#efe6d2">
              Guangzong
            </text>
            <text y="14" textAnchor="middle" fontSize="11" fill="#cdbf9c">
              the finale
            </text>
            <text y="32" textAnchor="middle" fontSize="11" fill="#cdbf9c">
              {view.tiers - 1 - here[0]} tiers and 2 days on
            </text>
          </g>
        </svg>
        <div className="rl-legend" aria-hidden="true">
          <span>
            <b style={{ color: '#c8372d' }}>✕</b> a choice is a battle
          </span>
          <span>town or village: volunteers</span>
          <span>the next two stops are unrolled</span>
        </div>
      </div>
      <aside className="rl-side">
        <div className="rl-head">
          <h2 className="brush">The road on</h2>
        </div>
        <div className="rl-col rl-scroll" style={{ flex: 1 }}>
          {opts.map((o) => {
            const nm = o.stopId ? stopDef(era, o.stopId).title : 'Guangzong'
            const isSel = o.target === sel
            const d = isSel && doMarch ? o.marchDays : o.days
            return (
              <button type="button" key={String(o.target)} className={`rl-slip${isSel ? ' chosen' : ''}`} data-testid={`leg-${o.target}`} onClick={() => setSel(o.target)}>
                <span className="t">
                  <span>
                    {o.kind === 'mountain' ? 'The mountain path to ' : 'March to '}
                    {nm}
                  </span>
                  <small>{d}d</small>
                </span>
                <Chips
                  chips={[
                    { text: `${d} day${d === 1 ? '' : 's'}`, tone: 'neutral' },
                    { text: `rice -${d * h.upkeep} (${h.upkeep} a day)`, tone: 'minus' },
                    ...(o.kind === 'mountain' ? [{ text: `skips a stop · -${o.mountainLoss} men to stragglers (5%)`, tone: 'minus' as const }] : []),
                    ...(isSel && doMarch ? [{ text: `forced march: -${o.marchLoss} men, arrive tired`, tone: 'minus' as const }] : []),
                  ]}
                />
                <div className="rl-after">
                  On arrival: rice <b>{run.rice - d * h.upkeep}</b>, lasts <b>{Math.max(0, Math.floor((run.rice - d * h.upkeep) / Math.max(1, h.upkeep)))} days</b> · day {run.day + d}
                </div>
              </button>
            )
          })}
          {cur?.canMarch && (
            <button type="button" className={`rl-btn${march ? ' on' : ''}`} data-testid="leg-march" aria-pressed={march} onClick={() => setMarch(!march)}>
              Forced march: {cur.marchDays} day{cur.marchDays === 1 ? '' : 's'} instead of {cur.days}, -{cur.marchLoss} men (3% a day saved), arrive tired
            </button>
          )}
          <button type="button" className="rl-btn" data-testid="make-camp" onClick={camp} disabled={run.rice - campDays * h.upkeep < 1}>
            Make camp first: {campDays} days · {campBack} wounded return · rice -{campDays * h.upkeep}
          </button>
          <button type="button" className="rl-btn" data-testid="send-home" onClick={() => setHomeOpen(!homeOpen)}>
            Send men home · upkeep {h.upkeep} a day
          </button>
          {homeOpen && (
            <div className="rl-lacquer rl-home" data-testid="send-home-panel">
              <span>Healthy</span>
              <b>{homeH}</b>
              <input type="range" min={0} max={run.soldiers} step={50} value={homeH} onChange={(e) => setHomeH(Number(e.target.value))} aria-label="Healthy soldiers to send home" />
              <span />
              <span>Wounded</span>
              <b>{homeW}</b>
              <input type="range" min={0} max={run.wounded} step={10} value={homeW} onChange={(e) => setHomeW(Number(e.target.value))} aria-label="Wounded soldiers to send home" />
              <span />
              <span className="rl-note">They leave for good. Upkeep after: {Math.ceil((run.soldiers + run.wounded - homeH - homeW) / era.rules.upkeepPer)} a day.</span>
              <button
                type="button"
                className="rl-btn"
                data-testid="send-home-seal"
                disabled={homeH + homeW === 0}
                onClick={() => {
                  sendHome(homeH, homeW)
                  setHomeH(0)
                  setHomeW(0)
                  setHomeOpen(false)
                }}
              >
                Send them
              </button>
            </div>
          )}
        </div>
        {cur && (
          <Seal
            id="road-seal"
            stamp="行"
            title={`Seal: ${cur.kind === 'mountain' ? 'take the mountain path to' : 'march to'} ${destName}, ${days} day${days === 1 ? '' : 's'}`}
            sub={`rice ${run.rice} -> ${riceAfter}${riceAfter < 1 ? ': the army would scatter on the road' : ''}`}
            onClick={() => travel(cur.target, doMarch)}
          />
        )}
      </aside>
    </main>
  )
}

// ------------------------------------------------------------------ deploy

export function DeployScreen({ run }: { run: RunState }) {
  const picks = useRun((s) => s.picks)
  const setSoldiers = useRun((s) => s.setSoldiers)
  const toggle = useRun((s) => s.toggleOfficer)
  const seal = useRun((s) => s.sealDeploy)
  const giveUp = useRun((s) => s.giveUp)
  const chk = useMemo(() => checkDeploy(era, run, picks), [run, picks])
  const band = activeBand(run)
  const inField = new Set(picks.map((p) => p.id))
  const R = era.rules
  const bName = run.pending ? (run.pending.finale ? 'Guangzong' : stopDef(era, run.pending.stopId).title) : ''
  const canAny = run.soldiers >= R.minPerOfficer && run.rice >= 2
  const startQi = chk.startQi ? Math.max(0, ...Object.values(chk.startQi)) : 0
  return (
    <main className="rl-main deploy" data-testid="deploy">
      <div className="rl-col" style={{ flex: 1 }}>
        <div className="rl-head">
          <h2 className="brush">
            Officers · {picks.length} of {chk.slots} slots
          </h2>
          <span className="rl-note">slider from 250 to the command cap, steps of 50; healthy soldiers only</span>
        </div>
        <div className="rl-col rl-scroll" style={{ flex: 1 }}>
          {picks.map((p) => {
            const o = band.find((b) => b.rec.officerId === p.id)
            const cap = capOf(era, run, p.id)
            const others = picks.filter((q) => q.id !== p.id).reduce((a, q) => a + q.soldiers, 0)
            const max = Math.max(R.minPerOfficer, Math.min(cap, Math.floor((run.soldiers - others) / R.sliderStep) * R.sliderStep))
            const type = GAME_DATA.officers[p.id]?.type ?? 'infantry'
            return (
              <div key={p.id} className="rl-slip rl-off" data-testid={`deploy-officer-${p.id}`}>
                <div className="top">
                  <Portrait id={p.id} name={nameOf(era, p.id)} side="han" size={48} type={type} />
                  <div className="nm">
                    <span className="t">{nameOf(era, p.id)}</span>
                    <small>
                      {p.id === 'liu-bei' ? 'commander · always deployed · ' : `${type} · `}level {o?.rec.level ?? 1} · cap {fmt(cap)}
                      {o?.hurt ? ' (hurt: half cap until a rest)' : ''}
                      {o?.rec.wounded ? ' · wounded mark: one more rout and he falls' : ''}
                    </small>
                  </div>
                  <div className="num" data-testid={`deploy-n-${p.id}`}>
                    {fmt(p.soldiers)}
                    <small>of {fmt(cap)}</small>
                  </div>
                </div>
                <input
                  type="range"
                  min={R.minPerOfficer}
                  max={max}
                  step={R.sliderStep}
                  value={Math.min(p.soldiers, max)}
                  onChange={(e) => setSoldiers(p.id, Number(e.target.value))}
                  data-testid={`slider-${p.id}`}
                  aria-label={`Soldiers for ${nameOf(era, p.id)}`}
                />
                {p.id !== 'liu-bei' && (
                  <div className="act">
                    <button type="button" className="rl-btn" onClick={() => toggle(p.id)} data-testid={`bench-${p.id}`}>
                      Leave in camp
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {band.filter((b) => !inField.has(b.rec.officerId)).length > 0 && (
            <>
              <div className="rl-head">
                <h2 className="brush" style={{ fontSize: 19 }}>
                  Staying in camp
                </h2>
                <span className="rl-note">tap to bring into a slot</span>
              </div>
              {band
                .filter((b) => !inField.has(b.rec.officerId))
                .map((b) => {
                  const id = b.rec.officerId
                  const ok = canField(id, run.pending?.battleId)
                  return (
                    <button type="button" key={id} className={`rl-slip rl-off${ok ? '' : ' off'}`} data-testid={`field-${id}`} onClick={() => ok && toggle(id)} disabled={!ok || picks.length >= chk.slots}>
                      <span className="nm">
                        <span className="t">{nameOf(era, id)}</span>
                        <small>
                          level {b.rec.level} · cap {fmt(capOf(era, run, id))}
                          {b.rec.wounded ? ' · wounded mark' : ''}
                          {!ok ? (GAME_DATA.officers[id] ? ' · already on this field with the allied column' : ' · cannot take the field yet (no battle data)') : ''}
                        </small>
                      </span>
                    </button>
                  )
                })}
            </>
          )}
        </div>
      </div>
      <aside className="rl-side">
        <div className="rl-silk rl-qm" data-testid="quartermaster">
          <h2 className="brush" style={{ color: 'var(--ink)' }}>
            The quartermaster&apos;s slip
          </h2>
          <div className="ln">
            <span>Fielded</span>
            <b data-testid="qm-fielded">{fmt(chk.fielded)}</b>
          </div>
          <div className="ln">
            <span>Battle rice (⌈{fmt(chk.fielded)} ÷ 250⌉)</span>
            <b data-testid="qm-rice">-{chk.rice} bags</b>
          </div>
          <div className="ln big">
            <span>Rice left after the battle&apos;s cost</span>
            <b data-testid="qm-left" className={chk.riceAfter < 1 ? 'bad' : ''}>
              {chk.riceAfter}
            </b>
          </div>
          <div className="ln big">
            <span>After this battle rice lasts</span>
            <b data-testid="qm-lasts" className={chk.hungry ? 'bad' : 'ok'}>
              {chk.lastsDays} day{chk.lastsDays === 1 ? '' : 's'}
            </b>
          </div>
          <div className="ln">
            <span>Hungry under 3 days (all officers 0 Qi)</span>
            <b>{chk.hungry ? <span className="rl-chip hungry" data-testid="hungry-chip">Hungry</span> : <span className="ok">fed</span>}</b>
          </div>
          <div className="ln">
            <span>Then the battle day&apos;s upkeep</span>
            <b>-{chk.dayUpkeep}</b>
          </div>
          <div className="ln">
            <span>Left in camp</span>
            <b>
              {fmt(Math.max(0, run.soldiers - chk.fielded))} + {fmt(run.wounded)} wounded
            </b>
          </div>
        </div>
        <div className="rl-lacquer rl-qi" data-testid="qi-line">
          {chk.qi.length === 0 && (
            <div className="ln">
              <span>No start-Qi modifiers</span>
              <b>0</b>
            </div>
          )}
          {chk.qi.map((l, i) => (
            <div key={i} className={`ln${l.ignored ? ' ign' : ''}`}>
              <span>
                {l.officer ? `${nameOf(era, l.officer)}: ` : ''}
                {l.cause}
              </span>
              <b>{l.officer ? `${sign(l.qi)} Qi` : l.qi ? `${sign(l.qi)} Qi each` : '0 Qi'}</b>
            </div>
          ))}
          <div className="ln">
            <span>Starting Qi this battle</span>
            <b data-testid="qi-start">{chk.hungry ? '0 each' : `2 ${startQi >= 0 ? '+' : '-'} ${Math.abs(startQi)} (opening +2 and the lines above)`}</b>
          </div>
          {chk.notes.map((n, i) => (
            <div key={`n${i}`} className="ln">
              <span>
                {n.text}
                {!n.engine && <span className="pend"> (shown; applied when the engine supports it)</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="rl-note">
          Losses after the battle: half of every soldier lost is killed, half come back wounded and return when you rest. A routed officer gets the wounded mark; a second rout and he
          falls{run.ironOath ? ' (Iron Oath: the first rout is a fall)' : ''}.
        </p>
        {!chk.ok && chk.reason && (
          <p className="rl-reason" data-testid="deploy-reason" style={{ color: '#f08a7e' }}>
            {chk.reason}
          </p>
        )}
        {!canAny && (
          <button type="button" className="rl-btn" data-testid="deploy-scatter" onClick={giveUp}>
            No company can be paid for: the band scatters
          </button>
        )}
        <Seal
          id="deploy-seal"
          stamp="戰"
          title={chk.ok ? `Seal: march ${fmt(chk.fielded)} to ${bName} · ${chk.rice} bags` : `The seal refuses: ${chk.reason ?? ''}`}
          sub={chk.ok ? `rice ${run.rice} -> ${chk.riceAfter} · lasts ${chk.lastsDays} days after the battle${chk.hungry ? ' · HUNGRY' : ''}` : undefined}
          onClick={seal}
          disabled={!chk.ok}
        />
      </aside>
    </main>
  )
}

// ------------------------------------------------------------------ finale briefing

export function FinaleScreen({ run }: { run: RunState }) {
  const toDeploy = useRun((s) => s.toDeploy)
  const b = useMemo(() => finaleBriefing(era, run), [run])
  return (
    <div className="rl-center">
      <section className="rl-panel" data-testid="finale">
        <div className="rl-silk">
          <h1 className="brush">Guangzong</h1>
          <p className="kicker">the finale · day {run.day} · bracket: {b.row.label}</p>
          <p>Zhang Liang holds the stockade on the river. Everything you did on the road is written here, with its cause.</p>
          <ul className="rl-lines" data-testid="finale-lines">
            {b.lines.map((l, i) => (
              <li key={i} className={l.kind === 'echo' ? 'echo' : ''}>
                {l.text}
                {!l.engine && <span className="pend">(shown; applied in a later build)</span>}
              </li>
            ))}
          </ul>
        </div>
        <Seal id="to-finale-deploy" stamp="戰" title="To the deploy" sub={`rice ${run.rice} · ${fmt(run.soldiers)} healthy soldiers`} onClick={toDeploy} />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ battle report and end

export function ReportScreen({ run }: { run: RunState }) {
  const report = useRun((s) => s.report)
  const next = useRun((s) => s.afterReport)
  if (!report) return null
  const name = report.finale ? 'Guangzong' : report.battleId
  return (
    <div className="rl-center">
      <section className="rl-panel" data-testid="report">
        <div className="rl-silk">
          <h1 className="brush">{report.won ? 'Victory' : 'Defeat'}</h1>
          <p className="kicker">
            {name} · {fmt(report.fielded)} fielded for {report.rice} bags
          </p>
          <p data-testid="report-losses">
            Lost {fmt(report.lost)} men: {fmt(report.killed)} killed, {fmt(report.wounded)} wounded (they return when you rest).
          </p>
          <table className="rl-table-list" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Officer</th>
                <th>Fielded</th>
                <th>Lost</th>
                <th>XP</th>
                <th>Level</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {report.officers.map((o) => (
                <tr key={o.id}>
                  <td>{nameOf(era, o.id)}</td>
                  <td>{fmt(o.fielded)}</td>
                  <td>{fmt(o.lost)}</td>
                  <td>+{o.xp}</td>
                  <td>{o.levelTo > o.levelFrom ? `${o.levelFrom} -> ${o.levelTo} (cap +${(o.levelTo - o.levelFrom) * 100})` : o.levelTo}</td>
                  <td>{o.mark === 'fallen' ? 'falls' : o.mark === 'wounded' ? 'wounded' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.spoils.length > 0 && <p style={{ marginTop: 8 }}>Spoils: {report.spoils.join(', ')}.</p>}
          {report.recruits.length > 0 && <p style={{ marginTop: 4 }}>Joins the band: {report.recruits.map((id) => nameOf(era, id)).join(', ')}.</p>}
          <p className="rl-note" style={{ color: 'var(--ink-soft)', marginTop: 8 }}>
            Rice {run.rice}, lasts {hud(era, run).lasts} days · {fmt(run.soldiers)} healthy + {fmt(run.wounded)} wounded · day {run.day}
          </p>
        </div>
        <Seal id="report-continue" stamp="續" title={run.end ? 'Seal: to the annals' : 'Seal: go on'} onClick={next} />
      </section>
    </div>
  )
}

export function EndScreen({ run }: { run: RunState }) {
  const toTitle = useRun((s) => s.toTitle)
  const openNew = useRun((s) => s.openNew)
  const end = run.end!
  const won = end.kind === 'won'
  return (
    <div className="rl-center">
      <section className="rl-panel" data-testid="run-end" data-end={end.kind}>
        <div className="rl-silk">
          <h1 className="brush">{won ? 'Guangzong has fallen' : end.kind === 'starved' ? 'The band scatters' : 'The band is broken'}</h1>
          <p className="kicker">
            {endWord(end.kind)} · day {end.day} · seed {run.seed}
            {run.ironOath ? ' · Iron Oath' : ''}
          </p>
          <p>{end.text}</p>
          <table className="rl-table-list" style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>Battles</td>
                <td>
                  {run.stats.battlesWon} won of {run.stats.battles}
                </td>
              </tr>
              <tr>
                <td>Renown</td>
                <td>{run.renown}</td>
              </tr>
              <tr>
                <td>Soldiers killed on the road</td>
                <td>{fmt(run.stats.killed)}</td>
              </tr>
              <tr>
                <td>Volunteers</td>
                <td>{fmt(run.stats.volunteers)}</td>
              </tr>
              <tr>
                <td>Gambles</td>
                <td>
                  {run.stats.gamblesWon} of {run.stats.gambles} went your way
                </td>
              </tr>
              <tr>
                <td>Officers</td>
                <td>
                  {activeBand(run)
                    .map((o) => `${nameOf(era, o.rec.officerId)} (lv ${o.rec.level})`)
                    .join(', ')}
                  {run.stats.fell.length ? `; fallen: ${run.stats.fell.map((id) => nameOf(era, id)).join(', ')}` : ''}
                </td>
              </tr>
            </tbody>
          </table>
          <h2 className="brush" style={{ marginTop: 12 }}>
            The annals of this road
          </h2>
          <ul className="rl-lines rl-annals" data-testid="run-annal-lines">
            {run.annals.map((a, i) => (
              <li key={i} className={a.tone ?? ''}>
                Day {a.day}: {a.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="rl-row">
          <button type="button" className="rl-btn" data-testid="run-end-title" onClick={toTitle}>
            To the title
          </button>
          <button type="button" className="rl-btn" data-testid="run-end-new" onClick={openNew}>
            A new road
          </button>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ root

export function RunRoot() {
  const run = useRun((s) => s.run)
  const slips = useRun((s) => s.slips)
  const report = useRun((s) => s.report)
  const view = viewOf(run, slips, report)
  if (view === 'slips') return <RunSlips />
  return (
    <div className="rl" data-testid="run" data-view={view}>
      {run && view !== 'new' && view !== 'end' && (
        <RunHud
          run={run}
          title={view === 'deploy' ? 'Deploy' : undefined}
          sub={view === 'deploy' && run.pending ? `${run.pending.finale ? 'Guangzong' : stopDef(era, run.pending.stopId).title} · day ${run.day}` : undefined}
        />
      )}
      {view === 'new' && <RunNew />}
      {run && view === 'stop' && run.stop && <StopScreen run={run} />}
      {run && view === 'market' && <MarketScreen run={run} />}
      {run && view === 'road' && <RoadScreen run={run} />}
      {run && view === 'deploy' && <DeployScreen run={run} />}
      {run && view === 'finale' && <FinaleScreen run={run} />}
      {run && view === 'report' && <ReportScreen run={run} />}
      {run && view === 'end' && <EndScreen run={run} />}
    </div>
  )
}
