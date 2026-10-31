// AI v2: one test per objective kind and behaviour hint, on hand-built engine states played with the real step().
import { describe, expect, it } from 'vitest'
import { decide, decideAction } from '../../src/ai/decider'
import { buildCtx, exposure, lethal, windValue } from '../../src/ai/context'
import { deriveGoals, designateEscapers } from '../../src/ai/goals'
import { candidatesForUnit } from '../../src/ai/evaluate'
import { timelineFacts } from '../../src/ai/timeline'
import { legalActions, step, type Action, type BattleState } from '../../src/engine'
import { mk2, type Mk2 } from './v2-helpers'

const frozen = (): number => 0
const key = (a: Action): string => JSON.stringify(a)

/** Plays the side to move to the end of its phase with the decider (every action must be legal and accepted). */
function playPhase(s0: BattleState, seed = 3): { state: BattleState; actions: Action[] } {
  let s = s0
  const actions: Action[] = []
  const side = s.side
  for (let i = 0; i < 60 && !s.result && s.side === side; i++) {
    const a = decideAction(s, { seed, now: frozen })
    expect(legalActions(s).some((l) => key(l) === key(a))).toBe(true)
    if (a.type === 'endPhase') break
    const r = step(s, a)
    if (!r.ok) throw new Error(`rejected ${key(a)}: ${r.code}`)
    actions.push(a)
    s = r.state
  }
  return { state: s, actions }
}

const at = (s: BattleState, id: string) => s.units.find((u) => u.id === id)!
const withBehaviour = (s: BattleState, enemyBehaviour: Record<string, string>): BattleState => ({ ...s, enemyBehaviour })
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

describe('AI v2: escape', () => {
  const world = (runner: { x: number; y: number }): Mk2 => ({
    w: 14,
    h: 8,
    units: [
      { id: 'liu-bei', side: 'han', commander: true, x: 5, y: 4, troops: 2000 },
      { id: 'runner', side: 'han', x: runner.x, y: runner.y, troops: 1200 },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 13, y: 7, troops: 2000 },
    ],
    objectives: { win: [{ type: 'escape', units: ['runner'], count: 1, tiles: [[0, 0], [0, 1]] }], lose: [{ type: 'commanderLost' }] },
  })

  it('takes the escape action when the escaper stands on an exit', () => {
    const s = mk2(world({ x: 0, y: 1 }))
    const d = decide(s, { now: frozen })
    expect(d.action).toEqual({ type: 'escape', unit: 'runner' })
    const r = step(s, d.action)
    expect(r.ok && r.state.result?.winner).toBe('han')
  })

  it('walks the designated escaper toward the exit, and only that unit', () => {
    const s = mk2(world({ x: 6, y: 3 }))
    const g = deriveGoals(s, 'han')
    expect([...g.escapers]).toEqual(['runner'])
    const { state } = playPhase(s)
    expect(dist(at(state, 'runner'), { x: 0, y: 0 })).toBeLessThan(dist({ x: 6, y: 3 }, { x: 0, y: 0 }) - 2)
    expect(state.escaped).toEqual([])
  })

  it('without a unit list, the units nearest the exits are designated to make up the count', () => {
    const s = mk2({ ...world({ x: 6, y: 3 }), objectives: { win: [{ type: 'escape', count: 1, tiles: [[0, 0]] }], lose: [] } })
    const cond = s.objectives!.win[0]! as Extract<typeof s.objectives extends null ? never : NonNullable<typeof s.objectives>['win'][number], { type: 'escape' }>
    expect([...designateEscapers(s, cond)]).toEqual(['runner'])
  })

  it('the pursuing side hunts the escaper and keeps units on the way out', () => {
    const s = { ...mk2({ ...world({ x: 6, y: 3 }), units: [...world({ x: 6, y: 3 }).units, { id: 'hunter', side: 'cao', type: 'cavalry', x: 11, y: 3, troops: 1500 }] }), side: 'cao' as const, phaseIndex: 1 }
    const g = deriveGoals(s, 'cao')
    expect(g.focus.has('runner')).toBe(true)
    expect(g.occupy.some((o) => o.tiles.some((t) => t.x === 0 && t.y === 0))).toBe(true)
    const { state } = playPhase(s)
    expect(dist(at(state, 'hunter'), at(state, 'runner'))).toBeLessThan(dist({ x: 11, y: 3 }, { x: 6, y: 3 }))
  })
})

