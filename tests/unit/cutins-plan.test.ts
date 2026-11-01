// Battle cut-ins in real battles (docs/spec/51 v0.3): the pure event -> scene mapping, the falls formula, the settings and
// speed rules, chain timing, and that every scene built from a plan is well formed, deterministic and carries the event's numbers.
import { describe, expect, it } from 'vitest'
import { GAME_DATA } from '../../src/data'
import { legalActions, type GameEvent } from '../../src/engine'
import { PLAYER_SIDE } from '../../src/client/store/orders'
import {
  DEFAULT_CUTIN_SETTINGS,
  QUICK_RATE,
  allowedBy,
  combatRange,
  fallsFor,
  kindOf,
  planCutins,
  sceneForAttack,
  sceneForStratagem,
  sequenceTiming,
  trailFor,
  type CutinSettings,
  type LinkPlan,
  type PlanOptions,
  type SceneId,
} from '../../src/client/cutins/plan'
import { CHAIN_COMPRESS, INTERSTITIAL, SCENE_INFO } from '../../src/client/cutins/sceneInfo'
import { SCENE_IDS, buildScene, samplePlan } from '../../src/client/cutins/scenes'
import { groundKind, pickFallers, trackAt, windHeading, type Track } from '../../src/client/cutins/scenes/act'
import { formationSlots } from '../../src/client/cutins/scenes/formation'
import { evaluate, validateScene } from '../../src/client/cutins/timeline'
import { act, ev, mk, patch, strat, u } from './helpers'

const FULL: PlanOptions = { settings: DEFAULT_CUTIN_SETTINGS, speed: 'full', playerSide: PLAYER_SIDE }
const plan = (events: GameEvent[], s: ReturnType<typeof mk>, o: Partial<PlanOptions> = {}) => planCutins(events, s, { ...FULL, ...o })

/** A small field: han attacker a1 at (5,5), yellow e at (6,5) facing east (so a1 is behind it), plenty of Qi. */
function world(over: { a?: Record<string, unknown>; e?: Record<string, unknown> } = {}, extra: Parameters<typeof mk>[0]['units'] = [], map?: string[]) {
  return mk({
    ...(map ? { map } : {}),
    units: [
      { id: 'a1', side: 'han', x: 5, y: 5, troops: 3000, qi: 6, war: 90, int: 90, strats: ['fire-attack', 'twin-blades', 'thunder-roar', 'sow-discord', 'arrow-rain', 'rally', 'borrow-the-wind', 'thundering-charge'], ...over.a },
      { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'E', troops: 2400, ...over.e },
      ...extra,
    ],
  })
}

describe('falls formula (docs/spec/51: max(1, round(damage / troops before x front-rank count)))', () => {
  it('scales with the share of the unit hit, at least one when anything was dealt', () => {
    expect(fallsFor(240, 2400, 7, false)).toBe(1) // 0.7 rounds to 1
    expect(fallsFor(1, 2400, 7, false)).toBe(1) // at least 1
    expect(fallsFor(1200, 2400, 7, false)).toBe(4) // 3.5 -> 4
    expect(fallsFor(600, 2400, 5, false)).toBe(1) // 1.25 -> 1
    expect(fallsFor(1800, 2400, 5, false)).toBe(4) // 3.75 -> 4
  })
  it('is capped at the front rank and is everyone when the unit was routed', () => {
    expect(fallsFor(99999, 2400, 7, false)).toBe(7)
    expect(fallsFor(10, 2400, 7, true)).toBe(7)
    expect(fallsFor(10, 2400, 5, true)).toBe(5)
  })
  it('no damage, no falls (a Ruse that only confuses)', () => {
    expect(fallsFor(0, 2400, 4, false)).toBe(0)
    expect(fallsFor(0, 2400, 0, false)).toBe(0)
  })
  it('guards a zero troop count', () => {
    expect(fallsFor(50, 0, 7, false)).toBe(7)
  })
})

