// What the player has set up but not yet sealed. Every number comes from query.*; this file only formats.
import { query, type Action, type BattleState, type Facing, type Pos, type StratagemPreview, type AttackPreview, type SwayPreview, type Unit } from '../../engine'
import { facingWord, num } from '../ledger'
import { nameOfUnit, shortName } from '../names'

export type Mode = 'none' | 'attack' | 'stratagem' | 'sway' | 'wait'

export interface UiState {
  selectedId: string | null
  mode: Mode
  strat: string | null
  pendingTarget: string | null
  pendingAnchor: Pos | null
  pendingFacing: Facing | null
  /** Unit ids the player removed from the planned chain. */
  exclude: string[]
  hover: Pos | null
}

export const EMPTY_UI: UiState = {
  selectedId: null,
  mode: 'none',
  strat: null,
  pendingTarget: null,
  pendingAnchor: null,
  pendingFacing: null,
  exclude: [],
  hover: null,
}

export const PLAYER_SIDE = 'han' as const
export const BOT_SIDE = 'yellow' as const

export function canControl(state: BattleState, u: Unit | undefined): u is Unit {
  return !!u && !state.result && u.side === PLAYER_SIDE && state.side === PLAYER_SIDE && !u.done && !u.confused
}

export interface Order {
  action: Action
  /** Text on the cinnabar seal. */
  label: string
  preview?: { attack?: AttackPreview; stratagem?: StratagemPreview; sway?: SwayPreview }
}

const range = (min: number, max: number): string => (min === max ? num(min) : `${num(min)}–${num(max)}`)

export function stratagemRange(pv: StratagemPreview): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const t of pv.targets) {
    min += t.min
    max += t.max
  }
  return { min, max }
}

export function pendingOrder(state: BattleState, ui: UiState): Order | null {
  const u = state.units.find((x) => x.id === ui.selectedId)
  if (!canControl(state, u)) return null
  if (ui.mode === 'attack' && ui.pendingTarget) {
    const pv = query.attackPreview(state, u.id, ui.pendingTarget)
    if (!pv || !query.attackTargets(state, u.id).includes(ui.pendingTarget)) return null
    const counter = pv.counter.possible ? `, counter ${range(pv.counter.min, pv.counter.max)}` : ''
    return {
      action: { type: 'attack', unit: u.id, target: ui.pendingTarget },
      label: `Seal: Attack → ${shortName(nameOfUnit(state, ui.pendingTarget))}, ${range(pv.damage.min, pv.damage.max)}${counter}`,
      preview: { attack: pv },
    }
  }
  if (ui.mode === 'sway' && ui.pendingTarget) {
    const pv = query.swayChance(state, u.id, ui.pendingTarget)
    if (!pv || !pv.legal) return null
    return {
      action: { type: 'sway', unit: u.id, target: ui.pendingTarget },
      label: `Seal: Sway → ${shortName(nameOfUnit(state, ui.pendingTarget))}, ${pv.chance}% to join us`,
      preview: { sway: pv },
    }
  }
  if (ui.mode === 'stratagem' && ui.strat && ui.pendingAnchor) {
    const def = state.data.stratagems[ui.strat]
    const pv = query.stratagemPreview(state, u.id, ui.strat, ui.pendingAnchor, ui.exclude)
    if (!def || !pv) return null
    const r = stratagemRange(pv)
    let tail = ''
    if (pv.heals.length > 0) tail = `heals ${num(pv.heals.reduce((n, h) => n + h.amount, 0))}`
    else if (pv.targets.length > 0) {
      const who = pv.targets.length === 1 ? shortName(nameOfUnit(state, pv.targets[0]!.unit)) : `${pv.targets.length} foes`
      tail = `${who}, ${r.max > 0 ? range(r.min, r.max) : 'confuse'}`
    } else if (pv.ignites) tail = 'sets the ground alight'
    const chain = pv.chain.length > 1 ? ` + chain ×${pv.chain.length}` : ''
    return {
      action: { type: 'stratagem', unit: u.id, strat: ui.strat, x: ui.pendingAnchor.x, y: ui.pendingAnchor.y, excludeFromChain: ui.exclude.slice() },
      label: `Seal: ${def.name} → ${tail}${chain}`,
      preview: { stratagem: pv },
    }
  }
  if (ui.mode === 'wait' && ui.pendingFacing) {
    return { action: { type: 'wait', unit: u.id, facing: ui.pendingFacing }, label: `Seal: Wait, facing ${facingWord(ui.pendingFacing)}` }
  }
  return null
}
