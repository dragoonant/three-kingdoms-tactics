// Cut-in warm-up and reuse (docs/spec/51 "Performance: warm-up and reuse"): the battle's warm pool of crowd bakes, the GPU
// sweep that releases a world's own geometry and textures but never the shared caches, program pinning, and the slot registry
// that hands a prebuilt world to the player.
import { BoxGeometry, DataTexture, Group, InstancedMesh, Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { afterAll, describe, expect, it } from 'vitest'
import { createBattle, legalActions, step } from '../../src/engine'
import { greedyAction } from '../../src/ai/greedy'
import { acquireBake, bakeStats, pinBakes, pinnedBakes, releaseBake, unpinBakes } from '../../src/client/cutins/crowd/bake'
import { disposeCrowds } from '../../src/client/cutins/crowd'
import { collect, keep, pinPrograms, release } from '../../src/client/cutins/gpu'
import { CutinPrep, MAX_NEXT, planForAction, planKey, warmItems } from '../../src/client/cutins/prep'
import { samplePlan } from '../../src/client/cutins/scenes'
import { useCutinSettings } from '../../src/client/cutins/settings'
import { disposeFigureCaches } from '../../src/client/figures/kit'
import { figures } from '../../src/client/figures'

afterAll(() => {
  disposeCrowds()
  disposeFigureCaches()
})

const disposed = (x: { addEventListener: (t: 'dispose', f: () => void) => void }): (() => boolean) => {
  let d = false
  x.addEventListener('dispose', () => (d = true))
  return () => d
}

describe('warm pool: crowd bakes', () => {
  it('a bake acquired while the battle pins stays built after every crowd lets go, until unpinBakes', () => {
    disposeCrowds()
    pinBakes(true)
    const a = acquireBake('infantry', 'han', 0, 'lo')
    const g = disposed(a.parts[0]!.geometry)
    releaseBake(a)
    expect(bakeStats().sets).toBe(1)
    expect(pinnedBakes()).toBe(1)
    // the next scene gets the very same set back: no bake, no upload
    const b = acquireBake('infantry', 'han', 0, 'lo')
    expect(b).toBe(a)
    releaseBake(b)
    expect(g()).toBe(false)
    unpinBakes()
    expect(bakeStats().sets).toBe(0)
    expect(g()).toBe(true)
  })
  it('without pinning a bake is freed with its last crowd (the old behaviour, outside a battle)', () => {
    disposeCrowds()
    const a = acquireBake('archer', 'yellow', 1, 'lo')
    releaseBake(a)
    expect(bakeStats().sets).toBe(0)
  })
  it('pins each bake once, however often it is asked for', () => {
    disposeCrowds()
    pinBakes(true)
    const a = acquireBake('cavalry', 'cao', 0, 'lo')
    const b = acquireBake('cavalry', 'cao', 0, 'lo')
    expect(a.refs).toBe(3)
    releaseBake(a)
    releaseBake(b)
    expect(a.refs).toBe(1)
    unpinBakes()
    expect(bakeStats().sets).toBe(0)
  })
})

describe('GPU sweep', () => {
  it('releases a world’s own geometry, textures and instance buffers, and never a kept (shared) one', () => {
    const root = new Group()
    const own = new BoxGeometry()
    const shared = keep(new SphereGeometry())
    const tex = new DataTexture(new Uint8Array(4), 1, 1)
    const keptTex = keep(new DataTexture(new Uint8Array(4), 1, 1))
    root.add(new Mesh(own, new MeshStandardMaterial({ map: tex })))
    root.add(new Mesh(shared, new MeshStandardMaterial({ map: keptTex, emissiveMap: tex })))
    const inst = new InstancedMesh(shared, new MeshStandardMaterial(), 4)
    root.add(inst)
    const d = { own: disposed(own), shared: disposed(shared), tex: disposed(tex), keptTex: disposed(keptTex), inst: disposed(inst) }
    const s = collect(root)
    expect(s.geometries).toEqual([own])
    expect(s.textures).toEqual([tex])
    release(s)
    expect(d.own()).toBe(true)
    expect(d.tex()).toBe(true)
    expect(d.inst()).toBe(true)
    expect(d.shared()).toBe(false)
    expect(d.keptTex()).toBe(false)
  })
  it('the figure kit’s cached geometry is kept: a cut-in never frees what the board also draws', () => {
    const rig = figures.buildTroop('infantry', 'han', 0)
    const s = collect(rig.group)
    expect(s.geometries).toEqual([])
    rig.dispose()
  })
  it('pins every program once, so disposing a material never deletes a program a later cut-in needs', () => {
    const progs = [{ usedTimes: 1 }, { usedTimes: 2 }]
    const gl = { info: { programs: progs } } as unknown as Parameters<typeof pinPrograms>[0]
    expect(pinPrograms(gl)).toBe(2)
    pinPrograms(gl)
    expect(progs.map((p) => p.usedTimes)).toEqual([2, 3])
    progs.push({ usedTimes: 1 })
    pinPrograms(gl)
    expect(progs.map((p) => p.usedTimes)).toEqual([2, 3, 2])
  })
})

describe('slots: prebuilt worlds', () => {
  const link = samplePlan('S-melee')
  it('the player takes a prebuilt world by its plan (the same scene object), without building one', async () => {
    const p = new CutinPrep()
    p.attach(true)
    const done = p.want([link])
    // the view mounts and compiles it
    for (let i = 0; i < 50 && !p.getSnapshot().length; i++) await new Promise((r) => setTimeout(r, 10))
    const slot = p.getSnapshot()[0]!
    expect(slot.kind).toBe('next')
    p.mounted(slot.key)
    expect(p.isReady(link)).toBe(false)
    p.ready(slot.key)
    await done
    expect(p.isReady(link)).toBe(true)
    const got = p.live({ ...link })
    expect(got.prebuilt).toBe(true)
    expect(got.scene).toBe(slot.scene)
    expect(p.stats).toMatchObject({ prebuilt: 1, built: 0 })
    p.endSequence()
    expect(p.getSnapshot()).toEqual([])
  })
  it('a link nobody prebuilt is built at start and still gets a slot', () => {
    const p = new CutinPrep()
    p.attach(true)
    const got = p.live(link)
    expect(got.prebuilt).toBe(false)
    expect(p.getSnapshot().map((s) => s.kind)).toEqual(['live'])
    p.mounted(got.key)
    expect(p.getSnapshot()[0]!.ready).toBe(true)
  })
  it('a new prebuild replaces the old one and keeps at most MAX_NEXT worlds', async () => {
    const p = new CutinPrep()
    p.attach(true)
    const links = Array.from({ length: MAX_NEXT + 2 }, (_, i) => ({ ...samplePlan('C'), link: i, links: MAX_NEXT + 2 }))
    // answer for the view: every slot mounts and compiles at once
    p.subscribe(() => {
      for (const s of p.getSnapshot()) {
        if (!s.mounted) p.mounted(s.key)
        else if (!s.ready) p.ready(s.key)
      }
    })
    await p.want(links)
    expect(p.getSnapshot().length).toBe(MAX_NEXT)
    await p.want([link])
    expect(p.getSnapshot().map((s) => s.key)).toEqual([planKey(link)])
  })
  it('with no view attached (cut-ins off) a request is a no-op', async () => {
    const p = new CutinPrep()
    await p.want([link])
    expect(p.getSnapshot()).toEqual([])
  })
})

describe('what to warm and what to prebuild', () => {
  const state = createBattle('daxing-hill', 5)
  it('warms one sample world per scene the battle can play, with its own officers, then a gallery of every figure and troop', () => {
    const items = warmItems(state)
    const links = items.flatMap((i) => ('link' in i ? [i.link] : []))
    const gallery = items.flatMap((i) => ('gallery' in i ? [i.gallery] : []))
    expect(gallery.length).toBe(1)
    // every scene appears once, and every caster is a unit of this battle
    expect(new Set(links.map((l) => l.scene)).size).toBe(links.length)
    const officers = new Set([...state.units, ...state.reinforcements.flatMap((r) => r.units)].map((u) => u.officer))
    for (const l of links) expect(officers.has(l.caster.officer)).toBe(true)
    // the short attack of every troop type on the field
    for (const t of new Set(state.units.map((u) => u.type))) expect(links.some((l) => l.scene.startsWith('S-') && l.caster.type === t)).toBe(true)
    // every officer of the battle is in the gallery, and every palette's foot troops
    for (const o of officers) expect(gallery[0]!.actors.some((a) => a.actor.officer === o)).toBe(true)
    const palettes = new Set(gallery[0]!.crowds.map((c) => c.palette))
    expect(palettes.size).toBeGreaterThanOrEqual(2)
  })
  it('the speculative plan of an action is a pure function of (state, action): the prebuild key matches the real one', () => {
    useCutinSettings.setState({ battleScenes: 'all', enemyScenes: 'same' })
    let st = state
    let checked = 0
    for (let n = 0; n < 400 && checked < 3 && !st.result; n++) {
      for (const a of legalActions(st)) {
        if (a.type !== 'attack' && a.type !== 'stratagem') continue
        const p1 = planForAction(st, a, 'full', 'han')
        const p2 = planForAction(st, a, 'full', 'han')
        if (!p1) continue
        expect(p2!.links.map(planKey)).toEqual(p1.links.map(planKey))
        checked++
        break
      }
      const r = step(st, greedyAction(st))
      const next = r.ok ? r : step(st, { type: 'endPhase' })
      if (!next.ok) break
      st = next.state
    }
    expect(checked).toBe(3)
  })
})
