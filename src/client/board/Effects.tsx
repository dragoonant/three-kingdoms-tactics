// Marks drawn on the sand, flames and smoke, the wind pennant, incense, and one-shot beat effects.
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Shape,
  ShapeGeometry,
  type Group,
  type Mesh,
} from 'three'
import type { Facing, Pos, Wind } from '../../engine'
import type { Floater } from '../store/game'
import type { Beat } from '../presentation/beats'
import { anim, animProgress } from '../presentation/director'
import { COLORS, tileX, tileZ } from './layout'
import { puffTexture } from './textures'

export type MarkKind = 'move' | 'target' | 'area' | 'chain' | 'fire' | 'hover' | 'dash'
export interface Mark extends Pos {
  kind: MarkKind
}

const MARK_COLOR: Record<MarkKind, string> = {
  move: COLORS.lantern,
  target: COLORS.cinnabar,
  area: '#e0503f',
  chain: '#e8c070',
  fire: '#ff7a2a',
  hover: '#fff1cf',
  dash: COLORS.lantern,
}
const FILL: Record<MarkKind, number> = { move: 0.26, target: 0.16, area: 0.38, chain: 0.28, fire: 0.38, hover: 0.1, dash: 0.3 }

function frameShape(outer: number, inner: number): Shape {
  const o = outer / 2
  const i = inner / 2
  const s = new Shape()
  s.moveTo(-o, -o)
  s.lineTo(o, -o)
  s.lineTo(o, o)
  s.lineTo(-o, o)
  s.closePath()
  const h = new Shape()
  h.moveTo(-i, -i)
  h.lineTo(-i, i)
  h.lineTo(i, i)
  h.lineTo(i, -i)
  h.closePath()
  s.holes.push(h)
  return s
}
const frameGeo = new ShapeGeometry(frameShape(0.96, 0.88)).rotateX(-Math.PI / 2)
const fillGeo = new PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2)

