import { expect, test, type Page } from '@playwright/test'

// The campaign client: title -> new campaign -> scenes -> briefing -> deploy -> battle -> results -> camp -> battle 2, saves and Continue,
// defeat and retry, the v2 proving-ground board, and the phone layout. Battles are played through window.__game (autoWin / autoLose).

test.use({ viewport: { width: 1280, height: 800 } })

type G = {
  state: () => { battleId: string; round: number; side: string; result: unknown; grid: { width: number; height: number }; units: { id: string; x: number; y: number; side: string }[] }
  campaignState: () => { battleIndex: number; provisions: number; roster: { officerId: string; xp: number; level: number }[]; camp: { drilled: string[] } } | null
  campaignReport: () => { won: boolean; xp: { officerId: string; gained: number }[] } | null
  autoWin: () => Promise<string>
  autoLose: () => Promise<string>
  screen: () => string
  unitToScreen: (id: string) => { x: number; y: number } | null
  idle: () => boolean
}

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`./?test=1&bot=random&${query}`)
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  return errors
}

async function noScrollbars(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    iw: window.innerWidth,
    ih: window.innerHeight,
    bw: document.body.scrollWidth,
    bh: document.body.scrollHeight,
  }))
  expect(o.sw).toBeLessThanOrEqual(o.iw)
  expect(o.sh).toBeLessThanOrEqual(o.ih)
  expect(o.bw).toBeLessThanOrEqual(o.iw)
  expect(o.bh).toBeLessThanOrEqual(o.ih)
}

async function houseRules(page: Page): Promise<void> {
  expect(await page.locator('[title]').count()).toBe(0)
  for (const l of await page.locator('button').allInnerTexts()) expect(l.trim()).not.toMatch(/^ok$/i)
}

/** Everything a screen shows must sit inside the window (no clipped slips), and nothing may be wider than it. */
async function insideWindow(page: Page, testid: string): Promise<void> {
  // modals are full-window overlays; their panel is the thing that must fit
  const modal = ['newcampaign', 'cbrief', 'camp', 'results', 'defeat', 'summary'].includes(testid)
  // let entrance animations finish (they lag under software GL) before measuring
  await page.getByTestId(testid).evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))))
  const box = await (modal ? page.locator(`[data-testid="${testid}"] > .panel`) : page.getByTestId(testid)).boundingBox()
  expect(box).not.toBeNull()
  const vp = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.y).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1)
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1)
}

/** Title -> Campaign -> Begin (Iron Oath as asked) and the prologue scene is up. */
async function startCampaign(page: Page, iron = false): Promise<void> {
  await page.getByTestId('campaign').click()
  await expect(page.getByTestId('newcampaign')).toBeVisible()
  if (iron) await page.getByTestId('iron-oath').click()
  await page.getByTestId('begin-campaign').click()
  await expect(page.getByTestId('scene')).toBeVisible()
}

/** Prologue skipped, briefing 1, pre-battle scene skipped, deploy, seal: the battle is on. */
async function toBattleOne(page: Page): Promise<void> {
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('cbrief')).toBeVisible()
  await page.getByTestId('to-deploy').click()
  await expect(page.getByTestId('scene')).toBeVisible()
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('deploy')).toBeVisible()
  await page.getByTestId('seal-orders').click()
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle')
}

/** Win the current battle with the bot, then through the post-battle scene to the results screen. */
async function winAndShowResults(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.autoWin())).toBe('won')
  await expect(page.getByTestId('scene')).toBeVisible()
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('results')).toBeVisible()
}

