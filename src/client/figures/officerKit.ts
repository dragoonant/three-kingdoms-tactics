// The named-officer kit (docs/spec/31-hero-figures.md): a generic MGSD body with a per-officer palette, headgear, weapon and
// extras from a small table keyed by officer id. Battle-local officers fall back to a default by troop type and side.
import { FB, shade, shapeFrom } from './kit'
import { addCape, bambooScroll, battleAxe, jiHalberd, mountRider, talismanSword, walkingStaff, warClub, glaive } from './gear'
import { HORSE_PRESETS } from './horse'
import { D, addFace, arrow, bow, dome, finishRig, hairCap, helmet, makeHumanoid, quiver, scarf, spear, sword, type FaceSpec, type Humanoid } from './parts'
import { SIDE_COLOURS } from './troops'
import type { Rig, SidePalette, TroopKind } from './rig'

type Weapon = 'spear' | 'ji' | 'sword' | 'bow' | 'axe' | 'twinaxe' | 'club' | 'staff' | 'scroll' | 'talisman' | 'glaive'
type Head = 'helmet' | 'scarf' | 'cap' | 'taoist' | 'topknot' | 'bare' | 'straw'
type Beard = 'none' | 'stache' | 'goatee' | 'full' | 'long'
type Extra = 'eyepatch' | 'bells' | 'cape' | 'scholar-robe'

export interface OfficerStyle {
  skin?: string
  armour: string
  trim: string
  /** Skirt / robe colour; defaults to a darker armour. */
  skirt?: string
  sleeve?: string
  robe?: boolean
  head: Head
  headColor: string
  plume?: string
  weapon: Weapon
  beard?: Beard
  beardColor?: string
  face?: FaceSpec
  extras?: Extra[]
  mount?: string
  stout?: number
}

const INK = '#16110e'
const WHITE_HAIR = '#e8e6e0'

const F = {
  stern: { eyes: 'narrow', brow: { thick: 0.022, angle: 0.2, len: 0.08 }, mouth: 'grim' } as FaceSpec,
  calm: { eyes: 'calm', brow: { thick: 0.014, angle: 0.0, arch: 1, len: 0.072 }, mouth: 'line' } as FaceSpec,
  kind: { eyes: 'kind', brow: { thick: 0.014, angle: -0.05, arch: 1, len: 0.07 }, mouth: 'smile' } as FaceSpec,
  fierce: { eyes: 'fierce', brow: { thick: 0.028, angle: 0.3, len: 0.088 }, mouth: 'grim' } as FaceSpec,
  shout: { eyes: 'stare', brow: { thick: 0.026, angle: 0.32, len: 0.085 }, mouth: 'open' } as FaceSpec,
  young: { eyes: 'round', brow: { thick: 0.016, angle: 0.08, len: 0.072 }, mouth: 'smirk' } as FaceSpec,
}

const HAN = { armour: '#3b6b5a', trim: '#e0cf9a' }
const CAO = { armour: '#2f4259', trim: '#cbd5df' }
const YT = { armour: '#c4962a', trim: '#f0dc8a' }
const DONG = { armour: '#5a1d26', trim: '#c9a24a' }
const LU = { armour: '#552a68', trim: '#d9c07a' }
const WU = { armour: '#a8342c', trim: '#efe3c4' }

