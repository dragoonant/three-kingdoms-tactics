// Bakes a troop rig (figures.buildTroop) into per-joint merged geometries for instancing (docs/spec/52-crowds.md).
//
// Every mesh of the rig is attached to the nearest ANIMATED joint above it (the joints the clips in figures/clips.ts drive:
// root, hips, torso, head, arms, legs, feet, and the horse's body / neck / head / legs / hooves / tail). Joints no clip
// touches (weapon, offhand, handL, handR) are folded into their parent, because the crowd poses only through clips. All the
// meshes of one joint are merged into one geometry, with the material baked into vertex colours and a per-vertex
// (roughness, metalness) pair, leaving at most two geometries per joint: front-faced and double-faced. Each becomes one
// InstancedMesh, whose per-member matrix is member x (the joint's world matrix after the same clip the full rigs get).
// The geometry is baked from the SAME builder output as the front rank, so the instanced ranks cannot drift from it; at
// `lo` detail the generated primitives (spheres, lathes, capsules, ...) are rebuilt with fewer segments.
import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import { figures } from '../../figures'
import { HOOF_JOINTS, HORSE_JOINTS, type Rig, type SidePalette, type TroopKind } from '../../figures/rig'

export type Detail = 'lo' | 'hi'
/** A baked part hangs from a joint: 'hips', 'torso', ... or 'h:body', 'h:legFL', ... for the horse. */
export type PartJoint = string
export type PartTag = 'body' | 'arrow'

/** The human joints a clip can move. Everything else is folded into one of these. */
export const ANIMATED_HUMAN = ['root', 'hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR', 'footL', 'footR', 'cape', 'beard'] as const

export interface BakedPart {
  joint: PartJoint
  cls: 'S' | 'D'
  tag: PartTag
  geometry: BufferGeometry
  triangles: number
}

export interface BakedSet {
  kind: TroopKind
  side: SidePalette
  variant: number
  detail: Detail
  parts: BakedPart[]
  /** Joint-only copy of the rig used to evaluate poses (its meshes were stripped): apply a clip, update the world matrices, read `joint(name).matrixWorld`. */
  evaluator: Rig
  /** Joint objects of `evaluator` by part-joint name. */
  joints: Map<PartJoint, Object3D>
  /** Height of the rig (rig units) and its footprint radius. */
  height: number
  refs: number
}

const cache = new Map<string, BakedSet>()

// ---------------------------------------------------------------- geometry reduction
type Params = Record<string, number | boolean | Vector3[] | unknown>
const paramsOf = (g: BufferGeometry): Params => (g as unknown as { parameters: Params }).parameters ?? {}
const reduced = new Map<string, BufferGeometry>()

/** Samples the (tubular x radial) vertex grid of a TubeGeometry at every second row and column. */
function decimateTube(g: BufferGeometry): BufferGeometry {
  const p = paramsOf(g)
  const T = p['tubularSegments'] as number
  const R = p['radialSegments'] as number
  const rows: number[] = []
  for (let i = 0; i <= T; i += 2) rows.push(i)
  if (rows[rows.length - 1] !== T) rows.push(T)
  const cols: number[] = []
  for (let j = 0; j <= R; j += 2) cols.push(j)
  if (cols[cols.length - 1] !== R) cols.push(R)
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const P: number[] = []
  const N: number[] = []
  for (const i of rows) {
    for (const j of cols) {
      const k = i * (R + 1) + j
      P.push(pos.getX(k), pos.getY(k), pos.getZ(k))
      N.push(nor.getX(k), nor.getY(k), nor.getZ(k))
    }
  }
  const W = cols.length
  const idx: number[] = []
  for (let i = 1; i < rows.length; i++) {
    for (let j = 1; j < W; j++) {
      const a = W * (i - 1) + (j - 1)
      const b = W * i + (j - 1)
      const c = W * i + j
      const d = W * (i - 1) + j
      idx.push(a, b, d, b, c, d)
    }
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(P, 3))
  out.setAttribute('normal', new Float32BufferAttribute(N, 3))
  out.setIndex(idx)
  return out
}