describe('scene by stratagem tag (docs/spec/51 table)', () => {
  const s = world()
  const cases: [string, SceneId | null][] = [
    ['fire-attack', 'A'],
    ['torch-raid', 'A'],
    ['kindling', 'A'],
    ['valley-blaze', 'A'],
    ['fire-ships', 'A'],
    ['arrow-rain', 'Ap'],
    ['massed-arrows', 'Ap'],
    ['thundering-charge', 'B'],
    ['lone-rider', 'B'],
    ['twin-blades', 'C'],
    ['crescent-sweep', 'C'],
    ['serpent-thrust', 'C'],
    ['mob-rush', 'C'],
    ['green-dragon-cleave', 'C'],
    ['thunder-roar', 'D'],
    ['rebel-war-cry', 'D'],
    ['bridge-roar', 'D'],
    ['sow-discord', 'R'],
    ['yellow-sky-hex', 'R'],
    ['envoys-tongue', 'R'],
    ['call-the-storm', 'W'],
    ['borrow-the-wind', 'W'],
    ['rally', null],
    ['benevolent-banner', null],
    ['eight-trigrams', null],
    ['supply-train', null],
  ]
  it.each(cases)('%s plays %s', (id, scene) => {
    expect(sceneForStratagem(s, id)).toBe(scene)
  })
  it('every stratagem in the data table is covered by the table above or maps to a scene', () => {
    const covered = new Set(cases.map((c) => c[0]))
    for (const id of Object.keys(GAME_DATA.stratagems)) {
      if (!covered.has(id)) expect(sceneForStratagem(s, id), id).not.toBeUndefined()
    }
  })
  it('unknown stratagems have no scene', () => {
    expect(sceneForStratagem(s, 'nope')).toBeNull()
  })
  it('weapon trails: twin blades cross, glaives sweep, spears pierce', () => {
    expect(trailFor('twin-blades')).toBe('x')
    expect(trailFor('crescent-sweep')).toBe('arc')
    expect(trailFor('green-dragon-cleave')).toBe('arc')
    expect(trailFor('serpent-thrust')).toBe('line')
    expect(trailFor('mob-rush')).toBe('line')
  })
  it('normal attacks: archers (ranged) shoot, riders ride, everyone else fights', () => {
    expect(sceneForAttack('archers', true)).toBe('S-archer')
    expect(sceneForAttack('cavalry', false)).toBe('S-cavalry')
    expect(sceneForAttack('infantry', false)).toBe('S-melee')
    expect(sceneForAttack('archers', false)).toBe('S-melee')
  })
})

