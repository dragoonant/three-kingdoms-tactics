// Captures the figure lab's Locomotion view (docs/spec/31-hero-figures.md): for each gait, 8 evenly spaced phases of one
// stride, side-on on the treadmill, composed into one contact sheet per gait (so foot contact, footfall order and the
// rider's seat can be judged by eye). Frames are made by setting the frame time (window.__lab.setT), not by playing.
//
//   node tools/shoot-locomotion.mjs [--gait walk,run,trot,canter,gallop] [--lanes 0,1,2,3,4] [--tag -foot] [--out e2e-out/locomotion] [--url http://localhost:5173/three-kingdoms-tactics/]
//                                   [--phases 8] [--frames-only]
// Without --url it builds and serves with `vite preview` on PW_PORT (default 5791).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const gaits = opt('gait', 'walk,run,trot,canter,gallop').split(',')
const outDir = resolve(opt('out', 'e2e-out/locomotion'))
const phases = Number(opt('phases', '8'))
const lanes = opt('lanes', '0,1,2,3,4')
const tag = opt('tag', '')
const port = Number(process.env.PW_PORT ?? 5791)
let base = opt('url', '')
// seconds for one stride at the treadmill speed, per gait (the feet and the horse differ a little; the horse is the reference for trot, canter and gallop)
const CYCLE = { walk: 0.336, run: 0.27, trot: 0.37, canter: 0.294, gallop: 0.259 }
const W = Number(opt('width', '1700'))
const H = Number(opt('height', '440'))

const CHROMIUM = '/opt/pw-browsers/chromium'
const launchOptions = {
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
}

let server = null
if (!base) {
  const r = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('vite build failed')
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  base = `http://localhost:${port}/three-kingdoms-tactics/`
  for (let i = 0; i < 80; i++) {
    if (await fetch(base).then((x) => x.ok).catch(() => false)) break
    await new Promise((x) => setTimeout(x, 400))
  }
}
if (!base.endsWith('/')) base += '/'
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(launchOptions)
try {
  for (const gait of gaits) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}figure-lab.html?view=locomotion&gait=${gait}&lanes=${lanes}&bare=${opt('bare', '0')}&t=3&test=1`)
    await page.waitForFunction(() => window.__lab?.ready === true, undefined, { timeout: 120000 })
    const files = []
    for (let k = 0; k < phases; k++) {
      const t = 3 + (k / phases) * CYCLE[gait]
      await page.evaluate((tt) => window.__lab.setT(tt), t)
      await page.waitForTimeout(250)
      const f = resolve(outDir, `loco-${gait}${tag}-${k}.png`)
      await page.screenshot({ path: f })
      files.push(f)
    }
    await page.close()
    if (errors.length) console.warn(`${gait}: page errors: ${errors.join(' | ')}`)
    // contact sheet: 2 columns
    const cols = Number(opt('cols', '2'))
    const CW = Math.round(W * Number(opt('scale', '0.9')))
    const cells = files.map((f, k) => `<figure><img src="file://${f}"><figcaption>${gait} &middot; phase ${k}/${phases}</figcaption></figure>`).join('')
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#14100d;color:#efe6d2;font:600 14px 'DejaVu Sans',sans-serif}
      .g{display:grid;grid-template-columns:repeat(${cols},${CW}px);gap:6px;padding:6px}
      figure{margin:0;position:relative}img{width:${CW}px;display:block}
      figcaption{position:absolute;left:6px;top:4px;color:#f2b45a}
    </style><div class="g">${cells}</div>`
    const hp = resolve(outDir, `sheet-${gait}.html`)
    writeFileSync(hp, html)
    const sheet = await browser.newPage({ viewport: { width: cols * CW + (cols + 1) * 6, height: 800 } })
    await sheet.goto(`file://${hp}`)
    await sheet.waitForLoadState('load')
    await sheet.screenshot({ path: resolve(outDir, `locomotion-${gait}${tag}.png`), fullPage: true })
    await sheet.close()
    rmSync(hp)
    console.log(`wrote ${resolve(outDir, `locomotion-${gait}${tag}.png`)}`)
  }
} finally {
  await browser.close()
  server?.kill()
}
