import { expect, test, type Page } from '@playwright/test'

// M3: the first playable slice, driven the way a person would (real clicks on the canvas) and through window.__game.

test.use({ viewport: { width: 1280, height: 800 } })

type Game = {
  state: () => { round: number; side: string; result: unknown; units: { id: string; x: number; y: number; side: string; done: boolean; confused: boolean; facing: string }[] }
  legal: () => { type: string }[]
  act: (a: unknown) => { ok: boolean; code?: string }
  idle: () => boolean
  setSpeed: (s: 'full' | 'quick' | 'instant') => void
  suggest: () => { type: string; unit?: string; strat?: string; x?: number; y?: number; excludeFromChain?: string[] }
  screen: () => string
  tileToScreen: (x: number, y: number) => { x: number; y: number } | null
  unitToScreen: (id: string) => { x: number; y: number } | null
  query: { stratagemPreview: (s: unknown, u: string, st: string, p: { x: number; y: number }, ex: string[]) => { chain: unknown[] } | null }
}
declare global {
  interface Window {
    __game?: Game
  }
}

async function boot(page: Page, query: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`./?test=1&${query}`)
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  return errors
}

async function waitIdle(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__game?.idle() === true, undefined, { timeout })
}

async function toBattle(page: Page): Promise<void> {
  await page.getByTestId('begin').click()
  await expect(page.getByTestId('briefing')).toBeVisible()
  await page.getByTestId('start-battle').click()
  await expect(page.getByTestId('topbar')).toBeVisible()
}

/** Pick a unit by clicking its tile (figures take no taps, tabletop-kb rule 25); checks the point is not covered by HUD. */
async function clickUnit(page: Page, id: string): Promise<void> {
  const pt = await page.evaluate((u) => window.__game!.unitToScreen(u), id)
  expect(pt).not.toBeNull()
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [pt!.x, pt!.y])
  expect(hit).toBe('CANVAS')
  await page.mouse.click(pt!.x, pt!.y)
}

async function clickTile(page: Page, x: number, y: number): Promise<void> {
  const pt = await page.evaluate(([a, b]) => window.__game!.tileToScreen(a!, b!), [x, y])
  expect(pt).not.toBeNull()
  await page.mouse.click(pt!.x, pt!.y)
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
  // no native tooltips and no "OK" labels anywhere in the page
  expect(await page.locator('[title]').count()).toBe(0)
  const labels = await page.locator('button').allInnerTexts()
  for (const l of labels) expect(l.trim()).not.toMatch(/^ok$/i)
}

