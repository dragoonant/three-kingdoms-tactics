// The ONLY caller of step(). Holds the live state, the action log, the presented scene and the UI selection.
import { create } from 'zustand'
import { createBotClient } from '../../ai/workerClient'
import type { Tier } from '../../ai/decider'
import { getBattleDef } from '../../data'
import type { CreateOptions } from '../../data/types'
import { createBattle, legalActions, query, step, type Action, type BattleState, type Facing, type GameEvent, type Side } from '../../engine'
import { setBoardSize, setSideTokens } from '../board/layout'
import { linesFor, type LedgerEntry } from '../ledger'
import { getCutinSettings } from '../cutins/settings'
import { player } from '../cutins/player'
import { prebuildFor } from '../cutins/prep'
import { introBeats, planBeats, type Beat, type Fx, type Speed } from '../presentation/beats'
import { Director } from '../presentation/director'
import { sceneFromState, type Scene } from '../presentation/scene'
import { canControl, EMPTY_UI, isBotSide, PLAYER_SIDE, type Mode, type UiState } from './orders'

export type Screen =
  | 'title'
  | 'howto'
  | 'briefing'
  | 'battle'
  | 'end'
  // campaign flow (docs/spec/12-campaign.md)
  | 'newcampaign'
  | 'scene'
  | 'cbrief'
  | 'camp'
  | 'deploy'
  | 'results'
  | 'defeat'
  | 'summary'
export type PlayMode = 'skirmish' | 'campaign'
/** Which AI tier plays the enemy (random, easy or normal). */
/** Enemy AI strength. 'normal' in play; `?bot=random|easy|normal` overrides it (debugging, and tests that check flow rather than balance). */
let botTier: Tier = readBotTier()
function readBotTier(): Tier {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('bot') : null
    return q === 'random' || q === 'easy' || q === 'normal' ? q : 'normal'
  } catch {
    return 'normal'
  }
}
export function setBotTier(t: Tier): void {
  botTier = t
}

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

const STAT_WORD: Record<string, string> = { war: 'War', int: 'Int', lead: 'Lead', cha: 'Cha' }

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
const seedParam = params.get('seed')
export const TEST_MODE = params.get('test') === '1'
const speedParam = params.get('speed')
/** The quick-play battle. `?battle=<id>` is a dev switch (e.g. `?battle=proving-ground`). */
const battleParam = params.get('battle')
export const SKIRMISH_ID = battleParam && getBattleDef(battleParam) ? battleParam : 'daxing-hill'
export const BATTLE_ID = SKIRMISH_ID

function freshSeed(): number {
  if (seedParam !== null && Number.isFinite(Number(seedParam))) return Number(seedParam) >>> 0
  return Math.floor(Math.random() * 0x7fffffff) + 1
}

type BattleEndHandler = (final: BattleState, events: GameEvent[]) => void
let battleEndHandler: BattleEndHandler | null = null
/** The campaign layer registers here to hear that a campaign battle ended (the store never imports it). */
export function setBattleEndHandler(h: BattleEndHandler | null): void {
  battleEndHandler = h
}

