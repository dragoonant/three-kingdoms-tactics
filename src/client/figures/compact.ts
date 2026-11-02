// Draw-call compaction of a built rig (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32).
//
// A procedural figure is dozens of small meshes (a mounted hero is about 110), and every one is a draw call in the main pass and
// another in the shadow pass. Nothing moves a mesh on its own: the clips and the scenes move JOINTS (rig.ts), and a mesh only
// rides the nearest joint above it. So the rig can be drawn as:
//   - ONE skinned mesh per face side for the body, whose bones are the rig's own joint objects: each vertex follows exactly one
//     joint with weight 1, which is the same transform parenting gave it, so the picture does not change;
//   - one merged mesh per (joint, face side) under the joints the scenes hide on their own (weapon, off hand) and the nodes
//     they look up by name (`arrow`).
// Materials are baked into per-vertex colour, roughness, metalness and emissive (the idea of the crowd bake, crowd/bake.ts, at
// full detail), so the whole figure shares two materials. A mounted hero drops from about 110 draws to about 4, and the shadow
// pass with it.
//
// The joint contract is untouched: every joint object (rig.joints, mount.joints, the mount group, the rig group) stays where it
// was and is still what the clips drive; only the meshes under it are replaced. A mesh whose material is not a plain opaque
// MeshStandardMaterial (transparent, textured), a hidden mesh, or a mesh with children is left alone.
//
// Merged geometries are cached by what went into them (source geometry ids, materials, bones and the relative transforms), so
// every copy of the same design shares one upload; they are kept (never released by a cut-in's GPU sweep) when all their
// sources are. A skinned figure is culled by a sphere that follows its joints (liveSphere). No DOM, no React: three only.
import {
  AttachedBindMode,
  type Bone,
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import { HOOF_JOINTS, HORSE_JOINTS, HUMAN_JOINTS, OPTIONAL_JOINTS, type Rig } from './rig'

/** Names of nodes the scenes find by name: they stay pivots, and are never skinned. */
const NAMED_PIVOTS = ['arrow']
/** Joints the scenes hide on their own (a thrown or dropped weapon, an empty off hand): merged under the joint, never skinned. */
const DETACHED = ['weapon', 'offhand'] as const

const mats = new Map<string, MeshStandardMaterial>()

/**
 * The material of a compacted figure: vertex colours, with roughness / metalness (`rm`) and emissive (`em`) read per vertex.
 * One per face side (and skinned or not: a skinned and a static draw never share a material object, so no draw switches a
 * material's program), shared by every compacted rig.
 */
export function figureMaterial(double: boolean, skinned = false): MeshStandardMaterial {
  const key = `${double ? 'D' : 'S'}${skinned ? 'k' : ''}`
  let m = mats.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.72, metalness: 0.04, side: double ? DoubleSide : FrontSide })
    m.name = `figure-${key}`
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nattribute vec3 em;\nvarying vec2 vRm;\nvarying vec3 vEm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRm = rm;\nvEm = em;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRm;\nvarying vec3 vEm;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEm;')
    }
    m.customProgramCacheKey = () => 'figure-rme'
    mats.set(key, m)
  }
  return m
}

const geoCache = new Map<string, BufferGeometry>()

/** Frees the merged-geometry cache and the shared materials (tests, hot reload). */
export function disposeCompactCaches(): void {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
  for (const m of mats.values()) m.dispose()
  mats.clear()
}

export function compactStats(): { geometries: number; bytes: number } {
  let bytes = 0
  for (const g of geoCache.values()) {
    for (const a of Object.values(g.attributes)) bytes += (a as { array: { byteLength: number } }).array.byteLength
    bytes += g.index?.array.byteLength ?? 0
  }
  return { geometries: geoCache.size, bytes }
}

const mergeable = (m: Material | Material[]): m is MeshStandardMaterial =>
  !Array.isArray(m) && (m as MeshStandardMaterial).isMeshStandardMaterial === true && !m.transparent && !(m as MeshStandardMaterial).map && m.visible && (m as MeshStandardMaterial).alphaTest === 0