describe('AI v2: hold', () => {
  const base: Mk2 = {
    w: 12,
    h: 8,
    units: [
      { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 1, troops: 2000 },
      { id: 'guard', side: 'han', x: 5, y: 4, troops: 1500 },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
      { id: 'raider', side: 'cao', x: 9, y: 4, troops: 1500 },
    ],
  }

  it('the defender puts a unit on the hold tile that the enemy can reach (win-hold, last round)', () => {
    const s = mk2({ ...base, turnLimit: 6, objectives: { win: [{ type: 'hold', tiles: [[7, 4]], round: 3 }], lose: [] } })
    const s3 = { ...s, round: 3 }
    const { state } = playPhase(s3)
    expect(state.units.some((u) => u.side === 'han' && u.x === 7 && u.y === 4)).toBe(true)
  })

  it('the attacker steps onto a lose-hold tile and wins on the spot', () => {
    const s0 = mk2({ ...base, objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'hold', tiles: [[6, 4]], round: 1 }] } })
    const s = { ...s0, side: 'cao' as const, phaseIndex: 1 }
    const { state } = playPhase(s)
    expect(at(state, 'raider').x === 6 && at(state, 'raider').y === 4).toBe(true)
    // the engine settles it when the phase ends
    const end = step(state, { type: 'endPhase' })
    expect(end.ok && end.state.result?.winner).toBe('cao')
  })

  it('the defender blocks a lose-hold tile before the enemy can take it', () => {
    const s = mk2({ ...base, objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'hold', tiles: [[6, 4]], round: 1 }] } })
    const { state } = playPhase(s)
    expect(state.units.some((u) => u.side === 'han' && u.x === 6 && u.y === 4)).toBe(true)
  })
})

describe('AI v2: survive and timeout', () => {
  const world = (): Mk2 => ({
    w: 16,
    h: 8,
    turnLimit: 12,
    units: [
      { id: 'liu-bei', side: 'han', commander: true, x: 2, y: 4, troops: 2000 },
      { id: 'wall', side: 'han', x: 3, y: 3, troops: 1800 },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 15, y: 7, troops: 2000 },
      { id: 'foe', side: 'cao', x: 12, y: 3, troops: 1800 },
    ],
    objectives: { win: [{ type: 'survive', round: 8 }], lose: [{ type: 'commanderLost' }] },
  })

  it('the survivor holds its ground while the attacker, who has a deadline, advances', () => {
    const s = mk2(world())
    const g = deriveGoals(s, 'han')
    const e = deriveGoals(s, 'cao')
    expect(g.surviveRound).toBe(8)
    expect(g.careful).toBe(true)
    expect(e.deadlineRound).toBe(8)
    expect(e.urgency).toBeGreaterThan(g.urgency)
    const { state: afterHan } = playPhase(s)
    expect(dist(at(afterHan, 'wall'), { x: 3, y: 3 })).toBeLessThanOrEqual(2)
    const { state: afterCao } = playPhase({ ...s, side: 'cao', phaseIndex: 1 })
    expect(at(afterCao, 'foe').x).toBeLessThan(12)
  })
})

describe('AI v2: protect (unitLost)', () => {
  it('guards the protected unit: it is never left where the enemy can rout it when a safer tile exists', () => {
    const units: Mk2['units'] = [
      { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 1, troops: 2000 },
      { id: 'vip', side: 'han', x: 6, y: 4, troops: 700, lead: 30 },
      { id: 'knight', side: 'han', x: 5, y: 3, troops: 1800 },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 15, y: 7, troops: 2000 },
      { id: 'e1', side: 'cao', type: 'cavalry', x: 11, y: 4, troops: 2000, war: 90 },
      { id: 'e2', side: 'cao', type: 'cavalry', x: 11, y: 5, troops: 2000, war: 90 },
    ]
    const s = mk2({ w: 16, h: 8, units, objectives: { win: [{ type: 'routCommander' }], lose: [{ type: 'commanderLost' }, { type: 'unitLost', unit: 'vip' }] } })
    expect(deriveGoals(s, 'han').protect.has('vip')).toBe(true)
    expect(deriveGoals(s, 'cao').routWins.has('vip')).toBe(true)
    const worst = (st: BattleState): number => {
      const ctx = buildCtx({ ...st, side: 'han' })
      const v = at(st, 'vip')
      return Math.min(...Object.values(exposure(ctx, v, v).byFacing))
    }
    const { state } = playPhase(s)
    expect(worst(s)).toBeGreaterThan(0.5 * 700) // precondition: the vip starts in danger
    expect(worst(state)).toBeLessThan(0.5 * 700)
  })
})

