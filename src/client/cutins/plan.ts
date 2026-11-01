// Event -> cut-in plan (docs/spec/51 "v0.3 direction"). Pure: no three, no React, no clock. Given the engine events of one
// action and the state they were produced from, it decides which scene plays, with which actors, terrain and numbers, and
// which slice of the event batch the scene stands in for. The scene never invents a result: every number here is read from
// an event (damage, routs, confusions, ignitions, wind) or derived from one by the documented formulas.
import type { Arc, BattleState, Facing, GameEvent, Side, StratTag, Terrain as TerrainId, TroopType } from '../../engine'
import { CHAIN_COMPRESS, INTERSTITIAL, SCENE_INFO } from './sceneInfo'

export type SceneId = 'A' | 'Ap' | 'B' | 'C' | 'D' | 'R' | 'W' | 'S-melee' | 'S-cavalry' | 'S-archer'
export type SidePalette = 'han' | 'yellow' | 'cao' | 'dong' | 'lu'
export type TroopKindName = 'infantry' | 'archer' | 'cavalry' | 'rebel'
/** How the Strike scene's weapon leaves its mark: twin blades cross in an X, a glaive sweeps an arc, a spear draws a line. */
export type StrikeTrail = 'x' | 'arc' | 'line'

// ---- settings ---------------------------------------------------------------------------------------------------

/** "Battle scenes": Full and short (default) / Stratagems and chains only / Off. */
export type BattleScenes = 'all' | 'strat' | 'off'
/** "Enemy scenes": Same as mine (default) / Stratagems only / Off. */
export type EnemyScenes = 'same' | 'strat' | 'off'
export interface CutinSettings {
  battleScenes: BattleScenes
  enemyScenes: EnemyScenes
}
export const DEFAULT_CUTIN_SETTINGS: CutinSettings = { battleScenes: 'all', enemyScenes: 'same' }

export interface PlanOptions {
  settings: CutinSettings
  /** Instant plays no scenes; Quick plays them at 1.5x. */
  speed: 'full' | 'quick' | 'instant'
  /** The side the person plays: anything else is an "enemy" scene. */
  playerSide: Side
}

export const QUICK_RATE = 1.5

// ---- plan types -------------------------------------------------------------------------------------------------

export interface ActorPlan {
  unit: string
  officer: string
  name: string
  side: Side
  palette: SidePalette
  /** The figure kind of the troops behind this officer. */
  kind: TroopKindName
  type: TroopType
  mounted: boolean
  troopsBefore: number
  maxTroops: number
}

export interface LinkPlan {
  scene: SceneId
  /** Index inside the sequence (0 = the opener or the single attack). */
  link: number
  /** Total links in the sequence (chain size). */
  links: number
  caster: ActorPlan
  /** The principal target (the unit that takes the most damage); null when the stratagem hit nobody. */
  defender: ActorPlan | null
  strat: string | null
  stratName: string
  tag: StratTag | null
  /** Terrain under the defenders (the principal target's tile). */
  terrain: TerrainId
  /** Total damage of the link across its targets, from the damaged events. */
  damage: number
  /** Units that took damage. */
  targets: number
  /** Defender-figures that fall: max(1, round(damage / troops before x front)), everyone when routed. */
  falls: number
  /** The principal target was routed. */
  routed: boolean
  /** Units confused by the link, and whether the principal target is one of them. */
  confused: number
  principalConfused: boolean
  /** The link set a tile alight (scene A shows the field burning). */
  ignited: boolean
  arc: Arc
  ranged: boolean
  trail: StrikeTrail
  /** Wind the link created (scene W), null when it is not a wind link. */
  wind: { dir: Facing | null; strength: string } | null
  /** Bonded chain link (the seal in the chain row is drawn double). */
  bond: boolean
  /** Counter-attack of a normal attack, when the engine produced one. */
  counter: { damage: number; falls: number; routed: boolean } | null
}

export interface SequencePlan {
  /** A stratagem or chain (full scenes) or a normal attack (short). */
  full: boolean
  /** The caster is not on the player's side. */
  enemy: boolean
  /** Playback rate: 1, or 1.5 at Quick speed. */
  rate: number
  links: LinkPlan[]
}

