// Scene A world: the brazier, six kneeling archers, Jian Yong, the burning millet and seven rebels. Every pose and every
// particle is a pure function of story time (see fireArrows.ts for the plan and cues).
import { useCutinFrame } from '../stage/slot'
import { useMemo, useRef } from 'react'
import { useDisposeWorld } from '../dispose'
import { perf } from '../perf'
import { Group, Matrix4, MeshStandardMaterial, PointLight, Vector3, type Object3D } from 'three'
import { type Rig } from '../../figures'
import { buildCasterRig } from '../casters'
import { spawnFormation } from './formation'
import { CrowdScript, CrowdSet, memberSpots, publishTroops, spawnRanks } from './ranks'
import { backgroundMelee, boxDiscs, crowdLanes, meleeSides } from './melee'
import type { Crowd } from '../crowd'
import { lensClear } from '../stage/lens'
import { burstPosition, sampleSlot, type SlotConfig } from '../particles'
import { applyClip, fallBack, idle, kneel, locomotion, mix as mixClip, stagger, staggerShift, stepTurn } from '../../figures/clips'
import { Puppet, fitFigure, mix, pArmsUp, pIdle, sstep } from '../poseKit'
import { TubeBuffer, arrowTip, bowBasis, makeArrowProp, placeArrow, type ArrowProp } from '../props'
import { rand, srand } from '../rng'
import { FIRE, igniteTime } from '../fireModel'
import { Ground } from '../stage/Ground'
import { ParticleBuffer, flameColour } from '../stage/ParticleBuffer'
import { Stage, pxPerUnit, useFrameRef } from '../stage/Stage'
import { cueFor, type CutinScene } from '../timeline'
import type { SidePalette, TroopKindName } from '../plan'
import {
  A_DURATION,
  A_LAYOUT,
  A_SEED,
  DRAW_FULL,
  DRAW_START,
  FALL_DURATION,
  LOOSE_AT,
  arrowAt,
  arrowPlan,
  fallers,
  aStory,
  igniteAt,
  ignitions,
  rebelHitTime,
  rebelPos,
  fireWorldSpec,
  type ArrowPlan,
} from './fireArrows'

const Y = new Vector3(0, 1, 0)
const NONE: number[] = []
const bell = (s: number, a: number, b: number, c: number, d: number): number => sstep((s - a) / (b - a)) * (1 - sstep((s - c) / (d - c)))

// ---- actors -----------------------------------------------------------------------------------------------------

interface Archer {
  rig: Rig
  p: Puppet
  reach: number
  sideR: number
  fs: number
  psi: number
  bowGroup: Group
  bow: TubeBuffer
  string: TubeBuffer
  held: ArrowProp[]
  x: number
}

function makeArcher(i: number, rig: Rig): Archer {
  const fs = fitFigure(rig)
  const p = new Puppet(rig)
  p.j('weapon')?.traverse((o) => {
    o.visible = false
  })
  p.reset()
  const reach = Math.max(0.06, p.at('handR').distanceTo(p.at('armR')))
  const sideR = p.side('armR')
  const bowMat = new MeshStandardMaterial({ color: '#4a2f1c', roughness: 0.6 })
  const stringMat = new MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.8 })
  const bowGroup = new Group()
  const bow = new TubeBuffer(16, bowMat, 5)
  const string = new TubeBuffer(3, stringMat, 3)
  bowGroup.add(bow.mesh, string.mesh)
  rig.group.add(bowGroup)
  const held = [0, 1, 2].map(() => makeArrowProp())
  held.forEach((h) => {
    h.group.scale.setScalar(1 / fs)
    rig.group.add(h.group)
  })
  bowGroup.scale.setScalar(1 / fs)
  return { rig, p, reach, sideR, fs, psi: -sideR * Math.PI * 0.5, bowGroup, bow, string, held, x: A_LAYOUT.archerX(i) }
}

interface ArcherOut {
  nock: Vector3[]
  dir: Vector3[]
  visible: boolean
}

const tmp = {
  a: new Vector3(),
  b: new Vector3(),
  c: new Vector3(),
  u: new Vector3(),
  up: new Vector3(0, 1, 0),
  sR: new Vector3(),
  sL: new Vector3(),
  B: new Vector3(),
  N: new Vector3(),
  H: new Vector3(),
}

