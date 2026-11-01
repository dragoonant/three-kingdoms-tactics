// Scene B world: Guan Yu and three Han cavalry in a wedge, seven rebels in a ragged line, dust and the crescent sweep.
// Poses and particles are pure functions of story time; the plan (paths, who falls when) lives in thunderingCharge.ts.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CylinderGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three'
import { figures, type Rig } from '../../figures'
import { burstPosition, sampleSlot, type SlotConfig } from '../particles'
import { applyClip, fallBack, idle, locomotion, mix as mixClip, stagger, staggerShift, stepTurn } from '../../figures/clips'
import { Puppet, figureScale, fitFigure, limbsOnly, mix, pArmsUp, pRear, sstep } from '../poseKit'
import { Ribbon } from '../props'
import { rand, srand } from '../rng'
import { ParticleBuffer } from '../stage/ParticleBuffer'
import { Stage, pxPerUnit, useFrameRef } from '../stage/Stage'
import { cueFor, type CutinScene } from '../timeline'
import {
  B_LAYOUT,
  B_SEED,
  FLING_GRAVITY,
  SWEEP,
  contactTime,
  dropper,
  flingPlan,
  footfalls,
  leaderAt,
  rebelLine,
  riderAt,
  riderDist,
  riderSpeed,
  sweepAngle,
  type FlingPlan,
} from './thunderingCharge'

const clampU = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const bell = (s: number, a: number, b: number, c: number, d: number): number => sstep((s - a) / (b - a)) * (1 - sstep((s - c) / (d - c)))

interface Rider {
  id: string
  rig: Rig
  p: Puppet
  m: number
}

interface RebelActor {
  holder: Group
  rig: Rig
  p: Puppet
  x: number
  z: number
  i: number
}

function makeRiders(): Rider[] {
  return [0, 1, 2, 3].map((m) => {
    const rig = m === 0 ? figures.buildHero('guan-yu') : figures.buildTroop('cavalry', 'han', m)
    fitFigure(rig)
    return { id: m === 0 ? 'guan-yu' : `cav${m}`, rig, p: new Puppet(rig), m }
  })
}

function makeRebels(): RebelActor[] {
  return Array.from({ length: B_LAYOUT.rebelCount }, (_, i) => {
    const rig = figures.buildTroop('rebel', 'yellow', i)
    fitFigure(rig)
    const holder = new Group()
    holder.rotation.order = 'YXZ'
    holder.add(rig.group)
    const [x, z] = rebelLine(i)
    return { holder, rig, p: new Puppet(rig), x, z, i }
  })
}

