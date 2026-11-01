// Plays real battles in the browser and captures the in-battle cut-ins (docs/spec/51 v0.3).
//
//   node tools/shoot-battle-cutins.mjs --out <dir> [--url http://localhost:5173/] [--want stratagem,attack,chain,flank,counter,enemy] [--seed 5]
//                                      [--battle daxing-hill] [--step 0.25 | --fps 30] [--mp4 chain]
//
// The game runs at Full speed with `?cutins=all`; the cut-in clock is stepped by hand (window.__cutin.manual / step) so every
// frame is exact whatever the software GL speed. It drives the player's side with the greedy bot (window.__game.suggest) and,
// the first time each wanted kind of cut-in starts, steps it frame by frame and screenshots the page. Writes frames, a JSON log
// of what was shown against what the engine produced, and (with --mp4 <kind>) an MP4 of that kind's cut-in.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const outDir = resolve(opt('out', 'e2e-out/battle-cutins'))
const want = new Set(opt('want', 'stratagem,attack,chain,flank,enemy').split(','))
const seed = opt('seed', '5')
const battle = opt('battle', 'daxing-hill')
// --fps N steps the cut-in clock by exactly 1/N s per captured frame, so the MP4 plays at real speed at N fps
const fpsArg = Number(opt('fps', '0'))
const stepSec = fpsArg > 0 ? 1 / fpsArg : Number(opt('step', '0.25'))
const videoFps = fpsArg > 0 ? fpsArg : Math.round(1 / stepSec)
const mp4Kind = opt('mp4', '')
const port = Number(process.env.PW_PORT ?? 6091)
const urlArg = opt('url', '')
const BASE_PATH = '/three-kingdoms-tactics/'
const W = 1280
const H = 720

const CHROMIUM = '/opt/pw-browsers/chromium'
const launchOptions = {
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
}

async function waitForUrl(url, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return
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
  const b = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' })
  if (b.status !== 0) throw new Error('vite build failed')
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  base = `http://localhost:${port}${BASE_PATH}`
  await waitForUrl(base)
}
if (!base.endsWith('/')) base += '/'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${base}?test=1&cutins=all&seed=${seed}&battle=${battle}&speed=full`)
await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 120000 })
await page.evaluate(() => window.__game.begin())
await page.waitForFunction(() => window.__game.idle(), undefined, { timeout: 120000 })
await page.evaluate(() => window.__cutin.manual(true))

const log = []
const got = new Set()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function capture(name, frames) {
  // step the cut-in by hand and screenshot at each step
  await page.waitForFunction(() => window.__cutin.ready() || !window.__cutin.active(), undefined, { timeout: 180000 })
  let i = 0
  const dir = resolve(outDir, `frames-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const attrs = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=cutin-layer]')
    return el ? el.getAttributeNames().filter((n) => n.startsWith('data-')).map((n) => [n, el.getAttribute(n)]) : null
  })
  while (await page.evaluate(() => window.__cutin.active())) {
    await page.evaluate((dt) => window.__cutin.step(dt), stepSec)
    // wait two frames for the draw (software GL)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const file = resolve(dir, `f${String(i).padStart(4, '0')}.jpg`)
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 })
    i++
    if (i > 2400) break
    if (frames && i >= frames) break
  }
  return { dir, frames: i, attrs }
}

/** A cut-in is on screen: log it, capture it when it is a wanted kind we have not seen, otherwise skip it. */
async function handle() {
  const v = await page.evaluate(() => window.__cutin.view())
  const first = v.plan.links[0]
  const kinds = []
  if (v.plan.enemy) kinds.push('enemy')
  if (v.plan.links.length > 1) kinds.push('chain')
  else if (v.plan.full) kinds.push('stratagem')
  else kinds.push('attack')
  if (!v.plan.full && (first.arc === 'side' || first.arc === 'rear')) kinds.push('flank')
  if (!v.plan.full && first.counter) kinds.push('counter')
  const entry = {
    kinds,
    enemy: v.plan.enemy,
    links: v.plan.links.map((l) => ({ scene: l.scene, caster: l.caster.name, strat: l.stratName, damage: l.damage, falls: l.falls, terrain: l.terrain, arc: l.arc, counter: l.counter, confused: l.confused, routed: l.routed })),
  }
  log.push(entry)
  const key = kinds.find((k) => want.has(k) && !got.has(k))
  if (key) {
    got.add(key)
    console.log(`capturing ${key}:`, JSON.stringify(entry.links))
    const c = await capture(key, 0)
    entry.frames = c.frames
    entry.dir = c.dir
    entry.layerAttrs = c.attrs
    if (mp4Kind === key) {
      const out = resolve(outDir, `battle-${key}.mp4`)
      const f = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(videoFps), '-i', resolve(c.dir, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out], { stdio: 'inherit' })
      if (f.status === 0) console.log(`wrote ${out}`)
    }
  } else {
    await page.evaluate(() => window.__cutin.skip())
  }
}

/** Wait for the game to be idle on the player's turn, handling every cut-in that starts on the way. */
async function settle() {
  for (let n = 0; n < 4000; n++) {
    const s = await page.evaluate(() => ({ idle: window.__game.idle(), result: !!window.__game.state().result, active: window.__cutin.active() }))
    if (s.active) {
      await handle()
      continue
    }
    if (s.idle || s.result) return
    await sleep(120)
  }
}

for (let guard = 0; guard < 400 && got.size < want.size; guard++) {
  await settle()
  const st = await page.evaluate(() => ({ side: window.__game.state().side, result: window.__game.state().result }))
  if (st.result) break
  const a = await page.evaluate(() => window.__game.suggest())
  const r = await page.evaluate((act) => window.__game.act(act), a)
  if (!r.ok) {
    await page.evaluate(() => window.__game.act({ type: 'endPhase' }))
  }
}

writeFileSync(resolve(outDir, 'battle-log.json'), JSON.stringify({ seed, battle, errors, log }, null, 2))
console.log(`done: ${[...got].join(', ')}; ${errors.length} page error(s)`)
if (errors.length) console.log(errors.join('\n'))
await browser.close()
server?.kill()
