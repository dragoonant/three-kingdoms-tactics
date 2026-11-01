import { expect, test, type Page } from '@playwright/test'

// Cut-ins start without a hitch (docs/spec/51 "Performance: warm-up and reuse", PLAN D30): the cut-in canvas is created once
// per battle and warmed up before the first turn, so playing cut-ins afterwards (a short attack, a full stratagem, a chain and
// an enemy's) compiles no shader program, creates no WebGL context and leaves the geometry and texture counts where they were.
test.use({ viewport: { width: 1280, height: 720 } })

type Act = { type: string; unit?: string; target?: string; strat?: string }
type Info = { programs: number; geometries: number; textures: number; calls: number }
type W = {
  __game: { begin(): void; idle(): boolean; suggest(): Act; act(a: unknown): { ok: boolean }; preview(a: unknown): void; state(): { result: unknown } }
  __cutin: {
    active(): boolean
    ready(): boolean
    manual(on: boolean): void
    run(dt?: number, max?: number): number
    step(dt: number): void
    skip(): void
    view(): { prebuilt: boolean; plan: { full: boolean; enemy: boolean; links: { scene: string }[] } }
    prep(): { warm: { done: boolean }; slots: { kind: string; ready: boolean }[]; attached: boolean }
  }
  __perf: { info(): Info | null; contexts(): number; current(): { longTasks: unknown[]; frames: unknown[] } | null; records(): { kind: string; enemy: boolean; frames: { at: number; dur: number }[]; longTasks: { at: number; dur: number }[]; marks: { name: string }[] }[] }
  __r3f?: { gl: { getContext(): unknown } }
}

// counts shader links per WebGL context (the cut-in canvas's is read through window.__r3f)
const COUNT_LINKS = (): void => {
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const orig = P.linkProgram
    P.linkProgram = function (this: WebGLRenderingContext & { __links?: number }, p: WebGLProgram) {
      this.__links = (this.__links ?? 0) + 1
      return orig.call(this, p)
    }
  }
}

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(COUNT_LINKS)
  await page.goto(`./?test=1&perf=1&${query}`)
  await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 90_000 })
  await page.evaluate(() => (window as unknown as W).__game.begin())
  await page.waitForFunction(() => (window as unknown as W).__game.idle(), undefined, { timeout: 120_000 })
  // the warm-up runs behind the intro and the first turn (slowly under software GL)
  await page.waitForFunction(() => (window as unknown as W).__cutin.prep().warm.done, undefined, { timeout: 600_000, polling: 500 })
  return errors
}

const snap = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as W
    const ctx = w.__r3f?.gl.getContext() as { __links?: number } | undefined
    return { info: w.__perf.info()!, contexts: w.__perf.contexts(), links: ctx?.__links ?? 0 }
  })

test('after the warm-up, cut-ins compile no shader, create no WebGL context and leak no geometry or texture', async ({ page }) => {
  test.setTimeout(1_500_000)
  const errors = await boot(page, 'cutins=all&enemycutins=same&seed=5&speed=full')
  const base = await snap(page)
  expect(base.info.programs).toBeGreaterThan(10)
  // the board's context and the cut-in's: both made before the first turn
  expect(base.contexts).toBe(2)
  await page.evaluate(() => (window as unknown as W).__cutin.manual(true))

  const seen = new Set<string>()
  const want = ['short', 'full', 'chain', 'enemy', 'prebuilt', 'built']
  let n = 0
  const play = async (): Promise<void> => {
    await page.waitForFunction(() => (window as unknown as W).__cutin.ready() || !(window as unknown as W).__cutin.active(), undefined, { timeout: 120_000 })
    const v = await page.evaluate(() => (window as unknown as W).__cutin.view())
    const kind = v.plan.enemy ? 'enemy' : v.plan.links.length > 1 ? 'chain' : v.plan.full ? 'full' : 'short'
    seen.add(kind)
    seen.add(v.prebuilt ? 'prebuilt' : 'built')
    // every frame of the scene at 0.3 s steps (each one is drawn); a chain's next link mounts between runs
    for (let k = 0; k < 20 && (await page.evaluate(() => (window as unknown as W).__cutin.active())); k++) {
      await page.waitForFunction(() => (window as unknown as W).__cutin.ready() || !(window as unknown as W).__cutin.active(), undefined, { timeout: 120_000 })
      await page.evaluate(() => (window as unknown as W).__cutin.run(0.3))
    }
    await page.waitForFunction(() => !(window as unknown as W).__cutin.active(), undefined, { timeout: 60_000 })
    // the world's GPU sweep runs a tick after it unmounts
    await page.waitForTimeout(300)
    const now = await snap(page)
    expect.soft(now.info.programs, `programs after ${kind} #${n}`).toBe(base.info.programs)
    expect.soft(now.links, `shader links after ${kind} #${n}`).toBe(base.links)
    expect.soft(now.contexts, `WebGL contexts after ${kind} #${n}`).toBe(base.contexts)
    expect.soft(now.info.geometries, `geometries after ${kind} #${n}`).toBe(base.info.geometries)
    expect.soft(now.info.textures, `textures after ${kind} #${n}`).toBe(base.info.textures)
    n++
  }
  for (let i = 0; i < 400 && !want.every((k) => seen.has(k)); i++) {
    // play out any cut-in that started (the enemy's included), then let the bot pick the player's next order
    for (let k = 0; k < 200; k++) {
      const s = await page.evaluate(() => ({ idle: (window as unknown as W).__game.idle(), active: (window as unknown as W).__cutin.active(), result: !!(window as unknown as W).__game.state().result }))
      if (s.active) await play()
      else if (s.idle || s.result) break
      else await page.waitForTimeout(100)
    }
    if (await page.evaluate(() => !!(window as unknown as W).__game.state().result)) break
    const a = await page.evaluate(() => (window as unknown as W).__game.suggest())
    // every other order is previewed first (the prebuild path); the rest are confirmed at once (built at start)
    if ((a.type === 'attack' || a.type === 'stratagem') && i % 2 === 0) {
      await page.evaluate((x) => (window as unknown as W).__game.preview(x), a)
      await page.waitForFunction(() => (window as unknown as W).__cutin.prep().slots.some((s) => s.kind === 'next'), undefined, { timeout: 15_000 }).catch(() => {})
      await page.waitForFunction(() => (window as unknown as W).__cutin.prep().slots.every((s) => s.kind !== 'next' || s.ready), undefined, { timeout: 120_000 })
    }
    const r = await page.evaluate((x) => (window as unknown as W).__game.act(x), a)
    if (!r.ok) await page.evaluate(() => (window as unknown as W).__game.act({ type: 'endPhase' }))
  }
  expect([...seen].sort()).toEqual([...want].sort())
  expect(n).toBeGreaterThanOrEqual(4)
  expect(errors).toEqual([])
})

