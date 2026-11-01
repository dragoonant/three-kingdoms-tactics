// Captures the figure lab's Crowds view (docs/spec/52-crowds.md): one frame per time, composed into a contact sheet.
// Frames are made by setting the frame time (window.__lab.setT), not by playing.
//
//   node tools/shoot-crowds.mjs --url http://localhost:6191/ --scene infantry --cam side --times 0,1,2,3 [--out e2e-out/crowds]
//        [--w 800] [--h 450] [--cols 2] [--extra "&n=30&full=5"] [--tag name] [--perf]
// --url is the root of a running dev or preview server (preview: .../three-kingdoms-tactics/). --perf measures the CPU and
// GL numbers of the perf scene instead of taking pictures.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const flag = (name) => args.includes(`--${name}`)
let base = opt('url', 'http://localhost:6191/')
if (!base.endsWith('/')) base += '/'
const scene = opt('scene', 'all')
const cam = opt('cam', 'three')
const times = opt('times', '0,1,2,3').split(',').map(Number)
const outDir = resolve(opt('out', 'e2e-out/crowds'))
const W = Number(opt('w', '800'))
const H = Number(opt('h', '450'))
const cols = Number(opt('cols', '2'))
const extra = opt('extra', '')
const tag = opt('tag', `${scene}-${cam}`)

const CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
})
mkdirSync(outDir, { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`)
  })
  if (flag('perf')) {
    const url = `${base}figure-lab.html?view=crowds&scene=perf&cam=${cam}&t=1${extra}`
    await page.goto(url)
    await page.waitForFunction(() => window.__lab?.ready === true, undefined, { timeout: 180000 })
    const frames = Number(opt('frames', '12'))
    const res = []
    for (let k = 0; k < frames; k++) {
      const t = 0.6 + k * 0.37
      const t0 = Date.now()
      await page.evaluate(async (tt) => {
        window.__lab.setT(tt)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }, t)
      const ms = Date.now() - t0
      const info = await page.evaluate(() => window.__lab.info())
      res.push({ ms, ...info })
    }
    const med = [...res.map((r) => r.ms)].sort((a, b) => a - b)[Math.floor(res.length / 2)]
    const last = res[res.length - 1]
    const stats = await page.evaluate(() => window.__lab.stats())
    console.log(JSON.stringify({ url, medianFrameMs: med, calls: last.calls, triangles: last.triangles, crowds: stats, samples: res.map((r) => r.ms) }))
  } else {
    const files = []
    for (let k = 0; k < times.length; k++) {
      const url = `${base}figure-lab.html?view=crowds&scene=${scene}&cam=${cam}&t=${times[0]}${extra}`
      if (k === 0) {
        await page.goto(url)
        await page.waitForFunction(() => window.__lab?.ready === true, undefined, { timeout: 180000 })
      }
      await page.evaluate(async (tt) => {
        window.__lab.setT(tt)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }, times[k])
      await page.waitForTimeout(150)
      const f = resolve(outDir, `${tag}-${String(k).padStart(2, '0')}.png`)
      await page.screenshot({ path: f })
      files.push(f)
    }
    const sheet = resolve(outDir, `sheet-${tag}.png`)
    const r = spawnSync('montage', [...files.flatMap((f, k) => ['-label', `t=${times[k]}`, f]), '-tile', `${cols}x`, '-geometry', '+4+4', '-background', '#14100d', '-fill', '#f2b45a', '-pointsize', '16', sheet], { stdio: 'inherit' })
    if (r.status !== 0) throw new Error('montage failed')
    console.log(`wrote ${sheet}`)
  }
  if (errors.length) console.warn(`page messages: ${[...new Set(errors)].slice(0, 8).join(' | ')}`)
} finally {
  await browser.close()
}
