// The command tent around the sand table: frame, table, cloth walls, lanterns and their light.
// Everything static is merged into a few meshes (software renderers pay per draw call).
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, DoubleSide, PlaneGeometry, type Group, type PointLight } from 'three'
import { Builder } from './figureGeometry'
import { BOARD_H, BOARD_W, COLORS } from './layout'

// Lanterns hang over the table corners; their light sits just under the paper.
const LANTERNS: [number, number, number][] = [
  [-8.2, 4.1, -6.4],
  [8.2, 4.1, -6.4],
  [-8.2, 4.1, 7.0],
  [8.2, 4.1, 7.0],
]
// The visible paper lanterns hang further out and higher so they frame the view instead of blocking it.
const LANTERN_MESH: [number, number, number][] = [
  [-10.5, 6.2, -8.0],
  [10.5, 6.2, -8.0],
  [-10.5, 6.2, 8.6],
  [10.5, 6.2, 8.6],
]

const box = new BoxGeometry(1, 1, 1)
const cyl = new CylinderGeometry(1, 1, 1, 10)
const plane = new PlaneGeometry(1, 1)

function Lights() {
  const refs = useRef<(PointLight | null)[]>([])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    refs.current.forEach((l, i) => {
      if (l) l.intensity = 48 * (1 + 0.07 * Math.sin(t * 7.3 + i * 1.7) + 0.04 * Math.sin(t * 13.1 + i))
    })
  })
  return (
    <>
      {LANTERNS.map((p, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            refs.current[i] = l
          }}
          position={[p[0], p[1] - 0.5, p[2]]}
          color="#ffb360"
          intensity={48}
          distance={40}
          decay={1.8}
        />
      ))}
    </>
  )
}

export function Stage() {
  const sway = useRef<Group>(null)
  const geos = useMemo(() => {
    const solid = new Builder()
    const fw = BOARD_W + 1.1
    solid.add(box, '#1b110d', [0, -0.62, 0], [0, 0, 0], [60, 0.2, 60])
    solid.add(box, '#2a1a12', [0, -0.34, 0], [0, 0, 0], [BOARD_W + 5, 0.5, BOARD_H + 5])
    const frame: [number[], number[]][] = [
      [[0, -0.05, -(BOARD_H / 2 + 0.26)], [fw, 0.42, 0.5]],
      [[0, -0.05, BOARD_H / 2 + 0.26], [fw, 0.42, 0.5]],
      [[-(BOARD_W / 2 + 0.26), -0.05, 0], [0.5, 0.42, BOARD_H]],
      [[BOARD_W / 2 + 0.26, -0.05, 0], [0.5, 0.42, BOARD_H]],
    ]
    for (const [p, s] of frame) solid.add(box, COLORS.lacquer, p as [number, number, number], [0, 0, 0], s as [number, number, number])
    solid.add(box, COLORS.bronze, [0, 0.166, -(BOARD_H / 2 + 0.03)], [0, 0, 0], [BOARD_W + 0.1, 0.01, 0.03])
    solid.add(box, COLORS.bronze, [0, 0.166, BOARD_H / 2 + 0.03], [0, 0, 0], [BOARD_W + 0.1, 0.01, 0.03])
    solid.add(box, COLORS.bronze, [-(BOARD_W / 2 + 0.03), 0.166, 0], [0, 0, 0], [0.03, 0.01, BOARD_H])
    solid.add(box, COLORS.bronze, [BOARD_W / 2 + 0.03, 0.166, 0], [0, 0, 0], [0.03, 0.01, BOARD_H])
    for (const [x, z] of [[-11, -9], [11, -9], [-11, 9.5], [11, 9.5]] as const) solid.add(cyl, '#1c120d', [x, 4, z], [0, 0, 0], [0.16, 9, 0.16])
    for (const p of LANTERN_MESH) {
      solid.add(cyl, '#1a1210', [p[0], p[1] + 1.6, p[2]], [0, 0, 0], [0.012, 3.2, 0.012])
      solid.add(cyl, COLORS.bronze, [p[0], p[1] + 0.3, p[2]], [0, 0, 0], [0.24, 0.06, 0.24])
      solid.add(cyl, COLORS.bronze, [p[0], p[1] - 0.3, p[2]], [0, 0, 0], [0.2, 0.06, 0.2])
    }
    const glow = new Builder()
    for (const p of LANTERN_MESH) glow.add(cyl, '#ffb457', [p[0], p[1], p[2]], [0, 0, 0], [0.28, 0.55, 0.28])
    const drapes = new Builder()
    const n = 14
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      drapes.add(plane, i % 2 ? '#3a1a14' : '#2c1511', [Math.sin(a) * 17, 4.5, Math.cos(a) * 17], [0, a + Math.PI, 0], [8, 9, 1])
    }
    return { solid: solid.build(), glow: glow.build(), drapes: drapes.build() }
  }, [])
  useFrame((s) => {
    if (sway.current) sway.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.35) * 0.012
  })
  return (
    <group>
      <mesh geometry={geos.solid} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.7} metalness={0.15} />
      </mesh>
      <mesh geometry={geos.glow}>
        <meshStandardMaterial vertexColors emissive="#e8741c" emissiveIntensity={1.3} roughness={0.9} />
      </mesh>
      <group ref={sway}>
        <mesh geometry={geos.drapes}>
          <meshLambertMaterial vertexColors side={DoubleSide} />
        </mesh>
      </group>
      <Lights />
      <ambientLight color="#5a4868" intensity={0.22} />
      <hemisphereLight args={['#7a6078', '#2a1a10', 0.3]} />
      <directionalLight
        color="#ffd9a6"
        position={[-5, 13, 8]}
        intensity={0.55}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9.5}
        shadow-camera-right={9.5}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={2}
        shadow-camera-far={34}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </group>
  )
}
