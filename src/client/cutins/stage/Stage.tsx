// The miniature stage of docs/spec/51 "Concept": the table's sand, the dark tent for a sky, hanging lanterns as warm
// bokeh, a warm key light and a rim light. Everything here is a function of the clock (no real-time state).
import { TIERS, tierNow, useQuality } from '../quality'
import { useThree } from '@react-three/fiber'
import { useCutinFrame } from './slot'
import { createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  type Texture,
} from 'three'
import type { Evaluated } from '../timeline'
import { rand, srand } from '../rng'
import { ParticleBuffer } from './ParticleBuffer'
import { makeBokehTexture, makeGlowTexture, makeSandTexture } from './textures'
import { keep } from '../gpu'

/** The current evaluated frame, written by the player and read by every world component in useFrame. */
export const FrameContext = createContext<MutableRefObject<Evaluated> | null>(null)
export function useFrameRef(): MutableRefObject<Evaluated> {
  const c = useContext(FrameContext)
  if (!c) throw new Error('FrameContext missing')
  return c
}

/** Pixels per world unit at distance 1, for point sprites. */
export function pxPerUnit(height: number, fovDeg: number): number {
  return height / (2 * Math.tan((fovDeg * Math.PI) / 360))
}

// ---- sky --------------------------------------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = smoothstep(-0.05, 0.75, h);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.7));
  // tent cloth: panel seams and a soft warm wash low on the walls
  float ang = atan(d.x, d.z) / 6.2831853;
  float seam = abs(fract(ang * 14.0) - 0.5);
  float line = smoothstep(0.495, 0.5, seam) * smoothstep(-0.02, 0.2, h) * (1.0 - smoothstep(0.2, 0.9, h));
  col += vec3(0.05, 0.034, 0.02) * line;
  col += vec3(0.07, 0.035, 0.012) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.8;
  if (h < 0.0) col = uHorizon * 0.6;
  gl_FragColor = vec4(col, 1.0);
}
`

// The stage is the same in every scene: its geometry, materials and textures are built once and shared by every cut-in of
// the battle (docs/spec/51 "Performance: warm-up and reuse"), so a new scene uploads none of them again.
let stageCache: {
  sky: { mat: ShaderMaterial; geo: SphereGeometry }
  table: { sand: MeshStandardMaterial; rim: MeshStandardMaterial; stud: MeshStandardMaterial; floor: MeshStandardMaterial; top: PlaneGeometry; floorGeo: PlaneGeometry; rimX: BoxGeometry; rimZ: BoxGeometry; body: BoxGeometry; studGeo: BoxGeometry }
  tex: { bokeh: Texture; glow: Texture }
} | null = null
function stage(): NonNullable<typeof stageCache> {
  if (stageCache) return stageCache
  const w = 0.32
  const sandTex = keep(makeSandTexture())
  sandTex.repeat.set(TABLE.halfX * 2 * 0.85, TABLE.halfZ * 2 * 0.85)
  sandTex.wrapS = sandTex.wrapT = RepeatWrapping
  stageCache = {
    sky: {
      mat: new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: { uHorizon: { value: new Color('#2b1a10') }, uZenith: { value: new Color('#070504') } },
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
      geo: keep(new SphereGeometry(60, 32, 16)),
    },
    table: {
      sand: new MeshStandardMaterial({ color: '#c2a878', map: sandTex, bumpMap: sandTex, bumpScale: 1.4, roughness: 1, metalness: 0 }),
      rim: new MeshStandardMaterial({ color: '#3a1410', roughness: 0.5, metalness: 0.1 }),
      stud: new MeshStandardMaterial({ color: '#a07a3a', roughness: 0.4, metalness: 0.75 }),
      floor: new MeshStandardMaterial({ color: '#17100c', roughness: 1 }),
      top: keep(new PlaneGeometry(TABLE.halfX * 2, TABLE.halfZ * 2).rotateX(-Math.PI / 2)),
      floorGeo: keep(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2)),
      rimX: keep(new BoxGeometry(TABLE.halfX * 2 + w * 2, 0.34, w)),
      rimZ: keep(new BoxGeometry(w, 0.34, TABLE.halfZ * 2)),
      body: keep(new BoxGeometry(TABLE.halfX * 2 + w * 2, 0.9, TABLE.halfZ * 2 + w * 2)),
      studGeo: keep(new BoxGeometry(w * 1.15, 0.1, w * 1.15)),
    },
    tex: { bokeh: keep(makeBokehTexture()), glow: keep(makeGlowTexture()) },
  }
  return stageCache!
}

function Sky() {
  const { mat, geo } = stage().sky
  return <mesh geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
}

// ---- table ------------------------------------------------------------------------------------------------------

export const TABLE = { halfX: 10, halfZ: 8 }

function Table() {
  const t = stage().table
  const w = 0.32
  return (
    <group>
      <mesh geometry={t.top} material={t.sand} receiveShadow />
      <mesh geometry={t.floorGeo} material={t.floor} position={[0, -0.9, 0]} />
      {/* lacquer rim */}
      <mesh position={[0, 0.0, -TABLE.halfZ - w / 2]} geometry={t.rimX} material={t.rim} receiveShadow />
      <mesh position={[0, 0.0, TABLE.halfZ + w / 2]} geometry={t.rimX} material={t.rim} receiveShadow />
      <mesh position={[-TABLE.halfX - w / 2, 0.0, 0]} geometry={t.rimZ} material={t.rim} receiveShadow />
      <mesh position={[TABLE.halfX + w / 2, 0.0, 0]} geometry={t.rimZ} material={t.rim} receiveShadow />
      {/* the table body, dropping away below the sand */}
      <mesh position={[0, -0.48, 0]} geometry={t.body} material={t.rim} />
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx! * (TABLE.halfX + w / 2), 0.2, sz! * (TABLE.halfZ + w / 2)]} geometry={t.studGeo} material={t.stud} />
      ))}
    </group>
  )
}

// ---- lanterns (bokeh) -------------------------------------------------------------------------------------------

interface LanternSpec {
  base: [number, number, number]
  size: number
  hue: 'amber' | 'red' | 'pale'
  alpha: number
  phase: number
}

function lanternLayout(seed: number, focus: [number, number]): LanternSpec[] {
  // Review note (2026-11-01): big red and white orbs in the sky read as balloons. The lanterns are now small, dim, warm points
  // hung far off around the tent walls: a hint of light in the dark, never a shape.
  const out: LanternSpec[] = []
  for (let i = 0; i < 30; i++) {
    const a = rand(seed, i, 1) * Math.PI * 2
    const rad = 13 + rand(seed, i, 2) * 18
    const hgt = 2.5 + rand(seed, i, 3) * 7
    const r5 = rand(seed, i, 5)
    out.push({
      base: [focus[0] + Math.cos(a) * rad, hgt, focus[1] + Math.sin(a) * rad],
      size: 0.22 + rand(seed, i, 4) * 0.3,
      hue: r5 < 0.8 ? 'amber' : 'pale',
      alpha: 0.12 + rand(seed, i, 6) * 0.16,
      phase: rand(seed, i, 7) * 6.28,
    })
  }
  return out
}

const HUE: Record<LanternSpec['hue'], string> = { amber: '#e9a85a', red: '#c8603a', pale: '#f3d9ac' }

function Lanterns({ seed, focus }: { seed: number; focus: [number, number] }) {
  const frame = useFrameRef()
  const specs = useMemo(() => lanternLayout(seed, focus), [seed, focus])
  const tex = stage().tex
  const group = useRef<Group>(null)
  const sprites = useMemo(() => {
    const list: { bokeh: Sprite; core: Sprite; spec: LanternSpec }[] = []
    for (const spec of specs) {
      const bokeh = new Sprite(new SpriteMaterial({ map: tex.bokeh, color: HUE[spec.hue], transparent: true, opacity: spec.alpha, blending: AdditiveBlending, depthWrite: false, fog: false }))
      const core = new Sprite(new SpriteMaterial({ map: tex.glow, color: '#fff0c8', transparent: true, opacity: spec.alpha * 0.8, blending: AdditiveBlending, depthWrite: false, fog: false }))
      bokeh.renderOrder = -5
      core.renderOrder = -4
      list.push({ bokeh, core, spec })
    }
    return list
  }, [specs, tex])
  useEffect(() => {
    const g = group.current
    if (!g) return
    for (const s of sprites) g.add(s.bokeh, s.core)
    return () => {
      for (const s of sprites) g.remove(s.bokeh, s.core)
    }
  }, [sprites])
  useCutinFrame(() => {
    const t = frame.current.t
    for (const { bokeh, core, spec } of sprites) {
      const sway = Math.sin(t * 0.9 + spec.phase) * 0.06
      const flick = 0.92 + 0.08 * Math.sin(t * 7.3 + spec.phase * 3.1)
      bokeh.position.set(spec.base[0] + sway, spec.base[1] + Math.sin(t * 0.7 + spec.phase) * 0.08, spec.base[2])
      bokeh.scale.setScalar(spec.size * flick)
      core.position.copy(bokeh.position)
      core.scale.setScalar(spec.size * 0.35 * flick)
    }
  })
  return <group ref={group} />
}

// ---- lights -----------------------------------------------------------------------------------------------------

const initialMap = TIERS[tierNow()].shadowMap

function Lights({ focus, keyDir, rimDir }: { focus: [number, number]; keyDir: [number, number, number]; rimDir: [number, number, number] }) {
  const key = useRef<DirectionalLight>(null)
  const { scene } = useThree()
  // the shadow map's size follows the quality tier (no program depends on it): a new size takes a new map
  const mapSize = useQuality((s) => TIERS[s.tier].shadowMap)
  useEffect(() => {
    const k = key.current
    if (!k || (k.shadow.mapSize.x === mapSize && k.shadow.mapSize.y === mapSize)) return
    k.shadow.mapSize.set(mapSize, mapSize)
    k.shadow.map?.dispose()
    k.shadow.map = null
  }, [mapSize])
  useEffect(() => {
    const k = key.current
    if (!k) return
    k.target.position.set(focus[0], 0, focus[1])
    scene.add(k.target)
    return () => {
      scene.remove(k.target)
    }
  }, [focus, scene])
  return (
    <>
      <hemisphereLight args={['#4a3426', '#1d130d', 0.95]} />
      <directionalLight
        ref={key}
        color="#ffdcb4"
        intensity={2.6}
        position={[focus[0] + keyDir[0], keyDir[1], focus[1] + keyDir[2]]}
        castShadow
        shadow-mapSize={[initialMap, initialMap]}
        shadow-camera-left={-6.5}
        shadow-camera-right={6.5}
        shadow-camera-top={6.5}
        shadow-camera-bottom={-6.5}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
        shadow-normalBias={0.01}
      />
      <directionalLight color="#ff9a55" intensity={1.5} position={[focus[0] + rimDir[0], rimDir[1], focus[1] + rimDir[2]]} />
      <directionalLight color="#6f8fa8" intensity={0.55} position={[focus[0] - rimDir[0] * 0.6, 4, focus[1] - rimDir[2] * 0.6]} />
    </>
  )
}

/**
 * Every cut-in world draws under the same set of lights: the stage's hemisphere light and three directional lights (the key
 * casts the only shadow) plus exactly POINT_LIGHTS point lights. Three.js compiles a shader program per light count, so with
 * one light rig a single warm-up compiles the programs of every scene. A world with fewer point lights of its own pads with
 * unlit ones (intensity 0 adds nothing to the picture).
 */
export const POINT_LIGHTS = 3
export function PadLights({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => (
        <pointLight key={i} intensity={0} distance={1} decay={2} position={[0, -4, 0]} />
      ))}
    </>
  )
}

// ---- ambient dust motes -----------------------------------------------------------------------------------------

function Motes({ seed, focus, count, strength }: { seed: number; focus: [number, number]; count: number; strength: number }) {
  const frame = useFrameRef()
  const buf = useMemo(() => new ParticleBuffer(count, 'add', 1.2), [count])
  useCutinFrame(({ camera, gl }) => {
    const t = frame.current.t
    const fov = (camera as { fov?: number }).fov ?? 40
    buf.begin(pxPerUnit(gl.domElement.height, fov))
    for (let i = 0; i < count; i++) {
      const bx = focus[0] + srand(seed, i, 1) * 5.5
      const bz = focus[1] + srand(seed, i, 2) * 6.5
      const by = 0.05 + rand(seed, i, 3) * 1.5
      const sp = 0.04 + rand(seed, i, 4) * 0.08
      const x = bx + Math.sin(t * sp * 4 + rand(seed, i, 5) * 6.28) * 0.4 + t * 0.03
      const y = by + Math.sin(t * sp * 5 + rand(seed, i, 6) * 6.28) * 0.12
      const z = bz + Math.cos(t * sp * 3 + rand(seed, i, 7) * 6.28) * 0.35
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (1.5 + rand(seed, i, 8) * 3) + i))
      buf.push(x, y, z, 0.012 + rand(seed, i, 9) * 0.03, 1.0, 0.8, 0.5, strength * tw * (0.2 + 0.8 * rand(seed, i, 10)))
    }
    buf.end()
  })
  return <primitive object={buf.points} />
}

// ---- the stage --------------------------------------------------------------------------------------------------

export interface StageProps {
  seed: number
  focus: [number, number]
  keyDir?: [number, number, number]
  rimDir?: [number, number, number]
  motes?: number
  moteStrength?: number
}

/** The frame probe's object group (tools/perf/cutin-frame.mjs). */
const STAGE_TAG = { perf: 'stage' }

export function Stage({ seed, focus, keyDir = [-5, 8, -6], rimDir = [6, 3, 8], motes = 110, moteStrength = 0.5 }: StageProps) {
  return (
    <group userData={STAGE_TAG}>
      <fogExp2 attach="fog" args={['#1a110b', 0.05]} />
      <Sky />
      <Table />
      <Lanterns seed={seed} focus={focus} />
      <Lights focus={focus} keyDir={keyDir} rimDir={rimDir} />
      <Motes seed={seed} focus={focus} count={motes} strength={moteStrength} />
    </group>
  )
}

// suppress unused-import warnings for geometry helpers kept for scene files
export { BoxGeometry, DoubleSide, Mesh }
