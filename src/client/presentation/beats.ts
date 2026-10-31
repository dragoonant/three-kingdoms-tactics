// Pure beat planner: turns one batch of engine events into timed beats. No timers, no React, no three.
// Each beat carries the engine events it "commits" to the presented scene when it finishes.
import type { BattleState, Facing, GameEvent, Pos, Side } from '../../engine'
import { sideTitle } from '../names'

export type Speed = 'full' | 'quick' | 'instant'

export type Fx =
  | { t: 'move'; unit: string; path: Pos[]; dash: boolean; undo: boolean }
  | { t: 'turn'; unit: string; from: Facing; to: Facing }
  | { t: 'lunge'; unit: string; toward: Pos; counter: boolean }
  | { t: 'damage'; unit: string; at: Pos; amount: number; before: number; after: number; source: 'attack' | 'counter' | 'stratagem' | 'fire'; link: number }
  | { t: 'stratagem'; unit: string; strat: string; name: string; tag: string; link: number; chainSize: number; tiles: Pos[]; anchor: Pos; caster: string; bond: boolean }
  | { t: 'sawThrough'; unit: string; at: Pos }
  | { t: 'confuse'; unit: string; at: Pos }
  | { t: 'recover'; unit: string; at: Pos }
  | { t: 'ignite'; at: Pos }
  | { t: 'spread'; from: Pos; at: Pos }
  | { t: 'burnout'; at: Pos }
  | { t: 'heal'; unit: string; at: Pos; amount: number }
  | { t: 'sway'; unit: string; target: string; at: Pos; ok: boolean; chance: number }
  | { t: 'rout'; unit: string; at: Pos }
  | { t: 'wind'; dir: Facing | null; strength: string; round: number }
  | { t: 'wait'; unit: string; facing: Facing }
  | { t: 'banner'; title: string; sub: string; side: Side; round: number }
  | { t: 'end'; winner: Side; reason: string }

export interface Beat {
  id: number
  fx: Fx
  /** Duration at full speed, in ms. */
  ms: number
  /** Engine events committed to the presented scene when the beat ends. */
  commit: GameEvent[]
}

export const BANNER_MS = 1600
const MOVE_MS_PER_TILE = 170

/** Playback duration in ms for a beat at a speed. */
export function beatDuration(b: Beat, speed: Speed): number {
  if (speed === 'instant') return 0
  if (speed === 'quick') return Math.max(40, Math.round(b.ms * 0.4))
  return b.ms
}


