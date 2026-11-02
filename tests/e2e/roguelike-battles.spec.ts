import { expect, test, type Page } from '@playwright/test'

// RL1b: each era 1 minor battle loads and plays a few rounds at instant speed (greedy bot for the player, the real AI for the
// enemy), and a cut-in against the `court` escort casts the defenders in the iron-grey palette (R2-SIDE-2).
// SwiftShader renders at 2-3 fps here, so this stays lean: cut-ins off for the battle runs, one manual-clock cut-in.
test.use({ viewport: { width: 1280, height: 720 } })

type Act = { type: string; unit?: string; target?: string; strat?: string }
type Game = {
  state: () => { battleId: string; round: number; side: string; result: unknown; units: { id: string; side: string; done: boolean }[]; escaped: string[] }
  suggest: () => Act
  act: (a: unknown) => { ok: boolean }
  idle: () => boolean
  begin: () => void
}
type Cutin = {
  active: () => boolean
  ready: () => boolean
  manual: (on: boolean) => void
  run: (dt?: number, max?: number) => number
  skip: () => void
  view: () => { plan: { links: { defender: { palette: string } | null; caster: { palette: string } }[] } }
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

/** The greedy bot plays the player's phases until `rounds` have passed or the battle ends; the AI plays the enemy. */
async function playRounds(page: Page, rounds: number): Promise<void> {
  const start = await page.evaluate(() => (window as unknown as { __game: Game }).__game.state().round)
  for (let i = 0; i < 200; i++) {
    await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle(), undefined, { timeout: 120_000 })
    const s = await page.evaluate(() => (window as unknown as { __game: Game }).__game.state())
    if (s.result || s.round >= start + rounds) return
    const a = await page.evaluate(() => (window as unknown as { __game: Game }).__game.suggest())
    const r = await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)
    if (!r.ok) await page.evaluate(() => (window as unknown as { __game: Game }).__game.act({ type: 'endPhase' }))
  }
}

for (const id of ['rl-village-siege', 'rl-bandit-pass', 'rl-prison-cart', 'rl-dong-zhuo-rescue']) {
  test(`${id} loads and plays two rounds at instant speed`, async ({ page }) => {
    const errors = await boot(page, `battle=${id}&seed=3&speed=instant&cutins=off&enemycutins=off`)
    const s0 = await page.evaluate(() => (window as unknown as { __game: Game }).__game.state())
    expect(s0.battleId).toBe(id)
    if (id === 'rl-dong-zhuo-rescue') expect(s0.units.find((u) => u.id === 'dong-zhuo')!.done).toBe(true)
    await page.screenshot({ path: `e2e-out/${id}-start.png` })
    await playRounds(page, 2)
    const s1 = await page.evaluate(() => (window as unknown as { __game: Game }).__game.state())
    expect(s1.round > s0.round || !!s1.result).toBe(true)
    await page.screenshot({ path: `e2e-out/${id}-r${s1.round}.png` })
    expect(errors).toEqual([])
  })
}

test('a cut-in against the court escort casts the defenders in the court palette', async ({ page }) => {
  const errors = await boot(page, 'battle=rl-prison-cart&seed=5&speed=full&cutins=all&enemycutins=off')
  await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.manual(true))
  let found = false
  for (let i = 0; i < 120 && !found; i++) {
    await page.waitForFunction(
      () => (window as unknown as { __game: Game }).__game.idle() || (window as unknown as { __cutin: Cutin }).__cutin.active(),
      undefined,
      { timeout: 120_000 },
    )
    if (await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active())) {
      await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
      continue
    }
    const a = await page.evaluate(() => (window as unknown as { __game: Game }).__game.suggest())
    const strike = a.type === 'attack' || a.type === 'stratagem'
    const r = await page.evaluate((x) => (window as unknown as { __game: Game }).__game.act(x), a)
    if (!r.ok) {
      await page.evaluate(() => (window as unknown as { __game: Game }).__game.act({ type: 'endPhase' }))
      continue
    }
    if (!strike) continue
    const layer = page.getByTestId('cutin-layer')
    if ((await layer.count()) === 0 && !(await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.active()))) continue
    await expect(layer).toBeVisible({ timeout: 90_000 })
    const v = await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.view())
    const def = v.plan.links.find((l) => l.defender)?.defender
    if (!def) {
      await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
      continue
    }
    expect(def.palette).toBe('court')
    await page.waitForFunction(() => (window as unknown as { __cutin: Cutin }).__cutin.ready(), undefined, { timeout: 120_000 })
    await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.run(1 / 8, 1.6))
    await page.screenshot({ path: 'e2e-out/rl-prison-cart-court-cutin.png' })
    await page.evaluate(() => (window as unknown as { __cutin: Cutin }).__cutin.skip())
    found = true
  }
  expect(found).toBe(true)
  expect(errors).toEqual([])
})
