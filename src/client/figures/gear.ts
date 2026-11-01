// Signature wargear and cloth: capes, crescent glaive, serpent spear, twin-crescent halberd, feather fan,
// pheasant feathers, beards. Built from extruded shapes and tapered tubes (docs/spec/31-hero-figures.md).
import { CylinderGeometry, type Group, type Object3D } from 'three'
import { makeHorse, type HorseOpts } from './horse'
import { geo, shade, shapeFrom, type FB, type V3 } from './kit'
import { D, sword, type Humanoid } from './parts'
import type { HorseRig } from './rig'

// ---------- mounting ----------
export const MOUNT_SHIFT_Z = -0.14

/** Builds the horse under a rider and seats the rider on it: rider.root becomes a child of the horse body at the saddle. */
export function mountRider(fb: FB, h: Humanoid, horse: HorseOpts): HorseRig {
  const rig = makeHorse(fb, h.group, horse)
  rig.group.position.z = MOUNT_SHIFT_Z
  const body = rig.joints.body
  h.root.removeFromParent()
  body.add(h.root)
  h.root.position.set(0, rig.saddleY - 0.07 - body.position.y, -0.07)
  h.legL.rotation.set(-0.3, 0, -0.62)
  h.legR.rotation.set(-0.3, 0, 0.62)
  return rig
}

// ---------- cloth ----------
/** A cloak hanging from the shoulders: outer shell plus a contrasting lining, both open cylinders behind the figure. */
export function addCape(fb: FB, torso: Object3D, o: { outer: string; lining: string; len?: number; spread?: number; trim?: string }): Group {
  const len = o.len ?? 0.46
  const node = fb.node('cape', torso, [0, 0.185, 0], [0.1, 0, 0])
  const spread = o.spread ?? 0.1
  const shell = (rt: number, rb: number, key: string): CylinderGeometry =>
    geo(`capeshell|${key}|${len}`, () => new CylinderGeometry(rt, rb, len, 24, 1, true, Math.PI - 1.2, 2.4))
  fb.add(node, shell(0.175, 0.175 + spread + 0.07, 'out'), fb.cloth(o.outer), { p: [0, -len / 2, 0], name: 'cape-outer' })
  fb.add(node, shell(0.165, 0.165 + spread + 0.06, 'in'), fb.cloth(o.lining), { p: [0, -len / 2, 0.004], name: 'cape-lining' })
  if (o.trim) {
    fb.add(node, geo(`capetrim|${len}`, () => new CylinderGeometry(0.175 + spread + 0.072, 0.175 + spread + 0.07, 0.02, 24, 1, true, Math.PI - 1.2, 2.4)), fb.cloth(o.trim), { p: [0, -len + 0.01, 0] })
  }
  // collar clasp
  fb.sph(node, fb.metal('#d4a437'), [0, 0.0, 0.14], 0.022, { shadow: false })
  return node
}

