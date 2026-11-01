// Pose helpers for the cut-ins. Everything works through the frozen joint names in figures/rig.ts, never through mesh
// names, so it behaves the same on the capsule placeholders and on the real hero/troop rigs.
//
// Conventions assumed of a rig (docs/spec/31 "Animation joints"): origin at the centre of the base, +Z forward, +Y up;
// an arm or leg hangs along its local -Y at rest; the weapon shaft runs along the `weapon` joint's local +Y.
import { Euler, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import { figures, type HumanJoint, type HorseJoint, type Rig } from '../figures'

const tmpQ = new Quaternion()
const tmpQ2 = new Quaternion()
const tmpE = new Euler()
const tmpV = new Vector3()

interface Rest {
  p: Vector3
  q: Quaternion
}

export type Dir = readonly [number, number, number] | { x: number; y: number; z: number }
const dx = (d: Dir): number => ('x' in d ? d.x : d[0])
const dy = (d: Dir): number => ('x' in d ? d.y : d[1])
const dz = (d: Dir): number => ('x' in d ? d.z : d[2])

/** A posable view of one rig. Call `reset()` every frame, then pose from the hips outwards. */
export class Puppet {
  readonly rig: Rig
  private readonly rest = new Map<Object3D, Rest>()
  private readonly human = new Map<string, Object3D>()
  private readonly horse = new Map<string, Object3D>()

  constructor(rig: Rig) {
    this.rig = rig
    for (const [name, o] of Object.entries(rig.joints)) {
      if (!o) continue
      this.human.set(name, o)
      this.rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() })
    }
    if (rig.mount) {
      for (const [name, o] of Object.entries(rig.mount.joints)) {
        this.horse.set(name, o)
        this.rest.set(o, { p: o.position.clone(), q: o.quaternion.clone() })
      }
    }
    // The root group is positioned by the scene, so rest of the group itself is not captured.
  }

  get mounted(): boolean {
    return !!this.rig.mount
  }

  reset(): void {
    for (const [o, r] of this.rest) {
      o.position.copy(r.p)
      o.quaternion.copy(r.q)
    }
  }

  j(name: HumanJoint): Object3D | undefined {
    return this.human.get(name)
  }

  h(name: HorseJoint): Object3D | undefined {
    return this.horse.get(name)
  }

  /** Rotate a human joint by Euler (x,y,z) on top of its rest orientation. */
  rot(name: HumanJoint, x: number, y = 0, z = 0): void {
    const o = this.human.get(name)
    if (o) this.applyRot(o, x, y, z)
  }

  rotH(name: HorseJoint, x: number, y = 0, z = 0): void {
    const o = this.horse.get(name)
    if (o) this.applyRot(o, x, y, z)
  }

  private applyRot(o: Object3D, x: number, y: number, z: number): void {
    const r = this.rest.get(o)
    if (!r) return
    tmpE.set(x, y, z, 'YXZ')
    tmpQ.setFromEuler(tmpE)
    o.quaternion.copy(r.q).multiply(tmpQ)
  }

  move(name: HumanJoint, dx: number, dy: number, dz = 0): void {
    const o = this.human.get(name)
    const r = o && this.rest.get(o)
    if (o && r) o.position.set(r.p.x + dx, r.p.y + dy, r.p.z + dz)
  }

  moveH(name: HorseJoint, dx: number, dy: number, dz = 0): void {
    const o = this.horse.get(name)
    const r = o && this.rest.get(o)
    if (o && r) o.position.set(r.p.x + dx, r.p.y + dy, r.p.z + dz)
  }

  /**
   * Swing a joint so that its local `axis` points along `dir` (given in figure space). `axis` is (0,-1,0) for limbs and
   * (0,1,0) for a weapon shaft. Twist is the minimal rotation from the joint's rest pointing direction.
   */
  aim(name: HumanJoint, dir: Dir, axis: Dir = [0, -1, 0]): void {
    const o = this.human.get(name)
    const r = o && this.rest.get(o)
    if (!o || !r || !o.parent) return
    const group = this.rig.group
    group.updateWorldMatrix(true, false)
    o.parent.updateWorldMatrix(true, false)
    // parent orientation in figure space
    const qg = group.getWorldQuaternion(tmpQ).invert()
    const qp = o.parent.getWorldQuaternion(tmpQ2)
    const qParentFig = qg.multiply(qp).clone()
    const qRestFig = qParentFig.clone().multiply(r.q)
    const restDir = tmpV.set(dx(axis), dy(axis), dz(axis)).applyQuaternion(qRestFig).clone()
    const want = new Vector3(dx(dir), dy(dir), dz(dir)).normalize()
    const delta = new Quaternion().setFromUnitVectors(restDir, want)
    const qFig = delta.multiply(qRestFig)
    o.quaternion.copy(qParentFig.invert().multiply(qFig))
  }

  /** Position of a joint in figure space (group-local). Call after posing the joints above it. */
  at(name: HumanJoint, out = new Vector3()): Vector3 {
    const o = this.human.get(name)
    if (!o) return out.set(0, 0, 0)
    this.rig.group.updateWorldMatrix(true, true)
    o.getWorldPosition(out)
    return this.rig.group.worldToLocal(out)
  }

  atH(name: HorseJoint, out = new Vector3()): Vector3 {
    const o = this.horse.get(name)
    if (!o) return out.set(0, 0, 0)
    this.rig.group.updateWorldMatrix(true, true)
    o.getWorldPosition(out)
    return this.rig.group.worldToLocal(out)
  }

  /** +1 for a joint on the figure's +x side, -1 for -x (arms and legs come in pairs). */
  side(name: 'armL' | 'armR' | 'legL' | 'legR'): number {
    const o = this.human.get(name)
    const s = o ? Math.sign(o.position.x) : 0
    if (s !== 0) return s
    return name.endsWith('L') ? 1 : -1
  }
}