interface Part {
  mesh: Mesh
  rel: Matrix4
}

const _inv = new Matrix4()
const _v = new Vector3()
const _n = new Vector3()
const _nm = new Matrix3()
const _e = new Color()

const r5 = (x: number): string => (Math.round(x * 1e5) / 1e5).toString()

/**
 * One geometry from parts in their pivot's frame; `bones` (one per part) adds skin indices and weights. `bake` (default) bakes
 * each part's material into colour / rm / em attributes; without it only positions and normals are kept (parts that share
 * one material).
 */
function mergeParts(parts: Part[], bones: number[] | null, bake = true): BufferGeometry {
  let verts = 0
  let tris = 0
  for (const p of parts) {
    const g = p.mesh.geometry
    verts += g.getAttribute('position').count
    tris += g.index ? g.index.count : g.getAttribute('position').count
  }
  const pos = new Float32Array(verts * 3)
  const nor = new Float32Array(verts * 3)
  const col = new Float32Array(verts * 3)
  const rm = new Float32Array(verts * 2)
  const em = new Float32Array(verts * 3)
  const idx = verts > 65535 ? new Uint32Array(tris) : new Uint16Array(tris)
  const sIdx = bones ? new Uint16Array(verts * 4) : null
  const sW = bones ? new Float32Array(verts * 4) : null
  let v0 = 0
  let i0 = 0
  for (let pi = 0; pi < parts.length; pi++) {
    const { mesh, rel } = parts[pi]!
    const g = mesh.geometry
    const mat = mesh.material as MeshStandardMaterial
    const pa = g.getAttribute('position')
    const na = g.getAttribute('normal')
    const ca = mat.vertexColors ? g.getAttribute('color') : undefined
    _nm.getNormalMatrix(rel)
    _e.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity)
    for (let i = 0; i < pa.count; i++) {
      const k = v0 + i
      _v.fromBufferAttribute(pa, i).applyMatrix4(rel)
      pos[k * 3] = _v.x
      pos[k * 3 + 1] = _v.y
      pos[k * 3 + 2] = _v.z
      if (na) _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize()
      else _n.set(0, 1, 0)
      nor[k * 3] = _n.x
      nor[k * 3 + 1] = _n.y
      nor[k * 3 + 2] = _n.z
      col[k * 3] = mat.color.r * (ca ? ca.getX(i) : 1)
      col[k * 3 + 1] = mat.color.g * (ca ? ca.getY(i) : 1)
      col[k * 3 + 2] = mat.color.b * (ca ? ca.getZ(i) : 1)
      rm[k * 2] = mat.roughness
      rm[k * 2 + 1] = mat.metalness
      em[k * 3] = _e.r
      em[k * 3 + 1] = _e.g
      em[k * 3 + 2] = _e.b
      if (sIdx && sW) {
        sIdx[k * 4] = bones![pi]!
        sW[k * 4] = 1
      }
    }
    const ix = g.getIndex()
    const n = ix ? ix.count : pa.count
    // a mirrored part (negative scale) keeps its faces outward
    const flip = rel.determinant() < 0
    for (let i = 0; i < n; i += 3) {
      const a = (ix ? ix.getX(i) : i) + v0
      const b = (ix ? ix.getX(i + 1) : i + 1) + v0
      const c = (ix ? ix.getX(i + 2) : i + 2) + v0
      idx[i0++] = a
      idx[i0++] = flip ? c : b
      idx[i0++] = flip ? b : c
    }
    v0 += pa.count
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  if (bake) {
    out.setAttribute('color', new Float32BufferAttribute(col, 3))
    out.setAttribute('rm', new Float32BufferAttribute(rm, 2))
    out.setAttribute('em', new Float32BufferAttribute(em, 3))
  }
  if (sIdx && sW) {
    out.setAttribute('skinIndex', new Uint16BufferAttribute(sIdx, 4))
    out.setAttribute('skinWeight', new Float32BufferAttribute(sW, 4))
  }
  out.setIndex(idx instanceof Uint32Array ? new Uint32BufferAttribute(idx, 1) : new Uint16BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  out.computeBoundingBox()
  return out
}

/** The objects of a rig that must stay addressable: its joints, its mount and the named nodes the scenes look up. */
export function pivotsOf(rig: Rig): Set<Object3D> {
  const piv = new Set<Object3D>([rig.group])
  for (const k of [...HUMAN_JOINTS, ...OPTIONAL_JOINTS]) {
    const j = rig.joints[k]
    if (j) piv.add(j)
  }
  if (rig.mount) {
    piv.add(rig.mount.group)
    for (const k of [...HORSE_JOINTS, ...HOOF_JOINTS]) {
      const j = rig.mount.joints[k]
      if (j) piv.add(j)
    }
  }
  rig.group.traverse((o) => {
    if (NAMED_PIVOTS.includes(o.name) || (o.name.startsWith('foot') && !(o as Mesh).isMesh)) piv.add(o)
  })
  return piv
}

const _c = new Vector3()
const _p = new Vector3()
const _wi = new Matrix4()

/**
 * A culling sphere for a skinned figure that follows its pose: the joints' current positions (in the mesh's frame), each padded
 * by the reach of the parts it carries. One pass over the joints, so it is recomputed whenever three asks (the main and the
 * shadow pass of every frame); `computeBoundingSphere` is never needed.
 */
function liveSphere(mesh: SkinnedMesh, bones: readonly Object3D[], pads: readonly number[]): void {
  const out = new Sphere()
  const box = new Box3()
  Object.defineProperty(mesh, 'boundingSphere', {
    configurable: true,
    get(): Sphere {
      _wi.copy(mesh.matrixWorld).invert()
      const own = Math.max(1e-6, mesh.matrixWorld.getMaxScaleOnAxis())
      box.makeEmpty()
      for (const b of bones) box.expandByPoint(_p.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_wi))
      box.getCenter(_c)
      let r = 0
      for (let i = 0; i < bones.length; i++) {
        const b = bones[i]!
        _p.setFromMatrixPosition(b.matrixWorld).applyMatrix4(_wi)
        r = Math.max(r, _p.distanceTo(_c) + (pads[i]! * b.matrixWorld.getMaxScaleOnAxis()) / own)
      }
      out.center.copy(_c)
      out.radius = r
      return out
    },
    set(): void {
      /* follows the pose */
    },
  })
}