/** Plan beats for a batch. `before` is the live state the events were produced from. */
export function planBeats(events: GameEvent[], before: BattleState): Beat[] {
  const beats: Beat[] = []
  let n = 0
  const push = (fx: Fx, ms: number, ...commit: GameEvent[]): void => {
    beats.push({ id: n++, fx, ms, commit })
  }
  // Track unit positions as events move them so effects land where the unit stands at that moment.
  const positions = new Map<string, Pos>(before.units.map((u) => [u.id, { x: u.x, y: u.y }]))
  const ctx = { at: (id: string): Pos => positions.get(id) ?? { x: 0, y: 0 } }
  const stratName = (id: string): { name: string; tag: string } => {
    const s = before.data.stratagems[id]
    return { name: s?.name ?? id, tag: s?.tag ?? '' }
  }
  // Chain size of the opener: 1 + the chainLink events that follow it, up to the next opener.
  const chainSizeFrom = (i: number): number => {
    let c = 1
    for (let j = i + 1; j < events.length && events[j]!.kind !== 'stratagem'; j++) if (events[j]!.kind === 'chainLink') c++
    return c
  }
  let chainSize = 1
  const consumed = new Set<number>()

  for (let i = 0; i < events.length; i++) {
    if (consumed.has(i)) continue
    const ev = events[i]!
    switch (ev.kind) {
      case 'moved': {
        const from = ctx.at(ev.unit)
        const path = ev.undo || ev.dash || ev.path.length === 0 ? [from, ev.to] : [from, ...ev.path]
        const tiles = Math.max(1, path.length - 1)
        push({ t: 'move', unit: ev.unit, path, dash: !!ev.dash, undo: !!ev.undo }, ev.dash ? 260 : ev.undo ? 220 : tiles * MOVE_MS_PER_TILE + 60, ev)
        positions.set(ev.unit, { ...ev.to })
        break
      }
      case 'turned':
        push({ t: 'turn', unit: ev.unit, from: ev.from, to: ev.to }, 150, ev)
        break
      case 'waited':
        push({ t: 'wait', unit: ev.unit, facing: ev.facing }, 220, ev)
        break
      case 'attacked': {
        // The lunge commits `attacked` (the actor becomes done); the damage beats follow.
        push({ t: 'lunge', unit: ev.unit, toward: ctx.at(ev.target), counter: false }, 380, ev)
        break
      }
      case 'countered': {
        push({ t: 'lunge', unit: ev.unit, toward: ctx.at(ev.target), counter: true }, 340, ev)
        break
      }
      case 'damaged': {
        const at = ctx.at(ev.unit)
        push(
          { t: 'damage', unit: ev.unit, at, amount: ev.amount, before: ev.troopsBefore, after: ev.troopsAfter, source: ev.source, link: ev.link ?? 0 },
          ev.source === 'fire' ? 520 : 430,
          ev,
        )
        break
      }
      case 'routed':
        push({ t: 'rout', unit: ev.unit, at: ctx.at(ev.unit) }, 620, ev)
        break
      case 'stratagem': {
        const s = stratName(ev.strat)
        chainSize = chainSizeFrom(i)
        push(
          { t: 'stratagem', unit: ev.unit, strat: ev.strat, name: s.name, tag: s.tag, link: 0, chainSize, tiles: ev.tiles, anchor: ev.anchor, caster: ev.unit, bond: false },
          1000,
          ev,
        )
        break
      }
      case 'chainLink': {
        const s = stratName(ev.strat)
        push(
          { t: 'stratagem', unit: ev.unit, strat: ev.strat, name: s.name, tag: s.tag, link: ev.link, chainSize, tiles: ev.tiles, anchor: ev.anchor, caster: ev.unit, bond: ev.bond },
          880,
          ev,
        )
        break
      }
      case 'sawThrough':
        push({ t: 'sawThrough', unit: ev.unit, at: ctx.at(ev.unit) }, 480, ev)
        break
      case 'confused':
        push({ t: 'confuse', unit: ev.unit, at: ctx.at(ev.unit) }, 520, ev)
        break
      case 'recovered':
        push({ t: 'recover', unit: ev.unit, at: ctx.at(ev.unit) }, 200, ev)
        break
      case 'ignited':
        push({ t: 'ignite', at: { x: ev.x, y: ev.y } }, 520, ev)
        break
      case 'fireSpread':
        push({ t: 'spread', from: ev.from, at: ev.to }, 420, ev)
        break
      case 'burnedOut':
        push({ t: 'burnout', at: { x: ev.x, y: ev.y } }, 360, ev)
        break
      case 'healed':
        push({ t: 'heal', unit: ev.unit, at: ctx.at(ev.unit), amount: ev.amount }, 480, ev)
        break
      case 'swayed':
        push({ t: 'sway', unit: ev.unit, target: ev.target, at: ctx.at(ev.target), ok: true, chance: ev.chance }, 1000, ev)
        break
      case 'swayFailed':
        push({ t: 'sway', unit: ev.unit, target: ev.target, at: ctx.at(ev.target), ok: false, chance: ev.chance }, 900, ev)
        break
      case 'windChanged':
        push({ t: 'wind', dir: ev.dir, strength: ev.strength, round: ev.round }, 900, ev)
        break
      case 'roundStarted': {
        // The scroll announces the round together with the phase that follows it; both commit when it ends.
        // A wind change in between is its own beat and plays first.
        const commit: GameEvent[] = [ev]
        let side: Side = 'han'
        for (let j = i + 1; j < events.length; j++) {
          const e = events[j]!
          if (e.kind === 'windChanged') {
            push({ t: 'wind', dir: e.dir, strength: e.strength, round: e.round }, 900, e)
            consumed.add(j)
          } else if (e.kind === 'phaseStarted') {
            commit.push(e)
            side = e.side
            consumed.add(j)
            break
          }
        }
        push({ t: 'banner', title: `Round ${ev.round}`, sub: sideTitle(before, side), side, round: ev.round }, BANNER_MS, ...commit)
        break
      }
      case 'phaseStarted':
        push({ t: 'banner', title: `Round ${ev.round}`, sub: sideTitle(before, ev.side), side: ev.side, round: ev.round }, BANNER_MS, ev)
        break
      case 'battleEnded':
        push({ t: 'end', winner: ev.winner, reason: ev.reason }, 1300, ev)
        break
    }
  }
  return beats
}

/** The scroll shown when a battle opens (round 1 starts silently inside createBattle). */
export function introBeats(state: BattleState): Beat[] {
  return [{ id: 0, fx: { t: 'banner', title: `Round ${state.round}`, sub: sideTitle(state, state.side), side: state.side, round: state.round }, ms: BANNER_MS, commit: [] }]
}
