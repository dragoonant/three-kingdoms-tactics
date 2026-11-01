import { expect, test, type BrowserContext, type CDPSession, type Page } from '@playwright/test'

// Board UX (docs/spec/50-presentation.md "Camera and controls", "Unit card"): touch pan / pinch / twist through real touch events (CDP
// Input.dispatchTouchEvent), tap versus drag, wheel zoom, the close zoom, the low camera with no wall in front, and the compact unit card.

interface Cam {
  x: number
  y: number
  z: number
  tx: number
  tz: number
  az: number
  zoom: number
  tilt: number
  dist: number
  near: number
}
type Game = {
  idle: () => boolean
  select: (id: string | null) => void
  camera: () => Cam | null
  setView: (p: Partial<{ x: number; z: number; az: number; zoom: number; tilt: number }>) => void
  focusUnit: (id: string, zoom?: number) => void
  unitToScreen: (id: string) => { x: number; y: number } | null
  tileToScreen: (x: number, y: number) => { x: number; y: number } | null
  state: () => { units: { id: string }[] }
}
const g = (page: Page) => ({
  cam: () => page.evaluate(() => (window as unknown as { __game: Game }).__game.camera()) as Promise<Cam>,
  setView: (p: Partial<{ x: number; z: number; az: number; zoom: number; tilt: number }>) => page.evaluate((v) => (window as unknown as { __game: Game }).__game.setView(v), p),
  unit: (id: string) => page.evaluate((u) => (window as unknown as { __game: Game }).__game.unitToScreen(u), id),
})

async function toBattle(browserCtx: BrowserContext, page: Page, query = 'seed=7&speed=instant'): Promise<void> {
  void browserCtx
  await page.goto(`./?test=1&${query}`)
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 60_000 })
  await page.getByTestId('begin').click()
  await page.getByTestId('start-battle').click()
  await page.getByTestId('speed-instant').click({ force: true })
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.idle() === true, undefined, { timeout: 180_000 })
  await page.waitForTimeout(800)
}

type Pt = { x: number; y: number }
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) })
}

