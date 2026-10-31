import { describe, expect, it } from 'vitest'
import { query } from '../../src/engine'
import { EMPTY_UI, canControl, pendingOrder } from '../../src/client/store/orders'
import { mk, strat } from './helpers'

describe('pending orders (client formatting only; every number comes from query.*)', () => {
  const world = () =>
    mk({
      units: [
        { id: 'a1', side: 'han', type: 'archers', x: 3, y: 5, strats: ['arrow-rain'], qi: 3 },
        { id: 'b1', side: 'han', x: 5, y: 5, strats: ['crescent-sweep'], qi: 4 },
        { id: 'e', side: 'yellow', x: 6, y: 5, facing: 'W', troops: 9000, lead: 50 },
      ],
    })

  it('an attack seal names the foe and carries the preview range and counter', () => {
    const s = world()
    const o = pendingOrder(s, { ...EMPTY_UI, selectedId: 'b1', mode: 'attack', pendingTarget: 'e' })
    const pv = query.attackPreview(s, 'b1', 'e')!
    expect(o).not.toBeNull()
    expect(o!.label).toContain('Seal: Attack → e')
    expect(o!.label).toContain(pv.damage.min.toLocaleString('en-US'))
    expect(o!.label).toContain(pv.damage.max.toLocaleString('en-US'))
    expect(o!.action).toEqual({ type: 'attack', unit: 'b1', target: 'e' })
  })

  it('a stratagem seal shows the opening range and the planned chain length', () => {
    const s = world()
    const o = pendingOrder(s, { ...EMPTY_UI, selectedId: 'a1', mode: 'stratagem', strat: 'arrow-rain', pendingAnchor: { x: 6, y: 5 } })
    expect(o).not.toBeNull()
    expect(o!.label).toMatch(/^Seal: Arrow Rain → /)
    expect(o!.label).toMatch(/chain ×\d/)
    expect(o!.action).toEqual(strat('a1', 'arrow-rain', 6, 5))
  })

  it('excluding a link lowers the planned chain in the seal text', () => {
    const s = world()
    const full = pendingOrder(s, { ...EMPTY_UI, selectedId: 'a1', mode: 'stratagem', strat: 'arrow-rain', pendingAnchor: { x: 6, y: 5 } })!
    const cut = pendingOrder(s, { ...EMPTY_UI, selectedId: 'a1', mode: 'stratagem', strat: 'arrow-rain', pendingAnchor: { x: 6, y: 5 }, exclude: ['b1'] })!
    expect(full.label).toContain('chain ×2')
    expect(cut.label).not.toContain('chain')
    expect(cut.action).toMatchObject({ excludeFromChain: ['b1'] })
  })

  it('a wait seal names the facing, and nothing is offered for the other side or a done unit', () => {
    const s = world()
    expect(pendingOrder(s, { ...EMPTY_UI, selectedId: 'b1', mode: 'wait', pendingFacing: 'E' })!.label).toBe('Seal: Wait, facing east')
    expect(pendingOrder(s, { ...EMPTY_UI, selectedId: 'e', mode: 'wait', pendingFacing: 'E' })).toBeNull()
    expect(canControl(s, s.units.find((u) => u.id === 'e'))).toBe(false)
    const doneState = { ...s, units: s.units.map((u) => (u.id === 'b1' ? { ...u, done: true } : u)) }
    expect(canControl(doneState, doneState.units.find((u) => u.id === 'b1'))).toBe(false)
  })

  it('no seal ever reads "OK"', () => {
    const s = world()
    for (const mode of ['attack', 'sway', 'stratagem', 'wait'] as const) {
      const o = pendingOrder(s, { ...EMPTY_UI, selectedId: 'a1', mode, strat: 'arrow-rain', pendingAnchor: { x: 6, y: 5 }, pendingTarget: 'e', pendingFacing: 'N' })
      if (o) expect(o.label).not.toMatch(/\bOK\b/)
    }
  })
})
