// Locomotion clips (docs/spec/31-hero-figures.md "Locomotion"): foot contact (no sliding, no sinking), footfall order per
// gait, distance-driven phase, the flat falls and the kneel. Three.js builds in node, so the contact is measured on the
// real meshes: the lowest vertex of each boot or hoof, in world space, while the figure is carried forward by the distance.
import { Mesh, Vector3, type BufferAttribute, type Object3D } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import {
  HORSE_GAITS,
  HUMAN_GAITS,
  applyClip,
  canter,
  fallBack,
  fallForward,
  gaitBlend,
  gallop,
  horseWalk,
  idle,
  kneel,
  locomotion,
  magnitude,
  run,
  stagger,
  staggerShift,
  stepTurn,
  strideOf,
  trot,
  walk,
  type Clip,
} from '../../src/client/figures/clips'
import { buildHeroRig } from '../../src/client/figures/heroes'
import { disposeFigureCaches } from '../../src/client/figures/kit'
import { buildOfficer } from '../../src/client/figures/officerKit'
import { buildTroopRig } from '../../src/client/figures/troops'
import type { Rig } from '../../src/client/figures/rig'

const built: Rig[] = []
const keep = (r: Rig): Rig => {
  built.push(r)
  return r
}
afterAll(() => {
  built.forEach((r) => r.dispose())
  disposeFigureCaches()
})

const v = new Vector3()
/** Lowest world point under `o`: its height, and the middle (z, x) of the patch within 3 mm of it (a flat hoof has no single lowest vertex). */
function lowest(o: Object3D): { y: number; z: number; x: number } {
  const pts: number[][] = []
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return
    const pos = m.geometry.getAttribute('position') as BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      pts.push([v.y, v.z, v.x])
    }
  })
  let y = Infinity
  for (const p of pts) y = Math.min(y, p[0]!)
  let n = 0
  let z = 0
  let x = 0
  for (const p of pts) {
    if (p[0]! < y + 0.003) {
      n++
      z += p[1]!
      x += p[2]!
    }
  }
  return { y, z: z / n, x: x / n }
}

/** Carry the rig forward by `d` along +z and pose it with `clip`; returns the contact of each foot. */
function contacts(rig: Rig, clip: Clip, d: number, feet: Object3D[]): { y: number; z: number }[] {
  // the brothers' bodies are scaled: a distance of d clip units is d * bodyScale tiles
  rig.group.position.set(0, 0, d * (rig.bodyScale ?? 1))
  applyClip(rig, clip)
  rig.group.updateMatrixWorld(true)
  return feet.map(lowest)
}

/** Check a gait: every foot's contact intervals are planted (the foot does not move in the world) and nothing sinks. */
function checkPlanted(rig: Rig, feet: Object3D[], clipAt: (d: number) => Clip, stride: number, label: string, contactY = 0.003): void {
  const step = stride / 80
  const n = 80 * 3
  let sunk = 0
  const runs: number[][][] = feet.map(() => [])
  const open: (number[] | null)[] = feet.map(() => null)
  let grounded = 0
  for (let i = 0; i <= n; i++) {
    const d = 5 + i * step
    const c = contacts(rig, clipAt(d), d, feet)
    let any = false
    c.forEach((f, k) => {
      sunk = Math.min(sunk, f.y)
      if (f.y < contactY) {
        any = true
        if (!open[k]) open[k] = []
        open[k]!.push(f.z)
      } else if (open[k]) {
        runs[k]!.push(open[k]!)
        open[k] = null
      }
    })
    if (any) grounded++
  }
  expect(sunk, `${label}: nothing sinks below the sand`).toBeGreaterThan(-0.012)
  const spread = (zs: number[]): number => Math.max(...zs) - Math.min(...zs)
  for (const rs of runs) {
    // the first run may be cut by the start of the sweep; every complete run counts
    expect(rs.length, `${label}: feet touch down repeatedly`).toBeGreaterThan(1)
    for (const r of rs.filter((q) => q.length >= 5)) {
      const k = Math.floor(r.length * 0.15)
      expect(spread(r.slice(k, r.length - k)), `${label}: planted foot drifts in mid-stance`).toBeLessThan(0.02)
      expect(spread(r), `${label}: planted foot drifts at heel strike / toe-off`).toBeLessThan(0.045)
    }
  }
  expect(grounded, `${label}: grounded most of the time`).toBeGreaterThan(n * 0.3)
}

