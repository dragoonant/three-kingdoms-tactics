import { expect, test, type Page } from '@playwright/test'

// Roads to War screens: the deploy screen's live numbers, the Hungry chip and the seal's refusal (RL-DEPLOY-*, RL-HUNGER-1),
// and the road, stop and deploy screens at phone size (390x844) with no horizontal overflow.

type RunState = {
  rice: number
  soldiers: number
  wounded: number
  phase: string
  band: { rec: { officerId: string } }[]
}
type G = {
  runView: () => string
  runState: () => RunState | null
  runLoadSave: (s: RunState) => boolean
  screen: () => string
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('./?test=1&bot=random')
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  return errors
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __game: G }).__game.runState()!)

async function noSideScroll(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }))
  expect(o.sw).toBeLessThanOrEqual(o.iw)
  expect(o.bw).toBeLessThanOrEqual(o.iw)
}

/** Move a range input as a drag would (the native setter, then an input event React hears). */
async function setRange(page: Page, testid: string, v: number): Promise<void> {
  await page.getByTestId(testid).evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(el, String(val))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, v)
}
async function field(page: Page, a: number, b: number, c: number): Promise<void> {
  await setRange(page, 'slider-liu-bei', a)
  await setRange(page, 'slider-guan-yu', b)
  await setRange(page, 'slider-zhang-fei', c)
}

/** Title -> new run (seed 1) -> prologue -> the Zhuo notice. */
async function toZhuo(page: Page): Promise<void> {
  await page.getByTestId('run-title').click()
  await page.getByTestId('run-seed').fill('1')
  await page.getByTestId('run-begin').click()
  await page.getByTestId('run-skip').click() // prologue
  await page.getByTestId('run-skip').click() // the notice's slips
  await expect(page.getByTestId('stop')).toBeVisible()
}
/** Zhuo (levy) -> market -> road -> Daxing Hill (fight) -> deploy. */
async function zhuoToDeploy(page: Page, shots?: string): Promise<void> {
  await page.getByTestId('choice-levy').click()
  await page.getByTestId('stop-seal').click()
  await page.getByTestId('hire-seal').click()
  await expect(page.getByTestId('road')).toBeVisible()
  if (shots) {
    await noSideScroll(page)
    await page.screenshot({ path: `e2e-out/run-road-${shots}.png` })
  }
  await page.getByTestId('road-seal').click()
  await page.getByTestId('run-skip').click()
  await page.getByTestId('choice-fight').click()
  await page.getByTestId('stop-seal').click()
  await expect(page.getByTestId('deploy')).toBeVisible()
}

test('run deploy: Liu Bei always in, live rice numbers, the Hungry chip and the seal that refuses', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  const errors = await boot(page)
  await toZhuo(page)
  await expect(page.getByTestId('choice-levy')).toContainText('rice +30')
  await page.screenshot({ path: 'e2e-out/run-stop-desktop.png' })
  await zhuoToDeploy(page, 'desktop')
  await expect(page.getByTestId('bench-liu-bei')).toHaveCount(0)
  await expect(page.getByTestId('slider-liu-bei')).toHaveAttribute('step', '50')
  await expect(page.getByTestId('slider-liu-bei')).toHaveAttribute('min', '250')
  // fielded and rice follow the sliders
  await field(page, 1000, 500, 250)
  await expect(page.getByTestId('qm-fielded')).toHaveText('1,750')
  await expect(page.getByTestId('qm-rice')).toHaveText('-7 bags')
  const st = await state(page)
  await expect(page.getByTestId('qm-left')).toHaveText(String(st.rice - 7))
  await expect(page.getByTestId('qi-line')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/run-deploy-desktop.png' })

  // a hungry band: after the battle's rice the sacks last under 3 days
  const upkeep = Math.ceil((st.soldiers + st.wounded) / 500)
  await page.evaluate((s) => (window as unknown as { __game: G }).__game.runLoadSave(s), { ...st, rice: 7 + 2 * upkeep })
  await expect(page.getByTestId('deploy')).toBeVisible()
  await field(page, 1000, 500, 250)
  await expect(page.getByTestId('hungry-chip')).toBeVisible()
  await expect(page.getByTestId('qi-line')).toContainText('Hungry')
  await expect(page.getByTestId('deploy-seal')).toBeEnabled()

  // a deployment that would leave 0 rice: the seal refuses, with the reason
  await page.evaluate((s) => (window as unknown as { __game: G }).__game.runLoadSave(s), { ...st, rice: 7 })
  await setRange(page, 'slider-liu-bei', 1750)
  await expect(page.getByTestId('qm-rice')).toHaveText('-7 bags')
  await expect(page.getByTestId('deploy-reason')).toContainText('would leave no rice')
  await expect(page.getByTestId('deploy-seal')).toBeDisabled()
  expect(errors).toEqual([])
})

test('run screens at phone size: stop, road and deploy fit 390 wide', async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await boot(page)
  await expect(page.getByTestId('run-title')).toBeVisible()
  await toZhuo(page)
  await noSideScroll(page)
  await page.screenshot({ path: 'e2e-out/run-stop-phone.png' })
  await zhuoToDeploy(page, 'phone')
  await noSideScroll(page)
  await expect(page.getByTestId('deploy-seal')).toBeVisible()
  await page.screenshot({ path: 'e2e-out/run-deploy-phone.png' })
  expect(errors).toEqual([])
})
