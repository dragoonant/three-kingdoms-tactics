// The on-screen performance HUD (`?perf=hud`, docs/spec/51 "Performance: per-frame budgets and quality tiers"): a small
// overlay the owner can read on a phone. It shows fps, frame ms (median and p95 over the last second, from the animation-frame
// intervals), the draw calls and triangles of the last frame (shadow pass included) and the cut-in quality tier. It follows
// whichever canvas drew last: the cut-in's during a cut-in, the board's otherwise. Off (every call a no-op) without the flag.
// Plain DOM, no React; the renderers register themselves (CutinView's Bridge, BoardCanvas).
import { useQuality } from './quality'

interface InfoLike {
  info: { render: { calls: number; triangles: number; frame: number } }
}

export const HUD = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === 'hud'
  } catch {
    return false
  }
})()

const renderers = new Map<string, InfoLike>()
let el: HTMLDivElement | null = null
const frames: number[] = []
let last = 0
let lastPaint = 0
const seen = new Map<string, number>()
let current = 'board'

const pct = (xs: number[], p: number): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!
}

function paint(now: number): void {
  // which canvas drew since the last look (its frame counter moved)
  for (const [k, r] of renderers) {
    const f = r.info.render.frame
    if (seen.get(k) !== f) {
      seen.set(k, f)
      current = k
    }
  }
  const r = renderers.get(current)
  const ms = frames.slice()
  const med = pct(ms, 0.5)
  const p95 = pct(ms, 0.95)
  const fps = ms.length ? 1000 / (ms.reduce((a, b) => a + b, 0) / ms.length) : 0
  const tier = useQuality.getState()
  if (!el) return
  el.textContent =
    `${fps.toFixed(0)} fps  ${med.toFixed(1)} / ${p95.toFixed(1)} ms\n` +
    `${current}: ${r ? r.info.render.calls : '-'} calls  ${r ? (r.info.render.triangles / 1000).toFixed(0) : '-'}k tris\n` +
    `cut-ins: ${tier.tier}${tier.choice === 'auto' ? ' (auto)' : ''}${tier.steps ? ` -${tier.steps}` : ''}`
  lastPaint = now
}

function tick(now: number): void {
  if (last) {
    frames.push(now - last)
    // the last second of frames
    let sum = 0
    for (let i = frames.length - 1; i >= 0; i--) {
      sum += frames[i]!
      if (sum > 1000) {
        frames.splice(0, i)
        break
      }
    }
  }
  last = now
  if (now - lastPaint > 250) paint(now)
  requestAnimationFrame(tick)
}

function start(): void {
  if (el || typeof document === 'undefined') return
  el = document.createElement('div')
  el.setAttribute('data-testid', 'perf-hud')
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    left: '6px',
    top: 'calc(6px + env(safe-area-inset-top, 0px))',
    zIndex: '100000',
    pointerEvents: 'none',
    whiteSpace: 'pre',
    font: '600 11px/1.35 ui-monospace, Menlo, monospace',
    color: '#f4e7d0',
    background: 'rgba(20, 16, 13, 0.72)',
    padding: '4px 6px',
    borderRadius: '4px',
  } satisfies Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  requestAnimationFrame(tick)
}

export const hud = {
  /** A canvas's renderer (the HUD reads renderer.info after each of its frames). */
  attach(name: string, r: InfoLike): void {
    if (!HUD) return
    renderers.set(name, r)
    start()
  },
  detach(name: string, r: InfoLike): void {
    if (renderers.get(name) === r) renderers.delete(name)
  },
}
