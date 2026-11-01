// The cut-in hitch probe (docs/spec/51 "Performance: warm-up and reuse"). Plays a real battle in headless Chromium with
// `?perf=1&cutins=all`, lets the greedy bot drive the player's side and the AI the enemy's, and lets each cut-in play on the
// real wall clock (not stepped) so its first frames show the hitch. For every cut-in it reads window.__perf and reports:
//   trigger -> first drawn frame (GPU drained), the longest main-thread task in the first second, the first 30 frame times
//   against the steady state, the world build / renderer creation / first-draw costs, and the renderer's program, geometry
//   and texture counts before, during and after; plus how many WebGL contexts the page created.
//
//   node tools/perf/cutin-hitch.mjs [--url http://localhost:5173/] [--seed 5] [--battle daxing-hill] [--out <dir>] [--label before]
//                                   [--want short,full,chain,enemy] [--per 2] [--frames 45]
//
// Without --url it builds and serves the production build on PW_PORT (default 6341). SwiftShader (software GL) inflates the
// absolute times, so compare ratios: first frame / steady frame, longest task / steady frame.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const seed = opt('seed', '5')
const battle = opt('battle', 'daxing-hill')
const label = opt('label', 'run')
const outDir = resolve(opt('out', 'e2e-out/perf'))
const want = opt('want', 'short,full,chain,enemy').split(',')
const per = Number(opt('per', '2'))
const nFrames = Number(opt('frames', '45'))
const extra = opt('query', '')
// open the order preview before confirming a player action (the prebuild path), and wait for its world to be ready
const preview = args.includes('--preview')
const port = Number(process.env.PW_PORT ?? 6341)
const urlArg = opt('url', '')
const BASE_PATH = '/three-kingdoms-tactics/'

const CHROMIUM = '/opt/pw-browsers/chromium'
const launchOptions = {
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc', '--enable-precise-memory-info'],
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(launchOptions)
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const t0 = Date.now()
await page.goto(`${base}?test=1&perf=1&cutins=all&enemycutins=same&seed=${seed}&battle=${battle}&speed=full${extra ? `&${extra}` : ''}`)
await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 120000 })
const bootMs = Date.now() - t0
const heap = () =>
  page.evaluate(() => {
    window.gc?.()
    return performance.memory?.usedJSHeapSize ?? null
  })
const heapTitle = await heap()
const tb = Date.now()
await page.evaluate(() => window.__game.begin())
await page.waitForFunction(() => window.__game.idle(), undefined, { timeout: 180000 })
const beginMs = Date.now() - tb
// the warm-up (when the build has one): wait for it, and time it from the begin
const tw = Date.now()
const hasPrep = await page.evaluate(() => typeof window.__cutin.prep === 'function')
if (hasPrep) await page.waitForFunction(() => window.__cutin.prep().warm.done || !window.__cutin.prep().attached, undefined, { timeout: 600000 })
const warmWaitMs = Date.now() - tw
const warm = hasPrep ? await page.evaluate(() => window.__cutin.prep()) : null
const warmInfo = await page.evaluate(() => window.__perf.info())
const heapWarm = await heap()
const pool = await page.evaluate(() => (window.__perf.pool ? { pool: window.__perf.pool(), canvas: window.__perf.canvas() } : null))
const warmLong = await page.evaluate(() => window.__perf.longTasks())
const prepared = await page.evaluate(() => window.__perf.marks())

const kindOf = (r) => (r.enemy ? 'enemy' : r.kind)
const got = new Map()
const done = () => want.every((k) => (got.get(k) ?? 0) >= per)