// ---------- beards ----------
/** Guan Yu's long beard: two flowing layers hanging from the chin to the belt. Joint `beard` pivots at the chin. */
export function longBeard(fb: FB, head: Object3D, color: string): Group {
  const node = fb.node('beard', head, [0, -0.02, 0.095], [-0.18, 0, 0])
  const make = (w: number, l: number) =>
    shapeFrom((s) => {
      s.moveTo(-w * 0.55, 0.01)
      s.bezierCurveTo(-w * 0.75, -l * 0.35, -w * 0.5, -l * 0.8, -w * 0.12, -l)
      s.quadraticCurveTo(0, -l * 1.06, w * 0.12, -l)
      s.bezierCurveTo(w * 0.5, -l * 0.8, w * 0.75, -l * 0.35, w * 0.55, 0.01)
      s.quadraticCurveTo(0, 0.05, -w * 0.55, 0.01)
    })
  // five tapered strands hanging straight from the chin and cheeks over the chest to the belt, curving slightly forward
  const matte = fb.mat(color, { rough: 0.95, metal: 0 })
  fb.sph(node, matte, [0, 0.0, 0.03], [0.105, 0.05, 0.06], { name: 'beard-jaw' })
  // a narrow tapered core so it reads as one flowing mass, split into strands at the tip
  fb.extrude(
    node,
    'beard-core',
    () => shapeFrom((s) => { s.moveTo(-0.055, 0.0); s.bezierCurveTo(-0.07, -0.08, -0.05, -0.18, -0.02, -0.25); s.lineTo(0, -0.2); s.lineTo(0.02, -0.25); s.bezierCurveTo(0.05, -0.18, 0.07, -0.08, 0.055, 0.0); s.closePath() }),
    0.05,
    matte,
    { p: [0, 0, 0.075], r: [-0.1, 0, 0], name: 'beard-core' },
    0.012,
  )
  const strands: [number, number][] = [[-0.05, 0.2], [-0.025, 0.25], [0.0, 0.27], [0.025, 0.25], [0.05, 0.2]]
  strands.forEach(([x, l], i) => {
    fb.tube(
      node,
      `beard-strand2|${i}`,
      [[x, 0.0, 0.03], [x * 1.15, -l * 0.35, 0.085], [x * 0.9, -l * 0.7, 0.115], [x * 0.55, -l, 0.14]],
      0.034,
      0.004,
      matte,
      { name: 'beard-strand' },
      { segs: 14, radial: 7 },
    )
  })
  // moustache sweeping out from the lip
  for (const sd of [-1, 1]) {
    fb.tube(node, 'moustache-long', [[0, 0, 0], [sd * 0.04, -0.012, 0.0], [sd * 0.09, -0.03, -0.01], [sd * 0.13, -0.085, -0.03]], 0.02, 0.004, color, { p: [0, 0.055, 0.075] })
  }
  return node
}

/** Zhang Fei's whiskers: bristling spikes fanned out round the jaw like a tiger's ruff. */
export function tigerWhiskers(fb: FB, head: Object3D, color: string): void {
  const m = fb.mat(color, { rough: 0.6 })
  const hy = D.headY
  const fan = [-60, -35, -12, 12, 36, 62]
  for (const sd of [-1, 1]) {
    fan.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180
      const len = 0.17 + ((i + 1) % 2) * 0.055
      // node at the cheek; +y of the node points along the spike, rotated about z so the spike leans outward
      const n = fb.node('whisker', head, [sd * 0.115, hy - 0.075 - Math.sin(a) * 0.0, 0.085], [0, -sd * 0.28, sd * -(Math.PI / 2 - a * 0.9)])
      fb.cone(n, m, [0, len / 2, 0], [0.03, len, 0.022])
    })
  }
  // moustache bristles over the lip and a bushy chin tuft
  for (const sd of [-1, 1]) {
    const n = fb.node('stache', head, [sd * 0.03, hy - 0.055, 0.15], [0.1, sd * 0.2, sd * -1.35])
    fb.cone(n, m, [0, 0.07, 0], [0.026, 0.14, 0.02])
  }
  fb.sph(head, m, [0, hy - 0.15, 0.105], [0.09, 0.07, 0.06])
  fb.cone(head, m, [0, hy - 0.215, 0.11], [0.05, 0.09, 0.04], [Math.PI, 0, 0])
}

