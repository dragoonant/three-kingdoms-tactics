import { describe, expect, it } from 'vitest'
import { decideAction } from '../../src/ai/decider'
import { buildCtx } from '../../src/ai/context'
import { escapeCandidates } from '../../src/ai/evaluate'
import { deriveGoals, escapeActionUnit, parseBehaviour, wantsEscape } from '../../src/ai/goals'
import { createBattle, step, type Action, type BattleState } from '../../src/engine'
import { mk } from './helpers'

const withFields = (s: BattleState, extra: Record<string, unknown>): BattleState => ({ ...s, ...extra }) as BattleState

describe('M4 goals adapter (today: no objectives in the engine)', () => {
  it('defaults to routing the enemy commander and protecting ours, derived from the state (no side ids hard-coded)', () => {
    const s = createBattle('daxing-hill', 1)
    const han = deriveGoals(s, 'han')
    expect([...han.routWins]).toEqual(['cheng-yuanzhi'])
    expect([...han.protect]).toEqual(['liu-bei'])
    expect(han.holdsOnTimeout).toBe(false)
    const yellow = deriveGoals(s, 'yellow')
    expect([...yellow.routWins]).toEqual(['liu-bei'])
    expect([...yellow.protect]).toEqual(['cheng-yuanzhi'])
    expect(yellow.holdsOnTimeout).toBe(true)
    expect(han.urgency).toBeGreaterThan(yellow.urgency)
    // urgency rises as the turn limit nears for the side that must force a result
    const late = { ...s, round: 12 }
    expect(deriveGoals(late, 'han').urgency).toBeGreaterThan(han.urgency)
  })

  it('works with side ids other than han/yellow', () => {
    const base = createBattle('daxing-hill', 2)
    const renamed = {
      ...base,
      sideOrder: ['han', 'dong'],
      onTimeout: 'dong',
      units: base.units.map((u) => (u.side === 'yellow' ? { ...u, side: 'dong' } : u)),
    } as unknown as BattleState
    expect([...deriveGoals(renamed, 'dong').routWins]).toEqual(['liu-bei'])
    expect([...deriveGoals(renamed, 'han').routWins]).toEqual(['cheng-yuanzhi'])
  })
})

describe('M4 goals adapter (engine v2 fields, read when present)', () => {
  const base = createBattle('daxing-hill', 3)
  const objectives = {
    win: [
      { type: 'routUnits', units: ['deng-mao'] },
      { type: 'hold', tiles: [{ x: 3, y: 3 }], round: 8 },
      { type: 'escape', units: ['jian-yong'], count: 1, tiles: [[0, 5]] },
    ],
    lose: [{ type: 'unitLost', unit: 'zou-jing' }, { type: 'commanderLost' }, { type: 'timeout', round: 10 }],
  }

  it('reads objectives for the player side', () => {
    const g = deriveGoals(withFields(base, { objectives }), 'han')
    expect(g.routWins.has('deng-mao')).toBe(true)
    expect(g.routWins.has('cheng-yuanzhi')).toBe(false) // no routCommander in `win`, so the old default is replaced
    expect(g.protect.has('zou-jing')).toBe(true)
    expect(g.protect.has('liu-bei')).toBe(true)
    expect(g.pullTiles.some((t) => t.x === 3 && t.y === 3)).toBe(true)
    expect(g.escape).toEqual({ units: ['jian-yong'], count: 1, tiles: [{ x: 0, y: 5 }] })
    expect(wantsEscape(g, 'jian-yong')).toBe(true)
    expect(wantsEscape(g, 'guan-yu')).toBe(false)
  })

  it('mirrors them for the other side: the player failing is the enemy winning', () => {
    const g = deriveGoals(withFields(base, { objectives }), 'yellow')
    expect(g.routWins.has('zou-jing')).toBe(true)
    expect(g.routWins.has('liu-bei')).toBe(true)
    expect(g.protect.has('deng-mao')).toBe(true)
    expect(g.escape).toBeNull()
    expect(g.focus.has('jian-yong')).toBe(true)
  })

  it('parses enemyBehaviour hints wherever the data puts them, for enemy units only', () => {
    expect(parseBehaviour('hold')).toEqual({ kind: 'hold' })
    expect(parseBehaviour('ambush:4')).toEqual({ kind: 'ambush', range: 4 })
    expect(parseBehaviour('guard:liu-bei')).toEqual({ kind: 'guard', unit: 'liu-bei', range: 2 })
    expect(parseBehaviour('guard:4,5')).toEqual({ kind: 'guard', tile: { x: 4, y: 5 }, range: 2 })
    expect(parseBehaviour('pursue:guan-yu')).toEqual({ kind: 'pursue', unit: 'guan-yu' })
    expect(parseBehaviour('???')).toEqual({ kind: 'advance' })
    const hints = { 'deng-mao': 'ambush:3' }
    const deng = base.units.find((u) => u.id === 'deng-mao')!
    const liu = base.units.find((u) => u.id === 'liu-bei')!
    // Engine v2 stores the hints at state.enemyBehaviour (always present, {} when the battle has none).
    for (const s of [withFields(base, { enemyBehaviour: hints })]) {
      expect(deriveGoals(s, 'yellow').behaviour(deng).kind).toBe('ambush')
      expect(deriveGoals(s, 'han').behaviour(liu).kind).toBe('advance')
    }
    expect(deriveGoals(base, 'yellow').behaviour(deng).kind).toBe('advance')
  })

  it('an ambush unit holds its ground until a foe comes close; an advancing one moves', () => {
    const world = (): BattleState =>
      mk({
        w: 16,
        h: 10,
        side: 'yellow',
        units: [
          { id: 'han-cmd', side: 'han', commander: true, x: 0, y: 5, troops: 1500 },
          { id: 'y-cmd', side: 'yellow', commander: true, x: 15, y: 9, troops: 1500 },
          { id: 'sleeper', side: 'yellow', x: 12, y: 3, troops: 1500, facing: 'W' },
          { id: 'walker', side: 'yellow', x: 12, y: 7, troops: 1500, facing: 'W' },
        ],
      })
    const s = withFields(world(), { enemyBehaviour: { sleeper: 'ambush:3', 'y-cmd': 'hold' } })
    let cur = s
    for (let i = 0; i < 12; i++) {
      const a = decideAction(cur, { seed: 1, now: () => 0 })
      if (a.type === 'endPhase') break
      const r = step(cur, a)
      if (!r.ok) throw new Error(r.code)
      cur = r.state
    }
    const at = (id: string) => cur.units.find((u) => u.id === id)!
    expect([at('sleeper').x, at('sleeper').y]).toEqual([12, 3])
    expect([at('y-cmd').x, at('y-cmd').y]).toEqual([15, 9])
    expect(at('walker').x).toBeLessThan(12)
  })

  it('escape actions the engine may offer later are taken for units whose goal is to escape', () => {
    const s = withFields(base, { objectives })
    const ctx = buildCtx({ ...s, side: 'han' })
    const legal = [{ type: 'escape', unit: 'jian-yong' }, { type: 'escape', unit: 'guan-yu' }, { type: 'endPhase' }] as unknown as Action[]
    expect(escapeActionUnit(legal[0])).toBe('jian-yong')
    expect(escapeActionUnit({ type: 'wait' })).toBeNull()
    const c = escapeCandidates(ctx, legal)
    expect(c.map((x) => x.unit)).toEqual(['jian-yong'])
    expect(c[0]!.gain).toBeGreaterThan(1000)
  })
})