function poseRider(r: Rider, s: number, scene: CutinScene): void {
  const { p, rig, m } = r
  const L = riderAt(m, s)
  const g = rig.group
  const speed = L.speed
  const gal = sstep(speed / 2.4)
  const wake = clampU((s - 0.1) / 0.45)
  const hop = Math.sin(Math.PI * wake) * 0.05 * (wake > 0 && wake < 1 ? 1 : 0)
  // the wheel banks the horse into the turn
  const turn = Math.abs(leaderAt(s + 0.05).heading - leaderAt(s - 0.05).heading) / 0.1
  const bank = L.heading > 0.05 && L.heading < 3.1 ? -turn * 0.07 : 0
  g.position.set(L.x, hop, L.z)
  g.rotation.set(0, L.heading, bank)
  p.reset()
  const idleBreath = (1 - gal) * 0.02
  const fs = rig.group.scale.x * (rig.bodyScale ?? 1)
  // the legs run on the distance this rider has covered (rig units): idle, then trot, canter and gallop by speed, hoofbeats planted
  const dRig = riderDist(m, s) / fs + m * 0.21
  const vRig = riderSpeed(m, s) / fs
  applyClip(rig, locomotion(rig, dRig, vRig, s + m * 1.3))
  const lean = 0.08 + 0.26 * gal
  p.rot('torso', lean + idleBreath, 0, 0)
  const sideR = p.side('armR')
  const up = new Vector3(0, 1, 0)
  if (m === 0) {
    // Guan Yu: rears, raises the glaive overhead, couches it for the charge, sweeps, raises it again
    const rear = bell(s, 0.62, 0.98, 1.3, 1.62)
    if (p.mounted) pRear(p, rear)
    p.moveH('body', 0, 0.02 * rear, 0)
    const raise = sstep((s - 0.85) / 0.45)
    const lower = sstep((s - 1.62) / 0.45)
    const sw = cueFor(scene, 'guan-yu', s, 'sweep')
    const sweeping = sw && sw.p > 0 && s < SWEEP.to + 0.25 && s >= SWEEP.from
    const again = sstep((s - 5.35) / 0.4)
    let dir = new Vector3(0, 1, 0.12)
    if (s < 1.62) {
      dir.set(sideR * 0.05, mix(0.9, 1, raise), 0.12)
    } else {
      // couched: pole forward and a little across
      const carry = new Vector3(-sideR * 0.38, 0.5, 0.78)
      dir = new Vector3(0, 1, 0.12).lerp(carry, lower)
      if (s >= 3.3) {
        const a = s < SWEEP.from ? SWEEP.a0 * sstep((s - 3.3) / 0.4) : sweepAngle(s)
        const blend = sstep((s - 3.3) / 0.4)
        const sweepDir = new Vector3(Math.sin(a) * 0.95, 0.14, Math.cos(a) * 0.95)
        dir.lerp(sweepDir, blend)
        p.rot('torso', lean - 0.05, -a * 0.55 * blend, 0)
      }
      if (s > SWEEP.to + 0.2) dir.lerp(new Vector3(-sideR * 0.38, 0.5, 0.78), 0)
      dir.lerp(new Vector3(0, 1, 0.15), again * (s > 5.0 ? 1 : 0))
      void sweeping
    }
    p.aim('armR', new Vector3(dir.x * 0.8 + sideR * 0.3, Math.max(-0.1, dir.y * 0.7), dir.z * 0.8 + 0.1))
    p.aim('weapon', dir, [0, 1, 0])
    p.aim('armL', new Vector3(-sideR * 0.3, -0.4, 0.8))
    p.rot('beard', Math.sin(s * 5.5) * 0.18 + lean * 0.4 + gal * 0.5, 0, Math.sin(s * 3.1) * 0.1)
    p.rot('cape', Math.sin(s * 6 + 1) * 0.12 + gal * 0.6, 0, 0)
    void up
  } else {
    // cavalry: spear couched forward
    const couch = sstep((s - 1.62) / 0.5)
    const dir = new Vector3(0, 1, 0.1).lerp(new Vector3(0, 0.1, 1), couch)
    p.aim('armR', new Vector3(sideR * 0.2, dir.y * 0.4 - 0.1, 0.85))
    p.aim('weapon', dir, [0, 1, 0])
    p.aim('armL', new Vector3(-sideR * 0.25, -0.5, 0.7))
    p.rot('cape', gal * 0.5, 0, 0)
  }
}

interface Spear {
  group: Group
}

function makeSpearProp(): Spear {
  const group = new Group()
  const shaft = new Mesh(new CylinderGeometry(0.008, 0.008, 0.62, 6).translate(0, 0.31, 0), new MeshStandardMaterial({ color: '#7a5a34', roughness: 0.8 }))
  const tip = new Mesh(new ConeGeometry(0.02, 0.07, 5).translate(0, 0.655, 0), new MeshStandardMaterial({ color: '#3a3836', metalness: 0.7, roughness: 0.4 }))
  group.add(shaft, tip)
  group.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true
  })
  return { group }
}

interface FlingState {
  pos: [number, number, number]
  rx: number
  rz: number
  air: boolean
  landed: number
  slide: number
}

