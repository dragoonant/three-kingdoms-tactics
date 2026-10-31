// The ONLY caller of step(). Holds the live state, the action log, the presented scene and the UI selection.
import { create } from 'zustand'
import { createBotClient } from '../../ai/workerClient'
import { createBattle, legalActions, query, step, type Action, type BattleState, type Facing, type GameEvent, type Side } from '../../engine'
import { linesFor, type LedgerEntry } from '../ledger'
import { introBeats, planBeats, type Beat, type Speed } from '../presentation/beats'
import { Director } from '../presentation/director'
import { sceneFromState, type Scene } from '../presentation/scene'
import { BOT_SIDE, canControl, EMPTY_UI, PLAYER_SIDE, type Mode, type UiState } from './orders'

export type Screen = 'title' | 'howto' | 'briefing' | 'battle' | 'end'
export const BATTLE_ID = 'daxing-hill'
/** Which AI tier plays the enemy (random, easy or normal). */
const BOT_TIER = 'normal' as const

export interface Floater {
  id: number
  x: number
  y: number
  text: string
  tone: 'hit' | 'good' | 'fire' | 'info' | 'bad'
}
export interface SealMark {
  id: number
  unit: string
  name: string
  link: number
  bond: boolean
}
export interface Stats {
  bestChain: number
  hanLost: number
  foesRouted: number
  swayed: number
}

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const seedParam = params.get('seed')
export const TEST_MODE = params.get('test') === '1'
const speedParam = params.get('speed')

function freshSeed(): number {
  if (seedParam !== null && Number.isFinite(Number(seedParam))) return Number(seedParam) >>> 0
  return Math.floor(Math.random() * 0x7fffffff) + 1
}

interface GameStore {
  screen: Screen
  seed: number
  state: BattleState
  log: Action[]
  scene: Scene
  /** True while a batch of beats is playing. */
  playing: boolean
  beat: Beat | null
  beatNo: number
  speed: Speed
  floaters: Floater[]
  seals: SealMark[]
  ledger: LedgerEntry[]
  ledgerOpen: boolean
  stats: Stats
  ui: UiState
  /** Last rejected action message, for tests and the toast. */
  lastReject: string | null
  toast: string | null

  go: (s: Screen) => void
  begin: () => void
  restart: () => void
  act: (a: Action) => { ok: boolean; code?: string; message?: string }
  skip: () => void
  setSpeed: (s: Speed) => void
  toggleLedger: () => void

  select: (id: string | null) => void
  clickTile: (x: number, y: number) => void
  hoverTile: (x: number, y: number | null) => void
  setMode: (m: Mode) => void
  pickStrat: (id: string) => void
  pickFacing: (f: Facing) => void
  toggleExclude: (unitId: string) => void
  cancel: () => void
  undo: () => void
  endPhase: () => void
}

const initialStats = (): Stats => ({ bestChain: 0, hanLost: 0, foesRouted: 0, swayed: 0 })

