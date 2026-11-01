// The seven unique hero rigs (docs/spec/31-hero-figures.md identity table). Each follows its clause literally.
// Everything is procedural three.js: LatheGeometry for robes and helmets, ExtrudeGeometry for blades / crescents /
// fans / beards, TubeGeometry for feathers and tassels, capsules and spheres for limbs and heads.
import { Group } from 'three'
import { FB, shapeFrom } from './kit'
import { addCape, featherFan, glaive, longBeard, mountRider, pheasantFeather, serpentSpear, tigerWhiskers, twinCrescentHalberd } from './gear'
import { D, addFace, finishRig, hairCap, helmet, makeHumanoid, scarf, spear, sword } from './parts'
import type { Rig } from './rig'

export const HERO_IDS = ['liu-bei', 'guan-yu', 'zhang-fei', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'cao-cao'] as const
export type HeroId = (typeof HERO_IDS)[number]

export interface HeroBuildOpts {
  /** Heroes with a mount are built on it unless this is false. Ignored for heroes that never ride. */
  mounted?: boolean
  /** Give the rig its own materials (the board tints them per unit). */
  own?: boolean
}

/**
 * Body scale of the three brothers (the novel: Guan Yu 9 chi, Zhang Fei 8, Liu Bei 7.5; owner note 2026-11-01): Guan Yu is the
 * tallest at 1.15x Liu Bei, Zhang Fei 1.07x and broader. The whole body (and the horse) is scaled, not just the weapon.
 */
export const HERO_SCALE: Record<string, number> = { 'liu-bei': 1, 'guan-yu': 1.15, 'zhang-fei': 1.07 }

/** Wraps everything under the rig's group in a scaled child, so the joints and the clips keep working in unscaled units. */
function scaleBody(rig: Rig, k: number): Rig {
  if (k === 1) return rig
  const inner = new Group()
  inner.name = 'body'
  for (const c of [...rig.group.children]) inner.add(c)
  inner.scale.setScalar(k)
  rig.group.add(inner)
  rig.height *= k
  if (rig.footprint !== undefined) rig.footprint *= k
  rig.bodyScale = k
  return rig
}

/** Heroes that ride in the identity table. */
export const HERO_RIDES: Record<string, boolean> = { 'guan-yu': true, 'zhao-yun': true, 'lu-bu': true, 'cao-cao': true }

const GOLD = '#d9a93c'
const HY = D.headY

// ---------- Liu Bei ----------
function liuBei(fb: FB, _mounted: boolean): Rig {
  const jade = '#2f9a74'
  const h = makeHumanoid(fb, {
    skin: '#f0c9a2', armour: jade, trim: GOLD, sleeve: '#efe5c8', boots: '#4a3524', belt: GOLD, buckle: '#f0cf6a',
    skirt: 'robe', skirtColor: '#278a66', skirtTrim: GOLD, armLen: 0.31, handRadius: 0.078,
    pauldron: { color: '#e9dfc0', style: 'round' }, mirrors: true, collar: true,
  })
  // light lamellar breast band under the robe
  fb.lathe(h.torso, [[0.158, 0.1], [0.172, 0.1], [0.172, 0.15], [0.158, 0.15]], '#eadfbf')
  fb.box(h.torso, '#eadfbf', [0, 0.02, 0.155], [0.1, 0.07, 0.014])
  // cream sleeve cuffs with gold edge
  for (const arm of [h.armL, h.armR]) fb.lathe(arm, [[0.055, -0.27], [0.07, -0.27], [0.07, -0.25], [0.055, -0.25]], GOLD)
  const hair = '#17120f'
  hairCap(fb, h.head, hair, -0.72, 0.19)
  fb.sph(h.head, hair, [0, HY + 0.215, -0.03], [0.058, 0.07, 0.058], { name: 'topknot' })
  fb.cyl(h.head, fb.metal(GOLD), [0, HY + 0.178, -0.03], [0.056, 0.032, 0.056])
  fb.cyl(h.head, fb.metal(GOLD), [0, HY + 0.215, -0.03], [0.009, 0.2, 0.009], [0, 0, Math.PI / 2], { name: 'gold-pin' })
  for (const sd of [-1, 1]) fb.sph(h.head, fb.metal('#f0cf6a'), [sd * 0.1, HY + 0.215, -0.03], 0.016)
  addFace(fb, h.head, '#f0c9a2', {
    eyes: 'kind', brow: { thick: 0.014, angle: -0.08, arch: 1, len: 0.07 }, mouth: 'smile', cheeks: '#e9a58c',
  })
  // very large earlobes
  for (const sd of [-1, 1]) {
    fb.sph(h.head, '#f0c9a2', [sd * 0.188, HY + 0.0, -0.01], [0.05, 0.085, 0.05], { name: 'ear-big' })
    fb.capsule(h.head, '#e8bd94', [sd * 0.2, HY - 0.105, 0.0], 0.034, 0.06, undefined, { name: 'earlobe' })
  }
  // small moustache
  for (const sd of [-1, 1]) fb.tube(h.head, 'lb-stache', [[0, 0, 0], [sd * 0.025, -0.01, 0.0], [sd * 0.05, -0.028, -0.004]], 0.012, 0.004, hair, { p: [sd * 0.008, HY - 0.045, 0.168] })
  // twin swords, one per hand: short and broad
  sword(fb, h.weapon, { len: 0.46, wide: 0.07, guard: GOLD, name: 'sword-R' })
  sword(fb, h.offhand, { len: 0.46, wide: 0.07, guard: GOLD, name: 'sword-L' })
  h.weapon.rotation.set(0.9, 0, -0.45)
  h.offhand.rotation.set(0.9, 0, 0.45)
  h.armR.rotation.set(-0.5, 0, 0.35)
  h.armL.rotation.set(-0.5, 0, -0.35)
  return finishRig(h, 'hero')
}

