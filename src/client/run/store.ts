// Roads to War as a store: title -> new run -> prologue -> stop (slips, choices) -> market -> road -> deploy -> battle ->
// report -> ... -> Guangzong -> end. Pure UI glue over src/run (every rule and number lives there); the engine is only
// reached through the game store, which calls back here when a run battle ends.
import { create } from 'zustand'
import {
  applyBattle, battleOptions, beginRoad, checkDeploy, choose as runChoose, clearRun, defaultDeploy, ERA1, hireLevies, loadAnnals, loadRun,
  makeCamp, newRun, saveRun, scatter, sealDeploy, sendHome as runSendHome, stopDef, toFinaleDeploy, travel as runTravel, writeAnnal,
  type AnnalEntry, type DeployPick, type RunBattleReport, type RunState, type SlipLine,
} from '../../run'
import type { KeyValueStorage } from '../../campaign'
import { browserStorage } from '../campaign/storage'
import { setRunBattleEndHandler, useGame } from '../store/game'

export type RunView = 'new' | 'slips' | 'stop' | 'market' | 'road' | 'finale' | 'deploy' | 'report' | 'end'

export interface RunStore {
  run: RunState | null
  hasSave: boolean
  storageOk: boolean
  /** Speech slips being shown (prologue or a stop's scene) and the index. */
  slips: { title: string; lines: SlipLine[]; index: number; key: string } | null
  /** The stop (`id:index`) whose slips were last shown (so Continue does not replay them). */
  slipsSeen: string
  /** The choice slip picked, waiting for the seal. */
  chosen: string | null
  picks: DeployPick[]
  report: RunBattleReport | null
  annals: AnnalEntry[]
  /** The New run form. */
  draftSeed: number
  draftIron: boolean

