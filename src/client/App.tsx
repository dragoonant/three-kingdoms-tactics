import { useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { makeGrid } from '../engine'

declare global {
  interface Window {
    __app?: { ready: boolean }
  }
}

const GRID_SIZE = 12
const TILE = 1
// Placeholder neutral palette; real art direction comes later.
const TILE_A = '#b8a98a'
const TILE_B = '#a39574'
const RED = '#b84a3e'
const BLUE = '#3e6fb8'

interface FigureSpec {
  x: number
  y: number
  team: 'red' | 'blue'
}

const FIGURES: FigureSpec[] = [
  { x: 2, y: 2, team: 'red' },
  { x: 4, y: 1, team: 'red' },
  { x: 6, y: 2, team: 'red' },
  { x: 5, y: 9, team: 'blue' },
  { x: 7, y: 10, team: 'blue' },
  { x: 9, y: 9, team: 'blue' },
]

/** Tile (x, y) -> world position of the tile centre; board is centred on the origin. */
function tileToWorld(x: number, y: number): [number, number] {
  const off = (GRID_SIZE * TILE) / 2 - TILE / 2
  return [x * TILE - off, y * TILE - off]
}

// Super-deformed stand-in: head is ~40% of total figure height.
const BASE_H = 0.06
const BODY_R = 0.13
const BODY_LEN = 0.14 // capsule cylinder part
const BODY_H = BODY_LEN + BODY_R * 2 // 0.4
const HEAD_R = 0.2 // diameter 0.4
const BANNER_H = 0.55

function Figure({ x, y, team }: FigureSpec) {
  const [wx, wz] = tileToWorld(x, y)
  const color = team === 'red' ? RED : BLUE
  const bodyY = BASE_H + BODY_H / 2
  const headY = BASE_H + BODY_H * 0.85 + HEAD_R // head overlaps the body top slightly
  const poleX = 0.28
  return (
    <group position={[wx, 0, wz]}>
      <mesh position={[0, BASE_H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.32, BASE_H, 32]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.6} />
      </mesh>
      <mesh position={[0, bodyY, 0]} castShadow>
        <capsuleGeometry args={[BODY_R, BODY_LEN, 8, 16]} />
        <meshStandardMaterial color="#8a8478" roughness={0.8} />
      </mesh>
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[HEAD_R, 32, 24]} />
        <meshStandardMaterial color="#d9b99a" roughness={0.7} />
      </mesh>
      {/* banner: thin pole with a coloured flag */}
      <mesh position={[poleX, BASE_H + BANNER_H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, BANNER_H, 8]} />
        <meshStandardMaterial color="#3a2a1c" />
      </mesh>
      <mesh position={[poleX + 0.08, BASE_H + BANNER_H - 0.1, 0]} castShadow>
        <boxGeometry args={[0.16, 0.2, 0.012]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Board() {
  const grid = useMemo(() => makeGrid(GRID_SIZE, GRID_SIZE), [])
  const span = GRID_SIZE * TILE
  return (
    <group>
      {/* dark wooden table */}
      <mesh position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[40, 0.5, 40]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.85} />
      </mesh>
      {/* board slab */}
      <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
        <boxGeometry args={[span + 0.6, 0.12, span + 0.6]} />
        <meshStandardMaterial color="#4a3320" roughness={0.8} />
      </mesh>
      {grid.tiles.map((t) => {
        const [wx, wz] = tileToWorld(t.x, t.y)
        return (
          <mesh key={`${t.x},${t.y}`} position={[wx, 0.005, wz]} receiveShadow>
            <boxGeometry args={[TILE * 0.97, 0.02, TILE * 0.97]} />
            <meshStandardMaterial color={(t.x + t.y) % 2 === 0 ? TILE_A : TILE_B} roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

function ReadyFlag() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('test') !== '1') return
    // Wait for two frames so the first render has actually been painted.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__app = { ready: true }
    }))
    return () => cancelAnimationFrame(id)
  }, [])
  return null
}

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        shadows
        camera={{ position: [0, 15, 15], fov: 40, near: 0.1, far: 100 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        style={{ background: '#1a1410' }}
      >
        <color attach="background" args={['#1a1410']} />
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#f0e6d2', '#2a1a10', 0.35]} />
        <directionalLight
          position={[7, 12, 6]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
          shadow-radius={4}
        />
        <Board />
        {FIGURES.map((f, i) => (
          <Figure key={i} {...f} />
        ))}
        <OrbitControls
          makeDefault
          enablePan
          enableDamping
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.4}
          minDistance={5}
          maxDistance={26}
          target={[0, 0, 0]}
        />
        <ReadyFlag />
      </Canvas>
    </div>
  )
}
