// [R-STRAT-1..6], [R-CHAIN-1..6]: stratagem legality, evaluation, resolution and chains.
import type { StratagemDef } from '../data/types'
import {
  alliesOf,
  enemiesOf,
  getUnit,
  inBounds,
  isBurning,
  officerOf,
  round10,
  terrainAt,
  tileIndex,
  unitAt,
} from './board'
import { calcDamage, damageRange, finalizeDamage, type DamageCalc } from './damage'
import { areaTiles, facingToward, manhattan, shift } from './geometry'
import { applyDamage, healUnit, turnUnit } from './ops'
import type { Roller } from './rng'
import type { Arc, BattleState, GameEvent, Multiplier, Pos, Unit } from './types'
import { concludeIfWon } from './victory'

export const CHAIN_MAX_LINKS = 4
export const CHAIN_STEP = 0.2
export const BOND_MULT = 1.15
export const BOND_RANGE = 1

// ------------------------------------------------------------------ legality

export function ignitable(state: BattleState, p: Pos): boolean {
  return inBounds(state.grid, p.x, p.y) && terrainAt(state, p.x, p.y).flammability > 0 && !isBurning(state, p.x, p.y)
}

export function isDash(strat: StratagemDef): boolean {
  return strat.effect?.type === 'dash'
}

/**
 * [R-STRAT-6] Dash: target in a straight orthogonal line `min..max` tiles away with a clear,
 * non-forest, passable path. Returns the tile the caster ends on (adjacent to the target).
 */
export function dashDestination(state: BattleState, caster: Unit, anchor: Pos, strat: StratagemDef, bonus = 0): Pos | null {
  const target = unitAt(state, anchor.x, anchor.y)
  if (!target || target.side === caster.side) return null
  const dx = anchor.x - caster.x
  const dy = anchor.y - caster.y
  if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return null
  const d = Math.abs(dx) + Math.abs(dy)
  if (d < strat.range.min || d > strat.range.max + bonus) return null
  const f = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N'
  let p: Pos = { x: caster.x, y: caster.y }
  for (let i = 1; i < d; i++) {
    p = shift(p, f)
    if (!inBounds(state.grid, p.x, p.y)) return null
    const t = terrainAt(state, p.x, p.y)
    if (t.move === null || t.id === 'forest') return null
    if (unitAt(state, p.x, p.y)) return null
  }
  return p
}

function areaOf(strat: StratagemDef, caster: Pos, anchor: Pos): Pos[] {
  return areaTiles(strat.area, caster, anchor, strat.range.max)
}

function enemyUnitsInArea(state: BattleState, caster: Unit, strat: StratagemDef, from: Pos, anchor: Pos): Unit[] {
  const out: Unit[] = []
  for (const t of areaOf(strat, from, anchor)) {
    if (!inBounds(state.grid, t.x, t.y)) continue
    const u = unitAt(state, t.x, t.y)
    if (u && u.side !== caster.side && !out.includes(u)) out.push(u)
  }
  return out
}

function woundedAlliesInAura(state: BattleState, caster: Unit, strat: StratagemDef): Unit[] {
  const tiles = areaTiles('aura', caster, caster, strat.range.max)
  return alliesOf(state, caster.side).filter((u) => u.troops < u.maxTroops && tiles.some((t) => t.x === u.x && t.y === u.y))
}

/**
 * Legal anchor tiles for casting `strat` from where `caster` stands.
 * `restrict` limits anchors to tiles holding one of those enemy unit ids (used for chain links).
 */
