// Every unit on the board is a figure rig (docs/spec/31-hero-figures.md): heroes get their own design, named officers the
// officer kit, everyone else a troop rig by troop type and side. The figures have no base: they stand on the sand, and the
// jobs the base used to do (side colour, facing, "you can act", selected, targetable, done) are painted on the sand as a flat
// ring decal under the figure (docs/spec/50-presentation.md). Moves are locomotion: the legs run on the distance covered along
// the engine's path, the figure turns on the spot with small steps and swings through the corners, and arrives into idle.
import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DoubleSide,
  Mesh as ThreeMesh,
  Shape,
  ShapeGeometry,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from 'three'
import { applyClip, drawBow, fallBack, idle, locomotion, stepTurn, thrust, type Clip } from '../figures/clips'
import { buildHeroRig, isHeroId } from '../figures/heroes'
import { buildOfficer, hasOfficerStyle } from '../figures/officerKit'
import type { Rig, SidePalette, TroopKind } from '../figures/rig'
import { buildTroopRig } from '../figures/troops'
import { anim, animProgress } from '../presentation/director'
import type { UnitVis } from '../presentation/scene'
import { swirlGeometry } from './figureGeometry'
import { edgePoint } from './frame'
import { angleDelta, board, COLORS, facingAngle, sideColour, sideToken, tileX, tileZ } from './layout'
import { pathLength, samplePath, trapezoid, movePhases, type PathPoint } from './travel'

const ease = (t: number): number => t * t * (3 - 2 * t)

/** Every distinct standard material of a rig (the rig owns them, so the board may tint them per unit). */
function rigMaterials(rig: Rig): MeshStandardMaterial[] {
  const set = new Set<MeshStandardMaterial>()
  rig.group.traverse((o) => {
    if (!(o instanceof ThreeMesh)) return
    const m = o.material as Material | Material[]
    for (const mm of Array.isArray(m) ? m : [m]) set.add(mm as MeshStandardMaterial)
  })
  return [...set]
}
const tint = new Color()

const PALETTES = new Set(['han', 'yellow', 'cao', 'dong', 'lu'])
function hashOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The rig for a unit: a hero design, the officer kit for any other named officer, otherwise a troop of its type and side. */
export function buildUnitRig(u: Pick<UnitVis, 'id' | 'officer' | 'side' | 'type'>): Rig {
  const token = sideToken(u.side)
  const pal: SidePalette = PALETTES.has(token) ? (token as SidePalette) : 'han'
  const cav = u.type === 'cavalry'
  const kind: TroopKind = u.type === 'archers' ? 'archer' : cav ? 'cavalry' : pal === 'yellow' ? 'rebel' : 'infantry'
  if (isHeroId(u.officer)) return buildHeroRig(u.officer, { mounted: cav, own: true })!
  if (hasOfficerStyle(u.officer)) return buildOfficer(u.officer, { type: kind, side: pal, mounted: cav, own: true })
  return buildTroopRig(kind, pal, hashOf(u.id) % 3, true)
}

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

/** Decal layers sit a hair above the sand so they never z-fight with it. */
const DECAL = { disc: 0.012, rim: 0.016, notch: 0.02, actable: 0.024, selected: 0.028, target: 0.032 }
const polygon = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const

