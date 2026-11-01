// Gallery tab: turntables of the hero figures and a few troops (the figure lab has the fuller version).
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { ACESFilmicToneMapping, CircleGeometry, Group, MeshStandardMaterial, type Object3D } from 'three'
import { figures, type Rig } from '../client/figures'
import { enableShadows } from '../client/cutins/poseKit'

interface Item {
  label: string
  make: () => Rig
}

function items(): Item[] {
  const heroes: Item[] = [...figures.heroIds(), 'jian-yong'].map((id) => ({ label: id.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' '), make: () => figures.buildHero(id) }))
  const troops: Item[] = [
    { label: 'Han archer', make: () => figures.buildTroop('archer', 'han', 0) },
    { label: 'Han cavalry', make: () => figures.buildTroop('cavalry', 'han', 0) },
    { label: 'Han infantry', make: () => figures.buildTroop('infantry', 'han', 0) },
    { label: 'Yellow Turban rebel', make: () => figures.buildTroop('rebel', 'yellow', 0) },
  ]
  return [...heroes, ...troops]
}

function Turntable({ item, x, z, index }: { item: Item; x: number; z: number; index: number }) {
  const holder = useRef<Group>(null)
  const rig = useMemo(() => item.make(), [item])
  useEffect(() => {
    enableShadows(rig.group)
    return () => rig.dispose()
  }, [rig])
  const disc = useMemo(() => new MeshStandardMaterial({ color: '#3a1410', roughness: 0.5, metalness: 0.15 }), [])
  const geo = useMemo(() => new CircleGeometry(0.46, 40).rotateX(-Math.PI / 2), [])
  useFrame(({ clock }) => {
    if (holder.current) holder.current.rotation.y = clock.elapsedTime * 0.6 + index * 0.9
  })
  const scale = 1.55
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geo} material={disc} position={[0, 0.002, 0]} receiveShadow />
      <group ref={holder} scale={scale}>
        <primitive object={rig.group as Object3D} />
      </group>
      <Html position={[0, -0.04, 0.55]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="gal-label">{item.label}</div>
      </Html>
    </group>
  )
}

export function Gallery() {
  const list = useMemo(items, [])
  const perRow = 6
  const rows = Math.ceil(list.length / perRow)
  const gap = 1.3
  return (
    <div className="cin-gallery">
      <div className="cin-gallery-canvas" data-testid="gallery-canvas">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [0, 2.3, 4.2], fov: 38, near: 0.05, far: 80 }}
          gl={{ antialias: true }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.setClearColor('#14100d')
          }}
        >
          <hemisphereLight args={['#5a4234', '#1a110c', 1.0]} />
          <directionalLight color="#ffc47a" intensity={3} position={[-3, 5, 4]} castShadow shadow-mapSize={[1024, 1024]} />
          <directionalLight color="#ff9a55" intensity={1.3} position={[4, 3, -4]} />
          {list.map((it, i) => {
            const row = Math.floor(i / perRow)
            const col = i % perRow
            const inRow = Math.min(perRow, list.length - row * perRow)
            return <Turntable key={it.label} item={it} index={i} x={(col - (inRow - 1) / 2) * gap} z={(row - (rows - 1) / 2) * 1.5} />
          })}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[30, 20]} />
            <meshStandardMaterial color="#cdb88c" roughness={1} />
          </mesh>
          <OrbitControls target={[0, 0.35, 0]} maxPolarAngle={Math.PI * 0.48} minDistance={2} maxDistance={9} />
        </Canvas>
      </div>
      <p className="cin-note">Turntables of the unique heroes and four troop kits, in the exact builders the cut-ins call. Drag to orbit. The figure lab has the full contact sheets.</p>
    </div>
  )
}
