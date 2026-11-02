// Troop rigs: infantry (spear + round shield), archer (bow + quiver), cavalry (rider on a stubby horse) and
// rebel (Yellow Turban scarf, ragged tunic, spear or farm fork). One body, side palettes, and 2-3 small variants
// (headgear, weapon angle, shield) so a squad does not look cloned.
import { FB, shade, shapeFrom } from './kit'
import { farmFork, mountRider } from './gear'
import { HORSE_PRESETS } from './horse'
import { D, addFace, arrow, bow, dome, finishRig, hairCap, helmet, makeHumanoid, quiver, roundShield, scarf, spear, type Humanoid, type FaceSpec } from './parts'
import type { Rig, SidePalette, TroopKind } from './rig'

export interface SideColours {
  cloth: string
  dark: string
  trim: string
  metal: string
  plume: string
}

/** Side palettes track the theme tokens (--han jade, --yellow ochre, --cao slate, --dong red-black, --lu purple, --court iron grey). */
export const SIDE_COLOURS: Record<SidePalette, SideColours> = {
  han: { cloth: '#2f6b5e', dark: '#1c3f37', trim: '#e9dfc2', metal: '#9aa3a0', plume: '#c8372d' },
  yellow: { cloth: '#d4a72c', dark: '#8c6d17', trim: '#f2e29a', metal: '#8a7a50', plume: '#d4a72c' },
  cao: { cloth: '#34495e', dark: '#1f2c3a', trim: '#cbd5df', metal: '#a7b0b8', plume: '#34495e' },
  dong: { cloth: '#6b1f2a', dark: '#26100f', trim: '#c9a24a', metal: '#6a6a70', plume: '#6b1f2a' },
  lu: { cloth: '#5b2c6f', dark: '#2b1536', trim: '#d9c07a', metal: '#a89cb8', plume: '#d9c07a' },
  court: { cloth: '#5d5a52', dark: '#2e2c28', trim: '#a8864a', metal: '#8e8c86', plume: '#a8864a' },
}

const SKINS = ['#e8c5a2', '#dcb28c', '#f0d0b0']
const FACES: FaceSpec[] = [
  { eyes: 'dot', brow: { thick: 0.016, angle: 0.1, len: 0.07 }, mouth: 'line' },
  { eyes: 'round', brow: { thick: 0.016, angle: 0.0, len: 0.07 }, mouth: 'smile' },
  { eyes: 'narrow', brow: { thick: 0.018, angle: 0.15, len: 0.075 }, mouth: 'grim' },
]

function soldierBody(fb: FB, kind: TroopKind, side: SidePalette, v: number, mounted: boolean): Humanoid {
  const c = SIDE_COLOURS[side]
  const skin = SKINS[v % 3]!
  const rebel = kind === 'rebel'
  const h = makeHumanoid(fb, {
    skin,
    armour: rebel ? shade(c.cloth, -0.06) : c.cloth,
    trim: c.trim,
    sleeve: rebel ? shade(c.cloth, -0.1) : shade(c.cloth, -0.04),
    boots: rebel ? shade(skin, -0.12) : '#2b241d',
    belt: rebel ? '#6b4a2a' : '#3a2c1f',
    buckle: rebel ? '#8a6a3a' : shade(c.trim, -0.1),
    skirt: 'tassets',
    skirtColor: rebel ? shade(c.cloth, -0.18) : c.dark,
    // no light hem band on troops: seen from above, a pale ring at the feet reads as a base (D23)
    legs: rebel ? shade(c.dark, 0.1) : c.dark,
    pauldron: rebel ? { color: c.cloth, style: 'none' } : { color: c.metal, style: 'round' },
    mirrors: !rebel && kind !== 'archer',
    collar: !rebel,
    ring: mounted ? 0.44 : D.ring,
  })
  addFace(fb, h.head, skin, FACES[v % 3]!)
  return h
}

