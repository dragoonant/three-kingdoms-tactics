// Small shared HUD pieces.
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Facing } from '../../engine'
import { sideToken } from '../board/layout'
import type { TroopType } from '../../data'
import { genericPortraitId, portraitUrl } from '../portraits'
import { surname } from '../names'

/**
 * The officer's face: the rendered portrait (public/portraits/<id>.webp), else the generic one for the side and troop type, else the letter seal
 * (the first letter of the family name on the side's colour). A missing file just moves on to the next.
 */
export function Portrait({ name, side, size = 56, id, type }: { name: string; side: string; size?: number; id?: string; type?: TroopType }) {
  const style: CSSProperties = { width: size, height: size, fontSize: size * 0.62 }
  const token = sideToken(side)
  const urls = [id ? portraitUrl(id) : null, type ? portraitUrl(genericPortraitId(token, type)) : null].filter((u): u is string => u !== null)
  const [failed, setFailed] = useState<string[]>([])
  const url = urls.find((u) => !failed.includes(u))
  return (
    <span className={`portrait ${token}${url ? ' has-img' : ''}`} style={style} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} width={size} height={size} onError={() => setFailed((f) => [...f, url])} /> : <span>{surname(name)}</span>}
    </span>
  )
}

/** Troop-type mark: a spear-and-shield, a horseshoe or a bow. */
export function TroopIcon({ type, size = 16 }: { type: TroopType; size?: number }) {
  return (
    <svg className={`troop-icon ${type}`} viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={type === 'archers' ? 'Archers' : type === 'cavalry' ? 'Cavalry' : 'Infantry'}>
      {type === 'infantry' && (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 L12 22" />
          <path d="M8.5 6 L12 2 L15.5 6" />
          <path d="M5 11 H19 V15 Q19 19 12 22 Q5 19 5 15 Z" fill="currentColor" fillOpacity="0.25" />
        </g>
      )}
      {type === 'cavalry' && (
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 20 V11 A6 6 0 0 1 18 11 V20" />
          <path d="M6 16 H4 M18 16 H20" strokeWidth="2" />
        </g>
      )}
      {type === 'archers' && (
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3 Q20 12 7 21" />
          <path d="M7 3 V21" strokeWidth="1.2" />
          <path d="M3 12 H19 M15.5 8.5 L19 12 L15.5 15.5" />
        </g>
      )}
    </svg>
  )
}

export function Coins({ qi, max = 10 }: { qi: number; max?: number }) {
  return (
    <span className="coins" role="img" aria-label={`Qi ${qi} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < qi ? 'coin full' : 'coin'} />
      ))}
    </span>
  )
}

export function BrushBar({ value, max, side }: { value: number; max: number; side: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <span className="brushbar" aria-hidden="true">
      <span className={`brushfill ${sideToken(side)}${pct < 30 ? ' low' : ''}`} style={{ width: `${pct}%` }} />
    </span>
  )
}

export const ARROW: Record<Facing, string> = { N: '↑', E: '→', S: '↓', W: '←' }

export function Cord({ top }: { top?: boolean }) {
  return <span className={top ? 'cord top' : 'cord bottom'} aria-hidden="true" />
}

export function Pennant({ dir, calm }: { dir: Facing | null; calm: boolean }) {
  const rot = dir === 'E' ? 0 : dir === 'S' ? 90 : dir === 'W' ? 180 : dir === 'N' ? -90 : 0
  return (
    <svg className="pennant-icon" viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <g transform={`rotate(${rot} 24 24)`}>
        <line x1="8" y1="8" x2="8" y2="42" stroke="#a07a3a" strokeWidth="3" strokeLinecap="round" />
        {calm ? (
          <path d="M9 10 Q13 24 12 34 L9 34 Z" fill="#c8372d" />
        ) : (
          <path d="M9 10 Q26 6 40 14 Q26 20 9 24 Z" fill="#c8372d" className="flap" />
        )}
      </g>
    </svg>
  )
}

export function Slip({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`slip-card ${className}`} {...rest}>
      {children}
    </div>
  )
}
