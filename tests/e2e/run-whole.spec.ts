import { expect, test, type Page } from '@playwright/test'

// Roads to War, era 1: a whole run driven through the UI with a fixed policy, from the title to the end of the run.
// Stops: the non-battle slip that leaves the most "rice lasts N days" (else the first payable slip); markets: hire nobody;
// the road: the first leg at the normal pace. Battles are fought by the greedy bot at Instant speed (window.__game.runAutoBattle),
// against the random tier: the flow is under test, not the balance.

test.use({ viewport: { width: 1280, height: 800 } })

type G = {
  runView: () => string
  runState: () => { phase: string; day: number; rice: number; picks: string[]; stats: { battles: number }; end: { kind: string } | null; stop: { id: string } | null } | null
  runAutoBattle: () => Promise<string>
  screen: () => string
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./?test=1&bot=random')
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  return errors
}
const view = (page: Page) => page.evaluate(() => (window as unknown as { __game: G }).__game.runView())
const screen = (page: Page) => page.evaluate(() => (window as unknown as { __game: G }).__game.screen())

test('run: a whole era-1 run from the title to the end, battles by the greedy bot', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = await boot(page)
  await expect(page.getByTestId('title-screen')).toBeVisible()
  await page.getByTestId('run-title').click()
  await expect(page.getByTestId('run-new')).toBeVisible()
  await page.getByTestId('run-seed').fill('1')
  await expect(page.getByTestId('run-iron-oath')).toHaveAttribute('aria-checked', 'false')
  await page.getByTestId('run-begin').click()

  // the prologue in slips
  await expect(page.getByTestId('run-slips')).toBeVisible()
  await expect(page.getByTestId('speech-text')).not.toBeEmpty()
  await page.getByTestId('run-slip-next').click()
  await page.getByTestId('run-skip').click()

  const seen: string[] = []
  let battles = 0
  for (let i = 0; i < 80; i++) {
    const sc = await screen(page)
    if (sc === 'battle') {
      const r = await page.evaluate(() => (window as unknown as { __game: G }).__game.runAutoBattle())
      expect(['won', 'lost']).toContain(r)
      battles += 1
      continue
    }
    const v = await view(page)
    seen.push(v)
    if (v === 'end') break
    if (v === 'slips') {
      await page.getByTestId('run-skip').click()
    } else if (v === 'stop') {
      const slips = page.locator('[data-testid^="choice-"]')
      await expect(slips.first()).toBeVisible()
      const all = await slips.evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid')!, kind: e.getAttribute('data-kind'), lasts: Number(e.getAttribute('data-lasts')), ok: e.getAttribute('data-payable') === 'yes' })))
      const ok = all.filter((x) => x.ok)
      const plain = ok.filter((x) => x.kind !== 'battle')
      const pick = plain.length ? plain.reduce((a, b) => (b.lasts > a.lasts ? b : a)) : ok[0]!
      await page.getByTestId(pick.id).click()
      await expect(page.getByTestId(pick.id)).toHaveAttribute('aria-pressed', 'true')
      await page.getByTestId('stop-seal').click()
    } else if (v === 'market') {
      await page.getByTestId('hire-seal').click()
    } else if (v === 'road') {
      await expect(page.getByTestId('road-map')).toBeVisible()
      await expect(page.getByTestId('hud-forecast')).toContainText('Guangzong will need about')
      await page.getByTestId('road-seal').click()
    } else if (v === 'finale') {
      await expect(page.getByTestId('finale-lines').locator('li').first()).toContainText('You arrived on day')
      await page.screenshot({ path: 'e2e-out/run-finale.png' })
      await page.getByTestId('to-finale-deploy').click()
    } else if (v === 'deploy') {
      await expect(page.getByTestId('slider-liu-bei')).toBeVisible()
      await expect(page.getByTestId('deploy-seal')).toBeEnabled()
      await page.getByTestId('deploy-seal').click()
      await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle', undefined, { timeout: 30_000 })
    } else if (v === 'report') {
      await expect(page.getByTestId('report-losses')).toContainText('Lost')
      await page.getByTestId('report-continue').click()
    }
    await page.waitForTimeout(50)
  }
  const st = await page.evaluate(() => (window as unknown as { __game: G }).__game.runState())
  expect(st?.end).not.toBeNull()
  expect(['won', 'defeated', 'routed', 'starved']).toContain(st!.end!.kind)
  expect(battles).toBeGreaterThanOrEqual(1)
  expect(seen).toContain('road')
  expect(seen).toContain('stop')
  expect(seen).toContain('deploy')
  await expect(page.getByTestId('run-end')).toBeVisible()
  expect(await page.getByTestId('run-annal-lines').locator('li').count()).toBeGreaterThan(5)
  await page.screenshot({ path: 'e2e-out/run-end.png' })
  // reaching Guangzong is the point of the fixed policy on this seed (it never starves on the road)
  expect(st!.picks.length).toBeGreaterThanOrEqual(6)
  // the end is in the Annals on the New run screen
  await page.getByTestId('run-end-new').click()
  await expect(page.getByTestId('run-annals')).toBeVisible()
  await expect(page.getByTestId('run-continue')).toHaveCount(0)
  expect(errors).toEqual([])
})