// ---------- weapons ----------
export function glaive(fb: FB, parent: Object3D, len = 1.0): Group {
  const node = fb.node('glaive', parent)
  const wood = '#2f4a32'
  fb.cyl(node, wood, [0, (len - 0.3) / 2, 0], [0.017, len + 0.3, 0.017], undefined, { name: 'pole' })
  // butt cap and bronze rings
  fb.sph(node, fb.metal('#b08a3a'), [0, -0.3, 0], [0.026, 0.034, 0.026])
  for (const y of [0.25, 0.6]) fb.cyl(node, fb.metal('#b08a3a'), [0, y, 0], [0.022, 0.03, 0.022])
  // red cord tassel under the blade
  fb.tube(node, 'glaive-tassel', [[0, 0, 0], [0.02, -0.08, 0.03], [0.04, -0.17, 0.04], [0.045, -0.26, 0.05]], 0.03, 0.012, '#c8372d', { p: [0.0, len - 0.06, 0.02] })
  // dragon-head socket
  const gold = fb.metal('#cfa43f')
  fb.cyl(node, gold, [0, len - 0.0, 0], [0.034, 0.1, 0.034])
  fb.sph(node, gold, [0, len + 0.07, 0.015], [0.04, 0.045, 0.05])
  fb.cone(node, gold, [0, len + 0.075, 0.07], [0.028, 0.07, 0.03], [Math.PI / 2 + 0.2, 0, 0])
  for (const sd of [-1, 1]) fb.cone(node, gold, [sd * 0.026, len + 0.115, -0.01], [0.01, 0.06, 0.01], [-0.5, 0, sd * -0.5])
  // the blade: a wide curved cleaver edge on the +x side, serrated hooks on the back
  fb.extrude(
    node,
    'glaive-blade',
    () =>
      shapeFrom((s) => {
        s.moveTo(0.0, 0.0)
        s.bezierCurveTo(0.2, -0.04, 0.38, 0.12, 0.33, 0.3)
        s.bezierCurveTo(0.3, 0.42, 0.16, 0.5, 0.03, 0.6)
        s.lineTo(0.0, 0.64)
        s.lineTo(-0.01, 0.55)
        s.lineTo(-0.06, 0.52)
        s.lineTo(-0.01, 0.46)
        s.lineTo(-0.07, 0.4)
        s.lineTo(-0.01, 0.34)
        s.lineTo(-0.06, 0.27)
        s.lineTo(-0.01, 0.22)
        s.lineTo(-0.04, 0.12)
        s.lineTo(-0.0, 0.06)
        s.closePath()
      }),
    0.016,
    fb.metal('#7690a8', true),
    { p: [0, len + 0.04, 0], name: 'glaive-blade' },
    0.005,
  )
  // green jade-coloured inlay stripe on the blade
  fb.extrude(
    node,
    'glaive-inlay',
    () =>
      shapeFrom((s) => {
        s.moveTo(0.04, 0.1)
        s.bezierCurveTo(0.16, 0.06, 0.28, 0.16, 0.26, 0.3)
        s.bezierCurveTo(0.24, 0.38, 0.14, 0.44, 0.06, 0.5)
        s.bezierCurveTo(0.1, 0.38, 0.1, 0.25, 0.04, 0.1)
      }),
    0.02,
    '#2f8f5a',
    { p: [0, len + 0.04, 0] },
    0.002,
  )
  fb.cone(node, gold, [0, len + 0.7, 0], [0.018, 0.1, 0.018])
  return node
}

/** Wavy snake blade (Zhang Fei's serpent spear). */
export function serpentSpear(fb: FB, parent: Object3D, len = 1.1, tassel = '#d3241b'): Group {
  const node = fb.node('serpent-spear', parent)
  fb.cyl(node, '#241a2a', [0, (len - 0.28) / 2, 0], [0.016, len + 0.28, 0.016], undefined, { name: 'pole' })
  fb.sph(node, fb.metal('#8d8d96'), [0, -0.28, 0], [0.024, 0.03, 0.024])
  for (const y of [0.3, 0.7]) fb.cyl(node, fb.metal('#8d8d96'), [0, y, 0], [0.021, 0.03, 0.021])
  fb.cyl(node, fb.metal('#8d8d96'), [0, len, 0], [0.026, 0.07, 0.026])
  const bladeLen = 0.5
  fb.extrude(
    node,
    'serpent-blade',
    () =>
      shapeFrom((s) => {
        const N = 28
        const waves = 3.2
        const amp = 0.065
        const wAt = (t: number): number => 0.058 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 0.016 * (1 - t)
        const cx = (t: number): number => amp * Math.sin(t * waves * Math.PI * 2) * (0.35 + 0.65 * t)
        s.moveTo(cx(0) - wAt(0), 0)
        for (let i = 1; i <= N; i++) {
          const t = i / N
          s.lineTo(cx(t) + wAt(t), t * bladeLen)
        }
        for (let i = N; i >= 0; i--) {
          const t = i / N
          s.lineTo(cx(t) - wAt(t), t * bladeLen)
        }
      }),
    0.016,
    fb.metal('#8fa0bc', true),
    { p: [0, len + 0.03, 0], name: 'serpent-blade' },
    0.004,
  )
  // a snake-head socket and a red tassel
  fb.sph(node, fb.metal('#8d8d96'), [0, len + 0.05, 0.02], [0.034, 0.04, 0.05])
  fb.tube(node, 'serpent-tassel', [[0, 0, 0], [0.01, -0.07, 0.03], [0.02, -0.17, 0.03], [0.035, -0.29, 0.045]], 0.04, 0.014, tassel, { p: [0, len - 0.02, 0.02] })
  return node
}

