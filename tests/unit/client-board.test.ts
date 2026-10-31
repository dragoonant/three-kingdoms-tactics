import { describe, expect, it } from 'vitest'
import { getBattleDef, ALL_BATTLES } from '../../src/data'
import { createBattle } from '../../src/engine'
import { edgePoint, clampSize, frameCorners, lanternSpots, panLimits, shadowBox, tileAt, tileCentre } from '../../src/client/board/frame'
import { fitBoard, insetsFor } from '../../src/client/board/CameraRig'
import { board, setBoardSize, setSideTokens, sideColour, sideToken, tileX, tileZ, TOP } from '../../src/client/board/layout'
import {
  bridgeAxis,
  changedTiles,
  gateAxis,
  gateIsOpenFor,
  hasWaterBelow,
  hullSides,
  isBridgeTile,
  parapetSides,
  tileTop,
  type TerrainGrid,
} from '../../src/client/board/terrainModel'

const grid = (id: string): TerrainGrid => {
  const s = createBattle(id, 1)
  return { terrain: s.grid.tiles.map((t) => t.terrain), width: s.grid.width, height: s.grid.height }
}

describe('C-BOARD framing from the map size', () => {
  it('C-BOARD-1 tile centres are centred on the origin for every size from 10x8 to 16x14', () => {
    for (let w = 10; w <= 16; w++) {
      for (let h = 8; h <= 14; h++) {
        const a = tileCentre(0, 0, w, h)
        const b = tileCentre(w - 1, h - 1, w, h)
        expect(a.x + b.x).toBeCloseTo(0, 9)
        expect(a.z + b.z).toBeCloseTo(0, 9)
        expect(tileAt(a.x, a.z, w, h)).toEqual({ x: 0, y: 0 })
        expect(tileAt(b.x, b.z, w, h)).toEqual({ x: w - 1, y: h - 1 })
      }
    }
  })

  it('C-BOARD-2 layout.tileX/tileZ follow setBoardSize and agree with the pure helper', () => {
    setBoardSize(10, 8)
    expect(board).toEqual({ w: 10, h: 8 })
    expect(tileX(0)).toBeCloseTo(tileCentre(0, 0, 10, 8).x, 9)
    expect(tileZ(7)).toBeCloseTo(tileCentre(0, 7, 10, 8).z, 9)
    setBoardSize(16, 14)
    expect(tileX(15)).toBeCloseTo(7.5, 9)
    expect(tileZ(13)).toBeCloseTo(6.5, 9)
    setBoardSize(14, 12)
  })

  it('C-BOARD-3 clampSize keeps the table within the designed range', () => {
    expect(clampSize(4, 4)).toEqual({ w: 10, h: 8 })
    expect(clampSize(30, 30)).toEqual({ w: 16, h: 14 })
    expect(clampSize(12, 9)).toEqual({ w: 12, h: 9 })
  })

  it('C-BOARD-4 the camera fit gives every board size a finite distance that grows with the board, on desktop and phone', () => {
    for (const [vw, vh] of [[1280, 800], [390, 844]] as const) {
      const ins = insetsFor(vw, vh, 'battle')
      let last = 0
      for (const [w, h] of [[10, 8], [14, 12], [16, 14]] as const) {
        const f = fitBoard(36, vw, vh, ins, 0, w, h)
        expect(Number.isFinite(f.dist) && Number.isFinite(f.shiftX) && Number.isFinite(f.shiftY)).toBe(true)
        expect(f.dist).toBeGreaterThan(last)
        last = f.dist
      }
    }
  })

  it('C-BOARD-5 insets leave a free rectangle on every screen mode at both window sizes', () => {
    for (const [vw, vh] of [[1280, 800], [390, 844]] as const) {
      for (const mode of ['title', 'battle', 'scene', 'backdrop', 'deploy'] as const) {
        const i = insetsFor(vw, vh, mode)
        expect(vw - i.left - i.right).toBeGreaterThan(200)
        expect(vh - i.top - i.bottom).toBeGreaterThan(150)
      }
    }
  })

  it('C-BOARD-6 lanterns, shadow box and pan limits scale with the board', () => {
    const small = lanternSpots(10, 8)
    const big = lanternSpots(16, 14)
    expect(big.meshes[1]![0]).toBeGreaterThan(small.meshes[1]![0])
    expect(big.lights[2]![2]).toBeGreaterThan(small.lights[2]![2])
    expect(shadowBox(16, 14).x).toBeGreaterThan(shadowBox(10, 8).x)
    expect(panLimits(10, 8).x).toBeLessThan(panLimits(16, 14).x)
    expect(frameCorners(10, 8)).toHaveLength(8)
    expect(Math.max(...frameCorners(16, 14).map((c) => Math.abs(c[0])))).toBeCloseTo(8.55, 9)
  })

  it('C-BOARD-7 arrivals and exits use the nearest board edge', () => {
    expect(edgePoint(0, 5, 14, 12)).toEqual({ x: -2.5, y: 5 })
    expect(edgePoint(13, 5, 14, 12)).toEqual({ x: 15.5, y: 5 })
    expect(edgePoint(6, 0, 14, 12)).toEqual({ x: 6, y: -2.5 })
    expect(edgePoint(6, 11, 14, 12)).toEqual({ x: 6, y: 13.5 })
    expect(edgePoint(1, 5, 14, 12, 3)).toEqual({ x: -3, y: 5 })
  })
})