export interface CompactResult {
  before: number
  after: number
}

/** Swaps a source geometry for a lower-detail one (cutins/crowd/bake.ts lowGeometry); cached by the caller. */
export type Reduce = (g: BufferGeometry, tiny: boolean) => BufferGeometry

interface Bucket {
  /** The joint a static merge hangs from; null for the skinned body. */
  pivot: Object3D | null
  double: boolean
  cast: boolean
  receive: boolean
  parts: Part[]
  bones: number[]
}

/**
 * Replace the rig's meshes by as few draws as the joint contract allows (see the top of the file). Returns the mesh counts
 * before and after. `skin: false` merges per (joint, face side) only. Call it on a freshly built rig (in any pose: parts are
 * merged in their joint's frame).
 */
export function compactRig(rig: Rig, o: { skin?: boolean; reduce?: Reduce } = {}): CompactResult {
  const skin = o.skin ?? true
  const reduce = o.reduce ?? null
  const pivots = pivotsOf(rig)
  const detached = new Set<Object3D>()
  for (const k of DETACHED) {
    const j = rig.joints[k]
    if (j) detached.add(j)
  }
  rig.group.traverse((x) => {
    if (NAMED_PIVOTS.includes(x.name)) detached.add(x)
  })
  rig.group.updateMatrixWorld(true)
  const buckets = new Map<string, Bucket>()
  const meshes: Mesh[] = []
  rig.group.traverse((x) => {
    if ((x as Mesh).isMesh) meshes.push(x as Mesh)
  })
  const bones: Object3D[] = []
  const boneIndex = new Map<Object3D, number>()
  let kept = 0
  for (const m of meshes) {
    const special = m as unknown as { isInstancedMesh?: boolean; isSkinnedMesh?: boolean }
    if (special.isInstancedMesh || special.isSkinnedMesh || !mergeable(m.material) || m.children.length > 0) {
      kept++
      continue
    }
    // the nearest pivot above; every node on the way must be visible
    let anc: Object3D | null = m.parent
    let ok = m.visible && m.renderOrder === 0 && m.frustumCulled
    while (anc && !pivots.has(anc)) {
      if (!anc.visible) ok = false
      anc = anc.parent
    }
    if (!anc || !ok) {
      kept++
      continue
    }
    // under a detached joint (or a named node): a static merge under that joint
    let free = false
    for (let a: Object3D | null = anc; a && a !== rig.group; a = a.parent) {
      if (detached.has(a)) {
        free = true
        break
      }
    }
    const mat = m.material as MeshStandardMaterial
    const double = mat.side === DoubleSide
    const asSkin = skin && !free
    const key = `${asSkin ? 'skin' : anc.uuid}|${double ? 'D' : 'S'}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`
    let b = buckets.get(key)
    if (!b) {
      b = { pivot: asSkin ? null : anc, double, cast: m.castShadow, receive: m.receiveShadow, parts: [], bones: [] }
      buckets.set(key, b)
    }
    const rel = new Matrix4().multiplyMatrices(_inv.copy(anc.matrixWorld).invert(), m.matrixWorld)
    if (reduce) {
      // a lower-detail stand-in for a generated primitive (the phone tier); `tiny`: a few millimetres across
      m.geometry.computeBoundingSphere()
      const r = (m.geometry.boundingSphere?.radius ?? 1) * Math.max(rel.getMaxScaleOnAxis(), 1e-6)
      m.geometry = reduce(m.geometry, r < 0.055)
    }
    b.parts.push({ mesh: m, rel })
    if (asSkin) {
      let bi = boneIndex.get(anc)
      if (bi === undefined) {
        bi = bones.length
        bones.push(anc)
        boneIndex.set(anc, bi)
      }
      b.bones.push(bi)
    }
  }
  let after = kept
  let skeleton: Skeleton | null = null
  const pads: number[] = []
  for (const b of buckets.values()) {
    const sig =
      (b.pivot ? '' : 'skin;') +
      b.parts
        .map(({ mesh, rel }, i) => `${b.pivot ? '' : `${b.bones[i]}@`}${mesh.geometry.uuid}:${(mesh.material as Material).uuid}:${rel.elements.map(r5).join(',')}`)
        .join(';')
    let g = geoCache.get(sig)
    if (!g) {
      g = mergeParts(b.parts, b.pivot ? null : b.bones)
      if (b.parts.every((p) => p.mesh.geometry.userData.keep === true)) {
        g.userData.keep = true
        geoCache.set(sig, g)
      }
    }
    let merged: Mesh
    if (b.pivot) {
      merged = new Mesh(g, figureMaterial(b.double))
      b.pivot.add(merged)
    } else {
      // bone inverses are identity: the vertices are already in their joint's frame
      // the joints are plain Object3Ds: the skeleton only reads their matrixWorld
      if (!skeleton) skeleton = new Skeleton(bones as Bone[], bones.map(() => new Matrix4()))
      const sk = new SkinnedMesh(g, figureMaterial(b.double, true))
      sk.bindMode = AttachedBindMode
      rig.group.add(sk)
      sk.bind(skeleton, new Matrix4())
      // every joint's reach (the farthest vertex it carries), for the culling sphere
      const pos = g.getAttribute('position')
      const si = g.getAttribute('skinIndex')
      for (let i = 0; i < pos.count; i++) {
        const bi = si.getX(i)
        const d = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i))
        if (!((pads[bi] ?? -1) >= d)) pads[bi] = d
      }
      merged = sk
    }
    merged.name = 'merged'
    merged.castShadow = b.cast
    merged.receiveShadow = b.receive
    for (const p of b.parts) p.mesh.removeFromParent()
    after++
  }
  if (skeleton) {
    const padded = bones.map((_, i) => pads[i] ?? 0)
    rig.group.traverse((x) => {
      if ((x as SkinnedMesh).isSkinnedMesh && (x as SkinnedMesh).skeleton === skeleton) liveSphere(x as SkinnedMesh, bones, padded)
    })
    // the skeleton's bone texture belongs to this rig: freed with it (and by the cut-in GPU sweep, cutins/gpu.ts)
    const sk = skeleton
    const dispose = rig.dispose.bind(rig)
    rig.dispose = () => {
      sk.dispose()
      dispose()
    }
  }
  // drop the plain groups the merge emptied (fewer matrices to update every frame)
  const empty: Object3D[] = []
  rig.group.traverse((x) => {
    if (!pivots.has(x) && (x as Group).isGroup && x.children.length === 0) empty.push(x)
  })
  for (const e of empty) {
    let p: Object3D | null = e
    while (p && !pivots.has(p) && (p as Group).isGroup && p.children.length === 0) {
      const up: Object3D | null = p.parent
      p.removeFromParent()
      p = up
    }
  }
  rig.group.userData.compact = { before: meshes.length, after }
  return { before: meshes.length, after }
}

