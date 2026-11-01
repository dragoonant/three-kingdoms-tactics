// The command tent around the sand table: frame, table, cloth walls, lanterns and their light.
// Everything static is merged into a few meshes (software renderers pay per draw call).
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, DoubleSide, PlaneGeometry, type Group, type Mesh, type MeshLambertMaterial, type PointLight } from 'three'
import { Builder } from './figureGeometry'
import { drapeOpacity, lanternSpots, postOpacity, shadowBox } from './frame'
import { COLORS } from './layout'

const box = new BoxGeometry(1, 1, 1)
const cyl = new CylinderGeometry(1, 1, 1, 10)
const plane = new PlaneGeometry(1, 1)

function Lights({ spots }: { spots: [number, number, number][] }) {
  const refs = useRef<(PointLight | null)[]>([])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    refs.current.forEach((l, i) => {
      if (l) l.intensity = 48 * (1 + 0.07 * Math.sin(t * 7.3 + i * 1.7) + 0.04 * Math.sin(t * 13.1 + i))
    })
  })
  return (
    <>
      {spots.map((p, i) => (
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

/** The tent cloth: a ring of panels around the table. */
const DRAPES = 14
const DRAPE_R = 17
const DRAPE_ANGLES = Array.from({ length: DRAPES }, (_, i) => (i / DRAPES) * Math.PI * 2)

export function Stage({ width: BOARD_W, height: BOARD_H }: { width: number; height: number }) {
  const sway = useRef<Group>(null)
  const panels = useRef<(Mesh | null)[]>([])
  const posts = useRef<(Mesh | null)[]>([])
  const spots = useMemo(() => lanternSpots(BOARD_W, BOARD_H), [BOARD_W, BOARD_H])
  const shadow = useMemo(() => shadowBox(BOARD_W, BOARD_H), [BOARD_W, BOARD_H])
  const geos = useMemo(() => {
    const LANTERN_MESH = spots.meshes
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
    for (const p of LANTERN_MESH) {
      solid.add(cyl, '#1a1210', [p[0], p[1] + 1.6, p[2]], [0, 0, 0], [0.012, 3.2, 0.012])
      solid.add(cyl, COLORS.bronze, [p[0], p[1] + 0.3, p[2]], [0, 0, 0], [0.24, 0.06, 0.24])
      solid.add(cyl, COLORS.bronze, [p[0], p[1] - 0.3, p[2]], [0, 0, 0], [0.2, 0.06, 0.2])
    }
    const glow = new Builder()
    for (const p of LANTERN_MESH) glow.add(cyl, '#ffb457', [p[0], p[1], p[2]], [0, 0, 0], [0.28, 0.55, 0.28])
    return { solid: solid.build(), glow: glow.build() }
  }, [BOARD_W, BOARD_H, spots])
  useFrame((s, dt) => {
    if (sway.current) sway.current.rotation.y = Math.sin(s.clock.elapsedTime * 0.35) * 0.012
    // Occlusion fade: whatever stands between the camera and the table (tent cloth on the camera's side, the near lantern posts at a low
    // pitch) fades out, so a low camera always sees the board. Pure maths in frame.ts.
    const c = s.camera.position
    const camAz = Math.atan2(c.x, c.z)
    const el = Math.atan2(c.y, Math.hypot(c.x, c.z))
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9)
    DRAPE_ANGLES.forEach((a, i) => {
      const m = panels.current[i]
      if (!m) return
      const want = drapeOpacity(a, camAz)
      const mat = m.material as MeshLambertMaterial
      mat.opacity += (want - mat.opacity) * k
      if (Math.abs(want - mat.opacity) < 0.01) mat.opacity = want
      mat.depthWrite = mat.opacity > 0.98
      m.visible = mat.opacity > 0.02
    })
    spots.posts.forEach(([x, z], i) => {
      const m = posts.current[i]
      if (!m) return
      m.visible = postOpacity(x, z, camAz, Math.hypot(c.x, c.z), el) > 0.5
    })
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
        {DRAPE_ANGLES.map((a, i) => (
          <mesh
            key={i}
            ref={(m) => {
              panels.current[i] = m
            }}
            geometry={plane}
            position={[Math.sin(a) * DRAPE_R, 4.5, Math.cos(a) * DRAPE_R]}
            rotation={[0, a + Math.PI, 0]}
            scale={[8, 9, 1]}
          >
            <meshLambertMaterial color={i % 2 ? '#3a1a14' : '#2c1511'} side={DoubleSide} transparent />
          </mesh>
        ))}
      </group>
      {spots.posts.map(([x, z], i) => (
        <mesh
          key={`post${i}`}
          ref={(m) => {
            posts.current[i] = m
          }}
          geometry={cyl}
          position={[x, 4, z]}
          scale={[0.16, 9, 0.16]}
        >
          <meshStandardMaterial color="#1c120d" roughness={0.7} metalness={0.15} />
        </mesh>
      ))}
      <Lights spots={spots.lights} />
      <ambientLight color="#5a4868" intensity={0.22} />
      <hemisphereLight args={['#7a6078', '#2a1a10', 0.3]} />
      <directionalLight
        key={`${BOARD_W}x${BOARD_H}`}
        color="#ffd9a6"
        position={[-5, 13, 8]}
        intensity={0.55}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-shadow.x}
        shadow-camera-right={shadow.x}
        shadow-camera-top={shadow.z}
        shadow-camera-bottom={-shadow.z}
        shadow-camera-near={2}
        shadow-camera-far={34}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </group>
  )
}