/** `own`: the rig gets its own materials (the board tints them per unit: done, hit, glowing). */
export function buildTroopRig(kind: TroopKind, side: SidePalette, variant = 0, own = false): Rig {
  const fb = new FB(own)
  const v = ((variant % 3) + 3) % 3
  const c = SIDE_COLOURS[side]
  switch (kind) {
    case 'infantry': {
      const h = soldierBody(fb, 'infantry', side, v, false)
      if (v === 0) helmet(fb, h.head, c.metal, { trim: c.trim, crest: c.plume, spike: true })
      else if (v === 1) helmet(fb, h.head, shade(c.metal, -0.15), { trim: c.trim, brim: true, plume: c.plume, rise: 0.9 })
      else {
        hairCap(fb, h.head, '#1a1511', -0.72, 0.19)
        scarf(fb, h.head, c.cloth, { band: c.trim, tails: false })
      }
      spear(fb, h.weapon, { len: 1.12 + v * 0.05, below: 0.28, tassel: v === 1 ? c.plume : undefined })
      h.weapon.rotation.set(0.06, 0, [0.0, -0.07, 0.06][v]!)
      h.armR.rotation.set(-0.6, 0, 0.3)
      roundShield(fb, h.offhand, { face: [c.cloth, shade(c.cloth, 0.1), c.dark][v]!, rim: c.metal, boss: c.trim, size: 0.17 })
      h.armL.rotation.set(-0.5, 0, -0.1)
      return finishRig(h, 'infantry')
    }
    case 'archer': {
      const h = soldierBody(fb, 'archer', side, v, false)
      if (v === 0) {
        hairCap(fb, h.head, '#1a1511', -0.72, 0.19)
        scarf(fb, h.head, shade(c.cloth, 0.1), { band: c.trim, tails: true })
      } else if (v === 1) {
        // wide straw hat
        fb.lathe(h.head, [[0.001, 0.2], [0.07, 0.19], [0.13, 0.14], [0.28, 0.02], [0.28, 0.0], [0.001, 0.12]], fb.mat('#cdb27a', { double: true }), { p: [0, D.headY + 0.05, 0], r: [-0.08, 0, 0], name: 'straw-hat' })
      } else {
        dome(fb, h.head, c.cloth, { rise: 0.85, y: 0.04 })
        fb.add(h.head, fb.torusGeo(0.19, 0.012), c.trim, { p: [0, D.headY + 0.065, 0], r: [Math.PI / 2 - 0.1, 0, 0], shadow: false })
      }
      quiver(fb, h.torso, { color: '#5a3a1e', fletch: v === 2 ? c.plume : '#e9e0c8' })
      bow(fb, h.offhand, { len: 0.74 })
      h.armL.rotation.set(-0.8, 0, -0.15)
      h.offhand.rotation.set(0.0, 0, 0.0)
      const ar = arrow(fb, h.weapon)
      ar.rotation.set(Math.PI / 2 + 0.2, 0, 0)
      h.armR.rotation.set(-0.7, 0, 0.3)
      return finishRig(h, 'archer')
    }
    case 'cavalry': {
      const h = soldierBody(fb, 'cavalry', side, v, true)
      helmet(fb, h.head, v === 1 ? shade(c.metal, -0.2) : c.metal, { trim: c.trim, plume: c.plume, rise: 0.95, spike: v === 2 })
      const lance = spear(fb, h.weapon, { len: 1.3, below: 0.3, tassel: c.plume })
      // pennon on the lance in the side colour
      fb.extrude(lance, 'lance-pennon', () => shapeFrom((s) => { s.moveTo(0, 0); s.lineTo(0.2, -0.03); s.lineTo(0.15, -0.08); s.lineTo(0.22, -0.15); s.lineTo(0, -0.17); s.closePath() }), 0.006, fb.cloth(c.cloth), { p: [0.012, 1.14, 0], r: [0, 0, 0] }, 0.002)
      h.weapon.rotation.set(0.1 + v * 0.05, 0, [0.0, 0.08, -0.06][v]!)
      h.armR.rotation.set(-0.6, 0, 0.28)
      h.armL.rotation.set(-0.5, 0, -0.2)
      const base = HORSE_PRESETS[['bay', 'chestnut', 'black'][v]!]!
      const mount = mountRider(fb, h, { ...base, cloth: c.cloth, clothTrim: c.trim, flame: false })
      return finishRig(h, 'cavalry', {}, mount)
    }
    default: {
      const h = soldierBody(fb, 'rebel', side, v, false)
      // yellow headscarf with knot and tails, whatever the side
      scarf(fb, h.head, '#e0b52a', { tails: true, knotSide: v === 1 ? 0.07 : v === 2 ? -0.07 : 0, band: '#a87c14' })
      // rags: a torn hem, a patch and a rope belt
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + v
        fb.cone(h.hips, shade(c.cloth, -0.2), [Math.sin(a) * 0.19, -0.09, Math.cos(a) * 0.19], [0.026, 0.06 + (i % 3) * 0.015, 0.014], [Math.PI, a, 0], { shadow: false })
      }
      fb.box(h.torso, shade(c.cloth, 0.2), [0.07 * (v - 1), 0.1, 0.162], [0.06, 0.05, 0.012], [0, 0, 0.2], { shadow: false })
      if (v === 1) {
        farmFork(fb, h.weapon, 1.0)
        h.weapon.rotation.set(0.12, 0, -0.06)
      } else {
        spear(fb, h.weapon, { len: v === 0 ? 1.05 : 0.9, below: 0.26, pole: '#7a5a34', head: '#8d8a84', leaf: v === 0 })
        h.weapon.rotation.set(0.1, 0, v === 2 ? 0.1 : -0.04)
      }
      h.armR.rotation.set(-0.65, 0, 0.3)
      h.armL.rotation.set(-0.4, 0, -0.25)
      return finishRig(h, 'rebel')
    }
  }
}