/** Merge meshes into one geometry in `root`'s frame, their materials baked into colour / rm / em (props: arrows). */
export function bakeMeshes(root: Object3D, meshes: readonly Mesh[]): BufferGeometry {
  root.updateMatrixWorld(true)
  _inv.copy(root.matrixWorld).invert()
  return mergeParts(
    meshes.map((m) => ({ mesh: m, rel: new Matrix4().multiplyMatrices(_inv, m.matrixWorld) })),
    null,
  )
}

/**
 * Static set dressing (trees, tufts, rocks, houses...): every visible opaque mesh under root is drawn by one merged mesh per
 * (material, shadow flags) in root's frame, with its own material, so the picture is the same. The originals are hidden, not
 * removed (React owns them). Returns an undo that removes the merged meshes, frees their geometry and shows the originals.
 */
export function mergeStatic(root: Object3D): () => void {
  root.updateMatrixWorld(true)
  _inv.copy(root.matrixWorld).invert()
  const buckets = new Map<string, { mat: Material; cast: boolean; receive: boolean; parts: Part[] }>()
  root.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || (m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(m.material) || m.material.transparent || m.children.length > 0) return
    for (let a: Object3D | null = m; a && a !== root; a = a.parent) if (!a.visible) return
    if (!m.geometry.getAttribute('normal') || !(m.material as MeshStandardMaterial).isMeshStandardMaterial) return
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`
    let b = buckets.get(key)
    if (!b) {
      b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, parts: [] }
      buckets.set(key, b)
    }
    b.parts.push({ mesh: m, rel: new Matrix4().multiplyMatrices(_inv, m.matrixWorld) })
  })
  const added: Mesh[] = []
  const hidden: Mesh[] = []
  for (const b of buckets.values()) {
    if (b.parts.length < 2) continue
    const merged = new Mesh(mergeParts(b.parts, null, false), b.mat)
    merged.name = 'merged-static'
    merged.castShadow = b.cast
    merged.receiveShadow = b.receive
    root.add(merged)
    added.push(merged)
    for (const p of b.parts) {
      p.mesh.visible = false
      hidden.push(p.mesh)
    }
  }
  return () => {
    for (const m of added) {
      m.removeFromParent()
      m.geometry.dispose()
    }
    for (const m of hidden) m.visible = true
  }
}