/** One entry per officer in src/data/officers.json that has no unique hero design. */
export const OFFICER_STYLES: Record<string, OfficerStyle> = {
  'zou-jing': { ...HAN, head: 'helmet', headColor: '#8a9490', plume: '#c8372d', weapon: 'bow', beard: 'stache', beardColor: INK, face: F.stern },
  'jian-yong': { armour: '#b89a62', trim: '#6b4a2a', skirt: '#a8884e', sleeve: '#c9ad78', robe: true, head: 'cap', headColor: '#2a2a30', weapon: 'bow', beard: 'stache', beardColor: INK, face: F.kind },
  'cheng-yuanzhi': { ...YT, head: 'scarf', headColor: '#e0b52a', weapon: 'spear', beard: 'full', beardColor: INK, face: F.shout, stout: 1.1 },
  'deng-mao': { armour: '#b98a2a', trim: '#f0dc8a', head: 'scarf', headColor: '#e0b52a', weapon: 'ji', beard: 'goatee', beardColor: INK, face: F.fierce },
  'captain-gao': { ...YT, head: 'scarf', headColor: '#e0b52a', weapon: 'sword', beard: 'stache', beardColor: INK, face: F.shout },
  'captain-sun': { armour: '#a98a3a', trim: '#e6d48a', head: 'scarf', headColor: '#e0b52a', weapon: 'axe', beard: 'none', face: F.fierce },
  'captain-ma': { armour: '#b3862a', trim: '#f0dc8a', head: 'scarf', headColor: '#e0b52a', weapon: 'spear', beard: 'goatee', beardColor: INK, face: F.shout, mount: 'bay' },
  'captain-wu': { armour: '#b89a3a', trim: '#e6d48a', head: 'scarf', headColor: '#e0b52a', weapon: 'bow', beard: 'none', face: F.young },
  'taiping-adept': { armour: '#d4a72c', trim: '#2a1d10', skirt: '#c4962a', robe: true, sleeve: '#d4a72c', head: 'taoist', headColor: '#2a1d10', weapon: 'talisman', beard: 'goatee', beardColor: INK, face: F.calm },
  'gong-jing': { ...HAN, head: 'helmet', headColor: '#8a9490', plume: '#c8372d', weapon: 'sword', beard: 'stache', beardColor: INK, face: F.calm },
  'gongsun-zan': { armour: '#e2e5ea', trim: '#8fa0b4', head: 'helmet', headColor: '#d6dce3', plume: '#e7e9ee', weapon: 'spear', beard: 'stache', beardColor: INK, face: F.stern, mount: 'white' },
  'tao-qian': { armour: '#6a4a78', trim: '#d4b86a', skirt: '#5a3c68', sleeve: '#7a5a88', robe: true, head: 'cap', headColor: '#2a2a30', weapon: 'staff', beard: 'long', beardColor: WHITE_HAIR, face: F.kind },
  'mi-zhu': { armour: '#a9482f', trim: '#e0c46a', skirt: '#8e3a28', sleeve: '#c46a3a', robe: true, head: 'cap', headColor: '#4a2a1a', weapon: 'scroll', beard: 'stache', beardColor: INK, face: F.kind, stout: 1.1 },
  'sun-qian': { armour: '#4d6a8c', trim: '#e0e4ea', skirt: '#3c5877', sleeve: '#5a7899', robe: true, head: 'cap', headColor: '#1f2a3a', weapon: 'bow', beard: 'goatee', beardColor: INK, face: F.calm },
  'guan-ping': { armour: '#2f7f52', trim: '#d9a93c', head: 'scarf', headColor: '#2e7d4f', weapon: 'sword', beard: 'none', face: F.young, skirt: '#245f3e' },
  'xiahou-dun': { ...CAO, head: 'helmet', headColor: '#2a3647', plume: '#34495e', weapon: 'spear', beard: 'stache', beardColor: INK, face: F.fierce, extras: ['eyepatch'], mount: 'bay' },
  'xiahou-yuan': { ...CAO, head: 'helmet', headColor: '#2a3647', plume: '#9aa8b6', weapon: 'bow', beard: 'goatee', beardColor: INK, face: F.stern },
  'cao-ren': { armour: '#3a4c64', trim: '#cbd5df', head: 'helmet', headColor: '#4a5a6e', plume: '#34495e', weapon: 'spear', beard: 'full', beardColor: INK, face: F.stern, stout: 1.1 },
  'yu-jin': { ...CAO, head: 'helmet', headColor: '#3a4a5e', plume: '#cbd5df', weapon: 'sword', beard: 'stache', beardColor: INK, face: F.calm },
  'dian-wei': { armour: '#2a3a52', trim: '#aab4c0', head: 'helmet', headColor: '#222b38', weapon: 'twinaxe', beard: 'full', beardColor: INK, face: F.shout, stout: 1.2 },
  'xu-chu': { armour: '#8a5a38', trim: '#c9a46a', head: 'bare', headColor: '#17120f', weapon: 'club', beard: 'full', beardColor: INK, face: F.shout, stout: 1.22, skin: '#d9a47e' },
  'zhang-he': { ...CAO, head: 'helmet', headColor: '#3a4a5e', plume: '#b3261e', weapon: 'ji', beard: 'none', face: F.young, mount: 'black' },
  'li-dian': { ...CAO, head: 'helmet', headColor: '#4a5a6e', plume: '#34495e', weapon: 'sword', beard: 'none', face: F.calm },
  'chen-gong': { armour: '#3a4a6a', trim: '#cbd5df', skirt: '#2c3a54', sleeve: '#4a5a7a', robe: true, head: 'cap', headColor: '#1a1f2a', weapon: 'scroll', beard: 'goatee', beardColor: INK, face: F.calm },
  'gao-shun': { ...LU, head: 'helmet', headColor: '#7a6a8c', plume: '#d9c07a', weapon: 'spear', beard: 'stache', beardColor: INK, face: F.stern },
  'zhang-liao': { armour: '#34485f', trim: '#d4a73e', head: 'helmet', headColor: '#2f3e52', plume: '#b3261e', weapon: 'ji', beard: 'stache', beardColor: INK, face: F.fierce, mount: 'bay' },
  'li-jue': { ...DONG, head: 'helmet', headColor: '#3a3a42', plume: '#6b1f2a', weapon: 'ji', beard: 'full', beardColor: INK, face: F.shout, mount: 'black' },
  'guo-si': { ...DONG, head: 'helmet', headColor: '#4a4a52', plume: '#c9a24a', weapon: 'spear', beard: 'goatee', beardColor: INK, face: F.fierce, mount: 'bay' },
  'zhang-liang': { armour: '#c4962a', trim: '#2a1d10', skirt: '#a98320', robe: true, head: 'scarf', headColor: '#e0b52a', weapon: 'staff', beard: 'stache', beardColor: INK, face: F.stern },
  'zhang-bao': { armour: '#d6ac32', trim: '#2a1d10', skirt: '#2a1d10', sleeve: '#d6ac32', robe: true, head: 'taoist', headColor: '#2a1d10', weapon: 'talisman', beard: 'goatee', beardColor: INK, face: F.fierce },
  'zhou-yu': { armour: '#b8383a', trim: '#f0e6c8', skirt: '#f0e6c8', sleeve: '#c9494a', robe: false, head: 'topknot', headColor: '#17120f', weapon: 'bow', beard: 'none', face: F.young },
  'huang-gai': { ...WU, head: 'helmet', headColor: '#8a4a3a', plume: '#efe3c4', weapon: 'sword', beard: 'long', beardColor: '#cfcac0', face: F.stern, stout: 1.1 },
  'gan-ning': { armour: '#3a5a8c', trim: '#d4a73e', head: 'bare', headColor: '#17120f', weapon: 'sword', beard: 'none', face: F.fierce, extras: ['bells'], mount: 'chestnut' },
  'cai-mao': { armour: '#4f6a4a', trim: '#d4c88a', head: 'helmet', headColor: '#6a7a62', plume: '#4f6a4a', weapon: 'bow', beard: 'stache', beardColor: INK, face: F.stern },
}
export const OFFICER_IDS = Object.keys(OFFICER_STYLES) as readonly string[]