describe('plans from real engine events', () => {
  it('a normal attack: short melee scene with the engine numbers, no stratagem name', () => {
    const s = world()
    const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
    const [range] = plan(r.events, s)
    expect(range).toBeDefined()
    const p = range!.plan
    expect(p.full).toBe(false)
    expect(p.links).toHaveLength(1)
    const l = p.links[0]!
    expect(l.scene).toBe('S-melee')
    const dmg = ev(r.events, 'damaged').find((e) => e.source === 'attack')!
    expect(l.damage).toBe(dmg.amount)
    expect(l.falls).toBe(fallsFor(dmg.amount, dmg.troopsBefore, SCENE_INFO['S-melee'].front, false))
    expect(l.caster.unit).toBe('a1')
    expect(l.defender!.unit).toBe('e')
    expect(l.stratName).toBe('')
    expect(l.arc).toBe(ev(r.events, 'attacked')[0]!.arc)
    expect(l.terrain).toBe('plain')
  })

  it('the range covers the attack and its counter but not the end of the phase', () => {
    const s = world({}, [{ id: 'h2', side: 'han', x: 0, y: 11, troops: 100 }])
    const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
    const cr = combatRange(r.events)!
    expect(cr.from).toBe(0)
    for (let i = 0; i < cr.to; i++) expect(['roundStarted', 'phaseStarted', 'battleEnded']).not.toContain(r.events[i]!.kind)
  })

  it('a counter-attack adds the counter damage and its falls to a melee plan', () => {
    let found: LinkPlan | null = null
    for (let seed = 1; seed < 40 && !found; seed++) {
      const s = mk({
        seed,
        units: [
          { id: 'a1', side: 'han', x: 5, y: 5, troops: 3000, war: 70 },
          { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 2400, war: 90 },
        ],
      })
      const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
      if (ev(r.events, 'countered').length) {
        const p = plan(r.events, s)[0]!.plan.links[0]!
        const c = ev(r.events, 'damaged').find((e) => e.source === 'counter')!
        expect(p.counter).not.toBeNull()
        expect(p.counter!.damage).toBe(c.amount)
        expect(p.counter!.falls).toBe(fallsFor(c.amount, c.troopsBefore, SCENE_INFO['S-melee'].front, false))
        found = p
      }
    }
    expect(found).not.toBeNull()
  })

  it('no counter event, no counter in the plan', () => {
    const s = world({ e: { facing: 'E' } })
    const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
    if (!ev(r.events, 'countered').length) expect(plan(r.events, s)[0]!.plan.links[0]!.counter).toBeNull()
  })

  it.each([
    ['front', { x: 7, y: 5 }],
    ['side', { x: 6, y: 4 }],
    ['rear', { x: 5, y: 5 }],
  ] as const)('the %s arc of the engine event reaches the plan (Flank!/Rear! call-outs)', (arc, at) => {
    const s = mk({
      units: [
        { id: 'a1', side: 'han', x: at.x, y: at.y, troops: 3000 },
        { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'E', troops: 2400 },
      ],
    })
    const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(ev(r.events, 'attacked')[0]!.arc).toBe(arc)
    expect(l.arc).toBe(arc)
    const sc = buildScene(l)
    const call = sc.overlays.callout.text
    expect(call).toBe(arc === 'side' ? 'Flank!' : arc === 'rear' ? 'Rear!' : '')
  })

  it('cavalry riders get the cavalry scene, archers at range the archer scene', () => {
    const c = mk({
      units: [
        { id: 'a1', side: 'han', type: 'cavalry', x: 5, y: 5, troops: 3000 },
        { id: 'e', side: 'yellow', x: 6, y: 5, troops: 2400 },
      ],
    })
    expect(plan(act(c, { type: 'attack', unit: 'a1', target: 'e' }).events, c)[0]!.plan.links[0]!.scene).toBe('S-cavalry')
    const a = mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, troops: 3000 },
        { id: 'e', side: 'yellow', x: 6, y: 5, troops: 2400 },
      ],
    })
    const r = act(a, { type: 'attack', unit: 'a1', target: 'e' })
    const l = plan(r.events, a)[0]!.plan.links[0]!
    expect(l.scene).toBe('S-archer')
    expect(l.counter).toBeNull()
    expect(l.caster.kind).toBe('archer')
  })

  it('a routed target falls entirely and says so', () => {
    const s = world({ e: { troops: 40 } })
    const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
    expect(ev(r.events, 'routed').some((e) => e.unit === 'e')).toBe(true)
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.routed).toBe(true)
    expect(l.falls).toBe(SCENE_INFO['S-melee'].front)
  })

  it('terrain under the defender comes from the board: village, forest, farm, shallows, deck', () => {
    const map = ['............', '............', '............', '............', '............', '.....f.v.T..', '............', '............', '............', '............', '............', '............']
    for (const [x, terrain] of [[5, 'farm'], [7, 'village'], [9, 'forest']] as const) {
      const s = mk({
        map,
        units: [
          { id: 'a1', side: 'han', x: x - 1, y: 5, troops: 3000 },
          { id: 'e', side: 'yellow', x, y: 5, troops: 2400 },
        ],
      })
      const r = act(s, { type: 'attack', unit: 'a1', target: 'e' })
      expect(plan(r.events, s)[0]!.plan.links[0]!.terrain).toBe(terrain)
    }
  })

  it('a stratagem: full scene by tag, officer name, the stratagem name and the damage of the event', () => {
    const s = world()
    const r = act(s, strat('a1', 'twin-blades', 6, 5))
    const [range] = plan(r.events, s)
    const p = range!.plan
    expect(p.full).toBe(true)
    const l = p.links[0]!
    expect(l.scene).toBe('C')
    expect(l.stratName).toBe('Twin Blades')
    expect(l.trail).toBe('x')
    expect(l.caster.name).toBe('a1')
    expect(l.damage).toBe(ev(r.events, 'damaged').filter((e) => e.source === 'stratagem').reduce((a, e) => a + e.amount, 0))
    expect(buildScene(l).overlays.damage.text).toBe(l.damage > 0 ? `−${l.damage.toLocaleString('en-US')}` : '')
  })

  it('fire: ignited comes from the ignited event (a Fire Attack on plain ground lights it)', () => {
    const s = world()
    const r = act(s, strat('a1', 'fire-attack', 6, 5))
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.scene).toBe('A')
    expect(l.ignited).toBe(ev(r.events, 'ignited').length > 0)
  })

  it('Thunder Roar: the shout scene lists the confused', () => {
    const s = world()
    const r = act(s, strat('a1', 'thunder-roar', 5, 5))
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.scene).toBe('D')
    expect(l.confused).toBe(new Set(ev(r.events, 'confused').map((e) => e.unit)).size)
    expect(l.principalConfused).toBe(ev(r.events, 'confused').some((e) => e.unit === 'e'))
  })

  it('Ruse: a short R scene, with the confusion and (if any) no falls', () => {
    const s = world()
    const r = act(s, strat('a1', 'sow-discord', 6, 5))
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.scene).toBe('R')
    expect(SCENE_INFO.R.duration).toBe(3)
  })

  it('Borrow the Wind: scene W carries the new wind from the windChanged event', () => {
    const s = world()
    const cast = legalActions(s).find((a) => a.type === 'stratagem' && a.unit === 'a1' && a.strat === 'borrow-the-wind')!
    const r = act(s, cast)
    const w = ev(r.events, 'windChanged')[0]
    const l = plan(r.events, s)[0]?.plan.links[0]
    expect(l?.scene).toBe('W')
    expect(l?.wind).toEqual({ dir: w?.dir ?? null, strength: w?.strength })
    expect(SCENE_INFO.W.duration).toBe(3)
  })

  it('Rally (a Command with no wind) has no cut-in', () => {
    const s = patch(world({}, [{ id: 'h2', side: 'han', x: 4, y: 5, troops: 500 }]), 'h2', { maxTroops: 1000 })
    const r = act(s, strat('a1', 'rally', 5, 5))
    expect(plan(r.events, s)).toEqual([])
  })

  it('Thundering Charge: scene B with the caster mounted', () => {
    const s = world({ a: { x: 4 } })
    const r = act(s, strat('a1', 'thundering-charge', 6, 5))
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.scene).toBe('B')
    expect(l.caster.mounted).toBe(true)
  })

  it('an area stratagem sums the damage of its targets and names the biggest hit as the principal', () => {
    const s = world({ a: { x: 4 } }, [{ id: 'e2', side: 'yellow', x: 6, y: 6, facing: 'E', troops: 800 }, { id: 'e3', side: 'yellow', x: 7, y: 5, facing: 'E', troops: 2000 }])
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    const hits = ev(r.events, 'damaged').filter((e) => e.source === 'stratagem')
    const l = plan(r.events, s)[0]!.plan.links[0]!
    expect(l.scene).toBe('Ap')
    expect(l.targets).toBe(new Set(hits.map((h) => h.unit)).size)
    expect(l.damage).toBe(hits.reduce((a, h) => a + h.amount, 0))
    const top = hits.slice().sort((a, b) => b.amount - a.amount)[0]!
    expect(l.defender!.unit).toBe(top.unit)
  })
})