export function Marks({ marks, tops }: { marks: Mark[]; tops: (x: number, y: number) => number }) {
  const mats = useMemo(() => {
    const m = {} as Record<MarkKind, { frame: MeshBasicMaterial; fill: MeshBasicMaterial }>
    ;(Object.keys(MARK_COLOR) as MarkKind[]).forEach((k) => {
      m[k] = {
        frame: new MeshBasicMaterial({ color: MARK_COLOR[k], transparent: true, opacity: 0.95, depthWrite: false, side: DoubleSide }),
        fill: new MeshBasicMaterial({ color: MARK_COLOR[k], transparent: true, opacity: FILL[k], depthWrite: false, side: DoubleSide }),
      }
    })
    return m
  }, [])
  useFrame((s) => {
    const pulse = 0.5 + 0.5 * Math.sin(s.clock.elapsedTime * 3)
    mats.target.fill.opacity = 0.1 + 0.14 * pulse
    mats.move.fill.opacity = 0.2 + 0.12 * pulse
    mats.fire.fill.opacity = 0.26 + 0.16 * pulse
  })
  return (
    <group>
      {marks.map((m, i) => (
        <group key={`${m.kind}-${m.x}-${m.y}-${i}`} position={[tileX(m.x), tops(m.x, m.y) + 0.03, tileZ(m.y)]}>
          <mesh geometry={fillGeo} material={mats[m.kind].fill} renderOrder={3} raycast={() => null} />
          <mesh geometry={frameGeo} material={mats[m.kind].frame} position={[0, 0.002, 0]} renderOrder={4} raycast={() => null} />
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------- smoke

let puff: ReturnType<typeof puffTexture> | null = null
const getPuff = () => (puff ??= puffTexture())

export function Smoke({
  emitters,
  drift,
  color,
  size,
  rise,
  per,
  opacity,
}: {
  emitters: [number, number, number][]
  drift: [number, number]
  color: string
  size: number
  rise: number
  per: number
  opacity: number
}) {
  const count = Math.max(1, emitters.length * per)
  const ref = useRef<Points>(null)
  const geo = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    return g
  }, [count])
  const mat = useMemo(
    () => new PointsMaterial({ map: getPuff(), color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true }),
    [color, size, opacity],
  )
  useFrame((s) => {
    const pos = geo.getAttribute('position') as BufferAttribute
    const t = s.clock.elapsedTime
    for (let e = 0; e < emitters.length; e++) {
      const [ex, ey, ez] = emitters[e]!
      for (let k = 0; k < per; k++) {
        const i = e * per + k
        const age = (t * 0.35 + k / per + e * 0.137) % 1
        pos.setXYZ(i, ex + drift[0] * age * 1.6 + Math.sin(t + i) * 0.04, ey + age * rise, ez + drift[1] * age * 1.6 + Math.cos(t * 0.8 + i) * 0.04)
      }
    }
    pos.needsUpdate = true
  })
  if (emitters.length === 0) return null
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />
}

// ---------------------------------------------------------------- flames

const flameGeo = new ConeGeometry(0.13, 0.5, 6)
const glowGeo = new PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2)
const tmp = new Object3D()

export function Flames({ tiles, tops }: { tiles: Pos[]; tops: (x: number, y: number) => number }) {
  const n = tiles.length * 3
  const ref = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)
  const mat = useMemo(() => new MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.92, blending: AdditiveBlending, depthWrite: false }), [])
  const gmat = useMemo(() => new MeshBasicMaterial({ color: '#ff5a1a', transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }), [])
  useFrame((s) => {
    const m = ref.current
    const g = glow.current
    if (!m || !g) return
    const t = s.clock.elapsedTime
    tiles.forEach((p, i) => {
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k
        const f = 0.75 + 0.35 * Math.sin(t * (6 + k * 1.7) + j * 2.1) + 0.15 * Math.sin(t * 13 + j)
        const ox = (k - 1) * 0.3 + Math.sin(t * 2 + j) * 0.03
        const oz = ((k * 7) % 3) * 0.28 - 0.28
        tmp.position.set(tileX(p.x) + ox, tops(p.x, p.y) + 0.19 * f + 0.02, tileZ(p.y) + oz)
        tmp.scale.set(0.8 + 0.3 * Math.sin(t * 9 + j), f, 0.8 + 0.3 * Math.cos(t * 8 + j))
        tmp.rotation.set(0, t + j, 0)
        tmp.updateMatrix()
        m.setMatrixAt(j, tmp.matrix)
      }
      tmp.position.set(tileX(p.x), tops(p.x, p.y) + 0.04, tileZ(p.y))
      tmp.scale.set(1, 1, 1)
      tmp.rotation.set(0, 0, 0)
      tmp.updateMatrix()
      g.setMatrixAt(i, tmp.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    g.instanceMatrix.needsUpdate = true
  })
  if (n === 0) return null
  return (
    <group>
      <instancedMesh key={`f${n}`} ref={ref} args={[flameGeo, mat, n]} frustumCulled={false} raycast={() => null} />
      <instancedMesh key={`g${tiles.length}`} ref={glow} args={[glowGeo, gmat, tiles.length]} frustumCulled={false} raycast={() => null} />
    </group>
  )
}

// ---------------------------------------------------------------- wind pennant and incense

const WIND_VEC: Record<Facing, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }
export function windVector(w: Wind): [number, number] {
  if (!w.dir || w.strength === 'calm') return [0.05, -0.02]
  const v = WIND_VEC[w.dir]
  const k = w.strength === 'gale' ? 1.6 : 0.9
  return [v[0] * k, v[1] * k]
}

const flagGeo = (() => {
  const g = new PlaneGeometry(1, 0.46, 10, 2)
  return g
})()

export function Pennant({ wind, position }: { wind: Wind; position: [number, number, number] }) {
  const flag = useRef<Mesh>(null)
  const grp = useRef<Group>(null)
  const geo = useMemo(() => flagGeo.clone(), [])
  const base = useMemo(() => Float32Array.from(geo.getAttribute('position').array as Float32Array), [geo])
  const dirAngle = useRef(0)
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const calm = !wind.dir || wind.strength === 'calm'
    const target = wind.dir ? Math.atan2(WIND_VEC[wind.dir][0], WIND_VEC[wind.dir][1]) : dirAngle.current
    // swing round to the new heading
    let d = target - dirAngle.current
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    dirAngle.current += d * Math.min(1, dt * 2.5)
    if (grp.current) grp.current.rotation.y = dirAngle.current - Math.PI / 2
    const pos = geo.getAttribute('position') as BufferAttribute
    const amp = calm ? 0.01 : wind.strength === 'gale' ? 0.11 : 0.06
    const speed = calm ? 1 : wind.strength === 'gale' ? 9 : 5
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]! + 0.5
      const y = base[i * 3 + 1]!
      const zz = Math.sin(x * 6 - t * speed) * amp * x
      pos.setXYZ(i, base[i * 3]!, calm ? y - x * 0.42 * (1 - x * 0.2) : y * (1 - x * 0.75), zz)
    }
    pos.needsUpdate = true
    void flag
  })
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.04, 2.4, 8]} />
        <meshStandardMaterial color={COLORS.bronze} metalness={0.75} roughness={0.35} />
      </mesh>
      <mesh position={[0, 2.42, 0]}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color={COLORS.bronze} metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.12, 10]} />
        <meshStandardMaterial color={COLORS.bronze} metalness={0.6} roughness={0.4} />
      </mesh>
      <group ref={grp} position={[0, 2.1, 0]}>
        <mesh ref={flag} geometry={geo} position={[0.5, 0, 0]} castShadow>
          <meshStandardMaterial color="#b9362c" side={DoubleSide} roughness={0.8} emissive="#3a0905" />
        </mesh>
      </group>
    </group>
  )
}