export interface OfficerOpts {
  /** For officers with no table entry (battle-local): the troop type and side decide the default look. */
  type?: TroopKind
  side?: SidePalette
  /** Force on or off the mount. */
  mounted?: boolean
  own?: boolean
}

function hashOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Sensible default look for an officer with no table entry. */
export function defaultStyle(id: string, type: TroopKind = 'infantry', side: SidePalette = 'han'): OfficerStyle {
  const c = SIDE_COLOURS[side]
  const n = hashOf(id)
  const weapon: Weapon = type === 'archer' ? 'bow' : type === 'cavalry' ? 'ji' : (['spear', 'sword', 'axe'] as Weapon[])[n % 3]!
  const rebel = type === 'rebel' || side === 'yellow'
  return {
    armour: shade(c.cloth, 0.04),
    trim: c.trim,
    head: rebel ? 'scarf' : type === 'archer' ? 'cap' : 'helmet',
    headColor: rebel ? '#e0b52a' : type === 'archer' ? '#2a2a30' : c.metal,
    plume: c.plume,
    weapon,
    beard: (['none', 'stache', 'goatee', 'full'] as Beard[])[(n >> 3) % 4]!,
    beardColor: INK,
    face: [F.stern, F.calm, F.fierce, F.young][(n >> 5) % 4]!,
    ...(type === 'cavalry' ? { mount: 'bay' } : {}),
  }
}