/** Poses archer `i` at story time s. Returns where its held arrows are, in the archer's own space. */
function poseArcher(a: Archer, i: number, s: number, out: ArcherOut, fire: boolean): void {
  const { p, rig, reach: L, fs } = a
  const u1 = 1 / fs
  const ig = igniteAt(i)
  const turn = sstep((s - 1.72) / 0.3)
  const yaw = a.psi * turn
  rig.group.position.set(a.x, 0, A_LAYOUT.archerZ)
  rig.group.rotation.set(0, yaw, 0)
  const wake = clampU((s - 0.15) / 0.45)
  rig.group.position.y += Math.sin(Math.PI * wake) * 0.05 * (wake > 0 && wake < 1 ? 1 : 0)

  p.reset()
  // the archers kneel on one knee in their line (docs/spec/51 A2/A3); the weapon arms are posed below
  applyClip(rig, kneel(1))
  const dip = fire ? bell(s, ig - 0.42, ig - 0.12, ig + 0.1, ig + 0.32) : 0
  const raise = sstep((s - (ig + 0.12)) / 0.5)
  // draw: ramps up together, then the string is let go and the hand flies back before settling
  const drawUp = sstep((s - DRAW_START) / (DRAW_FULL - DRAW_START))
  const rel = clampU((s - LOOSE_AT) / 0.07)
  const settle = sstep((s - (LOOSE_AT + 0.07)) / 0.35)
  const draw = s < LOOSE_AT ? drawUp : mix(1.0 + 0.45 * sstep(rel), 0, settle)
  const elev = sstep((s - DRAW_START) / 0.45) * 0.95 * (1 - 0.7 * sstep((s - LOOSE_AT - 0.3) / 0.5))
  const tremble = s > DRAW_START + 0.2 && s < LOOSE_AT ? Math.sin(s * 95 + i * 1.7) * 0.012 * u1 * sstep((s - DRAW_START - 0.2) / 0.3) : 0

  const lean = 0.36 * dip - 0.07 * draw
  p.rot('torso', lean, -0.0, 0)
  p.rot('head', -lean * 0.5 + elev * 0.35 * 0, 0, 0)
  p.rot('torso', lean, 0, 0)

  // bow axis in this archer's space: always toward world +z (the field), lifted by the elevation
  const uh = tmp.u.set(0, 0, 1).applyAxisAngle(Y, -yaw)
  const u3 = new Vector3(uh.x * Math.cos(elev), Math.sin(elev), uh.z * Math.cos(elev)).normalize()
  const sR = p.at('armR', tmp.sR)
  const sL = p.at('armL', tmp.sL)
  const Blow = new Vector3().copy(sR).addScaledVector(uh, 0.55 * L).addScaledVector(Y, -0.75 * L)
  const Bup = new Vector3().copy(sR).addScaledVector(u3, 0.98 * L).addScaledVector(Y, 0.01 * u1)
  const B = tmp.B.copy(Blow).lerp(Bup, raise)
  const Hrest = new Vector3().copy(sL).addScaledVector(uh, 0.45 * L).addScaledVector(Y, -0.85 * L)
  const Hdip = new Vector3().copy(sL).addScaledVector(uh, 0.85 * L).addScaledVector(Y, -0.5 * L)
  const N = tmp.N.copy(B).addScaledVector(u3, -(0.42 * L + 1.5 * L * Math.max(0, draw))).addScaledVector(Y, tremble)
  const H = tmp.H.copy(Hrest).lerp(Hdip, dip).lerp(N, raise)
  p.aim('armR', tmp.a.copy(B).sub(sR))
  p.aim('armL', tmp.b.copy(H).sub(sL))

  const hR = p.at('handR', new Vector3())
  const hL = p.at('handL', new Vector3())
  // bow
  const bg = a.bowGroup
  bg.position.copy(hR)
  bg.setRotationFromMatrix(bowBasis(u3))
  bg.updateMatrix()
  const local = hL.clone().applyMatrix4(new Matrix4().copy(bg.matrix).invert())
  const pull = Math.max(0, -local.z - 0.03)
  const Lb = 0.2
  const T = 0.03 + Math.min(0.1, pull * 0.55)
  const pts: Vector3[] = []
  for (let k = 0; k < 16; k++) {
    const v = k / 15
    const y = Lb * (1 - 2 * v) * (1 - 0.0)
    const c = 2 * (1 - v) * v
    // quadratic bezier tipTop(0,Lb,-T) -> control(0,0,+T) -> tipBottom(0,-Lb,-T)
    pts.push(new Vector3(0, y, (1 - v) * (1 - v) * -T + c * T + v * v * -T))
  }
  a.bow.update(pts, 0.0085)
  const nockLocal = new Vector3(0, Math.max(-0.05, Math.min(0.05, local.y)), Math.min(-T + 0.0, local.z))
  a.string.update([new Vector3(0, Lb, -T), nockLocal, new Vector3(0, -Lb, -T)], 0.0028)

  // arrows: a bundle of three held at the draw hand
  const dirRest = new Vector3().copy(uh).multiplyScalar(0.3).add(Y).normalize()
  const trough = new Vector3(0, 0.12 * u1, (A_LAYOUT.brazier.z - A_LAYOUT.archerZ + 0.02) * u1)
  const dirDip = tmp.c.copy(trough).sub(hL).normalize().clone()
  const dirBow = new Vector3().copy(B).addScaledVector(u3, 0.1).sub(hL).normalize()
  const dir = new Vector3().copy(dirRest).lerp(dirDip, dip).lerp(dirBow, raise).normalize()
  const side = new Vector3().crossVectors(dir, Y).normalize()
  const glow = fire ? sstep((s - (ig - 0.04)) / 0.16) : 0
  for (let j = 0; j < 3; j++) {
    const off = (j - 1) * 0.011 * u1
    const d = new Vector3().copy(dir).addScaledVector(side, (j - 1) * 0.07).normalize()
    const nock = new Vector3().copy(hL).addScaledVector(side, off)
    const held = a.held[j]!
    placeArrow(held, nock, d, glow)
    out.nock[j]!.copy(nock)
    out.dir[j]!.copy(d)
  }
  out.visible = s < LOOSE_AT
}

