// A one-ply greedy decider. Pure: no React, no timers, no randomness. It only ever returns an action taken from
// legalActions (or a move/wait derived from the same query results), and calls endPhase when nobody is ready.
import {
  arcOf,
  facingToward,
  legalActions,
  manhattan,
  query,
  step,
  type Action,
  type BattleState,
  type Pos,
  type Unit,
} from '../engine'

const SWAY_MIN_PERCENT = 60
const COMMANDER_BONUS = 3000
const ROUT_BONUS = 220

interface Cand {
  action: Action
  score: number
}

function nearestEnemy(state: BattleState, from: Pos, side: Unit['side']): Unit | undefined {
  let best: Unit | undefined
  let bd = Infinity
  for (const e of state.units) {
    if (e.side === side) continue
    const d = manhattan(from, e)
    if (d < bd || (d === bd && best && e.id < best.id)) {
      best = e
      bd = d
    }
  }
  return best
}

function burningAt(state: BattleState, x: number, y: number): boolean {
  return (state.burn[y * state.grid.width + x] ?? 0) > 0
}

/** The best attack, stratagem or sway available to `u` from where it stands now. */
function bestOffense(state: BattleState, u: Unit): Cand | null {
  let best: Cand | null = null
  const consider = (action: Action, score: number): void => {
    if (!best || score > best.score) best = { action, score }
  }

  for (const tid of query.attackTargets(state, u.id)) {
    const t = state.units.find((x) => x.id === tid)
    const pv = query.attackPreview(state, u.id, tid)
    if (!t || !pv) continue
    let v = pv.damage.expected
    if (pv.routsAtMin) v += ROUT_BONUS + (t.commander ? COMMANDER_BONUS : 0)
    else if (pv.routsAtMax) v += (ROUT_BONUS + (t.commander ? COMMANDER_BONUS : 0)) * 0.5
    if (pv.counter.possible) v -= ((pv.counter.min + pv.counter.max) / 2) * 0.6
    consider({ type: 'attack', unit: u.id, target: tid }, v)
  }

  for (const sid of query.stratagemOptions(state, u.id)) {
    if (!sid.usable) continue
    const def = state.data.stratagems[sid.id]
    if (!def) continue
    for (const a of query.stratagemTargets(state, u.id, sid.id)) {
      const pv = query.stratagemPreview(state, u.id, sid.id, a)
      if (!pv) continue
      let v = 0
      if (def.tag === 'Command') {
        v = pv.heals.reduce((n, h) => n + h.amount, 0) * 0.9
        if (v <= 0) continue
      } else {
        let opener = 0
        for (const t of pv.targets) {
          const tu = state.units.find((x) => x.id === t.unit)
          opener += t.expected * (1 - t.foresightChance / 100)
          if (tu && t.confuseChance > 0) opener += (t.confuseChance / 100) * (tu.troops * 0.12 + 80) * (1 - t.foresightChance / 100)
          if (tu && t.routsAtMax) opener += ROUT_BONUS * 0.6 + (tu.commander ? COMMANDER_BONUS * 0.4 : 0)
        }
        const first = pv.chain[0]?.expected ?? 0
        v = opener + Math.max(0, pv.totalExpected - first) * 0.85
        if (pv.ignites) {
          let foes = 0
          let friends = 0
          for (const o of state.units) {
            if (manhattan(o, pv.anchor) > 1) continue
            if (o.side === u.side) friends++
            else foes++
          }
          v += foes * 70 - friends * 160
        }
      }
      v -= def.cost * 6
      consider({ type: 'stratagem', unit: u.id, strat: sid.id, x: a.x, y: a.y, excludeFromChain: [] }, v)
    }
  }

  for (const tid of query.swayTargets(state, u.id)) {
    const pv = query.swayChance(state, u.id, tid)
    const t = state.units.find((x) => x.id === tid)
    if (!pv || !pv.legal || !t || pv.chance < SWAY_MIN_PERCENT) continue
    consider({ type: 'sway', unit: u.id, target: tid }, 900 + t.troops * 0.5 * (pv.chance / 100))
  }
  return best
}

