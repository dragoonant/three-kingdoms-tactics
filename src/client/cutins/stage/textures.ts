// Procedural textures for the cut-in stage (seeded; no Math.random).
import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, SRGBColorSpace } from 'three'
import { mulberry32, rand } from '../rng'

/** Fine sand grain with soft blotches, tiling. Used as colour map and bump map. */
export function makeSandTexture(): DataTexture {
  const n = 256
  const data = new Uint8Array(n * n * 4)
  const r = mulberry32(90210)
  // low-frequency blotches on a coarse grid, bilinearly interpolated and tiling
  const g = 8
  const grid = Array.from({ length: g * g }, () => r())
  const blot = (x: number, y: number): number => {
    const fx = (x / n) * g
    const fy = (y / n) * g
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const ux = fx - ix
    const uy = fy - iy
    const at = (a: number, b: number): number => grid[(b % g) * g + (a % g)]!
    const top = at(ix, iy) * (1 - ux) + at(ix + 1, iy) * ux
    const bot = at(ix, iy + 1) * (1 - ux) + at(ix + 1, iy + 1) * ux
    return top * (1 - uy) + bot * uy
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      let v = 214 + (blot(x, y) - 0.5) * 22 + (r() - 0.5) * 34
      if (r() < 0.035) v -= 46
      if (r() < 0.02) v += 20
      v = Math.max(0, Math.min(255, v))
      data[i * 4] = v
      data[i * 4 + 1] = v
      data[i * 4 + 2] = v
      data[i * 4 + 3] = 255
    }
  }
  const t = new DataTexture(data, n, n, RGBAFormat)
  t.wrapS = t.wrapT = RepeatWrapping
  t.magFilter = LinearFilter
  t.minFilter = LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.colorSpace = SRGBColorSpace
  t.needsUpdate = true
  return t
}

/** Soft round bokeh disc: bright rim, hollow-ish centre, like an out-of-focus lantern. */
export function makeBokehTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.7, 'rgba(255,255,255,0.7)')
  grad.addColorStop(0.9, 'rgba(255,255,255,0.95)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Soft glow sprite (no rim). */
export function makeGlowTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** Pseudo-random value for a tile-aligned grain (kept for tests and instancing colours). */
export const grain = (i: number, seed = 5): number => rand(seed, i)