test('campaign: title, new campaign, scenes, briefing, deploy, battle, results, camp, drill, battle 2, reload and Continue', async ({ page }) => {
  const errors = await boot(page, 'seed=5')
  await expect(page.getByTestId('title-screen')).toBeVisible()
  await expect(page.getByTestId('campaign')).toContainText("Liu Bei's Rise")
  await expect(page.getByTestId('begin')).toContainText('Skirmish: Daxing Hill')
  await expect(page.getByTestId('continue')).toHaveCount(0)

  // new campaign: the Iron Oath toggle explains itself
  await page.getByTestId('campaign').click()
  await expect(page.getByTestId('newcampaign')).toBeVisible()
  await expect(page.getByTestId('iron-oath')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('newcampaign')).toContainText('only wounded')
  await page.getByTestId('iron-oath').click()
  await expect(page.getByTestId('newcampaign')).toContainText('lost for good')
  await page.getByTestId('iron-oath').click()
  await expect(page.getByTestId('iron-oath')).toHaveAttribute('aria-checked', 'false')
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('begin-campaign').click()

  // prologue: a speech slip over the orbiting table, Skip scene always there
  await expect(page.getByTestId('scene')).toBeVisible()
  await expect(page.getByTestId('skip-scene')).toBeVisible()
  await expect(page.getByTestId('speech')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e-out/scene.png' })
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('skip-scene').click()

  // briefing: title, year and place, objectives from the engine, wind, company
  await expect(page.getByTestId('cbrief')).toBeVisible()
  await expect(page.getByTestId('brief-title')).toContainText('Daxing Hill')
  await expect(page.getByTestId('brief-kicker')).toContainText('184')
  await expect(page.getByTestId('cbrief')).toContainText('Rout the enemy commander')
  await expect(page.getByTestId('brief-wind')).toContainText('Round 9: gale toward west')
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('to-deploy').click()

  // pre-battle scene, click advances (or finishes) it
  await expect(page.getByTestId('scene')).toBeVisible()
  // a click advances one line (the scene stays up while lines remain); Skip scene ends it
  const firstLine = await page.getByTestId('scene').innerText()
  await page.getByTestId('scene-advance').click()
  await expect(page.getByTestId('scene')).not.toHaveText(firstLine)
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('deploy')).toBeVisible()
  await expect(page.getByTestId('deploy-count')).toHaveText('3 of 5 places filled')
  await expect(page.getByTestId('pick-liu-bei')).toBeDisabled()
  await expect(page.getByTestId('pick-liu-bei')).toContainText('Required')
  await expect(page.getByTestId('deploy-guests')).toContainText('Zou Jing')
  await expect(page.getByTestId('deploy-mark-1')).toBeVisible()
  await expect(page.getByTestId('deploy-mark-5')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/deploy.png' })
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('seal-orders').click()

  // battle: the objective tracker and the guest tag
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle')
  await expect(page.getByTestId('objectives')).toContainText('Rout the enemy commander')
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.state().battleId)).toBe('daxing-hill')

  // win it with the bot
  await winAndShowResults(page)
  await expect(page.getByTestId('results-title')).toHaveText('Victory')
  await expect(page.getByTestId('xp-list')).toContainText('XP')
  await expect(page.getByTestId('xpline-guan-yu')).toContainText('+')
  await expect(page.getByTestId('company-changes')).toContainText('Jian Yong joins the army')
  await expect(page.getByTestId('prov-table')).toContainText('Victory')
  await expect(page.getByTestId('saved-note')).toHaveText('Progress saved.')
  const report = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignReport())
  expect(report!.won).toBe(true)
  expect(report!.xp.length).toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'e2e-out/results.png' })
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('results-next').click()

  // camp: roster slips with level, XP bar, stats, troops, stratagems; provisions; Drill and Muster say exactly what they do
  await expect(page.getByTestId('camp')).toBeVisible()
  await expect(page.getByTestId('roster-liu-bei')).toBeVisible()
  await expect(page.getByTestId('roster-jian-yong')).toBeVisible()
  const guanLevel = await page.evaluate(
    () => (window as unknown as { __game: G }).__game.campaignState()!.roster.find((o: { officerId: string }) => o.officerId === 'guan-yu')!.level,
  )
  expect(guanLevel).toBeGreaterThanOrEqual(3)
  await expect(page.getByTestId('level-guan-yu')).toHaveText(`Level ${guanLevel}`)
  await expect(page.getByTestId('drill-guan-yu')).toContainText('−60 provisions, +50 XP · 1 left')
  await expect(page.getByTestId('muster-guan-yu')).toContainText('−80 provisions, +200 max troops · 2 left')
  const prov0 = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!.provisions)
  expect(prov0).toBeGreaterThanOrEqual(100)
  await expect(page.getByTestId('provisions')).toHaveText(String(prov0))
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e-out/camp.png' })
  await noScrollbars(page)
  await houseRules(page)

  // drill an officer: provisions fall by 60 and the XP bar moves; the button now says it is spent
  const xp0 = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!.roster.find((r) => r.officerId === 'guan-yu')!.xp)
  await page.getByTestId('drill-guan-yu').click()
  await expect(page.getByTestId('provisions')).toHaveText(String(prov0 - 60))
  await expect(page.getByTestId('drill-guan-yu')).toBeDisabled()
  await expect(page.getByTestId('drill-guan-yu')).toContainText('Drilled this camp')
  const after = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!)
  expect(after.camp.drilled).toEqual(['guan-yu'])
  expect(after.roster.find((r) => r.officerId === 'guan-yu')!.xp).toBe((xp0 + 50) % 100)

  // to the field: the briefing of battle 2, then its pre-battle scene and deploy
  await page.getByTestId('to-field').click()
  await expect(page.getByTestId('cbrief')).toBeVisible()
  await expect(page.getByTestId('brief-kicker')).toContainText('Battle 2 of 9')
  await expect(page.getByTestId('brief-title')).toContainText('Qingzhou')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/briefing-2.png' })
  await noScrollbars(page)
  await page.getByTestId('to-deploy').click()
  if (await page.getByTestId('scene').isVisible()) await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('deploy')).toBeVisible()
  await expect(page.getByTestId('pick-jian-yong')).toBeVisible()
  await page.getByTestId('seal-orders').click()
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle')

  // the battle loads with the battle-2 map size (10 x 8), and the canvas frames it
  const dims = await page.evaluate(() => ({ id: (window as unknown as { __game: G }).__game.state().battleId, w: (window as unknown as { __game: G }).__game.state().grid.width, h: (window as unknown as { __game: G }).__game.state().grid.height }))
  expect(dims).toEqual({ id: 'qingzhou', w: 16, h: 12 }) // the real Relief of Qingzhou map (docs/spec/battles/02-qingzhou.md)
  const tl = await page.evaluate(() => ((window as unknown as { __game: G }).__game as unknown as { tileToScreen: (x: number, y: number) => { x: number; y: number } }).tileToScreen(0, 0))
  const br = await page.evaluate(() => ((window as unknown as { __game: G }).__game as unknown as { tileToScreen: (x: number, y: number) => { x: number; y: number } }).tileToScreen(9, 7))
  for (const p of [tl, br]) {
    expect(p.x).toBeGreaterThan(0)
    expect(p.x).toBeLessThan(1280 - 300)
    expect(p.y).toBeGreaterThan(40)
    expect(p.y).toBeLessThan(800)
  }
  await noScrollbars(page)

  // reload: Continue resumes at the saved point (the camp before battle 2, with the drill kept)
  await page.reload()
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  await expect(page.getByTestId('continue')).toBeVisible()
  await expect(page.getByTestId('campaign')).toContainText('New campaign')
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('camp')).toBeVisible()
  await expect(page.getByTestId('provisions')).toHaveText(String(prov0 - 60))
  await expect(page.getByTestId('drill-guan-yu')).toBeDisabled()
  const resumed = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!)
  expect(resumed.battleIndex).toBe(1)
  expect(errors).toEqual([])
})

