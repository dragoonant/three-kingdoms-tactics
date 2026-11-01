// Renders the battle cut-in scenes to MP4s and contact sheets (docs/spec/51).
//
//   node tools/render-cutins.mjs [--scene A,B] [--fps 30] [--workers 2] [--out e2e-out/cutins] [--port 5791]
//                                [--url http://localhost:5173/]   (skip the build and use a running server)
//                                [--sheet-only] [--frames-only]
//
// Headless WebGL is software-rendered (2-3 fps), so nothing is played in real time: every frame is made by setting the
// scene time with window.__cinema.setTime(t) (scenes are pure functions of t), screenshotting the 1280x720 page, and
// encoding the frames with ffmpeg (H.264, yuv420p). A contact sheet per scene has one frame per beat midpoint.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const flag = (name) => args.includes(`--${name}`)

const scenes = opt('scene', 'A,B').split(',').map((s) => s.trim().toUpperCase())
const fps = Number(opt('fps', '30'))
const workers = Number(opt('workers', '2'))
const outDir = resolve(opt('out', 'e2e-out/cutins'))
const port = Number(opt('port', process.env.PW_PORT ?? '5791'))
const urlArg = opt('url', '')
const BASE_PATH = '/three-kingdoms-tactics/'
const W = 1280
const H = 720

const CHROMIUM = '/opt/pw-browsers/chromium'
const launchOptions = {
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
}

function run(cmd, cmdArgs, label) {
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${label ?? cmd} failed (${r.status})`)
}

async function waitForUrl(url, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`server did not come up: ${url}`)
}

let server = null
let base = urlArg
if (!base) {
  console.log('building and serving (vite preview)...')
  run('npx', ['vite', 'build'], 'vite build')
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  base = `http://localhost:${port}${BASE_PATH}`
  await waitForUrl(base)
}
if (!base.endsWith('/')) base += '/'

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(launchOptions)

async function openScene(scene) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}cinema.html?scene=${scene}&ui=0&test=1&t=0`)
  await page.waitForFunction(() => window.__cinema?.ready === true, undefined, { timeout: 180000 })
  return { page, errors }
}

async function renderFrames(scene) {
  const dir = resolve(outDir, `frames-${scene}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const probe = await openScene(scene)
  const duration = await probe.page.evaluate(() => window.__cinema.duration())
  const n = Math.round(duration * fps)
  console.log(`scene ${scene}: ${n} frames at ${fps} fps (${duration}s), ${workers} worker(s)`)
  const pages = [probe]
  for (let k = 1; k < workers; k++) pages.push(await openScene(scene))
  let done = 0
  const t0 = Date.now()
  await Promise.all(
    pages.map(async ({ page }, k) => {
      for (let i = k; i < n; i += workers) {
        const t = i / fps
        await page.evaluate((tt) => window.__cinema.setTime(tt), t)
        await page.screenshot({ path: resolve(dir, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 })
        done++
        if (done % 30 === 0) console.log(`  ${scene} ${done}/${n} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
      }
    }),
  )
  const errs = pages.flatMap((p) => p.errors)
  await Promise.all(pages.map((p) => p.page.close()))
  if (errs.length) console.warn(`page errors in scene ${scene}:\n  ${[...new Set(errs)].join('\n  ')}`)
  return { dir, n, duration }
}

function encode(scene, dir) {
  const out = resolve(outDir, `scene-${scene}.mp4`)
  run(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', resolve(dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', out],
    'ffmpeg',
  )
  console.log(`wrote ${out}`)
}

/** One frame per beat midpoint, labelled with the beat id, composed in a page and screenshotted. */
async function contactSheet(scene, dir) {
  const probe = await openScene(scene)
  const beats = await probe.page.evaluate(() => window.__cinema.beats?.() ?? [])
  await probe.page.close()
  if (!beats.length) throw new Error('window.__cinema.beats() is missing')
  const cols = 3
  const rows = Math.ceil(beats.length / cols)
  const cw = 640
  const ch = 360
  const cells = beats
    .map((b) => {
      const mid = (b.start + b.end) / 2
      const i = Math.min(Math.round(mid * fps), Math.round(b.end * fps) - 1)
      return `<figure><img src="file://${resolve(dir, `f${String(i).padStart(4, '0')}.jpg`)}"><figcaption><b>${b.id}</b> ${mid.toFixed(2)} s &middot; ${b.label}</figcaption></figure>`
    })
    .join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#14100d;color:#efe6d2;font:600 15px 'Alegreya Sans','DejaVu Sans',sans-serif}
    .g{display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px;padding:8px;width:${cols * cw + (cols + 1) * 8}px}
    figure{margin:0;position:relative;width:${cw}px;height:${ch}px}
    img{width:${cw}px;height:${ch}px;display:block}
    figcaption{position:absolute;left:0;right:0;bottom:0;padding:5px 9px;background:rgba(20,16,13,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    b{color:#f2b45a;font-size:18px;margin-right:6px}
  </style><div class="g">${cells}</div>`
  const htmlPath = resolve(outDir, `sheet-${scene}.html`)
  writeFileSync(htmlPath, html)
  const page = await browser.newPage({ viewport: { width: cols * cw + (cols + 1) * 8, height: rows * ch + (rows + 1) * 8 } })
  await page.goto(`file://${htmlPath}`)
  await page.waitForLoadState('load')
  const out = resolve(outDir, `contact-${scene}.png`)
  await page.screenshot({ path: out, fullPage: true })
  await page.close()
  rmSync(htmlPath)
  console.log(`wrote ${out}`)
}

try {
  for (const scene of scenes) {
    if (!['A', 'B'].includes(scene)) throw new Error(`unknown scene ${scene}`)
    const dir = resolve(outDir, `frames-${scene}`)
    if (!flag('sheet-only')) await renderFrames(scene)
    if (!flag('frames-only')) {
      await contactSheet(scene, dir)
      if (!flag('sheet-only')) encode(scene, dir)
    }
  }
} finally {
  await browser.close()
  server?.kill()
}
