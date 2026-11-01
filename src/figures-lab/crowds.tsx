// Figure lab "Crowds" view (docs/spec/52-crowds.md): the instanced troop formations of the battle cut-ins, scripted as pure
// functions of the frame time so a frozen frame is reproducible.
//   ?view=crowds&scene=infantry|archers|cavalry|rebels|all|perf&cam=side|three|front&t=<seconds>
//   &n=<members per crowd>&full=<front rank rigs>&mode=rig|hi&detail=lo|hi&shadow=0|1&w=<px>&h=<px>
// Without t it plays in real time. window.__lab.setT(seconds) sets the time of a frozen view, window.__lab.ready is set
// after the first render, and the perf scene leaves window.__lab.perf = { frames, msPerFrame, drawCalls, triangles }.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type Mesh, type DirectionalLight } from 'three'
import { createCrowd, type Crowd, type CrowdOptions } from '../client/cutins/crowd'

const Q = new URLSearchParams(window.location.search)
const SCENE = Q.get('scene') ?? 'all'
const CAM = Q.get('cam') ?? 'three'
const T0 = Q.get('t') !== null ? Number(Q.get('t')) : null
const N = Q.get('n') !== null ? Number(Q.get('n')) : null
const FULL = Q.get('full') !== null ? Number(Q.get('full')) : null
const MODE = (Q.get('mode') ?? 'rig') as 'rig' | 'hi'
const DETAIL = (Q.get('detail') ?? 'lo') as 'lo' | 'hi'
const SHADOW = Q.get('shadow') !== '0'
const ZOOM = Q.get('zoom') !== null ? Number(Q.get('zoom')) : 1

interface Entry {
  crowd: Crowd
  label: string
}

const mk = (o: CrowdOptions): Crowd =>
  createCrowd({ frontRankMode: MODE, detail: DETAIL, castShadow: SHADOW, ...o, ...(N !== null ? { count: N } : {}), ...(FULL !== null ? { frontRankFull: FULL } : {}) })

/** The four scripted crowds. Every command is given its own time up front, so the picture is a pure function of t. */
function infantry(x: number, z: number): Entry {
  const c = mk({ kind: 'infantry', side: 'han', count: 24, formation: 'block', seed: 11, origin: [x, 0, z] })
  c.march([0, 1], 0.55, { at: 0.5, ramp: 0.8 })
  c.march([0, 1], 1.6, { at: 3.2, ramp: 1.2 })
  c.halt({ at: 5.6, decel: 0.5 })
  return { crowd: c, label: 'infantry block: stand, march, run, halt' }
}
function archers(x: number, z: number): Entry {
  const c = mk({ kind: 'archer', side: 'han', count: 20, formation: 'line', seed: 5, origin: [x, 0, z] })
  c.kneel({ at: 0.3, members: 'front' })
  c.draw(undefined, { at: 1.0, dur: 0.9 })
  c.loose({ at: 2.4 })
  c.draw(undefined, { at: 3.3, dur: 0.9 })
  c.loose({ at: 4.7 })
  return { crowd: c, label: 'archer line: kneel front, draw, loose, draw, loose' }
}
function cavalry(x: number, z: number): Entry {
  const c = mk({ kind: 'cavalry', side: 'han', count: 18, formation: 'wedge', seed: 23, origin: [x, 0, z] })
  c.march([0, 1], 1.0, { at: 0.4, ramp: 1.4 })
  c.march([0, 1], 2.6, { at: 2.4, ramp: 1.6 })
  const down = c.pick(6, 8, 'rear')
  c.fall(down.slice(0, 3), 'back', undefined, { at: 5.0 })
  c.fall(down.slice(3, 6), 'fling', 1.4, { at: 5.1 })
  return { crowd: c, label: 'cavalry wedge: walk, canter, gallop, some thrown' }
}
function rebels(x: number, z: number): Entry {
  const c = mk({ kind: 'rebel', side: 'yellow', count: 24, formation: 'mob', seed: 2, origin: [x, 0, z], facing: Math.PI })
  c.march([0, -1], 0.5, { at: 0.2 })
  c.stagger('front', { at: 1.2 })
  const down = c.pick(9, 4, 'all')
  c.stagger(down, { at: 1.2, hold: 1 })
  c.fall(down.slice(0, 3), 'back', undefined, { at: 1.9 })
  c.fall(down.slice(3, 6), 'forward', undefined, { at: 2.0 })
  c.fall(down.slice(6, 9), 'fling', 1.6, { at: 2.1 })
  c.flee(c.select('rear'), { at: 3.0, dir: [0, 1], speed: 1.4 })
  return { crowd: c, label: 'rebel mob: stagger, fall back / forward / fling, flee' }
}

