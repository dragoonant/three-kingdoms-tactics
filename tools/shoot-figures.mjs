// Contact sheets of the figure lab (docs/spec/31-hero-figures.md "Silhouette test"), for the visual review.
//   npm run build && node tools/shoot-figures.mjs [sheet ...]
// Starts `vite preview` on PW_PORT (default 5691) unless something already answers there, opens the built lab in headless
// Chromium (software GL) and writes PNGs to e2e-out/figures/. With no arguments every sheet is shot.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const PORT = Number(process.env.PW_PORT ?? 5691)
const BASE = `http://localhost:${PORT}/three-kingdoms-tactics/figure-lab.html`
const OUT = 'e2e-out/figures'
mkdirSync(OUT, { recursive: true })

/** name -> [query, viewport] */
const SHEETS = {
  'heroes-front': ['group=heroes&mode=front&rotate=0', [1700, 960]],
  'heroes-threequarter': ['group=heroes&mode=threequarter&rotate=0', [1700, 960]],
  'heroes-silhouette': ['group=heroes&mode=silhouette&rotate=0', [1700, 960]],
  'heroes-silhouette-3q': ['group=heroes&mode=silhouette&rotate=0&yaw=0.62', [1700, 960]],
  'board-scale': ['scale=board&mode=front&rotate=0', [1280, 440]],
  'board-scale-silhouette': ['scale=board&mode=silhouette&rotate=0', [1280, 440]],
  'officers-front': ['group=officers&mode=front&rotate=0', [1700, 1100]],
  'officers-silhouette': ['group=officers&mode=silhouette&rotate=0', [1700, 1100]],
  'troops-front': ['group=troops&mode=front&rotate=0', [1500, 1000]],
  'troops-threequarter': ['group=troops&mode=threequarter&rotate=0', [1500, 1000]],
  'variants-front': ['group=variants&mode=front&rotate=0', [1700, 1000]],
  'horses-front': ['group=horses&mode=threequarter&rotate=0', [1500, 520]],
  'all-front': ['group=all&mode=front&rotate=0', [1700, 1100]],
  'clip-drawbow': ['group=troops&mode=threequarter&rotate=0&clip=drawBow&p=1', [1500, 1000]],
  'clip-thrust': ['group=heroes&mode=threequarter&rotate=0&clip=thrust&p=0.6', [1700, 960]],
  'clip-gallop': ['group=heroes&mode=threequarter&rotate=0&clip=gallop&p=0', [1700, 960]],
}
// Single-figure close-ups: `node tools/shoot-figures.mjs close:guan-yu` (front) or `close3q:guan-yu`
const wanted = process.argv.slice(2)

async function up() {
  try {
    const r = await fetch(BASE)
    return r.ok
  } catch {
    return false
  }
}

let server = null
if (!(await up())) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
  if (!(await up())) throw new Error('vite preview did not start (run `npm run build` first)')
}

const exe = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(exe) ? { executablePath: exe } : {}),
})

async function shoot(name, query, [w, h]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(`${BASE}?test=1&${query}`)
  await page.waitForFunction(() => window.__lab?.ready === true, undefined, { timeout: 120_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  await page.close()
  console.log(`${name}.png${errors.length ? '  ERRORS: ' + errors.slice(0, 3).join(' | ') : ''}`)
}

const list = []
for (const [name, [q, vp]] of Object.entries(SHEETS)) {
  if (!wanted.length || wanted.includes(name)) list.push([name, q, vp])
}
for (const w of wanted) {
  const m = /^(close|close3q|closesil):(.+)$/.exec(w)
  if (!m) continue
  const mode = m[1] === 'close' ? 'front' : m[1] === 'close3q' ? 'threequarter' : 'silhouette'
  list.push([`${m[1]}-${m[2]}`, `group=${/^(zhao-yun|guan-yu|lu-bu|cao-cao)$/.test(m[2]) ? 'heroes' : 'all'}&only=${m[2]}&mode=${mode}&rotate=0`, [1000, 900]])
}
try {
  for (const [name, q, vp] of list) await shoot(name, q, vp)
} finally {
  await browser.close()
  server?.kill()
}
