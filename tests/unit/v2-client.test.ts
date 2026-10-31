import { describe, expect, it } from 'vitest'
import { chooseAction, makePolicyRng } from '../../tools/policy'
import { createBattle, legalActions, step, type Action, type BattleState, type GameEvent } from '../../src/engine'
import { lineFor } from '../../src/client/ledger'
import { planBeats } from '../../src/client/presentation/beats'
import { applyEvents, comparable, sceneFromState, type Scene } from '../../src/client/presentation/scene'
import { sideTitle, phaseLabel } from '../../src/client/names'
import { sideColour } from '../../src/client/board/layout'

describe('R2-CLIENT the client follows the v2 events', () => {
  it('R2-CLIENT-1 every v2 event of real proving-ground games reads as a clean ledger line and the presented scene converges to the live state', () => {
    const seen = new Set<string>()
    const want = ['retreated', 'escaped', 'reinforced', 'terrainChanged', 'timelineMessage', 'buffed', 'provoked', 'objectiveProgress']
    for (let seed = 1; seed <= 60 && !(seed > 4 && want.every((k) => seen.has(k))); seed++) {
      const rnd = makePolicyRng(seed)
      let s: BattleState = createBattle('proving-ground', seed)
      let guard = 0
      while (!s.result && guard++ < 3000) {
        const r = step(s, chooseAction(s, rnd, legalActions(s)))
        if (!r.ok) throw new Error(r.message)
        for (const e of r.events as GameEvent[]) {
          seen.add(e.kind)
          const line = lineFor(e, s)
          expect(line.text.length).toBeGreaterThan(5)
          expect(line.text).not.toMatch(/undefined|NaN|\[object|null/)
        }
        const beats = planBeats(r.events, s)
        expect(beats.flatMap((b) => b.commit)).toHaveLength(r.events.length)
        const end = beats.reduce<Scene>((sc, b) => applyEvents(sc, b.commit), sceneFromState(s))
        expect(comparable(end, !r.state.result)).toEqual(comparable(sceneFromState(r.state), !r.state.result))
        s = r.state
      }
    }
    for (const k of want) expect(seen.has(k), k).toBe(true)
  }, 120_000)

  it('R2-CLIENT-2 side names and colours come from the battle data', () => {
    const d = createBattle('hulao-gate', 1)
    expect(sideTitle(d, 'dong')).toBe("The Dong Zhuo's army")
    expect(phaseLabel(d, 'dong')).toBe("Dong Zhuo's army")
    const y = createBattle('daxing-hill', 1)
    expect(sideTitle(y, 'yellow')).toBe('The Yellow Turban host')
    expect(phaseLabel(y, 'yellow')).toBe('Yellow Turbans')
    expect(sideColour('dong')).toBe('#6b1f2a')
    expect(sideColour('cao')).toBe('#34495e')
    expect(sideColour('lu')).toBe('#5b2c6f')
    expect(sideColour('yellow')).toBe('#d4a72c')
  })
})

describe('step never throws, legalActions never empty before a result (v2 actions)', () => {
  it('R2-CONTRACT-1 malformed and out-of-phase v2 actions are rejected, never thrown', () => {
    const s = createBattle('proving-ground', 1)
    const bad: unknown[] = [
      { type: 'escape' }, { type: 'escape', unit: 3 }, { type: 'escape', unit: 'nobody' }, { type: 'escape', unit: 'pg-priest' },
      { type: 'escape', unit: 'liu-bei' }, { type: 'stratagem', unit: 'zhuge-liang', strat: 'borrow-the-wind', x: 1, y: 3, excludeFromChain: [] },
    ]
    for (const a of bad) {
      const r = step(s, a as Action)
      expect(r.ok).toBe(false)
    }
  })
  it('R2-CONTRACT-1 legalActions is never empty before the result over whole proving-ground games, and every offered action is accepted', () => {
    for (const seed of [11, 12, 13]) {
      const rnd = makePolicyRng(seed)
      let s = createBattle('proving-ground', seed)
      let guard = 0
      while (!s.result && guard++ < 3000) {
        const legal = legalActions(s)
        expect(legal.length).toBeGreaterThan(0)
        if (guard % 5 === 0) for (const a of legal) expect(step(s, a).ok, JSON.stringify(a)).toBe(true)
        const r = step(s, chooseAction(s, rnd, legal))
        if (!r.ok) throw new Error(r.message)
        s = r.state
      }
      expect(s.result).not.toBeNull()
    }
  })
})
