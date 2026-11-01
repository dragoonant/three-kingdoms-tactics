// The cut-in viewport: a manually driven R3F canvas (frameloop "never": the controller decides when a frame is drawn, so
// scrubbing and frame capture are exact) with the HTML overlays on top, all synced to controller.frame.
//
// Two ways to use it:
//   - one world (the review page and the capture tools): `scene` / `worldKey`, remounted when they change;
//   - slots (the game, docs/spec/51 "Performance: warm-up and reuse"): the canvas stays mounted for the whole battle and holds
//     the worlds listed by `slots` (cutins/prep.ts), each in its own group; only `activeKey` is visible and animates. Hidden
//     slots get a compile pass and one hidden draw (Warmer, below), so when one becomes active its first frame needs no shader
//     compile and no upload. A slot's GPU resources are released when it unmounts (cutins/gpu.ts).
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ACESFilmicToneMapping, type DirectionalLight, Group, type Light, type Object3D, PerspectiveCamera, SRGBColorSpace, Vector4, WebGLRenderer, type Scene } from 'three'
import { perf } from './perf'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { CutinController } from './controller'
import { collect, pinPrograms, release } from './gpu'
import { Overlays } from './Overlays'
import type { Slot } from './prep'
import { FrameContext } from './stage/Stage'
import { SlotContext } from './stage/slot'
import { FireArrowsWorld } from './scenes/FireArrowsWorld'
import { ThunderingChargeWorld } from './scenes/ThunderingChargeWorld'
import { ActWorld } from './scenes/ActWorld'
import { WarmGallery } from './WarmGallery'
import type { CutinScene, Evaluated } from './timeline'
import './cutins.css'

function Bridge({ controller, onReady, free }: { controller: CutinController; onReady: () => void; free: boolean }) {
  const advance = useThree((s) => s.advance)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const get = useThree((s) => s.get)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('test') === '1') (window as unknown as { __r3f?: unknown }).__r3f = get()
  }, [get])
  useEffect(() => {
    const drain = (): void => {
      const c = gl.getContext()
      c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, new Uint8Array(4))
    }
    controller.renderNow = perf.active
      ? () => {
          const t0 = performance.now()
          advance(t0 / 1000, true)
          perf.frame(t0, drain)
        }
      : () => advance(performance.now() / 1000, true)
    // first frame once the world has mounted
    // after React's commit: the overlay uses flushSync, which must not run inside a lifecycle
    queueMicrotask(() => {
      controller.setTime(controller.t)
      onReady()
    })
    return () => {
      controller.renderNow = null
    }
  }, [controller, advance, onReady, gl])
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

// memo: the view re-renders on every frame (the overlays); the world's JSX does not need to be diffed again
const World = memo(function World({ controller, scene: given, onMount }: { controller: CutinController; scene?: CutinScene; onMount?: () => void }) {
  const scene = given ?? controller.scene
  useEffect(() => {
    perf.mark('world-mounted')
    onMount?.()
  }, [onMount])
  const marked = useRef(false)
  if (!marked.current) {
    marked.current = true
    perf.mark('world-render')
  }
  if (scene.id === 'A' || scene.id === 'Ap') return <FireArrowsWorld scene={scene} />
  if (scene.id === 'B') return <ThunderingChargeWorld scene={scene} />
  return <ActWorld scene={scene} />
})

// ---- slots ------------------------------------------------------------------------------------------------------------

const slotGroups = new Map<string, Group>()

/**
 * Show one slot now (and hide the others) without waiting for the canvas's own React commit, which R3F schedules after the
 * page's: the first frame of a prebuilt world is drawn in the same task that starts the cut-in.
 */
export function activateSlot(key: string | null): void {
  for (const [k, g] of slotGroups) {
    const on = k === key
    g.visible = on
    const act = g.userData.active as { current: boolean } | undefined
    if (act) act.current = on
  }
}

