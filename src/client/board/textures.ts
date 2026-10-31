import { CanvasTexture, DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three'

/** Fine sand grain, tiled on every block face. */
export function sandTexture(): DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  let seed = 1234567
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let i = 0; i < n * n; i++) {
    const v = 226 + Math.floor(rnd() * 30) - (rnd() < 0.06 ? 38 : 0)
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const t = new DataTexture(data, n, n, RGBAFormat)
  t.wrapS = t.wrapT = RepeatWrapping
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.colorSpace = SRGBColorSpace
  t.needsUpdate = true
  return t
}

/** Soft round puff for smoke and incense. */
export function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