/** A lower-detail stand-in for a generated primitive; geometries of other types come back unchanged. `tiny`: the part is a few millimetres across on screen. */
export function lowGeometry(g: BufferGeometry, tiny: boolean): BufferGeometry {
  const key = `${g.uuid}|${tiny ? 't' : 'n'}`
  const hit = reduced.get(key)
  if (hit) return hit
  const p = paramsOf(g)
  const n = (k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d)
  let out: BufferGeometry = g
  switch (g.type) {
    case 'SphereGeometry': {
      const w = n('widthSegments', 24)
      const h = n('heightSegments', 16)
      out = new SphereGeometry(n('radius', 1), tiny ? 6 : Math.max(8, Math.round(w * 0.42)), tiny ? 4 : Math.max(5, Math.round(h * 0.44)), n('phiStart', 0), n('phiLength', Math.PI * 2), n('thetaStart', 0), n('thetaLength', Math.PI))
      break
    }
    case 'CapsuleGeometry':
      out = new CapsuleGeometry(n('radius', 1), n('height', n('length', 1)), 2, tiny ? 5 : 8)
      break
    case 'CylinderGeometry':
      out = new CylinderGeometry(n('radiusTop', 1), n('radiusBottom', 1), n('height', 1), tiny ? 5 : Math.max(6, Math.min(10, Math.round(n('radialSegments', 24) * 0.4))), 1, p['openEnded'] === true, n('thetaStart', 0), n('thetaLength', Math.PI * 2))
      break
    case 'TorusGeometry':
      out = new TorusGeometry(n('radius', 1), n('tube', 0.4), 4, tiny ? 6 : n('radius', 1) > 0.1 ? 18 : 10, n('arc', Math.PI * 2))
      break
    case 'LatheGeometry':
      out = new LatheGeometry(p['points'] as Vector3[] as never, tiny ? 6 : Math.max(9, Math.round(n('segments', 28) * 0.45)), n('phiStart', 0), n('phiLength', Math.PI * 2))
      break
    case 'TubeGeometry':
      out = decimateTube(g)
      break
    default:
      break
  }
  // cached for the session like the figure kit's own geometry: a compacted phone-tier figure (figures/compact.ts) built from it
  // can then be cached and kept too, instead of being rebuilt and uploaded by every cut-in
  if (out !== g) out.userData.keep = true
  reduced.set(key, out)
  return out
}

// ---------------------------------------------------------------- baking
interface Bucket {
  joint: PartJoint
  cls: 'S' | 'D'
  tag: PartTag
  pos: number[]
  nor: number[]
  col: number[]
  rm: number[]
  idx: number[]
}

const _v = new Vector3()
const _n = new Vector3()
const _nm = new Matrix3()
const _inv = new Matrix4()
const _rel = new Matrix4()

export function jointKey(rig: Rig, o: Object3D): PartJoint | null {
  for (const name of ANIMATED_HUMAN) if (rig.joints[name] === o) return name
  if (rig.mount) for (const name of [...HORSE_JOINTS, ...HOOF_JOINTS]) if (rig.mount.joints[name] === o) return `h:${name}`
  return null
}