function crescentShape(): ReturnType<typeof shapeFrom> {
  return shapeFrom((s) => {
    // a crescent rising from the pole, tip upward, opening upward and outward on +x
    s.moveTo(0.0, 0.0)
    s.bezierCurveTo(0.14, -0.05, 0.3, 0.02, 0.32, 0.22)
    s.bezierCurveTo(0.33, 0.28, 0.32, 0.34, 0.3, 0.38)
    s.bezierCurveTo(0.27, 0.26, 0.19, 0.14, 0.0, 0.1)
    s.closePath()
  })
}

/** Lu Bu's halberd: a spear blade with a crescent blade curling up on each side of the head. */
export function twinCrescentHalberd(fb: FB, parent: Object3D, len = 1.1): Group {
  const node = fb.node('halberd', parent)
  fb.cyl(node, '#3a1a14', [0, (len - 0.3) / 2, 0], [0.017, len + 0.3, 0.017], undefined, { name: 'pole' })
  const gold = fb.metal('#d9a63a')
  fb.sph(node, gold, [0, -0.3, 0], [0.026, 0.034, 0.026])
  for (const y of [0.2, 0.55]) fb.cyl(node, gold, [0, y, 0], [0.023, 0.03, 0.023])
  fb.cyl(node, gold, [0, len, 0], [0.03, 0.08, 0.03])
  const steel = fb.metal('#93a8bd', true)
  fb.extrude(
    node,
    'halberd-spear',
    () => shapeFrom((s) => { s.moveTo(-0.035, 0); s.bezierCurveTo(-0.05, 0.12, -0.04, 0.3, 0, 0.5); s.bezierCurveTo(0.04, 0.3, 0.05, 0.12, 0.035, 0) }),
    0.016,
    steel,
    { p: [0, len + 0.02, 0], name: 'halberd-spear' },
    0.004,
  )
  for (const sd of [-1, 1]) {
    fb.extrude(node, 'halberd-crescent', crescentShape, 0.016, steel, { p: [0, len - 0.04, 0], s: [sd, 1, 1], name: 'halberd-crescent' }, 0.004)
  }
  // red pennon ribbons under the head
  fb.tube(node, 'halberd-ribbon', [[0, 0, 0], [0.02, -0.08, 0.04], [0.05, -0.18, 0.06], [0.04, -0.3, 0.09]], 0.03, 0.012, '#c8372d', { p: [0, len - 0.06, 0.02] }, { flat: 0.4 })
  return node
}

