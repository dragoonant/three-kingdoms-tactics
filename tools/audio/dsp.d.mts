export function dbToAmp(db: number): number
export function ampToDb(a: number): number
export function findFirstSound(x: Float32Array, sr: number, thresholdDb?: number, winSec?: number): number
export function findLastSound(x: Float32Array, sr: number, thresholdDb?: number, winSec?: number): number
export function onsetEnvelope(x: Float32Array, sr: number, hopSec?: number): { env: Float32Array; hop: number }
export function estimateTempo(x: Float32Array, sr: number, requestedBpm: number): { detectedBpm: number; driftPct: number; confidence: number }
