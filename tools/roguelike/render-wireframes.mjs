// Renders the roguelike wireframes (docs/wireframes/roguelike/*.html) to PNGs at desktop 1280x800 and phone 390x844.
//   node tools/roguelike/render-wireframes.mjs [--out tools/out/wireframes] [--only road,stop]
// Chromium comes from /opt/pw-browsers/chromium when present (never runs `playwright install`).
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const dir = resolve(here, '../../docs/wireframes/roguelike')
const out = resolve(opt('out', resolve(here, '../out/wireframes')))
const only = opt('only', '').split(',').filter(Boolean)
mkdirSync(out, { recursive: true })
const pages = readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html').map((f) => f.replace(/\.html$/, '')).filter((p) => !only.length || only.includes(p))
const sizes = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'phone', width: 390, height: 844, mobile: true },
]
const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch(exe ? { executablePath: exe } : {})
for (const size of sizes) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.mobile, hasTouch: size.mobile })
  const page = await ctx.newPage()
  for (const p of pages) {
    await page.goto(pathToFileURL(resolve(dir, `${p}.html`)).href, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const overflow = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }))
    const file = resolve(out, `${p}-${size.name}.png`)
    await page.screenshot({ path: file })
    console.log(`${file}  (overflow x ${overflow.x}, y ${overflow.y})`)
  }
  await ctx.close()
}
await browser.close()