// ---------- Guan Yu ----------
function guanYu(fb: FB, mounted: boolean): Rig {
  const red = '#b0231c'
  const green = '#2e7d4f'
  const h = makeHumanoid(fb, {
    skin: red, armour: '#2f7f52', trim: GOLD, sleeve: '#26262e', boots: '#1d1a17', belt: GOLD, buckle: '#f0cf6a',
    skirt: 'robe', skirtColor: green, skirtTrim: GOLD, pauldron: { color: '#2a2a32', style: 'round' }, mirrors: false, collar: true,
    sleeveStyle: 'tight', stout: 1.03, ring: mounted ? 0.44 : undefined,
  })
  // dark armour breastplate with gold edge showing over the robe
  fb.lathe(h.torso, [[0.158, 0.075], [0.176, 0.075], [0.176, 0.17], [0.15, 0.185], [0.158, 0.17]], '#2a2a32')
  fb.lathe(h.torso, [[0.176, 0.07], [0.18, 0.07], [0.18, 0.082], [0.176, 0.082]], GOLD)
  for (const sd of [-1, 1]) fb.cyl(h.torso, fb.metal(GOLD), [sd * 0.058, 0.125, 0.172], [0.04, 0.016, 0.04], [Math.PI / 2 - 0.1, 0, 0])
  // green robe side panels over the armour skirt
  scarf(fb, h.head, green, { band: GOLD, high: 1.05 })
  addFace(fb, h.head, red, {
    eyes: 'phoenix', brow: { thick: 0.022, angle: -0.34, len: 0.108, color: '#0c0908' }, mouth: 'line', nose: true, lipColor: '#4a1612',
  })
  // face paint: darker deep-red forehead and cheekbone shading
  for (const sd of [-1, 1]) fb.sph(h.head, '#8f1a14', [sd * 0.1, HY + 0.0, 0.135], [0.04, 0.05, 0.02], { shadow: false })
  const beard = longBeard(fb, h.head, '#0d0b0d')
  // taller and more dignified: a head a little smaller against the body (about 2.7 heads), still MGSD
  h.head.scale.setScalar(0.92)
  // the crescent glaive: the tallest weapon in the game
  glaive(fb, h.weapon, 0.98)
  h.weapon.rotation.set(0.06, 0, 0)
  h.armR.rotation.set(-0.62, 0, 0.3)
  // left hand rests at the belt (or strokes the beard)
  h.armL.rotation.set(-0.9, 0, -0.2)
  let mount
  if (mounted) {
    mount = mountRider(fb, h, { body: '#8a4a28', dark: '#2a1a12', mane: '#24150e', cloth: '#2e7d4f', clothTrim: GOLD, saddle: '#4a2a1a', bridle: '#c8372d' })
  }
  return finishRig(h, 'hero', { beard }, mount)
}

