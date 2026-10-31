// Builds each stand-in figure as two merged meshes (body, banner) with baked vertex colours, so a figure costs a
// handful of draw calls instead of fifty. Proportions: head 0.40 of the height and as wide as the shoulders.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  CapsuleGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TroopType } from '../../engine'
import { COLORS } from './layout'

type V3 = [number, number, number]

export class Builder {
  parts: BufferGeometry[] = []
  add(geo: BufferGeometry, color: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
    const g = geo.clone()
    const m = new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale))
    g.applyMatrix4(m)
    const c = new Color(color)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    this.parts.push(g.index ? g.toNonIndexed() : g)
  }
  build(): BufferGeometry {
    const parts = this.parts.map((p) => {
      p.deleteAttribute('uv')
      return p
    })
    const g = mergeGeometries(parts, false)
    for (const p of this.parts) p.dispose()
    return g
  }
}

export interface FigureSpec {
  id: string
  han: boolean
  type: TroopType
  commander: boolean
}

export const FIGURE_HEIGHT = 0.9
export const RIDER_LIFT = 0.34
const BEARDED = new Set(['guan-yu', 'zhang-fei', 'cheng-yuanzhi', 'deng-mao'])

const unitBox = new BoxGeometry(1, 1, 1)
const cyl6 = new CylinderGeometry(1, 1, 1, 6)
const cyl8 = new CylinderGeometry(1, 1, 1, 8)
const cyl14 = new CylinderGeometry(1, 1, 1, 20)
const sph = new SphereGeometry(1, 12, 9)
const sphLow = new SphereGeometry(1, 6, 4)
const cone5 = new ConeGeometry(1, 1, 5)
const cone6 = new ConeGeometry(1, 1, 6)
const capsule = new CapsuleGeometry(1, 0.6, 2, 8)
const helm = new SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.46)
const turbanCap = new SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.32)
const torusRing = new TorusGeometry(1, 0.19, 5, 14).rotateX(Math.PI / 2)
const bow = new TorusGeometry(0.36, 0.022, 6, 18, Math.PI)
const oct = new OctahedronGeometry(1)
const plane = new PlaneGeometry(1, 1)

const cache = new Map<string, { body: BufferGeometry }>()

