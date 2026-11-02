import { expect, test, type Page } from '@playwright/test'

// Lite overlays on phones (PLAN D33, docs/spec/51 "Performance: per-frame budgets and quality tiers"). The cut-in's HTML
// overlays are drawn by the page compositor, outside the WebGL draw-call budget: on iPhone the cavalry charge's speed lines
// (a full-screen SVG with feTurbulence + feDisplacementMap that changes every frame), the depth-of-field backdrop blur and the
// whip-pan blur on the canvas dropped the scene to a few fps even at Low. At Medium and Low no element of the cut-in frame may
// carry a CSS filter, an SVG filter or a backdrop filter at any beat of any scene; at High the authored filters are still there.
const SCENES = ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']

type Cinema = { ready: boolean; setTime(t: number): Promise<void>; beats(): { id: string; start: number; end: number }[] }
type Win = Window & { __cinema?: Cinema }

async function filtered(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="cutin-frame"]')
    if (!root) return ['no cutin-frame']
    const out: string[] = []
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.tagName.toLowerCase() === 'filter') {
        out.push('<filter> element')
        continue
      }
      const cs = getComputedStyle(el)
      const bf = cs.getPropertyValue('backdrop-filter') || cs.getPropertyValue('-webkit-backdrop-filter')
      if (cs.filter && cs.filter !== 'none') out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString?.() ?? ''} filter ${cs.filter}`)
      if (bf && bf !== 'none') out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString?.() ?? ''} backdrop ${bf}`)
    }
    return out
  })
}

async function sweep(page: Page, scene: string, quality: string): Promise<{ beats: number; hits: string[]; speed: boolean }> {
  await page.goto(`./cinema.html?test=1&ui=0&t=0&scene=${scene}&quality=${quality}`)
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true, undefined, { timeout: 120_000 })
  const beats = await page.evaluate(() => (window as Win).__cinema!.beats())
  const hits: string[] = []
  let speed = false
  for (const b of beats) {
    for (const f of [0.25, 0.5, 0.75]) {
      await page.evaluate((t) => (window as Win).__cinema!.setTime(t), b.start + (b.end - b.start) * f)
      for (const h of await filtered(page)) hits.push(`${b.id}: ${h}`)
      if (await page.locator('.co-speed').count()) speed = true
    }
  }
  return { beats: beats.length, hits, speed }
}

for (const quality of ['low', 'medium'] as const) {
  test(`no filter or backdrop blur anywhere in the cut-in at ${quality}, every scene, every beat`, async ({ page }) => {
    test.setTimeout(900_000)
    await page.setViewportSize({ width: 390, height: 844 })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    for (const scene of SCENES) {
      const r = await sweep(page, scene, quality)
      expect(r.beats).toBeGreaterThan(0)
      expect(r.hits, `${scene} at ${quality}`).toEqual([])
      await expect(page.locator('.co-overlay')).toHaveAttribute('data-overlay', 'lite')
    }
    expect(errors).toEqual([])
  })
}

test('High keeps the authored overlay filters, and the charge still shows its speed lines at Low', async ({ page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  const high = await sweep(page, 'C', 'high')
  expect(high.hits.length).toBeGreaterThan(0)
  await expect(page.locator('.co-overlay')).toHaveAttribute('data-overlay', 'full')
  await page.setViewportSize({ width: 390, height: 844 })
  const low = await sweep(page, 'C', 'low')
  expect(low.hits).toEqual([])
  expect(low.speed).toBe(true)
})
