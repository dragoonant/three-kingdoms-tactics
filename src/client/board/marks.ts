// Which tiles to outline on the sand, derived from the live state and the UI selection (query.* only).
import { query, type BattleState, type Pos } from '../../engine'
import { canControl, type UiState } from '../store/orders'
import type { Mark } from './Effects'

export function computeMarks(state: BattleState, ui: UiState, enabled: boolean): Mark[] {
  if (!enabled || state.result) return []
  const marks: Mark[] = []
  const seen = new Set<string>()
  const add = (p: Pos, kind: Mark['kind']): void => {
    const k = `${kind}:${p.x},${p.y}`
    if (seen.has(k)) return
    seen.add(k)
    marks.push({ x: p.x, y: p.y, kind })
  }
  const sel = state.units.find((u) => u.id === ui.selectedId)
  const hover = ui.hover
  if (canControl(state, sel)) {
    if (ui.mode === 'none' && !sel.moved) for (const m of query.moveRange(state, sel.id)) add(m, 'move')
    if (ui.mode === 'attack') {
      for (const id of query.attackTargets(state, sel.id)) {
        const t = state.units.find((u) => u.id === id)
        if (t) add(t, 'target')
      }
      const pt = state.units.find((u) => u.id === ui.pendingTarget)
      if (pt) add(pt, 'area')
    }
    if (ui.mode === 'sway') {
      for (const id of query.swayTargets(state, sel.id)) {
        const t = state.units.find((u) => u.id === id)
        if (t) add(t, 'target')
      }
      const pt = state.units.find((u) => u.id === ui.pendingTarget)
      if (pt) add(pt, 'area')
    }
    if (ui.mode === 'stratagem' && ui.strat) {
      const anchors = query.stratagemTargets(state, sel.id, ui.strat)
      for (const a of anchors) add(a, 'target')
      const focus = ui.pendingAnchor ?? (hover && anchors.some((a) => a.x === hover.x && a.y === hover.y) ? hover : null)
      if (focus) {
        const pv = query.stratagemPreview(state, sel.id, ui.strat, focus, ui.exclude)
        if (pv) {
          for (const t of pv.tiles) add(t, 'area')
          pv.chain.slice(1).forEach((l) => l.tiles.forEach((t) => add(t, 'chain')))
          if (pv.dashTo) add(pv.dashTo, 'dash')
        }
      }
    }
    if (ui.mode === 'none' || ui.mode === 'wait') {
      // hovering an enemy shows where the strike would land
      const hu = hover ? query.unitAt(state, hover.x, hover.y) : undefined
      if (hu && hu.side !== sel.side && query.attackTargets(state, sel.id).includes(hu.id)) add(hu, 'area')
    }
  }
  if (hover) {
    const idx = hover.y * state.grid.width + hover.x
    if ((state.burn[idx] ?? 0) > 0) {
      const f = query.fireForecast(state)
      for (const s of f.spread) if (Math.abs(s.x - hover.x) + Math.abs(s.y - hover.y) === 1) add(s, 'fire')
    }
    add(hover, 'hover')
  }
  return marks
}