const footOf = (rig: Rig): Object3D[] => [rig.joints.legL, rig.joints.legR]

describe('foot contact', () => {
  it('the soles of a standing figure rest on y = 0 (no base)', () => {
    for (const rig of [keep(buildTroopRig('infantry', 'han')), keep(buildHeroRig('liu-bei')!), keep(buildOfficer('jian-yong'))]) {
      rig.group.position.set(0, 0, 0)
      applyClip(rig, { pose: {} })
      rig.group.updateMatrixWorld(true)
      for (const leg of footOf(rig)) expect(Math.abs(lowest(leg).y)).toBeLessThan(0.004)
      let low = Infinity
      rig.group.traverse((o) => {
        // a spear butt may reach the sand; judge the body
        if (o instanceof Mesh && !isUnder(o, rig.joints.weapon) && !isUnder(o, rig.joints.offhand)) low = Math.min(low, lowest(o).y)
      })
      expect(low).toBeGreaterThan(-0.01)
      expect(rig.group.getObjectByName('base')).toBeUndefined()
    }
  })

  it('a horse stands on its hooves at y = 0', () => {
    const rig = keep(buildTroopRig('cavalry', 'han'))
    applyClip(rig, { pose: {} })
    rig.group.updateMatrixWorld(true)
    const m = rig.mount!.joints
    for (const j of [m.legFL, m.legFR, m.legBL, m.legBR]) expect(Math.abs(lowest(j).y)).toBeLessThan(0.006)
    expect(rig.group.getObjectByName('base')).toBeUndefined()
  })

  for (const [name, gait] of [['walk', walk], ['run', run]] as const) {
    it(`${name}: planted feet do not slide or sink`, () => {
      const rig = keep(buildTroopRig('infantry', 'han'))
      const stride = HUMAN_GAITS[name].stride
      checkPlanted(rig, footOf(rig), (d) => gait(d), stride, `foot ${name}`)
    })
  }

  it('walk is planted for a hero and an officer too', () => {
    for (const rig of [keep(buildHeroRig('guan-yu', { mounted: false })!), keep(buildOfficer('zhang-liao', { mounted: false }))]) {
      checkPlanted(rig, footOf(rig), (d) => walk(d), HUMAN_GAITS.walk.stride, 'hero walk')
    }
  })

  for (const name of ['walk', 'trot', 'canter', 'gallop'] as const) {
    it(`horse ${name}: hooves do not slide or sink`, () => {
      const rig = keep(buildTroopRig('cavalry', 'han'))
      const m = rig.mount!.joints
      const fn = { walk: horseWalk, trot, canter, gallop }[name]
      checkPlanted(rig, [m.legFL, m.legFR, m.legBL, m.legBR], (d) => fn(d), HORSE_GAITS[name].stride, `horse ${name}`)
    })
  }
})