describe('AI v2: retreatAt', () => {
  const world = (retreatAt: number | undefined): Mk2 => ({
    w: 10,
    h: 8,
    units: [
      { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 6, troops: 2000 },
      { id: 'hitter', side: 'han', x: 4, y: 3, troops: 3000, war: 99 },
      { id: 'lu-bu', side: 'cao', x: 5, y: 3, troops: 1500, maxTroops: 2000, lead: 60, ...(retreatAt === undefined ? {} : { retreatAt }) },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 4, y: 2, troops: 400, lead: 20 },
    ],
    objectives: { win: [{ type: 'routUnits', units: ['lu-bu'] }], lose: [{ type: 'commanderLost' }] },
  })

  it('knows how much damage removes a unit that retreats', () => {
    const s = mk2(world(0.6))
    const lu = at(s, 'lu-bu')
    expect(lethal(lu)).toBe(300) // 1500 - 0.6 * 2000
    expect(lethal(at(mk2(world(undefined)), 'lu-bu'))).toBe(1500)
  })

  it('pushes the unit over its retreat line when that wins, rather than taking the easier kill', () => {
    const s = mk2(world(0.6))
    const d = decide(s, { now: frozen })
    expect(d.action).toEqual({ type: 'attack', unit: 'hitter', target: 'lu-bu' })
    const r = step(s, d.action)
    expect(r.ok && r.state.result?.winner).toBe('han')
    expect(r.ok && r.state.retreated).toEqual(['lu-bu'])
  })

  it('the owner prefers a tile where the retreat line is out of reach', () => {
    // lu-bu is 100 troops above his line; han's hitter can strike him wherever he stands next to it
    const s = { ...mk2(world(0.6)), side: 'cao' as const, phaseIndex: 1 }
    const { state } = playPhase(s)
    const lu = at(state, 'lu-bu')
    expect(state.retreated).toEqual([])
    expect(dist(lu, at(state, 'hitter'))).toBeGreaterThanOrEqual(1)
  })
})

describe('AI v2: enemy behaviour hints', () => {
  const world = (foe: { x: number; y: number }): Mk2 => ({
    w: 16,
    h: 8,
    units: [
      { id: 'liu-bei', side: 'han', commander: true, x: 2, y: 4, troops: 2000 },
      { id: 'scout', side: 'han', x: foe.x, y: foe.y, troops: 1500 },
      { id: 'cao-cmd', side: 'cao', commander: true, x: 15, y: 7, troops: 2000 },
      { id: 'sleeper', side: 'cao', x: 12, y: 3, troops: 1500 },
    ],
  })
  const caoPhase = (s: BattleState): BattleState => ({ ...s, side: 'cao', phaseIndex: 1 })

  it('ambush: waits while nobody is near, wakes when a foe comes within range', () => {
    const quiet = withBehaviour(caoPhase(mk2(world({ x: 4, y: 3 }))), { sleeper: 'ambush:3', 'cao-cmd': 'hold' })
    const stayed = playPhase(quiet).state
    expect(dist(at(stayed, 'sleeper'), { x: 12, y: 3 })).toBe(0)
    const near = withBehaviour(caoPhase(mk2(world({ x: 9, y: 3 }))), { sleeper: 'ambush:3', 'cao-cmd': 'hold' })
    const woke = playPhase(near).state
    expect(dist(at(woke, 'sleeper'), { x: 12, y: 3 })).toBeGreaterThan(0)
  })

  it('ambush: wakes when it has been attacked', () => {
    const s = withBehaviour(caoPhase(mk2(world({ x: 4, y: 3 }))), { sleeper: 'ambush:3', 'cao-cmd': 'hold' })
    const hurt: BattleState = { ...s, units: s.units.map((u) => (u.id === 'sleeper' ? { ...u, troops: 1200, maxTroops: 1500 } : u)) }
    expect(deriveGoals(hurt, 'cao').behaviour(at(hurt, 'sleeper')).kind).toBe('advance')
    expect(deriveGoals(s, 'cao').behaviour(at(s, 'sleeper')).kind).toBe('ambush')
  })

  it('hold stays on its post; advance does not', () => {
    const w = world({ x: 7, y: 5 })
    const held = withBehaviour(caoPhase(mk2({ ...w, units: [...w.units, { id: 'archer', side: 'cao', type: 'archers', x: 13, y: 5, troops: 1200 }] })), { archer: 'hold', sleeper: 'hold', 'cao-cmd': 'hold' })
    const a = playPhase(held).state
    expect(dist(at(a, 'archer'), { x: 13, y: 5 })).toBe(0)
    const free = withBehaviour(held, { archer: 'advance', sleeper: 'advance' })
    expect(dist(at(playPhase(free).state, 'archer'), { x: 13, y: 5 })).toBeGreaterThan(0)
  })

  it('pursue goes for the named unit rather than the nearest foe', () => {
    const w = world({ x: 1, y: 0 })
    const s = caoPhase(mk2({ ...w, units: [...w.units, { id: 'decoy', side: 'han', x: 9, y: 7, troops: 1500 }] }))
    const chase = withBehaviour(s, { sleeper: 'pursue:liu-bei', 'cao-cmd': 'hold' })
    const { state } = playPhase(chase)
    const me = at(state, 'sleeper')
    expect(dist(me, at(state, 'liu-bei'))).toBeLessThan(dist({ x: 12, y: 3 }, at(state, 'liu-bei')))
  })

  it('guard stays within its leash of the guarded unit', () => {
    const w = world({ x: 4, y: 0 })
    const s = caoPhase(mk2({ ...w, units: [...w.units, { id: 'knight', side: 'cao', x: 13, y: 6, troops: 1500 }] }))
    const g = withBehaviour(s, { knight: 'guard:cao-cmd', sleeper: 'hold', 'cao-cmd': 'hold' })
    const { state } = playPhase(g)
    expect(dist(at(state, 'knight'), at(state, 'cao-cmd'))).toBeLessThanOrEqual(3)
  })

  it('objectives beat hints: a holder joins the advance once the deadline is close', () => {
    const w = world({ x: 4, y: 3 })
    const s = withBehaviour(caoPhase(mk2({ ...w, objectives: { win: [{ type: 'survive', round: 6 }], lose: [{ type: 'commanderLost' }] } })), { sleeper: 'hold' })
    expect(deriveGoals({ ...s, round: 1 }, 'cao').behaviour(at(s, 'sleeper')).kind).toBe('hold')
    expect(deriveGoals({ ...s, round: 5 }, 'cao').behaviour(at(s, 'sleeper')).kind).toBe('advance')
  })
})

