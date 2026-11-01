// Seeded, stateless randomness for the cut-ins. Nothing here touches Math.random: every value is a pure function of
// its integer inputs, so a frame at time t is identical on every run (docs/spec/51 "Determinism").

/** 32-bit integer hash of up to four ints. */
export function hash32(a: number, b = 0, c = 0, d = 0): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35) ^ Math.imul(d | 0, 0x27d4eb2f)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** Uniform float in [0,1) from integer inputs. */
export function rand(a: number, b = 0, c = 0, d = 0): number {
  return hash32(a, b, c, d) / 4294967296
}

/** Uniform float in [-1,1). */
export function srand(a: number, b = 0, c = 0, d = 0): number {
  return rand(a, b, c, d) * 2 - 1
}

/** Small sequential generator (mulberry32) for building layouts at setup time. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 1D value noise in [-1,1] (for sway and wobble). */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return srand(i, seed, 11) * (1 - u) + srand(i + 1, seed, 11) * u
}

/** Deterministic Fisher-Yates shuffle of 0..n-1. */
export function seededOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  const r = mulberry32(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}
