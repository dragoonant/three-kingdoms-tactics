// Era data access (src/data/eras/<era>.json) and the run RNG streams (RL-RNG-1). Pure.
import era1Json from '../data/eras/era1.json'
import { nextFloat, seedRng } from '../engine/rng'
import type { EraData, StopDef } from './types'

export const ERA1 = era1Json as unknown as EraData
export const ERAS: Record<string, EraData> = { [ERA1.era]: ERA1 }

const stopIndexCache = new Map<EraData, Record<string, StopDef>>()
export function stopsOf(era: EraData): Record<string, StopDef> {
  let m = stopIndexCache.get(era)
  if (!m) {
    m = Object.fromEntries(era.stops.map((s) => [s.id, s]))
    stopIndexCache.set(era, m)
  }
  return m
}
export function stopDef(era: EraData, id: string): StopDef {
  const s = stopsOf(era)[id]
  if (!s) throw new Error(`unknown stop ${id}`)
  return s
}
export function eraOf(id: string): EraData {
  return ERAS[id] ?? ERA1
}

/** RNG purposes (RL-RNG-1). */
export const P_ROAD = 1
export const P_FATE = 2
export const P_BATTLE = 3
/** Stream index of the finale battle, and the offset of an aftermath stop's index. */
export const FINALE_INDEX = 999
export const AFTERMATH_OFFSET = 100

/** [RL-RNG-1] One sfc32 stream per (run seed, purpose, index), seeded like the engine (R-RNG-1), so a choice never shifts a later draw. */
export function stream(seed: number, purpose: number, index: number): () => number {
  const h = (Math.imul(seed >>> 0, 0x2545f491) ^ Math.imul(purpose + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0
  const st = seedRng(h)
  return () => nextFloat(st)
}

/** [RL-RNG-1] A battle's own seed, derived from the run seed and the stop index. */
export function battleSeedFor(seed: number, index: number): number {
  return (Math.floor(stream(seed, P_BATTLE, index)() * 0x7ffffffe) + 1) >>> 0
}

export const isTown = (s: StopDef): boolean => s.tags.includes('town') || s.tags.includes('village')
export const isMarket = (s: StopDef): boolean => s.tags.includes('market')
export const hasBattleChoice = (s: StopDef): boolean => s.choices.some((c) => !!c.effects.battle)