describe('chains', () => {
  function chainOf() {
    const s = mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, strats: ['arrow-rain'], qi: 3 },
        { id: 'b1', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 4 },
        { id: 'c1', side: 'han', x: 6, y: 4, strats: ['serpent-thrust'], qi: 3 },
        { id: 'd1', side: 'han', x: 6, y: 6, strats: ['twin-blades'], qi: 3 },
        { id: 'f1', side: 'han', x: 7, y: 5, strats: ['twin-blades'], qi: 3 },
        { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000, lead: 50 },
      ],
    })
    const r = act(s, strat('a1', 'arrow-rain', 6, 5))
    expect(ev(r.events, 'chainLink').length).toBe(3)
    return { s, r }
  }

  it('one plan, one link per cast: the opener and every chainLink event in order, each with its own caster', () => {
    const { s, r } = chainOf()
    const [range] = plan(r.events, s)
    const links = range!.plan.links
    expect(links.length).toBe(1 + ev(r.events, 'chainLink').length)
    expect(links.map((l) => l.link)).toEqual(links.map((_, i) => i))
    expect(links.every((l) => l.links === links.length)).toBe(true)
    expect(links[0]!.caster.unit).toBe('a1')
    ev(r.events, 'chainLink').forEach((e, i) => {
      expect(links[i + 1]!.caster.unit).toBe(e.unit)
      expect(links[i + 1]!.stratName).toBe(GAME_DATA.stratagems[e.strat]!.name)
      expect(links[i + 1]!.bond).toBe(e.bond)
    })
    // damage is attributed to the link that dealt it
    const perLink = new Map<number, number>()
    for (const d of ev(r.events, 'damaged')) if (d.source === 'stratagem') perLink.set(d.link ?? 0, (perLink.get(d.link ?? 0) ?? 0) + d.amount)
    links.forEach((l, i) => expect(l.damage).toBe(perLink.get(i) ?? 0))
  })

  it('links 2+ skip the dive, play at ~60% of their length, and a seal separates them', () => {
    const { s, r } = chainOf()
    const p = plan(r.events, s)[0]!.plan
    const t = sequenceTiming(p)
    expect(t.links[0]!.start).toBe(0)
    p.links.forEach((l, i) => {
      const info = SCENE_INFO[l.scene]
      if (i > 0) {
        expect(t.links[i]!.start).toBe(info.skipTo)
        expect(t.links[i]!.rate).toBeCloseTo(1 / CHAIN_COMPRESS, 9)
      }
      expect(t.links[i]!.end).toBe(i < p.links.length - 1 ? info.cutAt : info.duration)
    })
    const expected = t.links.reduce((a, x) => a + (x.end - x.start) / x.rate, 0) + (p.links.length - 1) * INTERSTITIAL
    expect(t.seconds).toBeCloseTo(expected, 9)
  })

  it('a four-link chain of the longest scenes stays under about 18 s', () => {
    const l = (scene: SceneId, i: number): LinkPlan => ({ ...samplePlan(scene), link: i, links: 4 })
    for (const scene of ['A', 'Ap', 'B', 'C', 'D'] as const) {
      const t = sequenceTiming({ full: true, enemy: false, rate: 1, links: [0, 1, 2, 3].map((i) => l(scene, i)) })
      expect(t.seconds).toBeLessThan(18)
      expect(t.seconds).toBeGreaterThan(8)
    }
  })

  it('Quick plays everything at 1.5x', () => {
    const p = { full: true, enemy: false, rate: QUICK_RATE, links: [samplePlan('C')] }
    expect(sequenceTiming(p).seconds).toBeCloseTo(6 / 1.5, 9)
  })
})