/** Crane-feather fan: a handle with a half-circle of long white feathers, dark at the tips. */
export function featherFan(fb: FB, parent: Object3D): Group {
  const node = fb.node('fan', parent)
  fb.cyl(node, '#5a3a1e', [0, -0.02, 0], [0.012, 0.22, 0.012])
  fb.sph(node, fb.metal('#c9a24a'), [0, 0.1, 0], 0.024)
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / ((n - 1) / 2)) * 1.12
    const len = 0.4 - Math.abs(a) * 0.04
    const holder = fb.node('feather', node, [0, 0.1, 0.0], [0, 0, -a])
    fb.extrude(
      holder,
      `feather|${len.toFixed(2)}`,
      () =>
        shapeFrom((s) => {
          s.moveTo(0, 0)
          s.bezierCurveTo(0.06, 0.05, 0.075, len * 0.6, 0.02, len)
          s.bezierCurveTo(0.01, len * 1.04, -0.01, len * 1.04, -0.02, len)
          s.bezierCurveTo(-0.075, len * 0.6, -0.06, 0.05, 0, 0)
        }),
      0.008,
      fb.cloth('#f4f1e8'),
      { p: [0, 0.0, i * 0.0006], name: 'feather' },
      0.002,
    )
    fb.extrude(
      holder,
      `feathertip|${len.toFixed(2)}`,
      () =>
        shapeFrom((s) => {
          s.moveTo(-0.045, len * 0.8)
          s.bezierCurveTo(-0.03, len * 0.9, 0.0, len * 1.0, 0.0, len * 1.04)
          s.bezierCurveTo(0.0, len * 1.0, 0.03, len * 0.9, 0.045, len * 0.8)
          s.bezierCurveTo(0.02, len * 0.84, -0.02, len * 0.84, -0.045, len * 0.8)
        }),
      0.01,
      '#1c1c22',
      { p: [0, 0.0, i * 0.0006 + 0.001] },
      0.001,
    )
  }
  return node
}

/** A long arching pheasant tail feather, barred cream and dark. Returned node is placed at the headpiece. */
export function pheasantFeather(fb: FB, parent: Object3D, side: number, o: { rise: number; back: number; sweep: number }): Group {
  const node = fb.node('feather', parent, [side * 0.06, 0, -0.07], [0, 0, 0])
  const pts: V3[] = [
    [0, 0, 0],
    [side * 0.02, o.rise * 0.42, -o.back * 0.08],
    [side * (0.04 + o.sweep * 0.5), o.rise * 0.82, -o.back * 0.38],
    [side * (0.06 + o.sweep), o.rise * 0.98, -o.back * 0.82],
    [side * (0.08 + o.sweep * 1.3), o.rise * 0.9, -o.back * 1.15],
  ]
  fb.tube(node, `pheasant|${side}|${o.rise}|${o.back}|${o.sweep}`, pts, 0.034, 0.004, 'x', {}, { segs: 36, radial: 6, thin: 0.32, bars: ['#f0e2b4', '#3a2418', 13] })
  // quill glow at the base
  fb.sph(node, fb.metal('#d9a63a'), [0, -0.005, 0], 0.03)
  return node
}

// ---------- common weapons for officers and troops ----------
/** Spear with one crescent blade at the head (a ji). */
export function jiHalberd(fb: FB, parent: Object3D, len = 1.1, tassel = '#c8372d'): Group {
  const node = fb.node('ji', parent)
  fb.cyl(node, '#4a2c1a', [0, (len - 0.28) / 2, 0], [0.016, len + 0.28, 0.016], undefined, { name: 'pole' })
  const steel = fb.metal('#93a8bd', true)
  fb.cyl(node, fb.metal('#8d8d96'), [0, len, 0], [0.026, 0.06, 0.026])
  fb.extrude(node, 'ji-spear', () => shapeFrom((s) => { s.moveTo(-0.03, 0); s.bezierCurveTo(-0.045, 0.1, -0.035, 0.24, 0, 0.4); s.bezierCurveTo(0.035, 0.24, 0.045, 0.1, 0.03, 0) }), 0.014, steel, { p: [0, len + 0.02, 0] }, 0.004)
  fb.extrude(node, 'halberd-crescent', crescentShape, 0.014, steel, { p: [0, len - 0.04, 0], s: [1, 1, 1] }, 0.004)
  fb.tube(node, 'ji-tassel', [[0, 0, 0], [0.02, -0.08, 0.03], [0.04, -0.17, 0.04]], 0.026, 0.01, tassel, { p: [0, len - 0.05, 0.02] })
  return node
}