/** Ballistic tumble of a flung rebel, then a slide and a rest lying on the sand. All from the plan. */
function flingState(f: FlingPlan, rx0: number, rz0: number, s: number): FlingState {
  const tau = Math.max(0, s - f.t)
  const g = FLING_GRAVITY
  const T = (2 * f.v[1]) / g
  const y0 = 0.22
  const air = tau < T
  const t = Math.min(tau, T)
  const x = rx0 + f.v[0] * t
  const z = rz0 + f.v[2] * t
  const y = y0 + f.v[1] * t - 0.5 * g * t * t
  const slideT = Math.max(0, tau - T)
  const k = 0.22
  const sl = 1 - Math.exp(-slideT / k)
  const ex = f.v[0] * 0.42 * sl
  const ez = f.v[2] * 0.42 * sl
  // spin: a whole number of turns plus the lying-on-the-back rest angle
  const spinTotalX = -f.spin[0] * T
  const restX = -Math.PI / 2 - 2 * Math.PI * Math.max(0, Math.round((-spinTotalX - Math.PI / 2) / (2 * Math.PI)))
  const spinZ = f.spin[1] * T
  const restZ = 0
  let rx: number
  let rz: number
  if (air) {
    rx = -f.spin[0] * t
    rz = f.spin[1] * t
  } else {
    const e = sstep(slideT / 0.5)
    rx = mix(spinTotalX, restX, e)
    rz = mix(spinZ, restZ, e)
  }
  // the body lies on its back on the sand: its axis rides the thickness of the chest above it
  const ground = air ? y : mix(0.2, 0.1, sstep(slideT / 0.3))
  return { pos: [x + ex, Math.max(0.1, ground), z + ez], rx, rz, air, landed: slideT, slide: sl }
}

