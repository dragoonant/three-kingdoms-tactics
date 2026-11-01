// The shared MGSD body, faces, hair and headgear, and the common wargear. Heroes, the officer kit and troops
// are all variations on `makeHumanoid`; the proportions live here in one place (docs/spec/31-hero-figures.md).
import type { Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { captureRest, heightOf, shade, shapeFrom, type FB, type P2, type V3 } from './kit'
import type { HorseRig, Rig } from './rig'

/** Figure dimensions in tile units. Head ~0.36 wide = shoulder width; total ~0.9 with headgear: ~2.4 heads tall. */
export const D = {
  baseH: 0.06,
  baseR: 0.35,
  hipY: 0.15,
  neckY: 0.21,
  headR: 0.18,
  headY: 0.14,
  shX: 0.17,
  shY: 0.17,
}

export interface BodyOpts {
  skin: string
  /** Chest and upper body. */
  armour: string
  /** Edging, collar, chest mirrors. */
  trim: string
  sleeve: string
  boots: string
  belt: string
  buckle: string
  skirt: 'none' | 'tassets' | 'robe'
  skirtColor: string
  skirtTrim?: string
  legs?: string
  pauldron?: { color: string; style: 'round' | 'none' }
  armLen?: number
  handRadius?: number
  sleeveStyle?: 'tight' | 'wide'
  /** Round chest mirrors in the trim colour (Han lamellar). */
  mirrors?: boolean
  studs?: string
  collar?: boolean
  baseR?: number | undefined
  /** Fatter, broader chest (Zhang Fei, Xu Chu). */
  stout?: number
}

export interface Humanoid {
  fb: FB
  group: Group
  root: Group
  hips: Group
  torso: Group
  head: Group
  armL: Group
  armR: Group
  handL: Group
  handR: Group
  legL: Group
  legR: Group
  weapon: Group
  offhand: Group
  skull: Mesh
  skinMat: MeshStandardMaterial
  opts: BodyOpts
}

export function makeHumanoid(fb: FB, o: BodyOpts): Humanoid {
  const g = fb.group
  const baseR = o.baseR ?? D.baseR
  const stout = o.stout ?? 1
  fb.cyl(g, fb.mat('#0b0a09', { rough: 0.5 }), [0, D.baseH / 2, 0], [baseR, D.baseH, baseR], undefined, { name: 'base', shadow: false })
  const root = fb.node('root', g, [0, D.baseH, 0])
  const hips = fb.node('hips', root, [0, D.hipY, 0])
  const skin = fb.mat(o.skin)

  // legs: short and stubby, with big chunky boots
  const legsC = o.legs ?? o.boots
  const legs = [-1, 1].map((sd) => {
    const leg = fb.node(sd < 0 ? 'legL' : 'legR', hips, [sd * 0.075, 0, 0])
    fb.capsule(leg, legsC, [0, -0.065, 0], 0.052, 0.04)
    fb.sph(leg, o.boots, [0, -0.112, 0.028], [0.08, 0.052, 0.112])
    fb.sph(leg, shade(o.boots, 0.08), [0, -0.092, 0.075], [0.06, 0.04, 0.05], { shadow: false })
    return leg
  })

  // skirt / robe hangs from the hips, so the legs swing underneath it
  if (o.skirt !== 'none') {
    const long = o.skirt === 'robe'
    const pts: P2[] = long
      ? [[0.001, 0.035], [0.13 * stout, 0.035], [0.15 * stout, -0.02], [0.2, -0.075], [0.232, -0.108], [0.001, -0.108]]
      : [[0.001, 0.035], [0.13 * stout, 0.035], [0.16 * stout, -0.01], [0.205, -0.07], [0.001, -0.07]]
    fb.lathe(hips, pts, fb.cloth(o.skirtColor), { name: 'skirt' })
    if (o.skirtTrim) fb.lathe(hips, [[0.205, -0.1], [0.236, -0.1], [0.236, -0.118], [0.205, -0.118]], o.skirtTrim)
    if (!long) {
      // lamellar tassets: stepped bands
      fb.lathe(hips, [[0.158, -0.03], [0.188, -0.03], [0.188, -0.036], [0.158, -0.036]], shade(o.skirtColor, 0.1))
    }
  }

  const torso = fb.node('torso', hips, [0, 0, 0])
  fb.lathe(
    torso,
    [[0.001, -0.035], [0.115 * stout, -0.035], [0.14 * stout, 0.0], [0.168 * stout, 0.085], [0.158 * stout, 0.15], [0.118, 0.195], [0.075, 0.222], [0.001, 0.23]],
    fb.cloth(o.armour),
    { name: 'chest' },
  )
  // belt + buckle
  fb.lathe(torso, [[0.138 * stout, -0.015], [0.152 * stout, -0.015], [0.152 * stout, 0.03], [0.138 * stout, 0.03]], o.belt)
  fb.box(torso, o.buckle, [0, 0.008, 0.152 * stout], [0.07, 0.05, 0.02])
  if (o.collar) fb.lathe(torso, [[0.075, 0.18], [0.115, 0.198], [0.1, 0.225], [0.07, 0.215]], o.trim, { name: 'collar' })
  if (o.mirrors) {
    for (const sd of [-1, 1]) fb.cyl(torso, fb.metal(o.trim), [sd * 0.06 * stout, 0.115, 0.155 * stout], [0.048, 0.02, 0.048], [Math.PI / 2 - 0.12, 0, 0])
  }
  if (o.studs) {
    for (let row = 0; row < 2; row++)
      for (let i = -2; i <= 2; i++) fb.sph(torso, fb.metal(o.studs), [i * 0.052, 0.07 + row * 0.055, 0.158 * stout - Math.abs(i) * 0.008], 0.011, { shadow: false })
  }

  // arms: short, with oversized hands
  const armLen = o.armLen ?? 0.19
  const hr = o.handRadius ?? 0.058
  const arms = [-1, 1].map((sd) => {
    const arm = fb.node(sd < 0 ? 'armL' : 'armR', torso, [sd * D.shX, D.shY, 0])
    if (o.sleeveStyle === 'wide') {
      fb.lathe(
        arm,
        [[0.001, 0.04], [0.06, 0.04], [0.075, 0.0], [0.108, -armLen + 0.03], [0.1, -armLen + 0.0], [0.001, -armLen + 0.0]],
        fb.cloth(o.sleeve),
      )
      fb.lathe(arm, [[0.1, -armLen + 0.04], [0.112, -armLen + 0.04], [0.112, -armLen + 0.0], [0.1, -armLen + 0.0]], o.skirtTrim ?? o.trim)
    } else {
      fb.capsule(arm, o.sleeve, [0, -armLen / 2 + 0.005, 0], 0.05, Math.max(0.01, armLen - 0.12))
    }
    if (o.pauldron && o.pauldron.style === 'round') fb.sph(arm, fb.metal(o.pauldron.color), [sd * 0.012, 0.015, 0], [0.085, 0.062, 0.085])
    else fb.sph(arm, o.sleeve, [0, 0.0, 0], 0.056)
    return arm
  })
  const hands = [0, 1].map((i) => {
    const hand = fb.node(i === 0 ? 'handL' : 'handR', arms[i]!, [0, -armLen, 0])
    fb.sph(hand, skin, [0, 0.0, 0.004], [hr, hr * 0.98, hr * 1.04], { name: 'hand' })
    return hand
  })
  const weapon = fb.node('weapon', hands[1]!)
  const offhand = fb.node('offhand', hands[0]!)

  // head: radius 0.18, as wide as the shoulders
  const head = fb.node('head', torso, [0, D.neckY, 0])
  const skull = fb.sph(head, skin, [0, D.headY, 0], [D.headR, D.headR * 0.97, D.headR * 0.96], { name: 'skull' })
  for (const sd of [-1, 1]) fb.sph(head, skin, [sd * (D.headR - 0.003), D.headY - 0.005, -0.005], [0.03, 0.05, 0.036], { name: 'ear' })

  // default rest pose: right hand a little forward, ready for a weapon
  arms[1]!.rotation.set(-0.6, 0, 0.25)
  arms[0]!.rotation.set(-0.35, 0, -0.18)

  return {
    fb,
    group: g,
    root,
    hips,
    torso,
    head,
    armL: arms[0]!,
    armR: arms[1]!,
    handL: hands[0]!,
    handR: hands[1]!,
    legL: legs[0]!,
    legR: legs[1]!,
    weapon,
    offhand,
    skull,
    skinMat: skin,
    opts: o,
  }
}

/** Packages a finished humanoid (and optional mount) as a Rig: captures the rest pose and measures the height. */
export function finishRig(h: Humanoid, kind: Rig['kind'], extra: Record<string, Object3D | undefined> = {}, mount?: HorseRig): Rig {
  const joints = {
    root: h.root, hips: h.hips, torso: h.torso, head: h.head, armL: h.armL, armR: h.armR, handL: h.handL, handR: h.handR,
    legL: h.legL, legR: h.legR, weapon: h.weapon, offhand: h.offhand, ...extra,
  } as Rig['joints']
  captureRest(joints, mount)
  const rig: Rig = {
    group: h.group,
    joints,
    height: heightOf(h.group),
    kind,
    dispose: () => h.fb.dispose(),
    ...(mount ? { mount } : {}),
  }
  h.group.userData.baseRadius = h.opts.baseR ?? D.baseR
  return rig
}

// ---------- faces ----------
export type EyeStyle = 'dot' | 'round' | 'stare' | 'phoenix' | 'narrow' | 'calm' | 'kind' | 'fierce'
export type MouthStyle = 'smile' | 'open' | 'line' | 'grim' | 'smirk' | 'shout'

export interface FaceSpec {
  eyes: EyeStyle
  brow: { color?: string; thick?: number; angle?: number; arch?: number; len?: number }
  mouth: MouthStyle
  nose?: boolean
  cheeks?: string
  lipColor?: string
}

const onFace = (x: number, y: number, depth = 0): V3 => {
  const R = 0.18
  const z = Math.sqrt(Math.max(0.0004, R * R - x * x - y * y)) - depth
  return [x, D.headY + y, z]
}
/** Rotation that turns a feature on the face sphere to follow the surface. */
const faceRot = (x: number, y: number): V3 => [-Math.asin(Math.max(-1, Math.min(1, y / 0.18))) * 0.9, Math.asin(Math.max(-1, Math.min(1, x / 0.18))), 0]

export function addFace(fb: FB, head: Object3D, skin: string, f: FaceSpec): void {
  const ink = '#14100e'
  const white = '#f4efe4'
  const brC = f.brow.color ?? '#17110d'
  for (const sd of [-1, 1]) {
    const ex = sd * 0.072
    const ey = 0.03
    const base = onFace(ex, ey, 0.004)
    const rot = faceRot(ex, ey)
    const eye = fb.node('eye', head, base, rot)
    switch (f.eyes) {
      case 'stare':
        fb.sph(eye, white, [0, 0, 0], [0.058, 0.058, 0.024])
        fb.sph(eye, ink, [0, 0, 0.016], [0.03, 0.032, 0.012])
        fb.sph(eye, white, [sd * 0.006, 0.008, 0.024], 0.005, { shadow: false })
        break
      case 'round':
        fb.sph(eye, white, [0, 0, 0], [0.05, 0.05, 0.022])
        fb.sph(eye, ink, [0, 0, 0.014], [0.03, 0.032, 0.012])
        break
      case 'phoenix':
        fb.sph(eye, white, [0, 0, 0], [0.074, 0.024, 0.018], { r: [0, 0, sd * 0.32] })
        fb.sph(eye, ink, [sd * -0.004, -0.001, 0.008], [0.04, 0.022, 0.013], { r: [0, 0, sd * 0.32] })
        break
      case 'narrow':
        fb.sph(eye, ink, [0, 0, 0.004], [0.064, 0.019, 0.015], { r: [0, 0, sd * 0.24] })
        break
      case 'fierce':
        fb.sph(eye, white, [0, 0, 0], [0.056, 0.032, 0.02], { r: [0, 0, sd * 0.14] })
        fb.sph(eye, ink, [0, -0.002, 0.012], [0.027, 0.027, 0.012])
        break
      case 'calm':
        fb.sph(eye, ink, [0, 0, 0.006], [0.038, 0.028, 0.014])
        fb.sph(eye, skin, [0, 0.017, 0.012], [0.048, 0.012, 0.015], { shadow: false })
        break
      case 'kind':
        fb.sph(eye, ink, [0, -0.002, 0.006], [0.034, 0.034, 0.014])
        fb.sph(eye, white, [sd * 0.008, 0.009, 0.018], 0.007, { shadow: false })
        break
      default:
        fb.sph(eye, ink, [0, 0, 0.006], [0.028, 0.032, 0.013])
    }
    // brow
    const bt = f.brow.thick ?? 0.018
    const ba = (f.brow.angle ?? 0) * sd
    const bl = f.brow.len ?? 0.075
    const bp = onFace(sd * 0.074, 0.075 - (f.brow.arch ?? 0) * 0.0, 0.0)
    const brow = fb.node('brow', head, bp, faceRot(sd * 0.074, 0.075))
    fb.box(brow, brC, [0, 0, 0], [bl, bt, 0.02], [0, 0, ba])
    if (f.brow.arch) fb.box(brow, brC, [-sd * 0.012, f.brow.arch * 0.012, 0], [bl * 0.5, bt * 0.9, 0.02], [0, 0, ba - sd * 0.1 * f.brow.arch])
  }
  if (f.nose !== false) fb.sph(head, shade(skin, -0.05), onFace(0, -0.02, -0.006), [0.02, 0.022, 0.022], { name: 'nose' })
  if (f.cheeks) for (const sd of [-1, 1]) fb.sph(head, f.cheeks, onFace(sd * 0.1, -0.035, 0.0), [0.034, 0.026, 0.01], { shadow: false })
  const lip = f.lipColor ?? '#7a2f26'
  const my = -0.07
  const mp = onFace(0, my, 0.002)
  const mouth = fb.node('mouth', head, mp, faceRot(0, my))
  switch (f.mouth) {
    case 'smile':
      fb.add(mouth, fb.torusGeo(0.036, 0.0085, Math.PI), lip, { r: [0, 0, Math.PI], p: [0, 0.018, 0] })
      break
    case 'smirk':
      fb.add(mouth, fb.torusGeo(0.03, 0.0085, Math.PI), lip, { r: [0, 0, Math.PI + 0.35], p: [0.008, 0.014, 0] })
      break
    case 'open':
      fb.sph(mouth, '#3b0f0d', [0, -0.008, 0], [0.04, 0.034, 0.02])
      fb.box(mouth, white, [0, 0.014, 0.01], [0.056, 0.011, 0.012])
      fb.sph(mouth, '#b8453b', [0, -0.02, 0.006], [0.02, 0.012, 0.012], { shadow: false })
      break
    case 'shout':
      fb.sph(mouth, '#3b0f0d', [0, -0.012, 0], [0.058, 0.046, 0.024])
      fb.box(mouth, white, [0, 0.018, 0.012], [0.076, 0.013, 0.014])
      fb.box(mouth, white, [0, -0.04, 0.008], [0.05, 0.01, 0.012])
      fb.sph(mouth, '#b8453b', [0, -0.026, 0.008], [0.028, 0.014, 0.012], { shadow: false })
      break
    case 'grim':
      fb.box(mouth, lip, [0, 0, 0], [0.07, 0.012, 0.014])
      fb.box(mouth, lip, [-0.036, -0.006, 0], [0.016, 0.012, 0.014], [0, 0, 0.6])
      fb.box(mouth, lip, [0.036, -0.006, 0], [0.016, 0.012, 0.014], [0, 0, -0.6])
      break
    default:
      fb.box(mouth, lip, [0, 0, 0], [0.055, 0.011, 0.014])
  }
}

// ---------- hair, caps and hats ----------
/** Hair covering the back and top of the head (front edge tilted up to show the forehead and brows). */
export function hairCap(fb: FB, head: Object3D, color: string, tilt = -0.72, r = 0.19): Mesh {
  return fb.add(head, fb.sphereCap(0.5), fb.cloth(color), { p: [0, D.headY, 0], s: r, r: [tilt, 0, 0], name: 'hair' })
}

/** A round cloth / metal cap sitting on the head, tilted back so the brows stay clear. */
export function dome(fb: FB, head: Object3D, color: string, o: { rise?: number; r?: number; y?: number; metal?: boolean; tilt?: number } = {}): Group {
  const r = o.r ?? 0.2
  const m = o.metal ? fb.metal(color) : fb.cloth(color)
  const node = fb.node('cap', head, [0, D.headY + (o.y ?? 0.0), 0], [o.tilt ?? -0.62, 0, 0])
  fb.add(node, fb.sphereCap(0.5), m, { s: [r, (o.rise ?? 1) * r, r], name: 'dome' })
  return node
}

/** Wrapped headscarf with a knot and two tails behind (Guan Yu green, Yellow Turban yellow). */
export function scarf(fb: FB, head: Object3D, color: string, o: { tails?: boolean; band?: string; knotSide?: number; high?: number } = {}): void {
  const m = fb.cloth(color)
  const hy = D.headY
  fb.add(head, fb.sphereCap(0.5), m, { p: [0, hy + 0.035, -0.005], s: [0.196, 0.17 * (o.high ?? 1), 0.2], r: [-0.18, 0, 0], name: 'scarf' })
  // wrapped brow band
  fb.add(head, fb.torusGeo(0.186, 0.026), m, { p: [0, hy + 0.062, 0.0], r: [Math.PI / 2 - 0.2, 0, 0], s: [1, 1.0, 1.1] })
  if (o.band) fb.add(head, fb.torusGeo(0.19, 0.008), o.band, { p: [0, hy + 0.048, 0.0], r: [Math.PI / 2 - 0.2, 0, 0], shadow: false })
  if (o.tails !== false) {
    const x = (o.knotSide ?? 0) * 0.06
    fb.sph(head, m, [x, hy + 0.04, -0.19], [0.05, 0.05, 0.05])
    for (const sd of [-1, 1]) {
      fb.extrude(
        head,
        'scarf-tail',
        () => shapeFrom((s) => { s.moveTo(-0.03, 0); s.lineTo(0.03, 0); s.lineTo(0.045, -0.2); s.lineTo(0.0, -0.17); s.lineTo(-0.045, -0.23); s.closePath() }),
        0.012,
        m,
        { p: [x + sd * 0.03, hy + 0.03, -0.2], r: [0.35, sd * 0.35, sd * 0.2], name: 'scarf-tail' },
        0.003,
      )
    }
  }
}

/** Round iron helmet with a rim, finial, crest knob and plume. It sits tilted back so the brows and eyes stay clear. */
export function helmet(
  fb: FB,
  head: Object3D,
  color: string,
  o: { trim?: string; crest?: string; plume?: string; brim?: boolean; rise?: number; spike?: boolean; cheeks?: boolean } = {},
): Group {
  const hy = D.headY
  const m = fb.metal(color)
  const k = (o.rise ?? 1) * 1.12
  const R = 0.2
  hairCap(fb, head, '#1a1511', -0.72, 0.186)
  const hc = fb.node('helm', head, [0, hy + 0.005, -0.005], [-0.62, 0, 0])
  fb.add(hc, fb.sphereCap(0.5), m, { s: [R, R * k, R], name: 'helmet' })
  fb.add(hc, fb.torusGeo(R, 0.014), fb.metal(o.trim ?? color), { r: [Math.PI / 2, 0, 0], shadow: false, name: 'rim' })
  fb.add(hc, fb.torusGeo(R * 0.9, 0.008), fb.metal(o.trim ?? color), { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], shadow: false })
  if (o.brim) fb.lathe(hc, [[R, 0.0], [R + 0.05, -0.012], [R + 0.055, -0.026], [R, -0.012]], m)
  if (o.spike) fb.cone(hc, fb.metal(o.trim ?? color), [0, R * k + 0.03, 0], [0.022, 0.07, 0.022])
  if (o.crest) fb.sph(hc, o.crest, [0, R * k + 0.005, 0], 0.03)
  if (o.plume) {
    fb.tube(hc, 'plume-short', [[0, 0, 0], [0, 0.07, -0.05], [0, 0.07, -0.13], [0, 0.0, -0.2]], 0.026, 0.006, o.plume, { p: [0, R * k - 0.01, 0] }, { flat: 0.5 })
  }
  if (o.cheeks) for (const sd of [-1, 1]) fb.box(hc, fb.metal(color), [sd * 0.188, -0.07, 0.0], [0.026, 0.11, 0.13], [0, 0, sd * -0.12])
  return hc
}