describe('settings and speed', () => {
  const settings = (battleScenes: CutinSettings['battleScenes'], enemyScenes: CutinSettings['enemyScenes'] = 'same'): CutinSettings => ({ battleScenes, enemyScenes })
  const s = world()
  const atk = act(s, { type: 'attack', unit: 'a1', target: 'e' })
  const st = act(s, strat('a1', 'twin-blades', 6, 5))

  it('Full and short plays both; Stratagems and chains only drops the short scenes; Off plays nothing', () => {
    expect(plan(atk.events, s, { settings: settings('all') })).toHaveLength(1)
    expect(plan(st.events, s, { settings: settings('all') })).toHaveLength(1)
    expect(plan(atk.events, s, { settings: settings('strat') })).toEqual([])
    expect(plan(st.events, s, { settings: settings('strat') })).toHaveLength(1)
    expect(plan(atk.events, s, { settings: settings('off') })).toEqual([])
    expect(plan(st.events, s, { settings: settings('off') })).toEqual([])
  })

  it('Instant plays none; Quick plays at 1.5x', () => {
    expect(plan(st.events, s, { speed: 'instant' })).toEqual([])
    expect(plan(atk.events, s, { speed: 'instant' })).toEqual([])
    expect(plan(st.events, s, { speed: 'quick' })[0]!.plan.rate).toBe(QUICK_RATE)
    expect(plan(st.events, s, { speed: 'full' })[0]!.plan.rate).toBe(1)
  })

  it('enemy scenes: Same as mine follows the battle setting, Stratagems only drops the enemy attacks, Off drops all enemy scenes', () => {
    const es = mk({
      side: 'yellow',
      units: [
        { id: 'a1', side: 'han', x: 5, y: 5, troops: 3000 },
        { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 2400, qi: 6, strats: ['twin-blades'], war: 90 },
      ],
    })
    const eatk = act(es, { type: 'attack', unit: 'e', target: 'a1' })
    const est = act(es, strat('e', 'twin-blades', 5, 5))
    const o = (b: CutinSettings['battleScenes'], e: CutinSettings['enemyScenes']) => ({ settings: settings(b, e) })
    expect(plan(eatk.events, es, o('all', 'same'))[0]!.plan.enemy).toBe(true)
    expect(plan(eatk.events, es, o('all', 'strat'))).toEqual([])
    expect(plan(est.events, es, o('all', 'strat'))).toHaveLength(1)
    expect(plan(eatk.events, es, o('all', 'off'))).toEqual([])
    expect(plan(est.events, es, o('all', 'off'))).toEqual([])
    // "Same as mine" with my scenes at stratagems-only: enemy attacks are dropped too
    expect(plan(eatk.events, es, o('strat', 'same'))).toEqual([])
    expect(plan(est.events, es, o('strat', 'same'))).toHaveLength(1)
    expect(plan(est.events, es, o('off', 'same'))).toEqual([])
  })

  it('the rule table (allowedBy) is exhaustive and consistent', () => {
    const bs: CutinSettings['battleScenes'][] = ['all', 'strat', 'off']
    const es: CutinSettings['enemyScenes'][] = ['same', 'strat', 'off']
    for (const b of bs)
      for (const e of es)
        for (const full of [true, false]) {
          const mine = allowedBy({ battleScenes: b, enemyScenes: e }, full, false)
          const theirs = allowedBy({ battleScenes: b, enemyScenes: e }, full, true)
          expect(mine).toBe(b === 'off' ? false : full || b === 'all')
          expect(theirs).toBe(mine && e !== 'off' && (full || e === 'same'))
        }
  })

  it('a batch with no attack or stratagem (a move, an end of phase) has no cut-in', () => {
    const w = world()
    expect(plan(act(w, { type: 'move', unit: 'a1', x: 4, y: 5 }).events, w)).toEqual([])
    expect(plan(act(w, { type: 'endPhase' }).events, w)).toEqual([])
  })
})

