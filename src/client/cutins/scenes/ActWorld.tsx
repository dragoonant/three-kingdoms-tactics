// The renderer for scenes C, D, R, W and the three short attack scenes. It draws exactly the ActPlan of scenes/act.ts: every
// figure's position is trackAt(track, story time), every pose is chosen by the cue that is current for that figure, and every
// particle is a pure function of story time, so any frame can be drawn on its own (scrubbing, capture, skip).
import { useCutinFrame } from '../stage/slot'
import { useMemo } from 'react'
import { useDisposeWorld } from '../dispose'
import { keep } from '../gpu'
import { perf } from '../perf'
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  CylinderGeometry,
  BoxGeometry,
  ConeGeometry,
  type Object3D,
} from 'three'
import { figures, type Rig } from '../../figures'
import { applyClip, drawBow, fallBack, idle, locomotion, mix as mixClip, stagger, staggerShift, thrust } from '../../figures/clips'
import { buildCasterRig, cutinRig } from '../casters'
import { burstPosition, sampleSlot, type SlotConfig } from '../particles'
import { Puppet, fitFigure, limbsOnly, mix, pArmsUp, pRear, sstep } from '../poseKit'
import { Ribbon, makeArrowProp, placeArrow, type ArrowProp } from '../props'
import { rand, srand } from '../rng'
import { Ground } from '../stage/Ground'
import { ParticleBuffer } from '../stage/ParticleBuffer'
import { PadLights, POINT_LIGHTS, Stage, pxPerUnit, useFrameRef } from '../stage/Stage'
import { cueFor, type CutinScene } from '../timeline'
import { defenderOf, trackAt, type ActActor, type ActPlan } from './act'
import { spawnFormation } from './formation'
import { buildActRanks, frontHeroActor } from './actRanks'
import { memberSpots, publishTroops } from './ranks'
import { backgroundMelee, crowdLanes, meleeSides } from './melee'
import { SCENE_INFO } from '../sceneInfo'
import { lensClear } from '../stage/lens'

const clampU = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const bell = (s: number, a: number, b: number, c: number, d: number): number => sstep((s - a) / (b - a)) * (1 - sstep((s - c) / (d - c)))
const GRAV = 9.0

interface Live {
  actor: ActActor
  rig: Rig
  p: Puppet
  holder: Group
  fs: number
  hero: boolean
  index: number
}

function buildLive(scene: CutinScene, act: ActPlan): { live: Live[]; mouth: Mesh | null } {
  const live: Live[] = []
  const heroFront = frontHeroActor(scene, act, figures.heroIds())
  const byGroup = new Map<string, Rig[]>()
  for (const g of act.groups) {
    byGroup.set(
      g.id,
      spawnFormation(g.kind, g.palette, g.count, g.layout, g.seed).map((f) => f.rig),
    )
  }
  let mouth: Mesh | null = null
  act.actors.forEach((actor, index) => {
    let rig: Rig
    if (actor.group === 'hero') {
      rig = buildCasterRig(act.hero!, act.heroMounted)
    } else if (actor.id === heroFront && scene.params) {
      const c = scene.params.caster
      rig = buildCasterRig(c, act.groups.find((g) => g.id === 'atk')?.kind === 'cavalry')
    } else {
      const r = byGroup.get(actor.group)?.[actor.index]
      rig = r ?? cutinRig(figures.buildTroop('infantry', 'han', 0))
    }
    const k = fitFigure(rig)
    void k
    const holder = new Group()
    holder.rotation.order = 'YXZ'
    holder.add(rig.group)
    const fs = rig.group.scale.x * (rig.bodyScale ?? 1)
    const p = new Puppet(rig)
    if (actor.group === 'hero' && scene.act?.fx.roar) {
      const head = rig.joints.head
      mouth = new Mesh(new SphereGeometry(1, 12, 10), new MeshBasicMaterial({ color: '#2a0c0a' }))
      mouth.position.set(0, 0.07, 0.166)
      mouth.scale.set(0.0001, 0.0001, 0.0001)
      head.add(mouth)
    }
    live.push({ actor, rig, p, holder, fs, hero: actor.group === 'hero', index })
  })
  return { live, mouth }
}

// ---- the weapon poses of the hero ---------------------------------------------------------------------------------

const REST_ARM: [number, number, number] = [0.2, -1, 0.05]
const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z)

function aimWeighted(p: Puppet, joint: 'armL' | 'armR' | 'weapon' | 'offhand', dir: Vector3, w: number, rest: Vector3, axis?: [number, number, number]): void {
  const d = rest.clone().lerp(dir, clampU(w))
  if (d.lengthSq() < 1e-6) return
  p.aim(joint, d, axis)
}

