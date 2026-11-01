// Merged-geometry builder with baked vertex colours (few draw calls), used for the tent and the confusion swirl.
// The unit figures themselves are rigs now (figures/, board/Figure.tsx); the old merged stand-ins are gone.
import { BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, OctahedronGeometry, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

type V3 = [number, number, number]

export class Builder {
  parts: BufferGeometry[] = []
  add(geo: BufferGeometry, color: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): void {
    const g = geo.clone()
    const m = new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scale))
    g.applyMatrix4(m)
    const c = new Color(color)
    const n = g.getAttribute('position').count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r
      arr[i * 3 + 1] = c.g
      arr[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new Float32BufferAttribute(arr, 3))
    this.parts.push(g.index ? g.toNonIndexed() : g)
  }
  build(): BufferGeometry {
    const parts = this.parts.map((p) => {
      p.deleteAttribute('uv')
      return p
    })
    const g = mergeGeometries(parts, false)
    for (const p of this.parts) p.dispose()
    return g
  }
}

const oct = new OctahedronGeometry(1)

export const swirlGeometry = ((): BufferGeometry => {
  const b = new Builder()
  for (let i = 0; i < 3; i++) b.add(oct, '#f5e38a', [Math.cos((i * Math.PI * 2) / 3) * 0.2, Math.sin(i * 1.3) * 0.04, Math.sin((i * Math.PI * 2) / 3) * 0.2], [0, 0, 0], [0.055, 0.055, 0.055])
  return b.build()
})()