export function legalAnchors(
  state: BattleState,
  caster: Unit,
  strat: StratagemDef,
  opts: { bonus?: number; restrict?: Set<string> } = {},
): Pos[] {
  const bonus = opts.bonus ?? 0
  const restrict = opts.restrict
  const here: Pos = { x: caster.x, y: caster.y }
  if (strat.area === 'aura') {
    if (restrict) return []
    return woundedAlliesInAura(state, caster, strat).length > 0 ? [here] : []
  }
  if (strat.area === 'adjacent') {
    const hit = enemyUnitsInArea(state, caster, strat, here, here)
    return hit.some((u) => !restrict || restrict.has(u.id)) ? [here] : []
  }
  const out: Pos[] = []
  if (isDash(strat)) {
    for (const e of enemiesOf(state, caster.side)) {
      if (restrict && !restrict.has(e.id)) continue
      if (dashDestination(state, caster, e, strat, bonus)) out.push({ x: e.x, y: e.y })
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x)
  }
  const g = state.grid
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const d = Math.abs(x - caster.x) + Math.abs(y - caster.y)
      if (d < strat.range.min || d > strat.range.max + bonus) continue
      const p = { x, y }
      if (restrict) {
        const u = unitAt(state, x, y)
        if (u && u.side !== caster.side && restrict.has(u.id)) out.push(p)
        continue
      }
      if (enemyUnitsInArea(state, caster, strat, here, p).length > 0) {
        out.push(p)
        continue
      }
      if (strat.effect?.type === 'ignite' && ignitable(state, p) && !unitAt(state, x, y)) out.push(p)
    }
  }
  return out
}

// ------------------------------------------------------------------ evaluation

export interface LinkTarget {
  unit: Unit
  calc: DamageCalc | null
  min: number
  max: number
  expected: number
  arc: Arc | null
  foresightChance: number
  confuseChance: number
}

export interface LinkEval {
  tiles: Pos[]
  dashTo: Pos | null
  targets: LinkTarget[]
  /** Extra multipliers shared by all targets (chain, bond). */
  linkMult: number
}

export function foresightChance(caster: Unit, target: Unit, strat: StratagemDef, state: BattleState): number {
  if (strat.tag !== 'Ruse' && strat.tag !== 'Fire') return 0
  const diff = officerOf(state, target).int - officerOf(state, caster).int
  return diff > 0 ? Math.min(60, 2 * diff) : 0
}

export function confuseChance(caster: Unit, target: Unit, strat: StratagemDef, state: BattleState): number {
  if (strat.effect?.type !== 'confuse') return 0
  const stat = strat.stat ?? 'war'
  const v = 40 + officerOf(state, caster)[stat] - officerOf(state, target).lead
  return Math.max(10, Math.min(90, v))
}

export function linkMultiplier(k: number, bond: boolean): number {
  return (1 + CHAIN_STEP * k) * (bond ? BOND_MULT : 1)
}

/** Evaluates a link without changing anything. `k` = link index (0 = opener). */
export function evalLink(state: BattleState, caster: Unit, strat: StratagemDef, anchor: Pos, k: number, bond: boolean): LinkEval {
  let from: Unit = caster
  let dashTo: Pos | null = null
  if (isDash(strat)) {
    dashTo = dashDestination(state, caster, anchor, strat, bond ? BOND_RANGE : 0)
    if (dashTo) from = { ...caster, x: dashTo.x, y: dashTo.y }
  }
  const tiles = areaOf(strat, from, anchor).filter((t) => inBounds(state.grid, t.x, t.y))
  const targets: LinkTarget[] = []
  const extra: Multiplier[] = []
  if (k > 0) extra.push({ id: 'chain', name: `Chain link ${k + 1}`, value: 1 + CHAIN_STEP * k })
  if (bond) extra.push({ id: 'bond', name: 'Sworn bond', value: BOND_MULT })
  for (const t of tiles) {
    const u = unitAt(state, t.x, t.y)
    if (!u || u.side === caster.side || targets.some((x) => x.unit.id === u.id)) continue
    const splash = strat.area === 'cross' && !(t.x === anchor.x && t.y === anchor.y)
    const ex = splash ? [...extra, { id: 'splash', name: 'Splash', value: strat.neighborMult ?? 1 }] : extra
    let calc: DamageCalc | null = null
    let min = 0
    let max = 0
    let expected = 0
    let arc: Arc | null = null
    if (strat.power > 0) {
      const physical = strat.tag === 'Strike' || strat.tag === 'Charge'
      calc = calcDamage(state, {
        attacker: from,
        defender: u,
        power: strat.power,
        stat: strat.stat ?? 'war',
        useArc: physical,
        useHeight: physical || strat.tag === 'Volley',
        extra: ex,
      })
      const r = damageRange(calc, u.troops)
      min = r.min
      max = r.max
      expected = r.expected
      arc = physical ? calc.arc : null
    }
    targets.push({
      unit: u,
      calc,
      min,
      max,
      expected,
      arc,
      foresightChance: foresightChance(caster, u, strat, state),
      confuseChance: confuseChance(caster, u, strat, state),
    })
  }
  return { tiles, dashTo, targets, linkMult: linkMultiplier(k, bond) }
}

