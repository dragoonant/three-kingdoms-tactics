// The sand table itself: sand blocks, millet, trees, clay houses, silk river, string grid and pegs.
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  type Material,
} from 'three'
import type { Terrain as TerrainId } from '../../engine'
import { BOARD_H, BOARD_W, BRIDGE_TOP, COLORS, SAND, TOP, hash2, tileX, tileZ } from './layout'
import { sandTexture } from './textures'

interface Item {
  x: number
  y: number
  z: number
  sx?: number
  sy?: number
  sz?: number
  ry?: number
  color: string
}

const dummy = new Object3D()
const tmpColor = new Color()

function Inst({
  items,
  geometry,
  material,
  cast = false,
  receive = false,
  onPointerMove,
  onClick,
  onPointerOut,
}: {
  items: Item[]
  geometry: BufferGeometry
  material: Material
  cast?: boolean
  receive?: boolean
  onPointerMove?: (e: { instanceId?: number; stopPropagation: () => void }) => void
  onClick?: (e: { instanceId?: number; stopPropagation: () => void }) => void
  onPointerOut?: () => void
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    items.forEach((it, i) => {
      dummy.position.set(it.x, it.y, it.z)
      dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)
      dummy.rotation.set(0, it.ry ?? 0, 0)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, tmpColor.set(it.color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])
  if (items.length === 0) return null
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={cast}
      receiveShadow={receive}
      frustumCulled={false}
      onPointerMove={onPointerMove as never}
      onClick={onClick as never}
      onPointerOut={onPointerOut}
    />
  )
}

// ---- shared geometry / materials (created once)
const box = new BoxGeometry(1, 1, 1)
const stalkGeo = new CylinderGeometry(0.006, 0.011, 1, 3, 1, true)
const headGeo = new ConeGeometry(0.03, 0.1, 4, 1, true)
const trunkGeo = new CylinderGeometry(0.022, 0.03, 1, 4, 1, true)
const coneGeo = new ConeGeometry(1, 1, 6, 1, true)
const ballGeo = new IcosahedronGeometry(1, 0)
const roofGeo = new ConeGeometry(0.72, 1, 4)
const pegGeo = new CylinderGeometry(0.028, 0.034, 0.12, 8)
const planeGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

const sandMat = new MeshStandardMaterial({ color: '#ffffff', map: sandTexture(), roughness: 1, metalness: 0 })
const plainMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 })
const leafMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true })
const woodMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })
const clayMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 })
const bronzeMat = new MeshStandardMaterial({ color: COLORS.bronze, roughness: 0.4, metalness: 0.7 })