/** How good is it to end the turn standing on (x, y) facing nowhere in particular. Small numbers, tie-breakers. */
function positionScore(state: BattleState, u: Unit, p: Pos): number {
  const foe = nearestEnemy(state, p, u.side)
  let s = 0
  if (foe) {
    const d = manhattan(p, foe)
    if (u.type === 'archers') s -= Math.abs(d - 2.5) * 9
    else s -= d * (u.commander ? 2 : 6)
    if (u.commander) {
      let near = 0
      for (const e of state.units) if (e.side !== u.side && manhattan(e, p) <= 3) near++
      s -= near * 14
    }
  }
  // Side or rear arc on a close enemy beats a head-on meeting.
  if (u.type !== 'archers') {
    for (const e of state.units) {
      if (e.side === u.side) continue
      const d = manhattan(e, p)
      if (d > 2) continue
      const arc = arcOf(e, p)
      s += arc === 'rear' ? 22 : arc === 'side' ? 11 : 0
    }
  }
  if (burningAt(state, p.x, p.y)) s -= 45
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = p.x + dx
    const ny = p.y + dy
    if (nx >= 0 && ny >= 0 && nx < state.grid.width && ny < state.grid.height && burningAt(state, nx, ny)) s -= 10
  }
  const t = state.grid.tiles[p.y * state.grid.width + p.x]
  if (t) {
    const td = state.data.terrain[t.terrain]
    s += (1 - td.def) * 40 + td.elev * 4
  }
  return s
}

export function greedyAction(state: BattleState): Action {
  const legal = legalActions(state)
  const actors = new Set<string>()
  for (const a of legal) if (a.type !== 'endPhase') actors.add(a.unit)
  if (actors.size === 0) return { type: 'endPhase' }

  // [R2-STRAT-3] a provoked unit's legal actions are restricted; only ever consider actions legalActions offers.
  const legalKeys = new Set(legal.map((a) => JSON.stringify(a)))
  let best: Cand | null = null
  const consider = (c: Cand): void => {
    if (!legalKeys.has(JSON.stringify(c.action))) return
    if (!best || c.score > best.score) best = c
  }

  for (const u of state.units) {
    if (!actors.has(u.id)) continue
    const foe = nearestEnemy(state, u, u.side)
    const waitAt = (st: BattleState, at: Unit, bonus: number): Cand => {
      const f = nearestEnemy(st, at, at.side)
      return {
        action: { type: 'wait', unit: u.id, facing: f ? facingToward(at, f) : at.facing },
        score: positionScore(st, at, at) + bonus,
      }
    }
    // Stay here.
    const off = bestOffense(state, u)
    if (off) consider({ action: off.action, score: off.score + positionScore(state, u, u) * 0.2 })
    consider(waitAt(state, u, -5))
    // Or move first, then act next time round (the moved unit is re-evaluated from its new tile).
    if (!u.moved) {
      for (const m of query.moveRange(state, u.id)) {
        const mv: Action = { type: 'move', unit: u.id, x: m.x, y: m.y }
        const after = step(state, mv)
        if (!after.ok) continue
        const moved = after.state.units.find((x) => x.id === u.id)
        if (!moved) continue
        let score = positionScore(after.state, moved, moved)
        if (foe && manhattan(moved, foe) <= 4) {
          const o = bestOffense(after.state, moved)
          if (o) score += o.score
          else score -= 5
        } else score -= 5
        // Moving then waiting in place is what the "stay" candidate already covers; a small step cost avoids dithering.
        score -= m.cost * 0.5
        consider({ action: mv, score })
      }
    }
  }
  const pick = best as Cand | null
  if (!pick) return { type: 'endPhase' }
  // Every returned action must come from the legal set (or be an equivalent wait); fall back safely.
  const ok = legal.some((a) => JSON.stringify(a) === JSON.stringify(pick.action))
  return ok ? pick.action : { type: 'endPhase' }
}
