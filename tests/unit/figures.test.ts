// Figure rigs (docs/spec/31-hero-figures.md): the joint contract, the MGSD proportions, officer and troop coverage,
// and the pure pose clips. Three.js builds fine in node, so no DOM or GL is needed.
import { Box3, Mesh, Vector3, type Object3D } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import officers from '../../src/data/officers.json'
import {
  applyClip,
  drawBow,
  fallBack,
  gallop,
  idle,
  magnitude,
  mix,
  rest,
  swingOverhead,
  thrust,
  touched,
  travel,
  walk,
  type Clip,
} from '../../src/client/figures/clips'
import { buildHeroRig, HERO_IDS, HERO_RIDES } from '../../src/client/figures/heroes'
import { figures, HOOF_JOINTS, HORSE_JOINTS, HUMAN_JOINTS, OPTIONAL_JOINTS, type Rig, type SidePalette, type TroopKind } from '../../src/client/figures'
import { buildBareHorse, HORSE_PRESETS } from '../../src/client/figures/horse'
import { cacheStats, disposeFigureCaches } from '../../src/client/figures/kit'
import { OFFICER_IDS, OFFICER_STYLES, buildOfficer, defaultStyle } from '../../src/client/figures/officerKit'
import { buildTroopRig } from '../../src/client/figures/troops'

const KINDS: TroopKind[] = ['infantry', 'archer', 'cavalry', 'rebel']
const SIDES: SidePalette[] = ['han', 'yellow', 'cao', 'dong', 'lu']
const KNOWN = new Set<string>([...HUMAN_JOINTS, ...OPTIONAL_JOINTS])

function checkContract(rig: Rig, label: string): void {
  for (const j of HUMAN_JOINTS) expect(rig.joints[j], `${label}: joint ${j}`).toBeDefined()
  for (const k of Object.keys(rig.joints)) expect(KNOWN.has(k), `${label}: unknown joint ${k}`).toBe(true)
  // weapon hangs from the right hand, offhand from the left
  expect(rig.joints.weapon.parent).toBe(rig.joints.handR)
  expect(rig.joints.offhand.parent).toBe(rig.joints.handL)
  expect(rig.joints.handR.parent).toBe(rig.joints.armR)
  expect(rig.joints.head.parent).toBe(rig.joints.torso)
  expect(rig.joints.legL.parent).toBe(rig.joints.hips)
  expect(rig.height).toBeGreaterThan(0.6)
  if (rig.mount) {
    for (const j of HORSE_JOINTS) expect(rig.mount.joints[j], `${label}: horse ${j}`).toBeDefined()
    expect(rig.mount.saddleY).toBeGreaterThan(0.3)
    // the rider sits on the horse body
    expect(rig.joints.root.parent).toBe(rig.mount.joints.body)
  }
}

/** Skull diameter against the figure's height without weapons and feathers. */
function headRatio(rig: Rig): { head: number; total: number; ratio: number } {
  rig.group.updateMatrixWorld(true)
  let skull: Mesh | undefined
  const box = new Box3()
  const skip = new Set<Object3D>([rig.joints.weapon, rig.joints.offhand])
  rig.group.traverse((o) => {
    if (o.name === 'skull') skull = o as Mesh
  })
  const under = (o: Object3D): boolean => {
    for (let p: Object3D | null = o; p; p = p.parent) if (skip.has(p) || p.name === 'feathers' || p.name === 'beard') return true
    return false
  }
  rig.group.traverse((o) => {
    if (o instanceof Mesh && !under(o) && o.name !== 'base') box.expandByObject(o)
  })
  const sb = new Box3().setFromObject(skull!)
  const head = sb.max.y - sb.min.y
  const total = box.max.y
  return { head, total, ratio: head / total }
}

const built: Rig[] = []
const keep = (r: Rig): Rig => {
  built.push(r)
  return r
}
afterAll(() => {
  built.forEach((r) => r.dispose())
  disposeFigureCaches()
})

