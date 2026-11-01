// The instanced ranks of the act scenes (C, D, R, W and the shorts; docs/spec/51 "More troops"). ActPlan.ranks says where each
// crowd stands; this file scripts what it does from the scene's own cues and tracks, all at story time, so the crowds stay a pure
// function of time like the rigged figures in front of them.
import { Vector3 } from 'three'
import type { Crowd } from '../crowd'
import { rand, srand } from '../rng'
import { SCENE_INFO } from '../sceneInfo'
import type { CutinScene } from '../timeline'
import { trackAt, type ActActor, type ActPlan, type RankSpec } from './act'
import { CrowdScript, CrowdSet, spawnRanks, toLocal } from './ranks'

export interface ActRanks {
  crowds: CrowdSet
  atk: Crowd | null
  def: Crowd | null
  /** One more arrow per archer of the attacking ranks (S-archer), in the shape of ActFx.arrows. */
  arrows: { from: [number, number, number]; to: [number, number, number]; launch: number; land: number; apex: number }[]
}

/**
 * In a short scene the attacker's own figure leads the front rank when the officer has a hero design (review note 2026-11-01):
 * the id of the front-rank actor it replaces (the middle of the front, the wedge's apex), or null.
 */
export function frontHeroActor(scene: CutinScene, act: ActPlan, heroIds: readonly string[]): string | null {
  const p = scene.params
  if (act.hero || !p || !heroIds.includes(p.caster.officer)) return null
  let best: ActActor | null = null
  for (const a of act.actors) {
    if (a.group !== 'atk' || !a.front) continue
    const d = Math.abs(a.track.start[0])
    const bd = best ? Math.abs(best.track.start[0]) : Infinity
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && a.track.start[1] > best.track.start[1])) best = a
  }
  return best?.id ?? null
}

const cueOf = (scene: CutinScene, actor: string, action: string): { start: number; end: number } | null => {
  const c = scene.cues.find((q) => q.actor === actor && q.action === action)
  return c ? { start: c.start, end: c.end } : null
}
const firstCue = (scene: CutinScene, prefix: string, action: string): { start: number; end: number } | null => {
  let best: { start: number; end: number } | null = null
  for (const c of scene.cues) if (c.actor.startsWith(prefix) && c.action === action && (!best || c.start < best.start)) best = { start: c.start, end: c.end }
  return best
}

/**
 * March `dist` straight ahead between t0 and t1 and stand: the speed is chosen so the distance is covered with a 0.3 s ramp up
 * and a 0.3 s halt (the legs run on the distance, so nothing skates).
 */
function travel(sc: CrowdScript, c: Crowd, t0: number, t1: number, dist: number, members?: number[]): void {
  const r = 0.3
  const h = 0.3
  const T = Math.max(0.3, t1 - t0)
  const v = Math.max(0, dist) / Math.max(0.1, T - r / 2 - h / 2)
  if (v < 1e-3) return
  sc.at(t0, () => c.march([0, 1], v, { at: t0, ramp: r, ...(members ? { members } : {}) }))
  sc.at(t0 + T - h, () => c.halt({ at: t0 + T - h, decel: h, ...(members ? { members } : {}) }))
}

/** How many of the ranks go down: the front rank's share of the plan's falls (half of it in a short scene), at least one when anyone fell. */
function downCount(scene: CutinScene, n: number): number {
  const info = SCENE_INFO[scene.id]
  const falls = scene.sample.falls
  if (falls <= 0 || n <= 0 || info.front <= 0) return 0
  const share = Math.min(1, falls / info.front) * (info.full ? 1 : 0.5)
  return Math.min(n, Math.max(1, Math.round(share * n)))
}

/** Depth of a member behind its crowd's first rank (world units), for staggering when a shock reaches it. */
const depthOf = (c: Crowd, i: number, spec: RankSpec, v: Vector3): number => {
  c.positionOf(i, v, true)
  return Math.abs(v.z - spec.at[1])
}