interface GameStore {
  screen: Screen
  mode: PlayMode
  battleId: string
  seed: number
  state: BattleState
  log: Action[]
  /** Every engine event of the battle so far (state.opening, then each action's events), for the campaign's XP. */
  events: GameEvent[]
  scene: Scene
  /** True while a batch of beats is playing. */
  playing: boolean
  /** A cut-in covers the board and its result has not landed yet: the board canvas stops drawing. */
  cutinPaused: boolean
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
  /** Load a battle onto the table without starting it (title, scenes, briefing, camp and deploy backdrops). */
  showTable: (battleId: string, seed: number, options?: CreateOptions) => BattleState
  /** Start a campaign battle: the table is set from `options` and the round scroll plays. */
  beginCampaign: (battleId: string, seed: number, options?: CreateOptions) => void
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

/** How long the enemy's move may wait for its cut-in's world to be built (it is usually a few hundred ms). */
const PREBUILD_WAIT_MS = 4000

const initialStats = (): Stats => ({ bestChain: 0, hanLost: 0, foesRouted: 0, swayed: 0 })

export const useGame = create<GameStore>((set, get) => {
  const seed0 = freshSeed()
  const state0 = createBattle(BATTLE_ID, seed0)
  setBoardSize(state0.grid.width, state0.grid.height)
  setSideTokens(state0.sides)
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
      // a cut-in shows its floaters and seals when its result lands, not when it starts
      if (ms > 0 && b.fx.t !== 'cutin') collectFx(b.fx, patch)
      set(patch)
    },
    cutin: (b, hooks) => {
      const fx = b.fx
      if (fx.t !== 'cutin') {
        hooks.onDone()
        return
      }
      set({ cutinPaused: true })
      player.start(fx.plan, {
        onResult: () => {
          set({ cutinPaused: false })
          hooks.onResult()
        },
        onDone: () => {
          set({ cutinPaused: false })
          hooks.onDone()
        },
      })
    },
    cutinCancel: () => {
      player.cancel()
      set({ cutinPaused: false })
    },
    resultLanded: (b) => {
      if (b.fx.t !== 'cutin') return
      const patch: Partial<GameStore> = {}
      for (const inner of b.fx.inner) collectFx(inner.fx, patch)
      if (Object.keys(patch).length) set(patch)
    },
    committed: (events) => {
      const lines = linesFor(events, pendingBefore)
      const round = get().scene.round
      set({ ledger: [...get().ledger, ...lines.map((l) => ({ ...l, id: ledgerSeq++, round }))].slice(-500) })
    },
    idle: () => {
      set({ playing: false, beat: null, cutinPaused: false })
      if (get().seals.length) {
        const delay = get().speed === 'instant' ? 0 : 1100
        sealClear = setTimeout(() => set({ seals: [] }), delay)
      }
      afterIdle()
    },
  })

  let suppressIdle = false
  /** Floaters (damage numbers...) and the chain's seals for one board beat, added to `patch`. */
  function collectFx(f: Fx, patch: Partial<GameStore>): void {
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
    else if (f.t === 'buff') fl(f.at.x, f.at.y, `${STAT_WORD[f.stat] ?? f.stat} ${f.amount > 0 ? '+' : ''}${f.amount}`, 'good')
    else if (f.t === 'provoke') fl(f.at.x, f.at.y, 'Provoked!', 'bad')
    else if (f.t === 'leave') fl(f.at.x, f.at.y, f.how === 'escape' ? 'Escapes!' : 'Retreats', f.how === 'escape' ? 'good' : 'info')
    else if (f.t === 'arrive') fl(f.at.x, f.at.y, 'Reinforcements', f.vis.side === PLAYER_SIDE ? 'good' : 'bad')
    if (add.length) {
      patch.floaters = [...(patch.floaters ?? get().floaters), ...add].slice(-12)
      const ids = new Set(add.map((a) => a.id))
      setTimeout(() => set({ floaters: get().floaters.filter((x) => !ids.has(x.id)) }), 1500)
    }
    if (f.t === 'stratagem') {
      if (sealClear) clearTimeout(sealClear)
      sealClear = null
      const mark: SealMark = { id: sealSeq++, unit: f.unit, name: f.name, link: f.link, bond: f.bond }
      patch.seals = f.link === 0 ? [mark] : [...(patch.seals ?? get().seals), mark]
    }
  }

  function afterIdle(): void {
    if (suppressIdle) return
    const st = get()
    if (st.screen === 'battle' && st.state.result) {
      if (st.mode === 'campaign' && battleEndHandler) {
        set({ ui: EMPTY_UI })
        battleEndHandler(st.state, st.events)
        return
      }
      set({ screen: 'end', ui: EMPTY_UI })
      return
    }
    scheduleBot()
  }

  function scheduleBot(): void {
    if (botTimer) clearTimeout(botTimer)
    botTimer = null
    const st = get()
    if (st.screen !== 'battle' || st.state.result || !isBotSide(st.state.side) || st.playing || botBusy) return
    const delay = st.speed === 'full' ? 750 : st.speed === 'quick' ? 220 : 0
    botTimer = setTimeout(() => {
      botTimer = null
      const cur = get()
      if (cur.screen !== 'battle' || cur.state.result || !isBotSide(cur.state.side) || cur.playing || botBusy) return
      botBusy = true
      // The utility AI runs in a worker (greedy fallback after 2 s); the answer is applied only if the game has not moved on.
      void bot
        .decide(cur.state, { tier: botTier, seed: cur.seed })
        .then((d) => d.action)
        .catch((): Action => ({ type: 'endPhase' }))
        .then(async (a) => {
          // the AI's choice is known: build its cut-in's world before it plays (docs/spec/51 "Performance"), within a bound
          await Promise.race([prebuildFor(cur.state, a, cur.speed, PLAYER_SIDE).catch(() => {}), new Promise((r) => setTimeout(r, PREBUILD_WAIT_MS))])
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

  /** Put a battle on the table: size, side colours, scene, ledger (round-1 timeline lines) and a clean log. */
  function loadBattle(battleId: string, seed: number, options?: CreateOptions): BattleState {
    const s = createBattle(battleId, seed, options)
    setBoardSize(s.grid.width, s.grid.height)
    setSideTokens(s.sides)
    pendingBefore = s
    suppressIdle = true
    director.skip()
    suppressIdle = false
    ledgerSeq = 1
    const opening = linesFor(s.opening, s).map((l) => ({ ...l, id: ledgerSeq++, round: s.round }))
    set({
      battleId,
      seed,
      state: s,
      log: [],
      events: s.opening.slice(),
      scene: sceneFromState(s),
      playing: false,
      cutinPaused: false,
      beat: null,
      floaters: [],
      seals: [],
      ledger: opening,
      stats: initialStats(),
      ui: EMPTY_UI,
      lastReject: null,
    })
    return s
  }

  function resetBattle(): void {
    loadBattle(SKIRMISH_ID, freshSeed())
  }

  // Watchdog: re-arms the bot if a timer was lost (background tabs throttle timers) and skips a batch that overran.
  if (typeof window !== 'undefined') {
    setInterval(() => {
      const st = get()
      if (st.screen !== 'battle') return
      if (director.playing) {
        // a chain of cut-ins runs for tens of seconds on a slow machine: the cut-in has its own, longer allowance; a cut-in a
        // test or capture tool steps by hand (player.manual) has none, since that caller owns its clock
        if (director.inCutin && player.manual) return
        if (director.age > (director.inCutin ? 120_000 : 25_000)) director.skip()
        return
      }
      if (isBotSide(st.state.side) && !st.state.result && !botTimer) scheduleBot()
    }, 2000)
  }

  const clearedUi = (keep: string | null): UiState => ({ ...EMPTY_UI, selectedId: keep })

  return {
    screen: params.get('screen') === 'battle' ? 'battle' : 'title',
    mode: 'skirmish',
    battleId: BATTLE_ID,
    seed: seed0,
    state: state0,
    log: [],
    events: state0.opening.slice(),
    scene: sceneFromState(state0),
    playing: false,
    cutinPaused: false,
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
      // Leaving for the title shows a fresh sand table again.
      if (screen === 'title') {
        const was = get().screen
        if (was === 'battle' || was === 'end' || get().mode === 'campaign') {
          resetBattle()
          set({ mode: 'skirmish' })
        }
      }
      set({ screen, ui: EMPTY_UI })
      if (screen === 'battle') scheduleBot()
    },

    showTable: (battleId, seed, options) => loadBattle(battleId, seed, options),

    begin: () => {
      resetBattle()
      const s = get().state
      set({ screen: 'battle', mode: 'skirmish' })
      pendingBefore = s
      director.play(introBeats(s), sceneFromState(s))
    },

    beginCampaign: (battleId, seed, options) => {
      const s = loadBattle(battleId, seed, options)
      set({ screen: 'battle', mode: 'campaign' })
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
      const beats = planBeats(r.events, before, { settings: getCutinSettings(), speed: st.speed, playerSide: PLAYER_SIDE })
      set({
        state: r.state,
        log: [...st.log, a],
        events: [...st.events, ...r.events],
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

export function sideLabel(state: BattleState, side: Side): string {
  return state.sides.find((s) => s.id === side)?.name ?? side
}
