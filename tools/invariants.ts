// Invariants from docs/spec/00-architecture.md, checked after every step by tools/sim.ts and the tests.
import { GAME_DATA } from '../src/data'
import { legalActions, type BattleState } from '../src/engine'

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
    if (terr === 'river') bad.push(`${u.id} on a river`)
    if (u.done && !u.moved && u.undo) bad.push(`${u.id} has stale undo`)
    if (u.commander && !s.sideOrder.includes(u.side)) bad.push(`${u.id} bad side`)
  }
  for (let i = 0; i < s.burn.length; i++) {
    const b = s.burn[i]!
    if (!Number.isInteger(b) || b < 0 || b > 2) bad.push(`burn out of range at ${i}: ${b}`)
    const t = s.grid.tiles[i]!
    if (b > 0 && GAME_DATA.terrain[t.terrain].flammability <= 0) bad.push(`non-flammable tile ${t.x},${t.y} is burning`)
  }
  if (s.units.length + s.defeated.length !== total) bad.push(`unit count drift: ${s.units.length}+${s.defeated.length}!=${total}`)
  for (const d of s.defeated) if (ids.has(d)) bad.push(`defeated unit ${d} still on board`)
  if (!s.result) {
    for (const side of s.sideOrder) {
      const n = s.units.filter((u) => u.side === side && u.commander).length
      if (n !== 1) bad.push(`side ${side} has ${n} commanders while the battle runs`)
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
