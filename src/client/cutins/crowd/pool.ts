// The instanced renderer of the crowd: one InstancedMesh per (variant, joint, face side) of a baked troop (bake.ts), one
// matrix per member. A member's matrix for a part is  memberMatrix x jointWorld  where jointWorld comes from posing the baked
// set's joint-only evaluator rig with the member's clip, exactly as a full rig is posed (applyClip), so the instanced ranks
// move with the same joint clips as the front rank.
import { DoubleSide, DynamicDrawUsage, FrontSide, InstancedMesh, Matrix4, MeshStandardMaterial, type Object3D, type Vector3 } from 'three'
import { applyClip, type Clip } from '../../figures/clips'
import type { BakedPart, BakedSet } from './bake'
import type { Frame } from './motion'

const materials = new Map<string, MeshStandardMaterial>()

/** Shared material of the instanced troops: vertex colours, with roughness and metalness read per vertex from the `rm` attribute. */
export function crowdMaterial(cls: 'S' | 'D'): MeshStandardMaterial {
  let m = materials.get(cls)
  if (!m) {
    m = new MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.72, metalness: 0.04, side: cls === 'D' ? DoubleSide : FrontSide })
    m.name = `crowd-${cls}`
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nvarying vec2 vRm;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRm = rm;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRm;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;')
    }
    m.customProgramCacheKey = () => 'crowd-rm'
    materials.set(cls, m)
  }
  return m
}

export function disposeCrowdMaterials(): void {
  for (const m of materials.values()) m.dispose()
  materials.clear()
}

interface PoolMesh {
  part: BakedPart
  joint: Object3D
  mesh: InstancedMesh
}

const ZERO = new Float32Array(16)
const _m = new Matrix4()

/** Lowest and highest crowd-local y of a member's baked geometry for a clip and member matrix (tests, calibration). */
export function bakeExtent(bake: BakedSet, clip: Clip, memberMatrix: Matrix4, only?: readonly string[]): { minY: number; maxY: number } {
  applyClip(bake.evaluator, clip)
  bake.evaluator.group.updateMatrixWorld(true)
  let minY = Infinity
  let maxY = -Infinity
  for (const part of bake.parts) {
    if (only && !only.includes(part.joint)) continue
    const joint = bake.joints.get(part.joint)
    if (!joint) continue
    const e = _m.multiplyMatrices(memberMatrix, joint.matrixWorld).elements
    const pos = part.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const wy = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!
      if (wy < minY) minY = wy
      if (wy > maxY) maxY = wy
    }
  }
  return { minY, maxY }
}

/** All the instanced members that share one baked variant. */
export class Pool {
  readonly meshes: PoolMesh[] = []
  private readonly mm = new Matrix4()
  private readonly pm = new Matrix4()
  constructor(
    readonly bake: BakedSet,
    /** Crowd member indices drawn by this pool; a member's instance index is its position here. */
    readonly members: readonly number[],
    shadows: boolean,
  ) {
    for (const part of bake.parts) {
      const joint = bake.joints.get(part.joint)
      if (!joint) continue
      const mesh = new InstancedMesh(part.geometry, crowdMaterial(part.cls), Math.max(1, members.length))
      mesh.count = members.length
      mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      mesh.frustumCulled = false
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      mesh.name = `crowd-${bake.kind}-v${bake.variant}-${part.joint}${part.cls}${part.tag === 'arrow' ? '-arrow' : ''}`
      this.meshes.push({ part, joint, mesh })
    }
  }

  get triangles(): number {
    return this.meshes.reduce((a, p) => a + p.part.triangles * this.members.length, 0)
  }

  /** Poses the evaluator with the member's clip and writes its matrix for every part. `memberMatrix` is crowd-local. */
  write(slot: number, frame: Frame, memberMatrix: Matrix4): void {
    applyClip(this.bake.evaluator, frame.clip)
    this.bake.evaluator.group.updateMatrixWorld(true)
    for (const p of this.meshes) {
      const a = p.mesh.instanceMatrix.array as Float32Array
      if (p.part.tag === 'arrow' && !frame.arrow) {
        a.set(ZERO, slot * 16)
        continue
      }
      this.pm.multiplyMatrices(memberMatrix, p.joint.matrixWorld)
      this.pm.toArray(a, slot * 16)
    }
  }

  /** World position of a joint of one member (for arrows and impacts). */
  jointPoint(frame: Frame, memberMatrix: Matrix4, jointName: string, out: Vector3): Vector3 {
    applyClip(this.bake.evaluator, frame.clip)
    this.bake.evaluator.group.updateMatrixWorld(true)
    const j = this.bake.joints.get(jointName)
    this.mm.multiplyMatrices(memberMatrix, (j ?? this.bake.evaluator.group).matrixWorld)
    return out.setFromMatrixPosition(this.mm)
  }

  commit(): void {
    for (const p of this.meshes) p.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    for (const p of this.meshes) {
      p.mesh.removeFromParent()
      p.mesh.dispose()
    }
    this.meshes.length = 0
  }
}