/** The slice [from, to) of the event batch that the sequence stands in for; the board shows its result when the scene ends. */
export interface CutinRange {
  from: number
  to: number
  plan: SequencePlan
}

// ---- helpers ----------------------------------------------------------------------------------------------------

/** Falls: max(1, round(damage / defender troops before x front-rank count)); everyone when the unit was routed; none for no damage. */
export function fallsFor(damage: number, troopsBefore: number, front: number, routed: boolean): number {
  if (front <= 0) return 0
  if (routed) return front
  if (damage <= 0) return 0
  return Math.min(front, Math.max(1, Math.round((damage / Math.max(1, troopsBefore)) * front)))
}

const PALETTES = new Set<string>(['han', 'yellow', 'cao', 'dong', 'lu'])

export function paletteOf(state: BattleState, side: Side): SidePalette {
  const token = state.sides.find((s) => s.id === side)?.colourToken ?? side
  return PALETTES.has(token) ? (token as SidePalette) : 'han'
}

export function kindOf(type: TroopType, palette: SidePalette): TroopKindName {
  return type === 'archers' ? 'archer' : type === 'cavalry' ? 'cavalry' : palette === 'yellow' ? 'rebel' : 'infantry'
}

function actorOf(state: BattleState, unitId: string): ActorPlan | null {
  const u = state.units.find((x) => x.id === unitId)
  if (!u) return null
  const palette = paletteOf(state, u.side)
  const off = state.data.officers[u.officer]
  return {
    unit: u.id,
    officer: u.officer,
    name: (off?.name ?? u.officer).replace(/\*$/, ''),
    side: u.side,
    palette,
    kind: kindOf(u.type, palette),
    type: u.type,
    mounted: u.type === 'cavalry',
    troopsBefore: u.troops,
    maxTroops: u.maxTroops,
  }
}

/** Which scene a stratagem plays, by tag (docs/spec/51 table). Command stratagems that turn the wind play W; the rest have no scene. */
export function sceneForStratagem(state: BattleState, stratId: string): SceneId | null {
  const def = state.data.stratagems[stratId]
  if (!def) return null
  switch (def.tag) {
    case 'Fire':
      return 'A'
    case 'Volley':
      return 'Ap'
    case 'Charge':
      return 'B'
    case 'Strike':
      return 'C'
    case 'Shout':
      return 'D'
    case 'Ruse':
      return 'R'
    case 'Command':
      return def.effect?.type === 'wind' || def.also?.type === 'wind' ? 'W' : null
    default:
      return null
  }
}

/** The weapon trail of a Strike stratagem: twin blades cross, glaives sweep, spears pierce. */
export function trailFor(stratId: string | null): StrikeTrail {
  switch (stratId) {
    case 'twin-blades':
      return 'x'
    case 'crescent-sweep':
    case 'green-dragon-cleave':
    case 'fathers-shadow':
      return 'arc'
    default:
      return 'line'
  }
}

/** The scene a normal attack plays, by the attacker's troops. */
export function sceneForAttack(kind: TroopType, ranged: boolean): SceneId {
  if (ranged) return 'S-archer'
  return kind === 'cavalry' ? 'S-cavalry' : 'S-melee'
}

// events that end the slice a scene stands in for (end-of-phase and world changes are ordinary board beats)
const TAIL_KINDS = new Set<GameEvent['kind']>([
  'roundStarted', 'phaseStarted', 'battleEnded', 'fireSpread', 'burnedOut', 'terrainChanged', 'timelineMessage', 'reinforced', 'retreated', 'escaped', 'objectiveProgress', 'buffExpired', 'recovered',
])

/** The slice [from, to) of the batch covering one action's combat, or null when it has no attack or stratagem. */
export function combatRange(events: readonly GameEvent[]): { from: number; to: number } | null {
  const first = events.findIndex((e) => e.kind === 'attacked' || e.kind === 'stratagem')
  if (first < 0) return null
  let to = events.length
  for (let i = first + 1; i < events.length; i++) {
    const e = events[i]!
    if (TAIL_KINDS.has(e.kind) || (e.kind === 'damaged' && e.source === 'fire')) {
      to = i
      break
    }
  }
  // trailing facing changes belong to the scene too
  return { from: 0, to }
}