test('title to battle by real clicks: select, move, wait, end phase, bot plays, round 2', async ({ page }) => {
  const errors = await boot(page, 'seed=7')
  await expect(page.getByTestId('title-screen')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Three Kingdoms\s*Tactics/ })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e-out/title.png' })
  await noScrollbars(page)
  await houseRules(page)

  // how to play opens and closes
  await page.getByTestId('howto').click()
  await expect(page.getByTestId('howto-screen')).toContainText('Facing')
  await page.getByTestId('howto-back').click()

  await page.getByTestId('begin').click()
  await expect(page.getByTestId('briefing')).toBeVisible()
  await expect(page.getByTestId('briefing')).toContainText('Cheng Yuanzhi')
  await expect(page.getByTestId('briefing')).toContainText('wind')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e-out/briefing.png' })
  await page.getByTestId('start-battle').click()
  await expect(page.getByTestId('round')).toHaveText('Round 1')

  // input is locked while the round scroll plays, and any click skips it
  await expect(page.getByTestId('hud')).toHaveAttribute('data-playing', '1')
  await page.getByTestId('speed-instant').click({ force: true })
  await expect(page.getByTestId('hud')).toHaveAttribute('data-playing', '0')
  await waitIdle(page)
  await noScrollbars(page)

  // select Liu Bei
  await clickUnit(page, 'liu-bei')
  await expect(page.getByTestId('officer-panel')).toContainText('Liu Bei')
  await expect(page.getByTestId('officer-panel')).toContainText('2,000')
  await expect(page.getByTestId('act-attack')).toBeDisabled()

  // move him two tiles east
  await clickTile(page, 3, 6)
  await expect.poll(() => page.evaluate(() => window.__game!.state().units.find((u) => u.id === 'liu-bei')!.x)).toBe(3)
  await waitIdle(page)

  // Wait, facing east, sealed
  await page.getByTestId('act-wait').click()
  await page.getByTestId('face-E').click()
  await expect(page.getByTestId('seal')).toContainText('Wait, facing east')
  await page.getByTestId('seal').click()
  await expect.poll(() => page.evaluate(() => window.__game!.state().units.find((u) => u.id === 'liu-bei')!.done)).toBe(true)
  expect(await page.evaluate(() => window.__game!.state().units.find((u) => u.id === 'liu-bei')!.facing)).toBe('E')
  await expect(page.getByTestId('ready-count')).toHaveText('4 ready')

  // click an enemy: read-only panel, no action slips
  await waitIdle(page)
  await clickUnit(page, 'cheng-yuanzhi')
  await expect(page.getByTestId('officer-panel')).toContainText('Cheng Yuanzhi')
  await expect(page.getByTestId('act-wait')).toHaveCount(0)

  // end the phase: the bot plays the rebel phase on its own, then round 2 starts
  await page.getByTestId('end-phase').click()
  await page.waitForFunction(() => window.__game!.state().round === 2 && window.__game!.idle(), undefined, { timeout: 180_000 })
  await expect(page.getByTestId('round')).toHaveText('Round 2')
  await expect(page.getByTestId('phase')).toContainText("Liu Bei's forces")
  const ledger = await page.getByTestId('ledger-recent').locator('li').count()
  expect(ledger).toBe(3)

  // the ledger drawer holds the whole log
  await page.getByTestId('ledger-toggle').click()
  await expect(page.getByTestId('ledger-full').locator('li').first()).toBeVisible()
  expect(await page.getByTestId('ledger-full').locator('li').count()).toBeGreaterThan(8)
  await page.getByTestId('ledger-toggle').click()

  // a mid-battle picture with a selection
  const ready = await page.evaluate(() => window.__game!.state().units.filter((u) => u.side === 'han' && !u.done && !u.confused).map((u) => u.id))
  expect(ready.length).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  for (const id of ready) {
    const pt = await page.evaluate((u) => window.__game!.unitToScreen(u), id)
    const hit = pt ? await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName, [pt.x, pt.y]) : null
    if (hit === 'CANVAS') {
      await page.mouse.click(pt!.x, pt!.y)
      break
    }
  }
  await expect(page.getByTestId('officer-panel')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/battle-mid.png' })
  await noScrollbars(page)
  await houseRules(page)
  expect(errors).toEqual([])
})

test('a whole battle through window.__game at instant speed reaches the end screen', async ({ page }) => {
  const errors = await boot(page, 'seed=11&speed=instant')
  await toBattle(page)
  await waitIdle(page)
  let steps = 0
  for (; steps < 1200; steps++) {
    const over = await page.evaluate(() => {
      const g = window.__game!
      if (g.state().result) return true
      if (g.state().side === 'han') {
        const r = g.act(g.suggest())
        if (!r.ok) throw new Error('rejected ' + r.code)
      }
      return false
    })
    if (over) break
    await waitIdle(page)
  }
  expect(steps).toBeLessThan(1200)
  await expect(page.getByTestId('end-screen')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('fight-again')).toBeVisible()
  await expect(page.getByTestId('end-title')).toHaveText(/Victory|Defeat/)
  await expect(page.getByTestId('end-reason')).not.toBeEmpty()
  expect(Number(await page.getByTestId('stat-rounds').innerText())).toBeGreaterThan(1)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e-out/end.png' })
  await noScrollbars(page)

  // Fight again starts a fresh battle
  await page.getByTestId('fight-again').click()
  await expect(page.getByTestId('round')).toHaveText('Round 1')
  expect(await page.evaluate(() => window.__game!.state().result)).toBeNull()
  expect(errors).toEqual([])
})