function build(): Entry[] {
  switch (SCENE) {
    case 'infantry':
      return [infantry(0, 0)]
    case 'archers':
      return [archers(0, 0)]
    case 'cavalry':
      return [cavalry(0, 0)]
    case 'rebels':
      return [rebels(0, 0)]
    case 'perf': {
      const a = createCrowd({ kind: 'infantry', side: 'han', count: N ?? 30, formation: 'block', seed: 11, origin: [-2.2, 0, 0], frontRankMode: MODE, detail: DETAIL, castShadow: SHADOW, ...(FULL !== null ? { frontRankFull: FULL } : {}) })
      const b = createCrowd({ kind: 'cavalry', side: 'yellow', count: N ?? 30, formation: 'wedge', seed: 5, origin: [2.4, 0, 3], facing: Math.PI, frontRankMode: MODE, detail: DETAIL, castShadow: SHADOW, ...(FULL !== null ? { frontRankFull: FULL } : {}) })
      a.march([0, 1], 1.2, { at: 0.2 })
      b.march([0, 1], 2.4, { at: 0.2 })
      return [
        { crowd: a, label: 'infantry' },
        { crowd: b, label: 'cavalry' },
      ]
    }
    default:
      return [infantry(-7.5, 0), archers(-2.3, 0), cavalry(3, 0), rebels(8.4, 4)]
  }
}

/** Sand with stripes across the march, so a planted foot is visible against the ground. */
function useGround(): CanvasTexture {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = '#cdb88c'
    g.fillRect(0, 0, 64, 64)
    g.fillStyle = '#bca677'
    g.fillRect(0, 0, 64, 2)
    g.fillRect(0, 0, 2, 64)
    const t = new CanvasTexture(c)
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(320, 320)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
}

const tmp = new Vector3()
function centre(entries: Entry[], t: number, out: Vector3): Vector3 {
  out.set(0, 0, 0)
  for (const e of entries) {
    e.crowd.update(t)
    // follow the middle of the live members of each crowd
    const ms = e.crowd.members
    let n = 0
    const c = new Vector3()
    for (const m of ms) {
      if (m.state === 'fled') continue
      e.crowd.positionOf(m.index, tmp, true)
      c.add(tmp)
      n++
    }
    out.add(c.multiplyScalar(1 / Math.max(1, n)))
  }
  return out.multiplyScalar(1 / Math.max(1, entries.length))
}