// ---- the planner ------------------------------------------------------------------------------------------------

interface LinkEvents {
  marker: Extract<GameEvent, { kind: 'stratagem' | 'chainLink' }>
  events: GameEvent[]
}

function planStratagemLinks(slice: readonly GameEvent[], before: BattleState): LinkPlan[] {
  const groups: LinkEvents[] = []
  for (const e of slice) {
    if (e.kind === 'stratagem' || e.kind === 'chainLink') groups.push({ marker: e, events: [] })
    else groups[groups.length - 1]?.events.push(e)
  }
  const out: LinkPlan[] = []
  for (const g of groups) {
    const m = g.marker
    const scene = sceneForStratagem(before, m.strat)
    if (!scene) continue
    const caster = actorOf(before, m.unit)
    if (!caster) continue
    const def = before.data.stratagems[m.strat]!
    const idx = m.kind === 'stratagem' ? 0 : m.link
    const dmg = g.events.filter((e): e is Extract<GameEvent, { kind: 'damaged' }> => e.kind === 'damaged' && e.source === 'stratagem')
    const damage = dmg.reduce((a, e) => a + e.amount, 0)
    const hit = dmg.slice().sort((a, b) => b.amount - a.amount)[0]
    const confusedUnits = [...new Set(g.events.filter((e) => e.kind === 'confused').map((e) => (e as Extract<GameEvent, { kind: 'confused' }>).unit))]
    // the principal target: the biggest hit, else the first confused unit, else whoever stands on the anchor
    const principalId = hit?.unit ?? confusedUnits[0] ?? before.units.find((u) => u.x === m.anchor.x && u.y === m.anchor.y && u.side !== caster.side)?.id ?? null
    const defender = principalId ? actorOf(before, principalId) : null
    const routed = !!principalId && g.events.some((e) => e.kind === 'routed' && e.unit === principalId)
    const tile = defender ? before.units.find((u) => u.id === defender.unit)! : null
    const at = tile ? { x: tile.x, y: tile.y } : m.anchor
    const terrain = before.grid.tiles[at.y * before.grid.width + at.x]?.terrain ?? 'plain'
    const wind = g.events.find((e): e is Extract<GameEvent, { kind: 'windChanged' }> => e.kind === 'windChanged')
    const front = SCENE_INFO[scene].front
    out.push({
      scene,
      link: out.length,
      links: 0,
      caster: scene === 'B' ? { ...caster, mounted: true } : caster,
      defender,
      strat: m.strat,
      stratName: def.name,
      tag: def.tag,
      terrain,
      damage,
      targets: new Set(dmg.map((e) => e.unit)).size,
      falls: fallsFor(hit?.amount ?? 0, hit?.troopsBefore ?? defender?.troopsBefore ?? 1, front, routed),
      routed,
      confused: confusedUnits.length,
      principalConfused: !!principalId && confusedUnits.includes(principalId),
      ignited: g.events.some((e) => e.kind === 'ignited'),
      arc: 'front',
      ranged: scene === 'A' || scene === 'Ap',
      trail: trailFor(m.strat),
      wind: wind ? { dir: wind.dir, strength: wind.strength } : null,
      bond: m.kind === 'chainLink' ? m.bond : false,
      counter: null,
    })
    void idx
  }
  for (const l of out) l.links = out.length
  return out
}