/** Wind-up (k 0..1) and strike (k 0..1) of the hero's weapon, by the kind of trail. `w` blends toward the rest pose (recovery). */
function poseStrike(p: Puppet, trail: 'x' | 'arc' | 'line', wind: number, strike: number, w: number): void {
  const sR = p.side('armR')
  const sL = p.side('armL')
  const wr = (s: number): number => mix(0, s, w)
  const restR = v(sR * 0.2, -1, 0.05)
  const restL = v(sL * 0.2, -1, 0.05)
  const restW = v(0, 1, 0.1)
  const W = sstep(wind)
  const S = sstep(strike)
  if (trail === 'x') {
    // swords drawn back and out, then swept across each other in front: an X
    const wR = v(sR * 0.75, 0.75, -0.35)
    const wL = v(sL * 0.75, 0.75, -0.35)
    const fR = v(-sR * 0.45, -0.1, 0.9)
    const fL = v(-sL * 0.45, -0.1, 0.9)
    const dR = wR.clone().multiplyScalar(W).add(v(0, 0.1, 0.2).multiplyScalar(1 - W)).lerp(fR, S)
    const dL = wL.clone().multiplyScalar(W).add(v(0, 0.1, 0.2).multiplyScalar(1 - W)).lerp(fL, S)
    aimWeighted(p, 'weapon', dR, w, restW)
    aimWeighted(p, 'offhand', dL, w, restW)
    aimWeighted(p, 'armR', dR.clone().add(v(0, -0.3, 0)), w, restR)
    aimWeighted(p, 'armL', dL.clone().add(v(0, -0.3, 0)), w, restL)
    p.rot('torso', wr(-0.1 * W + 0.35 * S), wr(-0.25 * W * (1 - S)), 0)
  } else if (trail === 'arc') {
    // the glaive goes up and back, then sweeps flat from right to left across the front
    const a = -1.0 + 2.15 * S
    const up = v(sR * 0.3, 0.95, -0.4)
    const sweep = v(Math.sin(a) * 0.95, 0.14 + 0.5 * (1 - S), Math.cos(a) * 0.95)
    const dir = up.clone().multiplyScalar(W).add(v(0, 1, 0.12).multiplyScalar(1 - W)).lerp(sweep, sstep(strike * 3))
    aimWeighted(p, 'weapon', dir, w, restW)
    aimWeighted(p, 'armR', v(dir.x * 0.8 + sR * 0.3, Math.max(-0.1, dir.y * 0.7), dir.z * 0.8 + 0.1), w, restR)
    aimWeighted(p, 'armL', v(-sL * 0.3 + dir.x * 0.3, -0.35 + 0.5 * W, 0.7), w, restL)
    p.rot('torso', wr(-0.15 * W + 0.2 * S), wr(-0.5 * a * S - 0.2 * W * (1 - S)), 0)
  } else {
    // the spear is drawn back at the hip, then driven straight forward
    const dir = v(0, 0.06, 1)
    aimWeighted(p, 'weapon', dir, w, restW)
    const back = v(sR * 0.1, -0.25, -0.9)
    const fwd = v(0, 0.02, 0.95)
    const armR = back.clone().multiplyScalar(W).add(v(sR * 0.2, -0.6, 0.4).multiplyScalar(1 - W)).lerp(fwd, S)
    aimWeighted(p, 'armR', armR, w, restR)
    aimWeighted(p, 'armL', v(-sL * 0.2, 0.0, 0.8), w, restL)
    p.rot('torso', wr(0.3 * S - 0.1 * W), wr(-0.35 * W * (1 - S) + 0.35 * S), 0)
    p.move('hips', 0, 0, wr(-0.08 * W * (1 - S) + 0.18 * S))
  }
}

// ---- the actors ---------------------------------------------------------------------------------------------------

interface Flung {
  x: number
  z: number
  y: number
  rx: number
  rz: number
  yaw: number
  air: boolean
  landed: number
}

/** Ballistic tumble, then a slide and a rest lying on the back: a pure function of the time since the knock (params in the cue). */
function flingAt(params: Record<string, number | string>, x0: number, z0: number, yaw0: number, tau: number): Flung {
  const vx = Number(params.vx ?? 0)
  const vy = Number(params.vy ?? 1.5)
  const vz = Number(params.vz ?? 1.5)
  const spinX = Number(params.sx ?? 8)
  const spinZ = Number(params.sz ?? 0)
  const T = (2 * vy) / GRAV
  const t = Math.min(Math.max(0, tau), T)
  const air = tau < T
  const slideT = Math.max(0, tau - T)
  const sl = 1 - Math.exp(-slideT / 0.22)
  const x = x0 + vx * t + vx * 0.42 * sl
  const z = z0 + vz * t + vz * 0.42 * sl
  const y = 0.22 + vy * t - 0.5 * GRAV * t * t
  const spinTotal = -spinX * T
  const rest = -Math.PI / 2 - 2 * Math.PI * Math.max(0, Math.round((-spinTotal - Math.PI / 2) / (2 * Math.PI)))
  const e = sstep(slideT / 0.5)
  const rx = air ? -spinX * t : mix(spinTotal, rest, e)
  const rz = air ? spinZ * t : mix(spinZ * T, 0, e)
  // the body turns to lead with its back along the heading of the knock
  const heading = Math.atan2(vx, vz) + Math.PI
  let d = heading - yaw0
  d = Math.atan2(Math.sin(d), Math.cos(d))
  const yaw = yaw0 + d * sstep(tau / 0.16)
  return { x, z, y: air ? y : mix(0.2, 0.1, sstep(slideT / 0.3)), rx, rz, yaw, air, landed: slideT }
}

interface Out {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
  pivot: number
  lying: boolean
}

