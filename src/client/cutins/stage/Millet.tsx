// A millet field for the cut-ins: combed ridges along x (as on the board, Terrain.tsx) with instanced stalks that catch,
// burn and char according to the fire model. Stalk state is a pure function of story time.
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import {
  BoxGeometry,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { burnState, igniteTime, milletLayout, type FieldBox, type Ignition } from '../fireModel'
import { useFrameRef } from './Stage'

const GOLD = ['#a99c66', '#b7aa78', '#9a8c5a', '#b0a470'].map((c) => new Color(c))
const CHAR = new Color('#17110d')
const SCORCH = new Color('#6b3a14')

function stalkGeometry() {
  const stem = new CylinderGeometry(0.0055, 0.011, 1, 3, 1, true)
  const head = new ConeGeometry(0.017, 0.4, 4, 1, true).translate(0, 0.68, 0)
  return mergeGeometries([stem, head], false)!
}

export interface MilletProps {
  box: FieldBox
  seed: number
  ignitions: readonly Ignition[]
  clear?: { x: number; z: number; r: number }[]
  /** Unit vector the stalks lean toward (the wind), in x/z. */
  wind?: [number, number]
}

export function Millet({ box, seed, ignitions, clear = [], wind = [1, 0] }: MilletProps) {
  const frame = useFrameRef()
  const model = useMemo(() => {
    const { rows, stalks } = milletLayout(box, seed, clear)
    const tig = stalks.map((s) => igniteTime(ignitions, s.x, s.z, seed))
    const geo = stalkGeometry()
    const burn = new InstancedBufferAttribute(new Float32Array(stalks.length), 1)
    geo.setAttribute('aBurn', burn)
    const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: 2 })
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBurn;\nvarying float vBurn;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBurn = aBurn;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBurn;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.3, 0.04) * vBurn * 1.25;')
    }
    const mesh = new InstancedMesh(geo, mat, stalks.length)
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    const ridgeMat = new MeshStandardMaterial({ color: '#8d7142', roughness: 0.95 })
    const ridgeGeo = new BoxGeometry(box.x1 - box.x0 + 0.5, 0.05, 0.1)
    const furrowGeo = new BoxGeometry(box.x1 - box.x0 + 0.6, 0.006, box.z1 - box.z0 + 0.5)
    // the ground under the field: a small texture that darkens to ash and glows where the fire is
    const TW = 180
    const TH = Math.max(16, Math.round((TW * (box.z1 - box.z0 + 0.5)) / (box.x1 - box.x0 + 0.6)))
    const mk = (): DataTexture => {
      const t = new DataTexture(new Uint8Array(TW * TH * 4), TW, TH, RGBAFormat)
      t.magFilter = LinearFilter
      t.minFilter = LinearFilter
      t.colorSpace = SRGBColorSpace
      return t
    }
    const ashTex = mk()
    const glowTex = mk()
    const ground = new Float32Array(TW * TH)
    for (let j = 0; j < TH; j++) {
      for (let i = 0; i < TW; i++) {
        const x = box.x0 - 0.3 + ((i + 0.5) / TW) * (box.x1 - box.x0 + 0.6)
        // texture v runs from +z (top row) to -z on a plane viewed from above
        const z = box.z1 + 0.25 - ((j + 0.5) / TH) * (box.z1 - box.z0 + 0.5)
        ground[j * TW + i] = igniteTime(ignitions, x, z, seed)
      }
    }
    const furrowMat = new MeshStandardMaterial({ color: '#ffffff', map: ashTex, emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 1.0, roughness: 1 })
    return { rows, stalks, tig, mesh, burn, mat, ridgeMat, ridgeGeo, furrowGeo, furrowMat, ashTex, glowTex, ground, TW, TH }
  }, [box, seed, ignitions, clear])

  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(), c: new Color() }), [])
  const lean = Math.atan2(wind[1], wind[0])

  useFrame(() => {
    const { t, story } = frame.current
    const { stalks, tig, mesh, burn } = model
    for (let i = 0; i < stalks.length; i++) {
      const s = stalks[i]!
      const st = burnState(tig[i]!, story)
      const sway = Math.sin(t * 2.1 + s.phase) * 0.035 + Math.sin(t * 0.7 + s.phase * 2) * 0.03
      // lean downwind; burnt stalks bow over further as they collapse
      const lz = -(0.08 + sway) - st.char * 0.35
      tmp.e.set(0, -lean, lz, 'YXZ')
      tmp.q.setFromEuler(tmp.e)
      const h = s.h * st.height
      tmp.p.set(s.x, 0.035 + h / 2, s.z)
      tmp.s.set(1, h, 1)
      tmp.m.compose(tmp.p, tmp.q, tmp.s)
      mesh.setMatrixAt(i, tmp.m)
      tmp.c.copy(GOLD[s.c]!).lerp(SCORCH, Math.min(1, st.char * 1.6)).lerp(CHAR, Math.max(0, (st.char - 0.5) * 2))
      mesh.setColorAt(i, tmp.c)
      const flick = 0.82 + 0.18 * Math.sin(story * 19 + s.phase * 9)
      burn.setX(i, st.phase === 'fresh' ? 0 : st.glow * flick)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    burn.needsUpdate = true
    // ground
    const { ashTex, glowTex, ground, TW, TH } = model
    const a = ashTex.image.data as Uint8Array
    const g = glowTex.image.data as Uint8Array
    for (let k = 0; k < TW * TH; k++) {
      const age = story - ground[k]!
      let r = 169
      let gg = 141
      let b = 90
      let gl = 0
      if (age > 0) {
        const ashK = Math.min(1, age / 2.2)
        r = 169 + (46 - 169) * ashK
        gg = 141 + (36 - 141) * ashK
        b = 90 + (28 - 90) * ashK
        gl = age < 2.4 ? Math.max(0, Math.sin(Math.min(1, age / 0.5) * 1.57) * (1 - age / 2.4)) : 0
      }
      a[k * 4] = r
      a[k * 4 + 1] = gg
      a[k * 4 + 2] = b
      a[k * 4 + 3] = 255
      g[k * 4] = 255 * gl
      g[k * 4 + 1] = 70 * gl
      g[k * 4 + 2] = 10 * gl
      g[k * 4 + 3] = 255
    }
    ashTex.needsUpdate = true
    glowTex.needsUpdate = true
  })

  const cx = (box.x0 + box.x1) / 2
  const cz = (box.z0 + box.z1) / 2
  return (
    <group>
      <mesh geometry={model.furrowGeo} material={model.furrowMat} position={[cx, 0.003, cz]} receiveShadow />
      {model.rows.map((z, i) => (
        <mesh key={i} geometry={model.ridgeGeo} material={model.ridgeMat} position={[cx, 0.025, z]} receiveShadow castShadow />
      ))}
      <primitive object={model.mesh} />
    </group>
  )
}
