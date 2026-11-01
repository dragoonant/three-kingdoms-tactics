import { expect, test, type Page } from '@playwright/test'

// Cut-ins in real battles (docs/spec/51 v0.3). The cut-in clock is stepped by hand (window.__cutin) so the software-GL speed
// does not matter; the scenes themselves are checked frame by frame on the review page (cinema.spec.ts).
test.use({ viewport: { width: 1280, height: 720 } })

type Act = { type: string; unit?: string; target?: string; strat?: string }
type Game = {
  state: () => { round: number; side: string; result: unknown; units: { id: string; troops: number; side: string }[] }
  scene: () => { units: { id: string; troops: number }[] }
  suggest: () => Act
  act: (a: unknown) => { ok: boolean }
  idle: () => boolean
  begin: () => void
  setSpeed: (s: 'full' | 'quick' | 'instant') => void
}
type Cutin = {
  active: () => boolean
  ready: () => boolean
  manual: (on: boolean) => void
  run: (dt?: number, max?: number) => number
  step: (dt: number) => void
  view: () => { plan: { full: boolean; links: { scene: string; damage: number; stratName: string; caster: { name: string } }[] } }
  skip: () => void
  history: () => { id: string; officer: string; title: string; damage: string }[]
}
async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`./?test=1&${query}`)
  await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 90_000 })
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.begin())
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle(), undefined, { timeout: 120_000 })
  return errors
}

/** Let the greedy bot play the player's side until it proposes an action of this kind; returns it (not yet applied). */
async function until(page: Page, kind: 'stratagem' | 'attack'): Promise<Act> {
  for (let i = 0; i < 300; i++) {
    // a cut-in of an action we passed over is skipped; the clock is manual here
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle() || !!(window as unknown as { __game: Game }).__game.state().result || (window as unknown as { __cutin: Cutin }).__cutin.active(), undefined, { timeout: 120_000 })
    if (await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())) {
      await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
      continue
    }
    const a = await page.evaluate(() => (window as unknown as { __game: Game }).__game.suggest())
    if (a.type === kind) return a
    const r = await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)
    if (!r.ok) await page.evaluate(() => (window as unknown as { __game: Game }).__game.act({ type: 'endPhase' }))
  }
  throw new Error(`no ${kind} proposed`)
}

const troops = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => Object.fromEntries((window as unknown as { __game: Game }).__game.state().units.map((u) => [u.id, u.troops])))
const presented = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => Object.fromEntries((window as unknown as { __game: Game }).__game.scene().units.map((u) => [u.id, u.troops])))

test('a stratagem in battle plays its scene with the officer and the event damage, then the board shows the same troop numbers as the engine', async ({ page }) => {
  const errors = await boot(page, 'cutins=all&enemycutins=off&seed=5&speed=full')
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.manual(true))
  const a = await until(page, 'stratagem')
  const before = await troops(page)
  expect((await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)).ok).toBe(true)
  const after = await troops(page)
  // what the engine did, as the damage to each unit
  const dealt = Object.keys(before).reduce((sum, id) => sum + Math.max(0, before[id]! - (after[id] ?? 0)), 0)
  const layer = page.getByTestId('cutin-layer')
  await expect(layer).toBeVisible({ timeout: 90_000 })
  const v = await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.view())
  expect(v.plan.full).toBe(true)
  await expect(layer).toHaveAttribute('data-kind', 'full')
  // while it plays the board has not changed yet
  expect(await presented(page)).toEqual(before)
  await page.waitForFunction(() => (window as unknown as { __cutin: Cutin }).__cutin.ready(), undefined, { timeout: 120_000 })
  await expect(layer).toHaveAttribute('data-officer', /.+/)
  expect(Number(await layer.getAttribute('data-damage'))).toBeGreaterThan(0)
  const h0 = await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.history())
  expect(h0[0]!.damage).toBe(`−${Number(await layer.getAttribute('data-damage')).toLocaleString('en-US')}`)
  await page.screenshot({ path: 'e2e-out/battle-cutin-start.png' })
  // total damage over the links equals what the engine dealt (the same numbers)
  const total = v.plan.links.reduce((s, l) => s + l.damage, 0)
  expect(total).toBe(dealt)
  expect(total).toBeGreaterThan(0)
  // run the clock to the end
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.run(1 / 8))
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle(), undefined, { timeout: 60_000 })
  await expect(layer).toHaveCount(0)
  expect(await presented(page)).toEqual(await troops(page))
  expect(errors).toEqual([])
})

