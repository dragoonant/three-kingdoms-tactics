// [C-SAVE-1..] Save / load / retry through an injected storage (no localStorage here).
import type { BuffStat } from '../data/types'
import { CAMPAIGN_VERSION, STAT_KEYS, type CampaignState } from './types'

export const SAVE_KEY = 'tkt.campaign.v1'
export const PREBATTLE_KEY = 'tkt.campaign.v1.prebattle'

/** The slice of the Web Storage interface the campaign needs. The client passes window.localStorage (or null). */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createMemoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

export type LoadResult = { ok: true; state: CampaignState } | { ok: false; reason: 'missing' | 'corrupt' | 'version' | 'unavailable' }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Shape check for a parsed save. Unknown officer ids are allowed (data may have changed); structure must be right. */
export function isCampaignState(x: unknown): x is CampaignState {
  if (typeof x !== 'object' || x === null) return false
  const s = x as Record<string, unknown>
  if (!isNum(s.seed) || typeof s.ironOath !== 'boolean' || !isNum(s.battleIndex) || !isNum(s.provisions)) return false
  if (!Array.isArray(s.roster)) return false
  for (const r of s.roster as Record<string, unknown>[]) {
    if (typeof r !== 'object' || r === null) return false
    if (typeof r.officerId !== 'string' || !isNum(r.level) || !isNum(r.xp) || !isNum(r.maxTroops)) return false
    if (!Array.isArray(r.stratagems) || typeof r.wounded !== 'boolean') return false
    if (r.status !== 'active' && r.status !== 'fallen' && r.status !== 'departed') return false
    const b = r.statBonus as Record<BuffStat, unknown> | undefined
    if (!b || !STAT_KEYS.every((k) => isNum(b[k]))) return false
  }
  const st = s.stats as Record<string, unknown> | undefined
  if (!st || !['battlesWon', 'defeats', 'bestChain', 'foesRouted', 'officersLost', 'swayed'].every((k) => isNum(st[k]))) return false
  const c = s.camp as { drilled?: unknown; mustered?: unknown } | undefined
  if (!c || !Array.isArray(c.drilled) || typeof c.mustered !== 'object' || c.mustered === null) return false
  return true
}

function readKey(storage: KeyValueStorage | null | undefined, key: string): LoadResult {
  if (!storage) return { ok: false, reason: 'unavailable' }
  let raw: string | null
  try {
    raw = storage.getItem(key)
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
  if (typeof parsed === 'object' && parsed !== null && (parsed as { version?: unknown }).version !== CAMPAIGN_VERSION) return { ok: false, reason: 'version' }
  return isCampaignState(parsed) ? { ok: true, state: parsed } : { ok: false, reason: 'corrupt' }
}

function writeKey(storage: KeyValueStorage | null | undefined, key: string, state: CampaignState): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** Autosave. Returns false when storage is unavailable (the game still runs, it just does not persist). */
export const saveCampaign = (storage: KeyValueStorage | null | undefined, state: CampaignState): boolean => writeKey(storage, SAVE_KEY, state)
export const loadCampaign = (storage: KeyValueStorage | null | undefined): LoadResult => readKey(storage, SAVE_KEY)

/** Written when the Camp for a battle opens; `retryBattle` restores it. */
export const savePrebattle = (storage: KeyValueStorage | null | undefined, state: CampaignState): boolean => writeKey(storage, PREBATTLE_KEY, state)
export const loadPrebattle = (storage: KeyValueStorage | null | undefined): LoadResult => readKey(storage, PREBATTLE_KEY)

/** Retry after a defeat: reload the pre-battle snapshot and make it the current save. */
export function retryBattle(storage: KeyValueStorage | null | undefined): LoadResult {
  const r = loadPrebattle(storage)
  if (r.ok) writeKey(storage, SAVE_KEY, r.state)
  return r
}

export function clearCampaign(storage: KeyValueStorage | null | undefined): void {
  if (!storage) return
  try {
    storage.removeItem(SAVE_KEY)
    storage.removeItem(PREBATTLE_KEY)
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