// ---------- shared wargear ----------
export function sword(fb: FB, parent: Object3D, o: { len?: number; wide?: number; blade?: string; guard?: string; grip?: string; tassel?: string; name?: string } = {}): Group {
  const len = o.len ?? 0.42
  const w = o.wide ?? 0.05
  const node = fb.node(o.name ?? 'sword', parent)
  const bm = fb.metal(o.blade ?? '#d7dce0')
  fb.extrude(
    node,
    `sword|${len}|${w}`,
    () =>
      shapeFrom((s) => {
        s.moveTo(-w * 0.5, 0)
        s.lineTo(-w * 0.5, len * 0.8)
        s.lineTo(0, len)
        s.lineTo(w * 0.5, len * 0.8)
        s.lineTo(w * 0.5, 0)
        s.closePath()
      }),
    0.012,
    bm,
    { p: [0, 0.03, 0], name: 'blade' },
    0.004,
  )
  fb.box(node, fb.mat('#3d2a1a'), [0, 0, 0], [0.026, 0.14, 0.026], undefined, { name: 'grip' })
  fb.box(node, fb.metal(o.guard ?? '#c9a24a'), [0, 0.04, 0], [w + 0.07, 0.022, 0.03])
  fb.sph(node, fb.metal(o.guard ?? '#c9a24a'), [0, -0.08, 0], 0.022)
  if (o.tassel) fb.tube(node, 'sword-tassel', [[0, 0, 0], [0, -0.04, 0.02], [0, -0.1, 0.01], [0, -0.16, 0.03]], 0.014, 0.006, o.tassel, { p: [0, -0.09, 0] })
  return node
}

