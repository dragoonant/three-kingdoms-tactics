// Procedural MGSD stand-in: head about 40% of the figure's height and as wide as the shoulders,
// oversized weapon hint, back banner in the faction colour, round black base with a facing notch.
import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import {
  Color,
  DoubleSide,
  Shape,
  ShapeGeometry,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three'
import { anim, animProgress } from '../presentation/director'
import type { UnitVis } from '../presentation/scene'
import { figureGeometry, swirlGeometry } from './figureGeometry'
import { edgePoint } from './frame'
import { angleDelta, board, COLORS, facingAngle, sideColour, tileX, tileZ } from './layout'

const ease = (t: number): number => t * t * (3 - 2 * t)

const notchShape = new Shape()
notchShape.moveTo(0, 0.2)
notchShape.lineTo(-0.11, -0.02)
notchShape.lineTo(0.11, -0.02)
notchShape.closePath()
const notchGeo = new ShapeGeometry(notchShape).rotateX(-Math.PI / 2)

function roundedBar(w: number, h: number, r: number): Shape {
  const s = new Shape()
  s.moveTo(r, 0)
  s.lineTo(w - r, 0)
  s.absarc(w - r, r, r, -Math.PI / 2, Math.PI / 2, false)
  s.lineTo(r, h)
  s.absarc(r, r, r, Math.PI / 2, (Math.PI * 3) / 2, false)
  return s
}
const barBg = new ShapeGeometry(roundedBar(0.7, 0.12, 0.05))
const barFillGeo = new ShapeGeometry(roundedBar(0.62, 0.08, 0.035))

interface Props {
  unit: UnitVis
  top: number
  tops: (x: number, y: number) => number
  actable: boolean
  selected: boolean
  targeted: boolean
  onPick: (x: number, y: number) => void
  onHover: (x: number, y: number) => void
  onLeave: () => void
}

function FigureImpl({ unit: u, top, tops, actable, selected, targeted, onPick, onHover, onLeave }: Props) {
  const root = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const swirl = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const fill = useRef<Mesh>(null)
  const fillMat = useRef<MeshBasicMaterial>(null)
  const han = u.side === 'han'
  const cav = u.type === 'cavalry'
  const dim = u.done ? 0.55 : 1
  const faction = han ? COLORS.han : sideColour(u.side)
  const phase = useMemo(() => (u.id.length * 1.37) % 6, [u.id])

  const geos = useMemo(() => figureGeometry({ id: u.id, han, type: u.type, commander: u.commander, colour: han ? undefined : sideColour(u.side) }), [u.id, han, u.type, u.commander, u.side])
  const dimColor = useMemo(() => new Color(dim, dim, dim), [dim])
  const bodyMat = useRef<MeshStandardMaterial>(null)
  const rider = cav ? 0.34 : 0
  const baseR = cav ? 0.4 : 0.35

  useFrame((state) => {
    const g = root.current
    const s = spin.current
    if (!g || !s) return
    const t = state.clock.elapsedTime
    const fx = anim.beat?.fx
    const p = animProgress()
    let x = tileX(u.x)
    let z = tileZ(u.y)
    let y = top
    let ang = facingAngle(u.facing)
    let tilt = 0
    let sc = 1
    let flash = 0
    let glow = 0
    let hop = 0
    let frac = u.troops / u.maxTroops
    if (fx) {
      switch (fx.t) {
        case 'move':
          if (fx.unit === u.id) {
            const pts = fx.path
            const n = pts.length - 1
            if (n >= 1) {
              const sp = Math.min(0.9999, p * n)
              const i = Math.floor(sp)
              const f = sp - i
              const a = pts[i]!
              const b = pts[i + 1]!
              const ax = tileX(a.x)
              const az = tileZ(a.y)
              const bx = tileX(b.x)
              const bz = tileZ(b.y)
              const ay = tops(a.x, a.y)
              const by = tops(b.x, b.y)
              const ff = fx.dash ? ease(p) : f
              if (fx.dash) {
                const A = pts[0]!
                const B = pts[n]!
                x = tileX(A.x) + (tileX(B.x) - tileX(A.x)) * ff
                z = tileZ(A.y) + (tileZ(B.y) - tileZ(A.y)) * ff
                y = tops(A.x, A.y) + (tops(B.x, B.y) - tops(A.x, A.y)) * ff
                hop = Math.sin(ff * Math.PI) * 0.25
              } else {
                x = ax + (bx - ax) * ff
                z = az + (bz - az) * ff
                y = ay + (by - ay) * ff
                hop = Math.abs(Math.sin(f * Math.PI)) * 0.07
              }
              if (!fx.undo && (bx !== ax || bz !== az)) ang = Math.atan2(bx - ax, bz - az)
            }
          }
          break
        case 'turn':
          if (fx.unit === u.id) ang = facingAngle(fx.from) + angleDelta(facingAngle(fx.from), facingAngle(fx.to)) * ease(p)
          break
        case 'lunge':
          if (fx.unit === u.id) {
            const dx = tileX(fx.toward.x) - x
            const dz = tileZ(fx.toward.y) - z
            const len = Math.hypot(dx, dz) || 1
            const off = Math.sin(Math.min(1, p) * Math.PI) * 0.4
            x += (dx / len) * off
            z += (dz / len) * off
            hop = Math.sin(Math.min(1, p) * Math.PI) * 0.06
            ang = Math.atan2(dx, dz)
          }
          break
        case 'damage':
          if (fx.unit === u.id) {
            frac = (fx.before + (fx.after - fx.before) * ease(p)) / u.maxTroops
            const k = (1 - p) * 0.05
            x += Math.sin(p * 38) * k
            z += Math.cos(p * 31) * k
            flash = 1 - p
          }
          break
        case 'rout':
          if (fx.unit === u.id) {
            tilt = ease(p) * 1.45
            y -= p * 0.12
            sc = p > 0.7 ? Math.max(0.05, 1 - ((p - 0.7) / 0.3) * 0.95) : 1
          }
          break
        case 'stratagem':
          if (fx.caster === u.id) {
            hop = Math.sin(Math.min(1, p) * Math.PI) * 0.14
            glow = Math.sin(Math.min(1, p) * Math.PI)
          }
          break
        case 'confuse':
          if (fx.unit === u.id) flash = 0.5 * (1 - p)
          break
        case 'heal':
          if (fx.unit === u.id) glow = Math.sin(Math.min(1, p) * Math.PI)
          break
        case 'sway':
          if (fx.target === u.id) glow = Math.sin(Math.min(1, p) * Math.PI * 2) * 0.6 + 0.2
          break
        case 'wait':
          if (fx.unit === u.id) hop = Math.sin(Math.min(1, p) * Math.PI) * 0.03
          break
        case 'arrive':
          // reinforcements march in from the nearest edge of the table at a steady pace
          if (fx.unit === u.id) {
            const e = edgePoint(u.x, u.y, board.w, board.h, 2.2)
            const sx = tileX(e.x)
            const sz = tileZ(e.y)
            const ex = tileX(u.x)
            const ez = tileZ(u.y)
            const k = Math.min(1, p)
            x = sx + (ex - sx) * k
            z = sz + (ez - sz) * k
            const steps = Math.max(1, Math.hypot(ex - sx, ez - sz))
            hop = Math.abs(Math.sin(k * steps * Math.PI)) * 0.07
            const heading = Math.atan2(ex - sx, ez - sz)
            ang = k > 0.85 ? heading + angleDelta(heading, facingAngle(u.facing)) * ease((k - 0.85) / 0.15) : heading
          }
          break
        case 'leave':
          // a retreating or escaping unit walks off the table by the nearest edge and fades into the distance
          if (fx.unit === u.id) {
            const e = edgePoint(u.x, u.y, board.w, board.h, 2.2)
            const ex = tileX(e.x)
            const ez = tileZ(e.y)
            const k = Math.min(1, p)
            const dx = ex - x
            const dz = ez - z
            x += dx * k
            z += dz * k
            hop = Math.abs(Math.sin(k * Math.hypot(dx, dz) * Math.PI)) * 0.07
            if (Math.hypot(dx, dz) > 0.01) ang = Math.atan2(dx, dz)
            sc = k > 0.7 ? Math.max(0.05, 1 - ((k - 0.7) / 0.3) * 0.95) : 1
          }
          break
        case 'buff':
          if (fx.unit === u.id) glow = Math.sin(Math.min(1, p) * Math.PI) * 0.9
          break
        case 'provoke':
          if (fx.unit === u.id) {
            flash = 0.55 * (1 - p)
            hop = Math.sin(Math.min(1, p) * Math.PI * 3) * 0.05
          }
          break
        default:
          break
      }
    }
    const bob = Math.sin(t * 1.7 + phase) * 0.006
    g.position.set(x, y + hop + bob, z)
    s.rotation.y = ang
    g.rotation.x = -tilt
    g.scale.setScalar(sc)
    const lerpE = Math.max(flash, 0)
    if (bodyMat.current) bodyMat.current.emissive.setRGB(lerpE * 0.9 + glow * 0.05, glow * 0.45 + lerpE * 0.05, glow * 0.2)
    if (swirl.current) {
      swirl.current.visible = u.confused
      swirl.current.rotation.y = t * 3.2
    }
    if (fill.current) {
      fill.current.scale.x = Math.max(0.001, Math.min(1, frac))
    }
    if (fillMat.current) fillMat.current.color.set(frac < 0.3 ? COLORS.cinnabar : han ? '#4fa38f' : '#e8c250')
    if (ring.current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)
      ;(ring.current.material as MeshBasicMaterial).opacity = 0.35 + 0.5 * pulse
      ring.current.scale.setScalar(1 + 0.05 * pulse)
    }
  })

  return (
    <group ref={root} position={[tileX(u.x), top, tileZ(u.y)]}>
      <group ref={spin}>
        <mesh geometry={notchGeo} position={[0, 0.074, baseR - 0.12]} scale={[1.15, 1, 1.35]}>
          <meshBasicMaterial color={u.done ? '#8f8466' : '#f6e2a4'} side={DoubleSide} />
        </mesh>
        <mesh geometry={geos.body} castShadow receiveShadow>
          <meshStandardMaterial ref={bodyMat} vertexColors color={dimColor} side={DoubleSide} roughness={0.75} metalness={0.12} />
        </mesh>
      </group>

      {/* actable pulse and selection rings */}
      {actable && !selected && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.085, 0]}>
          <ringGeometry args={[baseR + 0.04, baseR + 0.1, 36]} />
          <meshBasicMaterial color={COLORS.lantern} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, 0]}>
          <ringGeometry args={[baseR + 0.04, baseR + 0.13, 40]} />
          <meshBasicMaterial color="#c9923c" />
        </mesh>
      )}
      {targeted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.095, 0]}>
          <ringGeometry args={[baseR + 0.03, baseR + 0.1, 36]} />
          <meshBasicMaterial color={COLORS.cinnabar} />
        </mesh>
      )}

      {/* confusion swirl */}
      <group ref={swirl} position={[0, 1.2 + rider, 0]} visible={u.confused}>
        <mesh geometry={swirlGeometry}>
          <meshBasicMaterial vertexColors />
        </mesh>
      </group>

      {/* troops brush bar, always facing the camera */}
      <Billboard position={[0, 1.34 + rider, 0]}>
        <group position={[-0.35, 0, 0]}>
          <mesh geometry={barBg} renderOrder={20}>
            <meshBasicMaterial color="#120d0a" transparent opacity={0.88} depthTest={false} />
          </mesh>
          <mesh ref={fill} geometry={barFillGeo} position={[0.04, 0.02, 0.001]} renderOrder={21}>
            <meshBasicMaterial ref={fillMat} color={faction} depthTest={false} transparent opacity={dim < 1 ? 0.7 : 1} />
          </mesh>
        </group>
      </Billboard>

      {/* pick volume: covers the whole figure so a click on the head or banner selects the unit */}
      <mesh
        position={[0, 0.6 + rider / 2, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation()
          onPick(u.x, u.y)
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          onHover(u.x, u.y)
        }}
        onPointerOut={onLeave}
      >
        <cylinderGeometry args={[0.36, 0.36, 1.3 + rider, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  )
}

export const Figure = memo(FigureImpl)
