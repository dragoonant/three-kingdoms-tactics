// Board locomotion helpers (docs/spec/50-presentation.md "Board figures"): the distance profile of a move beat, sampling the
// engine's path with smooth turns through the corners, and the beat time that follows the path length.
import { describe, expect, it } from 'vitest'
import { FOOT_SPEED, RIDER_SPEED, angDiff, movePhases, pathLength, samplePath, trapezoid, travelSpeed, turnAllowance, type PathPoint } from '../../src/client/board/travel'

const L: PathPoint[] = [
  { x: 0, z: 0, y: 0 },
  { x: 0, z: 1, y: 0 },
  { x: 0, z: 2, y: 0 },
  { x: 1, z: 2, y: 0.4 },
  { x: 2, z: 2, y: 0.4 },
]

describe('trapezoid', () => {
  it('covers the whole path, monotonically, with zero speed at both ends', () => {
    expect(trapezoid(0).q).toBe(0)
    expect(trapezoid(1).q).toBeCloseTo(1, 9)
    expect(trapezoid(0).dq).toBe(0)
    expect(trapezoid(1).dq).toBeCloseTo(0, 9)
    let last = -1
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const q = trapezoid(p).q
      expect(q).toBeGreaterThanOrEqual(last)
      last = q
    }
  })
  it('speed matches the slope of the distance', () => {
    for (const p of [0.05, 0.3, 0.6, 0.9]) {
      const h = 1e-4
      const slope = (trapezoid(p + h).q - trapezoid(p - h).q) / (2 * h)
      expect(trapezoid(p).dq).toBeCloseTo(slope, 3)
    }
  })
})

describe('samplePath', () => {
  it('follows the tile centres and interpolates the ground height', () => {
    expect(pathLength(L)).toBe(4)
    expect(samplePath(L, 0)).toMatchObject({ x: 0, z: 0 })
    expect(samplePath(L, 1.5)).toMatchObject({ x: 0, z: 1.5 })
    const c = samplePath(L, 2.5)
    expect(c.x).toBeCloseTo(0.5, 9)
    expect(c.z).toBeCloseTo(2, 9)
    expect(c.y).toBeCloseTo(0.2, 9)
    expect(samplePath(L, 99)).toMatchObject({ x: 2, z: 2 })
  })
  it('turns smoothly through a corner instead of snapping', () => {
    // heading 0 (toward +z) before the corner at distance 2, pi/2 (toward +x) after
    expect(samplePath(L, 1.0).heading).toBeCloseTo(0, 6)
    expect(samplePath(L, 3.0).heading).toBeCloseTo(Math.PI / 2, 6)
    const mid = samplePath(L, 2.0).heading
    expect(mid).toBeGreaterThan(0.6)
    expect(mid).toBeLessThan(0.95)
    let last = -1
    for (let d = 1.5; d <= 2.5; d += 0.02) {
      const h = samplePath(L, d).heading
      expect(h).toBeGreaterThanOrEqual(last)
      last = h
    }
  })
  it('handles the shortest way round for angles', () => {
    expect(angDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9)
    expect(angDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9)
  })
})

describe('speeds and turns', () => {
  it('riders go faster than foot soldiers', () => {
    expect(travelSpeed('infantry')).toBe(FOOT_SPEED)
    expect(travelSpeed('archers')).toBe(FOOT_SPEED)
    expect(travelSpeed('cavalry')).toBe(RIDER_SPEED)
    expect(RIDER_SPEED).toBeGreaterThan(FOOT_SPEED * 1.8)
  })
  it('turns on the spot only when the heading differs by more than a little', () => {
    expect(movePhases(0.1, 0.2, 900)).toEqual({ tin: 0, tout: 0 })
    const m = movePhases(1.5, -1.5, 900)
    expect(m.tin).toBeGreaterThan(0)
    expect(m.tout).toBeGreaterThan(0)
    expect(m.tin + m.tout).toBeLessThan(0.5)
    expect(turnAllowance(0, 0)).toBe(0)
    expect(turnAllowance(1.5, 0)).toBeGreaterThan(0)
  })
})