describe('scenes built from plans', () => {
  const ids = SCENE_IDS
  it.each(ids)('scene %s is well formed (beats, shots and slow-motion tile the duration)', (id) => {
    const sc = buildScene(samplePlan(id))
    expect(validateScene(sc)).toEqual([])
    expect(sc.duration).toBe(SCENE_INFO[id].duration)
    expect(sc.chain).toEqual({ skipTo: SCENE_INFO[id].skipTo, cutAt: SCENE_INFO[id].cutAt, resultAt: SCENE_INFO[id].resultAt })
    // the chain cut points sit on beat boundaries
    expect(sc.beats.some((b) => Math.abs(b.start - SCENE_INFO[id].skipTo) < 1e-9)).toBe(true)
    expect(sc.beats.some((b) => Math.abs(b.start - SCENE_INFO[id].cutAt) < 1e-9)).toBe(true)
  })

  it('short scenes are 2.4 to 3.0 s, full ones 3 to 7 s, the shorts have no title slip', () => {
    for (const id of ['S-melee', 'S-cavalry', 'S-archer'] as const) {
      const sc = buildScene(samplePlan(id))
      expect(sc.duration).toBeGreaterThanOrEqual(2.4)
      expect(sc.duration).toBeLessThanOrEqual(3.0)
      expect(sc.overlays.title.text).toBe('')
    }
    for (const id of ['A', 'Ap', 'B', 'C', 'D'] as const) {
      const sc = buildScene(samplePlan(id))
      expect(sc.duration).toBeGreaterThanOrEqual(5)
      expect(sc.duration).toBeLessThanOrEqual(8)
      expect(sc.overlays.title.text).not.toBe('')
    }
    expect(buildScene(samplePlan('R')).duration).toBe(3)
    expect(buildScene(samplePlan('W')).duration).toBe(3)
  })

  it.each(ids)('scene %s shows the plan: caster name, stratagem name and damage', (id) => {
    const p = samplePlan(id)
    const sc = buildScene(p)
    expect(sc.officer).toBe(p.caster.name)
    expect(sc.params).toBe(p)
    if (SCENE_INFO[id].full) {
      expect(sc.overlays.title.text).toBe(p.stratName)
      expect(sc.overlays.title.sub).toBe(p.caster.name)
    }
    expect(sc.overlays.damage.text).toBe(p.damage > 0 ? `−${p.damage.toLocaleString('en-US')}` : '')
  })

  it.each(ids)('scene %s is a deterministic function of the plan and of t', (id) => {
    const a = buildScene(samplePlan(id))
    const b = buildScene(samplePlan(id))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const t of [0, 0.37, a.duration * 0.5, a.duration * 0.91, a.duration]) {
      expect(JSON.stringify(evaluate(a, t))).toBe(JSON.stringify(evaluate(b, t)))
    }
  })

  it('the numbers differ with the event: more damage, more falls, a different seed of fallers', () => {
    const c1 = buildScene(samplePlan('C', { damage: 100, falls: 1 }))
    const c2 = buildScene(samplePlan('C', { damage: 2000, falls: 6 }))
    const flings = (sc: ReturnType<typeof buildScene>) => sc.cues.filter((c) => c.action === 'fling').length
    expect(flings(c1)).toBe(1)
    expect(flings(c2)).toBe(6)
    expect(c2.overlays.damage.text).toBe('−2,000')
  })

  it('C: the number of figures knocked down is the falls of the plan, centre-out (13 defenders)', () => {
    for (const falls of [0, 1, 4, 7]) {
      const sc = buildScene(samplePlan('C', { falls }))
      const fell = sc.cues.filter((c) => c.actor.startsWith('def') && c.action === 'fling').map((c) => c.actor)
      expect(fell).toHaveLength(falls)
      const defs = sc.act!.actors.filter((a) => a.group === 'def')
      // the centre of the front rank goes first
      if (falls === 1) expect(Math.abs(defs.find((d) => d.id === fell[0])!.track.start[0])).toBeLessThan(0.1)
    }
  })

  it('D: confused survivors get spirals, and everyone falls when routed', () => {
    const sc = buildScene(samplePlan('D', { falls: 2, confused: 2, principalConfused: true }))
    expect(sc.act!.fx.spirals!.length).toBe(7 - 2)
    expect(sc.overlays.slips!.some((x) => x.text === 'Confused ×2')).toBe(true)
    const routed = buildScene(samplePlan('D', { routed: true, falls: 7 }))
    expect(routed.cues.filter((c) => c.actor.startsWith('def') && c.action === 'fall')).toHaveLength(7)
    expect(routed.act!.fx.spirals).toHaveLength(0)
  })

  it('S-melee: a counter event makes attackers fall; none, they press on', () => {
    const withC = buildScene(samplePlan('S-melee', { counter: { damage: 140, falls: 2, routed: false } }))
    const without = buildScene(samplePlan('S-melee', { counter: null }))
    expect(withC.cues.filter((c) => c.actor.startsWith('atk') && c.action === 'fling')).toHaveLength(2)
    expect(without.cues.filter((c) => c.actor.startsWith('atk') && c.action === 'fling')).toHaveLength(0)
    expect(withC.overlays.slips!.some((x) => x.text.startsWith('Counter'))).toBe(true)
    expect(without.overlays.slips!.some((x) => x.text.startsWith('Counter'))).toBe(false)
    expect(withC.beats[3]!.label).toMatch(/Counter/)
  })

  it('S-archer never counters', () => {
    const sc = buildScene(samplePlan('S-archer', { counter: { damage: 100, falls: 1, routed: false } }))
    expect(sc.overlays.slips!.some((x) => x.text.startsWith('Counter'))).toBe(false)
  })

  it('shorts: the call-out follows the arc, and a flank/rear turns the defenders away', () => {
    for (const id of ['S-melee', 'S-cavalry', 'S-archer'] as const) {
      const front = buildScene(samplePlan(id, { arc: 'front' }))
      const side = buildScene(samplePlan(id, { arc: 'side' }))
      const rear = buildScene(samplePlan(id, { arc: 'rear' }))
      expect(front.overlays.callout.text).toBe('')
      expect(side.overlays.callout.text).toBe('Flank!')
      expect(rear.overlays.callout.text).toBe('Rear!')
      const yaw = (sc: typeof front) => sc.act!.actors.find((a) => a.group === 'def')!.track.yaw
      expect(yaw(front)).toBeCloseTo(Math.PI, 9)
      expect(yaw(rear)).toBeCloseTo(0, 9)
      expect(Math.abs(yaw(side))).toBeCloseTo(Math.PI / 2, 9)
    }
  })

  it('A and A′ differ only in the brazier and fire: ids, glyphs and beat ids', () => {
    const fire = buildScene(samplePlan('A'))
    const vol = buildScene(samplePlan('Ap'))
    expect(fire.id).toBe('A')
    expect(vol.id).toBe('Ap')
    expect(fire.beats.map((b) => b.id)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'])
    expect(vol.beats.map((b) => b.id)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'V6'])
    expect(fire.overlays.seal.glyph).not.toBe(vol.overlays.seal.glyph)
    expect(fire.overlays.flashes[0]!.kind).toBe('fire')
    expect(vol.overlays.flashes[0]!.kind).toBe('ink')
  })

  it('a chain link 2+ brings its title in at once (there is no dive to carry it)', () => {
    for (const id of ['A', 'Ap', 'B', 'C', 'D', 'R', 'W'] as const) {
      const first = buildScene(samplePlan(id))
      const later = buildScene(samplePlan(id, { link: 2, links: 3 }))
      expect(later.overlays.title.inAt).toBeGreaterThanOrEqual(SCENE_INFO[id].skipTo)
      expect(first.overlays.title.inAt).toBeLessThan(SCENE_INFO[id].skipTo)
      // the title is on screen shortly after the link starts
      const t = SCENE_INFO[id].skipTo + 0.4
      expect(evaluate(later, t).overlay.title.alpha).toBeGreaterThan(0)
    }
  })

  it('every scene draws the mounted variant: a cavalry caster in C and D', () => {
    const mounted = samplePlan('C', { caster: { ...samplePlan('C').caster, kind: 'cavalry', type: 'cavalry', mounted: true } })
    const sc = buildScene(mounted)
    expect(sc.act!.heroMounted).toBe(true)
    expect(sc.act!.groups[0]!.layout).toBe('wedge')
    expect(validateScene(sc)).toEqual([])
  })
})

