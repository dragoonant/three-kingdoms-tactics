// Invariants from docs/spec/00-architecture.md (plus the engine v2 additions), checked after every step by tools/sim.ts and the tests.
import { GAME_DATA } from '../src/data'
import { legalActions, terrainCostFor, type BattleState } from '../src/engine'

/** Every unit the battle has ever had: on the board, routed, escaped, retreated, or still waiting to arrive. */
export function unitBudget(s: BattleState): number {
  return s.units.length + s.defeated.length + s.escaped.length + s.retreated.length + s.reinforcements.reduce((n, r) => n + r.units.length, 0)
}

export function checkInvariants(s: BattleState, total: number): string[] {
  const bad: string[] = []
  const seen = new Set<string>()
  const ids = new Set<string>()
  for (const u of s.units) {
    for (const [k, v] of Object.entries({ troops: u.troops, qi: u.qi, x: u.x, y: u.y, max: u.maxTroops })) {
      if (!Number.isFinite(v)) bad.push(`NaN/Inf ${k} on ${u.id}`)
    }
    if (u.troops <= 0 || u.troops > u.maxTroops) bad.push(`troops out of range on ${u.id}: ${u.troops}/${u.maxTroops}`)
    if (u.troops % 10 !== 0) bad.push(`troops not a multiple of 10 on ${u.id}: ${u.troops}`)
    if (u.retreatAt !== undefined && u.troops <= u.retreatAt * u.maxTroops) bad.push(`${u.id} is at or below its retreat threshold but still on the board`)
    if (u.qi < 0 || u.qi > 10) bad.push(`qi out of range on ${u.id}: ${u.qi}`)
    if (u.x < 0 || u.y < 0 || u.x >= s.grid.width || u.y >= s.grid.height) {
      bad.push(`${u.id} off board`)
      continue
    }
    const key = `${u.x},${u.y}`
    if (seen.has(key)) bad.push(`two units on ${key}`)
    seen.add(key)
    if (ids.has(u.id)) bad.push(`duplicate unit id ${u.id}`)
    ids.add(u.id)
    const terr = s.grid.tiles[u.y * s.grid.width + u.x]!.terrain
    const def = GAME_DATA.terrain[terr]
    if (terr === 'river' || terr === 'wall' || terr === 'water') bad.push(`${u.id} on ${terr}`)
    else if (terrainCostFor(s, def, u.side, u.type) === null) bad.push(`${u.id} (${u.side} ${u.type}) on ${terr} which it cannot enter`)
    if (def.gate && u.side !== s.gateOwner) bad.push(`${u.id} on a gate it does not own`)
    if (u.done && !u.moved && u.undo) bad.push(`${u.id} has stale undo`)
    if (u.commander && !s.sideOrder.includes(u.side)) bad.push(`${u.id} bad side`)
    for (const b of u.buffs ?? []) if (b.until < s.round) bad.push(`${u.id} keeps an expired buff ${b.id}`)
    if (u.provoked !== undefined && !s.units.some((x) => x.id === u.provoked) && s.side === u.side) bad.push(`${u.id} provoked by a unit that is gone`)
  }
  for (const list of [s.escaped, s.retreated, s.defeated]) for (const id of list) if (ids.has(id)) bad.push(`${id} is off the board but still has a unit`)
  if (new Set([...s.escaped, ...s.retreated, ...s.defeated]).size !== s.escaped.length + s.retreated.length + s.defeated.length) bad.push('a unit is listed as gone more than once')
  for (let i = 0; i < s.burn.length; i++) {
    const b = s.burn[i]!
    if (!Number.isInteger(b) || b < 0 || b > 2) bad.push(`burn out of range at ${i}: ${b}`)
    const t = s.grid.tiles[i]!
    if (b > 0 && GAME_DATA.terrain[t.terrain].flammability <= 0) bad.push(`non-flammable tile ${t.x},${t.y} is burning`)
  }
  if (unitBudget(s) !== total) bad.push(`unit count drift: ${unitBudget(s)}!=${total}`)
  if (!s.result) {
    for (const side of s.sideOrder) {
      const n = s.units.filter((u) => u.side === side && u.commander).length
      const id = s.commanders[side]
      const away = id !== undefined && (s.defeated.includes(id) || s.escaped.includes(id) || s.retreated.includes(id) || s.reinforcements.some((r) => r.units.some((u) => u.id === id)))
      if (n > 1 || (n === 0 && !away)) bad.push(`side ${side} has ${n} commanders while the battle runs`)
    }
    const la = legalActions(s)
    if (la.length === 0) bad.push('legalActions empty before result')
    if (!la.some((a) => a.type === 'endPhase')) bad.push('endPhase missing from legalActions')
    for (const a of la) {
      if (a.type === 'endPhase') continue
      const u = s.units.find((x) => x.id === a.unit)
      if (!u || u.done || u.confused || u.side !== s.side) bad.push(`illegal actor offered: ${JSON.stringify(a)}`)
    }
  } else if (legalActions(s).length !== 0) bad.push('legalActions non-empty after result')
  if (s.side !== s.sideOrder[s.phaseIndex]) bad.push('side/phaseIndex mismatch')
  if (s.round < 1 || s.round > s.turnLimit) bad.push(`round out of range: ${s.round}`)
  return bad
}