export const useGame = create<GameStore>((set, get) => {
  const seed0 = freshSeed()
  const state0 = createBattle(BATTLE_ID, seed0)
  let floaterSeq = 1
  let sealSeq = 1
  let ledgerSeq = 1
  let pendingBefore: BattleState = state0
  let botTimer: ReturnType<typeof setTimeout> | null = null
  let botBusy = false
  const bot = createBotClient()
  let sealClear: ReturnType<typeof setTimeout> | null = null

  const director = new Director({
    speed: () => get().speed,
    scene: () => get().scene,
    setScene: (s) => set({ scene: s }),
    beatStart: (b, ms) => {
      const patch: Partial<GameStore> = { beat: b, beatNo: get().beatNo + 1, playing: true }
      if (ms > 0) {
        const f = b.fx
        const add: Floater[] = []
        const fl = (x: number, y: number, text: string, tone: Floater['tone']): void => {
          add.push({ id: floaterSeq++, x, y, text, tone })
        }
        if (f.t === 'damage' && f.amount > 0) fl(f.at.x, f.at.y, `−${f.amount.toLocaleString('en-US')}`, f.source === 'fire' ? 'fire' : 'hit')
        else if (f.t === 'heal') fl(f.at.x, f.at.y, `+${f.amount.toLocaleString('en-US')}`, 'good')
        else if (f.t === 'sawThrough') fl(f.at.x, f.at.y, 'Saw through!', 'info')
        else if (f.t === 'confuse') fl(f.at.x, f.at.y, 'Confused', 'bad')
        else if (f.t === 'recover') fl(f.at.x, f.at.y, 'Recovered', 'good')
        else if (f.t === 'sway') fl(f.at.x, f.at.y, f.ok ? 'Joins us!' : 'Refused', f.ok ? 'good' : 'info')
        if (add.length) {
          patch.floaters = [...get().floaters, ...add].slice(-12)
          const ids = new Set(add.map((a) => a.id))
          setTimeout(() => set({ floaters: get().floaters.filter((x) => !ids.has(x.id)) }), 1500)
        }
        if (f.t === 'stratagem') {
          if (sealClear) clearTimeout(sealClear)
          sealClear = null
          const mark: SealMark = { id: sealSeq++, unit: f.unit, name: f.name, link: f.link, bond: f.bond }
          patch.seals = f.link === 0 ? [mark] : [...get().seals, mark]
        }
      }
      set(patch)
    },
    committed: (events) => {
      const lines = linesFor(events, pendingBefore)
      const round = get().scene.round
      set({ ledger: [...get().ledger, ...lines.map((l) => ({ ...l, id: ledgerSeq++, round }))].slice(-500) })
    },
    idle: () => {
      set({ playing: false, beat: null })
      if (get().seals.length) {
        const delay = get().speed === 'instant' ? 0 : 1100
        sealClear = setTimeout(() => set({ seals: [] }), delay)
      }
      afterIdle()
    },
  })

  function afterIdle(): void {
    const st = get()
    if (st.screen === 'battle' && st.state.result) {
      set({ screen: 'end', ui: EMPTY_UI })
      return
    }
    scheduleBot()
  }

  function scheduleBot(): void {
    if (botTimer) clearTimeout(botTimer)
    botTimer = null
    const st = get()
    if (st.screen !== 'battle' || st.state.result || st.state.side !== BOT_SIDE || st.playing || botBusy) return
    const delay = st.speed === 'full' ? 750 : st.speed === 'quick' ? 220 : 0
    botTimer = setTimeout(() => {
      botTimer = null
      const cur = get()
      if (cur.screen !== 'battle' || cur.state.result || cur.state.side !== BOT_SIDE || cur.playing || botBusy) return
      botBusy = true
      // The utility AI runs in a worker (greedy fallback after 2 s); the answer is applied only if the game has not moved on.
      void bot
        .decide(cur.state, { tier: BOT_TIER, seed: cur.seed })
        .then((d) => d.action)
        .catch((): Action => ({ type: 'endPhase' }))
        .then((a) => {
          botBusy = false
          const now = get()
          if (now.state !== cur.state || now.screen !== 'battle' || now.playing) {
            scheduleBot()
            return
          }
          let r = now.act(a)
          // Watchdog: a rejected bot action must never stall the phase.
          if (!r.ok) r = get().act({ type: 'endPhase' })
        })
    }, delay)
  }

  function tally(events: GameEvent[], before: BattleState): Stats {
    const st = { ...get().stats }
    const opener = events.find((e) => e.kind === 'stratagem')
    if (opener && opener.kind === 'stratagem') {
      const caster = before.units.find((u) => u.id === opener.unit)
      if (caster?.side === PLAYER_SIDE) {
        const n = 1 + events.filter((e) => e.kind === 'chainLink').length
        st.bestChain = Math.max(st.bestChain, n)
      }
    }
    for (const e of events) {
      if (e.kind === 'routed') {
        if (e.side === PLAYER_SIDE) st.hanLost++
        else st.foesRouted++
      }
      if (e.kind === 'swayed' && e.side === PLAYER_SIDE) st.swayed++
    }
    return st
  }

  function resetBattle(): void {
    const seed = freshSeed()
    const s = createBattle(BATTLE_ID, seed)
    pendingBefore = s
    director.skip()
    set({
      seed,
      state: s,
      log: [],
      scene: sceneFromState(s),
      playing: false,
      beat: null,
      floaters: [],
      seals: [],
      ledger: [],
      stats: initialStats(),
      ui: EMPTY_UI,
      lastReject: null,
    })
  }

  // Watchdog: re-arms the bot if a timer was lost (background tabs throttle timers) and skips a batch that overran.
  if (typeof window !== 'undefined') {
    setInterval(() => {
      const st = get()
      if (st.screen !== 'battle') return
      if (director.playing) {
        if (director.age > 25_000) director.skip()
        return
      }
      if (st.state.side === BOT_SIDE && !st.state.result && !botTimer) scheduleBot()
    }, 2000)
  }

  const clearedUi = (keep: string | null): UiState => ({ ...EMPTY_UI, selectedId: keep })

  return {
    screen: params.get('screen') === 'battle' ? 'battle' : 'title',
    seed: seed0,
    state: state0,
    log: [],
    scene: sceneFromState(state0),
    playing: false,
    beat: null,
    beatNo: 0,
    speed: speedParam === 'instant' || speedParam === 'quick' || speedParam === 'full' ? speedParam : 'full',
    floaters: [],
    seals: [],
    ledger: [],
    ledgerOpen: false,
    stats: initialStats(),
    ui: EMPTY_UI,
    lastReject: null,
    toast: null,

    go: (screen) => {
      // Leaving a battle for the title shows a fresh sand table again.
      if (screen === 'title' && (get().screen === 'battle' || get().screen === 'end')) resetBattle()
      set({ screen, ui: EMPTY_UI })
      if (screen === 'battle') scheduleBot()
    },

    begin: () => {
      resetBattle()
      const s = get().state
      set({ screen: 'battle' })
      pendingBefore = s
      director.play(introBeats(s), sceneFromState(s))
    },

    restart: () => {
      get().begin()
    },

    act: (a) => {
      const st = get()
      if (st.screen !== 'battle') return { ok: false, code: 'notInBattle', message: 'No battle is running' }
      if (director.playing) director.skip()
      const before = get().state
      const r = step(before, a)
      if (!r.ok) {
        set({ lastReject: `${r.code}: ${r.message}` })
        return { ok: false, code: r.code, message: r.message }
      }
      pendingBefore = before
      const keep =
        a.type === 'move' && r.state.units.some((u) => u.id === a.unit && !u.done) ? a.unit : a.type === 'undoMove' ? a.unit : null
      const nextSel = keep && canControl(r.state, r.state.units.find((u) => u.id === keep)) ? keep : null
      const beats = planBeats(r.events, before)
      set({
        state: r.state,
        log: [...st.log, a],
        stats: tally(r.events, before),
        ui: clearedUi(nextSel),
        lastReject: null,
        playing: true,
      })
      director.play(beats, sceneFromState(r.state))
      return { ok: true }
    },

    skip: () => director.skip(),

    setSpeed: (speed) => {
      set({ speed })
      scheduleBot()
    },

    toggleLedger: () => set({ ledgerOpen: !get().ledgerOpen }),

    select: (id) => set({ ui: { ...clearedUi(id), hover: get().ui.hover } }),

    clickTile: (x, y) => {
      const st = get()
      if (st.playing || st.screen !== 'battle' || st.state.result) return
      const { state, ui } = st
      const at = query.unitAt(state, x, y)
      const sel = state.units.find((u) => u.id === ui.selectedId)
      const mine = canControl(state, sel)
      if (mine && sel) {
        if (ui.mode === 'attack' && at && query.attackTargets(state, sel.id).includes(at.id)) {
          set({ ui: { ...ui, pendingTarget: at.id } })
          return
        }
        if (ui.mode === 'sway' && at && query.swayTargets(state, sel.id).includes(at.id)) {
          set({ ui: { ...ui, pendingTarget: at.id } })
          return
        }
        if (ui.mode === 'stratagem' && ui.strat && query.stratagemTargets(state, sel.id, ui.strat).some((p) => p.x === x && p.y === y)) {
          set({ ui: { ...ui, pendingAnchor: { x, y }, exclude: [] } })
          return
        }
        if (ui.mode === 'none' && !sel.moved && query.moveRange(state, sel.id).some((m) => m.x === x && m.y === y)) {
          get().act({ type: 'move', unit: sel.id, x, y })
          return
        }
      }
      if (at) {
        set({ ui: { ...clearedUi(at.id), hover: ui.hover } })
        return
      }
      if (ui.mode !== 'none') set({ ui: { ...ui, mode: 'none', strat: null, pendingTarget: null, pendingAnchor: null, pendingFacing: null, exclude: [] } })
      else set({ ui: { ...clearedUi(null), hover: ui.hover } })
    },

    hoverTile: (x, y) => {
      const cur = get().ui.hover
      if (y === null) {
        if (cur) set({ ui: { ...get().ui, hover: null } })
        return
      }
      if (cur && cur.x === x && cur.y === y) return
      set({ ui: { ...get().ui, hover: { x, y } } })
    },

    setMode: (mode) => {
      const { state, ui } = get()
      const sel = state.units.find((u) => u.id === ui.selectedId)
      if (!canControl(state, sel)) return
      const base: UiState = { ...ui, mode, strat: null, pendingTarget: null, pendingAnchor: null, pendingFacing: null, exclude: [] }
      if (mode === 'attack') {
        const t = query.attackTargets(state, sel.id)
        set({ ui: { ...base, pendingTarget: t.length === 1 ? (t[0] ?? null) : null } })
        return
      }
      if (mode === 'sway') {
        const t = query.swayTargets(state, sel.id)
        set({ ui: { ...base, pendingTarget: t.length === 1 ? (t[0] ?? null) : null } })
        return
      }
      set({ ui: base })
    },

    pickStrat: (id) => {
      const { state, ui } = get()
      const sel = state.units.find((u) => u.id === ui.selectedId)
      if (!canControl(state, sel)) return
      const opt = query.stratagemOptions(state, sel.id).find((o) => o.id === id)
      if (!opt || !opt.usable) return
      const def = state.data.stratagems[id]
      const anchors = query.stratagemTargets(state, sel.id, id)
      // Caster-centred stratagems have exactly one anchor: the caster's own tile.
      const auto = def && (def.area === 'adjacent' || def.area === 'aura') && anchors.length === 1 ? anchors[0]! : null
      set({ ui: { ...ui, mode: 'stratagem', strat: id, pendingTarget: null, pendingAnchor: auto, pendingFacing: null, exclude: [] } })
    },

    pickFacing: (f) => set({ ui: { ...get().ui, mode: 'wait', pendingFacing: f } }),

    toggleExclude: (unitId) => {
      const ui = get().ui
      set({ ui: { ...ui, exclude: ui.exclude.includes(unitId) ? ui.exclude.filter((x) => x !== unitId) : [...ui.exclude, unitId] } })
    },

    cancel: () => {
      const ui = get().ui
      if (ui.mode !== 'none') set({ ui: { ...ui, mode: 'none', strat: null, pendingTarget: null, pendingAnchor: null, pendingFacing: null, exclude: [] } })
      else if (ui.selectedId) set({ ui: { ...clearedUi(null), hover: ui.hover } })
    },

    undo: () => {
      const { state, ui } = get()
      if (!ui.selectedId) return
      if (legalActions(state).some((a) => a.type === 'undoMove' && a.unit === ui.selectedId)) get().act({ type: 'undoMove', unit: ui.selectedId })
    },

    endPhase: () => {
      const st = get()
      if (st.playing || st.state.side !== PLAYER_SIDE || st.state.result) return
      st.act({ type: 'endPhase' })
    },
  }
})

export function sideLabel(side: Side): string {
  return side === PLAYER_SIDE ? 'Han' : 'Yellow Turban'
}