const SlotHost = memo(function SlotHost({ slot, active, controller, onMount }: { slot: Slot; active: boolean; controller: CutinController; onMount: (key: string) => void }) {
  const ref = useRef<Group>(null)
  const act = useRef(active)
  act.current = active
  const key = slot.key
  useLayoutEffect(() => {
    const g = ref.current!
    g.userData.alive = true
    g.userData.active = act
    slotGroups.set(key, g)
    return () => {
      // collected now, while the tree is whole (layout cleanups run before the group leaves the scene); released a tick later,
      // unless StrictMode's simulated unmount mounts it straight back
      const s = collect(g)
      g.userData.alive = false
      if (slotGroups.get(key) === g) slotGroups.delete(key)
      setTimeout(() => {
        if (!g.userData.alive) release(s)
      }, 0)
    }
  }, [key])
  const mounted = useCallback(() => onMount(key), [onMount, key])
  return (
    <group ref={ref} visible={active} name={`slot:${slot.kind}`}>
      <SlotContext.Provider value={act}>
        {slot.gallery ? <WarmGallery spec={slot.gallery} onMount={mounted} /> : <World controller={controller} scene={slot.scene!} onMount={mounted} />}
      </SlotContext.Provider>
    </group>
  )
})

const warmCam = new PerspectiveCamera(110, 16 / 9, 0.03, 220)
warmCam.position.set(0, 9, -9)
warmCam.lookAt(0, 0, 1)
const v4 = new Vector4()
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

/**
 * Compiles every hidden slot once it has mounted: `compileAsync` on the slot alone (so its own lights, and only those, choose
 * the program variants), then, when no cut-in is on screen, one draw of the slot into a 1x1 scissor of the canvas (the same
 * colour space and tone mapping as a real frame) that compiles the shadow-pass programs and uploads its geometry and textures.
 */
