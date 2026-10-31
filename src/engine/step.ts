// The reducer. step() never throws on a bad action: it returns {ok:false, code, message}.
import { cloneWork, getUnit, inBounds, officerOf, unitAt } from './board'
import { attackRange, resolveAttack } from './combat'
import { legalActionsFor, sameAction } from './legal'
import { isExitTile } from './objectives'
import { emitProgress } from './turn'
import { PLAYER_SIDE } from '../data/types'
import { FACINGS, manhattan } from './geometry'
import { pathTo } from './movement'
import { dropProvokesBy, turnUnit } from './ops'
import { rngRoller } from './rng'
import { dashDestination, isDash, legalAnchors, runStratagem } from './stratagems'
import { resolveSway, swayReason } from './sway'
import { endPhase } from './turn'
import type { Action, BattleState, GameEvent, Pos, RejectCode, StepResult, Unit } from './types'
import { concludeIfWon } from './victory'

interface Reject {
  code: RejectCode
  message: string
}

const rej = (code: RejectCode, message: string): Reject => ({ code, message })
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function shapeError(a: unknown): Reject | null {
  if (typeof a !== 'object' || a === null) return rej('malformed', 'Action must be an object')
  const r = a as Record<string, unknown>
  switch (r.type) {
    case 'endPhase':
      return null
    case 'undoMove':
      return isStr(r.unit) ? null : rej('malformed', 'undoMove needs a unit id')
    case 'move':
      return isStr(r.unit) && isInt(r.x) && isInt(r.y) ? null : rej('malformed', 'move needs unit, integer x and y')
    case 'attack':
    case 'sway':
      return isStr(r.unit) && isStr(r.target) ? null : rej('malformed', `${String(r.type)} needs unit and target`)
    case 'escape':
      return isStr(r.unit) ? null : rej('malformed', 'escape needs a unit id')
    case 'wait':
      return isStr(r.unit) && typeof r.facing === 'string' ? null : rej('malformed', 'wait needs unit and facing')
    case 'stratagem':
      return isStr(r.unit) &&
        isStr(r.strat) &&
        isInt(r.x) &&
        isInt(r.y) &&
        Array.isArray(r.excludeFromChain) &&
        r.excludeFromChain.every(isStr)
        ? null
        : rej('malformed', 'stratagem needs unit, strat, integer x/y and excludeFromChain[]')
    default:
      return rej('malformed', 'Unknown action type')
  }
}

function actor(w: BattleState, id: string): Unit | Reject {
  const u = getUnit(w, id)
  if (!u) return rej('unknownUnit', `No unit ${id}`)
  if (u.side !== w.side) return rej('notYourPhase', `${id} belongs to the other side`)
  if (u.confused) return rej('unitConfused', `${id} is confused and cannot act`)
  if (u.done) return rej('unitDone', `${id} has already acted this phase`)
  return u
}

const isReject = (v: Unit | Reject): v is Reject => 'code' in v

/** [R2-STRAT-3] A provoked unit may only take the actions legalActions offers it. */
function provokeGuard(w: BattleState, u: Unit, a: Action): Reject | null {
  if (u.provoked === undefined) return null
  if (legalActionsFor(w, u).some((x) => sameAction(x, a))) return null
  return rej('provoked', `${u.id} is provoked and must attack or approach the provoker`)
}