test('defeat then Retry restores the camp as it stood before the battle', async ({ page }) => {
  const errors = await boot(page, 'seed=9')
  await startCampaign(page)
  await toBattleOne(page)
  await winAndShowResults(page)
  await page.getByTestId('results-next').click()
  await expect(page.getByTestId('camp')).toBeVisible()
  const snap = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!)
  await page.getByTestId('drill-liu-bei').click()
  await expect(page.getByTestId('provisions')).toHaveText(String(snap.provisions - 60))
  await page.getByTestId('to-field').click()
  await page.getByTestId('to-deploy').click()
  if (await page.getByTestId('scene').isVisible()) await page.getByTestId('skip-scene').click()
  await page.getByTestId('seal-orders').click()
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle')
  // pass every phase: the battle is lost
  expect(await page.evaluate(() => (window as unknown as { __game: G }).__game.autoLose())).toBe('lost')
  await expect(page.getByTestId('defeat')).toBeVisible()
  await expect(page.getByTestId('defeat-title')).toHaveText('Defeat')
  await expect(page.getByTestId('retry')).toContainText('Retry battle')
  await expect(page.getByTestId('defeat-title-btn')).toContainText('Return to title')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/defeat.png' })
  await noScrollbars(page)
  await houseRules(page)
  await page.getByTestId('retry').click()
  await expect(page.getByTestId('camp')).toBeVisible()
  const back = await page.evaluate(() => (window as unknown as { __game: G }).__game.campaignState()!)
  expect(back.provisions).toBe(snap.provisions)
  expect(back.camp.drilled).toEqual([])
  expect(back.battleIndex).toBe(1)
  await expect(page.getByTestId('provisions')).toHaveText(String(snap.provisions))
  // and Return to title works from a defeat too
  await page.getByTestId('camp-title').click()
  await expect(page.getByTestId('title-screen')).toBeVisible()
  expect(errors).toEqual([])
})

