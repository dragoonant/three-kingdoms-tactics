// Tiny deterministic helpers for the AI: a string/number hasher and a seeded PRNG. No Math.random anywhere in src/ai.

/** FNV-1a over a list of numbers/strings, returned as an unsigned 32-bit int. */
export function hash32(...parts: (number | string)[]): number {
  let h = 0x811c9dc5
  for (const p of parts) {
    const s = typeof p === 'number' ? String(p) : p
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    h ^= 0x2c
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** mulberry32: a 32-bit seeded generator returning floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