export function hasOfficerStyle(id: string): boolean {
  return id in OFFICER_STYLES
}

function addBeard(fb: FB, head: Humanoid['head'], kind: Beard, color: string): void {
  const m = fb.mat(color, { rough: 0.6 })
  const hy = D.headY
  const stache = (): void => {
    for (const sd of [-1, 1]) fb.tube(head, `ok-stache`, [[0, 0, 0], [sd * 0.028, -0.008, 0], [sd * 0.06, -0.034, -0.004]], 0.012, 0.004, m, { p: [sd * 0.008, hy - 0.046, 0.168] })
  }
  switch (kind) {
    case 'stache':
      stache()
      break
    case 'goatee':
      stache()
      fb.cone(head, m, [0, hy - 0.152, 0.1], [0.038, 0.1, 0.028], [Math.PI + 0.1, 0, 0])
      break
    case 'full':
      stache()
      fb.extrude(
        head,
        'ok-full',
        () => shapeFrom((s) => { s.moveTo(-0.15, 0.02); s.bezierCurveTo(-0.16, -0.08, -0.08, -0.2, 0, -0.21); s.bezierCurveTo(0.08, -0.2, 0.16, -0.08, 0.15, 0.02); s.quadraticCurveTo(0, -0.04, -0.15, 0.02) }),
        0.06,
        m,
        { p: [0, hy - 0.06, 0.07], r: [-0.12, 0, 0] },
        0.01,
      )
      break
    case 'long':
      stache()
      fb.extrude(
        head,
        'ok-long',
        () => shapeFrom((s) => { s.moveTo(-0.11, 0.02); s.bezierCurveTo(-0.13, -0.1, -0.08, -0.22, 0, -0.26); s.bezierCurveTo(0.08, -0.22, 0.13, -0.1, 0.11, 0.02); s.quadraticCurveTo(0, -0.03, -0.11, 0.02) }),
        0.05,
        m,
        { p: [0, hy - 0.06, 0.1], r: [-0.18, 0, 0] },
        0.01,
      )
      break
    default:
  }
}