function stepInner(state: BattleState, action: Action): StepResult {
  if (state.result) return { ok: false, code: 'battleOver', message: 'The battle is over' }
  const bad = shapeError(action)
  if (bad) return { ok: false, ...bad }
  const w = cloneWork(state)
  const ev: GameEvent[] = []
  const roller = rngRoller(w.rng)

  switch (action.type) {
    case 'endPhase':
      endPhase(w, ev, roller)
      break

    case 'move': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      if (u.moved) return { ok: false, ...rej('alreadyMoved', `${u.id} has already moved`) }
      const p = pathTo(w, u, action.x, action.y)
      if (!p) return { ok: false, ...rej('cannotReach', `${u.id} cannot reach ${action.x},${action.y}`) }
      const from = { x: u.x, y: u.y }
      u.undo = { x: u.x, y: u.y, facing: u.facing }
      u.moved = true
      u.x = action.x
      u.y = action.y
      u.facing = p.facing
      ev.push({ kind: 'moved', unit: u.id, from, to: { x: u.x, y: u.y }, path: p.path, cost: p.cost, facing: u.facing })
      break
    }

    case 'undoMove': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      if (!u.moved || !u.undo) return { ok: false, ...rej('nothingToUndo', `${u.id} has not moved`) }
      if (unitAt(w, u.undo.x, u.undo.y)) return { ok: false, ...rej('startTileOccupied', `The tile ${u.id} started on is now occupied`) }
      const from = { x: u.x, y: u.y }
      const back = u.undo
      u.x = back.x
      u.y = back.y
      u.facing = back.facing
      u.moved = false
      u.undo = null
      ev.push({ kind: 'moved', unit: u.id, from, to: { x: u.x, y: u.y }, path: [], cost: 0, facing: u.facing, undo: true })
      break
    }

    case 'attack': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      const t = getUnit(w, action.target)
      if (!t) return { ok: false, ...rej('unknownTarget', `No unit ${action.target}`) }
      if (t.side === u.side) return { ok: false, ...rej('targetNotEnemy', `${t.id} is an ally`) }
      const r = attackRange(w, u)
      const d = manhattan(u, t)
      if (d < r.min) return { ok: false, ...rej('targetTooClose', `Archers cannot attack an adjacent tile`) }
      if (d > r.max) return { ok: false, ...rej('outOfRange', `${t.id} is ${d} tiles away (range ${r.min}-${r.max})`) }
      resolveAttack(w, ev, roller, u.id, t.id)
      const self = getUnit(w, u.id)
      if (self) {
        self.done = true
        self.undo = null
      }
      break
    }

    case 'stratagem': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      const strat = w.data.stratagems[action.strat]
      if (!strat) return { ok: false, ...rej('unknownStratagem', `No stratagem ${action.strat}`) }
      if (!officerOf(w, u).stratagems.includes(strat.id))
        return { ok: false, ...rej('stratagemNotKnown', `${u.id} does not know ${strat.name}`) }
      if (u.qi < strat.cost) return { ok: false, ...rej('notEnoughQi', `${strat.name} costs ${strat.cost} Qi, ${u.id} has ${u.qi}`) }
      const anchors = legalAnchors(w, u, strat)
      if (!anchors.some((a) => a.x === action.x && a.y === action.y)) {
        return { ok: false, ...anchorReject(w, u, strat.id, { x: action.x, y: action.y }) }
      }
      const live = getUnit(w, u.id)!
      runStratagem(w, ev, roller, live, strat, { x: action.x, y: action.y }, action.excludeFromChain)
      live.done = true
      live.undo = null
      break
    }

    case 'sway': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      const t = getUnit(w, action.target)
      if (!t) return { ok: false, ...rej('unknownTarget', `No unit ${action.target}`) }
      if (t.side === u.side) return { ok: false, ...rej('targetNotEnemy', `${t.id} is an ally`) }
      if (t.commander) return { ok: false, ...rej('commanderCannotBeSwayed', 'A commander cannot be swayed') }
      const reason = swayReason(w, u, t)
      if (reason) {
        const code: RejectCode = reason.startsWith('Out of range')
          ? 'outOfRange'
          : reason.startsWith('Already')
            ? 'swayAlreadyTried'
            : 'cannotBeSwayed'
        return { ok: false, ...rej(code, reason) }
      }
      resolveSway(w, ev, roller, u.id, t.id)
      u.done = true
      u.undo = null
      break
    }

    case 'escape': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      if (u.side !== PLAYER_SIDE || !isExitTile(w, u.x, u.y)) return { ok: false, ...rej('cannotEscape', `${u.id} is not on an exit tile`) }
      w.units = w.units.filter((x) => x.id !== u.id)
      dropProvokesBy(w, u.id)
      w.escaped.push(u.id)
      ev.push({ kind: 'escaped', unit: u.id, side: u.side, x: u.x, y: u.y })
      emitProgress(w, ev)
      break
    }

    case 'wait': {
      const u = actor(w, action.unit)
      if (isReject(u)) return { ok: false, ...u }
      const pv = provokeGuard(w, u, action)
      if (pv) return { ok: false, ...pv }
      if (!FACINGS.includes(action.facing)) return { ok: false, ...rej('badFacing', `Facing must be one of N E S W`) }
      turnUnit(ev, u, action.facing)
      ev.push({ kind: 'waited', unit: u.id, facing: u.facing })
      u.done = true
      u.undo = null
      break
    }
  }
  concludeIfWon(w, ev)
  return { ok: true, state: w, events: ev }
}

function anchorReject(w: BattleState, u: Unit, stratId: string, p: Pos): Reject {
  const strat = w.data.stratagems[stratId]!
  if (!inBounds(w.grid, p.x, p.y)) return rej('outOfRange', 'Target is off the map')
  if (strat.area === 'adjacent' || strat.area === 'aura') {
    if (p.x !== u.x || p.y !== u.y) return rej('noValidTarget', `${strat.name} is centred on the caster`)
    return rej('noValidTarget', `${strat.name} has nothing to affect`)
  }
  const d = manhattan(u, p)
  if (d < strat.range.min || d > strat.range.max)
    return rej('outOfRange', `${strat.name} range is ${strat.range.min}-${strat.range.max}, target is ${d} away`)
  if (isDash(strat)) {
    const target = w.units.find((t) => t.x === p.x && t.y === p.y && t.side !== u.side)
    if (target && !dashDestination(w, u, p, strat)) return rej('dashBlocked', 'The charge needs a straight, clear, forest-free line')
  }
  return rej('noValidTarget', `${strat.name} would hit nothing there`)
}

export function step(state: BattleState, action: Action): StepResult {
  try {
    return stepInner(state, action)
  } catch (e) {
    return { ok: false, code: 'internalError', message: e instanceof Error ? e.message : String(e) }
  }
}
