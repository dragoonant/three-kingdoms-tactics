// The ground under the defenders (docs/spec/51 "The scene is built from the event"): millet, forest, hill slope, village,
// shallows, ship deck or plain sand. Each is a small hand-built set dressing on the table's sand that follows the board's
// terrain look (Terrain.tsx): combed millet ridges, dark conifers, a green mound, plastered houses, blue water, planked deck.
// Everything is static except the water ripples and the millet, which are functions of the clock.
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactElement } from 'react'
import { BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, RingGeometry, SphereGeometry } from 'three'
import type { GroundKind } from '../scenes/act'
import { rand, srand } from '../rng'
import type { FieldBox, Ignition } from '../fireModel'
import { Millet } from './Millet'
import { useFrameRef } from './Stage'

export interface GroundProps {
  kind: GroundKind
  seed: number
  center: readonly [number, number]
  halfW: number
  halfD: number
  /** Figures stand here: keep set dressing out of their way. */
  clear: { x: number; z: number; r: number }[]
  ignitions?: readonly Ignition[]
  wind?: [number, number]
  /** The millet field's exact box (scene A keeps its original); derived from the centre otherwise. */
  box?: FieldBox
  /** The near part of the camera's view (stage/lens.ts): no trees, houses, rocks or stalks there. Water ignores it. */
  lens?: { x: number; z: number; r: number }[]
  /** Millet: thinned, half-height stalks here (the action lane). */
  low?: { x: number; z: number; r: number }[]
}

const mats = {
  trunk: new MeshStandardMaterial({ color: '#5a3d26', roughness: 0.9 }),
  pine: [new MeshStandardMaterial({ color: '#2f5236', roughness: 0.85 }), new MeshStandardMaterial({ color: '#3c6840', roughness: 0.85 }), new MeshStandardMaterial({ color: '#27432d', roughness: 0.85 })],
  hill: new MeshStandardMaterial({ color: '#7b8a4c', roughness: 1 }),
  hillDark: new MeshStandardMaterial({ color: '#66743f', roughness: 1 }),
  rock: new MeshStandardMaterial({ color: '#8d867a', roughness: 0.95 }),
  wall: new MeshStandardMaterial({ color: '#c9b38a', roughness: 0.95 }),
  roof: new MeshStandardMaterial({ color: '#5a3b2a', roughness: 0.85 }),
  roofAlt: new MeshStandardMaterial({ color: '#6b4630', roughness: 0.85 }),
  door: new MeshStandardMaterial({ color: '#3a2519', roughness: 0.9 }),
  fence: new MeshStandardMaterial({ color: '#7a5a38', roughness: 0.9 }),
  water: new MeshStandardMaterial({ color: '#2f86b4', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.72, emissive: '#143a52', emissiveIntensity: 0.35 }),
  ripple: new MeshStandardMaterial({ color: '#d8f0f2', roughness: 0.4, transparent: true, opacity: 0.5, emissive: '#9ad0da', emissiveIntensity: 0.25 }),
  deck: new MeshStandardMaterial({ color: '#8e6a3e', roughness: 0.85 }),
  deckSeam: new MeshStandardMaterial({ color: '#4a3220', roughness: 0.95 }),
  rail: new MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.85 }),
  grass: [new MeshStandardMaterial({ color: '#7d8a4a', roughness: 1 }), new MeshStandardMaterial({ color: '#6c7a40', roughness: 1 })],
  pebble: new MeshStandardMaterial({ color: '#a39a86', roughness: 0.95 }),
}
const geo = {
  trunk: new CylinderGeometry(0.018, 0.026, 0.2, 6).translate(0, 0.1, 0),
  cone: new ConeGeometry(0.17, 0.4, 7).translate(0, 0.2, 0),
  tuft: new ConeGeometry(0.012, 0.075, 4).translate(0, 0.037, 0),
  rock: new DodecahedronGeometry(0.08, 0),
  box: new BoxGeometry(1, 1, 1),
  roof: new ConeGeometry(0.5, 0.34, 4).rotateY(Math.PI / 4).translate(0, 0.17, 0),
  mound: new SphereGeometry(1, 28, 14),
  ripple: new RingGeometry(0.9, 1, 28).rotateX(-Math.PI / 2),
  plane: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
}

