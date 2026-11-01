import type { Cue } from './lib.mjs'
import type { Io } from './gen-music.mjs'
export interface Measure {
  lufs: number
  lra: number
  truePeakDb: number
  peakDb: number
  rmsDb: number
  crestDb: number
  samples: number
}
export interface CutPlan {
  start: number
  length: number
  fadeIn: number
  fadeOut: number
  firstSound: number
  padded: number
}
export function measureFile(ffmpeg: string, file: string): Promise<Measure>
export function planCut(cue: Cue, x: Float32Array, opts: { seamFadeMs: number }): CutPlan
export function manifestEntry(cue: Cue, letter: string, o?: { asId?: string }): Record<string, unknown>
export function buildManifest(
  existing: unknown,
  cues: Cue[],
  state: Record<string, { picked: string; candidates: Record<string, unknown> }>,
  o?: { audition?: boolean },
): { version: 1; tracks: Record<string, unknown>[] }
export function main(argv: string[], io?: Io): Promise<number>
