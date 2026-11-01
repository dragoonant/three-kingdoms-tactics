// Pure beat planner: turns one batch of engine events into timed beats. No timers, no React, no three.
// Each beat carries the engine events it "commits" to the presented scene when it finishes.
import type { BattleState, Facing, GameEvent, Pos, Side, TroopType } from '../../engine'
import { FACING_ANGLE } from '../board/layout'
import { angDiff, travelSpeed, turnAllowance } from '../board/travel'
import { sideTitle } from '../names'
import type { UnitVis } from './scene'

export type Speed = 'full' | 'quick' | 'instant'

export type Fx =
  /** `turnIn`: radians to turn on the spot before setting off; `turnOut`: after arriving, to the final facing `facingTo`. */
  | { t: 'move'; unit: string; path: Pos[]; dash: boolean; undo: boolean; type: TroopType; turnIn: number; turnOut: number; facingTo: Facing }
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
  | { t: 'leave'; unit: string; at: Pos; how: 'retreat' | 'escape' }
  /** A unit marches in from the nearest board edge to `at`; `vis` is what the scene will hold once the beat commits. */
  | { t: 'arrive'; unit: string; at: Pos; vis: UnitVis }
  | { t: 'terrain'; tiles: Pos[]; to: string; cause: 'timeline' | 'burnout' }
  | { t: 'buff'; unit: string; at: Pos; stat: string; amount: number }
  | { t: 'provoke'; unit: string; at: Pos; by: string }
  | { t: 'note'; text: string }

export interface Beat {
  id: number
  fx: Fx
  /** Duration at full speed, in ms. */
  ms: number
  /** Engine events committed to the presented scene when the beat ends. */
  commit: GameEvent[]
}

export const BANNER_MS = 1600
export const ARRIVE_MS = 1100
export const TERRAIN_MS = 800
export const LEAVE_MS = 900
/** A dash (the Charge stratagem) is a short gallop. */
const DASH_MS = 360
const UNDO_MS = 220

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
  const facings = new Map<string, Facing>(before.units.map((u) => [u.id, u.facing]))
  const types = new Map<string, TroopType>(before.units.map((u) => [u.id, u.type]))
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
        const type = types.get(ev.unit) ?? 'infantry'
        // headings of the first and last step (the board's yaw): the figure turns on the spot before and after if they differ from its facing
        const head = (a: Pos, b: Pos): number => Math.atan2(b.x - a.x, b.y - a.y)
        const first = head(path[0]!, path[1] ?? path[0]!)
        const last = head(path[Math.max(0, path.length - 2)]!, path[path.length - 1]!)
        const turnIn = ev.dash || ev.undo || path.length < 2 ? 0 : angDiff(FACING_ANGLE[facings.get(ev.unit) ?? ev.facing], first)
        const turnOut = ev.dash || ev.undo || path.length < 2 ? 0 : angDiff(last, FACING_ANGLE[ev.facing])
        // the legs run on the distance covered, so the time follows the path: tiles at the unit's own pace, plus the turns
        const ms = ev.dash ? DASH_MS : ev.undo ? UNDO_MS : Math.round((tiles / travelSpeed(type)) * 1000) + 60 + turnAllowance(turnIn, turnOut)
        push({ t: 'move', unit: ev.unit, path, dash: !!ev.dash, undo: !!ev.undo, type, turnIn, turnOut, facingTo: ev.facing }, ms, ev)
        positions.set(ev.unit, { ...ev.to })
        facings.set(ev.unit, ev.facing)
        break
      }
      case 'turned':
        facings.set(ev.unit, ev.to)
        push({ t: 'turn', unit: ev.unit, from: ev.from, to: ev.to }, 150, ev)
        break
      case 'waited':
        facings.set(ev.unit, ev.facing)
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
      // engine v2 events: kept simple, each commits itself to the presented scene
      case 'retreated':
        push({ t: 'leave', unit: ev.unit, at: { x: ev.x, y: ev.y }, how: 'retreat' }, LEAVE_MS, ev)
        break
      case 'escaped':
        push({ t: 'leave', unit: ev.unit, at: { x: ev.x, y: ev.y }, how: 'escape' }, LEAVE_MS, ev)
        break
      case 'reinforced':
        positions.set(ev.unit, { x: ev.x, y: ev.y })
        types.set(ev.unit, ev.type)
        facings.set(ev.unit, ev.facing)
        push(
          {
            t: 'arrive',
            unit: ev.unit,
            at: { x: ev.x, y: ev.y },
            vis: {
              id: ev.unit,
              officer: ev.officer,
              side: ev.side,
              type: ev.type,
              commander: ev.commander,
              x: ev.x,
              y: ev.y,
              facing: ev.facing,
              troops: ev.troops,
              maxTroops: ev.maxTroops,
              confused: false,
              done: false,
            },
          },
          ARRIVE_MS,
          ev,
        )
        break
      case 'terrainChanged':
        push({ t: 'terrain', tiles: ev.tiles, to: ev.to, cause: ev.cause }, TERRAIN_MS, ev)
        break
      case 'timelineMessage':
        push({ t: 'note', text: ev.text }, 1400, ev)
        break
      case 'buffed':
        push({ t: 'buff', unit: ev.unit, at: ctx.at(ev.unit), stat: ev.stat, amount: ev.amount }, 420, ev)
        break
      case 'provoked':
        push({ t: 'provoke', unit: ev.unit, at: ctx.at(ev.unit), by: ev.by }, 520, ev)
        break
      case 'buffExpired':
      case 'objectiveProgress':
        // the ledger carries these; no beat time is spent
        push({ t: 'note', text: '' }, 0, ev)
        break
    }
  }
  return beats
}

/** The scroll shown when a battle opens (round 1 starts silently inside createBattle). */
export function introBeats(state: BattleState): Beat[] {
  return [{ id: 0, fx: { t: 'banner', title: `Round ${state.round}`, sub: sideTitle(state, state.side), side: state.side, round: state.round }, ms: BANNER_MS, commit: [] }]
}
