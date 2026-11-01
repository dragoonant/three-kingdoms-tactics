// Records units moving on the board (docs/spec/50-presentation.md "Figures"): a foot soldier along a multi-tile path with a
// corner, and a cavalry unit, plus stills of the ground rings (selected / actable / targetable). Headless WebGL is software
// rendered (about 1 fps), so nothing is played in real time: Playwright's fake clock is paused and advanced one frame at a
// time (the director's timers, the beat progress and the three.js clock all follow it), and every frame is screenshotted.
//
//   node tools/render-board-move.mjs [--out e2e-out/board-move] [--fps 20] [--url http://localhost:5173/] [--stills-only]
// Without --url it builds and serves with `vite preview` on PW_PORT (default 5791).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const flag = (name) => args.includes(`--${name}`)
const outDir = resolve(opt('out', 'e2e-out/board-move'))
const fps = Number(opt('fps', '20'))
const port = Number(process.env.PW_PORT ?? 5791)
let base = opt('url', '')
const speedMode = opt('speed', 'full')

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

async function openBattle() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time: 0 })
  await page.goto(`${base}?test=1&seed=7&speed=${speedMode}`)
  // the fake clock only moves when we say so: tick until the app is up
  const tick = async (ms) => page.clock.runFor(ms)
  for (let i = 0; i < 400; i++) {
    if (await page.evaluate(() => window.__app?.ready === true)) break
    await tick(100)
    await page.waitForTimeout(20)
  }
  await page.getByTestId('begin').click()
  await tick(300)
  await page.getByTestId('start-battle').click()
  for (let i = 0; i < 60; i++) {
    await tick(200)
    if (await page.evaluate(() => window.__game?.idle?.() === true)) break
  }
  // from here on the clock is ours: it only moves when we advance it
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 500)
  await tick(2500)
  return { page, errors, tick }
}

/** Pick a unit of `type` for the side to move with a reachable tile that needs at least `min` tiles and a corner. */
async function pickMove(page, type, min) {
  return page.evaluate(
    ({ type, min }) => {
      const g = window.__game
      const st = g.state()
      const grid = st.grid
      const out = []
      for (const u of st.units) {
        if (u.side !== st.side || u.type !== type || u.moved || u.done) continue
        const range = g.query.moveRange(st, u.id)
        for (const m of range) {
          const dx = Math.abs(m.x - u.x)
          const dy = Math.abs(m.y - u.y)
          if (dx >= 2 && dy >= 1 && dx + dy >= min) out.push({ unit: u.id, x: m.x, y: m.y, len: dx + dy, officer: u.officer })
        }
      }
      void grid
      out.sort((a, b) => b.len - a.len)
      return out[0] ?? null
    },
    { type, min },
  )
}

async function stills() {
  const { page, errors, tick } = await openBattle()
  await page.screenshot({ path: resolve(outDir, 'board-start.png') })
  // select a unit: ring states (selected bronze, others actable lantern), move range marks
  const sel = await page.evaluate(() => {
    const st = window.__game.state()
    const u = st.units.find((x) => x.side === st.side && x.type === 'infantry' && !x.done) ?? st.units.find((x) => x.side === st.side)
    window.__game.select(u.id)
    return u.id
  })
  await tick(400)
  await page.waitForTimeout(400)
  const p = await page.evaluate((id) => window.__game.unitToScreen(id), sel)
  const clip = p ? { x: Math.max(0, p.x - 300), y: Math.max(0, p.y - 260), width: 600, height: 340 } : undefined
  await page.screenshot({ path: resolve(outDir, 'rings-selected.png'), ...(clip ? { clip } : {}) })
  await page.screenshot({ path: resolve(outDir, 'rings-selected-full.png') })
  console.log('stills written', errors.length ? `ERRORS: ${errors.join(' | ')}` : '')
  await page.close()
}

async function recordMove(name, type, min) {
  const { page, errors, tick } = await openBattle()
  const mv = await pickMove(page, type, min)
  if (!mv) throw new Error(`no ${type} move found`)
  console.log(name, 'move', JSON.stringify(mv))
  const a = await page.evaluate((id) => window.__game.unitToScreen(id), mv.unit)
  const b = await page.evaluate(({ x, y }) => window.__game.tileToScreen(x, y), mv)
  // a still window around the whole path, at 2x, so the gait can be judged up close
  const x0 = Math.max(0, Math.min(a.x, b.x) - 150)
  const y0 = Math.max(0, Math.min(a.y, b.y) - 230)
  const x1 = Math.min(1280, Math.max(a.x, b.x) + 150)
  const y1 = Math.min(720, Math.max(a.y, b.y) + 90)
  const clip = { x: Math.floor(x0), y: Math.floor(y0), width: Math.floor(x1 - x0) & ~1, height: Math.floor(y1 - y0) & ~1 }
  const dir = resolve(outDir, `frames-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  // freeze the fake clock, then start the move so beat 0 begins at a known time
  await page.screenshot({ path: resolve(dir, 'before.png'), clip })
  await page.evaluate((m) => window.__game.act({ type: 'move', unit: m.unit, x: m.x, y: m.y }), mv)
  const dt = 1000 / fps
  let n = 0
  let idleFor = 0
  for (let i = 0; i < 400; i++) {
    await tick(dt)
    await page.waitForTimeout(30)
    await page.screenshot({ path: resolve(dir, `f${String(n).padStart(4, '0')}.png`), clip })
    n++
    const idle = await page.evaluate(() => window.__game.idle())
    idleFor = idle ? idleFor + 1 : 0
    if (idleFor > Math.ceil(fps * 0.6)) break
  }
  await page.close()
  if (errors.length) console.warn(`${name}: page errors: ${[...new Set(errors)].join(' | ')}`)
  const out = resolve(outDir, `board-move-${name}.mp4`)
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', resolve(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-movflags', '+faststart', out], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('ffmpeg failed')
  console.log(`wrote ${out} (${n} frames)`)
}

try {
  await stills()
  if (!flag('stills-only')) {
    await recordMove('infantry', 'infantry', 4)
    await recordMove('cavalry', 'cavalry', 4)
  }
} finally {
  await browser.close()
  server?.kill()
}