function poseLive(l: Live, s: number, scene: CutinScene, plan: ActPlan, out: Out): void {
  const { p, rig, actor, fs } = l
  const tp = trackAt(actor.track, s)
  const mounted = !!rig.mount
  p.reset()
  const fx = Math.sin(tp.yaw)
  const fz = Math.cos(tp.yaw)
  out.x = tp.x
  out.z = tp.z
  out.y = 0
  out.rx = 0
  out.ry = tp.yaw
  out.rz = 0
  out.pivot = 0
  out.lying = false
  // the pieces wake with a small bounce as the scene opens
  const wake = clampU((s - 0.15) / 0.45)
  out.y += Math.sin(Math.PI * wake) * 0.04 * (wake > 0 && wake < 1 ? 1 : 0)
  const phase = rand(scene.seed, l.index, 8) * 5
  const dRig = tp.dist / fs + l.index * 0.17
  const vRig = Math.abs(tp.speed) / fs
  applyClip(rig, locomotion(rig, dRig, vRig, s + phase))
  const weapon = p.j('weapon')
  if (weapon) weapon.visible = true
  const cue = cueFor(scene, actor.id, s)
  const act = cue?.cue.action
  const k = cue?.p ?? 0
  const cp = cue?.cue.params ?? {}
  const wob = (amp: number, f: number): number => Math.sin(s * f + l.index * 1.9) * amp
  const sL = p.side('armL')
  const sR = p.side('armR')

  switch (act) {
    case 'brace': {
      // the line sees it coming: spear tips waver, the weight goes back
      const fear = sstep(k * 1.5)
      if (!mounted) {
        p.aim('weapon', v(wob(0.2 * fear, 17), 1, 0.2 + wob(0.2 * fear, 13)), [0, 1, 0])
        p.aim('armR', v(0, 0.2 + 0.5 * fear, 0.8))
        p.aim('armL', v(0.3, -0.3 + 0.7 * fear, 0.6))
        p.rot('torso', -0.22 * fear + wob(0.05 * fear, 21), 0, 0)
      } else {
        p.rotH('body', -0.08 * fear, 0, 0)
        p.rotH('neck', 0.15 * fear, 0, 0)
      }
      break
    }
    case 'stagger': {
      const q = clampU(k * 1.6)
      if (!mounted) {
        applyClip(rig, stagger(q))
        pArmsUp(p, 0.55 + 0.35 * q, 1.0)
        p.rot('torso', -0.3 + 0.1 * q + wob(0.08, 9), wob(0.2, 7) * q, wob(0.1, 8) * q)
        const sh = staggerShift(q) * fs
        out.x -= fx * sh
        out.z -= fz * sh
      } else {
        pRear(p, bell(k, 0, 0.3, 0.6, 1))
        out.x -= fx * 0.05 * sstep(k)
        out.z -= fz * 0.05 * sstep(k)
      }
      break
    }
    case 'wary': {
      // after the blow: the survivors hold, a little shaken
      if (!mounted) {
        pArmsUp(p, 0.4, 0.9)
        p.rot('torso', -0.18 + wob(0.05, 6), wob(0.1, 5), 0)
        p.aim('weapon', v(wob(0.2, 11), 1, 0.2), [0, 1, 0])
      }
      const sh = staggerShift(1) * fs
      out.x -= fx * sh
      out.z -= fz * sh
      break
    }
    case 'cover': {
      // hands to the ears, hunched; the weapon is dropped
      const e = sstep(k * 4)
      if (!mounted) {
        p.aim('armL', v(sL * 0.12, 1, 0.25 * e))
        p.aim('armR', v(sR * 0.12, 1, 0.25 * e))
        p.rot('torso', 0.28 * e + wob(0.04, 19), wob(0.06, 17), wob(0.05, 15))
        p.rot('head', 0.2 * e, 0, 0)
        if (weapon && k > 0.12) weapon.visible = false
      } else {
        p.rotH('neck', 0.2 * e, 0, 0)
        if (weapon && k > 0.12) weapon.visible = false
      }
      break
    }
    case 'dizzy': {
      const e = sstep(k * 3)
      if (!mounted) {
        pArmsUp(p, 0.15 * e, 0.5)
        p.rot('torso', 0.1 * e, 0, Math.sin(s * 4.6 + l.index) * 0.2 * e)
        p.rot('head', Math.sin(s * 5.1 + l.index * 2) * 0.12 * e, Math.sin(s * 3.3 + l.index) * 0.3 * e, Math.sin(s * 4.2) * 0.18 * e)
        out.x += Math.sin(s * 3.1 + l.index * 1.3) * 0.02 * e
        if (weapon) weapon.visible = k < 0.2
      } else {
        p.rotH('neck', Math.sin(s * 4 + l.index) * 0.2 * e, 0, 0)
        out.x += Math.sin(s * 3.1 + l.index * 1.3) * 0.03 * e
      }
      break
    }
    case 'rear': {
      pRear(p, bell(k, 0, 0.3, 0.7, 1))
      out.x -= fx * 0.04 * sstep(k)
      out.z -= fz * 0.04 * sstep(k)
      break
    }
    case 'topple': {
      // a horse goes over on its side with its rider
      const up = sstep(k * 2.4)
      pRear(p, bell(k, 0, 0.25, 0.4, 0.62))
      const roll = sstep((k - 0.4) / 0.4)
      const side = rand(scene.seed, l.index, 12) < 0.5 ? 1 : -1
      out.rz = side * (Math.PI / 2) * roll
      out.y += 0.1 * roll
      out.x += side * 0.08 * roll
      void up
      break
    }
    case 'fling':
    case 'fall': {
      const tau = s - cue!.cue.start
      const params = act === 'fall' ? { vx: 0, vy: 0.55, vz: 0.5 + Number(cp.dz ?? 0.1) * 3, sx: 5, sz: 0 } : cp
      const st = flingAt(params, tp.x, tp.z, tp.yaw, tau)
      out.x = st.x
      out.z = st.z
      out.y = st.y - 0.2
      out.pivot = 0.2
      out.rx = st.rx
      out.rz = st.rz
      out.ry = st.yaw
      out.lying = !st.air
      const flail = st.air ? 1 : 1 - sstep(st.landed / 0.5)
      const spread = st.air ? 0.35 : 0.35 + 0.65 * sstep(st.landed / 0.5)
      if (!mounted) {
        const lie = limbsOnly(fallBack(spread)).pose
        const loose = (f: number, ph: number): number => Math.sin(tau * f + ph + l.index) * flail
        applyClip(rig, {
          pose: {
            ...lie,
            legL: { r: [0.9 * loose(13, 0) + (lie.legL?.r?.[0] ?? 0), 0, (lie.legL?.r?.[2] ?? 0) - 0.2 * flail] },
            legR: { r: [-0.9 * loose(11, 1.3) + (lie.legR?.r?.[0] ?? 0), 0, (lie.legR?.r?.[2] ?? 0) + 0.2 * flail] },
            torso: { r: [-0.3 * flail + 0.25 * loose(7, 2), 0, 0.2 * loose(9, 0.5)] },
          },
        })
        if (flail > 0.01) pArmsUp(p, flail, 1.0)
        p.rot('head', st.air ? -0.3 : 0, 0, 0)
      } else {
        pRear(p, bell(Math.min(1, tau / 0.9), 0, 0.2, 0.4, 0.6))
        out.pivot = 0
        out.y = 0.08 * sstep(tau / 0.4)
        out.rx = 0
        out.rz = Number(cp.sx ?? 8) > 0 ? (Math.PI / 2) * sstep((tau - 0.25) / 0.4) : -(Math.PI / 2) * sstep((tau - 0.25) / 0.4)
        out.ry = tp.yaw
        out.x = tp.x + (st.x - tp.x) * 0.3
        out.z = tp.z + (st.z - tp.z) * 0.3
      }
      break
    }
    case 'windup':
    case 'strike':
    case 'recover': {
      const trail = (String(cp.trail ?? plan.weapon) as 'x' | 'arc' | 'line') ?? 'line'
      if (l.hero) {
        if (act === 'windup') poseStrike(p, trail, k, 0, 1)
        else if (act === 'strike') poseStrike(p, trail, 1, k, 1)
        else poseStrike(p, trail, 1, 1, 1 - sstep(k * 1.4))
        if (mounted) {
          const gal = sstep(vRig / 3)
          p.rot('torso', 0.1 * gal, 0, 0)
        }
      } else {
        // troops: a thrust of the spear (or the lance couched)
        if (act === 'strike' && !mounted) {
          applyClip(rig, mixClip(locomotion(rig, dRig, vRig, s + phase), thrust(clampU(k * 0.9)), 0.85))
        }
      }
      break
    }
    case 'breath': {
      const e = sstep(k)
      p.rot('torso', -0.14 * e, 0, 0)
      p.rot('head', 0.08 * e, 0, 0)
      const sc = 1 + 0.09 * e
      const t = p.j('torso')
      if (t) t.scale.set(sc, sc, sc)
      p.aim('armL', v(sL * (0.25 + 0.3 * e), -1, 0.05))
      p.aim('armR', v(sR * (0.25 + 0.3 * e), -1, 0.05))
      break
    }
    case 'roar': {
      const e = sstep(k * 3) * (1 - sstep((k - 0.75) / 0.25))
      const t = p.j('torso')
      if (t) t.scale.setScalar(1 + 0.1 * e)
      p.rot('torso', 0.2 * e - 0.1 * (1 - e), 0, 0)
      p.rot('head', -0.3 * e, 0, 0)
      p.aim('armL', v(sL * 0.95, 0.2 * e - 0.8 * (1 - e), 0.15))
      p.aim('armR', v(sR * 0.95, 0.2 * e - 0.8 * (1 - e), 0.15))
      p.rot('beard', 0.4 * e, 0, 0)
      p.rot('cape', 0.5 * e, 0, 0)
      break
    }
    case 'cheer': {
      if (!mounted) pArmsUp(p, 0.8 + 0.2 * Math.sin(s * 9 + l.index), 0.9)
      break
    }
    case 'gesture': {
      if (weapon) weapon.visible = false
      const off = p.j('offhand')
      if (off) off.visible = false
      if (scene.id === 'W') {
        const e = sstep(k * 1.6)
        p.aim('armR', v(sR * (0.3 + 0.4 * e), -1 + 1.95 * e, 0.15 * e))
        p.aim('armL', v(sL * (0.3 + 0.4 * e), -1 + 1.95 * e, 0.15 * e))
        p.rot('head', -0.25 * e, 0, 0)
        p.rot('torso', -0.08 * e, 0, 0)
        p.rot('cape', 0.3 * e + Math.sin(s * 6) * 0.15 * e, 0, 0)
      } else {
        const e = sstep(k * 1.4)
        const sweep = Math.sin(Math.PI * clampU(k * 1.2)) * 0.4
        p.aim('armR', v(sR * (0.3 - 0.3 * e + sweep), -0.4 + 0.45 * e, 0.2 + 0.8 * e))
        p.aim('armL', v(-sL * 0.3, -0.2, 0.5 * e + 0.1))
        p.rot('torso', 0.12 * e, -0.2 * e + sweep * 0.3, 0)
      }
      break
    }
    case 'draw': {
      applyClip(rig, drawBow(clampU(k)))
      break
    }
    case 'loose': {
      applyClip(rig, drawBow(1 - sstep(k * 3)))
      p.rot('torso', 0, 0, 0)
      break
    }
    default: {
      if (act === 'strike' || !act) break
    }
  }
  if (act === 'recover' && l.hero) {
    // after the clash: the cue above handles the pose; nothing more
  }
  // restore the torso scale a breath may have left behind
  if (act !== 'breath' && act !== 'roar') {
    const t = p.j('torso')
    if (t && t.scale.x !== 1) t.scale.set(1, 1, 1)
  }
}