test('a linked stratagem stamps a seal per link and counts the chain', async ({ page }) => {
  // Seed 31: against the M4 utility bot the greedy side reaches a real 3-link chain (checked headlessly).
  const errors = await boot(page, 'seed=31&speed=instant')
  await toBattle(page)
  await waitIdle(page)
  // Let the greedy side play until the next action would open a chain of 3 or more links.
  let found = false
  for (let i = 0; i < 400 && !found; i++) {
    const r = await page.evaluate(() => {
      const g = window.__game!
      const s = g.state()
      if (s.result) return 'over'
      if (s.side !== 'han') return 'wait'
      const a = g.suggest()
      if (a.type === 'stratagem') {
        const pv = g.query.stratagemPreview(s, a.unit!, a.strat!, { x: a.x!, y: a.y! }, a.excludeFromChain ?? [])
        if (pv && pv.chain.length >= 3) return 'chain'
      }
      g.act(a)
      return 'ok'
    })
    if (r === 'over') break
    if (r === 'chain') found = true
    else await waitIdle(page)
  }
  expect(found).toBe(true)
  await waitIdle(page)
  await page.evaluate(() => {
    const g = window.__game!
    g.setSpeed('full')
    g.act(g.suggest())
  })
  await expect(page.getByTestId('chain-row')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('chain-count')).toHaveText(/Chain ×[34]/, { timeout: 20_000 })
  await page.screenshot({ path: 'e2e-out/chain.png' })
  // clicking skips the rest of the replay and unlocks input
  await page.mouse.click(640, 740)
  await expect(page.getByTestId('hud')).toHaveAttribute('data-playing', '0')
  await page.evaluate(() => window.__game!.setSpeed('instant'))
  expect(errors).toEqual([])
})

test('phone portrait layout: no scrollbars, the unit card is a slim bar above the action slips', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const errors = await boot(page, 'seed=7&speed=instant')
  await noScrollbars(page)
  await page.getByTestId('begin').click()
  await noScrollbars(page)
  await page.screenshot({ path: 'e2e-out/phone-briefing.png' })
  await page.getByTestId('start-battle').click()
  await waitIdle(page)
  await noScrollbars(page)
  await clickUnit(page, 'zhang-fei')
  const panel = page.getByTestId('officer-panel')
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(380)
  expect(box!.height).toBeLessThanOrEqual(76)
  const fan = await page.locator('.fan').boundingBox()
  expect(fan).not.toBeNull()
  expect(box!.y + box!.height).toBeLessThanOrEqual(fan!.y + 1)
  expect(fan!.y + fan!.height).toBeGreaterThan(830)
  await page.getByTestId('act-wait').click()
  await page.getByTestId('face-N').click()
  await expect(page.getByTestId('seal')).toBeVisible()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e-out/phone.png' })
  await noScrollbars(page)
  await houseRules(page)
  expect(errors).toEqual([])
})

test('a tap on the tile behind a figure reaches that tile: units are picked by their tile only (KB rule 25)', async ({ page }) => {
  const errors = await boot(page, 'seed=7')
  await toBattle(page)
  await page.evaluate(() => window.__game!.setSpeed('instant'))
  await page.mouse.click(5, 5)
  await waitIdle(page)
  await clickUnit(page, 'liu-bei')
  await expect(page.getByTestId('officer-panel')).toContainText('Liu Bei')
  // the move tile drawn on screen just above Liu Bei, where his figure covers it
  const pick = await page.evaluate(() => {
    const g = window.__game!
    const me = g.state().units.find((u) => u.id === 'liu-bei')!
    const at = g.tileToScreen(me.x, me.y)!
    const moves = (g.legal() as unknown as { type: string; unit?: string; x: number; y: number }[]).filter((a) => a.type === 'move' && a.unit === 'liu-bei')
    const options = moves.map((m) => ({ m, p: g.tileToScreen(m.x, m.y)! })).filter((o) => o.p && o.p.y < at.y - 10)
    options.sort((a, b) => Math.abs(a.p.x - at.x) + (at.y - a.p.y) - (Math.abs(b.p.x - at.x) + (at.y - b.p.y)))
    return options[0] ? { x: options[0].m.x, y: options[0].m.y, sx: options[0].p.x, sy: options[0].p.y } : null
  })
  expect(pick).not.toBeNull()
  await page.mouse.click(pick!.sx, pick!.sy)
  await expect
    .poll(() => page.evaluate(() => { const u = window.__game!.state().units.find((v) => v.id === 'liu-bei')!; return [u.x, u.y] }))
    .toEqual([pick!.x, pick!.y])
  expect(errors).toEqual([])
})