export function buildActRanks(scene: CutinScene, plan: ActPlan): ActRanks {
  const crowds = new CrowdSet()
  const p = scene.params
  const routed = !!p?.routed
  const specOf = (id: 'atk' | 'def'): RankSpec | undefined => plan.ranks.find((r) => r.id === id)
  const make = (r: RankSpec | undefined): Crowd | null =>
    r ? crowds.add(spawnRanks({ kind: r.kind, palette: r.palette, count: r.count, seed: r.seed, at: r.at, facing: r.facing, formation: r.formation, files: r.files, gap: r.gap, ...(r.formation === 'mob' ? {} : { jitter: 0.12 }) })) : null
  const atkSpec = specOf('atk')
  const defSpec = specOf('def')
  const atk = make(atkSpec)
  const def = make(defSpec)
  const arrows: ActRanks['arrows'] = []
  const v = new Vector3()
  const id = scene.id
  const sa = new CrowdScript()
  const sd = new CrowdScript()
  const down = def ? def.pick(downCount(scene, def.members.length), scene.seed + 31) : []
  const isDown = (i: number): boolean => down.includes(i)

  // a flank or rear hit: the defenders' block stays where it stands, its members face the way the front rank does
  if (def && defSpec?.turnTo !== undefined) {
    const dir = toLocal(def, [Math.sin(defSpec.turnTo), Math.cos(defSpec.turnTo)])
    sd.at(-1, () => def.face(dir, { at: -1 }))
  }

  /** The common reaction of a rank to a shock reaching member i at time t. */
  const shock = (i: number, t: number, hold = 0.55): void => {
    if (!def) return
    if (isDown(i)) {
      sd.at(t, () => def.stagger([i], { at: t, hold: 0.05, dur: 0.16 }))
      sd.at(t + 0.16, () => def.fall([i], 'back', 0.2, { at: t + 0.16 }))
    } else {
      sd.at(t, () => def.stagger([i], { at: t, hold }))
      if (routed) sd.at(t + hold + 0.4, () => def.flee([i], { at: t + hold + 0.4, speed: 1.3 + rand(scene.seed, i, 33) * 0.3 }))
    }
  }

  switch (id) {
    case 'C': {
      const a0 = plan.actors.find((a) => a.id === 'atk0')
      if (atk && a0 && a0.track.segs.length >= 2) {
        const [s1, s2] = a0.track.segs as [(typeof a0.track.segs)[number], (typeof a0.track.segs)[number]]
        const z0 = a0.track.start[1]
        travel(sa, atk, s1.t0, s1.t1, s1.to[1] - z0)
        travel(sa, atk, s2.t0, s2.t1, s2.to[1] - s1.to[1])
      }
      const hit = cueOf(scene, 'hero', 'strike')?.start ?? 2.3
      if (def && defSpec) for (const m of def.members) shock(m.index, hit + 0.25 + depthOf(def, m.index, defSpec, v) * 0.22 + rand(scene.seed, m.index, 34) * 0.1, 0.7)
      break
    }
    case 'D': {
      const roar = cueOf(scene, 'hero', 'roar')
      if (atk && roar) travel(sa, atk, roar.start + 0.55, roar.start + 1.7, 0.4)
      const ring = plan.fx.rings?.[0]
      if (def && ring) {
        for (const m of def.members) {
          def.positionOf(m.index, v, true)
          const t = ring.t0 + Math.hypot(v.x - ring.origin[0], v.z - ring.origin[2]) / ring.speed
          shock(m.index, t, 0.8)
          // the survivors back away when the front rank does (turn and walk off)
          const back = plan.actors.find((a) => a.group === 'def' && a.track.segs.length > 0)?.track.segs[0]?.t0 ?? t + 1.5
          if (!isDown(m.index) && !routed) sd.at(back + rand(scene.seed, m.index, 35) * 0.4, () => def.flee([m.index], { at: back + rand(scene.seed, m.index, 35) * 0.4, speed: 0.55 + rand(scene.seed, m.index, 36) * 0.2 }))
        }
      }
      break
    }
    case 'R': {
      const g = cueOf(scene, 'hero', 'gesture')
      if (atk && g) travel(sa, atk, g.start + 0.1, g.start + 0.9, 0.22)
      const dz = firstCue(scene, 'def', 'dizzy')
      if (def && dz) for (const m of def.members) shock(m.index, dz.start + 0.05 + rand(scene.seed, m.index, 37) * 0.45, 1.3)
      break
    }
    case 'W': {
      const g = cueOf(scene, 'hero', 'gesture')
      const rec = cueOf(scene, 'hero', 'recover')
      if (atk && g) {
        for (const m of atk.members) {
          const t = g.start + 0.05 + rand(scene.seed, m.index, 38) * 0.35
          if (atk.kind === 'cavalry') {
            // the horses shy in the gust
            const tw = (plan.fx.wind?.t0 ?? g.start + 0.5) + rand(scene.seed, m.index, 39) * 0.3
            sa.at(tw, () => atk.stagger([m.index], { at: tw, hold: 0.35 }))
          } else {
            sa.at(t, () => atk.kneel({ at: t, members: [m.index] }))
            if (rec) {
              const up = rec.start + 0.35 + rand(scene.seed, m.index, 40) * 0.3
              sa.at(up, () => atk.stand({ at: up, members: [m.index] }))
            }
          }
        }
      }
      break
    }
    case 'S-melee': {
      const a0 = plan.actors.find((a) => a.id === 'atk0')
      if (atk && a0 && a0.track.segs[0]) {
        const s1 = a0.track.segs[0]
        travel(sa, atk, s1.t0, s1.t1, s1.to[1] - a0.track.start[1])
        const s2 = a0.track.segs[1]
        if (s2) travel(sa, atk, s2.t0, s2.t1, s2.to[1] - s1.to[1])
        else if (p?.counter) {
          const t = (firstCue(scene, 'atk', 'stagger') ?? firstCue(scene, 'atk', 'fling'))?.start
          if (t !== undefined) sa.at(t + 0.1, () => atk.stagger('front', { at: t + 0.1, hold: 0.3 }))
        }
      }
      const hit = firstCue(scene, 'def', 'brace')?.end ?? 1.2
      if (def && defSpec) for (const m of def.members) shock(m.index, hit + 0.1 + depthOf(def, m.index, defSpec, v) * 0.18 + rand(scene.seed, m.index, 41) * 0.08, 0.5)
      break
    }
    case 'S-cavalry': {
      const a0 = plan.actors.find((a) => a.id === 'atk0')
      if (atk && a0 && a0.track.segs[0]) {
        // the squadron behind the wedge canters in with it and reins in just short of the defenders' line
        const s1 = a0.track.segs[0]
        const lineZ = Math.min(...plan.actors.filter((a) => a.group === 'def').map((a) => a.track.start[1]))
        travel(sa, atk, s1.t0, s1.t1 + 0.35, lineZ - 0.95 - (atkSpec?.at[1] ?? a0.track.start[1]))
      }
      const hit = firstCue(scene, 'def', 'brace')?.end ?? 1.25
      if (def) chargeThrough(scene, plan, def, sd, down, hit, routed)
      break
    }
    case 'S-archer': {
      const draw = firstCue(scene, 'atk', 'draw')
      const loose = firstCue(scene, 'atk', 'loose')
      const land0 = plan.fx.arrows?.reduce((m, a) => Math.min(m, a.land), Infinity) ?? 1.6
      const launch0 = plan.fx.arrows?.reduce((m, a) => Math.min(m, a.launch), Infinity) ?? 0.92
      if (atk && draw && loose) {
        atk.draw(undefined, { at: draw.start, dur: Math.max(0.2, draw.end - draw.start) })
        atk.loose({ at: loose.start })
        atk.update(loose.start - 0.01)
        const targets = def ? [...down, ...def.select('all').filter((i) => !isDown(i))] : []
        atk.members.forEach((m, k) => {
          const from = atk.jointPosition(m.index, 'weapon', v, true)
          const f: [number, number, number] = [from.x, from.y + 0.04, from.z]
          let tx = srand(scene.seed, k, 42) * 1.2
          let tz = (defSpec?.at[1] ?? 2.5) + rand(scene.seed, k, 43) * 0.6
          if (def && targets.length) {
            def.positionOf(targets[k % targets.length]!, v, true)
            tx = v.x
            tz = v.z
          }
          arrows.push({ from: f, to: [tx + srand(scene.seed, k, 44) * 0.08, 0.2, tz - 0.05], launch: launch0 + 0.01 + rand(scene.seed, k, 45) * 0.04, land: land0 + 0.05 + rand(scene.seed, k, 46) * 0.2, apex: 1.6 + rand(scene.seed, k, 47) * 0.4 })
        })
        atk.update(0)
      }
      if (def) {
        for (const m of def.members) {
          def.positionOf(m.index, v, true)
          let t = land0 + 0.08 + rand(scene.seed, m.index, 48) * 0.15
          for (const a of arrows) if ((a.to[0] - v.x) ** 2 + (a.to[2] - v.z) ** 2 < 0.09) t = Math.min(t, a.land)
          shock(m.index, t, 0.5)
        }
      }
      break
    }
  }
  sa.apply()
  sd.apply()
  atk?.update(0)
  def?.update(0)
  return { crowds, atk, def, arrows }
}

