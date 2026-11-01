// HTML overlays synced to evaluate(scene, t): brushed stratagem title, the single call-out, the painted damage number,
// the seal stamp, hit flashes and speed lines. All of it is a pure function of the Evaluated frame.
import './cutins.css'
import { rand } from './rng'
import { EASE, clamp01, type Evaluated, type OverlayState } from './timeline'

/** A left-to-right brush reveal: the mask edge sweeps across with a soft, wide feather. */
function wipe(p: number, feather = 22): string {
  const edge = p * (100 + feather)
  return `linear-gradient(100deg, #000 ${edge - feather}%, transparent ${edge}%)`
}

function Defs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <filter id="co-rough" x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        </filter>
        <filter id="co-brush" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.012" numOctaves="3" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
        </filter>
      </defs>
    </svg>
  )
}

function Title({ o }: { o: OverlayState['title'] }) {
  if (o.alpha <= 0.002 || o.reveal <= 0.002) return null
  return (
    <div className="co-title" style={{ opacity: o.alpha }}>
      <div className="co-title-swash" style={{ opacity: o.reveal }} />
      <div style={{ WebkitMaskImage: wipe(o.reveal), maskImage: wipe(o.reveal), filter: 'url(#co-rough)' }}>
        <div className="co-title-main">{o.text}</div>
      </div>
      <div style={{ WebkitMaskImage: wipe(clamp01(o.reveal * 1.25 - 0.25)), maskImage: wipe(clamp01(o.reveal * 1.25 - 0.25)) }}>
        <div className="co-title-sub">{o.sub}</div>
      </div>
    </div>
  )
}

function Callout({ o }: { o: OverlayState['callout'] }) {
  if (o.alpha <= 0.002 || o.reveal <= 0.002) return null
  const pop = 1 + (1 - EASE.out(o.reveal)) * 0.18
  return (
    <div className="co-callout" style={{ opacity: o.alpha, transform: `rotate(-5deg) scale(${pop})`, WebkitMaskImage: wipe(o.reveal, 30), maskImage: wipe(o.reveal, 30) }}>
      <span style={{ filter: 'url(#co-rough)', display: 'inline-block' }}>{o.text}</span>
    </div>
  )
}

function Damage({ o }: { o: OverlayState['damage'] }) {
  if (o.alpha <= 0.002 || o.paint <= 0.002) return null
  // the swoosh under the figures is drawn first, then the numerals are painted in after it
  const swoosh = clamp01(o.paint * 1.6)
  const nums = clamp01(o.paint * 1.5 - 0.35)
  const L = 420
  return (
    <div className="co-damage" style={{ opacity: o.alpha }}>
      <div className="co-damage-num" style={{ WebkitMaskImage: wipe(nums, 26), maskImage: wipe(nums, 26) }}>
        <span style={{ filter: 'url(#co-rough)', display: 'inline-block' }}>{o.text}</span>
      </div>
      <svg className="co-damage-stroke" viewBox="0 0 400 24" preserveAspectRatio="none">
        <path
          d="M4 14 C 70 4, 150 20, 235 11 S 360 8, 396 13"
          fill="none"
          stroke="#c8372d"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={L}
          strokeDashoffset={L * (1 - swoosh)}
          filter="url(#co-brush)"
        />
      </svg>
    </div>
  )
}

