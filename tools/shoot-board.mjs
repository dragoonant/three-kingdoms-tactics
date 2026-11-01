// Screenshot of the Daxing Hill board with the hero rigs among the stand-ins (docs/spec/31-hero-figures.md, board wiring).
//   npm run build && node tools/shoot-board.mjs
// Starts `vite preview` on PW_PORT (default 5691) unless one is already answering; writes e2e-out/figures/board-daxing*.png.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const PORT = Number(process.env.PW_PORT ?? 5691)
const BASE = `http://localhost:${PORT}/three-kingdoms-tactics/`
const OUT = 'e2e-out/figures'
mkdirSync(OUT, { recursive: true })

const up = async () => fetch(BASE).then((r) => r.ok).catch(() => false)
let server = null
if (!(await up())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const exe = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(exe) ? { executablePath: exe } : {}),
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}?test=1&seed=7&speed=instant`)
  await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 60_000 })
  await page.getByTestId('begin').click()
  await page.getByTestId('start-battle').click()
  await page.getByTestId('speed-instant').click({ force: true })
  await page.waitForFunction(() => window.__game?.idle() === true, undefined, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/board-daxing.png` })
  // a close crop around the three heroes
  const pts = []
  for (const id of ['liu-bei', 'guan-yu', 'zhang-fei']) {
    const p = await page.evaluate((u) => window.__game.unitToScreen(u), id)
    if (p) pts.push(p)
  }
  if (pts.length) {
    const x0 = Math.max(0, Math.min(...pts.map((p) => p.x)) - 140)
    const x1 = Math.min(1280, Math.max(...pts.map((p) => p.x)) + 140)
    const y0 = Math.max(0, Math.min(...pts.map((p) => p.y)) - 220)
    const y1 = Math.min(800, Math.max(...pts.map((p) => p.y)) + 120)
    await page.screenshot({ path: `${OUT}/board-daxing-heroes.png`, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })
  }
  console.log('board shots written', errors.length ? `ERRORS: ${errors.join(' | ')}` : '')
} finally {
  await browser.close()
  server?.kill()
}