function addHead(fb: FB, h: Humanoid, s: OfficerStyle): void {
  const hy = D.headY
  switch (s.head) {
    case 'helmet':
      helmet(fb, h.head, s.headColor, { trim: s.trim, ...(s.plume ? { plume: s.plume } : {}), spike: !s.plume, brim: false, rise: 1 })
      break
    case 'scarf':
      scarf(fb, h.head, s.headColor, { band: s.trim, tails: true })
      break
    case 'cap':
      dome(fb, h.head, s.headColor, { rise: 1.05, y: 0.04, r: 0.2 })
      fb.box(h.head, s.headColor, [0, hy + 0.2, -0.03], [0.1, 0.06, 0.1])
      fb.add(h.head, fb.torusGeo(0.19, 0.012), s.trim, { p: [0, hy + 0.08, 0], r: [Math.PI / 2 - 0.1, 0, 0], shadow: false })
      break
    case 'taoist': {
      // tall lotus-style Taoist crown
      const m = fb.mat(s.headColor, { rough: 0.6 })
      fb.lathe(h.head, [[0.001, 0.0], [0.15, 0.0], [0.16, 0.05], [0.12, 0.13], [0.1, 0.2], [0.13, 0.26], [0.001, 0.3]], m, { p: [0, hy + 0.08, -0.01], name: 'taoist-cap' })
      fb.cyl(h.head, s.trim, [0, hy + 0.15, 0.0], [0.152, 0.03, 0.152])
      fb.cyl(h.head, fb.metal('#d4a72c'), [0, hy + 0.34, -0.01], [0.008, 0.2, 0.008], [0, 0, Math.PI / 2])
      break
    }
    case 'topknot':
      hairCap(fb, h.head, s.headColor, -0.72, 0.19)
      fb.sph(h.head, s.headColor, [0, hy + 0.21, -0.03], [0.05, 0.06, 0.05])
      fb.cyl(h.head, fb.metal('#d9a93c'), [0, hy + 0.175, -0.03], [0.05, 0.03, 0.05])
      fb.tube(h.head, 'ok-ribbon', [[0, 0, 0], [0, -0.05, -0.05], [0, -0.14, -0.08], [0, -0.24, -0.06]], 0.016, 0.008, '#b8383a', { p: [0, hy + 0.2, -0.06] }, { flat: 0.4 })
      break
    case 'bare':
      hairCap(fb, h.head, s.headColor, -0.72, 0.19)
      fb.sph(h.head, s.headColor, [0, hy + 0.2, -0.04], 0.05)
      fb.add(h.head, fb.torusGeo(0.186, 0.014), s.trim, { p: [0, hy + 0.065, 0], r: [Math.PI / 2 - 0.2, 0, 0], shadow: false })
      break
    default:
  }
}

function addWeapon(fb: FB, h: Humanoid, s: OfficerStyle, gear: { cavalry: boolean }): void {
  switch (s.weapon) {
    case 'spear':
      spear(fb, h.weapon, { len: gear.cavalry ? 1.3 : 1.15, below: 0.28, tassel: s.plume ?? '#c8372d' })
      h.weapon.rotation.set(0.06, 0, 0)
      break
    case 'ji':
      jiHalberd(fb, h.weapon, gear.cavalry ? 1.25 : 1.1, s.plume ?? '#c8372d')
      h.weapon.rotation.set(0.06, 0, 0)
      break
    case 'glaive': {
      const g = glaive(fb, h.weapon, 0.9)
      g.scale.setScalar(0.8)
      break
    }
    case 'sword':
      sword(fb, h.weapon, { len: 0.46, wide: 0.058, guard: s.trim })
      h.weapon.rotation.set(0.9, 0, 0)
      break
    case 'talisman':
      talismanSword(fb, h.weapon)
      h.weapon.rotation.set(0.5, 0, -0.2)
      break
    case 'axe':
      battleAxe(fb, h.weapon, 0.95)
      h.weapon.rotation.set(0.1, 0, 0)
      break
    case 'twinaxe':
      battleAxe(fb, h.weapon, 0.55).scale.setScalar(0.72)
      battleAxe(fb, h.offhand, 0.55, -1).scale.setScalar(0.72)
      h.weapon.rotation.set(0.55, 0, -0.35)
      h.offhand.rotation.set(0.55, 0, 0.35)
      break
    case 'club':
      warClub(fb, h.weapon, 1.0)
      h.weapon.rotation.set(0.1, 0, 0.08)
      break
    case 'staff':
      walkingStaff(fb, h.weapon, 0.95)
      h.weapon.rotation.set(0.05, 0, 0)
      break
    case 'scroll': {
      const sc = bambooScroll(fb, h.weapon)
      sc.position.set(0, 0.04, 0.02)
      break
    }
    case 'bow': {
      quiver(fb, h.torso, { color: '#5a3a1e', fletch: s.plume ?? '#e9e0c8' })
      bow(fb, h.offhand, { len: 0.74 })
      h.armL.rotation.set(-0.8, 0, -0.15)
      const a = arrow(fb, h.weapon)
      a.rotation.set(Math.PI / 2 + 0.2, 0, 0)
      break
    }
  }
}