const timeUniform = { value: 0 }
const silkMat = new MeshStandardMaterial({ color: '#2f6a96', roughness: 0.22, metalness: 0.25, emissive: '#0b2a47', emissiveIntensity: 0.5, side: DoubleSide })
silkMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = timeUniform
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvec4 wp4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwp4 = instanceMatrix * wp4;\n#endif\nvWPos = (modelMatrix * wp4).xyz;',
    )
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float w1 = sin(vWPos.z * 4.0 + vWPos.x * 1.5 + uTime * 0.8) * 0.5 + 0.5;
      float w2 = sin(vWPos.z * 11.0 - vWPos.x * 2.0 - uTime * 1.6) * 0.5 + 0.5;
      diffuseColor.rgb += vec3(0.04, 0.08, 0.11) * w1 + vec3(0.14, 0.16, 0.17) * pow(w2, 7.0);`,
    )
}
const shallowMat = new MeshStandardMaterial({ color: '#7fb4cf', transparent: true, opacity: 0.38, roughness: 0.3, metalness: 0.1, depthWrite: false })

const GREENS = ['#35603a', '#2c5232', '#46703f', '#3b5a2b', '#2f6a45']

function isRiverish(t: TerrainId | undefined): boolean {
  return t === 'river'
}

export function Terrain({
  terrain,
  bridges,
  onHover,
  onPick,
  onLeave,
}: {
  terrain: TerrainId[]
  bridges: { x: number; y: number }[]
  onHover: (x: number, y: number) => void
  onPick: (x: number, y: number) => void
  onLeave: () => void
}) {
  const key = terrain.join(',')
  const bridgeKey = bridges.map((b) => `${b.x}:${b.y}`).join(',')
  const built = useMemo(() => {
    const blocks: Item[] = []
    const caps: Item[] = []
    const ridges: Item[] = []
    const stalks: Item[] = []
    const heads: Item[] = []
    const trunks: Item[] = []
    const cones: Item[] = []
    const balls: Item[] = []
    const houses: Item[] = []
    const roofs: Item[] = []
    const silk: Item[] = []
    const shallow: Item[] = []
    const planks: Item[] = []
    const rails: Item[] = []
    const isBridge = (x: number, y: number): boolean => bridges.some((b) => b.x === x && b.y === y)
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const t = terrain[y * BOARD_W + x] ?? 'plain'
        const bridge = isBridge(x, y)
        const eff: TerrainId = bridge ? 'river' : t
        const top = TOP[eff]
        const wx = tileX(x)
        const wz = tileZ(y)
        const jitter = (hash2(x, y, 1) - 0.5) * 0.06
        const base = new Color(SAND[eff]).offsetHSL(0, 0, jitter)
        const h = top + 0.12
        blocks.push({ x: wx, y: (top - 0.12) / 2, z: wz, sx: 0.992, sy: h, sz: 0.992, color: '#' + base.getHexString() })
        if (t === 'hill') {
          caps.push({ x: wx, y: top + 0.02, z: wz, sx: 0.8, sy: 0.05, sz: 0.8, color: '#' + new Color(SAND.hill).offsetHSL(0, 0, 0.04 + jitter).getHexString() })
        }
        if (eff === 'river') silk.push({ x: wx, y: 0.052, z: wz, sx: 1.0, sz: 1.0, color: '#ffffff' })
        if (t === 'ford') shallow.push({ x: wx, y: top + 0.006, z: wz, sx: 0.96, sz: 0.96, color: '#ffffff' })
        if (t === 'farm') {
          for (let r = 0; r < 4; r++) {
            const zz = wz - 0.33 + r * 0.22
            ridges.push({ x: wx, y: top + 0.02, z: zz, sx: 0.92, sy: 0.05, sz: 0.1, color: '#8d7142' })
            for (let k = 0; k < 6; k++) {
              const jx = (hash2(x * 7 + k, y * 11 + r, 2) - 0.5) * 0.05
              const sx = wx - 0.38 + k * 0.152 + jx
              const hgt = 0.2 + hash2(x + k, y + r, 3) * 0.06
              const c = ['#c8a23a', '#d6b24a', '#b99532', '#cdb05a'][(k + r + x) % 4]!
              stalks.push({ x: sx, y: top + 0.045 + hgt / 2, z: zz + (hash2(k, r, x + y) - 0.5) * 0.03, sy: hgt, color: c })
              heads.push({ x: sx, y: top + 0.045 + hgt + 0.03, z: zz, color: '#e3bd4c' })
            }
          }
        }
        if (t === 'forest') {
          for (let k = 0; k < 3; k++) {
            const tx = wx + (hash2(x, y, 10 + k) - 0.5) * 0.62
            const tz = wz + (hash2(x, y, 20 + k) - 0.5) * 0.62
            const g = GREENS[Math.floor(hash2(x, y, 30 + k) * GREENS.length)]!
            const sz = 0.9 + hash2(x, y, 40 + k) * 0.4
            if (k === 2) {
              trunks.push({ x: tx, y: top + 0.05, z: tz, sy: 0.12 * sz, color: '#5b3a22' })
              balls.push({ x: tx, y: top + 0.2 * sz, z: tz, sx: 0.15 * sz, sy: 0.14 * sz, sz: 0.15 * sz, color: g })
            } else {
              trunks.push({ x: tx, y: top + 0.04, z: tz, sy: 0.1 * sz, color: '#5b3a22' })
              cones.push({ x: tx, y: top + 0.22 * sz, z: tz, sx: 0.17 * sz, sy: 0.3 * sz, sz: 0.17 * sz, color: g })
              cones.push({ x: tx, y: top + 0.38 * sz, z: tz, sx: 0.12 * sz, sy: 0.24 * sz, sz: 0.12 * sz, color: g })
            }
          }
        }
        if (t === 'village') {
          const spots: [number, number, number][] = [
            [-0.2, -0.2, 0.2],
            [0.22, -0.1, -0.15],
            [-0.05, 0.25, 0.1],
          ]
          spots.forEach(([dx, dz, ry], i) => {
            houses.push({ x: wx + dx, y: top + 0.09, z: wz + dz, sx: 0.28, sy: 0.18, sz: 0.22, ry, color: i === 1 ? '#b0683f' : '#bd7a4d' })
            roofs.push({ x: wx + dx, y: top + 0.18 + 0.07, z: wz + dz, sx: 0.27, sy: 0.15, sz: 0.2, ry: ry + Math.PI / 4, color: '#5d3b2c' })
          })
        }
        if (bridge) {
          planks.push({ x: wx, y: BRIDGE_TOP - 0.03, z: wz, sx: 1.02, sy: 0.06, sz: 0.62, color: '#9b7a4a' })
          for (const s of [-1, 1]) rails.push({ x: wx, y: BRIDGE_TOP + 0.07, z: wz + s * 0.3, sx: 1.02, sy: 0.05, sz: 0.04, color: '#6e4d2c' })
          for (const s of [-1, 1]) for (const k of [-0.45, 0, 0.45]) rails.push({ x: wx + k, y: BRIDGE_TOP + 0.02, z: wz + s * 0.3, sx: 0.05, sy: 0.14, sz: 0.05, color: '#6e4d2c' })
        }
      }
    }
    // string grid at each tile's own height
    const verts: number[] = []
    const heightAt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return 0
      const t = terrain[y * BOARD_W + x] ?? 'plain'
      if (isBridge(x, y)) return TOP.river
      return TOP[t]
    }
    const seg = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
      verts.push(x0, h + 0.014, z0, x1, h + 0.014, z1)
    }
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const wx = tileX(x)
        const wz = tileZ(y)
        const h = heightAt(x, y)
        if (isRiverish(terrain[y * BOARD_W + x]) && !isBridge(x, y)) continue
        // north edge and west edge, using the higher of the two neighbours so lines never sink into hills
        const hn = Math.max(h, heightAt(x, y - 1))
        const hw = Math.max(h, heightAt(x - 1, y))
        seg(wx - 0.5, wz - 0.5, wx + 0.5, wz - 0.5, hn)
        seg(wx - 0.5, wz - 0.5, wx - 0.5, wz + 0.5, hw)
        if (x === BOARD_W - 1) seg(wx + 0.5, wz - 0.5, wx + 0.5, wz + 0.5, h)
        if (y === BOARD_H - 1) seg(wx - 0.5, wz + 0.5, wx + 0.5, wz + 0.5, h)
      }
    }
    const grid = new BufferGeometry()
    grid.setAttribute('position', new Float32BufferAttribute(verts, 3))
    const pegs: Item[] = []
    for (let i = 0; i <= BOARD_W; i++) {
      const wx = i - BOARD_W / 2
      pegs.push({ x: wx, y: 0.2, z: -BOARD_H / 2 - 0.14, color: '#ffffff' }, { x: wx, y: 0.2, z: BOARD_H / 2 + 0.14, color: '#ffffff' })
    }
    for (let j = 0; j <= BOARD_H; j++) {
      const wz = j - BOARD_H / 2
      pegs.push({ x: -BOARD_W / 2 - 0.14, y: 0.2, z: wz, color: '#ffffff' }, { x: BOARD_W / 2 + 0.14, y: 0.2, z: wz, color: '#ffffff' })
    }
    return { blocks, caps, ridges, stalks, heads, trunks, cones, balls, houses, roofs, silk, shallow, planks, rails, grid, pegs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bridgeKey])

  useFrame((s) => {
    timeUniform.value = s.clock.elapsedTime
  })

  const pickIdx = (e: { instanceId?: number }): { x: number; y: number } | null => {
    if (e.instanceId === undefined) return null
    return { x: e.instanceId % BOARD_W, y: Math.floor(e.instanceId / BOARD_W) }
  }

  return (
    <group>
      <Inst
        items={built.blocks}
        geometry={box}
        material={sandMat}
        cast
        receive
        onPointerMove={(e) => {
          const p = pickIdx(e)
          if (p) {
            e.stopPropagation()
            onHover(p.x, p.y)
          }
        }}
        onClick={(e) => {
          const p = pickIdx(e)
          if (p) {
            e.stopPropagation()
            onPick(p.x, p.y)
          }
        }}
        onPointerOut={onLeave}
      />
      <Inst items={built.caps} geometry={box} material={sandMat} receive />
      <Inst items={built.ridges} geometry={box} material={plainMat} receive />
      <Inst items={built.stalks} geometry={stalkGeo} material={plainMat} cast />
      <Inst items={built.heads} geometry={headGeo} material={plainMat} />
      <Inst items={built.trunks} geometry={trunkGeo} material={woodMat} cast />
      <Inst items={built.cones} geometry={coneGeo} material={leafMat} cast />
      <Inst items={built.balls} geometry={ballGeo} material={leafMat} cast />
      <Inst items={built.houses} geometry={box} material={clayMat} cast receive />
      <Inst items={built.roofs} geometry={roofGeo} material={clayMat} cast />
      <Inst items={built.silk} geometry={planeGeo} material={silkMat} receive />
      <Inst items={built.shallow} geometry={planeGeo} material={shallowMat} />
      <Inst items={built.planks} geometry={box} material={woodMat} cast receive />
      <Inst items={built.rails} geometry={box} material={woodMat} cast />
      <Inst items={built.pegs} geometry={pegGeo} material={bronzeMat} cast />
      <lineSegments geometry={built.grid} raycast={() => null}>
        <lineBasicMaterial color="#f3e8cb" transparent opacity={0.62} />
      </lineSegments>
    </group>
  )
}
