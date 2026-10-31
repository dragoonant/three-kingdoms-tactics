import { describe, expect, it } from 'vitest'
import { createBattle, step, type BattleState } from '../../src/engine'
import { patch } from './helpers'

// RULING R-SWAY-3 (PLAN.md): a unit swayed while standing on its old side's gate steps off it.
describe('R-SWAY-3 swayed unit on its old gate', () => {
  it('steps to the nearest tile its new side can stand on', () => {
    let moved = 0
    for (let seed = 1; seed <= 60 && moved === 0; seed++) {
      let s: BattleState = createBattle('hulao-gate', seed)
      s = patch(s, 'hulao-gate-guard', { x: 9, y: 5, troops: 100 })
      s = patch(s, 'liu-bei', { x: 8, y: 5, qi: 6, done: false, moved: false })
      const r = step(s, { type: 'sway', unit: 'liu-bei', target: 'hulao-gate-guard' })
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      const g = r.state.units.find((x) => x.id === 'hulao-gate-guard')
      if (!g || g.side !== 'han') continue
      expect(r.state.grid.tiles[g.y * r.state.grid.width + g.x]!.terrain).not.toBe('gate')
      expect(r.events.some((e) => e.kind === 'moved' && e.unit === 'hulao-gate-guard')).toBe(true)
      moved++
    }
    expect(moved).toBe(1)
  })
})