function addExtras(fb: FB, h: Humanoid, s: OfficerStyle): void {
  for (const e of s.extras ?? []) {
    if (e === 'eyepatch') {
      // black leather patch over the left eye, gold-rimmed, with a strap running to the ear
      fb.sph(h.head, '#0b0a09', [-0.072, D.headY + 0.03, 0.15], [0.07, 0.062, 0.03], { r: [0, -0.4, 0.1], name: 'eyepatch' })
      fb.add(h.head, fb.torusGeo(0.064, 0.007), fb.metal('#d4a73e'), { p: [-0.072, D.headY + 0.03, 0.172], r: [0, -0.4, 0], shadow: false })
      fb.box(h.head, '#0b0a09', [-0.135, D.headY + 0.05, 0.1], [0.12, 0.016, 0.016], [0, 0.9, 0.35], { shadow: false })
    } else if (e === 'bells') {
      // a string of bells at the belt
      for (let i = 0; i < 6; i++) {
        const a = -0.9 + i * 0.36
        const bell = fb.node('bell', h.hips, [Math.sin(a) * 0.15, 0.0, Math.cos(a) * 0.15])
        fb.tube(bell, 'bell-cord', [[0, 0, 0], [0, -0.04, 0.008], [0, -0.08, 0.01]], 0.006, 0.006, '#c8372d')
        fb.lathe(bell, [[0.001, 0.0], [0.025, 0.0], [0.034, -0.03], [0.036, -0.045], [0.0, -0.045]], fb.metal('#e2b843'), { p: [0, -0.07, 0.01] }, 12)
      }
    } else if (e === 'cape') {
      addCape(fb, h.torso, { outer: s.armour, lining: shade(s.armour, -0.2), len: 0.42 })
    }
  }
}

/** Builds an officer from the kit table (or the default for the given troop type and side). */
export function buildOfficer(id: string, opts: OfficerOpts = {}): Rig {
  const style = OFFICER_STYLES[id] ?? defaultStyle(id, opts.type, opts.side)
  const fb = new FB(opts.own ?? false)
  const mountName = opts.mounted === false ? undefined : style.mount
  const mounted = !!mountName
  const skin = style.skin ?? ['#e8c5a2', '#dcb28c', '#f0d0b0'][hashOf(id) % 3]!
  const robe = style.robe ?? false
  const h = makeHumanoid(fb, {
    skin,
    armour: style.armour,
    trim: style.trim,
    sleeve: style.sleeve ?? shade(style.armour, -0.05),
    boots: '#2a221b',
    belt: shade(style.trim, -0.25),
    buckle: style.trim,
    skirt: robe ? 'robe' : 'tassets',
    skirtColor: style.skirt ?? shade(style.armour, -0.12),
    skirtTrim: style.trim,
    legs: shade(style.skirt ?? style.armour, -0.2),
    pauldron: robe ? { color: style.armour, style: 'none' } : { color: shade(style.armour, 0.1), style: 'round' },
    mirrors: !robe && style.weapon !== 'bow',
    collar: true,
    sleeveStyle: robe ? 'wide' : 'tight',
    stout: style.stout ?? 1,
    baseR: mounted ? 0.44 : D.baseR,
  })
  addFace(fb, h.head, skin, style.face ?? F.calm)
  addBeard(fb, h.head, style.beard ?? 'none', style.beardColor ?? INK)
  addHead(fb, h, style)
  addWeapon(fb, h, style, { cavalry: mounted })
  addExtras(fb, h, style)
  if (style.weapon !== 'bow') {
    h.armR.rotation.set(-0.62, 0, 0.3)
    if (style.weapon === 'talisman') h.armR.rotation.set(-1.0, 0, 0.35)
  } else {
    h.armR.rotation.set(-0.7, 0, 0.3)
  }
  let mount
  if (mountName) {
    const base = HORSE_PRESETS[mountName] ?? HORSE_PRESETS.bay!
    mount = mountRider(fb, h, { ...base, cloth: shade(style.armour, -0.1), clothTrim: style.trim, flame: false })
  }
  return finishRig(h, 'officer', {}, mount)
}