/** Straight pole spear: grip at the origin, the head at the top. */
export function spear(
  fb: FB,
  parent: Object3D,
  o: { len?: number; below?: number; pole?: string; head?: string; tassel?: string; leaf?: boolean; name?: string } = {},
): Group {
  const len = o.len ?? 1.2
  const below = o.below ?? 0.28
  const node = fb.node(o.name ?? 'spear', parent)
  const total = len + below
  fb.cyl(node, o.pole ?? '#6b4a2a', [0, (len - below) / 2, 0], [0.014, total, 0.014], undefined, { name: 'pole' })
  fb.cone(node, fb.metal('#8a8a90'), [0, -below - 0.0, 0], [0.02, 0.04, 0.02], [Math.PI, 0, 0], { shadow: false })
  const hm = fb.metal(o.head ?? '#cfd4d8')
  if (o.leaf !== false) {
    fb.extrude(
      node,
      'spear-leaf',
      () => shapeFrom((s) => { s.moveTo(0, 0); s.bezierCurveTo(0.05, 0.03, 0.045, 0.12, 0, 0.26); s.bezierCurveTo(-0.045, 0.12, -0.05, 0.03, 0, 0) }),
      0.014,
      hm,
      { p: [0, len - 0.02, 0], name: 'spearhead' },
      0.004,
    )
  } else {
    fb.cone(node, hm, [0, len + 0.1, 0], [0.032, 0.22, 0.032])
  }
  fb.cyl(node, fb.metal('#b08a3a'), [0, len - 0.02, 0], [0.024, 0.035, 0.024])
  if (o.tassel) {
    const p0: V3 = [0, len - 0.04, 0.0]
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const sx = Math.cos(a) * 0.02
      const sz = Math.sin(a) * 0.02
      fb.tube(node, `tassel-${i}`, [[0, 0, 0], [sx * 0.8, -0.06, sz * 0.8], [sx * 1.6, -0.12, sz * 1.6 + 0.01], [sx * 2.0, -0.2, sz * 2 + 0.02]], 0.014, 0.004, o.tassel, { p: p0 })
    }
    fb.sph(node, o.tassel, [0, len - 0.04, 0], 0.03)
  }
  return node
}

