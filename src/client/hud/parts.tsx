// Small shared HUD pieces.
import type { CSSProperties, ReactNode } from 'react'
import type { Facing } from '../../engine'
import { surname } from '../names'

export function Portrait({ name, side, size = 56 }: { name: string; side: 'han' | 'yellow'; size?: number }) {
  const style: CSSProperties = { width: size, height: size, fontSize: size * 0.62 }
  return (
    <span className={`portrait ${side}`} style={style} aria-hidden="true">
      <span>{surname(name)}</span>
    </span>
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

export function BrushBar({ value, max, side }: { value: number; max: number; side: 'han' | 'yellow' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <span className="brushbar" aria-hidden="true">
      <span className={`brushfill ${side}${pct < 30 ? ' low' : ''}`} style={{ width: `${pct}%` }} />
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
