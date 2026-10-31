// The "presented" picture of a battle: what the board shows right now. It starts as a copy of a BattleState and
// is advanced one engine event at a time by the director, so the picture can lag the live state during playback.
import type { BattleState, Facing, GameEvent, Pos, Side, Terrain, TroopType, Wind } from '../../engine'

export interface UnitVis {
  id: string
  officer: string
  side: Side
  type: TroopType
  commander: boolean
  x: number
  y: number
  facing: Facing
  troops: number
  maxTroops: number
  confused: boolean
  done: boolean
}

export interface Scene {
  width: number
  height: number
  terrain: Terrain[]
  burning: boolean[]
  /** Insertion order is stable so rendering does not reshuffle. */
  units: UnitVis[]
  wind: Wind
  round: number
  side: Side
}

export function sceneFromState(s: BattleState): Scene {
  return {
    width: s.grid.width,
    height: s.grid.height,
    terrain: s.grid.tiles.map((t) => t.terrain),
    burning: s.burn.map((b) => b > 0),
    units: s.units.map((u) => ({
      id: u.id,
      officer: u.officer,
      side: u.side,
      type: u.type,
      commander: u.commander,
      x: u.x,
      y: u.y,
      facing: u.facing,
      troops: u.troops,
      maxTroops: u.maxTroops,
      confused: u.confused,
      done: u.done,
    })),
    wind: { ...s.wind },
    round: s.round,
    side: s.side,
  }
}

const idx = (sc: Scene, p: Pos): number => p.y * sc.width + p.x

function setUnit(sc: Scene, id: string, f: (u: UnitVis) => UnitVis): Scene {
  if (!sc.units.some((u) => u.id === id)) return sc
  return { ...sc, units: sc.units.map((u) => (u.id === id ? f(u) : u)) }
}

/** Advance a scene by one engine event. Pure; mirrors what the engine did to the fields the board draws. */
export function applyEvent(sc: Scene, ev: GameEvent): Scene {
  switch (ev.kind) {
    case 'moved':
      return setUnit(sc, ev.unit, (u) => ({ ...u, x: ev.to.x, y: ev.to.y, facing: ev.facing }))
    case 'turned':
      return setUnit(sc, ev.unit, (u) => ({ ...u, facing: ev.to }))
    case 'waited':
      return setUnit(sc, ev.unit, (u) => ({ ...u, facing: ev.facing, done: true }))
    case 'attacked':
      return setUnit(sc, ev.unit, (u) => ({ ...u, done: true }))
    case 'countered':
      return sc
    case 'damaged':
      return setUnit(sc, ev.unit, (u) => ({ ...u, troops: ev.troopsAfter }))
    case 'routed':
      return { ...sc, units: sc.units.filter((u) => u.id !== ev.unit) }
    case 'stratagem':
      return setUnit(sc, ev.unit, (u) => ({ ...u, done: true }))
    case 'chainLink':
    case 'sawThrough':
      return sc
    case 'confused':
      return setUnit(sc, ev.unit, (u) => ({ ...u, confused: true }))
    case 'recovered':
      return setUnit(sc, ev.unit, (u) => ({ ...u, confused: false }))
    case 'ignited': {
      const burning = sc.burning.slice()
      burning[idx(sc, ev)] = true
      return { ...sc, burning }
    }
    case 'fireSpread': {
      const burning = sc.burning.slice()
      burning[idx(sc, ev.to)] = true
      return { ...sc, burning }
    }
    case 'burnedOut': {
      const burning = sc.burning.slice()
      const terrain = sc.terrain.slice()
      burning[idx(sc, ev)] = false
      terrain[idx(sc, ev)] = 'ash'
      return { ...sc, burning, terrain }
    }
    case 'healed':
      return setUnit(sc, ev.unit, (u) => ({ ...u, troops: Math.min(u.maxTroops, u.troops + ev.amount) }))
    case 'swayed':
      return setUnit(setUnit(sc, ev.unit, (u) => ({ ...u, done: true })), ev.target, (u) => ({ ...u, side: ev.side, done: true }))
    case 'swayFailed':
      return setUnit(sc, ev.unit, (u) => ({ ...u, done: true }))
    case 'windChanged':
      return { ...sc, wind: { dir: ev.dir, strength: ev.strength } }
    case 'phaseStarted':
      return { ...sc, side: ev.side, units: sc.units.map((u) => (u.done ? { ...u, done: false } : u)) }
    case 'roundStarted':
      return { ...sc, round: ev.round }
    case 'battleEnded':
      return sc
  }
}

export function applyEvents(sc: Scene, evs: GameEvent[]): Scene {
  return evs.reduce(applyEvent, sc)
}

/** Fields the director promises to keep faithful; used by the unit test comparing a replayed scene with the live one. */
export function comparable(sc: Scene, includeDone: boolean): unknown {
  return {
    terrain: sc.terrain,
    burning: sc.burning,
    wind: sc.wind,
    round: sc.round,
    side: sc.side,
    units: sc.units
      .map((u) => ({ ...u, done: includeDone ? u.done : false }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  }
}