test('the proving ground renders every v2 terrain and the v2 HUD', async ({ page }) => {
  const errors = await boot(page, 'battle=proving-ground&screen=battle&speed=instant')
  await expect(page.getByTestId('topbar')).toBeVisible()
  const dims = await page.evaluate(() => ({ w: (window as unknown as { __game: G }).__game.state().grid.width, h: (window as unknown as { __game: G }).__game.state().grid.height, id: (window as unknown as { __game: G }).__game.state().battleId }))
  expect(dims).toEqual({ w: 16, h: 12, id: 'proving-ground' })
  // objective tracker (engine text), the timeline preview next to the wind slip
  await expect(page.getByTestId('objectives')).toContainText('Escaped 0 / 2')
  await expect(page.getByTestId('objectives')).toContainText('Liu Bei must not fall')
  await expect(page.getByTestId('timeline')).toContainText('Round 3')
  await expect(page.getByTestId('wind')).toContainText('breeze toward east')
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.idle())
  // the unit panel: retreat threshold, ambush tag, guest tag
  const click = async (id: string): Promise<void> => {
    const pt = await page.evaluate((u) => (window as unknown as { __game: G }).__game.unitToScreen(u), id)
    expect(pt).not.toBeNull()
    await page.mouse.click(pt!.x, pt!.y)
  }
  await click('lu-bu')
  await expect(page.getByTestId('officer-panel')).toContainText('Lu Bu')
  await expect(page.getByTestId('chip-retreat')).toHaveText('Retreats at 50%')
  await click('pg-marine')
  await expect(page.getByTestId('chip-wait')).toHaveText('Lying in wait')
  // Zou Jing stands between two officers, so a click can land on a neighbour: select through the store
  await page.evaluate(() => (window as unknown as { __game: { select: (id: string) => void } }).__game.select('zou-jing'))
  await expect(page.getByTestId('chip-guest')).toHaveText('Guest')
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'e2e-out/battle-proving-ground.png' })
  await noScrollbars(page)
  await houseRules(page)
  expect(errors).toEqual([])
})

test('phone portrait: the campaign screens fit 390 x 844 without scrollbars', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await boot(page, 'seed=3&speed=instant')
  await noScrollbars(page)
  await page.screenshot({ path: 'e2e-out/phone-title.png' })
  await page.getByTestId('campaign').click()
  await noScrollbars(page)
  await insideWindow(page, 'newcampaign')
  await page.screenshot({ path: 'e2e-out/phone-newcampaign.png' })
  await page.getByTestId('begin-campaign').click()
  await expect(page.getByTestId('scene')).toBeVisible()
  await page.waitForTimeout(1200)
  await insideWindow(page, 'speech')
  await page.screenshot({ path: 'e2e-out/phone-scene.png' })
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('cbrief')).toBeVisible()
  await noScrollbars(page)
  await insideWindow(page, 'cbrief')
  await page.screenshot({ path: 'e2e-out/phone-briefing-campaign.png' })
  await page.getByTestId('to-deploy').click()
  await page.getByTestId('skip-scene').click()
  await expect(page.getByTestId('deploy')).toBeVisible()
  await noScrollbars(page)
  await insideWindow(page, 'deploy')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/phone-deploy.png' })
  await page.getByTestId('seal-orders').click()
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.screen() === 'battle')
  await expect(page.getByTestId('objectives')).toBeVisible()
  await page.waitForFunction(() => (window as unknown as { __game: G }).__game.idle())
  await page.waitForTimeout(1500)
  await noScrollbars(page)
  await page.screenshot({ path: 'e2e-out/phone-battle-objectives.png' })
  await winAndShowResults(page)
  await noScrollbars(page)
  await insideWindow(page, 'results')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/phone-results.png' })
  await page.getByTestId('results-next').click()
  await expect(page.getByTestId('camp')).toBeVisible()
  await noScrollbars(page)
  await insideWindow(page, 'camp')
  await houseRules(page)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/phone-camp.png' })
  expect(errors).toEqual([])
})
