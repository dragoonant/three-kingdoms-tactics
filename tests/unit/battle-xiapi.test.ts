// Xiapi (198): the flood timeline drowns the low ground outermost-first, the dyke road stays dry, the west gate opens in round 8.
import { describe, expect, it } from 'vitest'
import { GAME_DATA, getBattleDef } from '../../src/data'
import { createBattle, query, type BattleState } from '../../src/engine'
import { act, endPhases, ev, u } from './helpers'

const terrainAt = (s: BattleState, x: number, y: number): string => s.grid.tiles[y * s.grid.width + x]!.terrain
const tiles = (xs: [number, number][], s: BattleState): string[] => xs.map(([x, y]) => terrainAt(s, x, y))

// A tile from each band (Chebyshev distance from the wall block x8..12, y3..8): d=4/3, d=2, d=1.
const OUTER: [number, number][] = [[4, 3], [5, 4], [5, 9], [4, 1]]
const MIDDLE: [number, number][] = [[6, 3], [6, 8], [10, 1], [14, 6]]
const INNER: [number, number][] = [[7, 4], [7, 7], [13, 4], [13, 8]]
const DYKE: [number, number][] = [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5]]

/** Plays `n` full phases with real step() calls (both sides just end their phase). */
const run = (s: BattleState, phases: number): BattleState => endPhases(s, phases)

describe('Xiapi: flood timeline (R2-TIME-1)', () => {
  it('starts dry: farmland, banks and the dyke road are as drawn; the moat is already water', () => {
    const s = createBattle('xiapi', 7)
    expect(s.round).toBe(1)
    expect(tiles(OUTER, s)).toEqual(['plain', 'farm', 'farm', 'reeds'])
    expect(tiles(MIDDLE, s)).toEqual(['farm', 'farm', 'reeds', 'plain'])
    expect(tiles(INNER, s)).toEqual(['farm', 'farm', 'plain', 'plain'])
    expect(tiles(DYKE, s)).toEqual(['road', 'road', 'road', 'road', 'road'])
    expect(terrainAt(s, 9, 2)).toBe('water')
    expect(terrainAt(s, 8, 5)).toBe('wall') // the barred west gate
    expect(s.opening.some((e) => e.kind === 'timelineMessage')).toBe(true)
  })

  it('round 3 end: the outer band floods first; the middle and inner bands stay dry', () => {
    let s = run(createBattle('xiapi', 7), 5) // rounds 1-2 done and the han phase of round 3; the lu phase is still to come
    expect(s.round).toBe(3)
    expect(tiles(OUTER, s)).toEqual(['plain', 'farm', 'farm', 'reeds'])
    const r = act(s, { type: 'endPhase' }) // lu phase ends round 3 -> the first tide
    s = r.state
    const changed = ev(r.events, 'terrainChanged')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ to: 'shallows', cause: 'timeline' })
    expect(changed[0]!.tiles.length).toBe(18)
    expect(tiles(OUTER, s)).toEqual(['shallows', 'shallows', 'shallows', 'shallows'])
    expect(tiles(MIDDLE, s)).toEqual(['farm', 'farm', 'reeds', 'plain'])
    expect(tiles(INNER, s)).toEqual(['farm', 'farm', 'plain', 'plain'])
    expect(tiles(DYKE, s)).toEqual(['road', 'road', 'road', 'road', 'road'])
    expect(ev(r.events, 'timelineMessage').map((e) => e.text).join(' ')).toContain('first tide')
  })

  it('rounds 5 and 7: the middle then the inner band go under, outermost first, and the dyke stays road', () => {
    let s = run(createBattle('xiapi', 7), 6) // round 4 starts
    expect(s.round).toBe(4)
    s = run(s, 4) // r4 han, r4 lu, r5 han, r5 lu: the end of round 5 brings the second tide
    expect(s.round).toBe(6) // the end of round 5 has just run
    expect(tiles(MIDDLE, s)).toEqual(['shallows', 'shallows', 'shallows', 'shallows'])
    expect(tiles(INNER, s)).toEqual(['farm', 'farm', 'plain', 'plain']) // not yet
    s = run(s, 4) // r6 han, r6 lu, r7 han, r7 lu
    expect(s.round).toBe(8)
    expect(tiles(INNER, s)).toEqual(['shallows', 'shallows', 'shallows', 'shallows'])
    expect(tiles(DYKE, s)).toEqual(['road', 'road', 'road', 'road', 'road'])
    // the roads, hills, villages and walls never flood
    expect(terrainAt(s, 10, 6)).toBe('village')
    expect(terrainAt(s, 2, 5)).toBe('hill')
    expect(terrainAt(s, 9, 3)).toBe('rampart')
  })

  it('round 8 start: the west gate opens (wall -> road) with a message, and not before', () => {
    let s = run(createBattle('xiapi', 7), 13) // up to the lu phase of round 7
    expect(s.round).toBe(7)
    expect(terrainAt(s, 8, 5)).toBe('wall')
    const r = act(s, { type: 'endPhase' }) // end of round 7 -> third tide, then round 8 starts -> gate opens
    s = r.state
    expect(s.round).toBe(8)
    const gate = ev(r.events, 'terrainChanged').find((e) => e.to === 'road')
    expect(gate?.tiles).toEqual([{ x: 8, y: 5 }])
    expect(terrainAt(s, 8, 5)).toBe('road')
  })

  it('the flood is open information: query.timelinePreview lists the next tide', () => {
    const items = query.timelinePreview(createBattle('xiapi', 7), 6)
    expect(items.some((i) => i.kind === 'terrain' && i.round === 3 && i.phase === 'end')).toBe(true)
    expect(items.some((i) => i.kind === 'terrain' && i.round === 5)).toBe(true)
  })

  it('a unit standing in the first band when the water comes is not pushed or routed (shallows are passable)', () => {
    let s = createBattle('xiapi', 7)
    s = { ...s, units: s.units.map((x) => (x.id === 'guan-yu' ? { ...x, x: 5, y: 4 } : x)) }
    s = run(s, 6)
    expect(terrainAt(s, 5, 4)).toBe('shallows')
    expect(u(s, 'guan-yu')).toMatchObject({ x: 5, y: 4 })
    expect(s.defeated).not.toContain('guan-yu')
  })
})

describe('Xiapi: data', () => {
  it('Chen Gong and Gao Shun are enemy units and recruitable named officers; Zhang Liao is neither swayable nor recruitable', () => {
    const s = createBattle('xiapi', 3)
    for (const id of ['chen-gong', 'gao-shun', 'zhang-liao', 'lu-bu']) expect(u(s, id).side).toBe('lu')
    expect(GAME_DATA.officers['chen-gong']!.recruitable).toBe(true)
    expect(GAME_DATA.officers['gao-shun']!.recruitable).toBe(true)
    expect(GAME_DATA.officers['zhang-liao']!.recruitable).toBeFalsy()
    expect(u(s, 'lu-bu').commander).toBe(true)
    expect(getBattleDef('xiapi')!.stub).toBeUndefined()
  })

  it('the guests are Cao Cao and Xiahou Dun (player side, never the commander)', () => {
    const s = createBattle('xiapi', 3)
    expect([u(s, 'cao-cao').side, u(s, 'xiahou-dun').side]).toEqual(['han', 'han'])
    expect(u(s, 'cao-cao').commander).toBe(false)
  })
})
