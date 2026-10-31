// The sand table itself: sand blocks, millet, trees, clay houses, silk water, brick walls and ramparts, timber gates,
// reed beds, ship decks, bridges, exit stakes, string grid and pegs. Works for any board size.
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
import { BRIDGE_TOP, COLORS, SAND, TOP, hash2 } from './layout'
import { gateAxis, hasWaterBelow, hullSides, isBridgeTile, parapetSides, terrainAt, bridgeAxis, type TerrainGrid } from './terrainModel'
import { sandTexture } from './textures'

interface Item {
  x: number
  y: number
  z: number
  sx?: number
  sy?: number
  sz?: number
  ry?: number
  rx?: number
  rz?: number
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
      dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0)
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
const reedGeo = new CylinderGeometry(0.006, 0.013, 1, 3, 1, true)
const headGeo = new ConeGeometry(0.03, 0.1, 4, 1, true)
const catGeo = new CylinderGeometry(0.02, 0.02, 0.1, 5)
const stakeGeo = new CylinderGeometry(0.026, 0.032, 1, 6)
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
const brickMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, metalness: 0 })
const bronzeMat = new MeshStandardMaterial({ color: COLORS.bronze, roughness: 0.4, metalness: 0.7 })

const timeUniform = { value: 0 }
/** Blue silk water with a moving sheen. `opacity` < 1 gives the thin film used on shallows and fords. */
function waterMaterial(color: string, emissive: string, emissiveIntensity: number, opacity: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color,
    roughness: 0.22,
    metalness: 0.25,
    emissive,
    emissiveIntensity,
    side: DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  })
  m.onBeforeCompile = (sh) => {
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
  return m
}
const silkMat = waterMaterial('#2f6a96', '#0b2a47', 0.5, 1)
const sheenMat = waterMaterial('#6fa9c8', '#10405f', 0.35, 0.42)
const shallowMat = new MeshStandardMaterial({ color: '#7fb4cf', transparent: true, opacity: 0.38, roughness: 0.3, metalness: 0.1, depthWrite: false })

const GREENS = ['#35603a', '#2c5232', '#46703f', '#3b5a2b', '#2f6a45']
const BRICKS = ['#b98b66', '#a97c59', '#c19a74', '#9f7352', '#b38461']
const MORTAR = '#6f604a'
const PLANKS = ['#9c7a4c', '#8e6e42', '#a5845a', '#97754a']
const REEDS = ['#b4be63', '#cbc972', '#9fae52', '#d3c474', '#aab45c']
const TIMBER = '#6e4426'

export interface TerrainProps {
  terrain: TerrainId[]
  width: number
  height: number
  bridges: { x: number; y: number }[]
  /** Exit tiles of escape objectives, marked with bamboo stakes. */
  exits: [number, number][]
  /** Banner colour of the gate's owner, and whether the player's side owns it (then the leaves stand open). */
  gateColour: string
  gateOpen: boolean
  onHover: (x: number, y: number) => void
  onPick: (x: number, y: number) => void
  onLeave: () => void
}