describe('troops, ground and tracks', () => {
  it('troop kinds by unit type and side palette', () => {
    expect(kindOf('archers', 'han')).toBe('archer')
    expect(kindOf('cavalry', 'yellow')).toBe('cavalry')
    expect(kindOf('infantry', 'yellow')).toBe('rebel')
    expect(kindOf('infantry', 'han')).toBe('infantry')
  })

  it('terrain to ground: millet, forest, hill, village, shallows, deck, plain', () => {
    expect(groundKind('farm')).toBe('millet')
    expect(groundKind('reeds')).toBe('millet')
    expect(groundKind('forest')).toBe('forest')
    expect(groundKind('hill')).toBe('hill')
    expect(groundKind('village')).toBe('village')
    expect(groundKind('shallows')).toBe('shallows')
    expect(groundKind('ford')).toBe('shallows')
    expect(groundKind('deck')).toBe('deck')
    for (const t of ['plain', 'road', 'ash', 'bridge', 'gate', 'wall'] as const) expect(groundKind(t)).toBe('plain')
  })

  it('formations: a block has a front rank, a line one rank, a wedge a tip', () => {
    const block = formationSlots('block', 13)
    expect(block.filter((s) => s.front)).toHaveLength(7)
    expect(block).toHaveLength(13)
    expect(formationSlots('block', 5).every((s) => s.front)).toBe(true)
    expect(formationSlots('line', 6).every((s) => s.b === 0)).toBe(true)
    const wedge = formationSlots('wedge', 5)
    expect(wedge[0]).toMatchObject({ r: 0, b: 0 })
    expect(Math.max(...wedge.map((s) => s.b))).toBeGreaterThan(1)
    expect(formationSlots('ragged', 7, 0.46, 3)).toEqual(formationSlots('ragged', 7, 0.46, 3))
    expect(formationSlots('block', 0)).toEqual([])
  })

  it('pickFallers: front rank first, centre out, exactly the count asked for, deterministic', () => {
    const slots = formationSlots('block', 13, 0.46, 5)
    for (const n of [0, 1, 3, 7, 13, 20]) {
      const f = pickFallers(slots, n, 0, 5)
      expect(f).toHaveLength(Math.min(n, 13))
      expect(new Set(f).size).toBe(f.length)
      expect(pickFallers(slots, n, 0, 5)).toEqual(f)
    }
    const three = pickFallers(slots, 3, 0, 5)
    expect(three.every((i) => slots[i]!.front)).toBe(true)
  })

  it('tracks: positions and distances are continuous, speed follows the eased segment, backwards walking is signed', () => {
    const tr: Track = { start: [0, 0], yaw: 0, segs: [{ t0: 1, t1: 2, to: [0, 2], ease: 'in' }, { t0: 2, t1: 3, to: [0, 3], ease: 'lin' }] }
    let prev = trackAt(tr, 0)
    for (let t = 0.01; t <= 3.5; t += 0.01) {
      const p = trackAt(tr, t)
      expect(Math.abs(p.z - prev.z)).toBeLessThan(0.08)
      expect(p.dist).toBeGreaterThanOrEqual(prev.dist - 1e-9)
      prev = p
    }
    expect(trackAt(tr, 3).z).toBeCloseTo(3, 9)
    expect(trackAt(tr, 0.5).speed).toBeCloseTo(0, 6)
    expect(trackAt(tr, 1.99).speed).toBeGreaterThan(3)
    const back: Track = { start: [0, 2], yaw: Math.PI, face: 'fixed', segs: [{ t0: 0, t1: 1, to: [0, 3], ease: 'lin' }] }
    expect(trackAt(back, 1).dist).toBeLessThan(0)
    expect(trackAt(back, 0.5).yaw).toBe(Math.PI)
    const wheel: Track = { start: [0, 0], yaw: 0, segs: [{ t0: 0, t1: 1, to: [2, 0], via: [1, 2], ease: 'io' }] }
    expect(trackAt(wheel, 0.5).z).toBeGreaterThan(0.5)
    expect(trackAt(wheel, 1).x).toBeCloseTo(2, 9)
  })

  it('wind headings: east is screen-right, north away from the camera', () => {
    expect(windHeading('E')).toBeCloseTo(Math.PI / 2, 9)
    expect(windHeading('W')).toBeCloseTo(-Math.PI / 2, 9)
    expect(windHeading(null)).toBeNull()
  })
})

void u
