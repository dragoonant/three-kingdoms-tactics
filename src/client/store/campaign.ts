// The campaign flow as a store: title -> scenes -> briefing -> camp -> deploy -> battle -> results -> camp ...
// It is pure UI glue over src/campaign (progression, camp, deploy, results, saves); the engine is only reached
// through the game store, which calls back here when a campaign battle ends.
import { create } from 'zustand'
import {
  applyBattleResult,
  campaignBattleOptions,
  clearCampaign,
  currentBattle,
  currentBattleId,
  deployList,
  drill as campDrill,
  loadCampaign,
  muster as campMuster,
  newCampaign,
  retryBattle,
  saveCampaign,
  savePrebattle,
  type BattleReport,
  type CampaignState,
  type KeyValueStorage,
} from '../../campaign'
import { ARC, CAMPAIGN } from '../../data'
import { getScene, type SceneLine } from '../../data/scenes'
import { battleSeed, deployMarks, defaultPick, normaliseLoadout, togglePick as togglePickPure, toggleStratagem, type DeployMark } from '../campaign/helpers'
import { browserStorage, loadLoadout, saveLoadout } from '../campaign/storage'
import { setBattleEndHandler, useGame } from './game'

export type { DeployMark } from '../campaign/helpers'

export type SceneKind = 'prologue' | 'pre' | 'post' | 'epilogue'
export interface SceneState {
  kind: SceneKind
  /** Battle whose map is the backdrop (and whose scene file this is, for pre/post). */
  battleId: string
  lines: SceneLine[]
  index: number
}

export interface CampaignStore {
  campaign: CampaignState | null
  /** A saved campaign exists in storage (title shows Continue). */
  hasSave: boolean
  /** Storage could be reached; false means progress will not persist. */
  storageOk: boolean
  scene: SceneState | null
  report: BattleReport | null
  /** Set on the defeat screen. */
  defeat: { battleId: string; ironOathBroken: boolean } | null
  /** Optional deploy picks, in slot order after the required officers. */
  picks: string[]
  /** Stratagems each officer carries into battle (max 3), kept across camps. */
  loadout: Record<string, string[]>
  deployMarkers: DeployMark[]
  /** One line shown in camp after a drill (level-ups) or a refusal. */
  campNote: string | null
  /** Retries of the current battle (they change the battle seed). */
  attempt: number

  refresh: () => void
  openNew: () => void
  startNew: (ironOath: boolean, seed?: number) => CampaignState
  continueSave: () => boolean
  startScene: (kind: SceneKind, battleId: string) => void
  advanceScene: () => void
  skipScene: () => void
  openBriefing: () => void
  afterBriefing: () => void
  openCamp: () => void
  drill: (officerId: string) => void
  muster: (officerId: string) => void
  toggleStrat: (officerId: string, strat: string) => void
  openDeploy: () => void
  togglePick: (officerId: string) => void
  seal: () => void
  afterResults: () => void
  retry: () => boolean
  toTitle: () => void
  forget: () => void
}

let storage: KeyValueStorage | null = null
let storageSet = false
const store = (): KeyValueStorage | null => {
  if (!storageSet) {
    storage = browserStorage()
    storageSet = true
  }
  return storage
}
/** Tests inject a memory storage (or null for "storage unavailable"). */
export function setCampaignStorage(s: KeyValueStorage | null): void {
  storage = s
  storageSet = true
}

const TABLE_SEED = 7

/** The map shown behind a scene: the battle itself, the first battle for the prologue, the last for the epilogue. */
function backdropFor(kind: SceneKind, battleId: string): string {
  if (kind === 'prologue') return ARC[0] ?? battleId
  if (kind === 'epilogue') return ARC[ARC.length - 1] ?? battleId
  return battleId
}

