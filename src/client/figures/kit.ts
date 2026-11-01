// Shared procedural-figure toolkit: cached geometries and materials, mesh helpers, tapered tubes, extrusions.
// Everything here is plain three.js (no DOM, no React) so the rigs build in node tests as well as in the browser.
import {
  BoxGeometry,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { HOOF_JOINTS, HORSE_JOINTS, HUMAN_JOINTS, OPTIONAL_JOINTS, type HorseRig, type HumanJoint } from './rig'

export type V3 = [number, number, number]
export type P2 = [number, number]

export interface Xf {
  p?: V3
  r?: V3
  s?: V3 | number
  name?: string
  shadow?: boolean
}

export interface MatOpts {
  rough?: number
  metal?: number
  double?: boolean
  /** Vertex colours (barred feathers). */
  vc?: boolean
  emissive?: string
  ei?: number
}
export type MatSpec = string | MeshStandardMaterial

// ---------- caches ----------
const geoCache = new Map<string, BufferGeometry>()
const sharedMats = new Map<string, MeshStandardMaterial>()

export function geo<T extends BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g as T
}

/** Frees every shared geometry and material (tests, hot reload). Rigs built before this keep working but re-create on demand. */
export function disposeFigureCaches(): void {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
  for (const m of sharedMats.values()) m.dispose()
  sharedMats.clear()
}

export function cacheStats(): { geometries: number; materials: number } {
  return { geometries: geoCache.size, materials: sharedMats.size }
}

export const G = {
  sph: (): SphereGeometry => geo('sph', () => new SphereGeometry(1, 24, 16)),
  sphLo: (): SphereGeometry => geo('sphLo', () => new SphereGeometry(1, 12, 8)),
  box: (): BoxGeometry => geo('box', () => new BoxGeometry(1, 1, 1)),
  cyl: (): CylinderGeometry => geo('cyl', () => new CylinderGeometry(1, 1, 1, 24)),
  cylLo: (): CylinderGeometry => geo('cylLo', () => new CylinderGeometry(1, 1, 1, 10)),
  cone: (): ConeGeometry => geo('cone', () => new ConeGeometry(1, 1, 16)),
  coneLo: (): ConeGeometry => geo('coneLo', () => new ConeGeometry(1, 1, 8)),
  frustum: (rt: number, rb: number): CylinderGeometry => geo(`fru|${rt}|${rb}`, () => new CylinderGeometry(rt, rb, 1, 14)),
  capsule: (r: number, len: number): CapsuleGeometry => geo(`cap|${r}|${len}`, () => new CapsuleGeometry(r, len, 5, 14)),
  torus: (r: number, tube: number, arc = Math.PI * 2): TorusGeometry => geo(`tor|${r}|${tube}|${arc}`, () => new TorusGeometry(r, tube, 8, 28, arc)),
}

// ---------- the builder ----------
export class FB {
  readonly group = new Group()
  private owned = new Map<string, MeshStandardMaterial>()
  /** `own`: materials belong to this rig alone (the board tints them for done / damage flashes). */
  constructor(readonly own = false) {
    this.group.name = 'figure'
  }

