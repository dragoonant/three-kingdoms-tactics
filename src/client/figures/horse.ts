// The stubby MGSD war horse: a barrel body on short chunky legs with a big head, a mane and a tail.
// Joints follow rig.ts HORSE_JOINTS; legs pivot at the shoulders / hips so a gallop cycle works.
import type { Group, Shape } from 'three'
import { FB, G, shade, shapeFrom, type V3 } from './kit'
import type { HoofJoint, HorseJoint, HorseRig } from './rig'

export interface HorseOpts {
  body: string
  /** Lower legs, hooves and muzzle tip. */
  dark: string
  mane: string
  /** Lu Bu's red horse has a mane and tail of flame. */
  flame?: boolean
  cloth: string
  clothTrim: string
  saddle: string
  bridle: string
  /** White face stripe. */
  blaze?: boolean
}

export const HORSE_BODY_Y = 0.3
/** Pastern joint height above the sole of the hoof. */
export const HOOF_H = 0.047

const flameShape = (h: number, w: number): Shape =>
  shapeFrom((s) => {
    s.moveTo(-w / 2, 0)
    s.bezierCurveTo(-w * 0.7, h * 0.35, -w * 0.15, h * 0.55, -w * 0.05, h * 0.78)
    s.bezierCurveTo(w * 0.2, h * 0.65, w * 0.12, h * 0.9, w * 0.05, h)
    s.bezierCurveTo(w * 0.45, h * 0.65, w * 0.75, h * 0.35, w / 2, 0)
    s.closePath()
  })

export function makeHorse(fb: FB, parent: Group, o: HorseOpts): HorseRig {
  const horse = fb.node('horse', parent, [0, 0, 0])
  const bodyMat = fb.mat(o.body)
  const body = fb.node('body', horse, [0, HORSE_BODY_Y, 0])
  fb.capsule(body, bodyMat, [0, 0, 0], 0.16, 0.3, [Math.PI / 2, 0, 0], { s: [0.96, 1, 1], name: 'barrel' })
  fb.sph(body, bodyMat, [0, 0.0, 0.21], [0.16, 0.165, 0.14])
  fb.sph(body, bodyMat, [0, 0.01, -0.2], [0.16, 0.165, 0.14])
  // saddle blanket, saddle and girth
  fb.box(body, o.cloth, [0, 0.152, -0.01], [0.3, 0.025, 0.3])
  for (const sd of [-1, 1]) {
    fb.box(body, o.cloth, [sd * 0.148, 0.075, -0.01], [0.02, 0.15, 0.3], [0, 0, sd * -0.18])
    fb.box(body, o.clothTrim, [sd * 0.158, 0.0, -0.01], [0.022, 0.03, 0.3], [0, 0, sd * -0.18], { shadow: false })
  }
  fb.box(body, o.saddle, [0, 0.172, -0.07], [0.17, 0.03, 0.2])
  fb.box(body, o.saddle, [0, 0.195, -0.16], [0.17, 0.07, 0.03], [-0.25, 0, 0])
  fb.box(body, o.saddle, [0, 0.185, 0.02], [0.1, 0.05, 0.03], [0.25, 0, 0])

  // legs: stubby and chunky; pivot at the shoulder / hip
  const legs: Record<string, Group> = {}
  const hoofs: Record<string, Group> = {}
  const legDefs: [string, number, number, number][] = [
    ['legFL', -0.088, 0.2, -0.08],
    ['legFR', 0.088, 0.2, -0.08],
    ['legBL', -0.088, -0.2, -0.06],
    ['legBR', 0.088, -0.2, -0.06],
  ]
  for (const [name, x, z, y] of legDefs) {
    const leg = fb.node(name, body, [x, y, z])
    const drop = HORSE_BODY_Y + y
    fb.add(leg, G.frustum(0.062, 0.044), bodyMat, { p: [0, -(drop - 0.05) / 2, 0], s: [1, drop - 0.05, 1] })
    // the hoof hangs from a pastern joint 0.047 above the sole, so it can stay level while the leg swings
    const hoof = fb.node(name.replace('leg', 'hoof'), leg, [0, -drop + HOOF_H, 0])
    fb.cyl(hoof, o.dark, [0, 0.003, 0], [0.056, 0.055, 0.058])
    fb.cyl(hoof, shade(o.dark, -0.06), [0, -HOOF_H + 0.012, 0.004], [0.062, 0.026, 0.066], undefined, { shadow: false })
    legs[name] = leg
    hoofs[name.replace('leg', 'hoof')] = hoof
  }

  // neck and head
  const neck = fb.node('neck', body, [0, 0.08, 0.2], [0.78, 0, 0])
  fb.capsule(neck, bodyMat, [0, 0.13, 0], 0.085, 0.17, undefined, { s: [0.9, 1, 1.05] })
  const head = fb.node('head', neck, [0, 0.27, 0.0], [0.55, 0, 0])
  fb.sph(head, bodyMat, [0, 0.035, 0], [0.083, 0.1, 0.085], { name: 'horse-skull' })
  fb.capsule(head, bodyMat, [0, 0.14, 0.012], 0.056, 0.09, [0.1, 0, 0], { name: 'muzzle' })
  fb.sph(head, o.dark, [0, 0.235, 0.018], [0.052, 0.03, 0.047], { name: 'muzzle-tip' })
  for (const sd of [-1, 1]) {
    fb.sph(head, '#17110d', [sd * 0.071, 0.05, -0.01], 0.016, { shadow: false })
    fb.sph(head, '#e9e0c8', [sd * 0.074, 0.056, -0.005], 0.006, { shadow: false })
    fb.cone(head, bodyMat, [sd * 0.045, -0.035, -0.06], [0.026, 0.085, 0.026], [-1.25, 0, sd * 0.2])
    fb.sph(head, '#110d0b', [sd * 0.02, 0.252, 0.04], 0.01, { shadow: false })
  }
  if (o.blaze) fb.box(head, '#f6f2ea', [0, 0.12, -0.044], [0.03, 0.17, 0.012], [0.02, 0, 0], { shadow: false })
  fb.add(head, fb.torusGeo(0.058, 0.008), o.bridle, { p: [0, 0.16, 0.012], r: [Math.PI / 2 + 0.1, 0, 0], shadow: false })
  fb.add(head, fb.torusGeo(0.07, 0.007), o.bridle, { p: [0, 0.07, 0.0], r: [Math.PI / 2 + 0.1, 0, 0], shadow: false })
  fb.sph(head, '#d6b04a', [0, 0.115, -0.05], 0.014, { shadow: false })

  // mane along the crest (local -z of the neck)
  const maneMat = fb.mat(o.mane)
  if (o.flame) {
    const cols = ['#d6281c', '#ff7a1a', '#ffc233', '#ff7a1a', '#d6281c', '#ffb02e', '#ff6a14']
    for (let i = 0; i < 7; i++) {
      const c = cols[i]!
      fb.extrude(
        neck,
        `flame|${i % 3}`,
        () => flameShape(0.15 + (i % 3) * 0.02, 0.07),
        0.016,
        fb.mat(c, { emissive: c, ei: 0.35 }),
        { p: [0, 0.01 + i * 0.033, -0.075], r: [-1.05 - i * 0.04, Math.PI / 2, 0], name: 'flame' },
        0.003,
      )
    }
    fb.extrude(head, 'flame|fore', () => flameShape(0.12, 0.06), 0.014, fb.mat('#ffb02e', { emissive: '#ffb02e', ei: 0.35 }), { p: [0, -0.02, -0.07], r: [-1.2, Math.PI / 2, 0] }, 0.003)
  } else {
    for (let i = 0; i < 7; i++) fb.sph(neck, maneMat, [0, 0.011 + i * 0.034, -0.082], [0.02, 0.034, 0.045], { r: [-0.5, 0, 0] })
    fb.sph(head, maneMat, [0, -0.02, -0.066], [0.03, 0.04, 0.03])
    fb.cone(head, maneMat, [0, 0.0, -0.085], [0.024, 0.07, 0.024], [-1.0, 0, 0])
  }

  // tail
  const tail = fb.node('tail', body, [0, 0.07, -0.285], [0.35, 0, 0])
  const tailPts: V3[] = [[0, 0, 0], [0, -0.1, -0.05], [0, -0.22, -0.05], [0, -0.33, -0.01]]
  fb.tube(tail, 'horse-tail', tailPts, 0.055, 0.012, maneMat, {}, { flat: 0.8 })
  if (o.flame) {
    const cols = ['#ff7a1a', '#ffc233', '#d6281c']
    for (let i = 0; i < 3; i++) {
      const c = cols[i]!
      fb.extrude(tail, `flame|tail${i}`, () => flameShape(0.16, 0.07), 0.016, fb.mat(c, { emissive: c, ei: 0.35 }), { p: [0, -0.16 - i * 0.05, -0.04], r: [3.0 - i * 0.2, Math.PI / 2, 0] }, 0.003)
    }
  }

  const joints = {
    body, neck, head, tail,
    legFL: legs.legFL!, legFR: legs.legFR!, legBL: legs.legBL!, legBR: legs.legBR!,
    hoofFL: hoofs.hoofFL!, hoofFR: hoofs.hoofFR!, hoofBL: hoofs.hoofBL!, hoofBR: hoofs.hoofBR!,
  } as Record<HorseJoint | HoofJoint, Group>
  return { group: horse, joints, saddleY: HORSE_BODY_Y + 0.18 }
}