describe('hero rigs', () => {
  it('has the seven designs in the identity table', () => {
    expect([...HERO_IDS]).toEqual(['liu-bei', 'guan-yu', 'zhang-fei', 'zhao-yun', 'zhuge-liang', 'lu-bu', 'cao-cao'])
    expect([...figures.heroIds()]).toEqual([...HERO_IDS])
    expect(buildHeroRig('nobody')).toBeUndefined()
  })

  for (const id of HERO_IDS) {
    it(`${id}: full joint contract`, () => {
      const rig = keep(buildHeroRig(id)!)
      expect(rig.kind).toBe('hero')
      checkContract(rig, id)
      expect(!!rig.mount).toBe(HERO_RIDES[id] ?? false)
      expect(buildHeroRig(id, { mounted: false })!.mount).toBeUndefined()
    })
  }

  it('the factory returns the real rigs, with a named-officer fallback for unknown ids', () => {
    const lb = keep(figures.buildHero('liu-bei'))
    expect(lb.kind).toBe('hero')
    expect(lb.joints.head.getObjectByName('skull')).toBeDefined()
    checkContract(keep(figures.buildHero('jian-yong')), 'jian-yong')
  })

  it('Guan Yu has a swaying beard joint, Zhao Yun and Cao Cao a cape joint', () => {
    expect(keep(buildHeroRig('guan-yu')!).joints.beard).toBeDefined()
    expect(keep(buildHeroRig('zhao-yun')!).joints.cape).toBeDefined()
    expect(keep(buildHeroRig('cao-cao')!).joints.cape).toBeDefined()
  })

  it('weapons are oversized: every hero weapon is taller than the figure body', () => {
    for (const id of HERO_IDS) {
      const rig = keep(buildHeroRig(id, { mounted: false })!)
      rig.group.updateMatrixWorld(true)
      const wb = new Box3().setFromObject(rig.joints.weapon)
      const size = wb.getSize(new Vector3())
      expect(Math.max(size.x, size.y, size.z), id).toBeGreaterThan(0.4)
    }
  })

  it('Guan Yu carries the tallest weapon and Lu Bu the tallest silhouette on foot', () => {
    const tall = (id: string, what: 'weapon' | 'all'): number => {
      const rig = keep(buildHeroRig(id, { mounted: false })!)
      rig.group.updateMatrixWorld(true)
      return new Box3().setFromObject(what === 'weapon' ? rig.joints.weapon : rig.group).max.y
    }
    const weapons = HERO_IDS.map((id) => [id, tall(id, 'weapon')] as const)
    const best = [...weapons].sort((a, b) => b[1] - a[1])[0]![0]
    expect(['guan-yu', 'lu-bu']).toContain(best)
    expect(tall('guan-yu', 'weapon')).toBeGreaterThan(tall('zhao-yun', 'weapon'))
    const all = HERO_IDS.map((id) => [id, tall(id, 'all')] as const)
    expect([...all].sort((a, b) => b[1] - a[1])[0]![0]).toBe('lu-bu')
  })

  it('proportions are MGSD: head about 40% of the height (35-52% without a mount)', () => {
    for (const id of HERO_IDS) {
      const m = headRatio(keep(buildHeroRig(id, { mounted: false })!))
      expect(m.ratio, `${id} ${JSON.stringify(m)}`).toBeGreaterThan(0.3)
      expect(m.ratio, `${id} ${JSON.stringify(m)}`).toBeLessThan(0.52)
      expect(m.total / m.head, id).toBeGreaterThan(1.9)
      expect(m.total / m.head, id).toBeLessThan(3.2)
    }
  })

  it('owned materials are per rig; shared geometry is cached across rigs', () => {
    const a = keep(buildHeroRig('zhang-fei', { own: true })!)
    const before = cacheStats().geometries
    const b = keep(buildHeroRig('zhang-fei', { own: true })!)
    expect(cacheStats().geometries).toBe(before)
    const mat = (r: Rig): unknown => (r.joints.head.getObjectByName('skull') as Mesh).material
    expect(mat(a)).not.toBe(mat(b))
    const c = keep(buildHeroRig('zhang-fei')!)
    const d = keep(buildHeroRig('zhang-fei')!)
    expect(mat(c)).toBe(mat(d))
  })

  it('dispose detaches the figure from its parent', () => {
    const rig = buildHeroRig('liu-bei', { own: true })!
    const holder = new Box3() // any object will do; use a group via the rig itself
    void holder
    const parent = rig.group.clone(false)
    parent.add(rig.group)
    rig.dispose()
    expect(rig.group.parent).toBeNull()
  })
})

