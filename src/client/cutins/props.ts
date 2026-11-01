// Small hand-built props for the cut-ins: a bendable bow with a string, fire-arrow bundles, a brazier, ink-black rails.
// Props attach to the rig group and are positioned from joint positions, so they do not depend on the rig's weapon mesh.
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  ShaderMaterial,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { keep } from './gpu'

const tmpV = new Vector3()

/** A thin tube whose centre line is rewritten every frame (for bows and strings). */
export class TubeBuffer {
  readonly mesh: Mesh
  private readonly geo: BufferGeometry
  private readonly pos: Float32Array
  private readonly n: number
  private readonly sides: number

  constructor(samples: number, material: MeshStandardMaterial | MeshBasicMaterial, sides = 4) {
    this.n = samples
    this.sides = sides
    this.pos = new Float32Array(samples * sides * 3)
    this.geo = new BufferGeometry()
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048))
    const idx: number[] = []
    for (let i = 0; i < samples - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = i * sides + s
        const b = i * sides + ((s + 1) % sides)
        const c = (i + 1) * sides + s
        const d = (i + 1) * sides + ((s + 1) % sides)
        idx.push(a, c, b, b, c, d)
      }
    }
    this.geo.setIndex(idx)
    this.mesh = new Mesh(this.geo, material)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = true
  }

  /** Rewrite the tube along `pts` (length = samples) with the given radius. */
  update(pts: readonly Vector3[], radius: number): void {
    for (let i = 0; i < this.n; i++) {
      const p = pts[i]!
      const a = pts[Math.max(0, i - 1)]!
      const b = pts[Math.min(this.n - 1, i + 1)]!
      const tx = b.x - a.x
      const ty = b.y - a.y
      const tz = b.z - a.z
      // a side vector perpendicular to the tangent: cross with (1,0,0) or (0,1,0)
      let sx = 0
      let sy = tz
      let sz = -ty
      let sl = Math.hypot(sx, sy, sz)
      if (sl < 1e-6) {
        sx = -tz
        sy = 0
        sz = tx
        sl = Math.hypot(sx, sy, sz) || 1
      }
      sx /= sl
      sy /= sl
      sz /= sl
      // second perpendicular = t x s
      let ux = ty * sz - tz * sy
      let uy = tz * sx - tx * sz
      let uz = tx * sy - ty * sx
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul
      uy /= ul
      uz /= ul
      for (let s = 0; s < this.sides; s++) {
        const ang = (s / this.sides) * Math.PI * 2
        const c = Math.cos(ang) * radius
        const sn = Math.sin(ang) * radius
        const o = (i * this.sides + s) * 3
        this.pos[o] = p.x + sx * c + ux * sn
        this.pos[o + 1] = p.y + sy * c + uy * sn
        this.pos[o + 2] = p.z + sz * c + uz * sn
      }
    }
    this.geo.attributes.position!.needsUpdate = true
    this.geo.computeVertexNormals()
  }

  dispose(): void {
    this.geo.dispose()
  }
}

const SHAFT = keep(new CylinderGeometry(0.0042, 0.0042, 1, 5).translate(0, 0.5, 0))
const HEAD = keep(new ConeGeometry(0.011, 0.04, 5).translate(0, 0.02, 0))
const WRAP = keep(new SphereGeometry(0.018, 8, 6))
const shaftMat = new MeshStandardMaterial({ color: '#d8bd84', roughness: 0.8 })
const headMat = new MeshStandardMaterial({ color: '#2b2a28', roughness: 0.4, metalness: 0.7 })
const wrapMat = new MeshStandardMaterial({ color: '#2a170b', roughness: 0.9, emissive: '#ff6a10', emissiveIntensity: 0 })

export interface ArrowProp {
  group: Group
  wrap: Mesh
  wrapMat: MeshStandardMaterial
}

/** One arrow: shaft along +Y from the origin (the nock) to y = length, with an iron head and a pitch-soaked rag near the tip. */
export function makeArrowProp(length = 0.34): ArrowProp {
  const group = new Group()
  const shaft = new Mesh(SHAFT, shaftMat)
  shaft.scale.set(1, length, 1)
  const head = new Mesh(HEAD, headMat)
  head.position.y = length
  const mat = wrapMat.clone()
  const wrap = new Mesh(WRAP, mat)
  wrap.position.y = length - 0.012
  wrap.scale.set(1, 1.5, 1)
  group.add(shaft, head, wrap)
  group.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true
  })
  return { group, wrap, wrapMat: mat }
}

const yAxis = new Vector3(0, 1, 0)
const q = new Quaternion()

/** Place an arrow prop with its nock at `nock` pointing along unit `dir` (all in the parent's space). */
export function placeArrow(a: ArrowProp, nock: Vector3, dir: Vector3, glow: number): void {
  a.group.position.copy(nock)
  q.setFromUnitVectors(yAxis, dir)
  a.group.quaternion.copy(q)
  a.wrapMat.emissiveIntensity = glow * 3
}

/** The tip of an arrow in its parent's space. */
export function arrowTip(nock: Vector3, dir: Vector3, length = 0.34, out = new Vector3()): Vector3 {
  return out.copy(dir).multiplyScalar(length + 0.01).add(nock)
}

/** Basis matrix with +z along `u` (any direction), +y as close to world up as possible, for orienting the bow. */
export function bowBasis(u: Vector3, out = new Matrix4()): Matrix4 {
  const z = tmpV.copy(u)
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1)
  z.normalize()
  const up = new Vector3(0, 1, 0)
  const x = new Vector3().crossVectors(up, z)
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0)
  x.normalize()
  const y = new Vector3().crossVectors(z, x).normalize()
  return out.makeBasis(x, y, z)
}

// ---- ribbon (glaive sweep trail) ---------------------------------------------------------------------------------

const RIBBON_VERT = /* glsl */ `
attribute float aAlpha;
varying float vA;
void main() {
  vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const RIBBON_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor, vA);
}
`

/** A triangle strip between an inner and an outer edge, each vertex with its own alpha. */
export class Ribbon {
  readonly mesh: Mesh
  private readonly geo: BufferGeometry
  private readonly pos: Float32Array
  private readonly alpha: Float32Array
  private readonly n: number

  constructor(segments: number, color: string) {
    this.n = segments + 1
    this.pos = new Float32Array(this.n * 2 * 3)
    this.alpha = new Float32Array(this.n * 2)
    this.geo = new BufferGeometry()
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048))
    this.geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1).setUsage(35048))
    const idx: number[] = []
    for (let i = 0; i < segments; i++) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    this.geo.setIndex(idx)
    const mat = new ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: { uColor: { value: new Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    })
    this.mesh = new Mesh(this.geo, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 12
  }

  get count(): number {
    return this.n
  }

  set(i: number, inner: Vector3, outer: Vector3, alpha: number): void {
    this.pos[i * 6] = inner.x
    this.pos[i * 6 + 1] = inner.y
    this.pos[i * 6 + 2] = inner.z
    this.pos[i * 6 + 3] = outer.x
    this.pos[i * 6 + 4] = outer.y
    this.pos[i * 6 + 5] = outer.z
    this.alpha[i * 2] = alpha * 0.15
    this.alpha[i * 2 + 1] = alpha
  }

  commit(visible: boolean): void {
    this.mesh.visible = visible
    this.geo.attributes.position!.needsUpdate = true
    this.geo.attributes.aAlpha!.needsUpdate = true
  }
}