test.describe('touch controls (phone 390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('one finger pans, a pinch zooms towards its midpoint, a twist rotates, and a tap still selects', async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await toBattle(context, page)
    const cdp = await context.newCDPSession(page)
    const cam0 = await g(page).cam()

    // one-finger drag to the left and down: the map follows the finger, so the target moves east and north
    await touch(cdp, 'touchStart', [{ x: 200, y: 300 }])
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, 'touchMove', [{ x: 200 - i * 12, y: 300 + i * 6 }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(1200)
    const cam1 = await g(page).cam()
    expect(cam1.tx).toBeGreaterThan(cam0.tx + 1)
    expect(cam1.tz).toBeLessThan(cam0.tz - 0.5)
    expect(cam1.zoom).toBeCloseTo(cam0.zoom, 5)
    expect(cam1.az).toBeCloseTo(cam0.az, 5)
    // a drag is never a tap: nothing got selected
    await expect(page.getByTestId('officer-panel')).toHaveCount(0)

    // pinch out: zoom in, and the table point under the midpoint stays under it
    const mid = { x: 195, y: 360 }
    await touch(cdp, 'touchStart', [{ x: mid.x - 35, y: mid.y }, { x: mid.x + 35, y: mid.y }])
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, 'touchMove', [{ x: mid.x - 35 - i * 8, y: mid.y }, { x: mid.x + 35 + i * 8, y: mid.y }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(400)
    const cam2 = await g(page).cam()
    expect(cam2.zoom).toBeGreaterThan(cam1.zoom + 0.15)
    expect(cam2.dist).toBeLessThan(cam1.dist * 0.8)
    expect(cam2.near).toBeLessThan(cam1.near + 1e-9)

    // pinch in: zoom out
    await touch(cdp, 'touchStart', [{ x: mid.x - 120, y: mid.y }, { x: mid.x + 120, y: mid.y }])
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, 'touchMove', [{ x: mid.x - 120 + i * 9, y: mid.y }, { x: mid.x + 120 - i * 9, y: mid.y }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(400)
    const cam3 = await g(page).cam()
    expect(cam3.zoom).toBeLessThan(cam2.zoom - 0.1)

    // two-finger twist, clockwise on screen: the azimuth grows
    const a0 = cam3.az
    const r = 65
    await touch(cdp, 'touchStart', [{ x: 195 - r, y: 360 }, { x: 195 + r, y: 360 }])
    for (let i = 1; i <= 10; i++) {
      const th = i * 0.08
      await touch(cdp, 'touchMove', [{ x: 195 - r * Math.cos(th), y: 360 - r * Math.sin(th) }, { x: 195 + r * Math.cos(th), y: 360 + r * Math.sin(th) }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(300)
    const cam4 = await g(page).cam()
    expect(cam4.az).toBeGreaterThan(a0 + 0.5)
    expect(cam4.zoom).toBeCloseTo(cam3.zoom, 1)

    // and counter-clockwise: it goes back
    await touch(cdp, 'touchStart', [{ x: 195 - r, y: 360 }, { x: 195 + r, y: 360 }])
    for (let i = 1; i <= 10; i++) {
      const th = -i * 0.08
      await touch(cdp, 'touchMove', [{ x: 195 - r * Math.cos(th), y: 360 - r * Math.sin(th) }, { x: 195 + r * Math.cos(th), y: 360 + r * Math.sin(th) }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(300)
    expect((await g(page).cam()).az).toBeLessThan(cam4.az - 0.5)

    // a tap (moved 0 px) on a unit selects it
    await g(page).setView({ x: 0, z: 0, az: 0, zoom: 0, tilt: 0 })
    await page.waitForTimeout(500)
    const pt = await g(page).unit('zhang-fei')
    expect(pt).not.toBeNull()
    await touch(cdp, 'touchStart', [pt!])
    await touch(cdp, 'touchEnd', [])
    await expect(page.getByTestId('officer-panel')).toContainText('Zhang Fei')

    // a drag that starts on a unit pans the map and leaves the selection alone
    await page.evaluate(() => (window as unknown as { __game: Game }).__game.select(null))
    await touch(cdp, 'touchStart', [pt!])
    for (let i = 1; i <= 6; i++) {
      await touch(cdp, 'touchMove', [{ x: pt!.x + i * 6, y: pt!.y }])
      await page.waitForTimeout(16)
    }
    await touch(cdp, 'touchEnd', [])
    await page.waitForTimeout(300)
    await expect(page.getByTestId('officer-panel')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('the unit card is a slim bar above the action slips and More opens a closable sheet that leaves the board alone', async ({ page, context }) => {
    await toBattle(context, page)
    await page.evaluate(() => (window as unknown as { __game: Game }).__game.select('zhang-fei'))
    const card = page.getByTestId('officer-panel')
    await expect(card).toBeVisible()
    const box = (await card.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(76)
    expect(box.width).toBeGreaterThan(380)
    await expect(card).toContainText('Zhang Fei')
    await expect(card).toContainText('2,000')
    await expect(card).toContainText('Qi')
    const camBefore = await g(page).cam()
    await page.getByTestId('unit-more').click()
    const sheet = page.getByTestId('unit-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('War')
    await expect(sheet).toContainText('Serpent Thrust')
    await expect(sheet).toContainText('Bonds')
    const camDuring = await g(page).cam()
    expect(camDuring.x).toBeCloseTo(camBefore.x, 5)
    expect(camDuring.z).toBeCloseTo(camBefore.z, 5)
    await page.getByTestId('unit-sheet-close').click()
    await expect(sheet).toHaveCount(0)
  })
})

test.describe('desktop camera (1280x800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the wheel zooms towards the cursor, left drag pans, right drag rotates, and the closest zoom fills the screen with a unit', async ({ page, context }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await toBattle(context, page)
    const cam0 = await g(page).cam()
    // wheel over a corner of the table: zoom in, and the target moves towards that corner
    const corner = (await page.evaluate(() => (window as unknown as { __game: Game }).__game.tileToScreen(11, 9)))!
    await page.mouse.move(corner.x, corner.y)
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(900)
    const cam1 = await g(page).cam()
    expect(cam1.zoom).toBeGreaterThan(cam0.zoom + 0.2)
    expect(cam1.tx).toBeGreaterThan(cam0.tx + 0.5)
    expect(cam1.tz).toBeGreaterThan(cam0.tz + 0.5)
    // the same table point is still near the cursor
    const after = (await page.evaluate(() => (window as unknown as { __game: Game }).__game.tileToScreen(11, 9)))!
    expect(Math.hypot(after.x - corner.x, after.y - corner.y)).toBeLessThan(90)

    // left drag pans
    await page.mouse.move(500, 400)
    await page.mouse.down()
    await page.mouse.move(380, 400, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(900)
    const cam2 = await g(page).cam()
    expect(cam2.tx).toBeGreaterThan(cam1.tx + 0.3)
    expect(cam2.az).toBeCloseTo(cam1.az, 5)

    // right drag rotates
    await page.mouse.move(500, 400)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(600, 400, { steps: 8 })
    await page.mouse.up({ button: 'right' })
    const cam3 = await g(page).cam()
    expect(Math.abs(cam3.az - cam2.az)).toBeGreaterThan(0.3)

    // closest zoom: about one unit from the camera, near plane small, pitch low, camera above the sand
    await g(page).setView({ zoom: 1, az: 0, tilt: 0 })
    const close = await g(page).cam()
    expect(close.dist).toBeLessThan(3.5)
    expect(close.near).toBeLessThan(0.1)
    expect(close.y).toBeGreaterThan(0.3)
    expect(close.y).toBeLessThan(2)
    expect(errors).toEqual([])
  })

  test('a low camera from every side still sees the board: the tent cloth on the camera side fades away', async ({ page, context }) => {
    await toBattle(context, page)
    for (const az of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      await g(page).setView({ az, tilt: -0.9, zoom: 0 })
      await page.waitForTimeout(900)
      const cam = await g(page).cam()
      expect(cam.y).toBeLessThan(8) // low
      // read the pixels over the middle of the table back from the canvas: sand under lantern light, not the near-black cloth
      const lum = await page.evaluate(() => {
        const gl = document.querySelector('canvas') as HTMLCanvasElement
        const c = document.createElement('canvas')
        c.width = gl.width
        c.height = gl.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(gl, 0, 0)
        const k = gl.width / gl.clientWidth
        let total = 0
        const tiles: [number, number][] = [[7, 6], [3, 3], [10, 8], [5, 9]]
        for (const [tx, ty] of tiles) {
          const t = (window as unknown as { __game: Game }).__game.tileToScreen(tx, ty)!
          const d = ctx.getImageData(Math.round(t.x * k) - 6, Math.round(t.y * k) - 6, 12, 12).data
          let sum = 0
          for (let i = 0; i < d.length; i += 4) sum += 0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!
          total += sum / (d.length / 4)
        }
        return total / tiles.length
      })
      // the black cloth read about 0 here; sand under the lanterns reads 40 to 110 depending on the side
      expect(lum).toBeGreaterThan(30)
    }
    const tile = await page.evaluate(() => (window as unknown as { __game: Game }).__game.tileToScreen(7, 6))
    expect(tile).not.toBeNull()
  })

  test('the compact card on desktop is about 252 x 72 and the sheet is an overlay drawer', async ({ page, context }) => {
    await toBattle(context, page)
    await page.evaluate(() => (window as unknown as { __game: Game }).__game.select('liu-bei'))
    const card = page.getByTestId('officer-panel')
    const box = (await card.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(260)
    expect(box.height).toBeLessThanOrEqual(90)
    expect(box.x + box.width).toBeGreaterThan(1200)
    await card.click()
    await expect(page.getByTestId('unit-sheet')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('unit-sheet')).toHaveCount(0)
  })
})