export function battleAxe(fb: FB, parent: Object3D, len = 0.8, flip = 1): Group {
  const node = fb.node('axe', parent)
  fb.cyl(node, '#4a2c1a', [0, (len - 0.25) / 2, 0], [0.018, len + 0.25, 0.018], undefined, { name: 'pole' })
  fb.extrude(
    node,
    'axe-head',
    () => shapeFrom((s) => { s.moveTo(0, 0); s.bezierCurveTo(0.14, -0.06, 0.26, 0.0, 0.25, 0.14); s.bezierCurveTo(0.24, 0.26, 0.14, 0.34, 0, 0.3); s.lineTo(0, 0) }),
    0.02,
    fb.metal('#b9c0c6', true),
    { p: [0, len - 0.15, 0], s: [flip, 1, 1], name: 'axe-head' },
    0.005,
  )
  fb.cone(node, fb.metal('#b9c0c6'), [0, len + 0.18, 0], [0.018, 0.1, 0.018])
  return node
}

export function warClub(fb: FB, parent: Object3D, len = 0.9): Group {
  const node = fb.node('club', parent)
  fb.cyl(node, '#3a2616', [0, 0.1, 0], [0.02, 0.5, 0.02])
  fb.add(node, fb.frustumGeo(0.07, 0.025), '#4a3020', { p: [0, len * 0.65, 0], s: [1, len * 0.7, 1], name: 'club-head' })
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const y = len * 0.45 + (i % 3) * len * 0.15
    fb.cone(node, fb.metal('#8d8d96'), [Math.cos(a) * 0.06, y, Math.sin(a) * 0.06], [0.014, 0.05, 0.014], [Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4], { shadow: false })
  }
  return node
}

export function farmFork(fb: FB, parent: Object3D, len = 1.0): Group {
  const node = fb.node('fork', parent)
  fb.cyl(node, '#7a5a34', [0, (len - 0.25) / 2, 0], [0.016, len + 0.25, 0.016], undefined, { name: 'pole' })
  fb.box(node, fb.metal('#8a8a8a'), [0, len, 0], [0.12, 0.022, 0.022])
  for (const x of [-0.05, 0, 0.05]) fb.cone(node, fb.metal('#8a8a8a'), [x, len + 0.1, 0], [0.012, 0.18, 0.012])
  return node
}

export function walkingStaff(fb: FB, parent: Object3D, len = 0.9): Group {
  const node = fb.node('staff', parent)
  fb.cyl(node, '#6b4a2a', [0, (len - 0.3) / 2, 0], [0.016, len + 0.3, 0.016], undefined, { name: 'pole' })
  fb.add(node, fb.torusGeo(0.05, 0.014, Math.PI * 1.5), '#6b4a2a', { p: [0.0, len + 0.04, 0], r: [0, 0, 0.6] })
  return node
}

export function bambooScroll(fb: FB, parent: Object3D): Group {
  const node = fb.node('scroll', parent)
  fb.cyl(node, '#d9c590', [0, 0, 0], [0.04, 0.26, 0.04], [0, 0, Math.PI / 2])
  fb.cyl(node, '#8a3a2a', [0.115, 0, 0], [0.046, 0.03, 0.046], [0, 0, Math.PI / 2])
  fb.cyl(node, '#8a3a2a', [-0.115, 0, 0], [0.046, 0.03, 0.046], [0, 0, Math.PI / 2])
  return node
}

/** Taoist talisman sword: peach-wood blade with yellow paper charms (plain red strokes, no lettering). */
export function talismanSword(fb: FB, parent: Object3D): Group {
  const node = sword(fb, parent, { len: 0.52, wide: 0.05, blade: '#b0543a', guard: '#d4a72c', tassel: '#d4a72c', name: 'talisman-sword' })
  for (let i = 0; i < 3; i++) {
    fb.box(node, '#e8cf4a', [0.045 + (i % 2) * 0.01, 0.22 + i * 0.1, 0.0], [0.05, 0.085, 0.006], [0, 0, 0.1 * (i - 1)], { shadow: false })
    fb.box(node, '#b3261e', [0.045 + (i % 2) * 0.01, 0.22 + i * 0.1, 0.005], [0.012, 0.06, 0.004], [0, 0, 0.1 * (i - 1)], { shadow: false })
  }
  return node
}