const NO_DISCS: { x: number; z: number; r: number }[] = []

const free = (x: number, z: number, clear: GroundProps['clear'], pad = 0): boolean => clear.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + pad)

function scatter(seed: number, n: number, cx: number, cz: number, hw: number, hd: number, clear: GroundProps['clear'], pad: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    const x = cx + srand(seed, i, 1) * hw
    const z = cz + srand(seed, i, 2) * hd
    if (free(x, z, clear, pad)) out.push([x, z])
  }
  return out
}

function Tufts({ seed, cx, cz, hw, hd, clear, n = 46 }: { seed: number; cx: number; cz: number; hw: number; hd: number; clear: GroundProps['clear']; n?: number }) {
  const pts = useMemo(() => scatter(seed + 3, n, cx, cz, hw, hd, clear, 0.12), [seed, cx, cz, hw, hd, clear, n])
  return (
    <group>
      {pts.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, rand(seed, i, 4) * 6.28, 0]} scale={0.8 + rand(seed, i, 5) * 0.7}>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} geometry={geo.tuft} material={mats.grass[(i + k + 3) % 2]!} position={[k * 0.018, 0, 0]} rotation={[0, 0, k * 0.28]} />
          ))}
        </group>
      ))}
    </group>
  )
}

function Forest({ seed, center, halfW, halfD, clear }: GroundProps) {
  const trees = useMemo(() => {
    const pts: { x: number; z: number; h: number }[] = []
    // a thicket behind and to either side of the figures, a few between them
    const back = scatter(seed + 11, 15, center[0], center[1] + halfD * 0.9, halfW, halfD * 0.55, clear, 0.36)
    const sides = scatter(seed + 12, 8, center[0], center[1], halfW * 1.15, halfD * 1.1, clear.map((c) => ({ ...c, r: c.r + 0.18 })), 0.3).filter(([x]) => Math.abs(x - center[0]) > halfW * 0.5)
    const mid = scatter(seed + 13, 5, center[0], center[1], halfW * 0.6, halfD * 0.8, clear, 0.5)
    for (const [x, z] of [...back, ...sides, ...mid]) pts.push({ x, z, h: 0.8 + rand(seed, Math.round(x * 100), Math.round(z * 100)) * 0.7 })
    return pts
  }, [seed, center, halfW, halfD, clear])
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.h}>
          <mesh geometry={geo.trunk} material={mats.trunk} castShadow />
          {[0, 1, 2].map((k) => (
            <mesh key={k} geometry={geo.cone} material={mats.pine[(i + k) % 3]!} position={[0, 0.14 + k * 0.19, 0]} scale={1 - k * 0.24} castShadow receiveShadow />
          ))}
        </group>
      ))}
      <Tufts seed={seed} cx={center[0]} cz={center[1]} hw={halfW} hd={halfD} clear={clear} n={34} />
    </group>
  )
}

