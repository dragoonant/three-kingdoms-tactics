// Pure game engine: no DOM, no React, no three.js imports.

export const ENGINE_VERSION = '0.0.1'

export type Terrain = 'plain'

export interface Tile {
  x: number
  y: number
  terrain: Terrain
}

export interface Grid {
  width: number
  height: number
  tiles: Tile[]
}

/** Build a width x height grid of plain tiles, row-major (index = y * width + x). */
export function makeGrid(width: number, height: number): Grid {
  const tiles: Tile[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles.push({ x, y, terrain: 'plain' })
    }
  }
  return { width, height, tiles }
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height
}