  mat(color: string, o: MatOpts = {}): MeshStandardMaterial {
    const key = `${color}|${o.rough ?? 0.72}|${o.metal ?? 0.04}|${o.double ? 1 : 0}|${o.vc ? 1 : 0}|${o.emissive ?? ''}|${o.ei ?? 0}`
    const store = this.own ? this.owned : sharedMats
    let m = store.get(key)
    if (!m) {
      m = new MeshStandardMaterial({
        color: o.vc ? '#ffffff' : color,
        roughness: o.rough ?? 0.72,
        metalness: o.metal ?? 0.04,
        side: o.double ? DoubleSide : FrontSide,
        vertexColors: !!o.vc,
      })
      if (o.emissive) {
        m.emissive = new Color(o.emissive)
        m.emissiveIntensity = o.ei ?? 1
      }
      store.set(key, m)
    }
    return m
  }
  torusGeo(r: number, tube: number, arc = Math.PI * 2): TorusGeometry {
    return G.torus(r, tube, arc)
  }
  frustumGeo(rt: number, rb: number): CylinderGeometry {
    return G.frustum(rt, rb)
  }
  /** Part of a unit sphere from the pole down to `frac` of PI (a dome or cap). */
  sphereCap(frac: number): SphereGeometry {
    return geo(`spcap|${frac}`, () => new SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * frac))
  }
  /** Brushed metal: lighter, shinier. */
  metal(color: string, double = false): MeshStandardMaterial {
    return this.mat(color, { rough: 0.42, metal: 0.32, double })
  }
  cloth(color: string): MeshStandardMaterial {
    return this.mat(color, { rough: 0.85, double: true })
  }

  node(name: string, parent: Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): Group {
    const g = new Group()
    g.name = name
    g.position.set(...p)
    g.rotation.set(...r)
    parent.add(g)
    return g
  }

  add(parent: Object3D, g: BufferGeometry, m: MatSpec, xf: Xf = {}): Mesh {
    const mesh = new Mesh(g, typeof m === 'string' ? this.mat(m) : m)
    if (xf.p) mesh.position.set(...xf.p)
    if (xf.r) mesh.rotation.set(...xf.r)
    if (xf.s !== undefined) {
      if (typeof xf.s === 'number') mesh.scale.setScalar(xf.s)
      else mesh.scale.set(...xf.s)
    }
    if (xf.name) mesh.name = xf.name
    mesh.castShadow = xf.shadow ?? true
    parent.add(mesh)
    return mesh
  }

  /** Ellipsoid with radii s (or one radius). */
  sph(parent: Object3D, m: MatSpec, p: V3, s: V3 | number, xf: Xf = {}): Mesh {
    const sc: V3 = typeof s === 'number' ? [s, s, s] : s
    return this.add(parent, G.sph(), m, { ...xf, p, s: sc })
  }
  /** Box with full size s. */
  box(parent: Object3D, m: MatSpec, p: V3, s: V3, r?: V3, xf: Xf = {}): Mesh {
    return this.add(parent, G.box(), m, { ...xf, p, s, ...(r ? { r } : {}) })
  }
  /** Cylinder with radius rx/rz and height h: s = [rx, h, rz]. */
  cyl(parent: Object3D, m: MatSpec, p: V3, s: V3, r?: V3, xf: Xf = {}): Mesh {
    return this.add(parent, G.cyl(), m, { ...xf, p, s, ...(r ? { r } : {}) })
  }
  /** Cone, base down: s = [rx, h, rz]. */
  cone(parent: Object3D, m: MatSpec, p: V3, s: V3, r?: V3, xf: Xf = {}): Mesh {
    return this.add(parent, G.coneLo(), m, { ...xf, p, s, ...(r ? { r } : {}) })
  }
  capsule(parent: Object3D, m: MatSpec, p: V3, radius: number, len: number, r?: V3, xf: Xf = {}): Mesh {
    return this.add(parent, G.capsule(radius, len), m, { ...xf, p, ...(r ? { r } : {}) })
  }

  lathe(parent: Object3D, pts: P2[], m: MatSpec, xf: Xf = {}, segs = 28): Mesh {
    // LatheGeometry faces outward when the profile climbs; flip profiles that descend so single-sided metals show
    const net = pts.length > 1 ? pts[pts.length - 1]![1] - pts[0]![1] : 0
    const prof = net < 0 ? [...pts].reverse() : pts
    const key = `lathe|${segs}|${prof.map((q) => q.join(',')).join(';')}`
    const g = geo(key, () => new LatheGeometry(prof.map((q) => new Vector2(q[0], q[1])), segs))
    return this.add(parent, g, m, xf)
  }

  /** Flat shape extruded to `depth` (centred on z=0) with a soft bevel. The shape lies in the local XY plane. */
  extrude(parent: Object3D, key: string, shape: () => Shape, depth: number, m: MatSpec, xf: Xf = {}, bevel = 0.006): Mesh {
    const g = geo(`ext|${key}|${depth}|${bevel}`, () => {
      const e = new ExtrudeGeometry(shape(), {
        depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 14,
        steps: 1,
      })
      e.translate(0, 0, -depth / 2)
      return e
    })
    return this.add(parent, g, m, xf)
  }

  /** Tapered tube along a Catmull-Rom curve (feathers, tassels, tails). `bars` colours it in alternating bands. */
  tube(
    parent: Object3D,
    key: string,
    pts: V3[],
    r0: number,
    r1: number,
    m: MatSpec,
    xf: Xf = {},
    o: { segs?: number; radial?: number; flat?: number; thin?: number; bars?: [string, string, number] } = {},
  ): Mesh {
    const g = geo(`tube|${key}`, () => taperedTube(pts, r0, r1, o.segs ?? 24, o.radial ?? 8, o.flat ?? 1, o.bars, o.thin ?? 1))
    const mat = typeof m === 'string' ? this.mat(m, o.bars ? { vc: true } : {}) : m
    return this.add(parent, g, mat, xf)
  }

  dispose(): void {
    for (const m of this.owned.values()) m.dispose()
    this.owned.clear()
    this.group.removeFromParent()
  }
}

