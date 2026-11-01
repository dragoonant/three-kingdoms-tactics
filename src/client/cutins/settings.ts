// The two cut-in settings (docs/spec/51 "Settings and pacing"), persisted in localStorage (always in try/catch: private
// windows and blocked site data must not break the game). `?cutins=all|strat|off` (and `?enemycutins=same|strat|off`) override
// the stored values for the session, which is how the tests and the capture tools choose a mode. In `?test=1` the default is
// Off so the existing scripted games stay as fast as they were; a test that wants the scenes passes `&cutins=all`.
import { create } from 'zustand'
import { DEFAULT_CUTIN_SETTINGS, type BattleScenes, type CutinSettings, type EnemyScenes } from './plan'

export const CUTIN_SETTINGS_KEY = 'tkt.cutins.v1'

export const BATTLE_SCENE_CHOICES: { value: BattleScenes; label: string }[] = [
  { value: 'all', label: 'Full and short' },
  { value: 'strat', label: 'Stratagems and chains only' },
  { value: 'off', label: 'Off' },
]
export const ENEMY_SCENE_CHOICES: { value: EnemyScenes; label: string }[] = [
  { value: 'same', label: 'Same as mine' },
  { value: 'strat', label: 'Stratagems only' },
  { value: 'off', label: 'Off' },
]

const isBattle = (v: unknown): v is BattleScenes => v === 'all' || v === 'strat' || v === 'off'
const isEnemy = (v: unknown): v is EnemyScenes => v === 'same' || v === 'strat' || v === 'off'

/** Parse stored JSON; anything missing or malformed falls back to the default. */
export function parseCutinSettings(raw: string | null | undefined): CutinSettings {
  if (!raw) return { ...DEFAULT_CUTIN_SETTINGS }
  try {
    const o = JSON.parse(raw) as Partial<CutinSettings> | null
    return {
      battleScenes: isBattle(o?.battleScenes) ? o.battleScenes : DEFAULT_CUTIN_SETTINGS.battleScenes,
      enemyScenes: isEnemy(o?.enemyScenes) ? o.enemyScenes : DEFAULT_CUTIN_SETTINGS.enemyScenes,
    }
  } catch {
    return { ...DEFAULT_CUTIN_SETTINGS }
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function query(name: string): string | null {
  try {
    return typeof location === 'undefined' ? null : new URLSearchParams(location.search).get(name)
  } catch {
    return null
  }
}

function initial(): CutinSettings {
  let s: CutinSettings
  try {
    s = parseCutinSettings(storage()?.getItem(CUTIN_SETTINGS_KEY))
  } catch {
    s = { ...DEFAULT_CUTIN_SETTINGS }
  }
  const q = query('cutins')
  const e = query('enemycutins')
  if (isBattle(q)) s = { ...s, battleScenes: q }
  else if (query('test') === '1') s = { ...s, battleScenes: 'off' }
  if (isEnemy(e)) s = { ...s, enemyScenes: e }
  return s
}

interface CutinSettingsStore extends CutinSettings {
  setBattleScenes: (v: BattleScenes) => void
  setEnemyScenes: (v: EnemyScenes) => void
}

function save(s: CutinSettings): void {
  try {
    storage()?.setItem(CUTIN_SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* the choice still holds for this session */
  }
}

export const useCutinSettings = create<CutinSettingsStore>((set, get) => ({
  ...initial(),
  setBattleScenes: (battleScenes) => {
    set({ battleScenes })
    save({ battleScenes, enemyScenes: get().enemyScenes })
  },
  setEnemyScenes: (enemyScenes) => {
    set({ enemyScenes })
    save({ battleScenes: get().battleScenes, enemyScenes })
  },
}))

export function getCutinSettings(): CutinSettings {
  const { battleScenes, enemyScenes } = useCutinSettings.getState()
  return { battleScenes, enemyScenes }
}