/** A cut-in is playing on the wall clock: let it draw its first frames, then skip the rest. */
async function watch() {
  const cur = await page.evaluate(() => {
    const c = window.__perf.current()
    return c ? { n: c.n, kind: c.kind, enemy: c.enemy, scenes: c.scenes } : null
  })
  const k = cur ? (cur.enemy ? 'enemy' : cur.kind) : null
  const need = k && want.includes(k) && (got.get(k) ?? 0) < per
  if (need) {
    const until = Date.now() + 400000
    while (Date.now() < until) {
      const s = await page.evaluate((n) => {
        const c = window.__perf.current()
        if (!c || c.n !== n) return { gone: true }
        const lastLink = c.scenes.length - 1
        const linkAt = c.marks.find((m) => m.name === `link-${lastLink}`)?.at ?? Infinity
        return { gone: false, frames: c.frames.length, afterLast: c.frames.filter((f) => f.at >= linkAt).length, active: window.__cutin.active() }
      }, cur.n)
      if (s.gone || !s.active) break
      if (s.frames >= nFrames && s.afterLast >= 30) break
      await sleep(100)
    }
    got.set(k, (got.get(k) ?? 0) + 1)
  }
  if (await page.evaluate(() => window.__cutin.active())) await page.evaluate(() => window.__cutin.skip())
  await sleep(150)
}

async function settle() {
  for (let n = 0; n < 4000; n++) {
    const s = await page.evaluate(() => ({ idle: window.__game.idle(), result: !!window.__game.state().result, active: window.__cutin.active() }))
    if (s.active) {
      await watch()
      continue
    }
    if (s.idle || s.result) return
    await sleep(80)
  }
}

for (let guard = 0; guard < 600 && !done(); guard++) {
  await settle()
  const st = await page.evaluate(() => ({ result: window.__game.state().result }))
  if (st.result) break
  const a = await page.evaluate(() => window.__game.suggest())
  if (preview && hasPrep && (a.type === 'attack' || a.type === 'stratagem')) {
    await page.evaluate((act) => window.__game.preview(act), a)
    // the preview's world starts building within a moment (none when the action plays no cut-in)
    await page.waitForFunction(() => window.__cutin.prep().slots.some((s) => s.kind === 'next'), undefined, { timeout: 15000 }).catch(() => {})
    await page.waitForFunction(() => window.__cutin.prep().slots.every((s) => s.kind !== 'next' || s.ready), undefined, { timeout: 60000 }).catch(() => {})
  }
  const r = await page.evaluate((act) => window.__game.act(act), a)
  if (!r.ok) await page.evaluate(() => window.__game.act({ type: 'endPhase' }))
}
await sleep(300)

const records = await page.evaluate(() => window.__perf.records())
const prepEnd = hasPrep ? await page.evaluate(() => window.__cutin.prep()) : null
const contexts = await page.evaluate(() => window.__perf.contexts())

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)
// only the cut-ins the probe watched (the others were skipped after a frame or two)
const summary = records
  .filter((r) => r.frames.length >= Math.min(10, nFrames))
  .map((r) => {
    const at = r.frames.map((f) => f.at)
    const deltas = at.slice(1).map((a, i) => a - at[i])
    const first30 = deltas.slice(0, 30)
    const steady = median(deltas.slice(30, nFrames).length >= 5 ? deltas.slice(30, nFrames) : deltas.slice(Math.floor(deltas.length / 2)))
    const m = (name) => r.marks.filter((x) => x.name === name)
    const sum = (name) => m(name).reduce((a, x) => a + (x.dur ?? 0), 0)
    const longest = r.longTasks.reduce((a, l) => Math.max(a, l.dur), 0)
    const mid = r.frames.find((f, i) => i >= 1 && f.info) ?? r.frames[0]
    const linkAt = (i) => r.marks.find((x) => x.name === `link-${i}`)?.at ?? null
    const firstAfter = (t) => r.frames.find((f) => f.at >= t)
    // the start of each later link of a chain: the gap from the link's start to its first drawn frame
    const linkGaps = r.scenes.slice(1).map((_, j) => {
      const t = linkAt(j + 1)
      const f = t == null ? null : firstAfter(t)
      return f ? r1(f.at + f.dur - t) : null
    })
    // the first frame is on screen when the second one starts: the player draws once per animation frame and Chrome holds
    // animation frames back while the GPU is still busy with the previous one (the same definition for every build)
    const shown = r.frames[1]?.at ?? r.firstFrame
    return {
      n: r.n,
      kind: kindOf(r),
      scenes: r.scenes.join('+'),
      firstFrame: r1(shown),
      firstSubmit: r1(r.frames[0] ? r.frames[0].at + r.frames[0].dur : null),
      ready: r1(r.marks.find((x) => x.name === 'ready')?.at),
      longestTask: r1(longest),
      steadyFrame: r1(steady),
      firstFrameRatio: steady ? r1(shown / steady) : null,
      longestRatio: steady ? r1(longest / steady) : null,
      maxFirst30: r1(Math.max(...first30)),
      meanFirst30: r1(first30.reduce((a, x) => a + x, 0) / Math.max(1, first30.length)),
      breakdown: {
        chunk: r.marks.some((x) => x.name === 'chunk-loaded') ? r1(r.marks.find((x) => x.name === 'chunk-loaded').at) : 0,
        rendererCreate: r1(sum('renderer-create')),
        scenePlan: r1(sum('scene-plan')),
        worldBuild: r1(sum('world-build')),
        worldMount: (() => {
          const a = m('world-render')[0]
          const b = m('world-mounted')[0]
          return a && b ? r1(b.at - a.at) : null
        })(),
        firstDraw: r1(r.frames[0]?.dur),
        gpuDrain: r1(sum('gpu-drain')),
        prebuilt: m('prebuilt-hit').length,
      },
      linkGaps,
      info: { before: r.infoBefore, first: r.frames[0]?.info, during: mid?.info, after: r.infoAfter },
      contexts: { before: r.contextsBefore, after: r.contextsAfter },
      frames: r.frames.length,
      first30: first30.map(r1),
    }
  })

