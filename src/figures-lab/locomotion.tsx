// Figure lab "Locomotion" view (docs/spec/31-hero-figures.md): a hero, an infantryman, an archer and two riders on a treadmill
// strip, filmed side-on so a gait can be judged: the ground stripes slide back at the travelling speed, and a planted foot
// must stay on its stripe. The pose is a pure function of distance (= speed x time), so a frozen frame is reproducible.
//   ?view=locomotion&gait=walk|run|trot|canter|gallop&t=<seconds>&lanes=0,1,2,3,4   (t freezes the frame; omit to animate;
//   bare=1 hides skirts and robes so the legs can be judged.
//   lanes picks from: 0 hero on foot, 1 infantry, 2 archer, 3 cavalry, 4 hero mounted)
//   On foot a "walk" is the walk and every other gait is the run; on horseback "run" is the trot.
//   window.__lab.setT(seconds) sets the frame time in a frozen view; window.__lab.ready is set after the first render.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Group, type Object3D } from 'three'
import { applyClip, gaitClip } from '../client/figures/clips'
import { HORSE_GAITS, HUMAN_GAITS, type Gait } from '../client/figures/gait'
import { buildHeroRig } from '../client/figures/heroes'
import { buildTroopRig } from '../client/figures/troops'
import type { Rig } from '../client/figures/rig'

const Q = new URLSearchParams(window.location.search)
const GAIT = (Q.get('gait') ?? 'walk') as Gait
const LANES = (Q.get('lanes') ?? '0,1,2,3,4').split(',').map(Number)
const BARE = Q.get('bare') === '1'
const T0 = Q.get('t') !== null ? Number(Q.get('t')) : null

/** Nominal speeds (rig units per second) of each gait on the treadmill. */
export const TREADMILL_SPEED: Record<Gait, number> = { walk: 1.1, run: 2.3, trot: 1.8, canter: 3.2, gallop: 5.6 }
/** Seconds for one full stride cycle of a gait at its nominal speed (used by the capture tool for the 8-phase sheets). */
export const cycleSeconds = (g: Gait, mounted: boolean): number => (mounted ? HORSE_GAITS[g === 'run' ? 'gallop' : (g as 'walk')].stride : HUMAN_GAITS[g === 'walk' ? 'walk' : 'run'].stride) / TREADMILL_SPEED[g]

interface Lane {
  label: string
  rig: Rig
  x: number
}

function build(): Lane[] {
  const lanes: Rig[] = [
    buildHeroRig('guan-yu', { mounted: false })!,
    buildTroopRig('infantry', 'han', 0),
    buildTroopRig('archer', 'han', 0),
    buildTroopRig('cavalry', 'han', 1),
    buildHeroRig('guan-yu', { mounted: true })!,
  ]
  const labels = ['Hero on foot', 'Infantry', 'Archer', 'Cavalry', 'Hero mounted']
  if (BARE) {
    for (const rig of lanes) {
      rig.joints.hips.children.forEach((c) => {
        if ((c as Object3D & { isMesh?: boolean }).isMesh) c.visible = false
      })
    }
  }
  const picked = LANES.filter((i) => i >= 0 && i < lanes.length)
  return picked.map((i, k) => ({ label: labels[i]!, rig: lanes[i]!, x: k * 1.75 }))
}

function Fit({ width }: { width: number }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    camera.position.set(-20, 3.0, width / 2 - 0.4)
    camera.zoom = Math.min(size.width / (width + 0.6), size.height / 1.75)
    camera.near = -100
    camera.far = 200
    camera.lookAt(0, 0.5, width / 2 - 0.4)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size, width, invalidate])
  return null
}

function Scene({ gait, tRef, lanes }: { gait: Gait; tRef: { current: number }; lanes: Lane[] }) {
  const stripes = useRef<Group>(null)
  const done = useRef(false)
  const spacing = 0.5
  useFrame((state) => {
    const t = T0 !== null ? tRef.current : state.clock.elapsedTime
    const v = TREADMILL_SPEED[gait]
    const d = v * t
    for (const l of lanes) {
      const mounted = !!l.rig.mount
      applyClip(l.rig, gaitClip(mounted && gait === 'run' ? 'trot' : gait, d, mounted))
      l.rig.group.position.set(0, 0, l.x)
    }
    // the ground slides backwards (toward -z) at the speed of the gait
    if (stripes.current) {
      const kids = stripes.current.children
      const span = kids.length * spacing
      kids.forEach((k, i) => {
        k.position.z = ((((i * spacing - d) % span) + span) % span) - 1.4
      })
    }
    if (!done.current) {
      done.current = true
      ;(window as unknown as { __lab?: unknown }).__lab = {
        ready: true,
        setT: (t: number) => {
          tRef.current = t
          state.invalidate()
        },
      }
    }
  })
  const width = lanes[lanes.length - 1]!.x + 1.75
  const nStripes = Math.ceil((width + 4) / spacing)
  return (
    <>
      <ambientLight intensity={0.9} color="#ffe2b8" />
      <directionalLight position={[-12, 9, 6]} intensity={2.3} color="#ffd9a0" />
      <directionalLight position={[8, 4, -8]} intensity={0.9} color="#9fb4d6" />
      <mesh position={[0, -0.06, width / 2 - 0.5]}>
        <boxGeometry args={[3, 0.12, width + 3]} />
        <meshStandardMaterial color="#cdb88c" roughness={0.95} />
      </mesh>
      <group ref={stripes}>
        {Array.from({ length: nStripes }, (_, i) => (
          <mesh key={i} position={[0, 0.003, 0]}>
            <boxGeometry args={[2.6, 0.006, 0.05]} />
            <meshStandardMaterial color={i % 4 === 0 ? '#3a2a1c' : '#7a6444'} roughness={1} />
          </mesh>
        ))}
      </group>
      {lanes.map((l) => (
        <primitive key={l.label} object={l.rig.group as Object3D} />
      ))}
    </>
  )
}

export function Locomotion() {
  const lanes = useMemo(build, [])
  const tRef = useRef(T0 ?? 0)
  useEffect(() => () => lanes.forEach((l) => l.rig.dispose()), [lanes])
  const width = lanes[lanes.length - 1]!.x + 1.75
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#14100d' }}>
      <Canvas orthographic frameloop={T0 !== null ? 'demand' : 'always'} dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ position: [-20, 0.75, 4], zoom: 120, near: -100, far: 200 }} onCreated={({ gl }) => gl.setClearColor('#14100d')}>
        <Fit width={width} />
        <Scene gait={GAIT} tRef={tRef} lanes={lanes} />
      </Canvas>
      <div style={{ position: 'fixed', left: 12, top: 8, font: "600 14px 'Alegreya Sans',system-ui,sans-serif", color: '#efe6d2', textShadow: '0 1px 3px #000' }}>
        Locomotion &middot; gait {GAIT}
      </div>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 6, display: 'flex', font: "500 12px 'Alegreya Sans',system-ui,sans-serif", color: '#c9b27c' }}>
        {lanes.map((l) => (
          <div key={l.label} style={{ flex: 1, textAlign: 'center' }}>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  )
}