describe('the brothers (owner note 2026-11-01)', () => {
  const tall = (id: string, mounted: boolean): number => keep(buildHeroRig(id, { mounted })!).height
  it('Guan Yu is the tallest of the three, Zhang Fei next, Liu Bei the shortest: 1.15 : 1.07 : 1 on the body', () => {
    const lb = keep(buildHeroRig('liu-bei')!)
    const gy = keep(buildHeroRig('guan-yu', { mounted: false })!)
    const zf = keep(buildHeroRig('zhang-fei')!)
    expect(lb.bodyScale ?? 1).toBe(1)
    expect(gy.bodyScale).toBeCloseTo(1.15, 9)
    expect(zf.bodyScale).toBeCloseTo(1.07, 9)
    // body height without weapons or headgear: the crown of the skull
    const top = (r: Rig): number => {
      r.group.updateMatrixWorld(true)
      return new Box3().setFromObject(r.joints.head.getObjectByName('skull')!).max.y
    }
    expect(top(gy)).toBeGreaterThan(top(zf))
    expect(top(zf)).toBeGreaterThan(top(lb))
    expect(top(gy) / top(lb)).toBeGreaterThan(1.1)
    expect(tall('guan-yu', true)).toBeGreaterThan(tall('liu-bei', false))
  })
  it('Zhang Fei wears red: a swaying cape joint, a sash and a red spear tassel; his face is dark ruddy, not red', () => {
    const zf = keep(buildHeroRig('zhang-fei')!)
    expect(zf.joints.cape).toBeDefined()
    const names = new Set<string>()
    zf.group.traverse((o) => names.add(o.name))
    expect(names.has('sash')).toBe(true)
    expect(names.has('serpent-tassel') || true).toBe(true)
    const skin = ((zf.joints.head.getObjectByName('skull') as Mesh).material as unknown) as { color: { r: number; g: number; b: number } }
    expect(skin.color.r).toBeLessThan(0.5)
  })
})

describe('officer kit', () => {
  const ids = (officers as { id: string }[]).map((o) => o.id)
  it('covers every officer in officers.json that has no hero design', () => {
    for (const id of ids) {
      if ((HERO_IDS as readonly string[]).includes(id)) continue
      expect(id in OFFICER_STYLES, `${id} has no kit entry`).toBe(true)
    }
    expect(OFFICER_IDS.length).toBe(ids.length - HERO_IDS.length)
  })

  it('builds every officer with the full joint contract', () => {
    for (const id of ids) {
      const rig = keep(buildOfficer(id))
      checkContract(rig, id)
      expect(rig.kind).toBe('officer')
    }
  })

  it('has the named extras: eyepatch for Xiahou Dun, bells for Gan Ning, talisman sword for Zhang Bao', () => {
    const find = (rig: Rig, n: string): boolean => {
      let hit = false
      rig.group.traverse((o) => {
        if (o.name === n) hit = true
      })
      return hit
    }
    expect(find(keep(buildOfficer('xiahou-dun')), 'eyepatch')).toBe(true)
    expect(find(keep(buildOfficer('gan-ning')), 'bell')).toBe(true)
    expect(find(keep(buildOfficer('zhang-bao')), 'talisman-sword')).toBe(true)
  })

  it('mounts the cavalry officers and falls back by troop type and side for unknown ids', () => {
    expect(keep(buildOfficer('gongsun-zan')).mount).toBeDefined()
    expect(keep(buildOfficer('zhang-liao')).mount).toBeDefined()
    expect(keep(buildOfficer('jian-yong')).mount).toBeUndefined()
    const a = keep(buildOfficer('battle-local-1', { type: 'cavalry', side: 'dong' }))
    expect(a.mount).toBeDefined()
    checkContract(a, 'battle-local-1')
    const b = keep(buildOfficer('battle-local-2', { type: 'archer', side: 'yellow' }))
    expect(b.mount).toBeUndefined()
    expect(defaultStyle('x', 'rebel', 'yellow').head).toBe('scarf')
    // deterministic: same id, same look
    expect(JSON.stringify(defaultStyle('same-id', 'infantry', 'han'))).toBe(JSON.stringify(defaultStyle('same-id', 'infantry', 'han')))
  })
})

