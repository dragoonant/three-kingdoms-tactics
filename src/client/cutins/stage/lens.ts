// Keeping set dressing out of the lens (review note 2026-11-01: a tree filled the frame in Arrow Rain on forest). Samples the
// scene's camera over its whole length and returns ground discs covering the near part of the view frustum of every low shot;
// the Ground leaves trees, houses, rocks and stalks out of them. Pure (no three objects).
import { evaluate, type CutinScene } from '../timeline'

export interface Disc {
  x: number
  z: number
  r: number
}

export interface LensOpts {
  /** How far in front of the lens to keep clear (tiles). */
  reach?: number
  /** Cameras higher than this look over the dressing and need nothing. */
  maxY?: number
  /** Sampling step, seconds. */
  step?: number
  aspect?: number
}

export function lensClear(scene: CutinScene, o: LensOpts = {}): Disc[] {
  const reach = o.reach ?? 1.8
  const maxY = o.maxY ?? 1.3
  const step = o.step ?? 0.1
  const aspect = o.aspect ?? 16 / 9
  const out: Disc[] = []
  for (let t = 0; t <= scene.duration + 1e-9; t += step) {
    const cam = evaluate(scene, t).camera
    if (cam.pos[1] > maxY) continue
    const fx = cam.target[0] - cam.pos[0]
    const fz = cam.target[2] - cam.pos[2]
    const fl = Math.hypot(fx, fz)
    if (fl < 1e-3) continue
    const half = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect)
    const spread = Math.min(1.2, Math.tan(half))
    for (let d = 0; d <= reach + 1e-9; d += 0.3) {
      out.push({ x: cam.pos[0] + (fx / fl) * d, z: cam.pos[2] + (fz / fl) * d, r: Math.min(1.0, 0.25 + d * spread) })
    }
  }
  return out
}