function bakeRig(rig: Rig, kind: TroopKind, side: SidePalette, variant: number, detail: Detail): BakedSet {
  rig.group.updateMatrixWorld(true)
  const animated = new Map<Object3D, PartJoint>()
  for (const name of ANIMATED_HUMAN) {
    const j = rig.joints[name]
    if (j) animated.set(j, name)
  }
  if (rig.mount) {
    for (const name of [...HORSE_JOINTS, ...HOOF_JOINTS]) {
      const j = rig.mount.joints[name]
      if (j) animated.set(j, `h:${name}`)
    }
  }
  const buckets = new Map<string, Bucket>()
  const meshes: Mesh[] = []
  rig.group.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o)
  })
  for (const m of meshes) {
    let anc: Object3D | null = m.parent
    let tag: PartTag = 'body'
    while (anc && !animated.has(anc)) {
      if (anc.name === 'arrow') tag = 'arrow'
      anc = anc.parent
    }
    const joint = anc ? animated.get(anc)! : 'root'
    const jointObj = anc ?? rig.joints.root
    _inv.copy(jointObj.matrixWorld).invert()
    _rel.multiplyMatrices(_inv, m.matrixWorld)
    const mat = m.material as Material
    if (!(mat instanceof MeshStandardMaterial)) continue
    const double = mat.side === 2
    const cls: 'S' | 'D' = double ? 'D' : 'S'
    const key = `${joint}|${cls}|${tag}`
    let b = buckets.get(key)
    if (!b) {
      b = { joint, cls, tag, pos: [], nor: [], col: [], rm: [], idx: [] }
      buckets.set(key, b)
    }
    let src = m.geometry
    if (detail === 'lo') {
      src.computeBoundingSphere()
      const sc = Math.max(_rel.getMaxScaleOnAxis(), 1e-6)
      src = lowGeometry(src, (src.boundingSphere?.radius ?? 1) * sc < 0.055)
    }
    const pa = src.getAttribute('position')
    const na = src.getAttribute('normal')
    const base = b.pos.length / 3
    _nm.getNormalMatrix(_rel)
    const flip = _rel.determinant() < 0
    const ca = src.getAttribute('color')
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(_rel)
      b.pos.push(_v.x, _v.y, _v.z)
      if (na) _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize()
      else _n.set(0, 1, 0)
      b.nor.push(_n.x, _n.y, _n.z)
      if (ca && mat.vertexColors) b.col.push(ca.getX(i), ca.getY(i), ca.getZ(i))
      else b.col.push(mat.color.r, mat.color.g, mat.color.b)
      b.rm.push(mat.roughness, mat.metalness)
    }
    const ix = src.getIndex()
    const count = ix ? ix.count : pa.count
    for (let i = 0; i < count; i += 3) {
      const a = (ix ? ix.getX(i) : i) + base
      const bb = (ix ? ix.getX(i + 1) : i + 1) + base
      const c = (ix ? ix.getX(i + 2) : i + 2) + base
      if (flip) b.idx.push(a, c, bb)
      else b.idx.push(a, bb, c)
    }
  }
  const parts: BakedPart[] = []
  for (const b of buckets.values()) {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(b.nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(b.col, 3))
    g.setAttribute('rm', new Float32BufferAttribute(b.rm, 2))
    g.setIndex(b.pos.length / 3 > 65535 ? new Uint32BufferAttribute(b.idx, 1) : new Uint16BufferAttribute(b.idx, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    // released by releaseBake only, never by a cut-in's GPU sweep (cutins/gpu.ts): the set is shared by every crowd that asks
    g.userData.keep = true
    parts.push({ joint: b.joint, cls: b.cls, tag: b.tag, geometry: g, triangles: b.idx.length / 3 })
  }
  // the evaluator is the rig itself with its meshes taken off: only the joint tree is left to pose
  for (const m of meshes) m.removeFromParent()
  const joints = new Map<PartJoint, Object3D>()
  for (const [o, name] of animated) joints.set(name, o)
  return { kind, side, variant, detail, parts, evaluator: rig, joints, height: rig.height, refs: 0 }
}

/** The baked set for one troop variant, built once and shared by every crowd that asks (reference counted). */
export function acquireBake(kind: TroopKind, side: SidePalette, variant: number, detail: Detail): BakedSet {
  const key = `${kind}|${side}|${variant}|${detail}`
  let s = cache.get(key)
  if (!s) {
    s = bakeRig(figures.buildTroop(kind, side, variant), kind, side, variant, detail)
    cache.set(key, s)
  }
  s.refs++
  if (pinning && !pinned.has(key)) {
    // the battle keeps it: one more reference until unpinBakes()
    pinned.set(key, s)
    s.refs++
  }
  return s
}

// While a battle with cut-ins is loaded every bake it asks for stays built (and uploaded) between cut-ins, instead of being
// rebuilt by the next scene: the warm pool of docs/spec/51 "Performance". Capped by what the battle's units can field.
let pinning = false
const pinned = new Map<string, BakedSet>()
/** Keep (true) every bake acquired from now on until unpinBakes(); false stops pinning new ones. */
export function pinBakes(on: boolean): void {
  pinning = on
}
/** Drop the battle's hold on its bakes (each is freed once no crowd uses it). */
export function unpinBakes(): void {
  pinning = false
  const list = [...pinned.values()]
  pinned.clear()
  for (const s of list) releaseBake(s)
}
export function pinnedBakes(): number {
  return pinned.size
}

export function releaseBake(s: BakedSet): void {
  s.refs--
  if (s.refs > 0) return
  for (const p of s.parts) p.geometry.dispose()
  s.evaluator.dispose()
  cache.delete(`${s.kind}|${s.side}|${s.variant}|${s.detail}`)
}

/** Frees every baked set (tests, hot reload). */
export function disposeCrowdCaches(): void {
  pinned.clear()
  for (const s of [...cache.values()]) {
    s.refs = 1
    releaseBake(s)
  }
  for (const g of reduced.values()) g.dispose()
  reduced.clear()
}

export function bakeStats(): { sets: number; bytes: number } {
  let bytes = 0
  for (const s of cache.values()) {
    for (const p of s.parts) {
      for (const a of Object.values(p.geometry.attributes)) bytes += (a as { array: { byteLength: number } }).array.byteLength
      bytes += p.geometry.index?.array.byteLength ?? 0
    }
  }
  return { sets: cache.size, bytes }
}