test('a click skips the cut-in: it stops at once and the board shows the engine result', async ({ page }) => {
  const errors = await boot(page, 'cutins=all&enemycutins=off&seed=5&speed=full')
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.manual(true))
  const a = await until(page, 'stratagem')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)
  const layer = page.getByTestId('cutin-layer')
  await expect(layer).toBeVisible({ timeout: 90_000 })
  await page.mouse.click(640, 360)
  await expect(layer).toHaveCount(0)
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle(), undefined, { timeout: 30_000 })
  expect(await presented(page)).toEqual(await troops(page))
  expect(await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())).toBe(false)
  expect(errors).toEqual([])
})

test('Stratagems and chains only: a normal attack has no cut-in, a stratagem does', async ({ page }) => {
  const errors = await boot(page, 'cutins=strat&enemycutins=off&seed=5&speed=full')
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.manual(true))
  const atk = await until(page, 'attack')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), atk)
  expect(await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())).toBe(false)
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setSpeed('instant'))
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setSpeed('full'))
  const st = await until(page, 'stratagem')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), st)
  await expect(page.getByTestId('cutin-layer')).toBeVisible({ timeout: 90_000 })
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
  expect(errors).toEqual([])
})

test('Full and short: a normal attack shows a short scene', async ({ page }) => {
  const errors = await boot(page, 'cutins=all&enemycutins=off&seed=5&speed=full')
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.manual(true))
  const atk = await until(page, 'attack')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), atk)
  const layer = page.getByTestId('cutin-layer')
  await expect(layer).toBeVisible({ timeout: 90_000 })
  await expect(layer).toHaveAttribute('data-kind', 'short')
  await expect(layer).toHaveAttribute('data-scene', /^S-/)
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
  expect(errors).toEqual([])
})

test('Off and Instant play no cut-ins', async ({ page }) => {
  let errors = await boot(page, 'cutins=off&seed=5&speed=full')
  const a = await until(page, 'stratagem')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)
  expect(await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())).toBe(false)
  expect(errors).toEqual([])
  await page.evaluate(() => (window as unknown as { __game: Game }).__game.setSpeed('instant'))
  await page.reload()
  errors = await boot(page, 'cutins=all&seed=5&speed=instant')
  const b = await until(page, 'stratagem')
  await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), b)
  expect(await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())).toBe(false)
  expect(errors).toEqual([])
})

test('the sound panel holds the two scene settings and remembers them', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('sound-btn').click()
  const dlg = page.getByRole('dialog', { name: 'Sound settings' })
  await expect(dlg.getByTestId('battle-scenes-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(dlg.getByTestId('enemy-scenes-same')).toHaveAttribute('aria-pressed', 'true')
  await dlg.getByTestId('battle-scenes-strat').click()
  await dlg.getByTestId('enemy-scenes-off').click()
  await expect(dlg.getByTestId('battle-scenes-strat')).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'e2e-out/scene-settings.png' })
  await page.reload()
  await page.getByTestId('sound-btn').click()
  const dlg2 = page.getByRole('dialog', { name: 'Sound settings' })
  await expect(dlg2.getByTestId('battle-scenes-strat')).toHaveAttribute('aria-pressed', 'true')
  await expect(dlg2.getByTestId('enemy-scenes-off')).toHaveAttribute('aria-pressed', 'true')
  await expect(dlg2.getByText('OK')).toHaveCount(0)
})