function Hill({ seed, center, halfW, halfD, clear }: GroundProps) {
  const rocks = useMemo(() => scatter(seed + 21, 12, center[0], center[1] + halfD * 0.6, halfW, halfD * 0.9, clear, 0.2), [seed, center, halfW, halfD, clear])
  return (
    <group>
      {/* the slope the line stands on rises behind it: a broad green mound with a darker shoulder */}
      <mesh geometry={geo.mound} material={mats.hill} position={[center[0], -0.1, center[1] + halfD + 1.7]} scale={[halfW * 1.25, 0.62, 2.1]} castShadow receiveShadow />
      <mesh geometry={geo.mound} material={mats.hillDark} position={[center[0] + halfW * 0.7, -0.1, center[1] + halfD + 0.9]} scale={[1.6, 0.38, 1.2]} castShadow receiveShadow />
      <mesh geometry={geo.mound} material={mats.hill} position={[center[0] - halfW * 0.8, -0.1, center[1] + halfD + 0.6]} scale={[1.3, 0.3, 1.0]} castShadow receiveShadow />
      {rocks.map(([x, z], i) => (
        <mesh key={i} geometry={geo.rock} material={mats.rock} position={[x, 0.03, z]} scale={[0.7 + rand(seed, i, 1), 0.5 + rand(seed, i, 2) * 0.5, 0.7 + rand(seed, i, 3)]} rotation={[rand(seed, i, 4), rand(seed, i, 5) * 6, 0]} castShadow />
      ))}
      <Tufts seed={seed} cx={center[0]} cz={center[1]} hw={halfW} hd={halfD} clear={clear} n={60} />
    </group>
  )
}

function Village({ seed, center, halfW, halfD, clear }: GroundProps) {
  const houses = useMemo(() => {
    const spots: [number, number, number, number][] = [
      [center[0] - halfW * 0.62, center[1] + halfD * 1.05, 0.62, 0.34],
      [center[0] + halfW * 0.05, center[1] + halfD * 1.35, 0.7, 0.4],
      [center[0] + halfW * 0.7, center[1] + halfD * 1.0, 0.56, 0.32],
      [center[0] - halfW * 1.0, center[1] - 0.1, 0.5, 0.3],
    ]
    return spots.filter(([x, z]) => free(x, z, clear, 0.45))
  }, [center, halfW, halfD, clear])
  const posts = useMemo(() => Array.from({ length: 9 }, (_, i) => [center[0] + halfW * 1.05 + 0.1, center[1] - halfD + i * 0.25] as [number, number]).filter(([x, z]) => free(x, z, clear, 0.2)), [center, halfW, halfD, clear])
  return (
    <group>
      {houses.map(([x, z, w, h], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, srand(seed, i, 1) * 0.25, 0]}>
          <mesh geometry={geo.box} material={mats.wall} position={[0, h / 2, 0]} scale={[w, h, w * 0.8]} castShadow receiveShadow />
          <mesh geometry={geo.roof} material={i % 2 ? mats.roofAlt : mats.roof} position={[0, h, 0]} scale={[w * 1.32, 1, w * 1.1]} castShadow />
          <mesh geometry={geo.box} material={mats.door} position={[0, 0.08, -w * 0.4 - 0.005]} scale={[0.12, 0.16, 0.012]} />
        </group>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} geometry={geo.box} material={mats.fence} position={[x, 0.07, z]} scale={[0.025, 0.14, 0.025]} castShadow />
      ))}
      <mesh geometry={geo.box} material={mats.fence} position={[center[0] + halfW * 1.05 + 0.1, 0.1, center[1]]} scale={[0.012, 0.02, halfD * 2]} />
      <Tufts seed={seed} cx={center[0]} cz={center[1]} hw={halfW} hd={halfD} clear={clear} n={20} />
    </group>
  )
}

function Shallows({ seed, center, halfW, halfD, clear }: GroundProps) {
  const frame = useFrameRef()
  const group = useRef<Group>(null)
  // ripples ring the front-rank figures wading in the water (their clearance discs, r 0.25-0.4): not the ranks, not the lens
  const ripples = useMemo(
    () =>
      clear
        .filter((c) => c.r >= 0.25 && c.r <= 0.4 && Math.abs(c.x - center[0]) < halfW * 1.3 && Math.abs(c.z - center[1]) < halfD * 1.3)
        .map((c, i) => ({ x: c.x, z: c.z, ph: rand(seed, i, 8) })),
    [clear, seed, center, halfW, halfD],
  )
  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = frame.current.t
    g.children.forEach((m, i) => {
      const r = ripples[i]
      if (!r || !(m instanceof Mesh)) return
      const u = (t * 0.55 + r.ph) % 1
      m.scale.setScalar(0.12 + u * 0.3)
      ;(m.material as MeshStandardMaterial).opacity = 0.55 * (1 - u)
    })
  })
  return (
    <group>
      <mesh geometry={geo.plane} material={mats.water} position={[center[0], 0.014, center[1]]} scale={[halfW * 2.6, 1, halfD * 2.6]} receiveShadow />
      <group ref={group}>
        {ripples.map((r, i) => (
          <mesh key={i} geometry={geo.ripple} material={mats.ripple.clone()} position={[r.x, 0.02, r.z]} />
        ))}
      </group>
    </group>
  )
}

