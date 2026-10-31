import { describe, expect, it } from 'vitest'
import { ALL_STRATAGEMS } from '../../src/data'
import { query } from '../../src/engine'
import { act, burnAt, ev, kinds, legalOf, mk, reject, strat, u, type TU } from './helpers'

const pos = (x: number, y: number) => ({ x, y })

/** caster 'c' (han) at (5,5); enemy 'e' (yellow) at (6,5) facing W. */
function cast(strats: string[], c: Partial<TU> = {}, e: Partial<TU> = {}, extra: TU[] = []) {
  return mk({
    units: [
      { id: 'c', side: 'han', x: 5, y: 5, war: 100, int: 100, troops: 1000, qi: 10, strats, ...c },
      { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', lead: 100, int: 50, troops: 1000, ...e },
      ...extra,
    ],
  })
}

describe('R-STRAT-1 stratagem definition', () => {
  it('R-STRAT-1 every stratagem has id, name, tag, cost, range, area, power, stat, follows', () => {
    const tags = ['Strike', 'Charge', 'Volley', 'Fire', 'Shout', 'Ruse', 'Command']
    expect(ALL_STRATAGEMS).toHaveLength(14)
    for (const s of ALL_STRATAGEMS) {
      expect(tags).toContain(s.tag)
      expect(s.cost).toBeGreaterThan(0)
      expect(s.range.max).toBeGreaterThanOrEqual(s.range.min)
      expect(['single', 'cross', 'sweep', 'adjacent', 'aura']).toContain(s.area)
      expect(s.follows.every((f) => tags.includes(f))).toBe(true)
    }
    const arrow = ALL_STRATAGEMS.find((s) => s.id === 'arrow-rain')!
    expect(arrow).toMatchObject({ tag: 'Volley', cost: 3, range: { min: 2, max: 3 }, area: 'cross', power: 1, stat: 'war', neighborMult: 0.6 })
  })
  it('R-STRAT-1 area single hits one tile; cross = target + 4 neighbours (neighbours x0.6)', () => {
    const s = cast(['twin-blades', 'arrow-rain'], { type: 'archers', x: 3, y: 5 }, {}, [{ id: 'e2', side: 'yellow', x: 6, y: 6, lead: 100 }, { id: 'ally', side: 'han', x: 7, y: 5 }])
    const rain = query.stratagemPreview(s, 'c', 'arrow-rain', pos(6, 5))!
    expect(rain.tiles).toHaveLength(5)
    expect(rain.targets.map((t) => t.unit)).toEqual(['e', 'e2']) // the allied unit in the cross is untouched
    const main = rain.targets[0]!
    const splash = rain.targets[1]!
    expect(splash.multipliers.find((m) => m.id === 'splash')!.value).toBe(0.6)
    expect(main.multipliers.find((m) => m.id === 'splash')).toBeUndefined()
    expect(splash.expected).toBeLessThan(main.expected)
    const r = act(s, strat('c', 'arrow-rain', 6, 5))
    expect(ev(r.events, 'damaged').filter((d) => d.link === 0).map((d) => d.unit).sort()).toEqual(['e', 'e2'])
    expect(u(r.state, 'ally').troops).toBe(1000)
  })
  it('R-STRAT-1 area sweep = target plus the two tiles beside it, perpendicular to the cast direction', () => {
    const east = cast(['crescent-sweep'], {}, {}, [{ id: 'n', side: 'yellow', x: 6, y: 4 }, { id: 's', side: 'yellow', x: 6, y: 6 }, { id: 'far', side: 'yellow', x: 7, y: 5 }])
    const p = query.stratagemPreview(east, 'c', 'crescent-sweep', pos(6, 5))!
    expect(p.tiles).toEqual([pos(6, 5), pos(6, 4), pos(6, 6)])
    expect(p.targets.map((t) => t.unit).sort()).toEqual(['e', 'n', 's'])
    const south = mk({ units: [{ id: 'c', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 9 }, { id: 'e', side: 'yellow', x: 5, y: 6 }] })
    expect(query.stratagemPreview(south, 'c', 'crescent-sweep', pos(5, 6))!.tiles).toEqual([pos(5, 6), pos(4, 6), pos(6, 6)])
  })
  it('R-STRAT-1 area adjacent = every tile next to the caster; it is cast on the caster tile and needs an enemy', () => {
    const s = cast(['thunder-roar'], {}, {}, [{ id: 'w', side: 'yellow', x: 4, y: 5 }, { id: 'ally', side: 'han', x: 5, y: 4 }, { id: 'far', side: 'yellow', x: 8, y: 5 }])
    expect(query.stratagemTargets(s, 'c', 'thunder-roar')).toEqual([pos(5, 5)])
    const p = query.stratagemPreview(s, 'c', 'thunder-roar', pos(5, 5))!
    expect(p.tiles).toHaveLength(4)
    expect(p.targets.map((t) => t.unit).sort()).toEqual(['e', 'w'])
    const lonely = mk({ units: [{ id: 'c', side: 'han', x: 5, y: 5, strats: ['thunder-roar'], qi: 9 }, { id: 'far', side: 'yellow', x: 8, y: 5 }] })
    expect(query.stratagemTargets(lonely, 'c', 'thunder-roar')).toEqual([])
    reject(lonely, strat('c', 'thunder-roar', 5, 5), 'noValidTarget')
  })
  it('R-STRAT-1 rejections: no Qi, not known, unknown id, out of range, nothing to hit', () => {
    const s = cast(['twin-blades'], { qi: 2 })
    reject(s, strat('c', 'twin-blades', 6, 5), 'notEnoughQi')
    const ok = cast(['twin-blades'])
    reject(ok, strat('c', 'serpent-thrust', 6, 5), 'stratagemNotKnown')
    reject(ok, strat('c', 'no-such', 6, 5), 'unknownStratagem')
    reject(ok, strat('c', 'twin-blades', 8, 5), 'outOfRange')
    reject(ok, strat('c', 'twin-blades', 5, 6), 'noValidTarget')
    reject(ok, strat('c', 'twin-blades', 99, 5), 'outOfRange')
  })
  it('R-STRAT-1 casting spends the Qi cost, costs the unit its action, and the move may come first', () => {
    const s = cast(['twin-blades'], { x: 3, y: 5 })
    const moved = act(s, { type: 'move', unit: 'c', x: 5, y: 5 }).state
    const r = act(moved, strat('c', 'twin-blades', 6, 5))
    expect(u(r.state, 'c')).toMatchObject({ qi: 7, done: true })
    expect(ev(r.events, 'stratagem')[0]).toMatchObject({ unit: 'c', strat: 'twin-blades', cost: 3, link: 0 })
  })
})

describe('R-STRAT-2 stratagem damage', () => {
  it('R-STRAT-2 damage = base x power x stat x arc x ...; Twin Blades (1.3) front: 270..330', () => {
    const p = query.stratagemPreview(cast(['twin-blades']), 'c', 'twin-blades', pos(6, 5))!
    expect(p.targets[0]).toMatchObject({ min: 270, max: 330, expected: 300 })
  })
  it('R-STRAT-2 Strike and Charge apply the facing arc and height; Volley height only; Fire/Ruse/Shout neither', () => {
    const map = ['............', '............', '............', '............', '............', '....hh......', '............', '............', '............', '............', '............', '............']
    const id = (s: ReturnType<typeof mk>, strat: string, at: [number, number]) =>
      query.stratagemPreview(s, 'c', strat, pos(...at))!.targets[0]!.multipliers.map((m) => m.id)
    const mkS = (strats: string[], c: Partial<TU>, e: Partial<TU>) => mk({ map, units: [{ id: 'c', side: 'han', war: 100, int: 100, qi: 10, strats, ...{ x: 4, y: 5 }, ...c }, { id: 'e', side: 'yellow', facing: 'E', x: 6, y: 5, lead: 100, ...e }] })
    // c on hill (4,5) facing a rear target at (5,5) which is also hill => no height; use (3,5) plain target instead
    const strike = mk({ map, units: [{ id: 'c', side: 'han', x: 4, y: 5, strats: ['twin-blades'], qi: 9 }, { id: 'e', side: 'yellow', x: 3, y: 5, facing: 'E' }] })
    expect(id(strike, 'twin-blades', [3, 5])).toEqual(['stat', 'arc', 'height']) // facing E, c is east of e: front
    const volley = mkS(['arrow-rain'], { type: 'archers' }, { x: 2, y: 5, facing: 'E' })
    expect(id(volley, 'arrow-rain', [2, 5])).toEqual(['stat', 'matchup', 'height']) // no arc; archers are strong against infantry
    const fire = mkS(['fire-attack'], { type: 'archers' }, { x: 2, y: 5, facing: 'E' })
    expect(id(fire, 'fire-attack', [2, 5])).toEqual(['stat', 'matchup']) // no arc, no height
    const ruse = mkS(['yellow-sky-hex'], { type: 'archers' }, { x: 2, y: 5, facing: 'E' })
    expect(id(ruse, 'yellow-sky-hex', [2, 5])).toEqual(['stat', 'matchup'])
    const shout = mkS(['thunder-roar'], {}, { x: 3, y: 5, facing: 'E' })
    expect(id(shout, 'thunder-roar', [4, 5])).toEqual(['stat'])
  })
  it('R-STRAT-2 Fire and Ruse use Intellect, Strike uses War', () => {
    const f = query.stratagemPreview(cast(['fire-attack'], { war: 10, int: 100 }, { lead: 100 }), 'c', 'fire-attack', pos(6, 5))!
    expect(f.targets[0]!.multipliers.find((m) => m.id === 'stat')!.value).toBe(1)
    const g = query.stratagemPreview(cast(['fire-attack'], { war: 100, int: 10 }, { lead: 100 }), 'c', 'fire-attack', pos(6, 5))!
    expect(g.targets[0]!.multipliers.find((m) => m.id === 'stat')!.value).toBeCloseTo(110 / 200, 10)
  })
  it('R-STRAT-2 stratagems are never countered', () => {
    const r = act(cast(['twin-blades'], {}, { troops: 5000 }), strat('c', 'twin-blades', 6, 5))
    expect(kinds(r.events)).not.toContain('countered')
    expect(ev(r.events, 'damaged').every((d) => d.source === 'stratagem')).toBe(true)
  })
  it('R-STRAT-2 stratagem damage does not grant Qi (it is not a normal attack)', () => {
    const r = act(cast(['twin-blades'], {}, { troops: 5000, qi: 3 }), strat('c', 'twin-blades', 6, 5))
    expect(u(r.state, 'e').qi).toBe(3)
  })
  it('R-STRAT-2 a unit routed by a stratagem is removed', () => {
    const r = act(cast(['twin-blades'], {}, { troops: 50 }), strat('c', 'twin-blades', 6, 5))
    expect(r.state.units.find((x) => x.id === 'e')).toBeUndefined()
    expect(ev(r.events, 'routed')[0]).toMatchObject({ unit: 'e', by: 'c' })
  })
})

describe('R-STRAT-3 foresight', () => {
  it('R-STRAT-3 chance = min(60, 2 x (target.int - caster.int))% for Ruse and Fire only', () => {
    const f = (ci: number, ti: number, id = 'fire-attack') => query.stratagemPreview(cast([id], { int: ci }, { int: ti }), 'c', id, pos(6, 5))!.targets[0]!.foresightChance
    expect(f(50, 70)).toBe(40)
    expect(f(50, 100)).toBe(60)
    expect(f(50, 90)).toBe(60)
    expect(f(70, 70)).toBe(0)
    expect(f(80, 70)).toBe(0)
    expect(f(50, 70, 'sow-discord')).toBe(40)
    const strike = query.stratagemPreview(cast(['twin-blades'], { int: 10 }, { int: 100 }), 'c', 'twin-blades', pos(6, 5))!
    expect(strike.targets[0]!.foresightChance).toBe(0)
  })
  it('R-STRAT-3 a unit that sees through takes no damage or effect; it happens about 40% of the time', () => {
    let saw = 0
    const N = 200
    for (let seed = 1; seed <= N; seed++) {
      const s = mk({ seed, units: [{ id: 'c', side: 'han', x: 5, y: 5, int: 50, war: 50, strats: ['sow-discord'], qi: 10 }, { id: 'e', side: 'yellow', x: 6, y: 5, int: 70, lead: 50, troops: 1000 }] })
      const r = act(s, strat('c', 'sow-discord', 6, 5))
      const sawEv = ev(r.events, 'sawThrough')
      if (sawEv.length) {
        saw++
        expect(sawEv[0]).toEqual({ kind: 'sawThrough', unit: 'e', by: 'c', strat: 'sow-discord', chance: 40 })
        expect(u(r.state, 'e')).toMatchObject({ confused: false, troops: 1000 })
        expect(kinds(r.events)).not.toContain('confused')
      }
    }
    expect(saw / N).toBeGreaterThan(0.3)
    expect(saw / N).toBeLessThan(0.5)
  })
  it('R-STRAT-3 a link that was seen through does not count as a hit (no chain follows)', () => {
    // Fire Attack (60% to be seen through) would be followed by Arrow Rain (Volley follows Fire)
    let withChain = 0
    let without = 0
    for (let seed = 1; seed <= 80; seed++) {
      const s = mk({
        seed,
        units: [
          { id: 'c', side: 'han', x: 4, y: 5, int: 50, strats: ['fire-attack'], qi: 10, type: 'archers' },
          { id: 'k', side: 'han', x: 4, y: 6, type: 'archers', strats: ['arrow-rain'], qi: 10 },
          { id: 'e', side: 'yellow', x: 6, y: 5, int: 100, troops: 5000 },
        ],
      })
      const r = act(s, strat('c', 'fire-attack', 6, 5))
      if (ev(r.events, 'sawThrough').length) {
        without++
        expect(ev(r.events, 'chainLink')).toHaveLength(0)
      } else {
        withChain++
        expect(ev(r.events, 'chainLink')).toHaveLength(1)
      }
    }
    expect(withChain).toBeGreaterThan(0)
    expect(without).toBeGreaterThan(0)
  })
})

describe('R-STRAT-4 confuse', () => {
  it('R-STRAT-4 chance = clamp(40 + caster stat - target.lead, 10, 90); Shout uses War, Ruse uses Int', () => {
    const c = (id: string, ci: Partial<TU>, lead: number) => query.stratagemPreview(cast([id], ci, { lead, int: 0 }), 'c', id, id === 'thunder-roar' ? pos(5, 5) : pos(6, 5))!.targets[0]!.confuseChance
    expect(c('thunder-roar', { war: 70 }, 65)).toBe(45)
    expect(c('sow-discord', { int: 72, war: 1 }, 50)).toBe(62)
    expect(c('thunder-roar', { war: 10 }, 100)).toBe(10)
    expect(c('thunder-roar', { war: 100 }, 1)).toBe(90)
    expect(c('twin-blades', {}, 50)).toBe(0)
  })
  it('R-STRAT-4 a confused unit cannot act, counter or turn; it recovers at the end of its next phase', () => {
    const base = mk({ seed: 1, units: [{ id: 'c', side: 'han', x: 5, y: 5, war: 100, strats: ['thunder-roar'], qi: 10 }, { id: 'e', side: 'yellow', x: 6, y: 5, lead: 1, facing: 'W', troops: 1000 }, { id: 'f', side: 'yellow', x: 9, y: 9 }] })
    let confusedSeed = 0
    for (let seed = 1; seed < 40 && !confusedSeed; seed++) if (u(act({ ...base, seed, rng: mk({ seed, units: [{ id: 'q', side: 'han', x: 1, y: 1 }] }).rng }, strat('c', 'thunder-roar', 5, 5)).state, 'e').confused) confusedSeed = seed
    expect(confusedSeed).toBeGreaterThan(0)
    const s0 = { ...base, rng: mk({ seed: confusedSeed, units: [{ id: 'q', side: 'han', x: 1, y: 1 }] }).rng }
    const r = act(s0, strat('c', 'thunder-roar', 5, 5))
    expect(ev(r.events, 'confused')).toHaveLength(1)
    const yellow = act(r.state, { type: 'endPhase' }).state
    expect(u(yellow, 'e').confused).toBe(true)
    reject(yellow, { type: 'wait', unit: 'e', facing: 'N' }, 'unitConfused')
    reject(yellow, { type: 'attack', unit: 'e', target: 'c' }, 'unitConfused')
    expect(legalOf(yellow, 'e')).toEqual([{ type: 'endPhase' }])
    const next = act(yellow, { type: 'endPhase' })
    expect(ev(next.events, 'recovered')).toEqual([{ kind: 'recovered', unit: 'e' }])
    expect(u(next.state, 'e').confused).toBe(false)
  })
  it('R-STRAT-4 the confuse chance is realised: roughly the previewed percentage over many seeds', () => {
    let hit = 0
    const N = 300
    for (let seed = 1; seed <= N; seed++) {
      const s = mk({ seed, units: [{ id: 'c', side: 'han', x: 5, y: 5, war: 70, strats: ['thunder-roar'], qi: 10 }, { id: 'e', side: 'yellow', x: 6, y: 5, lead: 65, troops: 3000 }] })
      if (u(act(s, strat('c', 'thunder-roar', 5, 5)).state, 'e').confused) hit++
    }
    expect(hit / N).toBeGreaterThan(0.36)
    expect(hit / N).toBeLessThan(0.54)
  })
})

describe('R-STRAT-5 ignite', () => {
  it('R-STRAT-5 the tile hit is set burning after the damage', () => {
    const map = Array.from({ length: 12 }, () => 'ffffffffffff')
    const s = mk({ map, units: [{ id: 'c', side: 'han', type: 'archers', x: 3, y: 5, int: 100, strats: ['fire-attack'], qi: 10 }, { id: 'e', side: 'yellow', x: 5, y: 5, int: 10, lead: 10, troops: 1000 }] })
    const r = act(s, strat('c', 'fire-attack', 5, 5))
    const k = kinds(r.events)
    expect(k.indexOf('damaged')).toBeLessThan(k.indexOf('ignited'))
    expect(burnAt(r.state, 5, 5)).toBe(2)
    expect(query.stratagemPreview(s, 'c', 'fire-attack', pos(5, 5))!.ignites).toBe(true)
  })
  it('R-STRAT-5 Torch Raid (war, 0.8) ignites a farm; a road tile does not catch', () => {
    const map = ['............', '............', '............', '............', '............', '...f=.......', '............', '............', '............', '............', '............', '............']
    const raid = (cx: number, hx: number) =>
      mk({ map, side: 'yellow', units: [{ id: 'c', side: 'yellow', type: 'cavalry', x: cx, y: 5, war: 100, strats: ['torch-raid'], qi: 10 }, { id: 'h', side: 'han', x: hx, y: 5, int: 0, lead: 10 }] })
    const onFarm = act(raid(2, 3), strat('c', 'torch-raid', 3, 5))
    expect(burnAt(onFarm.state, 3, 5)).toBe(2)
    expect(ev(onFarm.events, 'damaged')[0]!.unit).toBe('h')
    const onRoad = act(raid(5, 4), strat('c', 'torch-raid', 4, 5))
    expect(burnAt(onRoad.state, 4, 5)).toBe(0)
    expect(ev(onRoad.events, 'damaged')).toHaveLength(1)
  })
})

describe('R-STRAT-6 dash', () => {
  const dashWorld = (cx: number, ex: number, map?: string[], extra: TU[] = []) =>
    mk({ map, units: [{ id: 'c', side: 'han', type: 'cavalry', x: cx, y: 5, war: 100, strats: ['thundering-charge'], qi: 10 }, { id: 'e', side: 'yellow', x: ex, y: 5, lead: 100, troops: 3000, facing: 'W' }, ...extra] })
  it('R-STRAT-6 target 2-3 tiles away in a straight line: the caster ends adjacent and strikes', () => {
    for (const [cx, ex, endX] of [[3, 6, 5], [4, 6, 5], [8, 5, 6]] as const) {
      const s = dashWorld(cx, ex)
      const r = act(s, strat('c', 'thundering-charge', ex, 5))
      expect(u(r.state, 'c')).toMatchObject({ x: endX, y: 5 })
      const k = kinds(r.events)
      expect(k.indexOf('moved')).toBeLessThan(k.indexOf('damaged'))
      expect(ev(r.events, 'moved')[0]).toMatchObject({ unit: 'c', from: { x: cx, y: 5 }, to: { x: endX, y: 5 }, dash: true })
    }
    const facing = act(dashWorld(8, 5), strat('c', 'thundering-charge', 5, 5)).state
    expect(u(facing, 'c').facing).toBe('W')
  })
  it('R-STRAT-6 range is exactly 2-3 and the line must be straight', () => {
    expect(query.stratagemTargets(dashWorld(5, 6), 'c', 'thundering-charge')).toEqual([]) // adjacent
    expect(query.stratagemTargets(dashWorld(2, 6), 'c', 'thundering-charge')).toEqual([]) // 4 away
    const diag = mk({ units: [{ id: 'c', side: 'han', type: 'cavalry', x: 3, y: 3, strats: ['thundering-charge'], qi: 10 }, { id: 'e', side: 'yellow', x: 5, y: 4 }] })
    expect(query.stratagemTargets(diag, 'c', 'thundering-charge')).toEqual([])
    reject(diag, strat('c', 'thundering-charge', 5, 4), 'dashBlocked')
  })
  it('R-STRAT-6 the path must be clear: a unit in the way blocks the dash', () => {
    const s = dashWorld(3, 6, undefined, [{ id: 'ally', side: 'han', x: 4, y: 5 }])
    expect(query.stratagemTargets(s, 'c', 'thundering-charge')).toEqual([])
    reject(s, strat('c', 'thundering-charge', 6, 5), 'dashBlocked')
  })
  it('R-STRAT-6 a unit that dashed as a chain link cannot undo its earlier move', () => {
    const s = mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 5, y: 5, strats: ['arrow-rain'], qi: 3 },
        { id: 'g', side: 'han', type: 'cavalry', x: 8, y: 10, strats: ['thundering-charge'], qi: 5 },
        { id: 'e', side: 'yellow', x: 8, y: 5, facing: 'W', troops: 9000 },
      ],
    })
    const moved = act(s, { type: 'move', unit: 'g', x: 8, y: 8 }).state
    const r = act(moved, strat('a1', 'arrow-rain', 8, 5))
    expect(ev(r.events, 'moved').some((m) => m.dash)).toBe(true)
    expect(u(r.state, 'g')).toMatchObject({ x: 8, y: 6, moved: true, undo: null })
    reject(r.state, { type: 'undoMove', unit: 'g' }, 'nothingToUndo')
  })
  it('R-STRAT-6 the preview shows where the caster will land', () => {
    expect(query.stratagemPreview(dashWorld(3, 6), 'c', 'thundering-charge', pos(6, 5))!.dashTo).toEqual(pos(5, 5))
  })
})