/** TubeGeometry whose radius tapers from r0 to r1 along the curve; `flat` squashes it across world X (leaf-like feathers). */
export function taperedTube(
  pts: V3[],
  r0: number,
  r1: number,
  segs = 24,
  radial = 8,
  flat = 1,
  bars?: [string, string, number],
  thin = 1,
): BufferGeometry {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)))
  const g = new TubeGeometry(curve, segs, 1, radial, false)
  const pos = g.getAttribute('position') as BufferAttribute
  const v = new Vector3()
  const colors: number[] = []
  const ca = bars ? new Color(bars[0]) : null
  const cb = bars ? new Color(bars[1]) : null
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const c = curve.getPointAt(t)
    // bulge a little near the start then taper, like a feather vane
    const rr = r0 + (r1 - r0) * Math.pow(t, 0.8)
    const tan = curve.getTangentAt(t)
    const nrm = new Vector3().crossVectors(tan, new Vector3(1, 0, 0)).normalize()
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j
      v.fromBufferAttribute(pos, idx).sub(c)
      v.x *= flat
      if (thin !== 1) v.addScaledVector(nrm, -(1 - thin) * v.dot(nrm))
      v.multiplyScalar(rr).add(c)
      pos.setXYZ(idx, v.x, v.y, v.z)
      if (bars && ca && cb) {
        const band = Math.floor(t * bars[2]) % 2 === 0
        const col = band ? ca : cb
        colors.push(col.r, col.g, col.b)
      }
    }
  }
  if (bars) g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  g.computeVertexNormals()
  return g
}

// ---------- colours ----------
const _c = new Color()
/** Lighten (amt>0) or darken (amt<0) a colour. */
export function shade(hex: string, amt: number): string {
  _c.set(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  _c.getHSL(hsl)
  _c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)))
  return `#${_c.getHexString()}`
}

// ---------- rest pose ----------
export interface RestState {
  r: V3
  p: V3
}
export function restOf(o: Object3D): RestState {
  const u = o.userData as { rest?: RestState }
  if (!u.rest) u.rest = { r: [o.rotation.x, o.rotation.y, o.rotation.z], p: [o.position.x, o.position.y, o.position.z] }
  return u.rest
}
/** Records every joint's current transform as its rest pose (called once by the builders when the figure is finished). */
export function captureRest(joints: Record<string, Object3D | undefined>, horse?: HorseRig): void {
  for (const k of [...HUMAN_JOINTS, ...OPTIONAL_JOINTS] as HumanJoint[]) {
    const j = joints[k]
    if (j) (j.userData as { rest?: RestState }).rest = { r: [j.rotation.x, j.rotation.y, j.rotation.z], p: [j.position.x, j.position.y, j.position.z] }
  }
  if (horse) {
    for (const k of [...HORSE_JOINTS, ...HOOF_JOINTS]) {
      const j = horse.joints[k]
      if (!j) continue
      j.userData.rest = { r: [j.rotation.x, j.rotation.y, j.rotation.z], p: [j.position.x, j.position.y, j.position.z] }
    }
  }
}

export function heightOf(group: Object3D): number {
  group.updateMatrixWorld(true)
  return new Box3().setFromObject(group).max.y
}

/** Quadratic-ish helper to build a Shape from a list of bezier segments. */
export function shapeFrom(build: (s: Shape) => void): Shape {
  const s = new Shape()
  build(s)
  return s
}