/** Round shield held on the offhand arm. */
export function roundShield(fb: FB, parent: Object3D, o: { face: string; rim: string; boss?: string; size?: number } = { face: '#7a2f26', rim: '#2a2622' }): Group {
  const s = o.size ?? 0.17
  const node = fb.node('shield', parent, [0.0, 0.0, 0.07], [0, 0.0, 0])
  fb.cyl(node, o.face, [0, 0, 0], [s, 0.03, s], [Math.PI / 2, 0, 0], { name: 'shield-face' })
  fb.add(node, fb.torusGeo(s, 0.014), fb.metal(o.rim), { shadow: false })
  fb.sph(node, fb.metal(o.boss ?? '#b9a26a'), [0, 0, 0.022], [0.04, 0.04, 0.024])
  return node
}

export function bow(fb: FB, parent: Object3D, o: { wood?: string; len?: number } = {}): Group {
  const len = o.len ?? 0.7
  const node = fb.node('bow', parent)
  const r = len * 0.505
  // a shallow arc in the YZ plane bulging forward (+z), string behind it
  fb.add(node, fb.torusGeo(r, 0.014, Math.PI * 0.92), fb.mat(o.wood ?? '#5a3a1e'), { r: [0, -Math.PI / 2, -Math.PI * 0.46], p: [0, 0, -r], name: 'bow-limb' })
  fb.cyl(node, '#e9e0c8', [0, 0, -r * 0.88], [0.004, len * 0.99, 0.004], undefined, { shadow: false })
  return node
}

/** A short arrow (nocked in the right hand), pointing along +y of its node. */
export function arrow(fb: FB, parent: Object3D): Group {
  const node = fb.node('arrow', parent)
  fb.cyl(node, '#d9c590', [0, 0.18, 0], [0.006, 0.5, 0.006], undefined, { shadow: false })
  fb.cone(node, fb.metal('#cfd5da'), [0, 0.46, 0], [0.012, 0.04, 0.012], undefined, { shadow: false })
  fb.box(node, '#e9e0c8', [0, -0.02, 0], [0.03, 0.06, 0.004], undefined, { shadow: false })
  return node
}

export function quiver(fb: FB, torso: Object3D, o: { color?: string; fletch?: string } = {}): void {
  const node = fb.node('quiver', torso, [0.07, 0.1, -0.17], [0.0, 0, -0.35])
  fb.cyl(node, o.color ?? '#5a3a1e', [0, 0, 0], [0.045, 0.3, 0.045])
  for (let i = 0; i < 3; i++) fb.cyl(node, o.fletch ?? '#e9e0c8', [(i - 1) * 0.02, 0.18, 0.0], [0.006, 0.07, 0.006], undefined, { shadow: false })
}

