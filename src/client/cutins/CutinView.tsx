// The cut-in viewport: a manually driven R3F canvas (frameloop "never": the controller decides when a frame is drawn, so
// scrubbing and frame capture are exact) with the HTML overlays on top, all synced to controller.frame.
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace, type WebGLRenderer } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { CutinController } from './controller'
import { Overlays } from './Overlays'
import { FrameContext } from './stage/Stage'
import { FireArrowsWorld } from './scenes/FireArrowsWorld'
import { ThunderingChargeWorld } from './scenes/ThunderingChargeWorld'
import type { Evaluated } from './timeline'
import './cutins.css'

function Bridge({ controller, onReady, free }: { controller: CutinController; onReady: () => void; free: boolean }) {
  const advance = useThree((s) => s.advance)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const get = useThree((s) => s.get)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('test') === '1') (window as unknown as { __r3f?: unknown }).__r3f = get()
  }, [get])
  useEffect(() => {
    controller.renderNow = () => advance(performance.now() / 1000, true)
    // first frame once the world has mounted
    // after React's commit: the overlay uses flushSync, which must not run inside a lifecycle
    queueMicrotask(() => {
      controller.setTime(controller.t)
      onReady()
    })
    return () => {
      controller.renderNow = null
    }
  }, [controller, advance, onReady])
  // entering the free camera starts from the current shot
  useEffect(() => {
    if (!free || !controls) return
    const f = controller.frame.current.camera
    controls.target.set(f.target[0], f.target[1], f.target[2])
    controls.update()
  }, [free, controls, controller])
  useFrame(() => {
    if (controller.free) return
    const f = controller.frame.current.camera
    camera.position.set(f.pos[0], f.pos[1], f.pos[2])
    if (camera.fov !== f.fov) {
      camera.fov = f.fov
      camera.updateProjectionMatrix()
    }
    camera.lookAt(f.target[0], f.target[1], f.target[2])
  })
  return null
}

function World({ controller }: { controller: CutinController }) {
  const scene = controller.scene
  return scene.id === 'A' ? <FireArrowsWorld scene={scene} /> : <ThunderingChargeWorld scene={scene} />
}

export interface CutinViewProps {
  controller: CutinController
  /** Fill the whole window (capture and ?ui=0). */
  full?: boolean
  safe?: boolean
  /** 1 for exact capture; otherwise min(devicePixelRatio, 2). */
  dpr?: number
  onReady?: () => void
  /** Bump to remount the world when the scene changes. */
  sceneKey: string
}

export function CutinView({ controller, full = false, safe = false, dpr, onReady, sceneKey }: CutinViewProps) {
  const [ev, setEv] = useState<Evaluated>(controller.frame.current)
  const [free, setFree] = useState(controller.free)
  useEffect(() => {
    const unsub = controller.subscribe((e) => {
      if (controller.playing) setEv(e)
      else flushSync(() => setEv(e))
    })
    const unsub2 = controller.onState(() => setFree(controller.free))
    return () => {
      unsub()
      unsub2()
    }
  }, [controller])
  const ready = useMemo(() => onReady ?? (() => {}), [onReady])
  const pixelRatio = dpr ?? Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2)
  const whipPx = Math.round(ev.overlay.whip * 22)
  return (
    <div className={`co-frame${full ? ' co-full' : ''}`} data-testid="cutin-frame">
      <FrameContext.Provider value={controller.frame}>
        <div className="co-stage" style={whipPx > 0.5 ? { filter: 'url(#co-hblur)' } : undefined}>
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
            <filter id="co-hblur" x="-10%" y="-5%" width="120%" height="110%">
              <feGaussianBlur stdDeviation={`${whipPx} 0`} />
            </filter>
          </svg>
          <Canvas
            key={sceneKey}
            frameloop="never"
            dpr={pixelRatio}
            shadows="percentage"
            camera={{ fov: 40, near: 0.03, far: 220, position: [0, 3, -8] }}
            gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }: { gl: WebGLRenderer }) => {
              gl.toneMapping = ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
              gl.outputColorSpace = SRGBColorSpace
              gl.setClearColor('#0b0806')
            }}
          >
            <Suspense fallback={null}>
              <World controller={controller} />
            </Suspense>
            <OrbitControls makeDefault enabled={free} enableDamping={false} onChange={() => controller.render()} maxPolarAngle={Math.PI * 0.499} />
            <Bridge controller={controller} onReady={ready} free={free} />
          </Canvas>
        </div>
      </FrameContext.Provider>
      <Overlays ev={ev} safe={safe} />
    </div>
  )
}