export function figureGeometry(s: FigureSpec): { body: BufferGeometry } {
  const key = `${s.id}|${s.han}|${s.type}|${s.commander}`
  const hit = cache.get(key)
  if (hit) return hit
  const cav = s.type === 'cavalry'
  const y0 = 0.07 + (cav ? RIDER_LIFT : 0)
  const faction = s.han ? COLORS.han : COLORS.yellow
  const armour = s.han ? '#27302d' : '#4a3a20'
  const hat = s.han ? '#2b2a30' : COLORS.yellow
  const skin = '#e8c5a2'
  const dark = '#17120f'
  const wood = '#6b4a2a'
  const metal = '#b9b3a4'
  const bronze = '#a07a3a'
  const horse = s.id === 'guan-yu' ? '#8a3a28' : s.id === 'captain-ma' ? '#3d2c22' : '#6e4d33'
  const b = new Builder()
  const Y = (y: number): number => y + y0
  // round black base, in the same mesh as the figure
  b.add(cyl14, '#0a0908', [0, 0.035, 0], [0, 0, 0], [cav ? 0.4 : 0.35, 0.07, cav ? 0.4 : 0.35])

  if (cav) {
    const hy = 0.07
    b.add(unitBox, horse, [0, hy + 0.2, -0.02], [0, 0, 0], [0.3, 0.2, 0.6])
    b.add(unitBox, horse, [0, hy + 0.3, 0.26], [-0.5, 0, 0], [0.14, 0.26, 0.14])
    b.add(unitBox, horse, [0, hy + 0.4, 0.34], [0, 0, 0], [0.13, 0.12, 0.2])
    b.add(unitBox, dark, [0, hy + 0.2, -0.36], [0.5, 0, 0], [0.04, 0.2, 0.04])
    for (const [lx, lz] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.22], [0.1, -0.22]] as const) b.add(unitBox, dark, [lx, hy + 0.05, lz], [0, 0, 0], [0.07, 0.12, 0.07])
    b.add(unitBox, faction, [0, hy + 0.315, -0.02], [0, 0, 0], [0.32, 0.03, 0.34])
  }
  for (const lx of [-0.08, 0.08]) b.add(unitBox, dark, [lx, Y(0.07), 0], [0, 0, 0], [0.11, 0.14, 0.13])
  b.add(capsule, faction, [0, Y(0.27), 0], [0, 0, 0], [0.18, 0.17, 0.14])
  b.add(cyl14, bronze, [0, Y(0.22), 0], [0, 0, 0], [0.188, 0.04, 0.15])
  for (const sd of [-1, 1]) {
    b.add(sphLow, armour, [sd * 0.2, Y(0.37), 0], [0, 0, 0], [0.085, 0.085, 0.085])
    b.add(sphLow, skin, [sd * 0.22, Y(0.26), 0.04], [0, 0, 0], [0.06, 0.06, 0.06])
  }
  // head: radius 0.2 (diameter 0.40 of a 0.9 figure, shoulders about 0.40 wide)
  const hy = 0.47
  b.add(sph, skin, [0, Y(hy + 0.2), 0], [0, 0, 0], [0.2, 0.2, 0.2])
  for (const sd of [-1, 1]) b.add(sphLow, '#0d0b0a', [sd * 0.075, Y(hy + 0.2), 0.185], [0, 0, 0], [0.028, 0.028, 0.028])
  b.add(unitBox, '#8a4b3a', [0, Y(hy + 0.135), 0.195], [0, 0, 0], [0.06, 0.012, 0.02])
  if (BEARDED.has(s.id)) b.add(sph, '#16110e', [0, Y(hy + 0.08), 0.15], [0, 0, 0], [0.1, 0.13, 0.07])
  if (s.han) {
    b.add(helm, hat, [0, Y(hy + 0.27), -0.01], [0, 0, 0], [0.215, 0.215, 0.215])
    b.add(cone6, faction, [0, Y(hy + 0.465), -0.01], [0, 0, 0], s.commander ? [0.05, 0.2, 0.05] : [0.035, 0.12, 0.035])
  } else {
    b.add(torusRing, hat, [0, Y(hy + 0.305), 0], [0, 0, 0], [0.19, 0.19, 0.19])
    b.add(turbanCap, hat, [0, Y(hy + 0.34), -0.01], [0, 0, 0], [0.2, 0.2, 0.2])
    b.add(unitBox, hat, [0.1, Y(hy + 0.27), -0.22], [0.6, 0, 0.3], [0.05, 0.02, 0.22])
  }
  // signature weapon, deliberately oversized
  if (s.type === 'infantry') {
    const wx = 0.3
    b.add(cyl6, wood, [wx, Y(0.58), 0.06], [0.12, 0, 0], [0.016, 1.24, 0.016])
    b.add(cone6, metal, [wx, Y(1.27), 0.09], [0.12, 0, 0], [0.05, 0.22, 0.05])
    b.add(cyl6, faction, [wx, Y(1.12), 0.085], [0.12, 0, 0], [0.03, 0.05, 0.03])
  } else if (cav) {
    const wx = 0.31
    b.add(cyl6, wood, [wx, Y(0.5), 0.1], [0.1, 0, -0.05], [0.017, 1.1, 0.017])
    b.add(unitBox, metal, [wx + 0.08, Y(1.12), 0.12], [0, 0, -0.35], [0.05, 0.3, 0.12])
    b.add(cone5, metal, [wx + 0.02, Y(1.3), 0.12], [0, 0, 0], [0.035, 0.12, 0.035])
  } else {
    // bow in the left hand, arc bulging forward, plus a quiver
    b.add(bow, wood, [-0.3, Y(0.38), 0.14], [0, -Math.PI / 2, -Math.PI / 2], [1, 1, 1])
    b.add(cyl6, '#e9e0c8', [-0.3, Y(0.38), 0.14], [0, 0, 0], [0.004, 0.72, 0.004])
    b.add(cyl8, wood, [0.08, Y(0.34), -0.2], [0.35, 0, 0.2], [0.05, 0.34, 0.05])
  }
  // back banner, faction colour, taller for a commander
  const poleH = s.commander ? 1.75 : 1.22
  const fh = s.commander ? 0.58 : 0.44
  const bz = -0.2
  b.add(cyl6, wood, [0, 0.07 + poleH / 2 + (cav ? RIDER_LIFT : 0), bz], [0, 0, 0], [0.014, poleH, 0.014])
  const by = 0.07 + (cav ? RIDER_LIFT : 0)
  b.add(plane, faction, [0, by + poleH - 0.3, bz + 0.004], [0, 0, 0], [0.3, fh, 1])
  b.add(plane, s.han ? '#e9dfc2' : '#2a1d10', [0, by + poleH - 0.3, bz + 0.008], [0, 0, 0], [0.05, fh - 0.12, 1])
  b.add(sphLow, bronze, [0, by + poleH + 0.02, bz], [0, 0, 0], [0.03, 0.03, 0.03])
  if (s.commander) b.add(plane, bronze, [0.18, by + poleH - 0.12, bz + 0.004], [0, 0, 0], [0.2, 0.14, 1])
  const body = b.build()

  const out = { body }
  cache.set(key, out)
  return out
}

export const swirlGeometry = ((): BufferGeometry => {
  const b = new Builder()
  for (let i = 0; i < 3; i++) b.add(oct, '#f5e38a', [Math.cos((i * Math.PI * 2) / 3) * 0.2, Math.sin(i * 1.3) * 0.04, Math.sin((i * Math.PI * 2) / 3) * 0.2], [0, 0, 0], [0.055, 0.055, 0.055])
  return b.build()
})()