export const useCampaign = create<CampaignStore>((set, get) => {
  const game = (): ReturnType<typeof useGame.getState> => useGame.getState()

  function persist(state: CampaignState): void {
    const ok = saveCampaign(store(), state)
    set({ campaign: state, storageOk: ok || store() !== null })
  }

  function table(battleId: string, options?: Parameters<ReturnType<typeof useGame.getState>['showTable']>[2]): void {
    const c = get().campaign
    game().showTable(battleId, c ? battleSeed(c.seed, c.battleIndex, 0) : TABLE_SEED, options)
  }

  function loadoutFor(c: CampaignState): Record<string, string[]> {
    const cur = get().loadout
    const next: Record<string, string[]> = { ...cur }
    for (const r of c.roster) if (r.status === 'active') next[r.officerId] = normaliseLoadout(r, cur[r.officerId])
    return next
  }

  function refreshDeploy(): void {
    const { campaign: c, picks, loadout } = get()
    if (!c) return
    const def = currentBattle(c)
    const id = currentBattleId(c)
    if (!def || !id) return
    const choice = { officers: picks, stratagems: loadout }
    const list = deployList(c, choice)
    table(id, campaignBattleOptions(c, choice))
    set({ deployMarkers: deployMarks(def, list) })
  }

  function finishScene(): void {
    const sc = get().scene
    set({ scene: null })
    if (!sc) return
    if (sc.kind === 'prologue') get().openBriefing()
    else if (sc.kind === 'pre') get().openDeploy()
    else if (sc.kind === 'post') game().go('results')
    else game().go('summary')
  }

  // A campaign battle ended: fold the result into the campaign, autosave a win, then show the post-battle scene or the defeat.
  setBattleEndHandler((final, events) => {
    const c = get().campaign
    if (!c) {
      game().go('title')
      return
    }
    const { state, report } = applyBattleResult(c, final, events)
    if (!report.won) {
      set({ campaign: state, report, defeat: { battleId: report.battleId, ironOathBroken: report.ironOathBroken } })
      game().go('defeat')
      return
    }
    // Autosave at the moment the result is known; the scene and results screens only read it back.
    persist(state)
    set({ report, defeat: null, hasSave: true, attempt: 0 })
    const post = getScene(report.battleId)?.post ?? []
    if (post.length > 0) get().startScene('post', report.battleId)
    else game().go('results')
  })

  return {
    campaign: null,
    hasSave: false,
    storageOk: true,
    scene: null,
    report: null,
    defeat: null,
    picks: [],
    loadout: {},
    deployMarkers: [],
    campNote: null,
    attempt: 0,

    refresh: () => {
      const r = loadCampaign(store())
      set({ hasSave: r.ok, storageOk: store() !== null })
    },

    openNew: () => {
      get().refresh()
      table(ARC[0] ?? 'daxing-hill')
      game().go('newcampaign')
    },

    startNew: (ironOath, seed) => {
      const sd = seed ?? Math.floor(Math.random() * 0x7fffffff) + 1
      const c = newCampaign(sd, ironOath)
      clearCampaign(store())
      set({ campaign: c, report: null, defeat: null, attempt: 0, loadout: {}, picks: [], campNote: null })
      const lo = loadoutFor(c)
      set({ loadout: lo })
      saveLoadout(store(), lo)
      persist(c)
      savePrebattle(store(), c)
      set({ hasSave: true })
      get().startScene('prologue', ARC[0] ?? '')
      return c
    },

    continueSave: () => {
      const r = loadCampaign(store())
      if (!r.ok) {
        set({ hasSave: false })
        return false
      }
      const c = r.state
      set({ campaign: c, report: null, defeat: null, attempt: 0, loadout: loadLoadout(store()), hasSave: true })
      set({ loadout: loadoutFor(c) })
      if (c.finished) {
        game().showTable(ARC[ARC.length - 1] ?? 'red-cliffs', TABLE_SEED)
        game().go('summary')
      } else if (c.battleIndex === 0) get().openBriefing()
      else get().openCamp()
      return true
    },

    startScene: (kind, battleId) => {
      const def = getScene(kind === 'prologue' ? CAMPAIGN.prologue : kind === 'epilogue' ? CAMPAIGN.epilogue : battleId)
      const lines = kind === 'post' ? (def?.post ?? []) : (def?.pre ?? [])
      const bg = backdropFor(kind, battleId)
      set({ scene: { kind, battleId: bg, lines, index: 0 } })
      if (lines.length === 0) {
        finishScene()
        return
      }
      table(bg)
      game().go('scene')
    },

    advanceScene: () => {
      const sc = get().scene
      if (!sc) return
      if (sc.index + 1 >= sc.lines.length) finishScene()
      else set({ scene: { ...sc, index: sc.index + 1 } })
    },

    skipScene: () => finishScene(),

    openBriefing: () => {
      const c = get().campaign
      const id = c ? currentBattleId(c) : undefined
      if (!c || !id) return
      table(id)
      game().go('cbrief')
    },

    afterBriefing: () => {
      const c = get().campaign
      const id = c ? currentBattleId(c) : undefined
      if (!id) return
      get().startScene('pre', id)
    },

    openCamp: () => {
      const c = get().campaign
      const id = c ? currentBattleId(c) : undefined
      if (!c || !id) return
      const lo = loadoutFor(c)
      set({ loadout: lo, campNote: null })
      saveLoadout(store(), lo)
      savePrebattle(store(), c)
      table(id)
      game().go('camp')
    },

    drill: (officerId) => {
      const c = get().campaign
      if (!c) return
      const r = campDrill(c, officerId)
      if (!r.ok) {
        set({ campNote: r.reason })
        return
      }
      persist(r.state)
      const lo = loadoutFor(r.state)
      set({ loadout: lo })
      saveLoadout(store(), lo)
      const up = r.levelUps[r.levelUps.length - 1]
      set({ campNote: up ? `Level ${up.to}!${up.learned.length ? ' New stratagem learned.' : ''}` : null })
    },

    muster: (officerId) => {
      const c = get().campaign
      if (!c) return
      const r = campMuster(c, officerId)
      if (!r.ok) {
        set({ campNote: r.reason })
        return
      }
      persist(r.state)
      set({ campNote: null })
    },

    toggleStrat: (officerId, strat) => {
      const c = get().campaign
      const rec = c?.roster.find((r) => r.officerId === officerId)
      if (!rec) return
      const cur = normaliseLoadout(rec, get().loadout[officerId])
      const next = { ...get().loadout, [officerId]: toggleStratagem(cur, rec.stratagems, strat) }
      set({ loadout: next })
      saveLoadout(store(), next)
    },

    openDeploy: () => {
      const c = get().campaign
      const def = c ? currentBattle(c) : undefined
      if (!c || !def) return
      set({ picks: defaultPick(c, def), loadout: loadoutFor(c) })
      refreshDeploy()
      game().go('deploy')
    },

    togglePick: (officerId) => {
      const c = get().campaign
      const def = c ? currentBattle(c) : undefined
      if (!c || !def) return
      const slots = def.deploySlots ?? (def.required ?? []).length
      const required = (def.required ?? []).filter((id) => c.roster.some((r) => r.officerId === id && r.status === 'active'))
      if (required.includes(officerId)) return
      set({ picks: togglePickPure(get().picks, officerId, Math.max(0, slots - required.length)) })
      refreshDeploy()
    },

    seal: () => {
      const { campaign: c, picks, loadout, attempt } = get()
      const id = c ? currentBattleId(c) : undefined
      if (!c || !id) return
      const options = campaignBattleOptions(c, { officers: picks, stratagems: loadout })
      game().beginCampaign(id, battleSeed(c.seed, c.battleIndex, attempt), options)
    },

    afterResults: () => {
      const c = get().campaign
      if (!c) return
      if (c.finished === 'won') get().startScene('epilogue', ARC[ARC.length - 1] ?? '')
      else if (c.finished === 'lost') {
        game().showTable(ARC[Math.max(0, Math.min(ARC.length - 1, c.battleIndex - 1))] ?? 'daxing-hill', TABLE_SEED)
        game().go('summary')
      } else get().openCamp()
    },

    retry: () => {
      const r = retryBattle(store())
      if (!r.ok) return false
      set({ campaign: r.state, defeat: null, report: null, attempt: get().attempt + 1, loadout: loadoutFor(r.state) })
      if (r.state.battleIndex === 0) get().openBriefing()
      else get().openCamp()
      return true
    },

    toTitle: () => {
      get().refresh()
      game().go('title')
    },

    forget: () => {
      clearCampaign(store())
      set({ campaign: null, hasSave: false })
    },
  }
})
