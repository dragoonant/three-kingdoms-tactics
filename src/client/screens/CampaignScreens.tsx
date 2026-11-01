// The campaign screens: new campaign, story scenes, briefing, camp, deploy, results, defeat and the closing summary.
// Pure UI over src/campaign and the campaign store. Every number comes from src/campaign or query.*; nothing is computed here
// except sums for display.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DRILL_COST,
  DRILL_XP,
  MAX_CARRIED_STRATAGEMS,
  MUSTER_COST,
  MUSTER_LIMIT,
  MUSTER_TROOPS,
  XP_PER_LEVEL,
  currentBattle,
  deployList,
  type CampaignState,
  type OfficerRecord,
  type XpLine,
} from '../../campaign'
import { ARC, GAME_DATA, getBattleDef } from '../../data'
import { query } from '../../engine'
import { briefingKicker, normaliseLoadout, statLine, timelineLabel, trackerLines, windScheduleText } from '../campaign/helpers'
import { Portrait } from '../hud/parts'
import { num } from '../ledger'
import { shortName } from '../names'
import { useCampaign } from '../store/campaign'
import { useGame } from '../store/game'

const TYPE_LABEL = { infantry: 'Infantry', cavalry: 'Cavalry', archers: 'Archers' } as const

const nameOf = (id: string): string => shortName(GAME_DATA.officers[id]?.name ?? id)
const stratName = (id: string): string => GAME_DATA.stratagems[id]?.name ?? id

function SealButton({ children, onClick, id, disabled }: { children: ReactNode; onClick: () => void; id: string; disabled?: boolean }) {
  return (
    <button type="button" className="seal big" data-testid={id} onClick={onClick} disabled={disabled}>
      <span className="seal-mark" aria-hidden="true">
        令
      </span>
      <span className="seal-text">{children}</span>
    </button>
  )
}

/** Side token of an officer on the player's side or an enemy of a battle, for the portrait colour. */
function sideOfOfficer(id: string, battleId: string | null): string {
  const def = battleId ? getBattleDef(battleId) : undefined
  const enemy = def?.units.find((u) => u.officer === id && u.side !== 'han')
  if (enemy) return enemy.side
  const rein = def?.reinforcements?.flatMap((r) => r.units).find((u) => u.officer === id && u.side !== 'han')
  return rein?.side ?? 'han'
}

// ------------------------------------------------------------------ new campaign

export function NewCampaign() {
  const startNew = useCampaign((c) => c.startNew)
  const hasSave = useCampaign((c) => c.hasSave)
  const go = useGame((g) => g.go)
  const iron = useGameLocalIron()
  return (
    <div className="modal" data-testid="newcampaign">
      <section className="panel newcamp">
        <p className="kicker">A campaign in nine battles</p>
        <h2>Liu Bei&apos;s Rise</h2>
        <p>
          Three sworn brothers raise a small company against the Yellow Turban rising, and carry it through nine battles, from Daxing Hill in 184 to Red Cliffs in 208. Between battles you make camp: spend provisions,
          drill your officers, and choose who rides out.
        </p>
        <div className={`oath${iron.on ? ' on' : ''}`}>
          <button type="button" role="switch" aria-checked={iron.on} className="oath-switch" data-testid="iron-oath" onClick={iron.toggle}>
            <span className="oath-knob" aria-hidden="true" />
            <span className="oath-label">Iron Oath</span>
            <span className="oath-state">{iron.on ? 'On' : 'Off'}</span>
          </button>
          <p className="oath-text">
            {iron.on
              ? 'An officer routed in a battle you win is lost for good, and the roster shows a black ribbon in camp. If Liu Bei himself is routed the campaign ends. A lost battle never kills anyone, and you may always retry it from the camp before it.'
              : 'An officer routed in a battle you win is only wounded: they start the next battle at half their troops, then recover. No one is ever lost. A lost battle is retried from the camp before it.'}
          </p>
          <p className="oath-more muted">Iron Oath for a harder road and a story with weight. Off for a gentler one. It is chosen once, now.</p>
        </div>
        {hasSave && <p className="warn">Beginning anew replaces your saved campaign.</p>}
        <div className="row">
          <button type="button" className="plain" onClick={() => go('title')} data-testid="newcamp-back">
            Back
          </button>
          <SealButton id="begin-campaign" onClick={() => startNew(iron.on, seedFromUrl())}>
            Begin the campaign
          </SealButton>
        </div>
      </section>
    </div>
  )
}