// ---------- Zhang Fei ----------
function zhangFei(fb: FB, _mounted: boolean): Rig {
  const blue = '#1f3270'
  const black = '#14141a'
  const skin = '#a65038'
  const h = makeHumanoid(fb, {
    skin, armour: blue, trim: '#9aa0b0', sleeve: black, boots: '#0f0f13', belt: '#202028', buckle: '#9aa0b0',
    skirt: 'tassets', skirtColor: black, skirtTrim: '#9aa0b0', pauldron: { color: black, style: 'round' }, studs: '#aab0c0', collar: true,
    stout: 1.2, handRadius: 0.064,
  })
  // black shoulder lames and blue panel
  fb.lathe(h.torso, [[0.172, 0.1], [0.19, 0.1], [0.19, 0.16], [0.172, 0.16]], black)
  // iron studs along the black pauldrons
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) fb.sph(h.armL.parent!, fb.metal('#aab0c0'), [sd * (D.shX + 0.04 + (i % 2) * 0.03), D.shY + 0.05 - i * 0.012, 0.045 - i * 0.03], 0.012, { shadow: false })
  // dark-iron helmet with a brow band and a red tuft
  helmet(fb, h.head, '#202028', { trim: '#9aa0b0', brim: true, rise: 0.82 })
  fb.cone(h.head, fb.metal('#9aa0b0'), [0, HY + 0.31, -0.02], [0.024, 0.075, 0.024])
  fb.tube(h.head, 'zf-tuft', [[0, 0, 0], [0, 0.04, -0.06], [0, 0.03, -0.14], [0, -0.04, -0.2]], 0.03, 0.008, '#a3202a', { p: [0, HY + 0.3, -0.02] }, { flat: 0.5 })
  addFace(fb, h.head, skin, {
    eyes: 'stare', brow: { thick: 0.032, angle: 0.4, len: 0.09, color: '#0b0908' }, mouth: 'shout', nose: true, cheeks: '#c26a4c',
  })
  tigerWhiskers(fb, h.head, '#0e0c0e')
  // red over the black and deep blue: a cape that sways, a waist sash with hanging ends, and the red tassel on the spear
  const cape = addCape(fb, h.torso, { outer: '#c0281d', lining: '#7e1811', len: 0.46, spread: 0.12, trim: '#9aa0b0' })
  cape.scale.set(1.18, 1, 1.2) // wide enough to clear his broad chest
  fb.lathe(h.torso, [[0.152 * 1.2, -0.03], [0.168 * 1.2, -0.03], [0.168 * 1.2, 0.045], [0.152 * 1.2, 0.045]], '#c0281d', { name: 'sash' })
  for (const [x, len] of [[0.07, 0.2], [0.115, 0.15]] as const) fb.tube(h.hips, `zf-sash|${len}`, [[0, 0, 0], [0.012, -0.06, 0.02], [0.02, -len * 0.7, 0.03], [0.03, -len, 0.02]], 0.03, 0.016, '#c0281d', { p: [x, 0.0, 0.2] }, { flat: 0.4 })
  // the serpent spear, held forward at an angle
  serpentSpear(fb, h.weapon, 1.05)
  h.weapon.rotation.set(0.22, 0, -0.05)
  h.armR.rotation.set(-0.7, 0, 0.3)
  h.armL.rotation.set(-0.4, 0, -0.4)
  return finishRig(h, 'hero', { cape })
}

