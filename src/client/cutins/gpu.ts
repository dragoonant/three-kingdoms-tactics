// GPU bookkeeping for the persistent cut-in renderer (docs/spec/51 "Performance: warm-up and reuse").
//
// The cut-in canvas lives for the whole battle, so what a world uploads must be released when it unmounts, except the shared
// caches every world reuses (the figure kit's geometries, the crowd bakes, the stage's textures...), which are marked kept.
//   - keep(x)        marks a geometry or texture as shared: the sweep never disposes it.
//   - sweep(root)    disposes every geometry and texture under root that is not kept, and the instance buffers of its
//                    instanced meshes. Materials are not disposed: their programs are shared and pinned (below), and a
//                    material object is plain JS that the garbage collector frees.
//   - pinPrograms()  holds one extra reference on every shader program the renderer has compiled, so disposing the last
//                    material of a kind never deletes a program the next cut-in needs again (three releases a program when
//                    its last material is disposed).
// No React here; three only.
import { InstancedMesh, type BufferGeometry, type Material, type Object3D, type Skeleton, type SkinnedMesh, type Texture, type WebGLRenderer } from 'three'

type Keepable = BufferGeometry | Texture

export function keep<T extends Keepable>(x: T): T {
  x.userData.keep = true
  return x
}
export const isKept = (x: Keepable): boolean => x.userData?.keep === true

function texturesOf(m: Material, out: Set<Texture>): void {
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && typeof v === 'object' && (v as Texture).isTexture) out.add(v as Texture)
  }
  const u = (m as unknown as { uniforms?: Record<string, { value?: unknown }> }).uniforms
  if (u) for (const k of Object.keys(u)) {
    const v = u[k]?.value
    if (v && typeof v === 'object' && (v as Texture).isTexture) out.add(v as Texture)
  }
}

/** What a sweep of root would release (collected while the tree is still whole). */
export interface Sweep {
  geometries: BufferGeometry[]
  textures: Texture[]
  instanced: InstancedMesh[]
  /** Skeletons of compacted figures (figures/compact.ts): each owns a bone texture. */
  skeletons: Skeleton[]
}

export function collect(root: Object3D): Sweep {
  const geos = new Set<BufferGeometry>()
  const texs = new Set<Texture>()
  const inst: InstancedMesh[] = []
  const skel = new Set<Skeleton>()
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh && (o as SkinnedMesh).skeleton) skel.add((o as SkinnedMesh).skeleton)
    const m = o as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] }
    if (m.geometry && !isKept(m.geometry)) geos.add(m.geometry)
    if (m.material) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) texturesOf(mat, texs)
    if (o instanceof InstancedMesh) inst.push(o)
  })
  return { geometries: [...geos], textures: [...texs].filter((t) => !isKept(t)), instanced: inst, skeletons: [...skel] }
}

export function release(s: Sweep): void {
  for (const g of s.geometries) g.dispose()
  for (const t of s.textures) t.dispose()
  for (const i of s.instanced) i.dispose()
  for (const k of s.skeletons) k.dispose()
}

const pinned = new WeakSet<object>()
/** Pin every program compiled so far (see above). Returns how many programs the renderer holds. */
export function pinPrograms(gl: WebGLRenderer): number {
  const progs = (gl.info.programs ?? []) as unknown as { usedTimes: number }[]
  for (const p of progs) {
    if (pinned.has(p)) continue
    pinned.add(p)
    p.usedTimes++
  }
  return progs.length
}
