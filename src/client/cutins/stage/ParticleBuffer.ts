// A CPU-filled point-sprite buffer. Scenes call begin(), push() for every live particle, end(); the positions are pure
// functions of time (particles.ts), so nothing here keeps state between frames.
import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from 'three'
import { specNow } from '../quality'

export type ParticleMode = 'add' | 'alpha'

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.05, -mv.z), 0.0, 220.0);
}
`

const FRAG = /* glsl */ `
precision mediump float;
uniform float uHard;
varying vec4 vColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, uHard);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}
`

export class ParticleBuffer {
  readonly points: Points
  private readonly pos: Float32Array
  private readonly size: Float32Array
  private readonly col: Float32Array
  private readonly geo: BufferGeometry
  private readonly mat: ShaderMaterial
  private n = 0
  /** Particles offered this frame, and the share of them drawn (the quality tier's `fx`; 1 draws every one). */
  private k = 0
  private keep = 1
  readonly max: number

  /** hard: falloff exponent (1 = soft glow, 3 = tight spark). */
  constructor(max: number, mode: ParticleMode, hard = 1.6) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.col = new Float32Array(max * 4)
    this.geo = new BufferGeometry()
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048))
    this.geo.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(35048))
    this.geo.setAttribute('aColor', new BufferAttribute(this.col, 4).setUsage(35048))
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 600 }, uHard: { value: hard } },
      transparent: true,
      depthWrite: false,
      blending: mode === 'add' ? AdditiveBlending : NormalBlending,
      fog: false,
    })
    this.points = new Points(this.geo, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = mode === 'add' ? 10 : 8
  }

  /** `pxPerUnit` is drawing-buffer height / (2 tan(fov/2)). */
  begin(pxPerUnit: number): void {
    this.mat.uniforms.uScale!.value = pxPerUnit
    this.n = 0
    this.k = 0
    this.keep = specNow().fx
  }

  push(x: number, y: number, z: number, size: number, r: number, g: number, b: number, a: number): void {
    if (this.n >= this.max || a <= 0.002 || size <= 0) return
    if (this.keep < 1) {
      // an even, deterministic thinning: keep the particle when the running share crosses an integer
      const k = this.k++
      if (Math.floor((k + 1) * this.keep) === Math.floor(k * this.keep)) return
    }
    const i = this.n++
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.size[i] = size
    this.col[i * 4] = r
    this.col[i * 4 + 1] = g
    this.col[i * 4 + 2] = b
    this.col[i * 4 + 3] = a
  }

  end(): void {
    this.geo.setDrawRange(0, this.n)
    this.geo.attributes.position!.needsUpdate = true
    this.geo.attributes.aSize!.needsUpdate = true
    this.geo.attributes.aColor!.needsUpdate = true
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}

/** Flame colour ramp by life fraction u (0 fresh, 1 dying): white-yellow -> orange -> deep red. Returns linear-ish rgb. */
export function flameColour(u: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (u < 0.25) {
    const k = u / 0.25
    out[0] = 1.0
    out[1] = 0.72 - 0.2 * k
    out[2] = 0.28 - 0.2 * k
  } else if (u < 0.65) {
    const k = (u - 0.25) / 0.4
    out[0] = 1.0 - 0.1 * k
    out[1] = 0.55 - 0.3 * k
    out[2] = 0.1 - 0.06 * k
  } else {
    const k = (u - 0.65) / 0.35
    out[0] = 0.9 - 0.5 * k
    out[1] = 0.25 - 0.2 * k
    out[2] = 0.04
  }
  return out
}