/**
 * Riders going through the ranks (S-cavalry): whoever an attacking horse reaches is flung (while the plan has falls left),
 * the rest of the lane dashes aside and stands, everyone else reels at the shock.
 */
function chargeThrough(scene: CutinScene, plan: ActPlan, def: Crowd, sd: CrowdScript, down: number[], hit: number, routed: boolean): void {
  const riders = plan.actors.filter((a) => a.group === 'atk')
  const v = new Vector3()
  let left = down.length
  const hits = def.members
    .map((m) => {
      def.positionOf(m.index, v, true)
      const x = v.x
      const z = v.z
      for (let s = hit - 0.3; s < hit + 1.4; s += 1 / 120) {
        for (const r of riders) {
          const q = trackAt(r.track, s)
          const nx = q.x + Math.sin(q.yaw) * 0.3
          const nz = q.z + Math.cos(q.yaw) * 0.3
          if (Math.hypot(nx - x, nz - z) < 0.36) {
            const side = x - q.x >= 0 ? 1 : -1
            return { i: m.index, t: s, x, dir: [Math.sin(q.yaw) + side * 0.7 * Math.cos(q.yaw), Math.cos(q.yaw) - side * 0.7 * Math.sin(q.yaw)] as [number, number] }
          }
        }
      }
      return { i: m.index, t: Infinity, x, dir: [0, 1] as [number, number] }
    })
    .sort((a, b) => a.t - b.t)
  for (const h of hits) {
    const i = h.i
    if (h.t < Infinity) {
      if (left > 0) {
        left--
        const l = Math.hypot(h.dir[0], h.dir[1]) || 1
        const d = 1.2 + rand(scene.seed, i, 50) * 0.4
        const local = toLocal(def, [(h.dir[0] / l) * d, (h.dir[1] / l) * d])
        sd.at(h.t, () => def.fall([i], 'fling', local, { at: h.t, apex: 0.5 }))
      } else {
        const t = Math.max(0, h.t - 0.95)
        const dir = toLocal(def, [h.x >= 0 ? 1 : -1, 0.15])
        sd.at(t, () => def.march(dir, 1.6, { at: t, members: [i], ramp: 0.15 }))
        sd.at(t + 0.9, () => def.halt({ at: t + 0.9, members: [i], decel: 0.3 }))
      }
    } else if (left > 0) {
      left--
      const t = hit + 0.15 + rand(scene.seed, i, 51) * 0.2
      sd.at(t, () => def.stagger([i], { at: t, hold: 0.05, dur: 0.16 }))
      sd.at(t + 0.16, () => def.fall([i], 'back', 0.2, { at: t + 0.16 }))
    } else {
      const t = hit + 0.1 + rand(scene.seed, i, 52) * 0.2
      sd.at(t, () => def.stagger([i], { at: t, hold: 0.5 }))
      if (routed) sd.at(t + 0.9, () => def.flee([i], { at: t + 0.9, speed: 1.4 }))
    }
  }
}