  view: () => RunView
  openNew: () => void
  setDraft: (seed: number, iron: boolean) => void
  startNew: (seed?: number, ironOath?: boolean) => RunState
  continueRun: () => boolean
  refresh: () => void
  advanceSlip: () => void
  skipSlips: () => void
  pick: (choiceId: string | null) => void
  seal: () => void
  hire: (n: number) => void
  travel: (target: number | 'finale', march: boolean) => void
  camp: () => void
  sendHome: (healthy: number, wounded: number) => void
  toDeploy: () => void
  setSoldiers: (id: string, soldiers: number) => void
  toggleOfficer: (id: string) => void
  sealDeploy: () => void
  giveUp: () => void
  afterReport: () => void
  toTitle: () => void
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
/** Tests inject a memory storage (or null). */
export function setRunStorage(s: KeyValueStorage | null): void {
  storage = s
  storageSet = true
}

const era = ERA1

/** Which run view is up, from the run phase, the slips and a pending report. */
export function viewOf(run: RunState | null, slips: RunStore['slips'], report: RunBattleReport | null): RunView {
  if (!run) return 'new'
  if (report) return 'report'
  if (slips) return 'slips'
  switch (run.phase) {
    case 'prologue':
      return 'slips'
    case 'stop':
      return 'stop'
    case 'market':
      return 'market'
    case 'road':
      return 'road'
    case 'finale':
      return 'finale'
    case 'deploy':
      return 'deploy'
    case 'ended':
      return 'end'
    default:
      return 'road'
  }
}
const BACKDROP = 'daxing-hill'
const randomSeed = (): number => Math.floor(Math.random() * 0x7fffffff) + 1

export const useRun = create<RunStore>((set, get) => {
  const game = (): ReturnType<typeof useGame.getState> => useGame.getState()

  function persist(s: RunState): void {
    const ok = saveRun(store(), s)
    if (s.end) set({ annals: writeAnnal(store(), s) })
    set({ run: s, storageOk: ok || store() !== null, hasSave: !s.end })
  }

  /** Show the sand table behind the run: the pending battle's field, else the first field. */
  function backdrop(s: RunState | null): void {
    const id = s?.pending?.battleId ?? BACKDROP
    game().showTable(id, s ? s.seed : 7)
  }

  function showStopSlips(s: RunState): void {
    if (s.phase === 'prologue') {
      set({ slips: { title: 'The Peach Garden', lines: era.prologue, index: 0, key: 'prologue' } })
      return
    }
    const key = s.stop ? `${s.stop.id}:${s.stop.index}` : ''
    if (s.phase === 'stop' && s.stop && get().slipsSeen !== key) {
      const st = stopDef(era, s.stop.id)
      set({ slips: { title: st.title, lines: st.slips, index: 0, key }, slipsSeen: key })
      return
    }
    set({ slips: null })
  }

  function update(s: RunState): void {
    persist(s)
    set({ chosen: null })
    if (s.phase === 'deploy') set({ picks: defaultDeploy(era, s) })
    showStopSlips(s)
    backdrop(s)
    if (game().screen !== 'run') game().go('run')
  }

  function startBattle(s: RunState): void {
    if (!s.pending || !s.deployment) return
    game().beginRun(s.pending.battleId, s.deployment.seed, battleOptions(era, s))
  }

  setRunBattleEndHandler((final, events) => {
    const s = get().run
    if (!s || s.phase !== 'battle') {
      game().go('title')
      return
    }
    const { state, report } = applyBattle(era, s, final, events)
    persist(state)
    set({ report, chosen: null })
    if (state.phase === 'deploy') set({ picks: defaultDeploy(era, state) })
    backdrop(state)
    game().go('run')
  })

  return {
    run: null,
    hasSave: false,
    storageOk: true,
    slips: null,
    slipsSeen: '',
    chosen: null,
    picks: [],
    report: null,
    annals: [],
    draftSeed: 1,
    draftIron: false,

    view: () => viewOf(get().run, get().slips, get().report),

    refresh: () => {
      const r = loadRun(store())
      set({ hasSave: r.ok && !r.state.end, storageOk: store() !== null, annals: loadAnnals(store()) })
    },

    openNew: () => {
      get().refresh()
      set({ run: null, report: null, slips: null, draftSeed: randomSeed(), draftIron: false })
      backdrop(null)
      game().go('run')
    },

    setDraft: (seed, iron) => set({ draftSeed: Math.max(1, Math.floor(seed) >>> 0 || 1), draftIron: iron }),

    startNew: (seed, ironOath) => {
      const s = newRun(seed ?? get().draftSeed, ironOath ?? get().draftIron, era)
      clearRun(store())
      set({ report: null, slipsSeen: '', chosen: null })
      update(s)
      return s
    },

    continueRun: () => {
      const r = loadRun(store())
      if (!r.ok || r.state.end) {
        set({ hasSave: false })
        return false
      }
      const s = r.state
      set({ run: s, report: null, chosen: null, slipsSeen: s.stop ? `${s.stop.id}:${s.stop.index}` : '', slips: null, annals: loadAnnals(store()) })
      if (s.phase === 'prologue') showStopSlips(s)
      if (s.phase === 'deploy') set({ picks: defaultDeploy(era, s) })
      if (s.phase === 'battle') {
        // A battle was sealed (its rice paid): it restarts from its first round with the same seed and deployment.
        startBattle(s)
        return true
      }
      backdrop(s)
      game().go('run')
      return true
    },

    advanceSlip: () => {
      const sl = get().slips
      if (!sl) return
      if (sl.index + 1 >= sl.lines.length) get().skipSlips()
      else set({ slips: { ...sl, index: sl.index + 1 } })
    },

    skipSlips: () => {
      const s = get().run
      set({ slips: null })
      if (s && s.phase === 'prologue') update(beginRoad(era, s))
    },

    pick: (choiceId) => set({ chosen: choiceId }),

    seal: () => {
      const { run: s, chosen } = get()
      if (!s || !chosen || s.phase !== 'stop') return
      update(runChoose(era, s, chosen))
    },

    hire: (n) => {
      const s = get().run
      if (!s) return
      update(hireLevies(era, s, n))
    },

    travel: (target, march) => {
      const s = get().run
      if (!s) return
      update(runTravel(era, s, target, march))
    },

    camp: () => {
      const s = get().run
      if (!s) return
      update(makeCamp(era, s))
    },

    sendHome: (h, w) => {
      const s = get().run
      if (!s) return
      const next = runSendHome(era, s, h, w)
      persist(next)
      if (next.phase === 'deploy') {
        // keep the picks but clamp them to the healthy soldiers left
        let left = next.soldiers
        set({ picks: get().picks.map((p) => { const n = Math.max(250, Math.min(p.soldiers, Math.floor(left / 50) * 50)); left -= n; return { ...p, soldiers: n } }) })
      }
    },

    toDeploy: () => {
      const s = get().run
      if (!s || s.phase !== 'finale') return
      update(toFinaleDeploy(era, s))
    },

    setSoldiers: (id, soldiers) => set({ picks: get().picks.map((p) => (p.id === id ? { ...p, soldiers } : p)) }),

    toggleOfficer: (id) => {
      const s = get().run
      if (!s) return
      const picks = get().picks
      if (picks.some((p) => p.id === id)) {
        if (id === 'liu-bei') return
        set({ picks: picks.filter((p) => p.id !== id) })
      } else {
        const chk = checkDeploy(era, s, picks)
        if (picks.length >= chk.slots) return
        set({ picks: [...picks, { id, soldiers: era.rules.minPerOfficer }] })
      }
    },

    sealDeploy: () => {
      const s = get().run
      if (!s) return
      const next = sealDeploy(era, s, get().picks)
      if (next === s) return
      persist(next)
      startBattle(next)
    },

    giveUp: () => {
      const s = get().run
      if (!s) return
      update(scatter(s, 'No deployment can be paid for: the band scatters before the battle.'))
    },

    afterReport: () => {
      const s = get().run
      set({ report: null })
      if (s) {
        showStopSlips(s)
        backdrop(s)
      }
    },

    toTitle: () => {
      get().refresh()
      set({ slips: null, report: null, chosen: null })
      game().go('title')
    },
  }
})