function Warmer({ slots, busy, onReady }: { slots: readonly Slot[]; busy: () => boolean; onReady: (key: string) => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const doing = useRef(new Set<string>())
  useEffect(() => {
    for (const s of slots) {
      if (!s.mounted || s.ready || s.kind === 'live' || doing.current.has(s.key)) continue
      doing.current.add(s.key)
      const key = s.key
      void (async () => {
        try {
          // a frame for the slot's own effects (the lanterns add their sprites in one)
          await nextFrame()
          const g = slotGroups.get(key)
          if (!g) return
          warmCam.aspect = gl.domElement.width / Math.max(1, gl.domElement.height)
          warmCam.updateProjectionMatrix()
          const was = g.visible
          g.visible = true
          let p: Promise<unknown>
          try {
            p = perf.measure('warm-compile', () => gl.compileAsync(g, warmCam, g as unknown as Scene))
          } finally {
            g.visible = was
          }
          await p
          if (!slotGroups.has(key) || busy()) return
          perf.measure('warm-draw', () => {
            const hidden: Group[] = []
            for (const o of slotGroups.values()) {
              if (o !== g && o.visible) {
                o.visible = false
                hidden.push(o)
              }
            }
            const before = g.visible
            g.visible = true
            // the shadow pass only has to run once to compile its programs: draw it into a tiny map, then let the light
            // allocate its real one on the first real frame (map size is not part of a program)
            const shrunk: { l: DirectionalLight; w: number; h: number }[] = []
            // everything the scene will show later (arrows in flight, spirals, rings...) is drawn too, and nothing is culled,
            // so every buffer and texture is uploaded now; lights keep their state (the light rig decides the programs)
            const shown: Object3D[] = []
            const culled: Object3D[] = []
            g.traverse((o) => {
              if (!o.visible && !(o as Light).isLight) {
                o.visible = true
                shown.push(o)
              }
              if (o.frustumCulled) {
                o.frustumCulled = false
                culled.push(o)
              }
              const l = o as DirectionalLight
              if (!l.isDirectionalLight || !l.castShadow) return
              shrunk.push({ l, w: l.shadow.mapSize.x, h: l.shadow.mapSize.y })
              l.shadow.map?.dispose()
              l.shadow.map = null
              l.shadow.mapSize.set(16, 16)
            })
            const sc = gl.getScissorTest()
            gl.getScissor(v4)
            gl.setScissorTest(true)
            gl.setScissor(0, 0, 1, 1)
            try {
              gl.render(scene, warmCam)
            } finally {
              gl.setScissor(v4)
              gl.setScissorTest(sc)
              g.visible = before
              hidden.forEach((o) => (o.visible = true))
              shown.forEach((o) => (o.visible = false))
              culled.forEach((o) => (o.frustumCulled = true))
              for (const { l, w, h } of shrunk) {
                l.shadow.map?.dispose()
                l.shadow.map = null
                l.shadow.mapSize.set(w, h)
              }
            }
          })
          // ready once the GPU has worked through that draw too (animation frames wait for it), so a cut-in started
          // straight after does not queue its first frame behind it
          await nextFrame()
          await nextFrame()
        } finally {
          pinPrograms(gl)
          doing.current.delete(key)
          onReady(key)
        }
      })()
    }
  }, [slots, gl, scene, busy, onReady])
  return null
}

export interface CutinViewProps {
  controller: CutinController
  /** Fill the whole window (capture and ?ui=0). */
  full?: boolean
  safe?: boolean
  /** 1 for exact capture; otherwise min(devicePixelRatio, 2). */
  dpr?: number
  onReady?: () => void
  /** Bump to remount the canvas when the scene changes. */
  sceneKey: string
  /** Remount only the world (keeps the GL context, for scene-to-scene chains in the game); defaults to nothing. */
  worldKey?: string
  /** Fires after every drawn frame with the evaluated frame (the game fades the layer from it). */
  onFrame?: (ev: Evaluated) => void
  /** The world has mounted (fires again for every `worldKey`): the game starts its clock then. */
  onWorldMount?: () => void
  /** The scene the world is built from, when it must change together with `worldKey` (the game's chains); defaults to the controller's. */
  scene?: CutinScene
  /** The game: the worlds of the persistent canvas (cutins/prep.ts), instead of `scene`. */
  slots?: readonly Slot[]
  /** The slot on screen (null: none, the canvas is idle). */
  activeKey?: string | null
  /** A slot's world has mounted. */
  onSlotMount?: (key: string) => void
  /** A hidden slot has been compiled and drawn once. */
  onSlotReady?: (key: string) => void
  /** A cut-in is on screen (the warm draw waits). */
  busy?: () => boolean
  /** Draw the HTML overlays (default true; the game hides them while idle). */
  overlays?: boolean
  /** The renderer exists (the game starts its warm-up then). */
  onRenderer?: (gl: WebGLRenderer) => void
}

const never = (): boolean => false
const noop = (): void => {}

export function CutinView({ controller, full = false, safe = false, dpr, onReady, sceneKey, worldKey, onFrame, onWorldMount, scene, slots, activeKey = null, onSlotMount, onSlotReady, busy, overlays = true, onRenderer }: CutinViewProps) {
  const [ev, setEv] = useState<Evaluated>(controller.frame.current)
  const [free, setFree] = useState(controller.free)
  useEffect(() => {
    const unsub = controller.subscribe((e) => {
      onFrame?.(e)
      if (controller.playing) setEv(e)
      else flushSync(() => setEv(e))
    })
    const unsub2 = controller.onState(() => setFree(controller.free))
    return () => {
      unsub()
      unsub2()
    }
  }, [controller, onFrame])
  const ready = useMemo(() => onReady ?? (() => {}), [onReady])
  const slotMount = onSlotMount ?? noop
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
            gl={(d) => perf.measure('renderer-create', () => new WebGLRenderer({ ...d, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }))}
            onCreated={({ gl }: { gl: WebGLRenderer }) => {
              perf.setRenderer(gl)
              perf.mark('renderer-ready')
              gl.toneMapping = ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
              gl.outputColorSpace = SRGBColorSpace
              gl.setClearColor('#0b0806')
              onRenderer?.(gl)
            }}
          >
            <Suspense fallback={null}>
              {slots ? (
                slots.map((s) => <SlotHost key={s.key} slot={s} active={s.key === activeKey} controller={controller} onMount={slotMount} />)
              ) : (
                <World key={worldKey} controller={controller} scene={scene} onMount={onWorldMount} />
              )}
            </Suspense>
            {slots && <Warmer slots={slots} busy={busy ?? never} onReady={onSlotReady ?? noop} />}
            <OrbitControls makeDefault enabled={free} enableDamping={false} onChange={() => controller.render()} maxPolarAngle={Math.PI * 0.499} />
            <Bridge controller={controller} onReady={ready} free={free} />
          </Canvas>
        </div>
      </FrameContext.Provider>
      {overlays && <Overlays ev={ev} safe={safe} />}
    </div>
  )
}
