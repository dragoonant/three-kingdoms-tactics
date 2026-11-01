import { expect, test, type Page } from '@playwright/test'

// The cut-in review page (docs/spec/51). Headless WebGL is software-rendered, so frames are scrubbed by setting t.
type Cinema = {
  ready: boolean
  setTime(t: number): Promise<void>
  scene(id?: string): string
  duration(): number
  time(): number
  beats(): { id: string; start: number; end: number; label: string }[]
}
const cinema = <T>(page: Page, fn: (c: Cinema) => T | Promise<T>): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__cinema)`) as Promise<T>

async function open(page: Page, query = '?test=1'): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`./cinema.html${query}`)
  await page.waitForFunction(() => (window as unknown as { __cinema?: Cinema }).__cinema?.ready === true, undefined, { timeout: 90_000 })
  return errors
}

test('cinema page loads with both scenes, the beat list and the scrubber', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors = await open(page)
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByTestId('scene-A')).toBeVisible()
  await expect(page.getByTestId('scene-B')).toBeVisible()
  await expect(page.getByTestId('scrubber')).toBeVisible()
  await expect(page.getByTestId('beats').locator('button')).toHaveCount(6)
  await expect(page.getByTestId('beat-A1')).toHaveAttribute('aria-current', 'step')
  expect(await cinema(page, (c) => c.duration())).toBe(7)
  await page.screenshot({ path: 'e2e-out/cinema-ui.png' })
  expect(errors).toEqual([])
})

for (const [id, beatCount] of [
  ['A', 6],
  ['B', 7],
] as const) {
  test(`scene ${id}: scrubs to every beat with no page errors and the beat list follows`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const errors = await open(page, `?test=1&scene=${id}`)
    expect(await cinema(page, (c) => c.scene())).toBe(id)
    const beats = await cinema(page, (c) => c.beats())
    expect(beats.length).toBe(beatCount)
    for (const b of beats) {
      await page.evaluate((t) => (window as unknown as { __cinema: Cinema }).__cinema.setTime(t), (b.start + b.end) / 2)
      await expect(page.getByTestId(`beat-${b.id}`)).toHaveAttribute('aria-current', 'step')
      await expect(page.getByTestId('time')).toContainText(((b.start + b.end) / 2).toFixed(2))
    }
    // the very end and the very start
    await page.evaluate(() => (window as unknown as { __cinema: Cinema }).__cinema.setTime(7))
    await expect(page.getByTestId(`beat-${beats[beats.length - 1]!.id}`)).toHaveAttribute('aria-current', 'step')
    await page.evaluate(() => (window as unknown as { __cinema: Cinema }).__cinema.setTime(0))
    await expect(page.getByTestId(`beat-${id}1`)).toHaveAttribute('aria-current', 'step')
    expect(errors).toEqual([])
  })
}

test('clicking a beat jumps to it; the scene picker switches scenes; free camera and safe frame toggle', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors = await open(page)
  await page.getByTestId('beat-A4').click()
  expect(await cinema(page, (c) => c.time())).toBeGreaterThanOrEqual(2.6)
  expect(await cinema(page, (c) => c.time())).toBeLessThan(2.7)
  await expect(page.getByTestId('beat-A4')).toHaveAttribute('aria-current', 'step')
  await expect(page.getByTestId('scrubber')).toHaveAttribute('aria-valuenow', /^2\.6/)

  await page.getByTestId('scene-B').click()
  await expect(page.getByTestId('beats').locator('button')).toHaveCount(7)
  await page.getByTestId('beat-B5').click()
  await expect(page.getByTestId('beat-B5')).toHaveAttribute('aria-current', 'step')
  expect(await cinema(page, (c) => c.scene())).toBe('B')

  const free = page.getByTestId('free-cam')
  await free.click()
  await expect(free).toHaveAttribute('aria-pressed', 'true')
  await free.click()
  await expect(free).toHaveAttribute('aria-pressed', 'false')
  const safe = page.getByTestId('safe-frame')
  await safe.click()
  await expect(page.locator('.co-safe')).toHaveCount(1)
  await safe.click()
  await expect(page.locator('.co-safe')).toHaveCount(0)

  // no native tooltips anywhere on the page
  expect(await page.locator('[title]').count()).toBe(0)
  expect(errors).toEqual([])
})

test('gallery tab shows the turntables', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors = await open(page)
  await page.getByTestId('tab-gallery').click()
  await expect(page.getByTestId('gallery-canvas').locator('canvas')).toHaveCount(1)
  await expect(page.locator('.gal-label').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/cinema-gallery.png' })
  expect(errors).toEqual([])
})

test('?ui=0 renders one frozen frame with no chrome; ?t= sets the time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors = await open(page, '?scene=B&t=3.62&ui=0&test=1')
  await expect(page.locator('.cin-head')).toHaveCount(0)
  await expect(page.locator('canvas')).toHaveCount(1)
  expect(await cinema(page, (c) => c.scene())).toBe('B')
  expect(await cinema(page, (c) => c.time())).toBeCloseTo(3.62, 5)
  // the hit-stop frame carries the ink splash
  await expect(page.locator('.co-ink')).toHaveCount(1)
  await page.screenshot({ path: 'e2e-out/cinema-b-impact.png' })
  expect(errors).toEqual([])
})

test('phone width: controls collapse below the frame and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await open(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const frame = await page.getByTestId('cutin-frame').boundingBox()
  const bar = await page.getByTestId('play').boundingBox()
  expect(frame!.width).toBeLessThanOrEqual(390)
  expect(bar!.y).toBeGreaterThan(frame!.y + frame!.height - 1)
  await page.screenshot({ path: 'e2e-out/cinema-phone.png', fullPage: true })
  expect(errors).toEqual([])
})

// v0.3: the scenes played in real battles are on the review page too, with sample parameters.
for (const [id, beatCount] of [
  ['Ap', 6],
  ['C', 6],
  ['D', 6],
  ['R', 4],
  ['W', 4],
  ['S-melee', 5],
  ['S-cavalry', 5],
  ['S-archer', 5],
] as const) {
  test(`scene ${id}: on the picker, beat list and scrubber follow every beat`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const errors = await open(page, `?test=1&scene=${id}`)
    await expect(page.getByTestId(`scene-${id}`)).toHaveAttribute('aria-pressed', 'true')
    expect(await cinema(page, (c) => c.scene())).toBe(id)
    const beats = await cinema(page, (c) => c.beats())
    expect(beats.length).toBe(beatCount)
    await expect(page.getByTestId('beats').locator('button')).toHaveCount(beatCount)
    for (const b of beats) {
      await page.evaluate((t) => (window as unknown as { __cinema: Cinema }).__cinema.setTime(t), (b.start + b.end) / 2)
      await expect(page.getByTestId(`beat-${b.id}`)).toHaveAttribute('aria-current', 'step')
    }
    expect(errors).toEqual([])
  })
}

test('the picker lists all ten scenes and its terrain and arc variants rebuild the scene', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors = await open(page, '?test=1&scene=S-melee')
  for (const id of ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']) await expect(page.getByTestId(`scene-${id}`)).toBeVisible()
  await page.getByTestId('terrain-forest').click()
  await page.getByTestId('arc-side').click()
  await expect(page.getByTestId('arc-side')).toHaveAttribute('aria-pressed', 'true')
  await page.waitForFunction(() => (window as unknown as { __cinema: Cinema }).__cinema.ready === true, undefined, { timeout: 90_000 })
  expect(errors).toEqual([])
})
