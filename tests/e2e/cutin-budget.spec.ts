import { expect, test, type Page } from '@playwright/test'

// Per-frame budgets of the cut-ins on phones (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32).
// Every scene type plays on the review page at a phone viewport (390 x 844) at the Low and Medium tiers, with a mounted
// defender (the heaviest target), and every beat's frame must stay under the tier's draw-call budget, shadow pass included
// (renderer.info counts both: the shadow map renders inside gl.render). Draw calls do not depend on the GPU, so the software GL
// of headless Chromium measures them exactly; its frame rate is not the gate.
const SCENES = ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']
const BUDGET: Record<string, number> = { low: 300, medium: 500 }

type Cinema = { ready: boolean; setTime(t: number): Promise<void>; beats(): { id: string; start: number; end: number }[] }
type Win = Window & { __cinema?: Cinema; __r3f?: { gl: { info: { render: { calls: number; triangles: number } } } }; __cutinQuality?: () => { tier: string } }

async function peakCalls(page: Page, scene: string, quality: string): Promise<{ calls: number; beat: string; tier: string }> {
  await page.goto(`./cinema.html?test=1&ui=0&t=0&scene=${scene}&def=cavalry&quality=${quality}`)
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true && !!(window as Win).__r3f, undefined, { timeout: 120_000 })
  const tier = await page.evaluate(() => (window as Win).__cutinQuality!().tier)
  const beats = await page.evaluate(() => (window as Win).__cinema!.beats())
  let best = { calls: 0, beat: '', tier }
  for (const b of beats) {
    const calls = await page.evaluate(async (t) => {
      const w = window as Win
      await w.__cinema!.setTime(t)
      return w.__r3f!.gl.info.render.calls
    }, (b.start + b.end) / 2)
    if (calls > best.calls) best = { calls, beat: b.id, tier }
  }
  return best
}

for (const quality of ['low', 'medium'] as const) {
  test(`every scene stays under the ${quality} budget (${BUDGET[quality]} draw calls, shadows included) on a phone`, async ({ page }) => {
    test.setTimeout(900_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const rows: string[] = []
    for (const scene of SCENES) {
      const r = await peakCalls(page, scene, quality)
      rows.push(`${scene} ${r.calls} @ ${r.beat}`)
      expect(r.tier).toBe(quality)
      expect(r.calls, `${scene} at ${quality}: peak ${r.calls} draw calls at beat ${r.beat}`).toBeLessThanOrEqual(BUDGET[quality]!)
      // something was drawn
      expect(r.calls).toBeGreaterThan(20)
    }
    console.log(`${quality}: ${rows.join(', ')}`)
    expect(errors).toEqual([])
  })
}
