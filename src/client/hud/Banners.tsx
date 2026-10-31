import { useEffect, useState } from 'react'
import { surname, shortName } from '../names'
import { useGame } from '../store/game'

export function Banners() {
  const beat = useGame((s) => s.beat)
  const beatNo = useGame((s) => s.beatNo)
  const seals = useGame((s) => s.seals)
  const state = useGame((s) => s.state)
  const speed = useGame((s) => s.speed)
  const [bannerKey, setBannerKey] = useState(0)
  useEffect(() => {
    setBannerKey((k) => k + 1)
  }, [beatNo])
  const fx = beat?.fx
  const hide = speed === 'instant'
  const nameOf = (unit: string): string => shortName(state.data.officers[state.units.find((u) => u.id === unit)?.officer ?? unit]?.name ?? unit)
  return (
    <>
      {!hide && fx?.t === 'banner' && (
        <div className="scroll-wrap" key={`b${bannerKey}`} data-testid="round-banner">
          <div className="scroll">
            <span className="rod l" />
            <div className="scroll-paper">
              <h2>{fx.title}</h2>
              <p>
                <span className={`pip ${fx.side}`} /> {fx.sub}
              </p>
            </div>
            <span className="rod r" />
          </div>
        </div>
      )}
      {!hide && fx?.t === 'end' && (
        <div className="scroll-wrap" data-testid="end-banner">
          <div className="scroll big">
            <span className="rod l" />
            <div className="scroll-paper">
              <h2>{fx.winner === 'han' ? 'Victory' : 'Defeat'}</h2>
            </div>
            <span className="rod r" />
          </div>
        </div>
      )}
      {!hide && seals.length > 0 && (
        <div className="chain-row" data-testid="chain-row" aria-live="polite">
          <p className="strat-title">
            {seals[seals.length - 1]!.name} <span>— {nameOf(seals[seals.length - 1]!.unit)}</span>
          </p>
          <div className="seal-row">
            {seals.map((s) => (
              <span key={s.id} className={`seal-stamp${s.bond ? ' bond' : ''}`} aria-label={`${s.name} by ${nameOf(s.unit)}`}>
                <b>{surname(nameOf(s.unit))}</b>
                <small>{s.name}</small>
              </span>
            ))}
          </div>
          {seals.length > 1 && (
            <div className="chain-count" key={seals.length} data-testid="chain-count">
              Chain ×{seals.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