function Seal({ o }: { o: OverlayState['seal'] }) {
  if (o.alpha <= 0 || o.stamp <= 0) return null
  const k = EASE.out(o.stamp)
  const scale = 1 + (1 - k) * 0.85
  const op = clamp01(o.stamp * 4)
  const bounce = o.stamp < 1 ? 0 : 0
  return (
    <div className="co-seal" style={{ opacity: op, transform: `rotate(-6deg) scale(${scale + bounce})` }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <g filter="url(#co-rough)">
          <rect x="6" y="6" width="88" height="88" rx="7" fill="#c8372d" />
          <rect x="13" y="13" width="74" height="74" rx="4" fill="none" stroke="#efe6d2" strokeWidth="3.2" opacity="0.92" />
          <text x="50" y="72" textAnchor="middle" fontSize="62" fill="#efe6d2" style={{ fontFamily: 'var(--font-display)' }}>
            {o.glyph}
          </text>
        </g>
      </svg>
    </div>
  )
}

/** Radial ink streaks with a clear middle, so the impact itself stays readable. */
function InkBurst({ seed, progress }: { seed: number; progress: number }) {
  const cx = 50
  const cy = 54
  const streaks: string[] = []
  const n = 34
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand(seed, i, 1) - 0.5) * 0.14
    const r0 = 24 + rand(seed, i, 2) * 12
    const r1 = r0 + 22 + rand(seed, i, 3) * 40
    const w = 0.5 + rand(seed, i, 4) * 2.1
    const px = -Math.sin(a)
    const py = Math.cos(a)
    const ax = cx + Math.cos(a) * r0 * 1.78
    const ay = cy + Math.sin(a) * r0
    const bx = cx + Math.cos(a) * r1 * 1.78
    const by = cy + Math.sin(a) * r1
    streaks.push(`M${ax + px * w * 1.78},${ay + py * w} L${bx},${by} L${ax - px * w * 1.78},${ay - py * w} Z`)
  }
  const blots: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 26; i++) {
    const a = rand(seed, i, 5) * Math.PI * 2
    const r = 20 + rand(seed, i, 6) * 52
    blots.push({ x: cx + Math.cos(a) * r * 1.78, y: cy + Math.sin(a) * r, r: 0.3 + rand(seed, i, 7) * 1.5 })
  }
  const grow = 0.86 + 0.2 * EASE.out(clamp01(progress * 3))
  const fade = 1 - clamp01((progress - 0.72) / 0.28)
  return (
    <svg className="co-ink" viewBox="0 0 177.8 100" preserveAspectRatio="none" style={{ opacity: fade }}>
      <g transform={`translate(88.9 ${cy}) scale(${grow}) translate(-88.9 ${-cy})`} filter="url(#co-rough)">
        {streaks.map((d, i) => (
          <path key={i} d={d} fill="#14100d" />
        ))}
        {blots.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#14100d" />
        ))}
      </g>
    </svg>
  )
}

function SpeedLines({ amount, t }: { amount: number; t: number }) {
  if (amount <= 0.01) return null
  const lines = []
  const n = 15
  for (let i = 0; i < n; i++) {
    const y = 6 + rand(77, i, 1) * 88
    const len = 22 + rand(77, i, 2) * 34
    const sp = 1.7 + rand(77, i, 3) * 1.6
    const off = rand(77, i, 4)
    const x = 100 + 30 - (((t * sp + off) * 100) % 160)
    const w = 0.6 + rand(77, i, 5) * 1.5
    // tapered stroke: thin at the tail (right), thick at the head
    lines.push(
      <path
        key={i}
        d={`M${x},${y - w} L${x + len},${y - w * 0.15} L${x + len},${y + w * 0.15} L${x},${y + w} Z`}
        fill={i % 3 === 0 ? '#e0cd9a' : '#efe6d2'}
        opacity={0.28 + 0.5 * rand(77, i, 6)}
      />,
    )
  }
  return (
    <svg className="co-speed" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ opacity: amount }}>
      <g filter="url(#co-rough)">{lines}</g>
    </svg>
  )
}

export function Overlays({ ev, safe = false }: { ev: Evaluated; safe?: boolean }) {
  const o = ev.overlay
  return (
    <div className="co-overlay">
      <Defs />
      <div className="co-vignette" />
      {o.dof > 0.01 && <div className="co-dof" style={{ opacity: o.dof }} />}
      <SpeedLines amount={o.speedLines} t={ev.t} />
      {o.flash && o.flash.kind === 'fire' && (
        <div className="co-wash" style={{ background: 'radial-gradient(ellipse at 50% 58%, rgba(255,214,150,0.95), rgba(255,120,40,0.55) 55%, rgba(255,90,20,0) 100%)', opacity: o.flash.alpha }} />
      )}
      {o.flash && o.flash.kind === 'ink' && (
        <>
          <div className="co-wash" style={{ background: 'radial-gradient(ellipse at 50% 54%, rgba(239,230,210,0.25), rgba(239,230,210,0.82) 70%)', opacity: o.flash.alpha }} />
          <InkBurst seed={o.flash.seed} progress={o.flash.progress} />
        </>
      )}
      <Title o={o.title} />
      <Callout o={o.callout} />
      <Damage o={o.damage} />
      <Seal o={o.seal} />
      {o.veil > 0.002 && <div className="co-veil" style={{ opacity: o.veil }} />}
      {safe && (
        <div className="co-safe">
          <i className="action" />
          <i className="title" />
          <b>action safe 93% / title safe 90%</b>
        </div>
      )}
    </div>
  )
}