export function Incense({ position, wind }: { position: [number, number, number]; wind: Wind }) {
  const v = windVector(wind)
  const emit: [number, number, number][] = [[position[0], position[1] + 0.34, position[2]]]
  return (
    <group>
      <group position={position}>
        <mesh position={[0, 0.14, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.13, 0.24, 12]} />
          <meshStandardMaterial color={COLORS.bronze} metalness={0.7} roughness={0.35} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos(i * 2.1) * 0.15, 0.03, Math.sin(i * 2.1) * 0.15]}>
            <cylinderGeometry args={[0.02, 0.02, 0.1, 5]} />
            <meshStandardMaterial color={COLORS.bronze} metalness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 0.27, 0]}>
          <sphereGeometry args={[0.03, 6, 5]} />
          <meshBasicMaterial color="#ff6a2a" />
        </mesh>
      </group>
      <Smoke emitters={emit} drift={[v[0], v[1]]} color="#d8cdbb" size={0.7} rise={2.4} per={14} opacity={0.22} />
    </group>
  )
}

// ---------------------------------------------------------------- one-shot beat effects

const burstGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

export function BeatFx({ beat, tops }: { beat: Beat | null; tops: (x: number, y: number) => number }) {
  const area = useRef<Group>(null)
  const burst = useRef<Mesh>(null)
  const burstMat = useMemo(() => new MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }), [])
  const areaMat = useMemo(() => new MeshBasicMaterial({ color: COLORS.cinnabar, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }), [])
  useFrame(() => {
    const b = anim.beat
    const p = animProgress()
    const f = b?.fx
    if (burst.current) {
      let show = false
      if (f && (f.t === 'ignite' || f.t === 'spread')) {
        show = true
        const at = f.at
        burst.current.position.set(tileX(at.x), tops(at.x, at.y) + 0.06, tileZ(at.y))
        const s = 0.4 + p * 1.5
        burst.current.scale.set(s, 1, s)
        burstMat.opacity = (1 - p) * 0.85
      }
      burst.current.visible = show
    }
    if (area.current) {
      area.current.visible = !!f && f.t === 'stratagem'
      areaMat.opacity = f && f.t === 'stratagem' ? Math.sin(Math.min(1, p) * Math.PI) * 0.55 : 0
    }
  })
  const tiles: Pos[] = beat && beat.fx.t === 'stratagem' ? beat.fx.tiles : []
  return (
    <group>
      <mesh ref={burst} geometry={burstGeo} material={burstMat} visible={false} raycast={() => null} />
      <group ref={area} visible={false}>
        {tiles.map((t, i) => (
          <mesh key={`${t.x}-${t.y}-${i}`} geometry={burstGeo} material={areaMat} position={[tileX(t.x), tops(t.x, t.y) + 0.05, tileZ(t.y)]} scale={[0.96, 1, 0.96]} raycast={() => null} />
        ))}
      </group>
    </group>
  )
}

// ---------------------------------------------------------------- floating numbers

export function Floaters({ items, tops }: { items: Floater[]; tops: (x: number, y: number) => number }) {
  return (
    <>
      {items.map((f) => (
        <Html key={f.id} position={[tileX(f.x), tops(f.x, f.y) + 1.5, tileZ(f.y)]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
          <div className={`floater tone-${f.tone}`}>{f.text}</div>
        </Html>
      ))}
    </>
  )
}

export function useBurnTiles(burning: boolean[], width: number): Pos[] {
  return useMemo(() => {
    const out: Pos[] = []
    burning.forEach((b, i) => {
      if (b) out.push({ x: i % width, y: Math.floor(i / width) })
    })
    return out
  }, [burning, width])
}