describe('C-TERRAIN v2 terrain on the sand table', () => {
  it('C-TERRAIN-1 elevation: wall and rampart and hill stand above the plain, water below it', () => {
    expect(TOP.wall).toBeGreaterThan(TOP.rampart)
    expect(TOP.rampart).toBeGreaterThan(TOP.hill)
    expect(TOP.hill).toBeGreaterThan(TOP.plain)
    expect(TOP.water).toBeLessThan(TOP.plain)
    expect(TOP.shallows).toBeLessThan(TOP.plain)
  })

  it('C-TERRAIN-2 a listed road tile is a bridge (Daxing Hill), a bridge terrain tile is one (proving ground), and a destroyed bridge is not', () => {
    const dax = grid('daxing-hill')
    const listed = getBattleDef('daxing-hill')!.bridges
    expect(isBridgeTile(dax, listed, 8, 6)).toBe(true)
    expect(isBridgeTile(dax, listed, 7, 6)).toBe(false)
    expect(tileTop(dax, listed, 8, 6)).toBeGreaterThan(tileTop(dax, listed, 7, 6))
    const pg = grid('proving-ground')
    const pgListed = getBattleDef('proving-ground')!.bridges
    expect(isBridgeTile(pg, pgListed, 13, 7)).toBe(true)
    const broken: TerrainGrid = { ...pg, terrain: pg.terrain.map((t, i) => (i === 7 * pg.width + 13 ? 'water' : t)) }
    expect(isBridgeTile(broken, pgListed, 13, 7)).toBe(false)
    expect(hasWaterBelow('river', false)).toBe(true)
    expect(hasWaterBelow('deck', false)).toBe(true)
    expect(hasWaterBelow('road', true)).toBe(true)
    expect(hasWaterBelow('plain', false)).toBe(false)
  })

  it('C-TERRAIN-3 a bridge runs from land to land; a gate faces along its wall', () => {
    const pg = grid('proving-ground')
    const listed = getBattleDef('proving-ground')!.bridges
    expect(bridgeAxis(pg, listed, 13, 7)).toBe('z')
    const dax = grid('daxing-hill')
    expect(bridgeAxis(dax, getBattleDef('daxing-hill')!.bridges, 8, 6)).toBe('x')
    expect(gateAxis(pg, 8, 5)).toBe('ns')
    expect(gateIsOpenFor('han', 'han')).toBe(true)
    expect(gateIsOpenFor('cao', 'han')).toBe(false)
    expect(gateIsOpenFor(null, 'han')).toBe(false)
  })

  it('C-TERRAIN-4 the hull shows where the deck meets water and parapets sit on the open sides of a rampart', () => {
    const pg = grid('proving-ground')
    const listed = getBattleDef('proving-ground')!.bridges
    // deck tiles are (12..13, 9..10); water lies to the east and south of them, land to the west and north
    expect(hullSides(pg, listed, 13, 10).sort()).toEqual(['E', 'S'])
    expect(hullSides(pg, listed, 12, 9)).toEqual([])
    expect(hullSides(pg, listed, 13, 9)).toEqual(['E'])
    expect(parapetSides(pg, 8, 4).sort()).toEqual(['E', 'W'])
    expect(parapetSides(pg, 8, 2).sort()).toEqual(['E', 'W'])
  })

  it('C-TERRAIN-5 changedTiles lists exactly what a terrain change turned', () => {
    const a = ['plain', 'plain', 'plain', 'plain'] as const
    const b = ['plain', 'water', 'plain', 'road'] as const
    expect(changedTiles([...a], [...b], 2)).toEqual([
      { x: 1, y: 0, to: 'water' },
      { x: 1, y: 1, to: 'road' },
    ])
    expect(changedTiles([...a], ['plain'], 2)).toEqual([])
  })

  it('C-TERRAIN-6 every battle on file can be framed: sizes inside the designed range, every terrain has a height and a colour', () => {
    for (const [id, def] of Object.entries(ALL_BATTLES)) {
      const h = def.map.length
      const w = def.map[0]!.length
      expect(w, id).toBeGreaterThanOrEqual(10)
      expect(w, id).toBeLessThanOrEqual(16)
      expect(h, id).toBeGreaterThanOrEqual(8)
      expect(h, id).toBeLessThanOrEqual(14)
      for (const t of Object.values(def.legend)) expect(TOP[t], `${id} ${t}`).toBeTypeOf('number')
    }
  })
})

describe('C-SIDE side colours come from the battle data', () => {
  it('C-SIDE-1 the colour token of a side id follows setSideTokens, with the id as the fallback', () => {
    setSideTokens([{ id: 'han', colourToken: 'han' }, { id: 'cao', colourToken: 'cao' }])
    expect(sideToken('cao')).toBe('cao')
    expect(sideColour('cao')).toBe('#34495e')
    setSideTokens([{ id: 'host', colourToken: 'dong' }])
    expect(sideToken('host')).toBe('dong')
    expect(sideColour('host')).toBe('#6b1f2a')
    expect(sideColour('yellow')).toBe('#d4a72c')
    setSideTokens([])
  })
})