function poseRebel(a: RebelActor, s: number, scene: CutinScene, falls: FlingPlan[], drop: number, dropSpear: Spear): void {
  const { p, holder, rig, i } = a
  const id = `rebel${i}`
  p.reset()
  const fs = rig.group.scale.x
  const wake = clampU((s - 0.1) / 0.45)
  let px = a.x
  let pz = a.z
  let py = Math.sin(Math.PI * wake) * 0.05 * (wake > 0 && wake < 1 ? 1 : 0)
  let ry = Math.PI + srand(B_SEED, i, 41) * 0.14
  let rx = 0
  let rz = 0
  let pivot = 0
  const jit = srand(B_SEED, i, 42)
  applyClip(rig, idle(s + rand(B_SEED, i, 8) * 5))
  const w = p.j('weapon')
  if (w) w.visible = true
  const fl = falls.find((f) => f.rebel === i)
  const cue = cueFor(scene, id, s)
  const act = cue?.cue.action
  const wob = (amp: number, f: number): number => Math.sin(s * f + i * 1.9) * amp
  // spear tips waver while the line watches the charge come on
  const fear = sstep((s - 3.0) / 0.6)
  const standing = !fl || s < fl.t
  if (standing) {
    const aim = new Vector3(wob(0.22 * fear, 17), 1, 0.2 + wob(0.22 * fear, 13))
    p.aim('weapon', aim, [0, 1, 0])
    p.aim('armR', new Vector3(0.0, 0.2 + 0.5 * fear, 0.8))
    p.aim('armL', new Vector3(0.3, -0.3 + 0.7 * fear, 0.6))
    p.rot('torso', -0.22 * fear + wob(0.05 * fear, 21), 0, 0)
    p.rot('head', 0.1 * fear, 0, 0)
    py += wob(0.01 * fear, 23)
  }
  if (fl && s >= fl.t) {
    // flung by the horse: a body in the air (the whole figure tumbles), limbs loose, then it lands, slides and lies flat on the sand
    const st = flingState(fl, a.x, a.z + staggerShift(clampU((fl.t - 3.2) / 0.5)) * fs, s)
    pivot = 0.2
    px = st.pos[0]
    py = st.pos[1] - pivot
    pz = st.pos[2]
    rx = st.rx
    rz = st.rz
    const flail = st.air ? 1 : 1 - sstep(st.landed / 0.5)
    const tau = s - fl.t
    const spread = st.air ? 0.35 : 0.35 + 0.65 * sstep(st.landed / 0.5)
    const lie = limbsOnly(fallBack(spread)).pose
    const loose = (f: number, ph: number): number => Math.sin(tau * f + ph + i) * flail
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
  } else if (act === 'drop-turn' || (i === drop && act === 'flee')) {
    // drops the spear, turns on the spot with small steps and runs: the legs follow the distance covered
    const turn = sstep((s - 3.2) / 0.32)
    ry = mix(ry, 0.0 + srand(B_SEED, i, 43) * 0.2, turn)
    const run = sstep((s - 3.4) / 1.8)
    const dx = run * (0.4 * srand(B_SEED, i, 44))
    const dz = run * 2.3
    pz += dz
    px += dx
    const run2 = sstep((s + 0.02 - 3.4) / 1.8)
    const v = (Math.hypot(0.4 * srand(B_SEED, i, 44), 2.3) * (run2 - run)) / 0.02 / fs
    const go = locomotion(rig, Math.hypot(dx, dz) / fs + i * 0.2, v, s)
    const turning = stepTurn((Math.PI - 0.2) * (i % 2 ? 1 : -1) * turn)
    applyClip(rig, mixClip(turning, go, sstep((s - 3.4) / 0.2)))
    pArmsUp(p, 0.8, 0.9)
    if (w && s > 3.2) w.visible = false
    p.rot('torso', 0.2 * turn, 0, 0)
  } else if (s >= 3.2 && s < 5.8 && act !== 'drop-turn') {
    // the line staggers back a step as the horses hit it (B4): one planted foot, the other steps back, the arms fling up
    const q = clampU((s - 3.2) / 0.5)
    applyClip(rig, stagger(q))
    pArmsUp(p, 0.55 + 0.35 * q, 1.0)
    p.rot('torso', -0.3 + 0.1 * q + wob(0.08, 9), wob(0.2, 7) * q, wob(0.1, 8) * q)
    pz += staggerShift(q) * fs
    px += jit * 0.02 * q
    ry += wob(0.12, 6) * q
  } else if (act === 'regroup' || s >= 5.8) {
    const k = cue && act === 'regroup' ? cue.p : 1
    // survivors back away and bunch up, still looking at the riders: the legs walk backwards (the cycle runs in reverse)
    const e = sstep(k * 1.2)
    const gx = a.x * (1 - 0.45 * sstep(k * 1.3))
    const x0 = a.x + jit * 0.02
    const z0 = a.z + staggerShift(1) * fs
    px = mix(x0, gx + 0.2, e)
    pz = mix(z0, a.z + 1.0, e)
    const e2 = sstep((k + 0.02 / 1.2) * 1.2)
    const v = (Math.hypot(gx + 0.2 - x0, a.z + 1.0 - z0) * (e2 - e)) / 0.02 / fs / 1.2
    // moving away from the riders while facing them: backwards along the figure's own forward axis
    const back = -1
    applyClip(rig, locomotion(rig, back * (Math.hypot(px - x0, pz - z0) / fs) + i * 0.2, v, s))
    pArmsUp(p, 0.5, 0.9)
    p.rot('torso', -0.15, wob(0.12, 6), 0)
    ry += wob(0.1, 6)
  }
  // dropped spear on the ground for the dropper
  if (i === drop) {
    const t0 = 3.2
    const tau = Math.max(0, s - t0)
    dropSpear.group.visible = s >= t0
    const y = Math.max(0.012, 0.32 - 4.2 * tau * tau)
    dropSpear.group.position.set(a.x + 0.06 * tau * 3, y, a.z - 0.05 - 0.25 * Math.min(tau, 0.4))
    const lie = sstep(tau / 0.45)
    dropSpear.group.rotation.set(mix(0.2, -Math.PI / 2 + 0.05, lie), 0.5, mix(0, 0.15, lie))
  }
  holder.position.set(px, py + pivot, pz)
  holder.rotation.set(rx, ry, rz)
  rig.group.position.set(0, -pivot, 0)
}

