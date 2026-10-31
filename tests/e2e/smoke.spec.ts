import { expect, test } from '@playwright/test'

test('app boots and renders a canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?test=1')
  await page.waitForFunction(() => (window as unknown as { __app?: { ready: boolean } }).__app?.ready === true, undefined, { timeout: 30_000 })
  await expect(page.locator('canvas')).toHaveCount(1)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'e2e-out/m0.png' })
  expect(errors).toEqual([])
})