function FigureImpl({ unit: u, top, tops, actable, selected, targeted, onPick, onHover, onLeave }: Props) {
  const root = useRef<Group>(null)
  const spin = useRef<Group>(null)
  const swirl = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const fill = useRef<Mesh>(null)
  const fillMat = useRef<MeshBasicMaterial>(null)
  const rimMat = useRef<MeshBasicMaterial>(null)
  const notchMat = useRef<MeshBasicMaterial>(null)
  const lastTint = useRef('')
  const han = u.side === 'han'
  const cav = u.type === 'cavalry'
  const dim = u.done ? 0.55 : 1
  const faction = han ? COLORS.han : sideColour(u.side)
  const phase = useMemo(() => (u.id.length * 1.37) % 6, [u.id])
  const stride0 = useMemo(() => (hashOf(u.id) % 100) / 100, [u.id])

  const rig = useMemo(() => buildUnitRig(u), [u.id, u.officer, u.side, u.type]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => rig.dispose(), [rig])
  const mats = useMemo(() => rigMaterials(rig), [rig])
  const rider = cav ? 0.34 : 0
  const R = rig.footprint ?? (cav ? 0.44 : 0.35)
  const rimColor = useMemo(() => new Color(faction).multiplyScalar(dim), [faction, dim])

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
    let clip: Clip | null = null
    let attack: 'thrust' | 'bow' | null = null
    /** Run the legs: `d` distance covered (tiles), `v` speed (tiles per second). */
    const bs = rig.bodyScale ?? 1
    const go = (d: number, v: number): Clip => locomotion(rig, d / bs + stride0 * 3, v / bs, t * 0.8 + phase)
    if (fx) {
      switch (fx.t) {
        case 'move':
          if (fx.unit === u.id) {
            const pts: PathPoint[] = fx.path.map((q) => ({ x: tileX(q.x), z: tileZ(q.y), y: tops(q.x, q.y) }))
            const L = pathLength(pts)
            const sec = Math.max(0.001, anim.ms / 1000)
            const a0 = pts[0]!
            const aN = pts[pts.length - 1]!
            if (fx.dash) {
              // the Charge dash: a short gallop straight to the tile
              const { q, dq } = trapezoid(p, 0.2, 0.25)
              const sm = samplePath(pts, L * q)
              x = a0.x + (aN.x - a0.x) * q
              z = a0.z + (aN.z - a0.z) * q
              y = a0.y + (aN.y - a0.y) * q
              if (L > 0.01) ang = Math.atan2(aN.x - a0.x, aN.z - a0.z)
              clip = go(L * q, (L * dq) / sec)
              void sm
            } else if (fx.undo || L < 0.001) {
              x = a0.x + (aN.x - a0.x) * ease(p)
              z = a0.z + (aN.z - a0.z) * ease(p)
              y = a0.y + (aN.y - a0.y) * ease(p)
              clip = go(L * ease(p), (L * 6 * p * (1 - p)) / sec)
            } else {
              const { tin, tout } = movePhases(fx.turnIn, fx.turnOut, anim.ms)
              const start = samplePath(pts, 0)
              const end = samplePath(pts, L)
              if (p < tin) {
                // turn on the spot before setting off: small steps
                const k = ease(p / tin)
                ang = facingAngle(u.facing) + fx.turnIn * k
                x = a0.x
                z = a0.z
                y = a0.y
                clip = stepTurn(fx.turnIn * k)
              } else if (p > 1 - tout) {
                const k = ease((p - (1 - tout)) / tout)
                ang = end.heading + fx.turnOut * k
                x = aN.x
                z = aN.z
                y = aN.y
                clip = stepTurn(fx.turnOut * k)
              } else {
                const pp = (p - tin) / Math.max(1e-6, 1 - tin - tout)
                const { q, dq } = trapezoid(pp)
                const d = L * q
                const sm = samplePath(pts, d)
                x = sm.x
                z = sm.z
                y = sm.y
                // ease the heading from the pre-move facing to the path's, over the first stretch when there was no on-the-spot turn
                ang = tin > 0 ? sm.heading : sm.heading + angleDelta(sm.heading, facingAngle(u.facing)) * (1 - ease(Math.min(1, d / 0.3)))
                if (tout === 0) ang = ang + angleDelta(ang, facingAngle(fx.facingTo)) * ease(Math.min(1, Math.max(0, (d - (L - 0.3)) / 0.3)))
                void start
                clip = go(d, (L * dq) / (sec * Math.max(1e-6, 1 - tin - tout)))
              }
            }
          }
          break
        case 'turn':
          if (fx.unit === u.id) {
            const k = ease(p)
            const a = angleDelta(facingAngle(fx.from), facingAngle(fx.to))
            ang = facingAngle(fx.from) + a * k
            clip = stepTurn(a * k)
          }
          break
        case 'lunge':
          if (fx.unit === u.id) {
            const dx = tileX(fx.toward.x) - x
            const dz = tileZ(fx.toward.y) - z
            const len = Math.hypot(dx, dz) || 1
            const off = Math.sin(Math.min(1, p) * Math.PI) * 0.4
            x += (dx / len) * off
            z += (dz / len) * off
            ang = Math.atan2(dx, dz)
            attack = u.type === 'archers' ? 'bow' : cav ? null : 'thrust'
            if (!attack) hop = Math.sin(Math.min(1, p) * Math.PI) * 0.06
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
            // a foot soldier falls and lies flat; a rider tips over; then the figure shrinks away
            if (rig.mount) {
              tilt = ease(p) * 1.45
              y -= p * 0.12
            } else clip = fallBack(ease(p))
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
            const total = Math.hypot(ex - sx, ez - sz)
            const heading = Math.atan2(ex - sx, ez - sz)
            ang = k > 0.85 ? heading + angleDelta(heading, facingAngle(u.facing)) * ease((k - 0.85) / 0.15) : heading
            clip = go(total * k, k < 1 ? total / Math.max(0.001, anim.ms / 1000) : 0)
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
            const total = Math.hypot(dx, dz)
            x += dx * k
            z += dz * k
            if (total > 0.01) ang = Math.atan2(dx, dz)
            sc = k > 0.7 ? Math.max(0.05, 1 - ((k - 0.7) / 0.3) * 0.95) : 1
            clip = go(total * k, total / Math.max(0.001, anim.ms / 1000))
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
    // a unit that is not travelling breathes (the cut-in rest pose); a swing or a draw plays on top of it
    if (!clip) {
      const base = idle(t * 0.8 + phase)
      if (attack === 'thrust') clip = thrust(Math.min(1, Math.sin(Math.min(1, p) * Math.PI) * 0.7))
      else if (attack === 'bow') clip = drawBow(Math.min(1, Math.sin(Math.min(1, p) * Math.PI) * 1.2))
      else clip = base
    }
    applyClip(rig, clip)
    g.position.set(x, y + hop, z)
    s.rotation.y = ang
    g.rotation.x = -tilt
    g.scale.setScalar(sc)
    // done units dim, hits flash, stratagems glow: the rig's own materials are tinted (only when the values change)
    const lerpE = Math.max(flash, 0)
    const key = `${dim}|${lerpE.toFixed(3)}|${glow.toFixed(3)}`
    if (key !== lastTint.current) {
      lastTint.current = key
      tint.setRGB(lerpE * 0.9 + glow * 0.05, glow * 0.45 + lerpE * 0.05, glow * 0.2)
      for (const m of mats) {
        const ud = m.userData as { c?: Color; e?: Color }
        const c0 = (ud.c ??= m.color.clone())
        const e0 = (ud.e ??= m.emissive.clone())
        m.color.copy(c0).multiplyScalar(dim)
        m.emissive.copy(e0).add(tint)
      }
    }
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
        <primitive object={rig.group} />
        {/* back banner in the side colour, so allegiance reads from far away */}
        <group position={[0, 0, -(R - 0.1)]}>
          <mesh position={[0, (1.25 + rider) / 2, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 1.25 + rider, 6]} />
            <meshStandardMaterial color="#6b4a2a" roughness={0.8} />
          </mesh>
          <mesh position={[0.15, 1.1 + rider, 0.004]}>
            <planeGeometry args={[0.3, 0.38]} />
            <meshStandardMaterial color={faction} side={DoubleSide} roughness={0.8} />
          </mesh>
          <mesh position={[0.15, 1.1 + rider, 0.008]}>
            <planeGeometry args={[0.05, 0.26]} />
            <meshStandardMaterial color={han ? '#e9dfc2' : '#2a1d10'} side={DoubleSide} roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* the ground ring: a flat painted decal on the sand (side-colour rim, a facing notch, then the interaction states) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DECAL.disc, 0]} renderOrder={1}>
        <circleGeometry args={[R - 0.02, 40]} />
        <meshBasicMaterial color="#17110c" transparent opacity={0.2} depthWrite={false} {...polygon} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DECAL.rim, 0]} renderOrder={2}>
        <ringGeometry args={[R - 0.055, R, 48]} />
        <meshBasicMaterial ref={rimMat} color={rimColor} depthWrite={false} {...polygon} />
      </mesh>
      <FacingNotch spinRef={spin} R={R} done={u.done} notchMat={notchMat} />

      {/* actable pulse and selection rings, painted on the sand */}
      {actable && !selected && (
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, DECAL.actable, 0]} renderOrder={3}>
          <ringGeometry args={[R + 0.04, R + 0.1, 36]} />
          <meshBasicMaterial color={COLORS.lantern} transparent opacity={0.6} depthWrite={false} {...polygon} />
        </mesh>
      )}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DECAL.selected, 0]} renderOrder={4}>
          <ringGeometry args={[R + 0.04, R + 0.13, 40]} />
          <meshBasicMaterial color="#c9923c" depthWrite={false} {...polygon} />
        </mesh>
      )}
      {targeted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DECAL.target, 0]} renderOrder={5}>
          <ringGeometry args={[R + 0.03, R + 0.1, 36]} />
          <meshBasicMaterial color={COLORS.cinnabar} depthWrite={false} {...polygon} />
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

/** The facing notch: a cream wedge on the ring that turns with the figure. */
function FacingNotch({ spinRef, R, done, notchMat }: { spinRef: React.RefObject<Group | null>; R: number; done: boolean; notchMat: React.RefObject<MeshBasicMaterial | null> }) {
  const g = useRef<Group>(null)
  useFrame(() => {
    if (g.current && spinRef.current) g.current.rotation.y = spinRef.current.rotation.y
  })
  return (
    <group ref={g}>
      <mesh geometry={notchGeo} position={[0, DECAL.notch, R - 0.17]} scale={[1.15, 1, 1.35]} renderOrder={3}>
        <meshBasicMaterial ref={notchMat} color={done ? '#8f8466' : '#f6e2a4'} side={DoubleSide} depthWrite={false} {...polygon} />
      </mesh>
    </group>
  )
}

export const Figure = memo(FigureImpl)
