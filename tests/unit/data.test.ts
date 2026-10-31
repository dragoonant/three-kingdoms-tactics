import { describe, expect, it } from 'vitest'
import { ALL_BATTLES, ALL_OFFICERS, GAME_DATA, getBattleDef, validateData } from '../../src/data'

describe('data (M1)', () => {
  it('validateData reports no problems', () => {
    expect(validateData()).toEqual([])
  })
  it('daxing hill has the specified shape', () => {
    const b = getBattleDef('daxing-hill')!
    expect(b.map).toHaveLength(12)
    expect(b.turnLimit).toBe(15)
    expect(b.onTimeout).toBe('yellow')
    expect(b.sideOrder).toEqual(['han', 'yellow'])
    expect(b.units).toHaveLength(12)
    expect(b.wind.map((w) => w.round)).toEqual([1, 6, 9, 12])
    expect(Object.keys(ALL_BATTLES)).toContain('daxing-hill')
  })
  it('flags invented officers', () => {
    const invented = ALL_OFFICERS.filter((o) => o.invented).map((o) => o.id).sort()
    expect(invented).toEqual(['captain-gao', 'captain-ma', 'captain-sun', 'captain-wu', 'taiping-adept'])
  })
  it('lookup tables are indexed by id', () => {
    expect(GAME_DATA.officers['liu-bei']!.cha).toBe(98)
    expect(GAME_DATA.stratagems['arrow-rain']!.neighborMult).toBe(0.6)
    expect(GAME_DATA.terrain.river.move).toBeNull()
  })
})
