import { expect, test } from '@playwright/test'

// Auto quality (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32): when a cut-in's frames stay slow,
// Auto steps down one tier live, remembers it on the device, and does it without a new WebGL context. The test hook inflates
// every measured frame interval (`__cutinQuality.inflate`), so the software GL's own pace does not matter.
type Q = (() => { choice: string; auto: string; tier: string; steps: number }) & { inflate(ms: number | null): void }
type Win = Window & { __cinema?: { ready: boolean }; __cutinQuality?: Q; __perf?: { contexts(): number } }

test('Auto steps down a tier when frames stay slow, remembers it, and keeps its WebGL context', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // ?quality=auto turns the live governor on in test mode; the scene plays on the wall clock, looping
  await page.goto('./cinema.html?test=1&perf=1&scene=W&quality=auto')
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true, undefined, { timeout: 120_000 })
  await page.getByRole('button', { name: 'Loop' }).click()
  await page.getByTestId('play').click()
  const start = await page.evaluate(() => (window as Win).__cutinQuality!())
  expect(start.choice).toBe('auto')
  expect(start.tier).toBe('high')
  const contexts = await page.evaluate(() => (window as Win).__perf!.contexts())
  // frames that read as 60 fps: no step
  await page.evaluate(() => (window as Win).__cutinQuality!.inflate(0))
  await page.waitForTimeout(3000)
  expect((await page.evaluate(() => (window as Win).__cutinQuality!())).steps).toBe(0)
  // every frame now reads as about 60 ms
  await page.evaluate(() => (window as Win).__cutinQuality!.inflate(43))
  await page.waitForFunction(() => (window as Win).__cutinQuality!().tier === 'medium', undefined, { timeout: 120_000 })
  const after = await page.evaluate(() => (window as Win).__cutinQuality!())
  expect(after.steps).toBe(1)
  expect(after.auto).toBe('medium')
  expect(await page.evaluate(() => localStorage.getItem('tkt.cutinQuality.auto.v1'))).toBe('medium')
  expect(await page.evaluate(() => (window as Win).__perf!.contexts())).toBe(contexts)
  // it keeps going down while frames stay slow, and stops at Low
  await page.waitForFunction(() => (window as Win).__cutinQuality!().tier === 'low', undefined, { timeout: 120_000 })
  await page.waitForTimeout(1000)
  expect((await page.evaluate(() => (window as Win).__cutinQuality!())).tier).toBe('low')
  expect(await page.evaluate(() => (window as Win).__perf!.contexts())).toBe(contexts)
  // a reload starts at the remembered tier
  await page.reload()
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true, undefined, { timeout: 120_000 })
  expect((await page.evaluate(() => (window as Win).__cutinQuality!())).tier).toBe('low')
  expect(errors).toEqual([])
})

test('the settings panel sets the cut-in quality by hand and remembers it; ?quality= overrides it', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('sound-btn').click()
  const dlg = page.getByRole('dialog', { name: 'Sound settings' })
  // Auto by default, with the tier it picked
  await expect(dlg.getByTestId('cutin-quality-auto')).toHaveAttribute('aria-pressed', 'true')
  await expect(dlg.getByTestId('cutin-quality-auto')).toContainText(/Auto \((High|Medium|Low)\)/)
  await dlg.getByTestId('cutin-quality-low').click()
  await expect(dlg.getByTestId('cutin-quality-low')).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'e2e-out/cutin-quality-settings.png' })
  await page.reload()
  await page.getByTestId('sound-btn').click()
  await expect(page.getByRole('dialog', { name: 'Sound settings' }).getByTestId('cutin-quality-low')).toHaveAttribute('aria-pressed', 'true')
  await page.goto('./cinema.html?test=1&ui=0&scene=W&quality=medium')
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true, undefined, { timeout: 120_000 })
  expect((await page.evaluate(() => (window as Win).__cutinQuality!())).tier).toBe('medium')
})

test('?perf=hud shows fps, frame times, draw calls and the tier, on the board and in a cut-in', async ({ page }) => {
  await page.goto('./?test=1&perf=hud&seed=5')
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 120_000 })
  const hud = page.getByTestId('perf-hud')
  await expect(hud).toContainText(/\d+ fps +[\d.]+ \/ [\d.]+ ms/, { timeout: 30_000 })
  await expect(hud).toContainText(/board: \d+ calls +\d+k tris/)
  await expect(hud).toContainText(/cut-ins: high/)
  await page.goto('./cinema.html?test=1&perf=hud&ui=0&scene=W&quality=low')
  await page.waitForFunction(() => (window as Win).__cinema?.ready === true, undefined, { timeout: 120_000 })
  await expect(page.getByTestId('perf-hud')).toContainText(/cutin: \d+ calls/, { timeout: 30_000 })
  await expect(page.getByTestId('perf-hud')).toContainText(/cut-ins: low/)
})