// ------------------------------------------------------------------ resolution

export interface LinkSummary {
  link: number
  unit: string
  strat: string
  anchor: Pos
  tiles: Pos[]
  bond: boolean
  multiplier: number
  /** Enemy unit ids that were hit (not seen through). */
  hit: string[]
  damage: number
  dashTo: Pos | null
  ignited: boolean
}

function resolveLink(
  w: BattleState,
  ev: GameEvent[],
  roller: Roller,
  caster: Unit,
  strat: StratagemDef,
  anchor: Pos,
  k: number,
  bond: boolean,
  prev: Unit | null,
): LinkSummary {
  const evl = evalLink(w, caster, strat, anchor, k, bond)
  caster.qi -= strat.cost
  const multiplier = evl.linkMult
  if (k === 0) ev.push({ kind: 'stratagem', unit: caster.id, strat: strat.id, anchor: { ...anchor }, tiles: evl.tiles, cost: strat.cost, link: 0 })
  else
    ev.push({
      kind: 'chainLink',
      link: k,
      unit: caster.id,
      strat: strat.id,
      anchor: { ...anchor },
      tiles: evl.tiles,
      cost: strat.cost,
      from: prev!.id,
      bond,
      multiplier,
    })
  const summary: LinkSummary = {
    link: k,
    unit: caster.id,
    strat: strat.id,
    anchor: { ...anchor },
    tiles: evl.tiles,
    bond,
    multiplier,
    hit: [],
    damage: 0,
    dashTo: evl.dashTo,
    ignited: false,
  }
  if (evl.dashTo) {
    const from = { x: caster.x, y: caster.y }
    const facing = facingToward(from, anchor)
    caster.x = evl.dashTo.x
    caster.y = evl.dashTo.y
    caster.facing = facing
    caster.undo = null // a dash cannot be undone
    ev.push({ kind: 'moved', unit: caster.id, from, to: { ...evl.dashTo }, path: [], cost: 0, facing, dash: true })
  }
  if (anchor.x !== caster.x || anchor.y !== caster.y) turnUnit(ev, caster, facingToward(caster, anchor))
  // Targets in area order. Draws per target: foresight, variance, confuse.
  for (const tg of evl.targets) {
    const u = getUnit(w, tg.unit.id)
    if (!u) continue
    if (tg.foresightChance > 0 && roller.chance(tg.foresightChance)) {
      ev.push({ kind: 'sawThrough', unit: u.id, by: caster.id, strat: strat.id, chance: tg.foresightChance })
      continue
    }
    summary.hit.push(u.id)
    let routed = false
    if (tg.calc) {
      const dmg = finalizeDamage(tg.calc.raw, roller.variance(), u.troops)
      summary.damage += Math.min(dmg, u.troops)
      routed = applyDamage(w, ev, u, dmg, 'stratagem', caster.id, strat.id, k)
    }
    if (!routed && tg.confuseChance > 0 && roller.chance(tg.confuseChance)) {
      u.confused = true
      ev.push({ kind: 'confused', unit: u.id, source: 'stratagem', by: caster.id, chance: tg.confuseChance })
    }
  }
  // [R-STRAT-5] ignite after the damage
  if (strat.effect?.type === 'ignite' && ignitable(w, anchor)) {
    w.burn[tileIndex(w.grid, anchor.x, anchor.y)] = 2
    summary.ignited = true
    ev.push({ kind: 'ignited', x: anchor.x, y: anchor.y, by: caster.id, strat: strat.id })
  }
  return summary
}