/** `?seed=` makes the campaign seed reproducible (tests, bug reports); otherwise it is random. */
function seedFromUrl(): number | undefined {
  const v = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('seed')
  return v !== null && Number.isFinite(Number(v)) ? Number(v) >>> 0 : undefined
}

function useGameLocalIron(): { on: boolean; toggle: () => void } {
  const [on, setOn] = useState(false)
  return { on, toggle: () => setOn((v) => !v) }
}

// ------------------------------------------------------------------ scenes

export function Scene() {
  const sc = useCampaign((c) => c.scene)
  const advance = useCampaign((c) => c.advanceScene)
  const skip = useCampaign((c) => c.skipScene)
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
  if (!sc) return null
  const line = sc.lines[sc.index]
  if (!line) return null
  const narrator = line.speaker === 'narrator'
  const name = narrator ? 'Narrator' : nameOf(line.speaker)
  const heading = sc.kind === 'prologue' ? 'Prologue' : sc.kind === 'epilogue' ? 'Epilogue' : null
  return (
    <div className="scene" data-testid="scene">
      <button type="button" className="scene-advance" onClick={advance} aria-label="Next line" data-testid="scene-advance" />
      <button type="button" className="skip-scene" onClick={skip} data-testid="skip-scene">
        Skip scene
      </button>
      {heading && <p className="scene-heading">{heading}</p>}
      <div className={`speech${narrator ? ' narrator' : ''}`} key={`${sc.kind}-${sc.index}`} data-testid="speech">
        {!narrator && <Portrait id={line.speaker} name={GAME_DATA.officers[line.speaker]?.name ?? line.speaker} side={sideOfOfficer(line.speaker, sc.battleId)} size={84} />}
        <div className="speech-body">
          <h3 data-testid="speaker">{name}</h3>
          <p data-testid="speech-text">{line.text}</p>
        </div>
        <span className="speech-count" aria-hidden="true">
          {sc.index + 1} / {sc.lines.length} · click to go on
        </span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ briefing

export function CampaignBriefing() {
  const c = useCampaign((s) => s.campaign)
  const next = useCampaign((s) => s.afterBriefing)
  const openCamp = useCampaign((s) => s.openCamp)
  const toTitle = useCampaign((s) => s.toTitle)
  const state = useGame((g) => g.state)
  const def = c ? currentBattle(c) : undefined
  const lines = useMemo(() => trackerLines(query.objectives(state)), [state])
  const upcoming = useMemo(() => query.timelinePreview(state, 12), [state])
  if (!c || !def) return null
  const rein = upcoming.filter((u) => u.kind === 'reinforcement')
  const others = upcoming.filter((u) => u.kind !== 'reinforcement')
  const win = lines.filter((l) => l.side === 'win')
  const lose = lines.filter((l) => l.side === 'lose')
  const slots = def.deploySlots ?? 0
  const required = (def.required ?? []).map(nameOf)
  const guests = (def.guests ?? []).map((g) => nameOf(g.officer))
  const wind = windScheduleText(def)
  return (
    <div className="modal" data-testid="cbrief">
      <section className="panel brief wide">
        <p className="kicker" data-testid="brief-kicker">
          Battle {c.battleIndex + 1} of {ARC.length} · {briefingKicker(def)}
        </p>
        <h2 data-testid="brief-title">{def.title ?? def.name}</h2>
        <div className="brief-cols">
          <div className="brief-main">
            {(def.blurb ?? []).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="brief-side">
            <h3>Objectives</h3>
            <ul className="obj-list win" aria-label="Win">
              {win.map((l) => (
                <li key={l.key}>
                  <span className="obj-mark" aria-hidden="true">
                    ◆
                  </span>
                  <span className="obj-text">{l.text}</span>
                </li>
              ))}
            </ul>
            <ul className="obj-list lose" aria-label="Lose">
              {lose.map((l) => (
                <li key={l.key}>
                  <span className="obj-mark" aria-hidden="true">
                    ✕
                  </span>
                  <span className="obj-text">{l.text}</span>
                </li>
              ))}
            </ul>
            <h3>Wind</h3>
            <p className="small" data-testid="brief-wind">
              {wind.join(' · ')}
            </p>
            {rein.length > 0 && (
              <>
                <h3>Reinforcements known</h3>
                <ul className="plainlist" data-testid="brief-reinforcements">
                  {rein.map((u, i) => (
                    <li key={i}>{timelineLabel(u)}</li>
                  ))}
                </ul>
              </>
            )}
            {others.length > 0 && (
              <>
                <h3>Scouts report</h3>
                <ul className="plainlist">
                  {others.slice(0, 5).map((u, i) => (
                    <li key={i}>{timelineLabel(u)}</li>
                  ))}
                </ul>
              </>
            )}
            <h3>Your company</h3>
            <p className="small">
              {slots > 0 ? `${slots} places. ` : ''}
              {required.length > 0 ? `Required: ${required.join(', ')}. ` : ''}
              {guests.length > 0 ? `Guests: ${guests.join(', ')}.` : ''}
            </p>
          </div>
        </div>
        <div className="row">
          <button type="button" className="plain" onClick={c.battleIndex > 0 ? openCamp : toTitle} data-testid="brief-back">
            {c.battleIndex > 0 ? 'Back to camp' : 'Title'}
          </button>
          <SealButton id="to-deploy" onClick={next}>
            To the deployment
          </SealButton>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ camp

function XpBar({ xp }: { xp: number }) {
  return (
    <span className="xpbar" role="img" aria-label={`${xp} of ${XP_PER_LEVEL} XP`}>
      <span style={{ width: `${Math.min(100, (xp / XP_PER_LEVEL) * 100)}%` }} />
    </span>
  )
}

function RosterSlip({ rec, c }: { rec: OfficerRecord; c: CampaignState }) {
  const drill = useCampaign((s) => s.drill)
  const muster = useCampaign((s) => s.muster)
  const toggle = useCampaign((s) => s.toggleStrat)
  const loadout = useCampaign((s) => s.loadout)
  const base = GAME_DATA.officers[rec.officerId]
  const fallen = rec.status === 'fallen'
  const carried = normaliseLoadout(rec, loadout[rec.officerId])
  const drilled = c.camp.drilled.includes(rec.officerId)
  const mustered = c.camp.mustered[rec.officerId] ?? 0
  const drillLeft = drilled ? 0 : 1
  const musterLeft = Math.max(0, MUSTER_LIMIT - mustered)
  const drillWhy = fallen ? 'Fallen' : drillLeft === 0 ? 'Drilled this camp' : c.provisions < DRILL_COST ? `Needs ${DRILL_COST} provisions` : null
  const musterWhy = fallen ? 'Fallen' : musterLeft === 0 ? 'Mustered twice this camp' : c.provisions < MUSTER_COST ? `Needs ${MUSTER_COST} provisions` : null
  const choose = rec.stratagems.length > MAX_CARRIED_STRATAGEMS
  const startTroops = rec.wounded ? Math.max(10, Math.round((rec.maxTroops * 0.5) / 10) * 10) : rec.maxTroops
  return (
    <article className={`roster-slip${fallen ? ' fallen' : ''}${rec.wounded ? ' wounded' : ''}`} data-testid={`roster-${rec.officerId}`}>
      <span className="cord top" aria-hidden="true" />
      <span className="cord bottom" aria-hidden="true" />
      {(rec.wounded || fallen) && (
        <span className={`ribbon ${fallen ? 'black' : 'red'}`} data-testid={`ribbon-${rec.officerId}`}>
          {fallen ? 'Fallen' : 'Wounded'}
        </span>
      )}
      <header>
        <Portrait id={rec.officerId} name={base?.name ?? rec.officerId} side="han" size={52} />
        <div className="who">
          <h3>{shortName(base?.name ?? rec.officerId)}</h3>
          <p>
            {TYPE_LABEL[base?.type ?? 'infantry']} · <b data-testid={`level-${rec.officerId}`}>Level {rec.level}</b>
          </p>
        </div>
      </header>
      <div className="xp-row">
        <span className="xp-label" data-testid={`xp-${rec.officerId}`}>
          XP {rec.xp} / {XP_PER_LEVEL}
        </span>
        <XpBar xp={rec.xp} />
      </div>
      <dl className="stats mini">
        {statLine(base, rec).map((s) => (
          <div key={s.key}>
            <dt>{s.label}</dt>
            <dd>
              {s.value}
              {s.bonus > 0 && <small>+{s.bonus}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="troops-line" data-testid={`troops-${rec.officerId}`}>
        Troops <b>{num(startTroops)}</b> / {num(rec.maxTroops)}
        {rec.wounded ? <span className="muted"> (starts at 50%)</span> : null}
      </p>
      <div className="strat-chips" aria-label="Stratagems">
        {rec.stratagems.map((s) => {
          const on = carried.includes(s)
          return choose && !fallen ? (
            <button key={s} type="button" className={`schip${on ? ' on' : ''}`} aria-pressed={on} data-testid={`strat-${rec.officerId}-${s}`} onClick={() => toggle(rec.officerId, s)}>
              {stratName(s)}
            </button>
          ) : (
            <span key={s} className="schip on static">
              {stratName(s)}
            </span>
          )
        })}
      </div>
      {choose && !fallen && (
        <p className="choose-note" data-testid={`carries-${rec.officerId}`}>
          Carries {carried.length} of {MAX_CARRIED_STRATAGEMS}. Choose {MAX_CARRIED_STRATAGEMS} of {rec.stratagems.length}.
        </p>
      )}
      <div className="camp-actions">
        <button type="button" className="camp-btn" disabled={drillWhy !== null} data-testid={`drill-${rec.officerId}`} onClick={() => drill(rec.officerId)}>
          <b>Drill</b>
          <span>{drillWhy ?? `−${DRILL_COST} provisions, +${DRILL_XP} XP · ${drillLeft} left`}</span>
        </button>
        <button type="button" className="camp-btn" disabled={musterWhy !== null} data-testid={`muster-${rec.officerId}`} onClick={() => muster(rec.officerId)}>
          <b>Muster</b>
          <span>{musterWhy ?? `−${MUSTER_COST} provisions, +${MUSTER_TROOPS} max troops · ${musterLeft} left`}</span>
        </button>
      </div>
    </article>
  )
}

export function Camp() {
  const c = useCampaign((s) => s.campaign)
  const note = useCampaign((s) => s.campNote)
  const storageOk = useCampaign((s) => s.storageOk)
  const toField = useCampaign((s) => s.openBriefing)
  const toTitle = useCampaign((s) => s.toTitle)
  if (!c) return null
  const def = currentBattle(c)
  const roster = c.roster.filter((r) => r.status !== 'departed')
  return (
    <div className="modal" data-testid="camp">
      <section className="panel camp">
        <header className="camp-head">
          <div>
            <p className="kicker">Camp before battle {c.battleIndex + 1}</p>
            <h2>{def?.title ?? def?.name ?? 'Camp'}</h2>
          </div>
          <div className="provisions" data-testid="provisions-box">
            <span className="prov-icon" aria-hidden="true">
              糧
            </span>
            <div>
              <span className="prov-label">Provisions</span>
              <b data-testid="provisions">{c.provisions}</b>
            </div>
          </div>
        </header>
        {note && (
          <p className="camp-note" data-testid="camp-note">
            {note}
          </p>
        )}
        <div className="roster" data-testid="roster">
          {roster.map((r) => (
            <RosterSlip key={r.officerId} rec={r} c={c} />
          ))}
        </div>
        <div className="row">
          <div className="camp-left">
            <button type="button" className="plain" onClick={toTitle} data-testid="camp-title">
              Title
            </button>
            <span className="muted save-note">{storageOk ? 'Progress is saved at every step.' : 'Saving is unavailable here; progress will not persist.'}</span>
          </div>
          <SealButton id="to-field" onClick={toField}>
            To the field
          </SealButton>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ deploy

export function Deploy() {
  const c = useCampaign((s) => s.campaign)
  const picks = useCampaign((s) => s.picks)
  const togglePick = useCampaign((s) => s.togglePick)
  const seal = useCampaign((s) => s.seal)
  const marks = useCampaign((s) => s.deployMarkers)
  const openBriefing = useCampaign((s) => s.openBriefing)
  if (!c) return null
  const def = currentBattle(c)
  if (!def) return null
  const slots = def.deploySlots ?? 0
  const list = deployList(c, { officers: picks })
  const required = new Set(def.required ?? [])
  const active = c.roster.filter((r) => r.status === 'active')
  const slotOf = (id: string): number => list.indexOf(id)
  const markOf = (id: string) => marks.find((m) => m.n === slotOf(id) + 1)
  return (
    <aside className="deploybar" data-testid="deploy">
      <header>
        <p className="kicker">Deployment</p>
        <h2>{def.title ?? def.name}</h2>
        <p className="count" data-testid="deploy-count">
          {list.length} of {slots} places filled
        </p>
      </header>
      <ul className="deploy-list" aria-label="Officers">
        {active.map((r) => {
          const base = GAME_DATA.officers[r.officerId]
          const slot = slotOf(r.officerId)
          const isReq = required.has(r.officerId)
          const on = slot >= 0
          const m = markOf(r.officerId)
          const full = !on && list.length >= slots
          return (
            <li key={r.officerId}>
              <button
                type="button"
                className={`deploy-row${on ? ' on' : ''}${isReq ? ' locked' : ''}`}
                aria-pressed={on}
                disabled={isReq || full}
                data-testid={`pick-${r.officerId}`}
                onClick={() => togglePick(r.officerId)}
              >
                <span className="slotno" aria-hidden="true">
                  {on ? slot + 1 : ''}
                </span>
                <Portrait id={r.officerId} name={base?.name ?? r.officerId} side="han" size={38} />
                <span className="drow-body">
                  <b>{shortName(base?.name ?? r.officerId)}</b>
                  <small>
                    {TYPE_LABEL[base?.type ?? 'infantry']} · Level {r.level} · {r.wounded ? `${num(Math.round(r.maxTroops / 20) * 10)}` : num(r.maxTroops)} troops
                    {m && m.label ? ` · ${m.label}` : ''}
                  </small>
                </span>
                <span className="drow-state">{isReq ? 'Required' : on ? 'Deployed' : full ? 'Full' : 'Add'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {(def.guests?.length ?? 0) > 0 && (
        <div className="guests" data-testid="deploy-guests">
          <h3>Guests</h3>
          <ul>
            {def.guests!.map((g) => (
              <li key={g.id}>
                <Portrait id={g.officer} name={GAME_DATA.officers[g.officer]?.name ?? g.id} side="han" size={30} />
                <span>
                  <b>{nameOf(g.officer)}</b> <small>{TYPE_LABEL[g.type]} · fights beside you, not on your roster</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="row">
        <button type="button" className="plain" onClick={openBriefing} data-testid="deploy-back">
          Briefing
        </button>
        <SealButton id="seal-orders" onClick={seal}>
          Seal the orders
        </SealButton>
      </div>
    </aside>
  )
}

// ------------------------------------------------------------------ results

function XpRow({ line }: { line: XpLine }) {
  const p = line.parts
  const bits = [
    p.attacks ? `strikes ${p.attacks}` : '',
    p.stratagems ? `stratagems ${p.stratagems}` : '',
    p.routs ? `routs ${p.routs}` : '',
    p.sways ? `sways ${p.sways}` : '',
    p.survived ? `held the field ${p.survived}` : '',
  ].filter(Boolean)
  return (
    <li className="xp-line" data-testid={`xpline-${line.officerId}`}>
      <Portrait id={line.officerId} name={GAME_DATA.officers[line.officerId]?.name ?? line.officerId} side="han" size={38} />
      <span className="xp-who">
        <b>{nameOf(line.officerId)}</b>
        <small>{bits.join(' · ')}</small>
        {line.levelUps.map((l) => (
          <span key={l.to} className="levelup" data-testid={`levelup-${line.officerId}`}>
            Level {l.from} → {l.to}:{' '}
            {(['war', 'int', 'lead', 'cha'] as const)
              .filter((k) => l.statGains[k] > 0)
              .map((k) => `${k === 'war' ? 'War' : k === 'int' ? 'Int' : k === 'lead' ? 'Lead' : 'Cha'} +${l.statGains[k]}`)
              .join(', ')}
            {l.learned.length > 0 ? ` · learns ${l.learned.map(stratName).join(', ')}` : ''}
          </span>
        ))}
      </span>
      <span className="xp-gain">+{line.gained} XP</span>
    </li>
  )
}

export function Results() {
  const r = useCampaign((s) => s.report)
  const c = useCampaign((s) => s.campaign)
  const after = useCampaign((s) => s.afterResults)
  const storageOk = useCampaign((s) => s.storageOk)
  if (!r || !c) return null
  const def = getBattleDef(r.battleId)
  const end = c.finished !== undefined
  const prov = r.provisions
  return (
    <div className="modal" data-testid="results">
      <section className="panel results">
        <p className="kicker">{def?.title ?? def?.name ?? r.battleId} · won in {r.rounds} rounds</p>
        <h2 data-testid="results-title">Victory</h2>
        {r.ironOathBroken && (
          <p className="warn" data-testid="oath-broken">
            Liu Bei fell on the field. The Iron Oath is broken and the campaign ends here.
          </p>
        )}
        <div className="results-cols">
          <div className="results-main">
            <h3>Experience</h3>
            <ul className="xp-list" data-testid="xp-list">
              {r.xp.map((l) => (
                <XpRow key={l.officerId} line={l} />
              ))}
            </ul>
          </div>
          <div className="results-side">
            {(r.joined.length > 0 || r.recruited.length > 0 || r.departed.length > 0) && (
              <>
                <h3>The company</h3>
                <ul className="plainlist" data-testid="company-changes">
                  {r.joined.map((id) => (
                    <li key={`j${id}`} className="good">
                      {nameOf(id)} joins the army.
                    </li>
                  ))}
                  {r.recruited.map((id) => (
                    <li key={`r${id}`} className="good">
                      {nameOf(id)} was won over and is recruited.
                    </li>
                  ))}
                  {r.departed.map((id) => (
                    <li key={`d${id}`} className="bad">
                      {nameOf(id)} departs.
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(r.wounded.length > 0 || r.fallen.length > 0) && (
              <>
                <h3>The cost</h3>
                <ul className="plainlist">
                  {r.wounded.map((id) => (
                    <li key={`w${id}`} className="bad">
                      {nameOf(id)} is wounded and starts the next battle at half strength.
                    </li>
                  ))}
                  {r.fallen.map((id) => (
                    <li key={`f${id}`} className="bad">
                      {nameOf(id)} has fallen and will not ride again.
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3>Provisions</h3>
            <dl className="prov-table" data-testid="prov-table">
              <div>
                <dt>Victory</dt>
                <dd>+{prov.victory}</dd>
              </div>
              <div>
                <dt>Foes routed</dt>
                <dd>+{prov.routed}</dd>
              </div>
              <div>
                <dt>Rounds under par</dt>
                <dd>+{prov.underPar}</dd>
              </div>
              <div className="total">
                <dt>Now in the stores</dt>
                <dd data-testid="prov-total">
                  +{prov.total} → {c.provisions}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="row">
          <span className="muted save-note" data-testid="saved-note">
            {storageOk ? 'Progress saved.' : 'Saving is unavailable here.'}
          </span>
          <SealButton id="results-next" onClick={after}>
            {end ? (c.finished === 'won' ? 'Hear the epilogue' : 'See the summary') : 'To the camp'}
          </SealButton>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ defeat

export function Defeat() {
  const d = useCampaign((s) => s.defeat)
  const retry = useCampaign((s) => s.retry)
  const toTitle = useCampaign((s) => s.toTitle)
  const state = useGame((g) => g.state)
  if (!d) return null
  const def = getBattleDef(d.battleId)
  const why =
    state.result?.reason === 'timeout'
      ? 'The round limit passed without a decision.'
      : state.result?.reason === 'objective'
        ? 'A condition for the battle was lost.'
        : 'The commander has been routed and the army scatters.'
  return (
    <div className="modal" data-testid="defeat">
      <section className="panel endpanel lost">
        <p className="kicker">{def?.title ?? def?.name ?? d.battleId}</p>
        <h2 data-testid="defeat-title">Defeat</h2>
        <p className="why">{why}</p>
        {d.ironOathBroken && (
          <p className="warn" data-testid="oath-broken">
            Liu Bei has fallen. The Iron Oath is broken and this campaign is recorded as lost. You may still retry the battle from the camp before it.
          </p>
        )}
        <p className="muted">No one is lost to a defeat. Retrying restores the camp as it stood before this battle.</p>
        <div className="row">
          <button type="button" className="plain" onClick={toTitle} data-testid="defeat-title-btn">
            Return to title
          </button>
          <SealButton id="retry" onClick={retry}>
            Retry battle
          </SealButton>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ summary

export function Summary() {
  const c = useCampaign((s) => s.campaign)
  const toTitle = useCampaign((s) => s.toTitle)
  if (!c) return null
  const won = c.finished === 'won'
  const rows: [string, string][] = [
    ['Battles won', `${c.stats.battlesWon} of ${ARC.length}`],
    ['Defeats', String(c.stats.defeats)],
    ['Best chain', c.stats.bestChain > 1 ? `×${c.stats.bestChain}` : 'none'],
    ['Foes routed', String(c.stats.foesRouted)],
    ['Officers lost', String(c.stats.officersLost)],
    ['Swayed to our side', String(c.stats.swayed)],
  ]
  return (
    <div className="modal" data-testid="summary">
      <section className="panel summary">
        <p className="kicker">{c.ironOath ? 'Iron Oath' : 'Campaign'}</p>
        <h2 data-testid="summary-title">{won ? 'The road is walked' : 'The road ends here'}</h2>
        <p className="why">
          {won
            ? `${ARC.length} battles, from the millet fields of Daxing Hill to the burning river at Red Cliffs. The sworn brothers stand together at the end of it.`
            : 'Liu Bei is gone and the company with him. The oath held as long as it could.'}
        </p>
        <dl className="endstats six">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h3>The company</h3>
        <ul className="final-roster" data-testid="final-roster">
          {c.roster.map((r) => (
            <li key={r.officerId} className={r.status !== 'active' ? 'gone' : ''}>
              <Portrait id={r.officerId} name={GAME_DATA.officers[r.officerId]?.name ?? r.officerId} side="han" size={32} />
              <span>
                <b>{nameOf(r.officerId)}</b> <small>{r.status === 'active' ? `Level ${r.level}` : r.status === 'fallen' ? 'Fallen' : 'Departed'}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className="row">
          <span />
          <button type="button" className="plain big" onClick={toTitle} data-testid="summary-title-btn">
            Return to title
          </button>
        </div>
      </section>
    </div>
  )
}