// ---- effects ------------------------------------------------------------------------------------------------------

/** A brush spiral drawn once on a canvas: a cream outline under an ink stroke, so it reads on sand and on dark alike. */
let spiralTex: CanvasTexture | null = null
function spiralTexture(): CanvasTexture {
  if (spiralTex) return spiralTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const draw = (w: number, col: string): void => {
    g.strokeStyle = col
    g.lineWidth = w
    g.beginPath()
    const turns = 2.6 * Math.PI * 2
    for (let i = 0; i <= 90; i++) {
      const th = (i / 90) * turns
      const r = 5 + 52 * (th / turns)
      const x = 64 + Math.cos(th) * r
      const y = 64 + Math.sin(th) * r
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  draw(17, '#efe6d2')
  draw(9, '#14100d')
  spiralTex = keep(new CanvasTexture(c))
  spiralTex.colorSpace = SRGBColorSpace
  return spiralTex
}

function bannerGeometry(): PlaneGeometry {
  return new PlaneGeometry(1, 1, 12, 4)
}

interface BannerLive {
  pole: Group
  cloth: Mesh
  geo: PlaneGeometry
  base: Float32Array
  x: number
  z: number
  ph: number
}

export function ActWorld({ scene }: { scene: CutinScene }) {
  const frame = useFrameRef()
  const plan = scene.act!

  const world = useMemo(() => perf.measure('world-build', () => {
    const { live, mouth } = buildLive(scene, plan)
    const fx = plan.fx
    const spirals = (fx.spirals ?? []).map((sx) => {
      const g = new Sprite(new SpriteMaterial({ map: spiralTexture(), transparent: true, depthWrite: false, depthTest: false }))
      g.renderOrder = 20
      g.visible = false
      return { g, ...sx }
    })
    const ringGeo = new RingGeometry(0.93, 1, 96, 1, -Math.PI / 2 - 1.75, 3.5).rotateX(-Math.PI / 2)
    const ringGeoCream = new RingGeometry(0.985, 1.07, 96, 1, -Math.PI / 2 - 1.75, 3.5).rotateX(-Math.PI / 2)
    const rings = (fx.rings ?? []).map((r) => {
      const ink = new Mesh(ringGeo, new MeshBasicMaterial({ color: '#14100d', transparent: true, depthWrite: false, side: DoubleSide }))
      const cream = new Mesh(ringGeoCream, new MeshBasicMaterial({ color: '#efe6d2', transparent: true, depthWrite: false, side: DoubleSide }))
      ink.visible = false
      cream.visible = false
      ink.renderOrder = 4
      cream.renderOrder = 3
      return { ...r, ink, cream }
    })
    const trails = fx.trail ? [new Ribbon(40, '#f4e7d0'), new Ribbon(40, '#f4e7d0')] : []
    const arrows: { prop: ArrowProp; a: NonNullable<typeof fx.arrows>[number] }[] = (fx.arrows ?? []).map((a) => {
      const prop = makeArrowProp(0.3)
      prop.group.scale.setScalar(2.2)
      prop.group.visible = false
      return { prop, a }
    })
    const poles = fx.wind?.poles ?? []
    const pole = new MeshStandardMaterial({ color: '#4a2f1c', roughness: 0.8 })
    const clothCol = new Color(plan.hero ? (plan.hero.palette === 'han' ? '#2f6b5e' : plan.hero.palette === 'yellow' ? '#d4a72c' : plan.hero.palette === 'cao' ? '#34495e' : plan.hero.palette === 'dong' ? '#6b1f2a' : plan.hero.palette === 'court' ? '#5d5a52' : '#5b2c6f') : '#2f6b5e')
    const banners: BannerLive[] = poles.map(([x, z], i) => {
      const g = new Group()
      g.position.set(x, 0, z)
      const post = new Mesh(new CylinderGeometry(0.012, 0.016, 0.95, 6).translate(0, 0.475, 0), pole)
      post.castShadow = true
      g.add(post)
      const cloth = new Mesh(bannerGeometry(), new MeshStandardMaterial({ color: i % 2 ? '#c8372d' : clothCol, side: DoubleSide, roughness: 0.8 }))
      cloth.castShadow = true
      g.add(cloth)
      const geo = cloth.geometry as PlaneGeometry
      return { pole: g, cloth, geo, base: new Float32Array(geo.attributes.position!.array as Float32Array), x, z, ph: i * 1.3 }
    })
    const altar = fx.wind ? new Group() : null
    if (altar) {
      const top = new Mesh(new BoxGeometry(0.7, 0.05, 0.3).translate(0, 0.19, 0), new MeshStandardMaterial({ color: '#5a2418', roughness: 0.6 }))
      const legs = [-0.3, 0.3].map((x) => new Mesh(new BoxGeometry(0.05, 0.19, 0.24).translate(x, 0.095, 0), new MeshStandardMaterial({ color: '#3a1810' })))
      const burner = new Mesh(new CylinderGeometry(0.05, 0.035, 0.07, 10).translate(0, 0.25, 0), new MeshStandardMaterial({ color: '#a07a3a', metalness: 0.7, roughness: 0.4 }))
      const lid = new Mesh(new ConeGeometry(0.04, 0.05, 10).translate(0, 0.3, 0), new MeshStandardMaterial({ color: '#a07a3a', metalness: 0.7, roughness: 0.4 }))
      altar.add(top, ...legs, burner, lid)
      altar.position.set(fx.wind!.altar[0], 0, fx.wind!.altar[1])
    }
    const ranks = buildActRanks(scene, plan)
    for (const a of ranks.arrows) {
      const prop = makeArrowProp(0.3)
      prop.group.scale.setScalar(2.2)
      prop.group.visible = false
      arrows.push({ prop, a })
    }
    const buf = {
      dust: new ParticleBuffer(1200, 'alpha', 0.9),
      smoke: new ParticleBuffer(520, 'alpha', 0.8),
      sparks: new ParticleBuffer(160, 'add', 2.2),
    }
    // set dressing stays off the figures and out of the near part of every low shot (stage/lens.ts)
    const millet = plan.ground.kind === 'millet'
    const clear = [
      ...plan.actors.filter((a) => a.group === 'def').map((a) => ({ x: a.track.start[0], z: a.track.start[1], r: 0.3 })),
      ...memberSpots(ranks.def).map((q) => ({ ...q, r: 0.22 })),
      ...memberSpots(ranks.atk).map((q) => ({ ...q, r: 0.22 })),
      ...scene.shots.flatMap((sh) => sh.keys.filter((k) => k.pos[1] < 2).map((k) => ({ x: k.pos[0], z: k.pos[2], r: 0.8 }))),
    ]
    const lens = lensClear(scene, millet ? { reach: 1.1, maxY: 0.7 } : { reach: 2.2, maxY: 1.4 })
    // the action lane through a field: thinner, half-height stalks wherever a figure runs or rides
    const low = millet
      ? plan.actors.flatMap((a) => Array.from({ length: Math.ceil(scene.duration / 0.1) + 1 }, (_, k) => trackAt(a.track, k * 0.1)).map((q) => ({ x: q.x, z: q.z, r: 0.45 })))
      : []
    // the background battle around it all: clear of every track, every rank's path, the flung, the props and the lens
    const steps = Math.ceil(scene.duration / 0.1) + 1
    const lanes = [
      ...plan.actors.flatMap((a) => Array.from({ length: steps }, (_, k) => trackAt(a.track, k * 0.1)).map((q) => ({ x: q.x, z: q.z, r: 0.85 }))),
      ...scene.cues
        .filter((c) => c.action === 'fling' && c.params)
        .flatMap((c) => {
          const a = plan.actors.find((x) => x.id === c.actor)
          if (!a) return []
          const vx = Number(c.params!.vx ?? 0)
          const vz = Number(c.params!.vz ?? 1.5) * (a.track.yaw === 0 ? 1 : Math.cos(a.track.yaw) < 0 ? 1 : -1)
          return [0.5, 1, 1.5].map((k) => ({ x: a.track.start[0] + vx * 0.5 * k, z: a.track.start[1] + vz * 0.5 * k, r: 0.9 }))
        }),
      ...crowdLanes(ranks.crowds, scene.duration + 0.3, 0.6),
      ...(fx.wind ? [...fx.wind.poles.map(([x, z]) => ({ x, z, r: 0.5 })), { x: fx.wind.altar[0], z: fx.wind.altar[1], r: 0.7 }] : []),
      ...lensClear(scene, { reach: 3.0, maxY: 2.2 }),
    ]
    const full = SCENE_INFO[scene.id].full
    const starts = plan.actors.map((a) => a.track.start)
    const cx = starts.reduce((a, q) => a + q[0], 0) / Math.max(1, starts.length)
    const cz = starts.reduce((a, q) => a + q[1], 0) / Math.max(1, starts.length)
    const p = scene.params
    const melee = backgroundMelee({
      seed: scene.seed + 77,
      center: [cx, cz],
      sides: meleeSides(p?.caster.palette ?? 'han', p ? defenderOf(p).palette : 'yellow'),
      knots: full ? 22 : 10,
      riders: full ? 3 : 1,
      runners: full ? 4 : 2,
      banners: full ? 2 : 1,
      rMin: 1.4,
      rMax: full ? 8.0 : 6.2,
      duration: scene.duration + 0.5,
      exclude: lanes,
    })
    const heroes = live.filter((l) => l.hero).length
    publishTroops(scene.id, live.filter((l) => l.actor.group === 'atk').length + heroes + ranks.crowds.members(ranks.atk), live.filter((l) => l.actor.group === 'def').length + ranks.crowds.members(ranks.def), ranks.crowds, melee)
    return { live, mouth, spirals, rings, trails, arrows, banners, altar, buf, clear, ringGeo, ringGeoCream, ranks, lens, low, melee }
  }), [scene, plan])

  useDisposeWorld(world, () => {
    world.live.forEach((l) => l.rig.dispose())
    world.ranks.crowds.dispose()
    world.melee?.dispose()
    Object.values(world.buf).forEach((b) => b.dispose())
    world.ringGeo.dispose()
    world.ringGeoCream.dispose()
  })

  const tmp = useMemo(() => ({ out: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, pivot: 0, lying: false } as Out, a: new Vector3(), b: new Vector3() }), [])

  useCutinFrame(({ camera, gl }) => {
    const { story: s } = frame.current
    const fx = plan.fx
    const ppu = pxPerUnit(gl.domElement.height, (camera as { fov?: number }).fov ?? 40)
    const { live, spirals, rings, trails, arrows, banners, buf, mouth } = world
    const o = tmp.out

    // --- figures
    world.ranks.crowds.update(s)
    world.melee?.update(s, ppu)
    for (const l of live) {
      poseLive(l, s, scene, plan, o)
      l.holder.position.set(o.x, o.y + o.pivot, o.z)
      l.holder.rotation.set(o.rx, o.ry, o.rz)
      l.rig.group.position.set(0, -o.pivot, 0)
    }
    // --- the roar's open mouth
    if (mouth && fx.roar) {
      const open = sstep((s - fx.roar.from) / 0.12) * (1 - sstep((s - fx.roar.to) / 0.2))
      mouth.scale.set(0.05 * open + 0.0001, 0.058 * open + 0.0001, 0.024 * open + 0.0001)
    }
    // --- brush spirals over the dizzy
    for (const sp of spirals) {
      const l = live.find((x) => x.actor.id === sp.actor)
      if (!l) continue
      const e = sstep((s - sp.from) / 0.25)
      const c = cueFor(scene, sp.actor, s)
      const down = c && (c.cue.action === 'fall' || c.cue.action === 'fling' || c.cue.action === 'topple')
      sp.g.visible = e > 0.01 && !down
      if (!sp.g.visible) continue
      // the head top, not the spear tip: rig.height counts the weapon
      const top = (l.rig.mount ? 0.52 : 0.31) * (l.fs / 0.52)
      sp.g.position.set(l.holder.position.x, l.holder.position.y + top + 0.08 + Math.sin(s * 3 + l.index) * 0.012, l.holder.position.z)
      sp.g.material.rotation = -(s * 6.5 + l.index)
      sp.g.scale.setScalar(e * 0.22)
      sp.g.material.opacity = 0.95 * e
    }
    // --- shockwave rings
    for (const r of rings) {
      const age = s - r.t0
      const on = age > 0 && age < r.life
      r.ink.visible = on
      r.cream.visible = on
      if (!on) continue
      const rad = Math.max(0.05, age * r.speed)
      const a = Math.min(1, age / 0.08) * Math.pow(1 - age / r.life, 0.8)
      for (const m of [r.ink, r.cream]) {
        m.position.set(r.origin[0], r.origin[1] + (m === r.cream ? -0.002 : 0), r.origin[2])
        m.scale.set(rad, 1, rad)
      }
      ;(r.ink.material as MeshBasicMaterial).opacity = 0.78 * a
      ;(r.cream.material as MeshBasicMaterial).opacity = 0.55 * a
    }
    // --- the weapon trail of the strike
    if (fx.trail && trails.length) {
      const tr = fx.trail
      const age = s - tr.t0
      const head = clampU(age / 0.2)
      const fade = age < 0 ? 0 : 1 - sstep((age - 0.2) / 0.5)
      const N = trails[0]!.count
      const hy = plan.heroMounted ? 0.1 : 0
      const pathPt = (kind: string, which: number, u: number, out: Vector3): void => {
        if (kind === 'x') {
          const sg = which === 0 ? 1 : -1
          out.set(sg * (0.6 - 1.2 * u), 0.58 - 0.5 * u + Math.sin(Math.PI * u) * 0.06 + hy, 0.3 + 0.55 * u)
        } else if (kind === 'arc') {
          const ph = -1.25 + 2.5 * u
          out.set(Math.sin(ph) * 0.82, 0.22 + 0.16 * u + hy, 0.2 + Math.cos(ph) * 0.82)
        } else {
          out.set(0.0, 0.3 + hy + (which === 0 ? 0 : 0.012), 0.3 + 1.6 * u)
        }
      }
      trails.forEach((rb, which) => {
        const show = fade > 0.01 && (tr.kind === 'x' || which === 0 || tr.kind === 'line')
        for (let i = 0; i < N; i++) {
          const q = i / (N - 1)
          const u = head * q
          pathPt(tr.kind, which, u, tmp.a)
          pathPt(tr.kind, which, Math.min(1, u + 0.02), tmp.b)
          // outer edge: pushed out from the centre line by the strip width (thicker toward the head)
          const w = tr.kind === 'line' ? 0.035 : tr.kind === 'arc' ? 0.14 : 0.075
          const inner = tmp.a.clone()
          const outer = tmp.a.clone()
          if (tr.kind === 'arc') {
            const ph = -1.25 + 2.5 * u
            outer.x += Math.sin(ph) * w * q
            outer.z += Math.cos(ph) * w * q
            inner.x -= Math.sin(ph) * w * 0.3 * q
            inner.z -= Math.cos(ph) * w * 0.3 * q
          } else {
            outer.y += w * (0.3 + q)
            inner.y -= w * 0.3 * q
          }
          // to world: the hero stands at tr.at, facing tr.yaw
          for (const pt of [inner, outer]) {
            const x = pt.x * Math.cos(tr.yaw) + pt.z * Math.sin(tr.yaw)
            const z = -pt.x * Math.sin(tr.yaw) + pt.z * Math.cos(tr.yaw)
            pt.set(tr.at[0] + x, pt.y, tr.at[1] + z)
          }
          rb.set(i, inner, outer, show ? fade * Math.pow(q, 1.3) * 0.95 : 0)
        }
        rb.commit(show)
      })
    }
    // --- arrows of a volley
    arrows.forEach(({ prop, a }) => {
      const flying = s >= a.launch
      prop.group.visible = flying
      if (!flying) return
      const q = clampU((s - a.launch) / (a.land - a.launch))
      const x = a.from[0] + (a.to[0] - a.from[0]) * q
      const z = a.from[2] + (a.to[2] - a.from[2]) * q
      const y = a.from[1] + (a.to[1] - a.from[1]) * q + 4 * a.apex * q * (1 - q)
      const q2 = Math.min(1.002, q + 0.01)
      const x2 = a.from[0] + (a.to[0] - a.from[0]) * q2
      const z2 = a.from[2] + (a.to[2] - a.from[2]) * q2
      const y2 = a.from[1] + (a.to[1] - a.from[1]) * q2 + 4 * a.apex * q2 * (1 - q2)
      const dir = tmp.b.set(x2 - x, y2 - y, z2 - z).normalize()
      if (q >= 1) {
        dir.set(0.1, -0.9, 0.35).normalize()
        tmp.a.set(a.to[0], a.to[1] + 0.3, a.to[2])
      } else tmp.a.set(x, y, z).addScaledVector(dir, -0.3)
      placeArrow(prop, tmp.a, dir, 0)
    })
    // a faint streak behind each arrow in flight
    buf.sparks.begin(ppu)
    for (const { a } of arrows) {
      if (s < a.launch || s > a.land + 0.04) continue
      for (let k = 0; k < 7; k++) {
        const q = clampU((s - a.launch - k * 0.018) / (a.land - a.launch))
        const x = a.from[0] + (a.to[0] - a.from[0]) * q
        const z = a.from[2] + (a.to[2] - a.from[2]) * q
        const y = a.from[1] + (a.to[1] - a.from[1]) * q + 4 * a.apex * q * (1 - q)
        buf.sparks.push(x, y, z, 0.03 * (1 - k / 8), 0.95, 0.9, 0.75, 0.5 * (1 - k / 7))
      }
    }
    // --- banners and incense (scene W)
    if (fx.wind) {
      const w = fx.wind
      const head = w.dir ?? 0
      const calm = w.dir === null
      const gust = calm ? 0.1 * (1 - sstep((s - w.t0) / 0.5)) : sstep((s - w.t0) / 0.7)
      const swing = sstep((s - w.t0) / 0.9)
      // before the turn the cloth streams the other way, weakly; it whips round to the new heading
      const dir0 = head + Math.PI * 0.8
      const dirNow = calm ? dir0 : dir0 + (head - dir0) * swing + Math.sin(Math.PI * swing) * 0.9
      const f = calm ? gust : 0.16 + 0.84 * gust
      for (const b of banners) {
        const L = 0.46
        const H = 0.26
        const pos = b.geo.attributes.position!
        const wx = Math.sin(dirNow)
        const wz = Math.cos(dirNow)
        const nx = -wz
        const nz = wx
        for (let i = 0; i < pos.count; i++) {
          const u = b.base[i * 3]! + 0.5 // 0..1 along the flag
          const vv = b.base[i * 3 + 1]! // -0.5..0.5 across
          const wave = Math.sin(u * 8.5 - s * (7 + 9 * f) + b.ph) * 0.04 * u * (0.2 + f)
          const along = u * L
          // streaming: along the wind, width vertical; limp: hangs down, width horizontal
          const px = wx * along * f + nx * (vv * H * (1 - f)) + nx * wave
          const pz = wz * along * f + nz * (vv * H * (1 - f)) + nz * wave
          const py = 0.88 - along * (1 - f) * 0.9 + vv * H * f
          pos.setXYZ(i, px, py, pz)
        }
        pos.needsUpdate = true
        b.geo.computeVertexNormals()
        b.cloth.position.set(0, 0, 0)
      }
    }

    // --- particles
    // dust under running feet
    buf.dust.begin(ppu)
    if (fx.dust) {
      for (const l of live) {
        const c0 = trackAt(l.actor.track, s)
        const sp = Math.abs(c0.speed)
        const cue = cueFor(scene, l.actor.id, s)
        if (sp < 1.0 || (cue && (cue.cue.action === 'fling' || cue.cue.action === 'fall'))) continue
        const mounted = !!l.rig.mount
        for (let k = 0; k < (mounted ? 5 : 3); k++) {
          const age = (s * 4.2 + k / (mounted ? 5 : 3) + rand(scene.seed, l.index, k) * 0.2) % 1
          const back = trackAt(l.actor.track, s - age * 0.5)
          const u = age
          const a = Math.min(1, sp / 3) * 0.42 * (1 - u) ** 1.3
          buf.dust.push(back.x + srand(scene.seed, l.index * 7 + k, 2) * 0.06, 0.03 + u * 0.12, back.z + srand(scene.seed, l.index * 7 + k, 3) * 0.06, (0.07 + 0.2 * u) * (mounted ? 1.3 : 1), 0.8, 0.67, 0.47, a)
        }
      }
      // the ranks: a trailing puff under everyone running
      for (const c of world.ranks.crowds.list) {
        const mounted = c.kind === 'cavalry'
        for (const m of c.members) {
          const f = c.frame(m.index)
          if (f.speed < 0.9 || (f.state !== 'march' && f.state !== 'fled')) continue
          c.positionOf(m.index, tmp.a, true)
          const hx = Math.sin(m.heading + c.group.rotation.y)
          const hz = Math.cos(m.heading + c.group.rotation.y)
          for (let k = 0; k < 2; k++) {
            const u = (s * 3.4 + k / 2 + rand(scene.seed, m.index + 400, k) * 0.3) % 1
            const back = u * 0.32 * Math.min(1, f.speed / 2.5)
            buf.dust.push(tmp.a.x - hx * back + srand(scene.seed, m.index * 5 + k, 61) * 0.05, 0.03 + u * 0.1, tmp.a.z - hz * back, (0.07 + 0.18 * u) * (mounted ? 1.3 : 1), 0.8, 0.67, 0.47, Math.min(1, f.speed / 3) * 0.36 * (1 - u) ** 1.3)
          }
        }
      }
      // a puff where each knocked figure leaves its feet
      for (const l of live) {
        const c = cueFor(scene, l.actor.id, s)
        if (!c || (c.cue.action !== 'fling' && c.cue.action !== 'fall')) continue
        const t0 = c.cue.start
        const tp = trackAt(l.actor.track, t0)
        for (let k = 0; k < 14; k++) {
          const bp = burstPosition(scene.seed + 5, l.index * 40 + k, t0, s, [tp.x, 0.05, tp.z], 1.2, 0.8, 0.85)
          if (!bp) continue
          buf.dust.push(bp.p[0], bp.p[1] + 0.03, bp.p[2], 0.14 + 0.26 * bp.u, 0.82, 0.7, 0.5, 0.42 * (1 - bp.u) ** 1.1)
        }
      }
    }
    // dust lifted along the shockwave rings
    for (const r of rings) {
      const age = s - r.t0
      if (age < 0 || age > r.life) continue
      const rad = age * r.speed
      for (let k = 0; k < 34; k++) {
        const phi = (k / 33 - 0.5) * 3.4 + srand(scene.seed, k, 41) * 0.05
        const jitter = srand(scene.seed, k * 3 + Math.round(r.t0 * 10), 42) * 0.12
        const u = clampU(age / r.life)
        buf.dust.push(r.origin[0] + Math.sin(phi) * (rad + jitter), 0.03 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.4)) + rand(scene.seed, k, 43) * 0.05, r.origin[2] + Math.cos(phi) * (rad + jitter), 0.1 + 0.16 * u, 0.82, 0.7, 0.52, 0.5 * (1 - u) ** 1.2 * Math.min(1, age / 0.1))
      }
    }
    buf.dust.end()
    // ink smoke (R) and incense (W)
    buf.smoke.begin(ppu)
    if (fx.smoke) {
      const m = fx.smoke
      const cfg: SlotConfig = { seed: scene.seed + 40, count: 190, period: 1.8, start: m.t0, end: m.t0 + 1.1, lifeMin: 1.2 }
      for (let i = 0; i < cfg.count; i++) {
        const sl = sampleSlot(cfg, i, s)
        if (!sl.alive) continue
        const travel = clampU(sl.age / (m.dur * 0.75))
        const e = sstep(travel)
        const sw = Math.sin(sl.age * 5 + i) * 0.1 * (1 - e)
        const x = m.from[0] + (m.to[0] - m.from[0]) * e + sw + srand(scene.seed, i, 5) * 0.2 * e
        const y = m.from[1] + (m.to[1] - m.from[1]) * e + 0.1 * Math.sin(sl.age * 3 + i * 2) + sl.u * 0.12
        const z = m.from[2] + (m.to[2] - m.from[2]) * e + srand(scene.seed, i, 6) * 0.12
        const grow = 0.07 + 0.3 * Math.min(1, sl.age / 0.9)
        const a = 0.55 * Math.sin(Math.PI * Math.min(1, sl.u * 1.1)) * (0.5 + 0.5 * sstep((s - m.t0) / 0.3))
        buf.smoke.push(x, y, z, grow * 0.8, 0.14, 0.11, 0.1, a * 0.7)
      }
    }
    if (fx.wind) {
      const w = fx.wind
      const bx = w.altar[0]
      const bz = w.altar[1]
      const cfg: SlotConfig = { seed: scene.seed + 41, count: 120, period: 2.4, start: 0, end: 99, lifeMin: 1.6 }
      const head = w.dir ?? 0
      const wx = Math.sin(head)
      const wz = Math.cos(head)
      const gust = w.dir === null ? 0 : sstep((s - w.t0) / 0.8)
      for (let i = 0; i < cfg.count; i++) {
        const sl = sampleSlot(cfg, i, s)
        if (!sl.alive) continue
        const age = sl.age
        const drift = 0.05 + gust * 0.7
        const x = bx + (srand(scene.seed, i, 2) * 0.02 + wx * drift * age * age) * (1 + age * 0.3)
        const z = bz + srand(scene.seed, i, 3) * 0.02 + wz * drift * age * age
        const y = 0.34 + age * 0.22 + Math.sin(age * 3 + i) * 0.02
        buf.smoke.push(x, y, z, 0.05 + 0.2 * sl.u, 0.78, 0.74, 0.68, 0.28 * Math.sin(Math.PI * Math.min(1, sl.u * 1.1)))
      }
    }
    buf.smoke.end()
    // sparks at the clash
    if (fx.trail) {
      const tr = fx.trail
      for (let k = 0; k < 40; k++) {
        const bp = burstPosition(scene.seed + 6, k, tr.t0, s, [tr.at[0] + srand(scene.seed, k, 2) * 0.3, 0.3, tr.at[1] + 0.6], 2.6, 5, 0.5)
        if (!bp) continue
        buf.sparks.push(bp.p[0], bp.p[1], bp.p[2], 0.02, 1, 0.85, 0.55, 0.9 * (1 - bp.u))
      }
    }
    buf.sparks.end()
  })

  const g = plan.ground
  return (
    <group>
      <Stage seed={scene.seed} focus={plan.focus} keyDir={[-4.5, 8, -6.5]} rimDir={[5, 3.5, 7]} motes={110} moteStrength={0.5} />
      <Ground kind={g.kind} seed={g.seed} center={g.center} halfW={g.halfW} halfD={g.halfD} clear={world.clear} lens={world.lens} low={world.low} wind={[1, 0]} />
      <primitive object={world.ranks.crowds.group as Object3D} />
      {world.melee && <primitive object={world.melee.group as Object3D} />}
      {world.altar && <primitive object={world.altar as Object3D} />}
      {world.banners.map((b, i) => (
        <primitive key={`b${i}`} object={b.pole as Object3D} />
      ))}
      {world.live.map((l) => (
        <primitive key={l.actor.id} object={l.holder as Object3D} />
      ))}
      {world.spirals.map((sp, i) => (
        <primitive key={`s${i}`} object={sp.g as Object3D} />
      ))}
      {world.rings.map((r, i) => (
        <group key={`r${i}`}>
          <primitive object={r.cream as Object3D} />
          <primitive object={r.ink as Object3D} />
        </group>
      ))}
      {world.trails.map((t, i) => (
        <primitive key={`t${i}`} object={t.mesh as Object3D} />
      ))}
      {world.arrows.map((a, i) => (
        <primitive key={`a${i}`} object={a.prop.group as Object3D} />
      ))}
      {Object.entries(world.buf).map(([k, f]) => (
        <primitive key={k} object={f.points as Object3D} />
      ))}
      <pointLight position={[0, 1.2, plan.focus[1]]} color="#ffb070" intensity={0.5} distance={7} decay={2} />
      <PadLights n={POINT_LIGHTS - 1} />
    </group>
  )
}

void AdditiveBlending
void idle