function clampU(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

interface Standing {
  rig: Rig
  p: Puppet
}

function makeStanding(rig: Rig): Standing {
  fitFigure(rig)
  return { rig, p: new Puppet(rig) }
}

function poseJian(j: Standing, s: number, scene: CutinScene): void {
  const { p, rig } = j
  rig.group.position.set(A_LAYOUT.jian.x, 0, A_LAYOUT.jian.z)
  rig.group.rotation.set(0, -0.35, 0)
  const wake = clampU((s - 0.15) / 0.45)
  rig.group.position.y += Math.sin(Math.PI * wake) * 0.05 * (wake > 0 && wake < 1 ? 1 : 0)
  p.reset()
  applyClip(rig, idle(s + 0.3))
  const raise = cueFor(scene, 'jian-yong', s, 'raise')
  const drop = cueFor(scene, 'jian-yong', s, 'drop')
  const up = sstep(raise ? raise.p : 0) * (1 - sstep(drop ? drop.p : 0))
  const swing = drop ? Math.sin(Math.PI * Math.min(1, drop.p * 1.1)) * 0.0 : 0
  const sR = p.side('armR')
  const sL = p.side('armL')
  // right hand held high, left hand on the hip-side
  p.aim('armR', new Vector3(sR * mix(0.25, 0.22, up), mix(-1, 1, up), mix(0.05, 0.35, up) + (drop ? sstep(drop.p) * 0.9 : 0)))
  p.aim('armL', new Vector3(sL * 0.35, -0.9, 0.2 + swing))
}

interface Rebel {
  rig: Rig
  p: Puppet
  x: number
  z: number
}

function makeRebel(i: number, rig: Rig): Rebel {
  fitFigure(rig)
  rig.group.rotation.order = 'YXZ'
  const [x, z] = rebelPos(i)
  return { rig, p: new Puppet(rig), x, z }
}

function poseRebel(r: Rebel, i: number, s: number, scene: CutinScene, isFaller: boolean): { lying: number } {
  const { p, rig } = r
  const id = `rebel${i}`
  const g = rig.group
  let px = r.x
  let pz = r.z
  let py = 0
  let rx = 0
  let ry = Math.PI + srand(A_SEED, i, 41) * 0.12
  let lying = 0
  const wake = clampU((s - 0.15) / 0.45)
  py += Math.sin(Math.PI * wake) * 0.05 * (wake > 0 && wake < 1 ? 1 : 0)
  p.reset()
  applyClip(rig, idle(s + rand(A_SEED, i, 8) * 5))
  const cue = cueFor(scene, id, s)
  const act = cue?.cue.action
  const sd = (n: number): number => srand(A_SEED, i, n)
  const fs = g.scale.x
  if (act === 'flinch') {
    const k = cue!.p
    pArmsUp(p, sstep(k * 2.5), 0.8)
    p.rot('torso', -0.38 * sstep(k * 3), sd(51) * 0.25, 0)
    p.rot('head', -0.3 * sstep(k * 3), 0, 0)
    // a start: the weight shifts up and back onto the heels, feet where they were
    py += Math.sin(Math.PI * Math.min(1, k * 1.4)) * 0.03
  } else if (act === 'stagger') {
    // reels back one step on a planted foot (distance-driven, docs/spec/31 stagger clip), arms flung up
    const k = cue!.p
    const q = clampU(k * 2.2)
    applyClip(rig, stagger(q))
    pArmsUp(p, 0.75 + 0.25 * Math.sin(s * 12 + i), 0.9)
    p.rot('torso', -0.3 + Math.sin(s * 8 + i * 2) * 0.1, Math.sin(s * 6 + i) * 0.2, Math.sin(s * 7 + i) * 0.12)
    pz += staggerShift(q) * fs
  } else if (act === 'retreat') {
    // the survivors turn on the spot (small steps), then walk away from the fire: legs driven by the distance covered
    const k = cue!.p
    const turn = sstep(k * 4)
    ry = mix(ry, srand(A_SEED, i, 41) * 0.2, turn)
    const run = sstep((k - 0.18) / 0.82)
    const dWorld = 0.62 * run
    pz += staggerShift(1) * fs + dWorld
    const v = ((0.62 * (sstep((k - 0.18 + 0.02) / 0.82) - run)) / 0.02) * (1 / (1.4 * 1)) * (1 / Math.max(fs, 1e-3))
    const walkClip = locomotion(rig, dWorld / fs + i * 0.3, Math.max(0, v), s)
    const turning = stepTurn(-(Math.PI * turn) * (i % 2 ? 1 : -1))
    applyClip(rig, mixClip(mixClip(stagger(1), turning, sstep(k * 6)), walkClip, sstep((k - 0.2) / 0.12)))
    pArmsUp(p, 0.55, 0.95)
    p.rot('torso', 0.12, Math.sin(s * 7 + i) * 0.1, 0)
  } else if (act === 'fall') {
    const k = cue!.p
    // topples backwards (away from the archers) about the heels and lies flat on the sand
    const e = k < 0.62 ? (k / 0.62) * 0.86 : 0.86 + 0.14 * sstep((k - 0.62) / 0.12)
    applyClip(rig, fallBack(e))
    const bounce = k > 0.62 ? Math.sin(Math.min(1, (k - 0.62) / 0.38) * Math.PI * 2) * 0.012 * (1 - (k - 0.62) / 0.38) : 0
    py += bounce
    pz += 0.06 * sstep(k * 1.1)
    lying = k
  } else if (!cue || act === 'wake') {
    // standing ready
  }
  if (isFaller && cue && cue.cue.action === 'fall' && cue.p >= 1) {
    applyClip(rig, fallBack(1))
    py = 0
    pz = r.z + 0.06
    lying = 1
  }
  g.position.set(px, py, pz)
  g.rotation.set(rx, ry, 0)
  return { lying }
}

// ---- the ranks (instanced crowds, docs/spec/51 "More troops") ---------------------------------------------------------

interface Ranks {
  crowds: CrowdSet
  /** Standing archers behind the kneeling line: they draw and loose with it. */
  archers: Crowd | null
  /** The defenders' ranks behind their front rank, or (mounted defenders) the whole side with its first rank as rigs. */
  def: Crowd | null
  /** One more arrow per standing archer, into the defenders' ranks. */
  extra: ArrowPlan[]
}

function buildRanks(scene: CutinScene, plan: readonly ArrowPlan[], falls: readonly number[], mounted: boolean, defKind: TroopKindName, defPal: SidePalette): Ranks {
  const p = scene.params
  const crowds = new CrowdSet()
  const archers = crowds.add(
    spawnRanks({ kind: 'archer', palette: p?.caster.palette ?? 'han', count: A_LAYOUT.archerRanks, seed: A_SEED + 11, at: [0.1, A_LAYOUT.archerRanksZ], facing: 0, formation: 'line', files: 9, gap: [0.42, 0.55] }),
  )
  const n0 = A_LAYOUT.rebelCount
  const def = crowds.add(
    mounted
      ? spawnRanks({ kind: 'cavalry', palette: defPal, count: n0 + 10, rigs: n0, seed: A_SEED + 12, at: [0, 2.62], facing: Math.PI, formation: 'line', files: n0, gap: [0.46, 0.72], jitter: 0.08 })
      : spawnRanks({ kind: defKind, palette: defPal, count: A_LAYOUT.defRanks, seed: A_SEED + 12, at: [0.05, A_LAYOUT.defRanksZ], facing: Math.PI, formation: defKind === 'rebel' ? 'mob' : 'block', files: 7, gap: [0.46, 0.46] }),
  )
  const land0 = plan.reduce((m, a) => Math.min(m, a.land), Infinity)
  const launch0 = plan.reduce((m, a) => Math.min(m, a.launch), Infinity)
  const v = new Vector3()
  // archers: draw with the kneeling line and loose on the same word
  if (archers) {
    archers.draw(undefined, { at: DRAW_START, dur: DRAW_FULL - DRAW_START })
    archers.loose({ at: LOOSE_AT })
  }
  // who in the ranks goes down: the same share as the front rank (the plan's falls of 7); half of them when routed
  const rear = def ? (mounted ? def.select('rear') : def.select('all')) : NONE
  const share = Math.min(1, scene.sample.falls / n0)
  const routed = !!p?.routed
  const nDown = scene.sample.falls <= 0 ? 0 : routed ? Math.round(rear.length * 0.5) : Math.min(rear.length, Math.round(share * rear.length))
  const down = def ? def.pick(nDown, A_SEED + 13, rear) : NONE
  // the extra arrows: aimed at the ones who fall first, then spread over the rest
  const extra: ArrowPlan[] = []
  if (archers) {
    archers.update(LOOSE_AT - 0.01)
    const order = [...down, ...rear.filter((i) => !down.includes(i))]
    archers.members.forEach((m, k) => {
      const from = archers.jointPosition(m.index, 'weapon', v, true).clone()
      let tx = srand(A_SEED, k, 71) * 1.6
      let tz = 3.4 + rand(A_SEED, k, 72) * 0.8
      if (def && order.length) {
        def.positionOf(order[k % order.length]!, v, true)
        tx = v.x
        tz = v.z
      }
      extra.push({
        id: plan.length + k,
        archer: -1,
        j: 0,
        launch: launch0 + 0.02 + rand(A_SEED, k, 73) * 0.05,
        land: land0 + 0.1 + rand(A_SEED, k, 74) * 0.5,
        from: [from.x, from.y + 0.05, from.z],
        to: [tx + srand(A_SEED, k, 75) * 0.1, 0.02, tz - 0.06 + rand(A_SEED, k, 76) * 0.12],
        apex: 2.2 + rand(A_SEED, k, 77) * 0.6,
        rebel: -1,
      })
    })
    archers.update(0)
  }
  if (def) {
    const sc = new CrowdScript()
    const hitOf = (i: number): number => {
      def.positionOf(i, v, true)
      let best = Infinity
      for (const a of extra) if ((a.to[0] - v.x) ** 2 + (a.to[2] - v.z) ** 2 < 0.3 * 0.3) best = Math.min(best, a.land)
      return best === Infinity ? land0 + 0.12 + rand(A_SEED, i, 78) * 0.35 : best
    }
    const flee = (i: number, at: number): void => sc.at(at, () => def.flee([i], { at, speed: routed ? 1.3 : 0.8 + rand(A_SEED, i, 79) * 0.3 }))
    const out = aStory(5.6)
    if (mounted) {
      // the front rank of riders is the plan's seven: rebel r is the rider standing nearest rebelPos(r)
      const xs = new Map(def.frontRank.map((i) => [i, def.positionOf(i, new Vector3(), true).x]))
      const front = [...def.frontRank]
      for (let r = 0; r < n0; r++) {
        const [rx] = rebelPos(r)
        front.sort((a, b) => Math.abs(xs.get(a)! - rx) - Math.abs(xs.get(b)! - rx))
        const i = front.shift()
        if (i === undefined) break
        const hit = rebelHitTime(plan, r)
        if (falls.includes(r)) {
          sc.at(hit, () => def.stagger([i], { at: hit, hold: 0.05, dur: 0.14 }))
          sc.at(hit + 0.14, () => def.fall([i], 'back', 0.25, { at: hit + 0.14 }))
        } else {
          sc.at(hit, () => def.stagger([i], { at: hit, hold: 0.45 }))
          flee(i, routed ? hit + 0.7 : out + rand(A_SEED, r, 80) * 0.2)
        }
      }
    }
    for (const i of rear) {
      const hit = hitOf(i)
      if (down.includes(i)) {
        sc.at(hit, () => def.stagger([i], { at: hit, hold: 0.05, dur: 0.14 }))
        sc.at(hit + 0.14, () => def.fall([i], 'back', 0.2, { at: hit + 0.14 }))
      } else {
        sc.at(hit, () => def.stagger([i], { at: hit, hold: 0.45 }))
        flee(i, routed ? hit + 0.7 : out + rand(A_SEED, i, 81) * 0.3)
      }
    }
    sc.apply()
    def.update(0)
  }
  return { crowds, archers, def, extra }
}

// ---- the world --------------------------------------------------------------------------------------------------

const TROUGH_Z = A_LAYOUT.brazier.z

function sampleFirePoint(
  ign: readonly { x: number; z: number; t: number }[],
  seed: number,
  i: number,
  k: number,
  tb: number,
  r: (n: number) => number,
): { x: number; z: number; since: number } | null {
  const live = ign.filter((g) => g.t <= tb)
  if (live.length === 0) return null
  for (let n = 0; n < 6; n++) {
    const g = live[Math.floor(r(10 + n * 4) * live.length)]!
    const dt = tb - g.t
    const exDown = FIRE.vDown * dt + 0.14
    const exUp = FIRE.vUp * dt + 0.12
    const exCross = FIRE.vCross * dt + 0.12
    const x = g.x - exUp + (exDown + exUp) * r(11 + n * 4)
    const z = g.z + (r(12 + n * 4) * 2 - 1) * exCross
    const tig = igniteTime(ign, x, z, seed)
    if (tb >= tig && tb <= tig + FIRE.burn + 0.1) return { x, z, since: tb - tig }
  }
  void i
  void k
  return null
}

export function FireArrowsWorld({ scene }: { scene: CutinScene }) {
  const frame = useFrameRef()
  const root = useRef<Group>(null)

  const world = useMemo(() => perf.measure('world-build', () => {
    const plan: ArrowPlan[] = arrowPlan()
    const spec0 = fireWorldSpec(scene)
    const ign = spec0.ignited ? ignitions(plan) : []
    const spec = fireWorldSpec(scene)
    const p = scene.params
    const archerRigs = spawnFormation('archer', p?.caster.palette ?? 'han', A_LAYOUT.archerCount, 'line', A_SEED)
    // a mounted defender stands as riders: the whole defending side is a cavalry crowd whose first rank are full rigs
    const mountedDef = spec.defKind.kind === 'cavalry'
    const rebelRigs = mountedDef ? [] : spawnFormation(spec.defKind.kind, spec.defKind.palette, A_LAYOUT.rebelCount, 'ragged', A_SEED + 3)
    const archers = archerRigs.map((f, i) => makeArcher(i, f.rig))
    const jian = makeStanding(p ? buildCasterRig(p.caster, false) : buildCasterRig({ unit: 'jian-yong', officer: 'jian-yong', name: 'Jian Yong', side: 'han', palette: 'han', kind: 'archer', type: 'archers', mounted: false, troopsBefore: 1, maxTroops: 1 }, false))
    const rebels = rebelRigs.map((f, i) => makeRebel(i, f.rig))
    const falls = fallers(scene.sample.falls)
    const ranks = buildRanks(scene, plan, falls, mountedDef, spec.defKind.kind, spec.defKind.palette)
    const flight = plan.map(() => makeArrowProp(0.36))
    flight.forEach((f) => f.group.scale.setScalar(1.7))
    flight.forEach((f) => {
      f.group.visible = false
    })
    const outs: ArcherOut[] = archers.map(() => ({ nock: [new Vector3(), new Vector3(), new Vector3()], dir: [new Vector3(), new Vector3(), new Vector3()], visible: true }))
    // launch positions come from the real pose at the moment of release, so the arrows leave the bows
    const launchFrom: Vector3[] = plan.map(() => new Vector3())
    archers.forEach((a, i) => {
      poseArcher(a, i, LOOSE_AT - 0.002, outs[i]!, spec.fire)
      for (let j = 0; j < 3; j++) {
        const nock = a.rig.group.localToWorld(outs[i]!.nock[j]!.clone())
        const dir = outs[i]!.dir[j]!.clone().transformDirection(a.rig.group.matrixWorld)
        launchFrom[i * 3 + j] = nock.addScaledVector(dir, 0.18)
      }
    })
    // the standing ranks loose too: one more arrow each, landing in the defenders' ranks
    const extra = ranks.extra.map(() => makeArrowProp(0.36))
    extra.forEach((f) => {
      f.group.scale.setScalar(1.7)
      f.group.visible = false
    })
    const nArrows = plan.length + ranks.extra.length
    const fx = {
      brazier: new ParticleBuffer(260, 'add', 1.3),
      tips: new ParticleBuffer(nArrows * 9, 'add', 1.2),
      trails: new ParticleBuffer(18 * 46 + ranks.extra.length * 20, 'add', 1.4),
      sparks: new ParticleBuffer(nArrows * 8, 'add', 2.2),
      flames: new ParticleBuffer(1100, 'add', 1.25),
      embers: new ParticleBuffer(420, 'add', 2.4),
      smoke: new ParticleBuffer(170, 'alpha', 0.9),
    }
    const clear = [
      { x: 0.55, z: 5.05, r: 0.35 },
      { x: 0.25, z: 4.7, r: 0.3 },
      ...rebels.map((r) => ({ x: r.x, z: r.z, r: 0.34 })),
      ...memberSpots(ranks.def).map((q) => ({ ...q, r: mountedDef ? 0.24 : 0.2 })),
    ]
    const lens = lensClear(scene, spec.ground === 'millet' ? { reach: 1.0, maxY: 0.6 } : { reach: 2.2, maxY: 1.4 })
    // the background battle: around both lines, out of the field, the brazier, the ranks' paths and the lens
    const f = A_LAYOUT.field
    const lanes = [
      ...boxDiscs(A_LAYOUT.archerX(0) - 0.6, A_LAYOUT.archerX(A_LAYOUT.archerCount - 1) + 1.4, A_LAYOUT.archerZ - 0.3, TROUGH_Z + 0.3, 0.5),
      { x: A_LAYOUT.jian.x, z: A_LAYOUT.jian.z, r: 0.7 },
      ...rebels.map((r) => ({ x: r.x, z: r.z, r: 0.8 })),
      ...(spec.ground === 'millet' ? boxDiscs(f.x0, f.x1, f.z0, f.z1, 0.6) : []),
      ...crowdLanes(ranks.crowds, A_DURATION + 0.3, 0.6),
      ...lensClear(scene, { reach: 3.0, maxY: 2.2 }),
    ]
    const melee = backgroundMelee({
      seed: A_SEED + 77,
      center: [0.3, 0.2],
      sides: meleeSides(p?.caster.palette ?? 'han', spec.defKind.palette),
      knots: 22,
      riders: 3,
      runners: 4,
      banners: 2,
      rMin: 1.2,
      rMax: 8.0,
      duration: A_DURATION + 0.5,
      exclude: lanes,
    })
    publishTroops(scene.id, archers.length + 1 + ranks.crowds.members(ranks.archers), rebels.length + ranks.crowds.members(ranks.def), ranks.crowds, melee)
    return { plan, ign, archers, jian, rebels, falls, flight, outs, launchFrom, fx, spec, ranks, extra, clear, lens, melee }
  }), [scene])

  // the launch points feed the plan used for flight
  const flightPlan = useMemo(() => [...world.plan.map((a, i) => ({ ...a, from: [world.launchFrom[i]!.x, world.launchFrom[i]!.y, world.launchFrom[i]!.z] as [number, number, number] })), ...world.ranks.extra], [world])
  const flightProps = useMemo(() => [...world.flight, ...world.extra], [world])

  const lights = useRef<{ brazier: PointLight | null; f1: PointLight | null; f2: PointLight | null }>({ brazier: null, f1: null, f2: null })
  const coalMat = useMemo(() => new MeshStandardMaterial({ color: '#2a0d04', emissive: '#ff5a14', emissiveIntensity: 1.6, roughness: 1 }), [])
  const ironMat = useMemo(() => new MeshStandardMaterial({ color: '#2b2724', roughness: 0.45, metalness: 0.7 }), [])

  useDisposeWorld(world, () => {
    world.archers.forEach((a) => a.rig.dispose())
    world.rebels.forEach((r) => r.rig.dispose())
    world.jian.rig.dispose()
    world.ranks.crowds.dispose()
    world.melee?.dispose()
    Object.values(world.fx).forEach((f) => f.dispose())
  })

  const tipW = useMemo(() => new Vector3(), [])
  const fcol: [number, number, number] = useMemo(() => [1, 1, 1], [])

  useCutinFrame(({ camera, gl }) => {
    const { story: s, t } = frame.current
    const ppu = pxPerUnit(gl.domElement.height, (camera as { fov?: number }).fov ?? 40)
    const { archers, jian, rebels, falls, outs, fx } = world
    // flames and smoke grow with camera distance so the wide shots still read
    const kd = Math.min(2.6, Math.max(1, camera.position.distanceTo(new Vector3(1.2, 0.2, 2.8)) / 3.8))

    // --- figures
    world.ranks.crowds.update(s)
    world.melee?.update(s, ppu)
    archers.forEach((a, i) => poseArcher(a, i, s, outs[i]!, world.spec.fire))
    poseJian(jian, s, scene)
    rebels.forEach((r, i) => poseRebel(r, i, s, scene, falls.includes(i)))
    archers.forEach((a, i) => {
      const o = outs[i]!
      a.held.forEach((h) => {
        h.group.visible = o.visible
      })
      a.bowGroup.visible = true
    })

    // --- arrows in flight (world space)
    flightPlan.forEach((a, k) => {
      const f = flightProps[k]!
      const st = arrowAt(a, s)
      const launched = s >= a.launch
      f.group.visible = launched
      if (!launched) return
      const center = new Vector3(st.p[0], st.p[1], st.p[2])
      const flightDir = new Vector3(st.d[0], st.d[1], st.d[2])
      let dir = flightDir
      f.group.scale.setScalar(st.q >= 1 ? 1.15 : 1.7)
      if (st.q < 0.08 && a.archer >= 0) {
        const held = outs[a.archer]!.dir[a.j]!.clone().transformDirection(archers[a.archer]!.rig.group.matrixWorld)
        dir = held.lerp(flightDir, sstep(st.q / 0.08)).normalize()
      }
      if (st.q >= 1) {
        // planted: leaning in the ridge, tip glowing a little longer
        dir = new Vector3(0.12 + 0.1 * srand(A_SEED, k, 61), 0.9, -0.35 - 0.1 * srand(A_SEED, k, 62)).normalize()
        center.set(a.to[0], a.to[1] + 0.2, a.to[2])
      }
      const nock = center.clone().addScaledVector(dir, -0.3)
      placeArrow(f, nock, dir, world.spec.fire ? (st.q >= 1 ? Math.max(0, 1 - (s - a.land) / 1.4) : 1) : 0)
    })

    // --- brazier + lights
    const flick = 0.85 + 0.15 * Math.sin(s * 23) + 0.08 * Math.sin(s * 41 + 1)
    coalMat.emissiveIntensity = 1.2 + 0.7 * flick
    if (lights.current.brazier) lights.current.brazier.intensity = world.spec.fire ? 5 * flick : 0
    // field light follows the burning front
    const tFirst = world.ign.reduce((m, g) => Math.min(m, g.t), Infinity)
    const since = s - tFirst
    const fireOn = clampU(since / 0.5)
    const reach = Math.max(0, since)
    const cx = 0.0 + reach * FIRE.vDown * 0.55
    if (lights.current.f1) {
      lights.current.f1.position.set(cx - 0.4, 0.45, 2.5)
      lights.current.f1.intensity = fireOn * 3.5 * (0.9 + 0.1 * Math.sin(s * 17))
    }
    if (lights.current.f2) {
      lights.current.f2.position.set(cx + 1.2, 0.5, 3.0)
      lights.current.f2.intensity = fireOn * 2.6 * (0.9 + 0.1 * Math.sin(s * 21 + 2))
    }

    // --- particles
    // brazier flames
    {
      const b = fx.brazier
      b.begin(ppu)
      const cfg: SlotConfig = { seed: A_SEED + 1, count: world.spec.fire ? 260 : 0, period: 0.7, start: -5, end: 99, lifeMin: 0.4 }
      for (let i = 0; i < cfg.count; i++) {
        const sl = sampleSlot(cfg, i, s)
        if (!sl.alive) continue
        const x = (sl.r(1) * 2 - 1) * A_LAYOUT.brazier.len * 0.48
        const lift = sl.u
        const px = x + FIRE.vDown * 0.0 + lift * 0.12 + Math.sin(s * 9 + i) * 0.012
        const py = 0.15 + lift * (0.34 + 0.3 * sl.r(2))
        const pz = TROUGH_Z + (sl.r(3) - 0.5) * 0.1
        flameColour(lift, fcol)
        const size = (0.07 + 0.06 * sl.r(4)) * (1 - 0.55 * lift)
        b.push(px, py, pz, size, fcol[0], fcol[1], fcol[2], 0.55 * (1 - lift) ** 0.9)
      }
      b.end()
    }
    // flames on the arrow tips (held) and in flight
    {
      const b = fx.tips
      b.begin(ppu)
      for (let a = 0; a < (world.spec.fire ? 6 : 0); a++) {
        const ig = igniteAt(a)
        const lit = sstep((s - (ig - 0.04)) / 0.16)
        const o = outs[a]!
        for (let j = 0; j < 3; j++) {
          const id = a * 3 + j
          const fp = flightPlan[id]!
          let tx: number
          let ty: number
          let tz: number
          let dirx = 0
          let diry = 1
          let dirz = 0
          let on = lit
          if (s < fp.launch) {
            arrowTip(o.nock[j]!, o.dir[j]!, 0.34 * archers[a]!.fs ** -1, tipW)
            archers[a]!.rig.group.localToWorld(tipW)
            tx = tipW.x
            ty = tipW.y
            tz = tipW.z
          } else {
            const st = arrowAt(fp, s)
            const flying = st.q < 1
            dirx = -st.d[0]
            diry = -st.d[1] * 0.5 + 0.5
            dirz = -st.d[2]
            if (flying) {
              tx = st.p[0] + st.d[0] * 0.31
              ty = st.p[1] + st.d[1] * 0.31
              tz = st.p[2] + st.d[2] * 0.31
            } else {
              tx = fp.to[0] + 0.02
              ty = fp.to[1] + 0.26
              tz = fp.to[2] + 0.03
              on = Math.max(0, 1 - (s - fp.land) / 1.2)
              dirx = 0
              diry = 1
              dirz = 0
            }
            on = flying ? 1 : on
          }
          if (on <= 0.01) continue
          for (let k = 0; k < 9; k++) {
            const u = (s * 5.5 + k / 9 + rand(A_SEED, id, k) * 0.7) % 1
            const wob = Math.sin(s * 31 + k * 2 + id) * 0.008
            const px = tx + dirx * u * 0.07 + wob + u * 0.04
            const py = ty + diry * u * 0.09
            const pz = tz + dirz * u * 0.07
            flameColour(u, fcol)
            b.push(px, py, pz, 0.058 * (1 - 0.65 * u) * (0.5 + 0.5 * on), fcol[0], fcol[1], fcol[2], 0.9 * (1 - u) * on)
          }
        }
      }
      // the standing ranks' arrows: a flame on the tip while they fly
      for (const fp of world.spec.fire ? world.ranks.extra : []) {
        if (s < fp.launch || s > fp.land) continue
        const st = arrowAt(fp, s)
        for (let k = 0; k < 6; k++) {
          const u = (s * 5.5 + k / 6 + rand(A_SEED, fp.id, k) * 0.7) % 1
          flameColour(u, fcol)
          b.push(st.p[0] + st.d[0] * 0.31 - st.d[0] * u * 0.07 + u * 0.04, st.p[1] + st.d[1] * 0.31 + u * 0.05, st.p[2] + st.d[2] * 0.31 - st.d[2] * u * 0.07, 0.05 * (1 - 0.65 * u), fcol[0], fcol[1], fcol[2], 0.85 * (1 - u))
        }
      }
      b.end()
    }
    // ember trails behind the flying arrows
    {
      const b = fx.trails
      b.begin(ppu)
      for (const a of world.spec.fire ? flightPlan : []) {
        if (s < a.launch) continue
        const cfg: SlotConfig = { seed: A_SEED + 10 + a.id, count: a.archer >= 0 ? 46 : 20, period: 0.8, start: a.launch, end: a.land, lifeMin: 0.3 }
        for (let i = 0; i < cfg.count; i++) {
          const sl = sampleSlot(cfg, i, s)
          if (!sl.alive) continue
          const st = arrowAt(a, sl.tb)
          const u = sl.u
          const px = st.p[0] + srand(A_SEED, a.id, i) * 0.018 + u * 0.1
          const py = st.p[1] + u * 0.07 + srand(A_SEED, a.id, i + 40) * 0.012 - 0.0
          const pz = st.p[2] + srand(A_SEED, a.id, i + 80) * 0.018
          flameColour(0.12 + u * 0.7, fcol)
          b.push(px, py, pz, 0.075 * (1 - 0.7 * u) + 0.014, fcol[0], fcol[1], fcol[2], 0.85 * (1 - u) ** 1.3)
        }
      }
      b.end()
    }
    // impact sparks
    {
      const b = fx.sparks
      b.begin(ppu)
      for (const a of flightPlan) {
        for (let k = 0; k < 8; k++) {
          const sp = burstPosition(A_SEED + 3, a.id * 8 + k, a.land, s, [a.to[0], 0.08, a.to[2]], 1.0, 3.6, 0.6)
          if (!sp) continue
          if (world.spec.fire) b.push(sp.p[0], sp.p[1], sp.p[2], 0.022 * (1 - sp.u * 0.6), 1, 0.7 - 0.4 * sp.u, 0.25, 0.95 * (1 - sp.u))
          else b.push(sp.p[0], sp.p[1], sp.p[2], 0.016 * (1 - sp.u * 0.5), 0.92, 0.84, 0.66, 0.55 * (1 - sp.u))
        }
      }
      b.end()
    }
    // field flames, embers, smoke
    {
      const ign = world.ign
      const cfg: SlotConfig = { seed: A_SEED + 20, count: 800, period: 0.85, start: tFirst, end: 99, lifeMin: 0.4 }
      const b = fx.flames
      b.begin(ppu)
      for (let i = 0; i < cfg.count; i++) {
        const sl = sampleSlot(cfg, i, s)
        if (!sl.alive) continue
        const pt = sampleFirePoint(ign, A_SEED, i, sl.k, sl.tb, sl.r)
        if (!pt) continue
        const u = sl.u
        const px = pt.x + u * 0.22 + Math.sin(s * 11 + i) * 0.014
        const py = 0.07 + u * (0.42 + 0.3 * sl.r(5))
        const pz = pt.z + Math.sin(s * 9 + i * 1.3) * 0.01
        flameColour(u * 0.95, fcol)
        const size = (0.11 + 0.1 * sl.r(6)) * (1 - 0.45 * u) * kd
        b.push(px, py, pz, size, fcol[0], fcol[1], fcol[2], 0.36 * (1 - u) ** 0.8)
      }
      b.end()

      const e = fx.embers
      e.begin(ppu)
      const ecfg: SlotConfig = { seed: A_SEED + 21, count: 420, period: 2.4, start: tFirst, end: 99, lifeMin: 1.3 }
      for (let i = 0; i < ecfg.count; i++) {
        const sl = sampleSlot(ecfg, i, s)
        if (!sl.alive) continue
        const pt = sampleFirePoint(ign, A_SEED, i, sl.k, sl.tb, sl.r)
        if (!pt) continue
        const age = sl.age
        const px = pt.x + age * (0.45 + 0.4 * sl.r(5)) + Math.sin(age * 5 + i) * 0.04
        const py = 0.15 + age * (0.22 + 0.3 * sl.r(6)) + Math.sin(age * 7 + i * 2) * 0.03
        const pz = pt.z + (sl.r(7) - 0.5) * 0.3 * age + Math.sin(age * 4 + i) * 0.03
        const tw = 0.6 + 0.4 * Math.sin(s * 25 + i * 3)
        e.push(px, py, pz, 0.024 * kd * (1 - sl.u * 0.5), 1, 0.55 + 0.3 * sl.r(8), 0.18, 0.95 * (1 - sl.u) * tw)
      }
      e.end()

      const sm = fx.smoke
      sm.begin(ppu)
      const scfg: SlotConfig = { seed: A_SEED + 22, count: 170, period: 3.0, start: tFirst + 0.2, end: 99, lifeMin: 2.0 }
      for (let i = 0; i < scfg.count; i++) {
        const sl = sampleSlot(scfg, i, s)
        if (!sl.alive) continue
        const pt = sampleFirePoint(ign, A_SEED, i, sl.k, sl.tb, sl.r)
        if (!pt) continue
        const age = sl.age
        const px = pt.x + age * (0.5 + 0.3 * sl.r(5))
        const py = 0.2 + age * (0.28 + 0.2 * sl.r(6))
        const pz = pt.z + (sl.r(7) - 0.5) * 0.4
        const k = sl.u
        sm.push(px, py, pz, 0.2 + 0.5 * k, 0.1 + 0.05 * (1 - k), 0.075 + 0.03 * (1 - k), 0.06, 0.34 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.4))
      }
      sm.end()
    }
  })

  return (
    <group ref={root}>
      <Stage seed={A_SEED} focus={[0.4, 0.6]} keyDir={[-5.5, 8, -6.5]} rimDir={[6.5, 3, 8]} motes={90} moteStrength={0.45} />
      <Ground
        kind={world.spec.ground}
        seed={A_SEED}
        center={[1.1, 2.6]}
        halfW={3.4}
        halfD={1.3}
        box={A_LAYOUT.field}
        ignitions={world.ign}
        clear={world.clear}
        lens={world.lens}
        wind={A_LAYOUT.wind}
      />
      {/* iron brazier: a long firebox on short legs in front of the line */}
      <group position={[A_LAYOUT.brazier.x, 0, TROUGH_Z]} visible={world.spec.fire}>
        <mesh material={ironMat} position={[0, 0.115, 0]} castShadow receiveShadow>
          <boxGeometry args={[A_LAYOUT.brazier.len, 0.07, 0.19]} />
        </mesh>
        <mesh material={coalMat} position={[0, 0.152, 0]}>
          <boxGeometry args={[A_LAYOUT.brazier.len - 0.08, 0.012, 0.13]} />
        </mesh>
        {[-1.25, -0.6, 0, 0.6, 1.25].map((x) => (
          <mesh key={x} material={ironMat} position={[x, 0.05, 0]} castShadow>
            <boxGeometry args={[0.05, 0.1, 0.12]} />
          </mesh>
        ))}
        {[-1, 1].map((sx) => (
          <mesh key={sx} material={ironMat} position={[sx * (A_LAYOUT.brazier.len / 2 + 0.02), 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.32, 6]} />
          </mesh>
        ))}
      </group>
      {world.archers.map((a, i) => (
        <primitive key={`a${i}`} object={a.rig.group as Object3D} />
      ))}
      <primitive object={world.jian.rig.group as Object3D} />
      {world.rebels.map((r, i) => (
        <primitive key={`r${i}`} object={r.rig.group as Object3D} />
      ))}
      <primitive object={world.ranks.crowds.group as Object3D} />
      {world.melee && <primitive object={world.melee.group as Object3D} />}
      {flightProps.map((f, i) => (
        <primitive key={`f${i}`} object={f.group as Object3D} />
      ))}
      {Object.entries(world.fx).map(([k, f]) => (
        <primitive key={k} object={f.points as Object3D} />
      ))}
      <pointLight ref={(l) => void (lights.current.brazier = l)} position={[0, 0.5, TROUGH_Z - 0.2]} color="#ff8a3a" distance={6} decay={2} intensity={5} />
      <pointLight ref={(l) => void (lights.current.f1 = l)} position={[0, 0.45, 2.5]} color="#ff7a28" distance={7} decay={2} intensity={0} />
      <pointLight ref={(l) => void (lights.current.f2 = l)} position={[1.2, 0.5, 3.0]} color="#ff6a1c" distance={7} decay={2} intensity={0} />
    </group>
  )
}

export { FALL_DURATION, DRAW_FULL }