export function Terrain({ terrain, width, height, bridges, exits, gateColour, gateOpen, onHover, onPick, onLeave }: TerrainProps) {
  const key = `${width}x${height}:${terrain.join(',')}`
  const bridgeKey = bridges.map((b) => `${b.x}:${b.y}`).join(',')
  const exitKey = exits.map((e) => e.join(':')).join(',')
  const built = useMemo(() => {
    const g: TerrainGrid = { terrain, width, height }
    const tx = (x: number): number => x - (width - 1) / 2
    const tz = (y: number): number => y - (height - 1) / 2
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
    const sheen: Item[] = []
    const shallow: Item[] = []
    const planks: Item[] = []
    const rails: Item[] = []
    const bricks: Item[] = []
    const timber: Item[] = []
    const flags: Item[] = []
    const reeds: Item[] = []
    const cattails: Item[] = []
    const stakes: Item[] = []
    const tabs: Item[] = []
    const topOf = (x: number, y: number): number => {
      if (isBridgeTile(g, bridges, x, y)) return BRIDGE_TOP
      const t = terrainAt(g, x, y)
      return t ? TOP[t] : 0
    }

    /** A brick wall block: five (or `courses`) courses of running-bond bricks from the table up to `top`. */
    const brickWall = (wx: number, wz: number, x: number, y: number, top: number, courses: number): void => {
      const lo = -0.1
      const ch = (top - lo) / courses
      for (let c = 0; c < courses; c++) {
        const cy = lo + ch * (c + 0.5)
        const odd = c % 2 === 1
        // even courses: bricks at -0.33, 0, 0.33; odd courses are shifted by half a brick with half-bricks at the ends
        const offs: [number, number][] = odd
          ? [
              [-0.42, 0.14],
              [-0.17, 0.32],
              [0.17, 0.32],
              [0.42, 0.14],
            ]
          : [
              [-0.33, 0.32],
              [0, 0.32],
              [0.33, 0.32],
            ]
        offs.forEach(([ox, w], k) => {
          const col = BRICKS[Math.floor(hash2(x * 5 + k, y * 3 + c, 77) * BRICKS.length)]!
          bricks.push({ x: wx + ox, y: cy, z: wz, sx: w - 0.012, sy: ch - 0.014, sz: 0.995, color: col })
        })
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = terrain[y * width + x] ?? 'plain'
        const bridge = isBridgeTile(g, bridges, x, y)
        // a listed bridge stands on water; its own terrain is road
        const eff: TerrainId = bridge ? 'river' : t
        const top = TOP[eff]
        const wx = tx(x)
        const wz = tz(y)
        const jitter = (hash2(x, y, 1) - 0.5) * 0.06
        const baseHex = t === 'wall' || t === 'rampart' ? MORTAR : SAND[eff]
        const base = new Color(baseHex).offsetHSL(0, 0, jitter)
        const topMain = t === 'rampart' ? top - 0.02 : t === 'deck' ? TOP.river : top
        const h = topMain + 0.12
        blocks.push({ x: wx, y: (topMain - 0.12) / 2, z: wz, sx: 0.992, sy: h, sz: 0.992, color: '#' + base.getHexString() })
        if (t === 'hill') {
          caps.push({ x: wx, y: top + 0.02, z: wz, sx: 0.8, sy: 0.05, sz: 0.8, color: '#' + new Color(SAND.hill).offsetHSL(0, 0, 0.04 + jitter).getHexString() })
        }
        if (hasWaterBelow(eff, bridge)) silk.push({ x: wx, y: 0.052, z: wz, sx: 1.0, sz: 1.0, color: '#ffffff' })
        if (t === 'ford') shallow.push({ x: wx, y: top + 0.006, z: wz, sx: 0.96, sz: 0.96, color: '#ffffff' })
        if (t === 'shallows') sheen.push({ x: wx, y: top + 0.012, z: wz, sx: 1.0, sz: 1.0, color: '#ffffff' })
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
            const tx0 = wx + (hash2(x, y, 10 + k) - 0.5) * 0.62
            const tz0 = wz + (hash2(x, y, 20 + k) - 0.5) * 0.62
            const gcol = GREENS[Math.floor(hash2(x, y, 30 + k) * GREENS.length)]!
            const sz = 0.9 + hash2(x, y, 40 + k) * 0.4
            if (k === 2) {
              trunks.push({ x: tx0, y: top + 0.05, z: tz0, sy: 0.12 * sz, color: '#5b3a22' })
              balls.push({ x: tx0, y: top + 0.2 * sz, z: tz0, sx: 0.15 * sz, sy: 0.14 * sz, sz: 0.15 * sz, color: gcol })
            } else {
              trunks.push({ x: tx0, y: top + 0.04, z: tz0, sy: 0.1 * sz, color: '#5b3a22' })
              cones.push({ x: tx0, y: top + 0.22 * sz, z: tz0, sx: 0.17 * sz, sy: 0.3 * sz, sz: 0.17 * sz, color: gcol })
              cones.push({ x: tx0, y: top + 0.38 * sz, z: tz0, sx: 0.12 * sz, sy: 0.24 * sz, sz: 0.12 * sz, color: gcol })
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
        if (t === 'reeds') {
          // dense thin stalks, slightly leaning, a third of them topped with a cattail
          for (let k = 0; k < 18; k++) {
            const rx = wx + (hash2(x * 13 + k, y, 5) - 0.5) * 0.9
            const rz = wz + (hash2(x, y * 13 + k, 6) - 0.5) * 0.9
            const hgt = 0.3 + hash2(x + k, y * 3 + k, 7) * 0.26
            const col = REEDS[Math.floor(hash2(x + k, y + k, 8) * REEDS.length)]!
            const lx = (hash2(k, x + y, 9) - 0.5) * 0.24
            const lz = (hash2(k, x * y + 1, 10) - 0.5) * 0.24
            reeds.push({ x: rx, y: top + hgt / 2, z: rz, sy: hgt, rx: lz, rz: -lx, color: col })
            if (k % 3 === 0) cattails.push({ x: rx + lx * hgt * 0.5, y: top + hgt, z: rz + lz * hgt * 0.5, color: '#6b4a2b' })
          }
        }
        if (t === 'wall') {
          brickWall(wx, wz, x, y, top - 0.03, 5)
          // a capping course of flat tiles on top, so the wall reads from above as well as from the side
          caps.push({ x: wx, y: top - 0.015, z: wz, sx: 1.0, sy: 0.04, sz: 1.0, color: '#c9ab84' })
          caps.push({ x: wx, y: top + 0.012, z: wz, sx: 0.78, sy: 0.02, sz: 0.78, color: '#d6bb96' })
        }
        if (t === 'rampart') {
          brickWall(wx, wz, x, y, top - 0.04, 4)
          // plank walkway on top, and a low parapet along the sides that do not continue the wall
          planks.push({ x: wx, y: top - 0.02, z: wz, sx: 0.92, sy: 0.04, sz: 0.92, color: '#a98a5c' })
          for (const d of parapetSides(g, x, y)) {
            const horiz = d === 'N' || d === 'S'
            const off = 0.455
            const px = wx + (d === 'E' ? off : d === 'W' ? -off : 0)
            const pz = wz + (d === 'S' ? off : d === 'N' ? -off : 0)
            bricks.push({ x: px, y: top + 0.045, z: pz, sx: horiz ? 0.99 : 0.09, sy: 0.1, sz: horiz ? 0.09 : 0.99, color: BRICKS[(x + y) % BRICKS.length]! })
          }
        }
        if (t === 'gate') {
          // packed earth road between two timber posts and a roofed lintel; leaves stand open for the owner, barred for the rest
          const axis = gateAxis(g, x, y)
          const put = (list: Item[], lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string): void => {
            list.push(axis === 'ns' ? { x: wx + lx, y: ly, z: wz + lz, sx, sy, sz, color } : { x: wx + lz, y: ly, z: wz + lx, sx: sz, sy, sz: sx, color })
          }
          for (const s of [-1, 1]) {
            put(timber, 0, top + 0.5, s * 0.4, 0.2, 1.0, 0.2, TIMBER)
            put(timber, 0, top + 0.02, s * 0.4, 0.3, 0.06, 0.3, '#4a3320')
          }
          put(timber, 0, top + 0.98, 0, 0.26, 0.12, 1.0, '#5a3a22')
          put(timber, 0, top + 1.08, 0, 0.36, 0.06, 1.06, '#7a2a1d')
          put(timber, 0, top + 1.14, 0, 0.12, 0.07, 0.9, '#7a2a1d')
          if (gateOpen) {
            for (const s of [-1, 1]) put(timber, 0, top + 0.4, s * 0.26, 0.5, 0.76, 0.05, '#8a5a2e')
          } else {
            for (const s of [-1, 1]) {
              put(timber, 0, top + 0.4, s * 0.2, 0.06, 0.76, 0.34, '#8a5a2e')
              put(timber, 0.035, top + 0.5, s * 0.2, 0.03, 0.06, 0.34, '#3a2a1a')
              put(timber, 0.035, top + 0.28, s * 0.2, 0.03, 0.06, 0.34, '#3a2a1a')
            }
          }
          put(flags, 0, top + 1.42, 0.3, 0.04, 0.3, 0.4, gateColour)
          put(timber, 0, top + 1.3, 0.48, 0.035, 0.5, 0.035, '#2a1a0a')
        }
        if (t === 'deck') {
          // planked deck over the silk water, planks along the ship's length, hull showing where the deck meets water
          const alongX = (terrainAt(g, x - 1, y) === 'deck' ? 1 : 0) + (terrainAt(g, x + 1, y) === 'deck' ? 1 : 0) >= (terrainAt(g, x, y - 1) === 'deck' ? 1 : 0) + (terrainAt(g, x, y + 1) === 'deck' ? 1 : 0)
          for (let k = 0; k < 5; k++) {
            const o = -0.4 + 0.2 * k
            const col = PLANKS[Math.floor(hash2(x + k * 3, y + k, 15) * PLANKS.length)]!
            planks.push(alongX ? { x: wx, y: 0.105, z: wz + o, sx: 1.0, sy: 0.11, sz: 0.185, color: col } : { x: wx + o, y: 0.105, z: wz, sx: 0.185, sy: 0.11, sz: 1.0, color: col })
          }
          for (const d of hullSides(g, bridges, x, y)) {
            const horiz = d === 'N' || d === 'S'
            const off = 0.5
            const hx = wx + (d === 'E' ? off : d === 'W' ? -off : 0)
            const hz = wz + (d === 'S' ? off : d === 'N' ? -off : 0)
            timber.push({ x: hx, y: 0.1, z: hz, sx: horiz ? 1.08 : 0.09, sy: 0.24, sz: horiz ? 0.09 : 1.08, color: '#5a3a22' })
            timber.push({ x: hx, y: 0.225, z: hz, sx: horiz ? 1.08 : 0.12, sy: 0.04, sz: horiz ? 0.12 : 1.08, color: '#8a6a3a' })
          }
        }
        if (bridge) {
          const ax = bridgeAxis(g, bridges, x, y)
          const long = ax === 'x'
          planks.push({ x: wx, y: BRIDGE_TOP - 0.03, z: wz, sx: long ? 1.02 : 0.62, sy: 0.06, sz: long ? 0.62 : 1.02, color: '#9b7a4a' })
          for (const s of [-1, 1]) {
            rails.push({ x: wx + (long ? 0 : s * 0.3), y: BRIDGE_TOP + 0.07, z: wz + (long ? s * 0.3 : 0), sx: long ? 1.02 : 0.04, sy: 0.05, sz: long ? 0.04 : 1.02, color: '#6e4d2c' })
            for (const k of [-0.45, 0, 0.45]) {
              rails.push({ x: wx + (long ? k : s * 0.3), y: BRIDGE_TOP + 0.02, z: wz + (long ? s * 0.3 : k), sx: 0.05, sy: 0.14, sz: 0.05, color: '#6e4d2c' })
            }
          }
        }
        // exit stakes
        if (exits.some(([ex, ey]) => ex === x && ey === y)) {
          for (const [sx, sz] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]] as const) {
            stakes.push({ x: wx + sx, y: top + 0.26, z: wz + sz, sy: 0.52, rx: sz * 0.2, rz: -sx * 0.2, color: '#e3d08a' })
            tabs.push({ x: wx + sx * 0.93, y: top + 0.44, z: wz + sz * 0.93, sx: 0.16, sy: 0.12, sz: 0.014, ry: Math.atan2(sx, sz) + Math.PI / 2, color: COLORS.cinnabar })
          }
        }
      }
    }
    // string grid at each tile's own height
    const verts: number[] = []
    const heightAt = (x: number, y: number): number => {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0
      if (isBridgeTile(g, bridges, x, y)) return TOP.river
      return topOf(x, y)
    }
    const isWet = (x: number, y: number): boolean => {
      const t = terrain[y * width + x]
      return (t === 'river' || t === 'water') && !isBridgeTile(g, bridges, x, y)
    }
    const seg = (x0: number, z0: number, x1: number, z1: number, h: number): void => {
      verts.push(x0, h + 0.014, z0, x1, h + 0.014, z1)
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const wx = tx(x)
        const wz = tz(y)
        const h = heightAt(x, y)
        if (isWet(x, y)) continue
        const hn = Math.max(h, heightAt(x, y - 1))
        const hw = Math.max(h, heightAt(x - 1, y))
        seg(wx - 0.5, wz - 0.5, wx + 0.5, wz - 0.5, hn)
        seg(wx - 0.5, wz - 0.5, wx - 0.5, wz + 0.5, hw)
        if (x === width - 1) seg(wx + 0.5, wz - 0.5, wx + 0.5, wz + 0.5, h)
        if (y === height - 1) seg(wx - 0.5, wz + 0.5, wx + 0.5, wz + 0.5, h)
      }
    }
    const grid = new BufferGeometry()
    grid.setAttribute('position', new Float32BufferAttribute(verts, 3))
    const pegs: Item[] = []
    for (let i = 0; i <= width; i++) {
      const wx = i - width / 2
      pegs.push({ x: wx, y: 0.2, z: -height / 2 - 0.14, color: '#ffffff' }, { x: wx, y: 0.2, z: height / 2 + 0.14, color: '#ffffff' })
    }
    for (let j = 0; j <= height; j++) {
      const wz = j - height / 2
      pegs.push({ x: -width / 2 - 0.14, y: 0.2, z: wz, color: '#ffffff' }, { x: width / 2 + 0.14, y: 0.2, z: wz, color: '#ffffff' })
    }
    return { blocks, caps, ridges, stalks, heads, trunks, cones, balls, houses, roofs, silk, sheen, shallow, planks, rails, bricks, timber, flags, reeds, cattails, stakes, tabs, grid, pegs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bridgeKey, exitKey, gateColour, gateOpen])

  useFrame((s) => {
    timeUniform.value = s.clock.elapsedTime
  })

  const pickIdx = (e: { instanceId?: number }): { x: number; y: number } | null => {
    if (e.instanceId === undefined) return null
    return { x: e.instanceId % width, y: Math.floor(e.instanceId / width) }
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
      <Inst items={built.bricks} geometry={box} material={brickMat} cast receive />
      <Inst items={built.ridges} geometry={box} material={plainMat} receive />
      <Inst items={built.stalks} geometry={stalkGeo} material={plainMat} cast />
      <Inst items={built.heads} geometry={headGeo} material={plainMat} />
      <Inst items={built.reeds} geometry={reedGeo} material={plainMat} cast />
      <Inst items={built.cattails} geometry={catGeo} material={plainMat} />
      <Inst items={built.trunks} geometry={trunkGeo} material={woodMat} cast />
      <Inst items={built.cones} geometry={coneGeo} material={leafMat} cast />
      <Inst items={built.balls} geometry={ballGeo} material={leafMat} cast />
      <Inst items={built.houses} geometry={box} material={clayMat} cast receive />
      <Inst items={built.roofs} geometry={roofGeo} material={clayMat} cast />
      <Inst items={built.silk} geometry={planeGeo} material={silkMat} receive />
      <Inst items={built.sheen} geometry={planeGeo} material={sheenMat} />
      <Inst items={built.shallow} geometry={planeGeo} material={shallowMat} />
      <Inst items={built.planks} geometry={box} material={woodMat} cast receive />
      <Inst items={built.rails} geometry={box} material={woodMat} cast />
      <Inst items={built.timber} geometry={box} material={woodMat} cast receive />
      <Inst items={built.flags} geometry={box} material={plainMat} cast />
      <Inst items={built.stakes} geometry={stakeGeo} material={plainMat} cast />
      <Inst items={built.tabs} geometry={box} material={plainMat} />
      <Inst items={built.pegs} geometry={pegGeo} material={bronzeMat} cast />
      <lineSegments geometry={built.grid} raycast={() => null}>
        <lineBasicMaterial color="#f3e8cb" transparent opacity={0.62} />
      </lineSegments>
    </group>
  )
}
