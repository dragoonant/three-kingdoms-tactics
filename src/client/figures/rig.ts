// Rig contract for hero, officer and troop figures (docs/spec/31-hero-figures.md "Animation joints").
// The board and the battle cut-ins (docs/spec/51-battle-cutins.md) animate ONLY through these joint names, so a
// procedural body can later be swapped for a GLB without touching either. This file holds the contract plus a
// deliberately plain placeholder builder; the real builders live in heroes.ts / troops.ts / horse.ts.
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Object3D } from 'three'

export const HUMAN_JOINTS = ['root', 'hips', 'torso', 'head', 'armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'weapon', 'offhand'] as const
export const OPTIONAL_JOINTS = ['cape', 'beard', 'footL', 'footR'] as const
export const HORSE_JOINTS = ['body', 'neck', 'head', 'legFL', 'legFR', 'legBL', 'legBR', 'tail'] as const

export type HumanJoint = (typeof HUMAN_JOINTS)[number] | (typeof OPTIONAL_JOINTS)[number]
/** Optional pasterns: the hoof hangs from the leg so it can stay level on the sand while the leg swings. */
export const HOOF_JOINTS = ['hoofFL', 'hoofFR', 'hoofBL', 'hoofBR'] as const
export type HorseJoint = (typeof HORSE_JOINTS)[number]
export type HoofJoint = (typeof HOOF_JOINTS)[number]

export interface HorseRig {
  group: Group
  joints: Record<HorseJoint, Object3D> & Partial<Record<HoofJoint, Object3D>>
  /** Height of the saddle above the horse's root, in figure units. */
  saddleY: number
}

export interface Rig {
  /** Root group: origin on the ground plane under the figure (soles and hooves rest on y = 0; there is no base), +Z is "forward", 1 unit = one tile width. */
  group: Group
  joints: Partial<Record<HumanJoint, Object3D>> & Record<(typeof HUMAN_JOINTS)[number], Object3D>
  /** Present when the figure is mounted; the rider's `root` sits on `mount.joints.body` at `saddleY`. */
  mount?: HorseRig
  /** Total figure height from the ground, including headgear and weapons (for camera framing). */
  height: number
  /** Radius of the ground ring decal the board paints under the figure (optional; defaults to 0.35, 0.44 mounted). */
  footprint?: number
  /** Uniform scale already built into the body (the brothers differ in height: Guan Yu 1.15, Zhang Fei 1.07, Liu Bei 1). Gait distances are in unscaled rig units, so a caller moving the figure `d` tiles passes `d / bodyScale` to the clips. Default 1. */
  bodyScale?: number
  /** Which kind of figure this is (for clips that differ by kind). */
  kind: 'hero' | 'officer' | 'infantry' | 'archer' | 'cavalry' | 'rebel'
  dispose(): void
}

export type TroopKind = 'infantry' | 'archer' | 'cavalry' | 'rebel'
/** Side palette key, matching the theme tokens (--han, --yellow, --cao, --dong, --lu). */
export type SidePalette = 'han' | 'yellow' | 'cao' | 'dong' | 'lu'

/** Builders implemented by heroes.ts / troops.ts. Signatures are frozen. */
export interface FigureFactory {
  /** Unique heroes from 31-hero-figures.md; unknown ids fall back to the named-officer kit. */
  buildHero(officerId: string): Rig
  buildTroop(kind: TroopKind, side: SidePalette, variant?: number): Rig
  /** Officer ids that have a unique hero design. */
  heroIds(): readonly string[]
}

/** Plain placeholder used until heroes.ts / troops.ts land: capsule body, sphere head, box weapon, all joints present. */
export function placeholderRig(kind: Rig['kind'], colour = '#2f6b5e'): Rig {
  const mat = new MeshStandardMaterial({ color: colour, roughness: 0.8 })
  const dark = new MeshStandardMaterial({ color: '#111111', roughness: 0.9 })
  const node = (name: string, parent: Object3D, x = 0, y = 0, z = 0): Group => {
    const g = new Group()
    g.name = name
    g.position.set(x, y, z)
    parent.add(g)
    return g
  }
  const group = new Group()
  group.name = 'figure'
  const root = node('root', group, 0, 0, 0)
  const hips = node('hips', root, 0, 0.1, 0)
  const legL = node('legL', hips, -0.04, 0, 0)
  const legR = node('legR', hips, 0.04, 0, 0)
  for (const l of [legL, legR]) {
    const m = new Mesh(new CapsuleGeometry(0.025, 0.05, 4, 8), mat)
    m.position.y = -0.05
    l.add(m)
  }
  const torso = node('torso', hips, 0, 0.02, 0)
  const tm = new Mesh(new CapsuleGeometry(0.06, 0.06, 4, 12), mat)
  tm.position.y = 0.06
  torso.add(tm)
  const head = node('head', torso, 0, 0.15, 0)
  const hm = new Mesh(new SphereGeometry(0.085, 20, 16), mat)
  hm.position.y = 0.08
  head.add(hm)
  const armL = node('armL', torso, -0.08, 0.1, 0)
  const armR = node('armR', torso, 0.08, 0.1, 0)
  const handL = node('handL', armL, 0, -0.08, 0)
  const handR = node('handR', armR, 0, -0.08, 0)
  const weapon = node('weapon', handR)
  const wm = new Mesh(new BoxGeometry(0.01, 0.3, 0.01), dark)
  wm.position.y = 0.1
  weapon.add(wm)
  const offhand = node('offhand', handL)
  const joints = { root, hips, torso, head, armL, armR, handL, handR, legL, legR, weapon, offhand }
  return {
    group,
    joints,
    height: 0.45,
    kind,
    dispose() {
      group.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose()
      })
      mat.dispose()
      dark.dispose()
    },
  }
}
