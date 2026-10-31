import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, inBounds, makeGrid } from '../../src/engine'

describe('makeGrid', () => {
  it('creates w*h plain tiles with coordinates', () => {
    const g = makeGrid(12, 12)
    expect(g.width).toBe(12)
    expect(g.height).toBe(12)
    expect(g.tiles).toHaveLength(144)
    expect(g.tiles[0]).toEqual({ x: 0, y: 0, terrain: 'plain' })
    expect(g.tiles[13]).toEqual({ x: 1, y: 1, terrain: 'plain' })
    expect(g.tiles[143]).toEqual({ x: 11, y: 11, terrain: 'plain' })
  })

  it('supports non-square grids', () => {
    expect(makeGrid(3, 2).tiles).toHaveLength(6)
  })
})

describe('inBounds', () => {
  const g = makeGrid(12, 12)
  it('accepts corners and interior', () => {
    expect(inBounds(g, 0, 0)).toBe(true)
    expect(inBounds(g, 11, 11)).toBe(true)
    expect(inBounds(g, 5, 7)).toBe(true)
  })
  it('rejects out-of-range and non-integer', () => {
    expect(inBounds(g, -1, 0)).toBe(false)
    expect(inBounds(g, 0, 12)).toBe(false)
    expect(inBounds(g, 12, 0)).toBe(false)
    expect(inBounds(g, 1.5, 2)).toBe(false)
  })
})

describe('engine', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