// ---------- Zhao Yun ----------
function zhaoYun(fb: FB, mounted: boolean): Rig {
  const white = '#eef0f3'
  const silver = '#aeb8c4'
  const h = makeHumanoid(fb, {
    skin: '#f2d2b0', armour: white, trim: silver, sleeve: '#f6f7f9', boots: '#dfe3e8', belt: '#3d6fb3', buckle: silver,
    skirt: 'tassets', skirtColor: '#e6e9ee', skirtTrim: silver, pauldron: { color: '#d3dae2', style: 'round' }, mirrors: true, collar: true, ring: mounted ? 0.44 : undefined,
  })
  // blue sash across the waist with a hanging tail
  fb.lathe(h.torso, [[0.139, -0.03], [0.162, -0.03], [0.162, 0.04], [0.139, 0.04]], '#3d6fb3')
  fb.extrude(h.torso, 'zy-sash', () => shapeFrom((s) => { s.moveTo(0, 0); s.lineTo(0.07, 0); s.lineTo(0.06, -0.2); s.lineTo(0.035, -0.17); s.lineTo(0.01, -0.22); s.closePath() }), 0.014, fb.cloth('#3d6fb3'), { p: [-0.06, 0.0, 0.162], r: [0.08, 0, 0.12] }, 0.002)
  // silver helmet with a white plume, blue headband
  helmet(fb, h.head, '#cdd5de', { trim: '#8fb0d8', brim: false, rise: 0.95, plume: '#f7f7f9' })
  fb.tube(h.head, 'zy-plume2', [[0, 0, 0], [0, 0.1, -0.06], [0, 0.12, -0.17], [0, 0.0, -0.27]], 0.03, 0.007, '#f7f7f9', { p: [0, HY + 0.2, -0.02] }, { flat: 0.45 })
  addFace(fb, h.head, '#f2d2b0', { eyes: 'calm', brow: { thick: 0.014, angle: 0.06, len: 0.075 }, mouth: 'line', cheeks: '#eab49a', lipColor: '#9a4a40' })
  const cape = addCape(fb, h.torso, { outer: '#f5f6f8', lining: '#9db8dc', len: 0.5, trim: '#aeb8c4', spread: 0.1 })
  // long straight spear with a red tassel
  spear(fb, h.weapon, { len: 1.28, below: 0.3, pole: '#e8e8ec', head: '#e1e6ea', tassel: '#d02a2a' })
  h.weapon.rotation.set(0.05, 0, 0)
  h.armR.rotation.set(-0.6, 0, 0.28)
  let mount
  if (mounted) mount = mountRider(fb, h, { body: '#f3f1ea', dark: '#cfcac0', mane: '#dedcd6', cloth: '#f4f4f6', clothTrim: '#3d6fb3', saddle: '#7a5a3a', bridle: '#3d6fb3', blaze: false })
  return finishRig(h, 'hero', { cape }, mount)
}

// ---------- Zhuge Liang ----------
function zhugeLiang(fb: FB, _mounted: boolean): Rig {
  const white = '#f4f1e6'
  const black = '#1a1a20'
  const skin = '#f2d8bc'
  const h = makeHumanoid(fb, {
    skin, armour: white, trim: black, sleeve: white, boots: '#2a2a30', belt: '#2a2a30', buckle: '#8a8a92',
    skirt: 'robe', skirtColor: white, skirtTrim: black, sleeveStyle: 'wide', collar: true, handRadius: 0.056,
  })
  // black crane-collar V, black cuffs and hem fringe of crane feathers
  fb.lathe(h.torso, [[0.118, 0.165], [0.146, 0.165], [0.146, 0.2], [0.118, 0.2]], black)
  fb.extrude(h.torso, 'zl-v', () => shapeFrom((s) => { s.moveTo(-0.05, 0.2); s.lineTo(0.05, 0.2); s.lineTo(0, 0.06); s.closePath() }), 0.012, black, { p: [0, 0, 0.166] }, 0.002)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    fb.cone(h.hips, i % 2 ? black : white, [Math.sin(a) * 0.225, -0.118, Math.cos(a) * 0.225], [0.026, 0.07, 0.014], [Math.PI, a, 0], { shadow: false })
  }
  // tall black scholar's hat: a rounded crown rising well above the head, with a pale band and trailing ribbons
  const hat = fb.mat('#17171c', { rough: 0.6 })
  fb.lathe(h.head, [[0.001, 0.0], [0.17, 0.0], [0.176, 0.03], [0.164, 0.1], [0.152, 0.2], [0.15, 0.27], [0.138, 0.32], [0.1, 0.348], [0.05, 0.358], [0.001, 0.36]], hat, { p: [0, HY + 0.085, -0.02], r: [-0.1, 0, 0], name: 'scholar-hat' })
  fb.lathe(h.head, [[0.172, 0.012], [0.182, 0.012], [0.182, 0.05], [0.172, 0.05]], '#efe9d6', { p: [0, HY + 0.085, -0.02], r: [-0.1, 0, 0] })
  fb.box(h.head, '#2d2d36', [0, HY + 0.3, 0.138], [0.1, 0.17, 0.012], [-0.1, 0, 0])
  fb.sph(h.head, '#d9c9a0', [0, HY + 0.3, 0.147], 0.014, { shadow: false })
  hairCap(fb, h.head, '#17120f', -0.72, 0.186)
  for (const sd of [-1, 1]) fb.extrude(h.head, 'zl-ribbon', () => shapeFrom((s) => { s.moveTo(0, 0); s.lineTo(0.032, 0); s.lineTo(0.028, -0.22); s.lineTo(0, -0.18); s.closePath() }), 0.008, hat, { p: [sd * 0.1, HY + 0.09, -0.18], r: [0.3, 0, sd * 0.2] }, 0.002)
  addFace(fb, h.head, skin, { eyes: 'calm', brow: { thick: 0.012, angle: -0.1, arch: 1, len: 0.075 }, mouth: 'smile', lipColor: '#8a4a40' })
  // thin beard and moustache
  const hairC = '#1d1a1a'
  fb.tube(h.head, 'zl-beard', [[0, 0, 0], [0, -0.07, 0.015], [0, -0.14, 0.02], [0.004, -0.2, 0.02]], 0.03, 0.006, hairC, { p: [0, HY - 0.14, 0.1] }, { flat: 0.8 })
  for (const sd of [-1, 1]) fb.tube(h.head, 'zl-stache', [[0, 0, 0], [sd * 0.025, -0.01, 0], [sd * 0.052, -0.035, -0.004]], 0.009, 0.003, hairC, { p: [sd * 0.006, HY - 0.048, 0.168] })
  // the crane-feather fan held up in front of the chest
  const fan = featherFan(fb, h.weapon)
  fan.position.set(0, 0.07, 0)
  h.weapon.rotation.set(0.15, 0, -0.32)
  h.armR.rotation.set(-1.2, 0, 0.35)
  h.armL.rotation.set(-0.5, 0, -0.5)
  return finishRig(h, 'hero')
}