function Deck({ center, halfW, halfD }: GroundProps) {
  const seams = Array.from({ length: Math.ceil((halfD * 2.7) / 0.3) }, (_, i) => center[1] - halfD * 1.35 + i * 0.3)
  return (
    <group>
      <mesh geometry={geo.box} material={mats.deck} position={[center[0], 0.018, center[1]]} scale={[halfW * 2.7, 0.036, halfD * 2.7]} receiveShadow castShadow />
      {seams.map((z, i) => (
        <mesh key={i} geometry={geo.box} material={mats.deckSeam} position={[center[0], 0.037, z]} scale={[halfW * 2.7, 0.003, 0.008]} />
      ))}
      <mesh geometry={geo.box} material={mats.rail} position={[center[0], 0.08, center[1] + halfD * 1.35]} scale={[halfW * 2.7, 0.1, 0.05]} castShadow />
      <mesh geometry={geo.box} material={mats.rail} position={[center[0] - halfW * 1.35, 0.08, center[1]]} scale={[0.05, 0.1, halfD * 2.7]} castShadow />
      <mesh geometry={geo.box} material={mats.rail} position={[center[0] + halfW * 1.35, 0.08, center[1]]} scale={[0.05, 0.1, halfD * 2.7]} castShadow />
      <mesh geometry={new CylinderGeometry(0.05, 0.06, 1.1, 8)} material={mats.rail} position={[center[0] + halfW * 0.9, 0.55, center[1] + halfD * 1.1]} castShadow />
    </group>
  )
}

function Plain({ seed, center, halfW, halfD, clear }: GroundProps) {
  const pebbles = useMemo(() => scatter(seed + 31, 18, center[0], center[1], halfW * 1.2, halfD * 1.2, clear, 0.1), [seed, center, halfW, halfD, clear])
  return (
    <group>
      {pebbles.map(([x, z], i) => (
        <mesh key={i} geometry={geo.rock} material={mats.pebble} position={[x, 0.01, z]} scale={0.35 + rand(seed, i, 3) * 0.4} rotation={[0, rand(seed, i, 4) * 6, 0]} />
      ))}
      <Tufts seed={seed} cx={center[0]} cz={center[1]} hw={halfW * 1.2} hd={halfD * 1.2} clear={clear} n={26} />
    </group>
  )
}

export function Ground(given: GroundProps): ReactElement {
  const { clear, lens } = given
  const merged = useMemo(() => (lens && lens.length ? [...clear, ...lens] : clear), [clear, lens])
  const props = given.kind === 'shallows' ? given : { ...given, clear: merged }
  switch (props.kind) {
    case 'millet':
      return (
        <Millet
          box={props.box ?? { x0: props.center[0] - props.halfW * 1.3, x1: props.center[0] + props.halfW * 1.3, z0: props.center[1] - props.halfD, z1: props.center[1] + props.halfD * 1.2 }}
          seed={props.seed}
          ignitions={props.ignitions ?? []}
          clear={props.clear}
          low={props.low ?? NO_DISCS}
          wind={props.wind ?? [1, 0]}
        />
      )
    case 'forest':
      return <Forest {...props} />
    case 'hill':
      return <Hill {...props} />
    case 'village':
      return <Village {...props} />
    case 'shallows':
      return <Shallows {...props} />
    case 'deck':
      return <Deck {...props} />
    default:
      return <Plain {...props} />
  }
}