describe('footfall order', () => {
  /** The order in which the hooves strike the ground over one cycle, with ties grouped. */
  function strikes(fn: (d: number) => Clip, stride: number): string[][] {
    const rig = keep(buildTroopRig('cavalry', 'han'))
    const m = rig.mount!.joints
    const names = ['legFL', 'legFR', 'legBL', 'legBR'] as const
    const feet = names.map((n) => m[n])
    const steps = 400
    const down = names.map(() => false)
    const hits: { n: string; at: number }[] = []
    // start in mid-cycle so every foot has a lift-off to compare against
    for (let i = -50; i < steps; i++) {
      const u = i / steps
      const d = 20 + u * stride
      const c = contacts(rig, fn(d), d, feet)
      c.forEach((f, k) => {
        const on = f.y < 0.004
        if (on && !down[k] && i >= 0) hits.push({ n: names[k]!.replace('leg', ''), at: u })
        down[k] = on
      })
    }
    hits.sort((a, b) => a.at - b.at)
    const groups: string[][] = []
    let last = -1
    for (const h of hits) {
      if (last >= 0 && h.at - last < 0.07) groups[groups.length - 1]!.push(h.n)
      else groups.push([h.n])
      last = h.at
    }
    // the cycle wraps: simultaneous hooves on either side of the seam belong together
    if (groups.length > 1 && 1 - last + hits[0]!.at < 0.07) groups[0]!.push(...groups.pop()!)
    return groups.map((g) => g.sort())
  }
  /** Rotate so that the sequence starts at the hoof `first`. */
  const from = (groups: string[][], first: string): string[][] => {
    const i = groups.findIndex((g) => g.includes(first))
    return [...groups.slice(i), ...groups.slice(0, i)]
  }

  it('walk is the four-beat lateral sequence', () => {
    expect(from(strikes(horseWalk, HORSE_GAITS.walk.stride), 'BL')).toEqual([['BL'], ['FL'], ['BR'], ['FR']])
  })
  it('trot is two diagonal beats', () => {
    const g = from(strikes(trot, HORSE_GAITS.trot.stride), 'FL')
    expect(g).toEqual([['BR', 'FL'], ['BL', 'FR']])
  })
  it('canter is three beats with the diagonal pair together', () => {
    expect(from(strikes(canter, HORSE_GAITS.canter.stride), 'BL')).toEqual([['BL'], ['BR', 'FL'], ['FR']])
  })
  it('gallop is four beats, hind pair then fore pair', () => {
    expect(from(strikes(gallop, HORSE_GAITS.gallop.stride), 'BL')).toEqual([['BL'], ['BR'], ['FL'], ['FR']])
  })
  it('a foot walker alternates left and right', () => {
    const rig = keep(buildTroopRig('infantry', 'han'))
    const a = (d: number): number[] => {
      applyClip(rig, walk(d))
      return [rig.joints.legL.rotation.x, rig.joints.legR.rotation.x]
    }
    // the right leg runs half a cycle behind the left
    const half = HUMAN_GAITS.walk.stride / 2
    for (let d = 0; d < 1; d += 0.05) expect(a(d)[0]!).toBeCloseTo(a(d + half)[1]!, 6)
    expect(Math.abs(a(0.0)[0]! - a(0.0)[1]!)).toBeGreaterThan(0.1)
  })
})

describe('distance-driven phase', () => {
  it('the pose repeats every stride and depends on distance only', () => {
    for (const [fn, s] of [[walk, HUMAN_GAITS.walk.stride], [run, HUMAN_GAITS.run.stride], [gallop, HORSE_GAITS.gallop.stride], [trot, HORSE_GAITS.trot.stride]] as const) {
      expect(JSON.stringify(fn(1.234))).toBe(JSON.stringify(fn(1.234)))
      const a = fn(0.31)
      const b = fn(0.31 + s)
      expect(magnitude({ pose: {} })).toBe(0)
      for (const k of Object.keys(a.pose) as (keyof typeof a.pose)[]) {
        const ra = a.pose[k]!.r
        const pa = a.pose[k]!.p
        if (ra) for (let i = 0; i < 3; i++) expect(b.pose[k]!.r![i]).toBeCloseTo(ra[i]!, 6)
        if (pa) for (let i = 0; i < 3; i++) expect(b.pose[k]!.p![i]).toBeCloseTo(pa[i]!, 6)
      }
    }
  })
  it('strideOf maps gaits to strides', () => {
    expect(strideOf('walk', false)).toBe(HUMAN_GAITS.walk.stride)
    expect(strideOf('gallop', true)).toBe(HORSE_GAITS.gallop.stride)
    expect(strideOf('run', true)).toBe(HORSE_GAITS.gallop.stride)
  })
  it('gait selection follows speed and cross-fades', () => {
    expect(gaitBlend(false, 0.5)).toEqual({ a: 'walk', b: 'walk', w: 0 })
    expect(gaitBlend(false, 3).b).toBe('run')
    expect(gaitBlend(false, 3).w).toBe(0)
    const mid = gaitBlend(false, 1.6)
    expect(mid.a).toBe('walk')
    expect(mid.b).toBe('run')
    expect(mid.w).toBeGreaterThan(0.2)
    expect(mid.w).toBeLessThan(0.8)
    expect(gaitBlend(true, 1.5).b).toBe('trot')
    expect(gaitBlend(true, 3).a).toBe('canter')
    expect(gaitBlend(true, 7).a).toBe('gallop')
  })
  it('locomotion at a standstill is the idle pose', () => {
    const rig = keep(buildTroopRig('infantry', 'han'))
    const l = locomotion(rig, 3, 0, 1.2).pose
    const i = idle(1.2).pose
    for (const k of Object.keys(l) as (keyof typeof l)[]) {
      for (let n = 0; n < 3; n++) {
        expect(l[k]!.r?.[n] ?? 0).toBeCloseTo(i[k]?.r?.[n] ?? 0, 9)
        expect(l[k]!.p?.[n] ?? 0).toBeCloseTo(i[k]?.p?.[n] ?? 0, 9)
      }
    }
  })
})