function resolveCommand(w: BattleState, ev: GameEvent[], caster: Unit, strat: StratagemDef): void {
  const tiles = areaTiles('aura', caster, caster, strat.range.max).filter((t) => inBounds(w.grid, t.x, t.y))
  caster.qi -= strat.cost
  ev.push({ kind: 'stratagem', unit: caster.id, strat: strat.id, anchor: { x: caster.x, y: caster.y }, tiles, cost: strat.cost, link: 0 })
  const pct = strat.effect?.type === 'heal' ? strat.effect.pct : 0
  for (const u of alliesOf(w, caster.side)) {
    if (!tiles.some((t) => t.x === u.x && t.y === u.y)) continue
    healUnit(ev, u, (u.maxTroops * pct) / 100, 'rally', caster.id)
  }
}

interface NextLink {
  unit: Unit
  strat: StratagemDef
  anchor: Pos
  bond: boolean
  total: number
  dist: number
}

/** [R-CHAIN-1/2/4] Pick the next link, or null. */
function pickNextLink(
  w: BattleState,
  prev: { unit: Unit; strat: StratagemDef; hit: string[] },
  chainIds: Set<string>,
  exclude: Set<string>,
  k: number,
): NextLink | null {
  const targets = new Set(prev.hit.filter((id) => getUnit(w, id)))
  if (targets.size === 0) return null
  const prevOfficer = prev.unit.officer
  let best: NextLink | null = null
  for (const c of w.units) {
    if (c.side !== prev.unit.side || c.confused || chainIds.has(c.id) || exclude.has(c.id)) continue
    const off = officerOf(w, c)
    const bond = off.bonds.includes(prevOfficer)
    for (const sid of off.stratagems) {
      const s = w.data.stratagems[sid]
      if (!s || s.tag === 'Command' || !s.follows.includes(prev.strat.tag) || c.qi < s.cost) continue
      const anchors = legalAnchors(w, c, s, { bonus: bond ? BOND_RANGE : 0, restrict: targets })
      if (anchors.length === 0) continue
      // first qualifying stratagem in list order; pick its best target
      let bestAnchor = anchors[0]!
      let bestTotal = -1
      for (const a of anchors) {
        const tot = evalLink(w, c, s, a, k, bond).targets.reduce((n, t) => n + t.expected, 0)
        if (tot > bestTotal) {
          bestTotal = tot
          bestAnchor = a
        }
      }
      const cand: NextLink = { unit: c, strat: s, anchor: bestAnchor, bond, total: bestTotal, dist: manhattan(c, prev.unit) }
      if (
        !best ||
        cand.total > best.total ||
        (cand.total === best.total && (cand.dist < best.dist || (cand.dist === best.dist && cand.unit.id < best.unit.id)))
      )
        best = cand
      break
    }
  }
  return best
}

/**
 * Resolve a stratagem cast by `caster` (a unit of the working copy `w`) including the whole chain.
 * Returns one summary per link, opener first.
 */
export function runStratagem(
  w: BattleState,
  ev: GameEvent[],
  roller: Roller,
  caster: Unit,
  strat: StratagemDef,
  anchor: Pos,
  excludeFromChain: string[],
): LinkSummary[] {
  if (strat.tag === 'Command') {
    resolveCommand(w, ev, caster, strat)
    return []
  }
  const links: LinkSummary[] = []
  const first = resolveLink(w, ev, roller, caster, strat, anchor, 0, false, null)
  links.push(first)
  if (concludeIfWon(w, ev)) return links
  const exclude = new Set(excludeFromChain)
  const chainIds = new Set<string>([caster.id])
  let prev = { unit: caster, strat, hit: first.hit }
  for (let k = 1; k < CHAIN_MAX_LINKS; k++) {
    if (prev.hit.length === 0) break
    const next = pickNextLink(w, prev, chainIds, exclude, k)
    if (!next) break
    chainIds.add(next.unit.id)
    const s = resolveLink(w, ev, roller, next.unit, next.strat, next.anchor, k, next.bond, prev.unit)
    links.push(s)
    if (concludeIfWon(w, ev)) break
    prev = { unit: next.unit, strat: next.strat, hit: s.hit }
  }
  return links
}

export function healAmount(u: Unit, pct: number): number {
  return Math.min(u.maxTroops - u.troops, round10((u.maxTroops * pct) / 100))
}