export function ThunderingChargeWorld({ scene }: { scene: CutinScene }) {
  const frame = useFrameRef()

  const world = useMemo(() => {
    const falls = flingPlan(scene.sample.falls)
    const riders = makeRiders()
    const rebels = makeRebels()
    const drop = dropper(falls.map((f) => f.rebel))
    const spear = makeSpearProp()
    spear.group.visible = false
    const trail = new Ribbon(44, '#f4e7d0')
    const contacts = Array.from({ length: B_LAYOUT.rebelCount }, (_, i) => contactTime(i))
    const fx = {
      hoof: new ParticleBuffer(4 * 160, 'alpha', 0.9),
      burst: new ParticleBuffer(B_LAYOUT.rebelCount * 22, 'alpha', 0.9),
      slide: new ParticleBuffer(B_LAYOUT.rebelCount * 24, 'alpha', 0.9),
      sparks: new ParticleBuffer(120, 'add', 2.2),
    }
    const steps = riders.map((r, m) => footfalls(m, figureScale() * (r.rig.bodyScale ?? 1)))
    return { falls, riders, rebels, drop, spear, trail, contacts, fx, steps }
  }, [scene])

  useEffect(
    () => () => {
      world.riders.forEach((r) => r.rig.dispose())
      world.rebels.forEach((r) => r.rig.dispose())
      Object.values(world.fx).forEach((f) => f.dispose())
    },
    [world],
  )

  const tip = useMemo(() => ({ a: new Vector3(), b: new Vector3() }), [])

  useFrame(({ camera, gl }) => {
    const { story: s } = frame.current
    const ppu = pxPerUnit(gl.domElement.height, (camera as { fov?: number }).fov ?? 40)
    const { riders, rebels, falls, drop, spear, trail, fx } = world

    riders.forEach((r) => poseRider(r, s, scene))
    rebels.forEach((a) => poseRebel(a, s, scene, falls, drop, spear))

    // crescent sweep trail: the glaive's tip over the last few hundredths of a second
    {
      const vis = s >= SWEEP.from + 0.01 ? 1 - sstep((s - SWEEP.to) / 0.4) : 0
      for (let k = 0; k < trail.count; k++) {
        const st = Math.max(SWEEP.from, s - k * 0.006)
        const L = riderAt(0, st)
        const a = sweepAngle(st)
        const lx = Math.sin(a)
        const lz = Math.cos(a)
        const wx = lx * Math.cos(L.heading) + lz * Math.sin(L.heading)
        const wz = -lx * Math.sin(L.heading) + lz * Math.cos(L.heading)
        const base = new Vector3(L.x, SWEEP.height, L.z)
        // the blade sweeps in a plane tilted up from the horizontal, so it shows from a low camera
        tip.a.copy(base).addScaledVector(new Vector3(wx, 0.0, wz), SWEEP.reach * 0.9).addScaledVector(new Vector3(0, -0.02, 0), 1)
        tip.b.copy(base).addScaledVector(new Vector3(wx, 0.0, wz), SWEEP.reach * 1.12).addScaledVector(new Vector3(0, 0.12, 0), 1)
        const age = k / (trail.count - 1)
        trail.set(k, tip.a, tip.b, vis * Math.pow(1 - age, 1.6) * (st > SWEEP.from ? 0.7 : 0))
      }
      trail.commit(vis > 0.01)
    }

    // hoof dust: a puff kicked up at every footfall (the strikes come from the same distance-driven gait the legs use)
    {
      const b = fx.hoof
      b.begin(ppu)
      world.steps.forEach((evs, m) => {
        for (const ev of evs) {
          const age = s - ev.t
          if (age < 0 || age > 0.65) continue
          const u = age / 0.65
          const R = riderAt(m, ev.t)
          const hx = Math.sin(R.heading)
          const hz = Math.cos(R.heading)
          for (let k = 0; k < 3; k++) {
            const r1 = srand(B_SEED + m, Math.round(ev.t * 240) + k, 1)
            const r2 = rand(B_SEED + m, Math.round(ev.t * 240) + k, 2)
            const x = ev.x - hx * (0.05 + 0.3 * u * (0.4 + r2)) + r1 * 0.05
            const z = ev.z - hz * (0.05 + 0.3 * u * (0.4 + r2)) + srand(B_SEED + m, Math.round(ev.t * 240) + k, 3) * 0.05
            const y = 0.02 + u * (0.1 + 0.1 * r2)
            b.push(x, y, z, (0.08 + 0.2 * u) * (0.7 + 0.5 * r2) * (0.6 + 0.6 * ev.power), 0.8, 0.66, 0.46, 0.4 * (0.4 + ev.power) * (1 - u) ** 1.3)
          }
        }
      })
      b.end()
    }
    // impact dust and sparks at each contact
    {
      const b = fx.burst
      b.begin(ppu)
      const sp = fx.sparks
      sp.begin(ppu)
      falls.forEach((f, fi) => {
        const [rx, rz] = rebelLine(f.rebel)
        for (let k = 0; k < 22; k++) {
          const bp = burstPosition(B_SEED + 5, fi * 40 + k, f.t, s, [rx, 0.06, rz], 1.5, 0.8, 0.95)
          if (!bp) continue
          b.push(bp.p[0], bp.p[1] + 0.03, bp.p[2], 0.15 + 0.3 * bp.u, 0.82, 0.7, 0.5, 0.45 * (1 - bp.u) ** 1.1)
        }
        for (let k = 0; k < 14; k++) {
          const bp = burstPosition(B_SEED + 6, fi * 40 + k, f.t, s, [rx, 0.18, rz], 2.2, 5, 0.5)
          if (!bp) continue
          sp.push(bp.p[0], bp.p[1], bp.p[2], 0.02, 1, 0.85, 0.55, 0.9 * (1 - bp.u))
        }
      })
      b.end()
      sp.end()
    }
    // sliding dust where the flung rebels skid
    {
      const b = fx.slide
      b.begin(ppu)
      falls.forEach((f, fi) => {
        const [rx, rz] = rebelLine(f.rebel)
        const T = (2 * f.v[1]) / FLING_GRAVITY
        const cfg: SlotConfig = { seed: B_SEED + 30 + fi, count: 24, period: 0.9, start: f.t + T, end: f.t + T + 0.55, lifeMin: 0.5 }
        for (let k = 0; k < cfg.count; k++) {
          const sl = sampleSlot(cfg, k, s)
          if (!sl.alive) continue
          const st = flingState(f, rx, rz, sl.tb)
          b.push(st.pos[0] + srand(B_SEED, k, fi) * 0.08, 0.05 + sl.age * 0.12, st.pos[2] + srand(B_SEED, k, fi + 5) * 0.08, 0.14 + 0.3 * sl.u, 0.8, 0.68, 0.48, 0.4 * (1 - sl.u) ** 1.2)
        }
      })
      b.end()
    }
  })

  return (
    <group>
      <Stage seed={B_SEED} focus={[0.6, 0.5]} keyDir={[-3.5, 7, 7.5]} rimDir={[3, 3.5, -9]} motes={170} moteStrength={0.85} />
      {world.riders.map((r) => (
        <primitive key={r.id} object={r.rig.group as Object3D} />
      ))}
      {world.rebels.map((a) => (
        <primitive key={a.i} object={a.holder as Object3D} />
      ))}
      <primitive object={world.spear.group as Object3D} />
      <primitive object={world.trail.mesh as Object3D} />
      {Object.entries(world.fx).map(([k, f]) => (
        <primitive key={k} object={f.points as Object3D} />
      ))}
    </group>
  )
}