// ---------- presets and a bare horse for the lab ----------
export const HORSE_PRESETS: Record<string, HorseOpts> = {
  chestnut: { body: '#8a4a28', dark: '#2a1a12', mane: '#24150e', cloth: '#2e7d4f', clothTrim: '#d9a93c', saddle: '#4a2a1a', bridle: '#c8372d' },
  white: { body: '#f3f1ea', dark: '#cfcac0', mane: '#dedcd6', cloth: '#f4f4f6', clothTrim: '#3d6fb3', saddle: '#7a5a3a', bridle: '#3d6fb3' },
  red: { body: '#b02a20', dark: '#3a1410', mane: '#ff7a1a', flame: true, cloth: '#17141a', clothTrim: '#d9a63a', saddle: '#d9a63a', bridle: '#d9a63a' },
  black: { body: '#1d1b20', dark: '#0f0e12', mane: '#0f0e12', cloth: '#3a2260', clothTrim: '#d4a73e', saddle: '#2a1a14', bridle: '#d4a73e' },
  bay: { body: '#6e4a30', dark: '#2a1c14', mane: '#2a1c14', cloth: '#7a5a3a', clothTrim: '#c9b27c', saddle: '#4a2a1a', bridle: '#8a6a3a' },
}

export function buildBareHorse(preset: string): { group: Group; dispose(): void } {
  const fb = new FB()
  const horse = makeHorse(fb, fb.group, HORSE_PRESETS[preset] ?? HORSE_PRESETS.bay!)
  horse.group.position.z = -0.1
  return { group: fb.group, dispose: () => fb.dispose() }
}
