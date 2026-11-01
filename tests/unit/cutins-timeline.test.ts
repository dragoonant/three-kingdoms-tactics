// Battle cut-ins (docs/spec/51): the timeline is a pure function of wall time. Beats, slow-motion, hit-stop, shake and the
// overlay schedule are all checked here without a browser.
import { describe, expect, it } from 'vitest'
import { A_TIMESCALE, aStory, makeFireArrows } from '../../src/client/cutins/scenes/fireArrows'
import { B_TIMESCALE, bStory, makeThunderingCharge } from '../../src/client/cutins/scenes/thunderingCharge'
import { actorCues, beatAt, cueFor, evaluate, rateAt, shotAt, storyAt, validateScene, type CutinScene } from '../../src/client/cutins/timeline'

const A = makeFireArrows(420, 2)
const B = makeThunderingCharge(1060, 4)
const scenes: [string, CutinScene][] = [
  ['A', A],
  ['B', B],
]

describe('scene definitions', () => {
  it.each(scenes)('scene %s is well formed', (_id, sc) => {
    expect(validateScene(sc)).toEqual([])
  })

  it('beats match the shot list in docs/spec/51 exactly', () => {
    expect(A.beats.map((b) => [b.id, b.start, b.end])).toEqual([
      ['A1', 0, 0.7],
      ['A2', 0.7, 1.9],
      ['A3', 1.9, 2.6],
      ['A4', 2.6, 4.0],
      ['A5', 4.0, 5.6],
      ['A6', 5.6, 7.0],
    ])
    expect(B.beats.map((b) => [b.id, b.start, b.end])).toEqual([
      ['B1', 0, 0.6],
      ['B2', 0.6, 1.6],
      ['B3', 1.6, 3.0],
      ['B4', 3.0, 3.6],
      ['B5', 3.6, 4.4],
      ['B6', 4.4, 5.8],
      ['B7', 5.8, 7.0],
    ])
    expect(A.duration).toBe(7)
    expect(B.duration).toBe(7)
  })

  it('numbers come from the sample event', () => {
    expect(A.overlays.damage.text).toBe('−420')
    expect(B.overlays.damage.text).toBe('−1,060')
    expect(makeFireArrows(137, 1).overlays.damage.text).toBe('−137')
  })

  it('each scene has at most one whip-pan, and only B has it', () => {
    expect(A.shots.filter((s) => s.whip).length).toBe(0)
    expect(B.shots.filter((s) => s.whip).length).toBe(1)
  })
})

describe('evaluate: beats', () => {
  it.each(scenes)('scene %s: the beat changes exactly at each boundary', (_id, sc) => {
    for (const b of sc.beats) {
      expect(evaluate(sc, b.start).beat.id).toBe(b.id)
      expect(evaluate(sc, (b.start + b.end) / 2).beat.id).toBe(b.id)
      expect(beatAt(sc, b.end - 1e-6).id).toBe(b.id)
    }
    expect(evaluate(sc, sc.duration).beat.id).toBe(sc.beats[sc.beats.length - 1]!.id)
    expect(evaluate(sc, -5).beat.id).toBe(sc.beats[0]!.id)
    expect(evaluate(sc, 99).t).toBe(sc.duration)
  })

  it.each(scenes)('scene %s: every shot belongs to the beat it is filed under', (_id, sc) => {
    for (const s of sc.shots) {
      const b = sc.beats.find((x) => x.id === s.beat)!
      expect(s.from).toBeCloseTo(b.start, 9)
      expect(s.to).toBeCloseTo(b.end, 9)
      expect(shotAt(sc, (s.from + s.to) / 2)).toBe(s)
    }
  })

  it.each(scenes)('scene %s: camera is continuous inside a shot and the fov stays sane', (_id, sc) => {
    for (let t = 0.001; t < sc.duration; t += 1 / 60) {
      const a = evaluate(sc, t).camera
      const b = evaluate(sc, t + 1 / 60).camera
      expect(a.fov).toBeGreaterThan(20)
      expect(a.fov).toBeLessThan(60)
      expect(a.pos[1]).toBeGreaterThan(0.05)
      // no jump bigger than 2 units per 1/60 s except across a cut (shot boundary)
      const cut = sc.shots.some((s) => Math.abs(s.from - (t + 1 / 120)) < 1 / 120 + 1e-9)
      if (!cut) expect(Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2])).toBeLessThan(0.6)
    }
  })
})

