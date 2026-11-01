import { useEffect } from 'react'
import { getBattleDef } from '../../data'
import { SKIRMISH_ID, useGame } from '../store/game'
import { useCampaign } from '../store/campaign'
import { Portrait } from '../hud/parts'
import { nameOfUnit } from '../names'
import { SoundButton } from '../audio/SoundControl'

function SealButton({ children, onClick, id }: { children: React.ReactNode; onClick: () => void; id: string }) {
  return (
    <button type="button" className="seal big" data-testid={id} onClick={onClick}>
      <span className="seal-mark" aria-hidden="true">
        令
      </span>
      <span className="seal-text">{children}</span>
    </button>
  )
}

export function Title() {
  const go = useGame((s) => s.go)
  const hasSave = useCampaign((c) => c.hasSave)
  const openNew = useCampaign((c) => c.openNew)
  const cont = useCampaign((c) => c.continueSave)
  const refresh = useCampaign((c) => c.refresh)
  useEffect(() => {
    refresh()
  }, [refresh])
  const skirmish = getBattleDef(SKIRMISH_ID)
  return (
    <main className="title-screen" data-testid="title-screen">
      <div className="hang">
        <span className="rope l" aria-hidden="true" />
        <span className="rope r" aria-hidden="true" />
        <div className="banner-silk">
          <span className="banner-seal" aria-hidden="true">
            戰
          </span>
          <h1>
            <span>Three Kingdoms</span>
            <span>Tactics</span>
          </h1>
          <p>A war-council on the sand table</p>
        </div>
        <nav className="slips" aria-label="Main menu">
          {hasSave && (
            <button type="button" className="hang-slip" data-testid="continue" onClick={() => cont()}>
              <span>Continue the campaign</span>
            </button>
          )}
          <button type="button" className="hang-slip" data-testid="campaign" onClick={openNew}>
            <span>{hasSave ? 'New campaign' : "Campaign: Liu Bei's Rise"}</span>
          </button>
          <button type="button" className="hang-slip" data-testid="begin" onClick={() => go('briefing')}>
            <span>Skirmish: {skirmish?.name ?? 'Daxing Hill'}</span>
          </button>
          <button type="button" className="hang-slip" data-testid="howto" onClick={() => go('howto')}>
            <span>How to play</span>
          </button>
        </nav>
      </div>
      <p className="fine">An original fan project. Not affiliated with Koei Tecmo.</p>
      <SoundButton placement="above" className="snd-float" />
    </main>
  )
}

export function Briefing() {
  const go = useGame((s) => s.go)
  const begin = useGame((s) => s.begin)
  return (
    <div className="modal" data-testid="briefing">
      <section className="panel brief">
        <h2>Daxing Hill, 184</h2>
        <p className="kicker">Council of war</p>
        <p>
          The Yellow Turban rising has reached Youzhou. Magistrate Zou Jing leads the local levies out to meet it, and three sworn brothers march in his column: Liu Bei, who commands,
          Guan Yu on his red horse, and Zhang Fei with the serpent spear. Jian Yong, Liu Bei&apos;s old friend, rides with them as strategist.
        </p>
        <p>
          The rebels hold Daxing Hill, the high ground on the far bank of the river. The river can be crossed at the bridge on the road and at two fords, and a belt of ripe millet lies on your
          side of it. <b>Rout their leader, Cheng Yuanzhi, or break every rebel unit before round 15 ends.</b> If Liu Bei falls, or the round limit passes, the rising wins.
        </p>
        <p className="warn">
          <b>Watch the wind.</b> A breeze blows east now, and fire will creep that way through the millet. The air falls calm at round 6; at round 9 a westerly gale turns any fire still burning
          back on your own line. Burn early, and be done.
        </p>
        <div className="row">
          <button type="button" className="plain" onClick={() => go('title')} data-testid="brief-back">
            Back
          </button>
          <SealButton id="start-battle" onClick={begin}>
            Seal: Take the field
          </SealButton>
        </div>
      </section>
    </div>
  )
}