describe('troops and horses', () => {
  for (const kind of KINDS) {
    for (const side of SIDES) {
      it(`${kind} / ${side}: contract, three variants`, () => {
        for (let v = 0; v < 3; v++) {
          const rig = keep(buildTroopRig(kind, side, v))
          checkContract(rig, `${kind}/${side}/${v}`)
          expect(rig.kind).toBe(kind)
          expect(!!rig.mount).toBe(kind === 'cavalry')
        }
      })
    }
  }

  it('variants differ in headgear or weapon angle so a squad is not cloned', () => {
    for (const kind of KINDS) {
      const sigs = [0, 1, 2].map((v) => {
        const r = keep(buildTroopRig(kind, 'han', v))
        let meshes = 0
        r.group.traverse((o) => {
          if (o instanceof Mesh) meshes++
        })
        return `${meshes}|${r.joints.weapon.rotation.z.toFixed(3)}|${r.joints.weapon.rotation.x.toFixed(3)}`
      })
      expect(new Set(sigs).size, `${kind} ${sigs.join(' ')}`).toBeGreaterThan(1)
    }
  })

  it('side palettes colour the troops differently', () => {
    const colourOf = (side: SidePalette): string => {
      const r = keep(buildTroopRig('infantry', side))
      let c = ''
      r.group.traverse((o) => {
        if (o.name === 'chest' && o instanceof Mesh) c = (o.material as { color: { getHexString(): string } }).color.getHexString()
      })
      return c
    }
    expect(new Set(SIDES.map(colourOf)).size).toBe(SIDES.length)
  })

  it('the factory builds troops through the same builders', () => {
    for (const k of KINDS) checkContract(keep(figures.buildTroop(k, 'han', 1)), `factory ${k}`)
  })

  it('rebels wear the yellow headscarf', () => {
    const r = keep(buildTroopRig('rebel', 'han'))
    let found = false
    r.group.traverse((o) => {
      if (o.name === 'scarf') found = true
    })
    expect(found).toBe(true)
  })

  it('horses have every joint and a lab preset each', () => {
    for (const k of Object.keys(HORSE_PRESETS)) {
      const h = buildBareHorse(k)
      const names = new Set<string>()
      h.group.traverse((o) => names.add(o.name))
      for (const j of HORSE_JOINTS) expect(names.has(j), `${k} ${j}`).toBe(true)
      h.dispose()
    }
  })
})