describe('evaluate: slow motion and hit-stop', () => {
  it('A: 0.5x slow motion at the apex (3.1-3.5), a hit-stop at the first impact', () => {
    expect(rateAt(A_TIMESCALE, 3.3)).toBeCloseTo(0.5, 9)
    expect(rateAt(A_TIMESCALE, 3.0)).toBe(1)
    expect(rateAt(A_TIMESCALE, 3.6)).toBe(1)
    // story time loses about 0.2 s inside the window and nothing is skipped on either side
    const lost = 3.5 - 3.1 - (aStory(3.5) - aStory(3.1))
    expect(lost).toBeGreaterThan(0.15)
    expect(lost).toBeLessThan(0.21)
    expect(aStory(3.0)).toBeCloseTo(3.0, 9)
  })

  it.each([
    ['A', A, 4.05, 4.2],
    ['B', B, 3.6, 3.75],
  ] as const)('scene %s: hit-stop freezes story time for 0.12-0.18 s of wall time', (_id, sc, a, b) => {
    expect(b - a).toBeGreaterThanOrEqual(0.12)
    expect(b - a).toBeLessThanOrEqual(0.18)
    const s0 = evaluate(sc, a + 0.001)
    const s1 = evaluate(sc, b - 0.001)
    expect(s0.hitStop).toBe(true)
    expect(s0.rate).toBe(0)
    expect(s1.story).toBeCloseTo(s0.story, 3)
    // and it releases
    expect(evaluate(sc, b + 0.1).story).toBeGreaterThan(s1.story + 0.09)
    expect(evaluate(sc, b + 0.001).hitStop).toBe(false)
  })

  it.each([
    ['A', A_TIMESCALE, 7],
    ['B', B_TIMESCALE, 7],
  ] as const)('scene %s: story time is monotone and never ahead of wall time', (_id, ts, dur) => {
    let prev = -1
    for (let t = 0; t <= dur; t += 0.01) {
      const s = storyAt(ts, dur, t)
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(s).toBeLessThanOrEqual(t + 1e-9)
      prev = s
    }
  })

  it('story clocks used by the scene files agree with the timeline', () => {
    expect(aStory(5)).toBeCloseTo(evaluate(A, 5).story, 9)
    expect(bStory(5)).toBeCloseTo(evaluate(B, 5).story, 9)
    expect(bStory(3.6)).toBeCloseTo(3.6, 9)
    expect(bStory(4.0)).toBeCloseTo(4.0 - 0.15, 3)
  })
})

describe('evaluate: determinism', () => {
  it.each(scenes)('scene %s: the same t gives the same output, in any order', (_id, sc) => {
    const ts = [0, 0.33, 1.9, 2.6, 3.3, 4.1, 5.59, 6.99, 7]
    const first = ts.map((t) => JSON.stringify(evaluate(sc, t)))
    const reversed = [...ts].reverse().map((t) => JSON.stringify(evaluate(sc, t))).reverse()
    expect(reversed).toEqual(first)
    const rebuilt = sc.id === 'A' ? makeFireArrows(420, 2) : makeThunderingCharge(1060, 4)
    expect(ts.map((t) => JSON.stringify(evaluate(rebuilt, t)))).toEqual(first)
  })
})

describe('evaluate: shake', () => {
  it('shake decays to zero inside 0.3-0.35 s of an impact and is zero before it', () => {
    const before = evaluate(A, 4.0).shake
    expect(before).toEqual([0, 0])
    const early = evaluate(A, 4.07).shake
    expect(Math.hypot(early[0], early[1])).toBeGreaterThan(0.001)
    const peak = Math.max(...Array.from({ length: 12 }, (_, i) => Math.hypot(...evaluate(A, 4.05 + i * 0.01).shake)))
    const late = Math.hypot(...evaluate(A, 4.05 + 0.3).shake)
    expect(late).toBeLessThan(peak * 0.5)
  })

  it('B4 shake grows toward the impact', () => {
    const amp = (t0: number): number => Math.max(...Array.from({ length: 20 }, (_, i) => Math.hypot(...evaluate(B, t0 + i * 0.005).shake)))
    expect(amp(3.4)).toBeGreaterThan(amp(3.05))
  })
})

