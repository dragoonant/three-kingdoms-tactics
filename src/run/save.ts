// Save / load with a version field, and the Annals of ended runs, through an injected storage (no localStorage here).
import type { KeyValueStorage } from '../campaign/save'
import { RUN_VERSION, type RunEndKind, type RunState } from './types'

export const RUN_SAVE_KEY = 'tkt.run.v1'
export const ANNALS_KEY = 'tkt.run.annals.v1'

export type RunLoad = { ok: true; state: RunState } | { ok: false; reason: 'missing' | 'corrupt' | 'version' | 'unavailable' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function isRunState(x: unknown): x is RunState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  if (s.version !== RUN_VERSION || typeof s.era !== 'string' || typeof s.ironOath !== 'boolean') return false
  if (!['seed', 'rice', 'soldiers', 'wounded', 'renown', 'day', 'stopIndex'].every((k) => isNum(s[k]))) return false
  const road = s.road as Record<string, unknown> | undefined
  if (!road || !Array.isArray(road.tiers) || !Array.isArray(road.edges)) return false
  if (!Array.isArray(s.band) || !Array.isArray(s.flags) || !Array.isArray(s.annals) || !Array.isArray(s.path)) return false
  for (const o of s.band as Record<string, unknown>[]) {
    const r = o?.rec as Record<string, unknown> | undefined
    if (!r || typeof r.officerId !== 'string' || !isNum(r.level) || !isNum(r.xp) || typeof o.hurt !== 'boolean') return false
  }
  if (typeof s.phase !== 'string') return false
  return true
}

export function saveRun(storage: KeyValueStorage | null | undefined, s: RunState): boolean {
  if (!storage) return false
  try {
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function loadRun(storage: KeyValueStorage | null | undefined): RunLoad {
  if (!storage) return { ok: false, reason: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(RUN_SAVE_KEY)
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
  if (raw === null) return { ok: false, reason: 'missing' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
  if (typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version !== RUN_VERSION) return { ok: false, reason: 'version' }
  return isRunState(parsed) ? { ok: true, state: parsed } : { ok: false, reason: 'corrupt' }
}

export function clearRun(storage: KeyValueStorage | null | undefined): void {
  try {
    storage?.removeItem(RUN_SAVE_KEY)
  } catch {
    /* unavailable */
  }
}

export interface AnnalEntry {
  era: string
  seed: number
  ironOath: boolean
  end: RunEndKind
  day: number
  renown: number
  battles: number
  battlesWon: number
  killed: number
  fell: string[]
  road: string[]
}

export function annalOf(s: RunState): AnnalEntry | null {
  if (!s.end) return null
  return {
    era: s.era, seed: s.seed, ironOath: s.ironOath, end: s.end.kind, day: s.end.day, renown: s.renown, battles: s.stats.battles,
    battlesWon: s.stats.battlesWon, killed: s.stats.killed, fell: s.stats.fell.slice(), road: s.picks.slice(),
  }
}

export function loadAnnals(storage: KeyValueStorage | null | undefined): AnnalEntry[] {
  try {
    const raw = storage?.getItem(ANNALS_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(v) ? (v as AnnalEntry[]) : []
  } catch {
    return []
  }
}

/** [RL-RUN-2] Every ended run is written to the Annals (newest first, at most 50). */
export function writeAnnal(storage: KeyValueStorage | null | undefined, s: RunState): AnnalEntry[] {
  const a = annalOf(s)
  const list = loadAnnals(storage)
  if (!a) return list
  const next = [a, ...list].slice(0, 50)
  try {
    storage?.setItem(ANNALS_KEY, JSON.stringify(next))
  } catch {
    /* unavailable */
  }
  return next
}
