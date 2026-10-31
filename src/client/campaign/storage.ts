// The browser side of campaign saves: a localStorage adapter that never throws, plus the stratagem loadout key.
// src/campaign takes the storage as an argument; if it is null the game still runs, it just does not persist.
import type { KeyValueStorage } from '../../campaign'

export const LOADOUT_KEY = 'tkt.campaign.v1.loadout'

/** localStorage wrapped so that every call is guarded; null when storage cannot be reached at all (private window, blocked site data). */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined') return null
    const ls = window.localStorage
    // Touch it once: some browsers only throw on first use.
    ls.getItem(LOADOUT_KEY)
    return {
      getItem: (k) => {
        try {
          return ls.getItem(k)
        } catch {
          return null
        }
      },
      setItem: (k, v) => {
        try {
          ls.setItem(k, v)
        } catch {
          /* quota or blocked: the game goes on without saving */
        }
      },
      removeItem: (k) => {
        try {
          ls.removeItem(k)
        } catch {
          /* nothing to remove */
        }
      },
    }
  } catch {
    return null
  }
}

export function loadLoadout(storage: KeyValueStorage | null): Record<string, string[]> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(LOADOUT_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = v as string[]
    }
    return out
  } catch {
    return {}
  }
}

export function saveLoadout(storage: KeyValueStorage | null, loadout: Record<string, string[]>): void {
  if (!storage) return
  try {
    storage.setItem(LOADOUT_KEY, JSON.stringify(loadout))
  } catch {
    /* ignore */
  }
}