const heapEnd = await heap()
const memory = { heapTitle, heapWarm, heapEnd, ...pool }
const out = { label, seed, battle, bootMs, beginMs, warmWaitMs, memory, warm, prepEnd, warmInfo, warmLong, prepared, contexts, errors, summary, records }
const file = resolve(outDir, `cutin-hitch-${label}.json`)
writeFileSync(file, JSON.stringify(out, null, 2))
console.log(`boot ${bootMs} ms, begin to first turn ${beginMs} ms, then warm-up wait ${warmWaitMs} ms (${warm ? `${warm.warm.total} items` : 'no warm-up'}), WebGL contexts created: ${contexts}`)
if (warmInfo) console.log(`after warm-up: ${JSON.stringify(warmInfo)}; longest task so far ${Math.round(Math.max(0, ...warmLong.map((l) => l.dur)))} ms`)
console.log('n  kind   scenes              first   ready  longest steady  first/st long/st max30  ctx  programs(b/1/a)  geo(b/1/a)  tex(b/1/a)')
for (const s of summary) {
  const i = s.info
  const f = (o, k) => (o ? o[k] : '-')
  console.log(
    [
      String(s.n).padEnd(2),
      s.kind.padEnd(6),
      s.scenes.padEnd(18),
      String(s.firstFrame).padStart(7),
      String(s.ready).padStart(7),
      String(s.longestTask).padStart(7),
      String(s.steadyFrame).padStart(6),
      String(s.firstFrameRatio).padStart(8),
      String(s.longestRatio).padStart(7),
      String(s.maxFirst30).padStart(6),
      `${s.contexts.before}->${s.contexts.after}`.padStart(5),
      `${f(i.before, 'programs')}/${f(i.first, 'programs')}/${f(i.after, 'programs')}`.padStart(15),
      `${f(i.before, 'geometries')}/${f(i.first, 'geometries')}/${f(i.after, 'geometries')}`.padStart(12),
      `${f(i.before, 'textures')}/${f(i.first, 'textures')}/${f(i.after, 'textures')}`.padStart(11),
    ].join(' '),
  )
  console.log(`     breakdown ${JSON.stringify(s.breakdown)}${s.linkGaps.length ? ` link gaps ${JSON.stringify(s.linkGaps)}` : ''}`)
}
if (prepEnd) console.log(`prep: ${JSON.stringify(prepEnd.stats)}`)
console.log(`memory: ${JSON.stringify(memory)}`)
console.log(`wrote ${file}; ${errors.length} page error(s)`)
if (errors.length) console.log(errors.join('\n'))
await browser.close()
server?.kill()