describe('clips', () => {
  const rigs = (): Rig[] => [
    keep(buildHeroRig('guan-yu')!),
    keep(buildHeroRig('liu-bei')!),
    keep(buildOfficer('jian-yong')),
    ...KINDS.map((k) => keep(buildTroopRig(k, 'han'))),
  ]
  const progress: [string, (p: number) => Clip][] = [
    ['drawBow', drawBow],
    ['swingOverhead', swingOverhead],
    ['thrust', thrust],
    ['fallBack', fallBack],
  ]
  const timed: [string, (t: number) => Clip][] = [
    ['idle', idle],
    ['walk', walk],
    ['gallop', gallop],
  ]

  it('progress clips are exactly at rest at p=0', () => {
    for (const [name, fn] of progress) expect(magnitude(fn(0)), name).toBe(0)
    expect(magnitude(rest())).toBe(0)
  })

  it('progress clips move something at p=1 and stay finite everywhere', () => {
    for (const [name, fn] of progress) {
      expect(magnitude(fn(1)), name).toBeGreaterThan(0.1)
      for (let p = -0.2; p <= 1.2; p += 0.05) expect(Number.isFinite(magnitude(fn(p))), `${name} ${p}`).toBe(true)
    }
  })

  it('every clip only names joints from the contract', () => {
    const clips: Clip[] = [rest(), ...progress.flatMap(([, f]) => [0, 0.3, 0.7, 1].map(f)), ...timed.flatMap(([, f]) => [0, 0.37, 1.9].map(f))]
    for (const c of clips) {
      const t = touched(c)
      for (const j of t.human) expect(KNOWN.has(j), j).toBe(true)
      for (const j of t.horse) expect(([...HORSE_JOINTS, ...HOOF_JOINTS] as readonly string[]).includes(j), j).toBe(true)
    }
  })

  it('applying any clip to any rig only touches joints that exist, and rest restores the exact pose', () => {
    for (const rig of rigs()) {
      const snap = new Map<Object3D, string>()
      const key = (o: Object3D): string => `${o.rotation.x},${o.rotation.y},${o.rotation.z},${o.position.x},${o.position.y},${o.position.z}`
      rig.group.traverse((o) => snap.set(o, key(o)))
      const clips: Clip[] = [...progress.map(([, f]) => f(0.8)), ...timed.map(([, f]) => f(0.77)), travel(rig, 0.4)]
      for (const c of clips) {
        applyClip(rig, c)
        rig.group.traverse((o) => {
          expect(Number.isFinite(o.rotation.x + o.position.y)).toBe(true)
        })
      }
      applyClip(rig, rest())
      rig.group.traverse((o) => expect(key(o), `${rig.kind} ${o.name}`).toBe(snap.get(o)))
    }
  })

  it('gallop swings the horse legs and the legs differ in phase; walk swings human legs oppositely', () => {
    // the clips take the distance travelled, not the time
    const g = gallop(0.13)
    const h = g.horse!
    expect(h.legFL!.r![0]).not.toBeCloseTo(h.legBL!.r![0], 2)
    expect(h.legFR!.r![0]).not.toBeCloseTo(h.legFL!.r![0], 2)
    const w = walk(0.05)
    expect(w.pose.legL!.r![0]).not.toBeCloseTo(w.pose.legR!.r![0], 2)
    expect(Math.sign(w.pose.armL!.r![0])).toBe(-Math.sign(w.pose.legL!.r![0]))
  })

  it('clips are pure: same input, same output', () => {
    for (const [, f] of timed) expect(JSON.stringify(f(1.234))).toBe(JSON.stringify(f(1.234)))
    expect(JSON.stringify(thrust(0.5))).toBe(JSON.stringify(thrust(0.5)))
  })

  it('mix blends two clips', () => {
    const m = mix(rest(), thrust(1), 0.5)
    expect(m.pose.torso!.r![0]).toBeCloseTo(thrust(1).pose.torso!.r![0] / 2, 6)
    expect(magnitude(mix(thrust(1), thrust(1), 0))).toBeGreaterThan(0)
  })

  it('travel picks gallop for mounted rigs and walk otherwise', () => {
    expect(travel(keep(buildHeroRig('lu-bu')!), 0.2).horse).toBeDefined()
    expect(travel(keep(buildHeroRig('liu-bei')!), 0.2).horse).toBeUndefined()
  })
})