function planAttack(slice: readonly GameEvent[], before: BattleState): LinkPlan | null {
  const att = slice.find((e): e is Extract<GameEvent, { kind: 'attacked' }> => e.kind === 'attacked')
  if (!att) return null
  const caster = actorOf(before, att.unit)
  const defender = actorOf(before, att.target)
  if (!caster || !defender) return null
  const hit = slice.find((e): e is Extract<GameEvent, { kind: 'damaged' }> => e.kind === 'damaged' && e.source === 'attack' && e.unit === att.target)
  const chit = slice.find((e): e is Extract<GameEvent, { kind: 'damaged' }> => e.kind === 'damaged' && e.source === 'counter' && e.unit === att.unit)
  const countered = slice.some((e) => e.kind === 'countered')
  const scene = sceneForAttack(caster.type, att.ranged)
  const front = SCENE_INFO[scene].front
  const routed = slice.some((e) => e.kind === 'routed' && e.unit === att.target)
  const tgt = before.units.find((u) => u.id === att.target)!
  const terrain = before.grid.tiles[tgt.y * before.grid.width + tgt.x]?.terrain ?? 'plain'
  const damage = hit?.amount ?? 0
  const counter =
    countered && chit
      ? { damage: chit.amount, falls: fallsFor(chit.amount, chit.troopsBefore, front, slice.some((e) => e.kind === 'routed' && e.unit === att.unit)), routed: slice.some((e) => e.kind === 'routed' && e.unit === att.unit) }
      : null
  return {
    scene,
    link: 0,
    links: 1,
    caster,
    defender,
    strat: null,
    stratName: '',
    tag: null,
    terrain,
    damage,
    targets: damage > 0 ? 1 : 0,
    falls: fallsFor(damage, hit?.troopsBefore ?? defender.troopsBefore, front, routed),
    routed,
    confused: 0,
    principalConfused: false,
    ignited: false,
    arc: att.arc,
    ranged: att.ranged,
    trail: 'line',
    wind: null,
    bond: false,
    counter,
  }
}

/** Whether a sequence plays under the settings (the pure rule table the settings UI promises). */
export function allowedBy(settings: CutinSettings, full: boolean, enemy: boolean): boolean {
  if (settings.battleScenes === 'off') return false
  if (!full && settings.battleScenes !== 'all') return false
  if (enemy) {
    if (settings.enemyScenes === 'off') return false
    if (!full && settings.enemyScenes === 'strat') return false
  }
  return true
}

/**
 * The cut-ins of one action's events. At most one range per batch (an action is one attack or one stratagem with its chain).
 * Returns [] for Instant speed, for Off, for a stratagem with no scene (Rally, banners, Supply Train) and for anything the
 * settings filter out.
 */
export function planCutins(events: readonly GameEvent[], before: BattleState, opts: PlanOptions): CutinRange[] {
  if (opts.speed === 'instant' || opts.settings.battleScenes === 'off') return []
  const r = combatRange(events)
  if (!r) return []
  const slice = events.slice(r.from, r.to)
  const opener = slice.find((e) => e.kind === 'stratagem' || e.kind === 'attacked')!
  let links: LinkPlan[]
  let full: boolean
  if (opener.kind === 'stratagem') {
    full = true
    links = planStratagemLinks(slice, before)
    // an opener with no scene (Rally...) has no cut-in, whatever follows
    if (!links.length || sceneForStratagem(before, opener.strat) === null) return []
  } else {
    full = false
    const l = planAttack(slice, before)
    if (!l) return []
    links = [l]
  }
  links.forEach((l, i) => {
    l.link = i
    l.links = links.length
  })
  const enemy = links[0]!.caster.side !== opts.playerSide
  if (!allowedBy(opts.settings, full, enemy)) return []
  return [{ from: r.from, to: r.to, plan: { full, enemy, rate: opts.speed === 'quick' ? QUICK_RATE : 1, links } }]
}

// ---- timing -----------------------------------------------------------------------------------------------------

export interface LinkTiming {
  /** Scene time the link starts at and ends at. */
  start: number
  end: number
  /** Scene seconds per real second. */
  rate: number
}

/** The playback windows of a sequence: link 1 plays from 0, later links skip the dive and run at ~60% of their length. */
export function sequenceTiming(plan: SequencePlan): { links: LinkTiming[]; seconds: number } {
  const n = plan.links.length
  const links: LinkTiming[] = plan.links.map((l, i) => {
    const info = SCENE_INFO[l.scene]
    const start = i === 0 ? 0 : info.skipTo
    const end = i < n - 1 ? info.cutAt : info.duration
    const rate = plan.rate / (i === 0 ? 1 : CHAIN_COMPRESS)
    return { start, end, rate }
  })
  const seconds = links.reduce((a, t) => a + (t.end - t.start) / t.rate, 0) + (n - 1) * INTERSTITIAL
  return { links, seconds }
}