describe('overlay schedule', () => {
  it('A: title brushes in during A1, call-out appears once in A3, damage paints in A6, seal stamps at the end', () => {
    expect(evaluate(A, 0.05).overlay.title.reveal).toBeLessThan(0.05)
    expect(evaluate(A, 0.35).overlay.title.reveal).toBeGreaterThan(0.2)
    expect(evaluate(A, 0.8).overlay.title.reveal).toBe(1)
    expect(evaluate(A, 1.5).overlay.title.alpha).toBe(1)
    expect(evaluate(A, 3.0).overlay.title.alpha).toBe(0)
    const call = (t: number): number => evaluate(A, t).overlay.callout.alpha * evaluate(A, t).overlay.callout.reveal
    expect(call(1.5)).toBe(0)
    expect(call(2.3)).toBeGreaterThan(0.9)
    expect(call(3.5)).toBe(0)
    // once only: it never comes back
    for (let t = 2.8; t <= 7; t += 0.05) expect(call(t)).toBe(0)
    expect(evaluate(A, 5.0).overlay.damage.paint).toBe(0)
    const p1 = evaluate(A, 5.9).overlay.damage.paint
    const p2 = evaluate(A, 6.1).overlay.damage.paint
    expect(p1).toBeGreaterThan(0)
    expect(p2).toBeGreaterThan(p1)
    expect(evaluate(A, 6.5).overlay.damage.paint).toBe(1)
    expect(evaluate(A, 6.4).overlay.seal.stamp).toBe(0)
    expect(evaluate(A, 6.99).overlay.seal.stamp).toBe(1)
  })

  it('B: "Charge!" lands in B3, the ink-splash flash sits exactly on the hit-stop, the seal closes the scene', () => {
    expect(B.overlays.callout.text).toBe('Charge!')
    expect(evaluate(B, 1.3).overlay.callout.alpha * evaluate(B, 1.3).overlay.callout.reveal).toBe(0)
    expect(evaluate(B, 2.1).overlay.callout.reveal).toBeGreaterThan(0.9)
    const f = evaluate(B, 3.64).overlay.flash
    expect(f).not.toBeNull()
    expect(f!.kind).toBe('ink')
    expect(f!.alpha).toBeGreaterThan(0.1)
    expect(evaluate(B, 3.5).overlay.flash).toBeNull()
    expect(evaluate(B, 3.8).overlay.flash).toBeNull()
    expect(evaluate(B, 6.9).overlay.seal.stamp).toBe(1)
    expect(evaluate(B, 3.0).overlay.speedLines).toBeGreaterThan(0.5)
  })

  it('B: the whip-pan blur peaks inside B6 and is zero outside it', () => {
    expect(evaluate(B, 4.5).overlay.whip).toBe(0)
    expect(evaluate(B, 4.8).overlay.whip).toBeGreaterThan(0.9)
    expect(evaluate(B, 5.2).overlay.whip).toBe(0)
  })
})

describe('cues', () => {
  it('actors have ordered cues; cueFor returns the latest started cue', () => {
    const cues = actorCues(A, 'archer0')
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.start)
    expect(cueFor(A, 'archer0', 0.0)).toBeNull()
    expect(cueFor(A, 'archer0', 2.0)!.cue.action).toBe('draw')
    expect(cueFor(A, 'archer0', 2.3, 'dip')!.cue.action).toBe('dip')
  })

  it('A: the tips catch one after another, 0.08 s apart', () => {
    const ign = Array.from({ length: 6 }, (_, a) => actorCues(A, `archer${a}`).find((c) => c.action === 'dip')!.params!.ignite as number)
    for (let i = 1; i < 6; i++) expect(ign[i]! - ign[i - 1]!).toBeCloseTo(0.08, 9)
  })

  it('A: the number of rebels that fall comes from the sample event', () => {
    const fallsOf = (sc: CutinScene): number => Array.from({ length: 7 }, (_, r) => actorCues(sc, `rebel${r}`).filter((c) => c.action === 'fall').length).reduce((a, b) => a + b, 0)
    expect(fallsOf(A)).toBe(2)
    expect(fallsOf(makeFireArrows(900, 5))).toBe(5)
  })

  it('B: four rebels are flung, in the order the wedge reaches them', () => {
    const flung = Array.from({ length: 7 }, (_, r) => actorCues(B, `rebel${r}`).filter((c) => c.action === 'fling').length).reduce((a, b) => a + b, 0)
    expect(flung).toBe(4)
    expect(Array.from({ length: 7 }, (_, r) => actorCues(makeThunderingCharge(300, 2), `rebel${r}`).filter((c) => c.action === 'fling').length).reduce((a, b) => a + b, 0)).toBe(2)
  })
})
