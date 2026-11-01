// Builds the CutinScene for a plan link, and the sample plans the review page plays (docs/spec/51). Pure.
import type { ActorPlan, LinkPlan, SceneId } from '../plan'
import { fallsFor } from '../plan'
import { SCENE_INFO } from '../sceneInfo'
import type { CutinScene } from '../timeline'
import { makeDuelStrike, makeRuse, makeShortArcher, makeShortCavalry, makeShortMelee, makeThunderRoar, makeWindTurn } from './act'
import { makeFireArrows } from './fireArrows'
import { makeThunderingCharge } from './thunderingCharge'

/** The scene of one link. Every number on screen comes from the plan; the caster, troops and terrain too. */
export function buildScene(p: LinkPlan): CutinScene {
  switch (p.scene) {
    case 'A':
      return makeFireArrows(p.damage, p.falls, p, 'fire')
    case 'Ap':
      return makeFireArrows(p.damage, p.falls, p, 'volley')
    case 'B':
      return makeThunderingCharge(p.damage, p.falls, p)
    case 'C':
      return makeDuelStrike(p)
    case 'D':
      return makeThunderRoar(p)
    case 'R':
      return makeRuse(p)
    case 'W':
      return makeWindTurn(p)
    case 'S-melee':
      return makeShortMelee(p)
    case 'S-cavalry':
      return makeShortCavalry(p)
    case 'S-archer':
      return makeShortArcher(p)
  }
}

const actor = (over: Partial<ActorPlan> & Pick<ActorPlan, 'officer' | 'name'>): ActorPlan => ({
  unit: over.officer,
  side: 'han',
  palette: 'han',
  kind: 'infantry',
  type: 'infantry',
  mounted: false,
  troopsBefore: 3000,
  maxTroops: 4000,
  ...over,
})

/** Sample plans for the review page: the same shape the planner produces from a real event. */
export function samplePlan(id: SceneId, over: Partial<LinkPlan> = {}): LinkPlan {
  const front = SCENE_INFO[id].front
  const rebel = actor({ officer: 'rebel-captain', name: 'Rebel Captain Gao', side: 'yellow', palette: 'yellow', kind: 'rebel', troopsBefore: 2400, maxTroops: 3000 })
  const base: LinkPlan = {
    scene: id,
    link: 0,
    links: 1,
    caster: actor({ officer: 'zhang-fei', name: 'Zhang Fei' }),
    defender: rebel,
    strat: null,
    stratName: '',
    tag: null,
    terrain: 'plain',
    damage: 640,
    targets: 1,
    falls: fallsFor(640, 2400, front, false),
    routed: false,
    confused: 0,
    principalConfused: false,
    ignited: false,
    arc: 'front',
    ranged: false,
    trail: 'line',
    wind: null,
    bond: false,
    counter: null,
  }
  switch (id) {
    case 'A':
      return { ...base, caster: actor({ officer: 'jian-yong', name: 'Jian Yong', kind: 'archer', type: 'archers' }), strat: 'fire-attack', stratName: 'Fire Attack', tag: 'Fire', terrain: 'farm', damage: 420, falls: fallsFor(420, 2400, front, false), ignited: true, ranged: true, ...over }
    case 'Ap':
      return { ...base, caster: actor({ officer: 'huang-gai', name: 'Huang Gai', kind: 'archer', type: 'archers' }), strat: 'arrow-rain', stratName: 'Arrow Rain', tag: 'Volley', terrain: 'forest', damage: 540, falls: fallsFor(540, 2400, front, false), ranged: true, ...over }
    case 'B':
      return { ...base, caster: actor({ officer: 'guan-yu', name: 'Guan Yu', kind: 'cavalry', type: 'cavalry', mounted: true }), strat: 'thundering-charge', stratName: 'Thundering Charge', tag: 'Charge', damage: 1060, falls: fallsFor(1060, 2400, front, false), ...over }
    case 'C':
      return { ...base, strat: 'serpent-thrust', stratName: 'Serpent Thrust', tag: 'Strike', terrain: 'village', trail: 'line', damage: 880, falls: fallsFor(880, 2400, front, false), ...over }
    case 'D':
      return { ...base, strat: 'thunder-roar', stratName: 'Thunder Roar', tag: 'Shout', terrain: 'plain', damage: 360, falls: fallsFor(360, 2400, front, false), confused: 2, principalConfused: true, targets: 2, ...over }
    case 'R':
      return { ...base, caster: actor({ officer: 'zhuge-liang', name: 'Zhuge Liang' }), strat: 'sow-discord', stratName: 'Sow Discord', tag: 'Ruse', terrain: 'shallows', damage: 0, falls: 0, targets: 0, confused: 1, principalConfused: true, ...over }
    case 'W':
      return { ...base, caster: actor({ officer: 'zhuge-liang', name: 'Zhuge Liang' }), defender: null, strat: 'borrow-the-wind', stratName: 'Borrow the Wind', tag: 'Command', damage: 0, falls: 0, targets: 0, wind: { dir: 'E', strength: 'gale' }, ...over }
    case 'S-melee':
      return { ...base, caster: actor({ officer: 'liu-bei', name: 'Liu Bei' }), damage: 520, falls: fallsFor(520, 2400, front, false), counter: { damage: 140, falls: 1, routed: false }, ...over }
    case 'S-cavalry':
      return { ...base, caster: actor({ officer: 'zhao-yun', name: 'Zhao Yun', kind: 'cavalry', type: 'cavalry', mounted: true }), terrain: 'farm', damage: 780, falls: fallsFor(780, 2400, front, false), arc: 'side', ...over }
    case 'S-archer':
      return { ...base, caster: actor({ officer: 'jian-yong', name: 'Jian Yong', kind: 'archer', type: 'archers' }), terrain: 'hill', damage: 410, falls: fallsFor(410, 2400, front, false), ranged: true, arc: 'rear', ...over }
  }
}

export const SCENE_IDS: SceneId[] = ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']
