// Rough signal analysis for the mastering step: where the sound starts and ends, and a sanity-check tempo estimate.
// Pure functions over a mono Float32Array. No ffmpeg, no files. (docs/spec/60-audio.md section 5, steps 2 and 3.)

export const dbToAmp = (db) => Math.pow(10, db / 20)
export const ampToDb = (a) => (a <= 1e-9 ? -180 : 20 * Math.log10(a))

/** Index of the first sample of the first `winSec` window whose peak reaches `thresholdDb`; -1 when the signal never gets that loud. */
export function findFirstSound(x, sr, thresholdDb = -50, winSec = 0.001) {
  const win = Math.max(1, Math.round(sr * winSec))
  const thr = dbToAmp(thresholdDb)
  for (let i = 0; i < x.length; i += win) {
    const end = Math.min(x.length, i + win)
    for (let j = i; j < end; j++) {
      if (Math.abs(x[j]) >= thr) return j
    }
  }
  return -1
}

/** Exclusive end index of the last `winSec` window whose peak reaches `thresholdDb`; 0 when the signal is silent. */
export function findLastSound(x, sr, thresholdDb = -55, winSec = 0.005) {
  const win = Math.max(1, Math.round(sr * winSec))
  const thr = dbToAmp(thresholdDb)
  for (let end = x.length; end > 0; end -= win) {
    const start = Math.max(0, end - win)
    for (let j = end - 1; j >= start; j--) {
      if (Math.abs(x[j]) >= thr) return j + 1
    }
  }
  return 0
}

/** Onset strength: positive change of the short-time level in dB, one value per hop. */
export function onsetEnvelope(x, sr, hopSec = 0.01) {
  const hop = Math.max(1, Math.round(sr * hopSec))
  const n = Math.floor(x.length / hop)
  const env = new Float32Array(n)
  let prev = -90
  for (let k = 0; k < n; k++) {
    let s = 0
    for (let j = k * hop; j < (k + 1) * hop; j++) s += x[j] * x[j]
    const db = Math.max(-90, 10 * Math.log10(s / hop + 1e-12))
    env[k] = k === 0 ? 0 : Math.max(0, db - prev)
    prev = db
  }
  return { env, hop: hop / sr }
}

function interp(env, pos) {
  const i = Math.floor(pos)
  if (i < 0 || i + 1 >= env.length) return 0
  const f = pos - i
  return env[i] * (1 - f) + env[i + 1] * f
}

/**
 * A rough tempo check around the BPM the studio was asked for (it is a hint, not a guarantee). Autocorrelates the onset envelope at the beat
 * period and its first two doublings within +/-10 percent of `requestedBpm`. The mastering step trusts the requested BPM; this only warns.
 * `confidence` is the best score over the median score of the search range (1 = no tempo to speak of).
 */
export function estimateTempo(x, sr, requestedBpm) {
  if (!(requestedBpm > 0) || x.length < sr * 6) return { detectedBpm: 0, driftPct: 0, confidence: 0 }
  const { env, hop } = onsetEnvelope(x, sr)
  const n = env.length
  const acAt = (lag) => {
    let s = 0
    let c = 0
    for (let i = 0; i + lag + 1 < n; i++) {
      s += env[i] * interp(env, i + lag)
      c++
    }
    return c > 0 ? s / c : 0
  }
  const scores = []
  let best = { bpm: requestedBpm, score: -1 }
  for (let bpm = requestedBpm * 0.9; bpm <= requestedBpm * 1.1 + 1e-9; bpm += requestedBpm / 600) {
    const lag = 60 / bpm / hop
    const score = acAt(lag) + acAt(lag * 2) + acAt(lag * 4)
    scores.push(score)
    if (score > best.score) best = { bpm, score }
  }
  const sorted = scores.slice().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] || 1e-9
  return {
    detectedBpm: Math.round(best.bpm * 10) / 10,
    driftPct: Math.round(((best.bpm - requestedBpm) / requestedBpm) * 1000) / 10,
    confidence: Math.round((best.score / median) * 10) / 10,
  }
}