function World({ entries }: { entries: Entry[] }) {
  const { camera, gl, scene, invalidate } = useThree()
  const tRef = useRef(T0 ?? 0)
  const lightRef = useRef<DirectionalLight>(null)
  const groundRef = useRef<Mesh>(null)
  const done = useRef(false)
  const perf = useRef({ frames: 0, ms: 0 })
  const ground = useGround()
  const cen = useMemo(() => new Vector3(), [])
  const wide = SCENE === 'all' || SCENE === 'perf'
  useEffect(() => {
    scene.background = new Color('#2a1f16')
  }, [scene])
  useFrame((state) => {
    const t0 = performance.now()
    const t = T0 !== null ? tRef.current : state.clock.elapsedTime
    centre(entries, t, cen)
    if (SCENE === 'all') cen.set(0.5, 0, 3.5)
    // a lantern-lit sand table: camera, key light and ground follow the middle of the action
    const D = (wide ? (SCENE === 'perf' ? 9 : 20) : SCENE === 'cavalry' ? 5.6 : SCENE === 'rebels' ? 4.6 : SCENE === 'archers' ? 6.6 : 4.0) / ZOOM
    const fov = 28
    if (camera.type === 'PerspectiveCamera') {
      ;(camera as unknown as { fov: number }).fov = fov
      camera.updateProjectionMatrix()
    }
    const ex = CAM === 'side' ? [D, D * 0.12, 0] : CAM === 'front' ? [0, D * 0.3, D] : [D * 0.62, D * 0.34, D * 0.74]
    camera.position.set(cen.x + ex[0]!, ex[1]! + (ZOOM > 2 ? 0.05 : 0.25), cen.z + ex[2]!)
    camera.lookAt(cen.x, ZOOM > 2 ? 0.14 : 0.3, cen.z)
    if (lightRef.current) {
      lightRef.current.position.set(cen.x - 4, 8, cen.z + 6)
      lightRef.current.target.position.set(cen.x, 0, cen.z)
      lightRef.current.target.updateMatrixWorld()
    }
    if (groundRef.current) groundRef.current.position.set(Math.round(cen.x), -0.002, Math.round(cen.z))
    if (!done.current) {
      done.current = true
      ;(window as unknown as { __lab?: unknown }).__lab = {
        ready: true,
        setT: (tt: number) => {
          tRef.current = tt
          invalidate()
        },
        info: () => ({ calls: gl.info.render.calls, triangles: gl.info.render.triangles }),
        stats: () => entries.map((e) => e.crowd.stats()),
      }
    }
    if (SCENE === 'perf') {
      perf.current.frames++
      perf.current.ms += performance.now() - t0
      ;(window as unknown as { __lab?: Record<string, unknown> }).__lab!['cpuMs'] = perf.current.ms / perf.current.frames
    }
  })
  useEffect(() => () => entries.forEach((e) => e.crowd.dispose()), [entries])
  return (
    <>
      <hemisphereLight args={['#4a3426', '#1d130d', 1.1]} />
      <directionalLight
        ref={lightRef}
        color="#ffd9a0"
        intensity={2.6}
        castShadow={SHADOW}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0006}
        shadow-normalBias={0.01}
      />
      <directionalLight color="#ff9a55" intensity={1.2} position={[6, 5, -6]} />
      <directionalLight color="#6f8fa8" intensity={0.5} position={[-6, 4, 5]} />
      <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial map={ground} roughness={0.95} />
      </mesh>
      {entries.map((e, i) => (
        <primitive key={i} object={e.crowd.group as Group} />
      ))}
    </>
  )
}

export function Crowds() {
  const entries = useMemo(build, [])
  const W = Number(Q.get('w') ?? 0)
  const H = Number(Q.get('h') ?? 0)
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#2a1f16', ...(W && H ? { width: W, height: H } : {}) }}>
      <Canvas
        shadows={SHADOW}
        dpr={1}
        frameloop={T0 !== null ? 'demand' : 'always'}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [6, 4, 8], fov: 28, near: 0.1, far: 200 }}
        onCreated={({ gl }) => gl.setClearColor('#2a1f16')}
      >
        <World entries={entries} />
      </Canvas>
      <div style={{ position: 'fixed', left: 12, top: 8, font: "600 14px 'Alegreya Sans',system-ui,sans-serif", color: '#efe6d2', textShadow: '0 1px 3px #000' }}>
        Crowds &middot; {entries.map((e) => e.label).join('  |  ')}
      </div>
    </div>
  )
}