// ---------- Lu Bu ----------
function luBu(fb: FB, mounted: boolean): Rig {
  const red = '#b3261e'
  const gold = '#e2b343'
  const skin = '#e9bd96'
  const h = makeHumanoid(fb, {
    skin, armour: red, trim: gold, sleeve: '#17141a', boots: '#17141a', belt: gold, buckle: '#f6d77a',
    skirt: 'tassets', skirtColor: '#17141a', skirtTrim: gold, pauldron: { color: gold, style: 'round' }, mirrors: true, collar: true,
    stout: 1.06, legs: '#17141a', ring: mounted ? 0.44 : undefined,
  })
  // red armour plates over the black under-robe skirt
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    fb.box(h.hips, fb.metal(red), [Math.sin(a) * 0.17, -0.02, Math.cos(a) * 0.17], [0.075, 0.1, 0.014], [0.2, a, 0], { shadow: false })
  }
  // gold headpiece: crown cup, red jewel, feather sockets
  const goldM = fb.metal(gold)
  fb.lathe(h.head, [[0.001, 0.24], [0.06, 0.235], [0.14, 0.2], [0.18, 0.13], [0.19, 0.06], [0.19, 0.03], [0.17, 0.03]], goldM, { p: [0, HY - 0.02, -0.005], r: [-0.12, 0, 0], name: 'crown' })
  fb.sph(h.head, '#c8201a', [0, HY + 0.185, 0.145], 0.03, { shadow: false })
  fb.cone(h.head, goldM, [0, HY + 0.26, -0.02], [0.03, 0.07, 0.03])
  hairCap(fb, h.head, '#17120f', -0.9, 0.186)
  addFace(fb, h.head, skin, { eyes: 'fierce', brow: { thick: 0.028, angle: 0.34, len: 0.09, color: '#0b0908' }, mouth: 'grim', lipColor: '#6a2a22' })
  for (const sd of [-1, 1]) fb.tube(h.head, 'lb-m', [[0, 0, 0], [sd * 0.03, -0.012, 0], [sd * 0.065, -0.05, -0.006]], 0.012, 0.004, '#17120f', { p: [sd * 0.006, HY - 0.046, 0.168] })
  // two very long pheasant feathers arching back: the tallest silhouette
  const hp = fb.node('feathers', h.head, [0, HY + 0.24, -0.03])
  pheasantFeather(fb, hp, -1, { rise: 1.2, back: 0.75, sweep: 0.36 })
  pheasantFeather(fb, hp, 1, { rise: 1.2, back: 0.75, sweep: 0.36 })
  twinCrescentHalberd(fb, h.weapon, 1.02)
  h.weapon.rotation.set(0.05, 0, 0)
  h.armR.rotation.set(-0.62, 0, 0.3)
  let mount
  if (mounted) mount = mountRider(fb, h, { body: '#b02a20', dark: '#3a1410', mane: '#ff7a1a', flame: true, cloth: '#17141a', clothTrim: gold, saddle: '#d9a63a', bridle: gold })
  return finishRig(h, 'hero', {}, mount)
}