test('a prebuilt cut-in starts with a steady-length first frame and no long task (wall clock, software GL)', async ({ page }) => {
  test.setTimeout(900_000)
  const errors = await boot(page, 'cutins=all&enemycutins=off&seed=5&speed=full')
  for (let i = 0; i < 200; i++) {
    await page.waitForFunction(() => (window as unknown as W).__game.idle() || (window as unknown as W).__cutin.active(), undefined, { timeout: 120_000 })
    if (await page.evaluate(() => (window as unknown as W).__cutin.active())) {
      await page.evaluate(() => (window as unknown as W).__cutin.skip())
      continue
    }
    const a = await page.evaluate(() => (window as unknown as W).__game.suggest())
    if (a.type === 'attack' || a.type === 'stratagem') {
      await page.evaluate((x) => (window as unknown as W).__game.preview(x), a)
      await page.waitForFunction(() => (window as unknown as W).__cutin.prep().slots.some((s) => s.kind === 'next'), undefined, { timeout: 15_000 }).catch(() => {})
      await page.waitForFunction(() => (window as unknown as W).__cutin.prep().slots.every((s) => s.kind !== 'next' || s.ready), undefined, { timeout: 120_000 })
      const prebuilt = await page.evaluate(() => (window as unknown as W).__cutin.prep().slots.some((s) => s.kind === 'next' && s.ready))
      await page.evaluate((x) => (window as unknown as W).__game.act(x), a)
      if (!prebuilt) continue
      // let it play on the wall clock for 16 frames
      await page.waitForFunction(() => ((window as unknown as W).__perf.current()?.frames?.length ?? 0) >= 16 || !(window as unknown as W).__cutin.active(), undefined, { timeout: 300_000, polling: 250 })
      const rec = await page.evaluate(() => {
        const w = window as unknown as W
        const c = w.__perf.current() as unknown as { frames: { at: number; dur: number }[]; trigger: number; marks: { name: string }[] } | null
        return c ? { frames: c.frames, trigger: c.trigger, prebuilt: c.marks.some((m) => m.name === 'prebuilt-hit') } : null
      })
      if (!rec || rec.frames.length < 16) continue
      const tasks = await page.evaluate(() => (window as unknown as { __perf: { longTasks(): { start: number; dur: number }[] } }).__perf.longTasks())
      await page.evaluate(() => (window as unknown as W).__cutin.skip())
      const at = rec.frames.map((f) => f.at)
      const gaps = at.slice(1).map((x, k) => x - at[k]!)
      const steady = gaps.slice(5).sort((x, y) => x - y)[Math.floor(gaps.slice(5).length / 2)]!
      // the first frame's own time: from its draw to the next one (the steady frames are measured the same way)
      const first = gaps[0]!
      const shown = at[1]!
      const longest = tasks.filter((t) => t.start >= rec.trigger && t.start < rec.trigger + 1000).reduce((m, t) => Math.max(m, t.dur), 0)
      console.log(`prebuilt cut-in: first frame ${Math.round(first)} ms (shown ${Math.round(shown)} ms after the trigger), steady frame ${Math.round(steady)} ms, longest task ${Math.round(longest)} ms`)
      expect(rec.prebuilt).toBe(true)
      expect(first).toBeLessThanOrEqual(1.5 * steady)
      expect(longest).toBeLessThanOrEqual(1.5 * steady)
      // trigger to first frame on screen also waits out the board's last frame, still in the (software) GPU's queue
      expect(shown).toBeLessThanOrEqual(2.5 * steady)
      expect(errors).toEqual([])
      return
    }
    const r = await page.evaluate((x) => (window as unknown as W).__game.act(x), a)
    if (!r.ok) await page.evaluate(() => (window as unknown as W).__game.act({ type: 'endPhase' }))
  }
  throw new Error('no prebuilt cut-in played')
})