describe('stepTurn, stagger, kneel', () => {
  it('stepTurn keeps the soles near the ground and alternates the feet', () => {
    const rig = keep(buildTroopRig('infantry', 'han'))
    const feet = footOf(rig)
    let low = 0
    let lifted = [false, false]
    for (let a = 0; a < 3.2; a += 0.04) {
      const c = contacts(rig, stepTurn(a), 0, feet)
      c.forEach((f, k) => {
        low = Math.min(low, f.y)
        if (f.y > 0.012) lifted[k] = true
      })
    }
    expect(low).toBeGreaterThan(-0.01)
    expect(lifted).toEqual([true, true])
    void lifted
  })

  it('stagger steps back with the near foot planted', () => {
    const rig = keep(buildTroopRig('rebel', 'yellow'))
    const feet = footOf(rig)
    const zs: number[] = []
    let low = 0
    for (let p = 0; p <= 1.0001; p += 0.05) {
      rig.group.position.set(0, 0, -staggerShift(p))
      applyClip(rig, stagger(p))
      rig.group.updateMatrixWorld(true)
      const f = feet.map(lowest)
      low = Math.min(low, f[0]!.y, f[1]!.y)
      zs.push(f[0]!.z)
    }
    expect(low).toBeGreaterThan(-0.012)
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(0.03)
  })

  it('kneel brings the hips down onto the sand and the knee touches it', () => {
    const rig = keep(buildTroopRig('archer', 'han'))
    applyClip(rig, kneel(1))
    rig.group.updateMatrixWorld(true)
    // legs and boots (a hem may brush the sand)
    const low = Math.min(lowest(rig.joints.legL).y, lowest(rig.joints.legR).y)
    expect(low).toBeGreaterThan(-0.012)
    expect(low).toBeLessThan(0.02)
    const hipsY = new Vector3()
    rig.joints.hips.getWorldPosition(hipsY)
    expect(hipsY.y).toBeLessThan(0.12)
    expect(magnitude(kneel(0))).toBe(0)
  })
})

describe('falls', () => {
  for (const [name, fn] of [['fallBack', fallBack], ['fallForward', fallForward]] as const) {
    it(`${name} ends lying flat on the sand`, () => {
      for (const rig of [keep(buildTroopRig('rebel', 'yellow')), keep(buildTroopRig('infantry', 'han'))]) {
        applyClip(rig, fn(1))
        rig.group.updateMatrixWorld(true)
        let low = Infinity
        let high = -Infinity
        rig.group.traverse((o) => {
          // judge the body: the weapon, the loose scarf tails and the ragged hem may lie in the sand
          if (!(o instanceof Mesh) || isUnder(o, rig.joints.weapon) || isUnder(o, rig.joints.offhand) || /scarf|cape|beard/.test(o.name) || (o.parent?.name ?? '') === 'hips') return
          const pos = o.geometry.getAttribute('position') as BufferAttribute
          for (let i = 0; i < pos.count; i += 3) {
            v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
            low = Math.min(low, v.y)
            high = Math.max(high, v.y)
          }
        })
        expect(low, `${name} sinks`).toBeGreaterThan(-0.045)
        expect(high, `${name} is flat`).toBeLessThan(0.5)
      }
    })
    it(`${name} is at rest at p=0`, () => {
      expect(magnitude(fn(0))).toBe(0)
    })
  }
})

function isUnder(o: Object3D, root: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p === root) return true
  return false
}