// ---------- Cao Cao ----------
function caoCao(fb: FB, mounted: boolean): Rig {
  const black = '#1c1a23'
  const purple = '#4f2c80'
  const gold = '#d4a73e'
  const skin = '#e9c4a0'
  const h = makeHumanoid(fb, {
    skin, armour: black, trim: gold, sleeve: purple, boots: '#14121a', belt: purple, buckle: gold,
    skirt: 'tassets', skirtColor: purple, skirtTrim: gold, pauldron: { color: purple, style: 'round' }, mirrors: true, collar: true,
    legs: '#14121a', ring: mounted ? 0.44 : undefined,
  })
  // gold edges on the shoulders and hem
  for (const sd of [-1, 1]) fb.add(h.torso, fb.torusGeo(0.082, 0.009), fb.metal(gold), { p: [sd * (D.shX + 0.012), D.shY + 0.025, 0], r: [Math.PI / 2 - 0.2, 0, sd * 0.2], shadow: false })
  // commander's helmet with a small crest and rear plume
  helmet(fb, h.head, '#22202b', { trim: gold, brim: false, rise: 1.0, cheeks: true })
  fb.extrude(h.head, 'cc-crest', () => shapeFrom((s) => { s.moveTo(-0.1, 0); s.lineTo(0.1, 0); s.lineTo(0.09, 0.1); s.lineTo(0.05, 0.1); s.lineTo(0.03, 0.2); s.lineTo(0, 0.3); s.lineTo(-0.03, 0.2); s.lineTo(-0.05, 0.1); s.lineTo(-0.09, 0.1); s.closePath() }), 0.016, fb.metal(gold), { p: [0, HY + 0.17, -0.02], r: [-0.1, 0, 0], s: 1.0 }, 0.003)
  fb.tube(h.head, 'cc-plume', [[0, 0, 0], [0, 0.03, -0.07], [0, 0.0, -0.15], [0, -0.1, -0.2]], 0.028, 0.008, '#a31f1f', { p: [0, HY + 0.17, -0.1] }, { flat: 0.5 })
  addFace(fb, h.head, skin, { eyes: 'narrow', brow: { thick: 0.02, angle: 0.18, len: 0.085 }, mouth: 'smirk', lipColor: '#7a3028' })
  // goatee and thin moustache
  const hairC = '#15110f'
  fb.cone(h.head, hairC, [0, HY - 0.155, 0.1], [0.04, 0.1, 0.03], [Math.PI + 0.12, 0, 0])
  for (const sd of [-1, 1]) fb.tube(h.head, 'cc-stache', [[0, 0, 0], [sd * 0.03, -0.006, 0], [sd * 0.062, -0.03, -0.004]], 0.01, 0.003, hairC, { p: [sd * 0.006, HY - 0.046, 0.168] })
  const cape = addCape(fb, h.torso, { outer: '#1a1820', lining: '#a31f1f', len: 0.5, trim: gold, spread: 0.17 })
  // straight sword held low
  // raised in the right hand, angled out and up: a wide diagonal that no spear-bearer shares
  sword(fb, h.weapon, { len: 0.62, wide: 0.06, guard: gold, tassel: '#7b3fb0', name: 'sword' })
  h.weapon.rotation.set(0.25, 0, -1.15)
  h.armR.rotation.set(-0.9, 0, 0.75)
  h.armL.rotation.set(-0.35, 0, -0.35)
  let mount
  if (mounted) mount = mountRider(fb, h, { body: '#1d1b20', dark: '#0f0e12', mane: '#0f0e12', cloth: '#3a2260', clothTrim: gold, saddle: '#2a1a14', bridle: gold })
  return finishRig(h, 'hero', { cape }, mount)
}

const BUILDERS: Record<HeroId, (fb: FB, mounted: boolean) => Rig> = {
  'liu-bei': liuBei,
  'guan-yu': guanYu,
  'zhang-fei': zhangFei,
  'zhao-yun': zhaoYun,
  'zhuge-liang': zhugeLiang,
  'lu-bu': luBu,
  'cao-cao': caoCao,
}

export function isHeroId(id: string): id is HeroId {
  return (HERO_IDS as readonly string[]).includes(id)
}

/** Builds a unique hero rig, or undefined when the id has no hero design. */
export function buildHeroRig(id: string, opts: HeroBuildOpts = {}): Rig | undefined {
  if (!isHeroId(id)) return undefined
  const fb = new FB(opts.own ?? false)
  const mounted = (HERO_RIDES[id] ?? false) && opts.mounted !== false
  return scaleBody(BUILDERS[id](fb, mounted), HERO_SCALE[id] ?? 1)
}