/** Mark every mesh of a rig as shadow caster and receiver. */
export function enableShadows(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
}

// ---- reusable poses ----------------------------------------------------------------------------------------------

/** Shared easing helpers for poses. */
export const sstep = (u: number): number => {
  const x = u < 0 ? 0 : u > 1 ? 1 : u
  return x * x * (3 - 2 * x)
}
export const mix = (a: number, b: number, u: number): number => a + (b - a) * u

/** Idle breathing/sway; phase is the actor's own offset. */
export function pIdle(p: Puppet, s: number, phase: number, amp = 1): void {
  const b = Math.sin((s + phase * 6) * 2.4) * 0.025 * amp
  p.rot('torso', b, Math.sin((s + phase * 4) * 0.9) * 0.04 * amp, 0)
  p.rot('head', -b * 0.6, Math.sin((s + phase * 5) * 0.7) * 0.06 * amp, 0)
}

let refScale: number | null = null
/**
 * The cut-ins are laid out for miniatures about 0.45 tiles tall. Real rigs are about twice that, so every figure is
 * scaled by 0.45 / (the infantry rig's height), taken from rig.height rather than a hard-coded size. All figures share it,
 * so their relative sizes (a hero on a horse against a footman) are the rig's own.
 */
export function figureScale(): number {
  if (refScale === null) {
    const r = figures.buildTroop('infantry', 'han', 0)
    refScale = r.height > 0 ? 0.45 / r.height : 1
    r.dispose()
  }
  return refScale
}

/** Scale a freshly built rig to the cut-in miniature size and turn on shadows. Returns the scale used. */
export function fitFigure(rig: Rig): number {
  const k = figureScale()
  rig.group.scale.setScalar(k)
  enableShadows(rig.group)
  return k
}

/** Kneel on the right knee: lowers the whole body onto the sand, front leg bent. `unit` is 1 / the figure's scale. */
export function pKneel(p: Puppet, depth = 1, unit = 1): void {
  p.move('root', 0, -0.075 * depth * unit, 0)
  p.rot('legR', -1.25 * depth, 0, 0)
  p.rot('legL', 1.0 * depth, 0, 0)
}

/** Lean the torso forward/back (+ is forward, toward +Z). */
export function pLean(p: Puppet, forward: number, twist = 0): void {
  p.rot('torso', forward, twist, 0)
}

/** Both arms hanging at rest, slightly out. */
export function pArmsDown(p: Puppet): void {
  p.aim('armL', [0.2 * p.side('armL'), -1, 0.05])
  p.aim('armR', [0.2 * p.side('armR'), -1, 0.05])
}

/** Arms thrown up and out (flinch, panic, cheer). amount 0..1. */
export function pArmsUp(p: Puppet, amount: number, spread = 0.6): void {
  const sL = p.side('armL')
  const sR = p.side('armR')
  p.aim('armL', [sL * mix(0.2, spread, amount), mix(-1, 1, amount), mix(0.05, 0.25, amount)])
  p.aim('armR', [sR * mix(0.2, spread, amount), mix(-1, 1, amount), mix(0.05, 0.25, amount)])
}

/** Running/galloping leg cycle for a rider-less body. phase in cycles. */
export function pRunLegs(p: Puppet, phase: number, amp = 0.9): void {
  const a = Math.sin(phase * Math.PI * 2)
  p.rot('legL', a * amp, 0, 0)
  p.rot('legR', -a * amp, 0, 0)
}

/** Horse gallop: a rotary gallop with fore pair and hind pair slightly out of step. phase in cycles. */
export function pGallop(p: Puppet, phase: number, amp = 0.75, bob = 0.03): void {
  // (bob is in the rig's own units)
  const w = phase * Math.PI * 2
  p.rotH('legFL', Math.sin(w + 0.0) * amp, 0, 0)
  p.rotH('legFR', Math.sin(w + 0.55) * amp, 0, 0)
  p.rotH('legBL', Math.sin(w + 2.6) * amp, 0, 0)
  p.rotH('legBR', Math.sin(w + 3.2) * amp, 0, 0)
  p.rotH('body', Math.sin(w + 1.1) * 0.07, 0, 0)
  p.rotH('neck', -Math.sin(w + 0.4) * 0.12, 0, 0)
  p.moveH('body', 0, Math.abs(Math.sin(w + 0.6)) * bob, 0)
  p.rotH('tail', -0.5 + Math.sin(w * 2) * 0.12, 0, 0)
}

/** Horse rears on its hind legs. amount 0..1 */
export function pRear(p: Puppet, amount: number): void {
  p.rotH('body', -0.62 * amount, 0, 0)
  p.rotH('legFL', -1.1 * amount, 0, 0)
  p.rotH('legFR', -0.9 * amount, 0, 0)
  p.rotH('neck', 0.25 * amount, 0, 0)
  p.rotH('tail', 0.3 * amount, 0, 0)
}

export function lerpAngle(a: number, b: number, u: number): number {
  return a + (b - a) * u
}

/** Squared-distance helper. */
export function dist2(ax: number, az: number, bx: number, bz: number): number {
  return (ax - bx) * (ax - bx) + (az - bz) * (az - bz)
}