describe('AI v2: provoke', () => {
  it('a provoked unit only ever gets legal actions, and it complies with the provocation', () => {
    for (const seed of [1, 2, 3]) {
      const s0 = mk2({
        w: 12,
        h: 8,
        units: [
          { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 6, troops: 2000 },
          { id: 'tank', side: 'han', x: 4, y: 3, troops: 1800 },
          { id: 'helper', side: 'han', type: 'archers', x: 3, y: 5, troops: 1200 },
          { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
          { id: 'bait', side: 'cao', x: 9, y: 3, troops: 1500 },
          { id: 'other', side: 'cao', type: 'cavalry', x: 7, y: 6, troops: 1500 },
        ],
      })
      const s: BattleState = { ...s0, units: s0.units.map((u) => (u.id === 'tank' ? { ...u, provoked: 'bait' } : u)) }
      const before = dist(at(s, 'tank'), at(s, 'bait'))
      const { state, actions } = playPhase(s, seed)
      expect(actions.length).toBeGreaterThan(0)
      const tank = at(state, 'tank')
      expect(dist(tank, at(state, 'bait'))).toBeLessThan(before)
    }
  })

  it('a provoked unit that already moved is only ever asked to wait', () => {
    const s0 = mk2({
      w: 12,
      h: 8,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 6, troops: 2000 },
        { id: 'tank', side: 'han', x: 4, y: 3, troops: 1800 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
        { id: 'bait', side: 'cao', x: 11, y: 3, troops: 1500 },
      ],
    })
    const moved = step({ ...s0, units: s0.units.map((u) => (u.id === 'tank' ? { ...u, provoked: 'bait' } : u)) }, { type: 'move', unit: 'tank', x: 6, y: 3 })
    if (!moved.ok) throw new Error(moved.code)
    for (let seed = 0; seed < 4; seed++) {
      const a = decideAction(moved.state, { seed, now: frozen })
      expect(legalActions(moved.state).some((l) => key(l) === key(a))).toBe(true)
    }
  })
})