export function HowTo() {
  const go = useGame((s) => s.go)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') go('title')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])
  return (
    <div className="modal" data-testid="howto-screen">
      <section className="panel howto">
        <h2>How to play</h2>
        <div className="cols">
          <article>
            <h3>Your turn</h3>
            <p>
              Click one of your officers (a pulse ring marks who can act). Each officer may <b>move once</b>, then take <b>one action</b>: Attack, Stratagem, Sway or Wait. Undo the move any time
              before acting. When you are done, End phase.
            </p>
          </article>
          <article>
            <h3>Facing</h3>
            <p>
              The notch on a base shows where a unit looks. Strikes from the front deal ×1.00, from the side ×1.25, from behind ×1.50. A melee target that survives strikes back at ×0.5 if you hit its
              front or side. Archers shoot 2–3 tiles (+1 from a hill), are never countered, and cannot hit what stands next to them.
            </p>
          </article>
          <article>
            <h3>Qi and stratagems</h3>
            <p>
              Qi (the bronze coins) grows +2 each phase and +1 whenever the unit is hit. Stratagems cost 3 to 5. Infantry beat cavalry, cavalry beat archers, archers beat infantry (×1.2).
              Forests give cover (×0.8), hills ×0.9 and let you strike downhill for ×1.15.
            </p>
          </article>
          <article>
            <h3>Chains</h3>
            <p>
              When a stratagem hits, friends in range whose stratagem follows its kind link in on their own, up to four links. Each link adds 20% (×1.2, ×1.4, ×1.6), and sworn brothers add 15% and
              one tile of reach. Untick an officer on the order card to leave them out.
            </p>
          </article>
          <article>
            <h3>Fire and wind</h3>
            <p>
              A burning tile lasts 2 rounds and hurts units on it for 10% of their men (15% in forest) with a 50% chance to daze them. It spreads at round end: 15% on every side in calm, 60% downwind
              in a breeze, 100% downwind and 30% to the sides in a gale. Burnt ground turns to ash. The pennant at the corner shows the wind; hover a burning tile for the odds.
            </p>
          </article>
          <article>
            <h3>Sway</h3>
            <p>
              Within 2 tiles you may try to win an enemy captain over (once per pair). The chance is shown on the seal; wounded or dazed captains are easier. Commanders cannot be swayed. A swayed unit
              joins you at once.
            </p>
          </article>
          <article data-testid="howto-controls">
            <h3>Controls</h3>
            <p>
              <b>Touch:</b> drag with one finger to scroll the map, twist two fingers to turn the table, pinch to zoom toward your fingers. A tap selects; a drag never does.{' '}
              <b>Mouse:</b> drag to scroll, right-drag (or Q and E) to turn and tilt, the wheel zooms toward the cursor, R resets the view. Zoom all the way in to look a unit in the face.
            </p>
          </article>
        </div>
        <p className="muted">Any click skips the replay of what just happened. Speed (Full, Quick, Instant) is on the top bar. More on the unit card opens the full details.</p>
        <div className="row">
          <button type="button" className="plain" onClick={() => go('title')} data-testid="howto-back">
            Back
          </button>
        </div>
      </section>
    </div>
  )
}

export function End() {
  const state = useGame((s) => s.state)
  const stats = useGame((s) => s.stats)
  const restart = useGame((s) => s.restart)
  const go = useGame((s) => s.go)
  const r = state.result
  if (!r) return null
  const won = r.winner === 'han'
  const daxing = state.battleId === 'daxing-hill'
  const foe = state.sideOrder.find((x) => x !== 'han') ?? 'yellow'
  const foeId = state.units.find((u) => u.id === state.commanders[foe])?.officer ?? state.commanders[foe] ?? ''
  const foeCommander = nameOfUnit(state, state.commanders[foe] ?? '')
  const why = !daxing
    ? r.reason === 'commander'
      ? won
        ? `${foeCommander} is routed and the enemy host breaks.`
        : 'Liu Bei has been routed. The army scatters.'
      : r.reason === 'annihilation'
        ? won
          ? 'Not an enemy banner is left standing.'
          : 'Your whole line has been destroyed.'
        : r.reason === 'objective'
          ? won
            ? 'The objective is met.'
            : 'The objective is lost.'
          : `Round ${state.turnLimit} ended without a decision.`
    : r.reason === 'commander'
      ? won
        ? 'Cheng Yuanzhi is routed and the rebel host breaks.'
        : 'Liu Bei has been routed. The army scatters.'
      : r.reason === 'annihilation'
        ? won
          ? 'Not a rebel banner is left standing on Daxing Hill.'
          : 'Your whole line has been destroyed.'
        : `Round ${state.turnLimit} ended without a decision. The rebels keep the hill.`
  return (
    <div className="modal" data-testid="end-screen">
      <section className={`panel endpanel ${won ? 'won' : 'lost'}`}>
        <Portrait id={won ? 'liu-bei' : foeId} name={won ? 'Liu Bei' : foeCommander} side={won ? 'han' : foe} size={72} />
        <h2 data-testid="end-title">{won ? 'Victory' : 'Defeat'}</h2>
        <p className="why" data-testid="end-reason">
          {why}
        </p>
        <dl className="endstats">
          <div>
            <dt>Rounds</dt>
            <dd data-testid="stat-rounds">{state.round}</dd>
          </div>
          <div>
            <dt>Units lost</dt>
            <dd data-testid="stat-lost">{stats.hanLost}</dd>
          </div>
          <div>
            <dt>Foes routed</dt>
            <dd>{stats.foesRouted}</dd>
          </div>
          <div>
            <dt>Best chain</dt>
            <dd data-testid="stat-chain">{stats.bestChain > 1 ? `×${stats.bestChain}` : 'none'}</dd>
          </div>
        </dl>
        <div className="row">
          <button type="button" className="plain" onClick={() => go('title')} data-testid="end-title-btn">
            Title
          </button>
          <SealButton id="fight-again" onClick={restart}>
            Fight again
          </SealButton>
        </div>
      </section>
    </div>
  )
}