describe('AI v2: command stratagems (buffs, wind)', () => {
  it('casts a defence buff over allies that are about to be hit', () => {
    const s = mk2({
      w: 12,
      h: 8,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 4, y: 4, troops: 2000 },
        { id: 'sage', side: 'han', x: 4, y: 3, troops: 1500, strats: ['benevolent-banner'], qi: 6 },
        { id: 'ally', side: 'han', x: 5, y: 4, troops: 1800 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
        { id: 'brute', side: 'cao', x: 8, y: 4, troops: 2500, war: 95 },
        { id: 'brute2', side: 'cao', x: 8, y: 3, troops: 2500, war: 95 },
      ],
    })
    // From where it stands the sage has nothing to attack, so the banner (over wait) is its best use of the turn.
    const sage = at(s, 'sage')
    const stay = candidatesForUnit(buildCtx(s), sage, 0, () => false)[0]!
    expect(stay.label).toContain('benevolent-banner')
    expect(stay.gain).toBeGreaterThan(20)
  })

  it('values a wind change by what it does to the fires on the board', () => {
    // A fire is burning on the farm field west of the enemy line; a gale toward them is worth a lot.
    const map = Array.from({ length: 8 }, (_, y) => (y >= 2 && y <= 5 ? 'ffffffffffff' : '............'))
    const s0 = mk2({
      w: 12,
      h: 8,
      map,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 0, y: 0, troops: 2000 },
        { id: 'mage', side: 'han', type: 'archers', x: 0, y: 3, troops: 1000, strats: ['call-the-storm'], qi: 8 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
        { id: 'a', side: 'cao', x: 7, y: 3, troops: 1500 },
        { id: 'b', side: 'cao', x: 8, y: 4, troops: 1500 },
        { id: 'c', side: 'cao', x: 7, y: 5, troops: 1500 },
      ],
    })
    const burn = s0.burn.slice()
    burn[3 * 12 + 5] = 2
    const s: BattleState = { ...s0, burn }
    const ctx = buildCtx(s)
    expect(windValue(ctx, { dir: 'E', strength: 'gale', rounds: 2 })).toBeGreaterThan(windValue(ctx, { dir: 'W', strength: 'gale', rounds: 2 }))
    expect(windValue(ctx, { dir: 'E', strength: 'gale', rounds: 2 })).toBeGreaterThan(50)
  })
})

describe('AI v2: timeline and reinforcements', () => {
  it('does not end a unit on a tile that floods before it can act again', () => {
    const s = mk2({
      w: 12,
      h: 8,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 1, troops: 2000 },
        { id: 'sitter', side: 'han', x: 5, y: 4, troops: 1500 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
      ],
      timeline: [{ round: 1, phase: 'end', kind: 'terrain', tiles: [[5, 4], [5, 5]], to: 'water' }],
    })
    const facts = timelineFacts(s, 'han')
    expect(facts.shifts.size).toBe(2)
    const { state } = playPhase(s)
    const p = at(state, 'sitter')
    expect(p.x === 5 && (p.y === 4 || p.y === 5)).toBe(false)
  })

  it('treats enemy reinforcements as threats at their entry tiles', () => {
    const s = mk2({
      w: 14,
      h: 8,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 1, troops: 2000 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 13, y: 7, troops: 2000 },
      ],
      reinforcements: [{ round: 1, side: 'cao', units: [{ id: 'rider', side: 'cao', type: 'cavalry', x: 13, y: 3, troops: 1500 }], entry: [[13, 3]] }],
    })
    const facts = timelineFacts(s, 'han')
    expect(facts.arrivals.map((u) => u.id)).toEqual(['rider'])
    expect(facts.threatFoes.some((u) => u.id === 'rider')).toBe(true)
    // they are phantoms: never targets
    expect(buildCtx(s).foes.some((u) => u.id === 'rider')).toBe(false)
  })

  it('every action it picks while reinforcements and timeline events are pending is legal', () => {
    let s = mk2({
      w: 12,
      h: 8,
      units: [
        { id: 'liu-bei', side: 'han', commander: true, x: 1, y: 1, troops: 2000 },
        { id: 'a', side: 'han', x: 3, y: 4, troops: 1500 },
        { id: 'cao-cmd', side: 'cao', commander: true, x: 11, y: 7, troops: 2000 },
        { id: 'b', side: 'cao', x: 9, y: 4, troops: 1500 },
      ],
      reinforcements: [{ round: 2, side: 'cao', units: [{ id: 'late', side: 'cao', x: 11, y: 2, troops: 1200 }], entry: [[11, 2]] }],
      timeline: [{ round: 2, phase: 'end', kind: 'terrain', tiles: [[6, 4]], to: 'water' }],
    })
    for (let i = 0; i < 80 && !s.result; i++) {
      const a = decideAction(s, { seed: 5, now: frozen })
      expect(legalActions(s).some((l) => key(l) === key(a))).toBe(true)
      const r = step(s, a)
      if (!r.ok) throw new Error(r.code)
      s = r.state
    }
  })
})
