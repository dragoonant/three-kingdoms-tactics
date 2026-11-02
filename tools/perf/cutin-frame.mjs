// The cut-in per-frame cost probe (docs/spec/51 "Performance: per-frame budgets and quality tiers", PLAN D32).
// Hardware-independent proxies for what a phone's GPU and Safari's WebGL have to sustain every frame of a cut-in:
//   - draw calls and triangles of the main pass and of the shadow pass (renderer.info, with the shadow map's render wrapped);
//   - the shadow casters, textures, programs and materials in the frame;
//   - draw-producing objects by group: hero rigs, horses, ranks (instanced and rigged), background melee, props/FX, stage;
//   - main-thread JS per frame, split into scene update (every useFrame) and render submit (gl.render), at 1x and at a 4x CPU
//     throttle (CDP Emulation.setCPUThrottlingRate, a rough stand-in for a phone CPU).
// Every scene of the review page (cinema.html) is sampled at its beat midpoints (scenes are pure functions of t), with a
// cavalry defender (the heaviest target), at peak and median.
//
//   node tools/perf/cutin-frame.mjs [--scene A,Ap,B,...] [--quality high,medium,low] [--out <dir>] [--label before]
//                                   [--url http://localhost:5173/] [--viewport 1280x720] [--throttle 4] [--reps 3] [--no-js]
//
// Without --url it builds and serves the production build on PW_PORT (default 6391).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const ALL = ['A', 'Ap', 'B', 'C', 'D', 'R', 'W', 'S-melee', 'S-cavalry', 'S-archer']
const scenes = opt('scene', ALL.join(',')).split(',')
const qualities = opt('quality', 'high').split(',')
const outDir = resolve(opt('out', 'e2e-out/perf'))
const label = opt('label', 'run')
const [VW, VH] = opt('viewport', '1280x720').split('x').map(Number)
const throttle = Number(opt('throttle', '4'))
const reps = Number(opt('reps', '3'))
const noJs = args.includes('--no-js')
const port = Number(process.env.PW_PORT ?? 6391)
const urlArg = opt('url', '')
const BASE_PATH = '/three-kingdoms-tactics/'

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

/** Installed in the page: wraps the renderer once, and measures one frame at the current scene time. */
const PAGE_HOOKS = () => {
  const w = window
  if (w.__frameProbe) return
  const st = w.__r3f
  const gl = st.gl
  const rec = { shadowCalls: 0, shadowTris: 0, renderMs: 0 }
  const render = gl.render.bind(gl)
  gl.render = (s, c) => {
    const t0 = performance.now()
    render(s, c)
    rec.renderMs += performance.now() - t0
  }
  const sm = gl.shadowMap
  const smRender = sm.render.bind(sm)
  sm.render = (...a) => {
    const c0 = gl.info.render.calls
    const t0 = gl.info.render.triangles
    smRender(...a)
    rec.shadowCalls = gl.info.render.calls - c0
    rec.shadowTris = gl.info.render.triangles - t0
  }
  const groupOf = (o) => {
    let top = null
    let fig = false
    let horse = false
    for (let a = o; a; a = a.parent) {
      if (a.userData && a.userData.perf) top = a.userData.perf
      if (a.name === 'figure' || a.userData?.figure) fig = true
      if (a.name === 'horse') horse = true
    }
    if (top === 'stage') return 'stage'
    if (top === 'ranks' || top === 'melee') return `${top}${horse ? '-horse' : fig ? '-rig' : '-inst'}`
    if (horse) return 'horse'
    if (fig) return 'hero'
    if (o.isPoints || o.isLine || o.isSprite) return 'fx'
    return 'props'
  }
  w.__frameProbe = {
    measure() {
      // one draw at the current time, the stats from it
      rec.shadowCalls = 0
      rec.shadowTris = 0
      rec.renderMs = 0
      st.advance(performance.now() / 1000, true)
      const info = gl.info
      const out = {
        calls: info.render.calls,
        triangles: info.render.triangles,
        shadowCalls: rec.shadowCalls,
        shadowTris: rec.shadowTris,
        programs: info.programs?.length ?? 0,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
      }
      // what the frame holds: visible draw-producing objects by group, materials, shadow casters
      const scene = st.scene
      const cam = st.camera
      cam.updateMatrixWorld()
      const THREEFrustum = gl.__probeFrustum
      const groups = {}
      const casters = {}
      const mats = new Set()
      let castersN = 0
      const visit = (o) => {
        if (!o.visible) return
        const draws = o.isMesh || o.isPoints || o.isLine || o.isSprite
        if (draws && o.material) {
          const inView = !o.frustumCulled || !THREEFrustum || THREEFrustum(o)
          const n = Array.isArray(o.material) ? o.material.length : 1
          const g = groupOf(o)
          if (inView) {
            groups[g] = (groups[g] ?? 0) + n
            for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m)
          }
          if (o.castShadow && o.isMesh) {
            casters[g] = (casters[g] ?? 0) + 1
            castersN++
          }
        }
        for (const c of o.children) visit(c)
      }
      visit(scene)
      out.groups = groups
      out.casters = casters
      out.castersN = castersN
      out.materials = mats.size
      return out
    },
    /** Main-thread JS of one frame at the current time: total, of which render submit. */
    time(n) {
      const xs = []
      const c = gl.getContext()
      const px = new Uint8Array(4)
      for (let i = 0; i < n; i++) {
        // start every timed frame with an idle GPU (a 1-pixel readback drains it), so the submit is not waiting on the last one
        c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, px)
        rec.renderMs = 0
        const t0 = performance.now()
        st.advance(performance.now() / 1000, true)
        const total = performance.now() - t0
        xs.push({ total, render: rec.renderMs })
      }
      xs.sort((a, b) => a.total - b.total)
      const m = xs[Math.floor(xs.length / 2)]
      return { total: m.total, render: m.render, update: m.total - m.render }
    },
    quality: () => w.__cutinQuality?.() ?? null,
  }
}

/** The frustum test needs three's Frustum: borrow it from the camera's own classes. */
const FRUSTUM_HOOK = () => {
  const st = window.__r3f
  const cam = st.camera
  // three is bundled: build a frustum from the projection with plain math (six planes from the view-projection matrix)
  const planes = () => {
    cam.updateMatrixWorld()
    const m = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements
    const raw = [
      [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
      [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
      [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
      [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
      [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],
      [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
    ]
    return raw.map((p) => {
      const l = Math.hypot(p[0], p[1], p[2])
      return p.map((x) => x / l)
    })
  }
  st.gl.__probeFrustum = (o) => {
    const ps = planes()
    const g = o.geometry
    if (!g) return true
    if (o.isInstancedMesh) {
      if (o.count === 0) return false
      if (!o.boundingSphere) o.computeBoundingSphere()
    } else if (!g.boundingSphere) g.computeBoundingSphere()
    const bs = (o.isInstancedMesh ? o.boundingSphere : g.boundingSphere).clone().applyMatrix4(o.matrixWorld)
    for (const p of ps) if (p[0] * bs.center.x + p[1] * bs.center.y + p[2] * bs.center.z + p[3] < -bs.radius) return false
    return true
  }
}

const browser = await chromium.launch(launchOptions)
const rows = []
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)

try {
  for (const quality of qualities) {
    for (const scene of scenes) {
      const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 })
      const errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(`${base}cinema.html?scene=${scene}&ui=0&test=1&t=0&def=cavalry&quality=${quality}`)
      await page.waitForFunction(() => window.__cinema?.ready === true && !!window.__r3f, undefined, { timeout: 180000 })
      await page.evaluate(FRUSTUM_HOOK)
      await page.evaluate(PAGE_HOOKS)
      const beats = await page.evaluate(() => window.__cinema.beats())
      const samples = []
      for (const b of beats) {
        const t = (b.start + b.end) / 2
        await page.evaluate((tt) => window.__cinema.setTime(tt), t)
        const s = await page.evaluate(() => window.__frameProbe.measure())
        if (!noJs) s.js = await page.evaluate((n) => window.__frameProbe.time(n), reps)
        samples.push({ beat: b.id, t, ...s })
      }
      // the heaviest beat again under a CPU throttle
      const peak = samples.reduce((a, s) => (s.calls > a.calls ? s : a), samples[0])
      let throttled = null
      if (!noJs && throttle > 1) {
        const cdp = await page.context().newCDPSession(page)
        await page.evaluate((tt) => window.__cinema.setTime(tt), peak.t)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
        throttled = await page.evaluate((n) => window.__frameProbe.time(n), reps)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        await cdp.detach()
      }
      const tier = await page.evaluate(() => window.__frameProbe.quality())
      const calls = samples.map((s) => s.calls)
      const row = {
        scene,
        quality,
        tier,
        peakBeat: peak.beat,
        calls: { peak: Math.max(...calls), median: median(calls) },
        shadowCalls: { peak: Math.max(...samples.map((s) => s.shadowCalls)), median: median(samples.map((s) => s.shadowCalls)) },
        mainCalls: { peak: Math.max(...samples.map((s) => s.calls - s.shadowCalls)), median: median(samples.map((s) => s.calls - s.shadowCalls)) },
        triangles: { peak: Math.max(...samples.map((s) => s.triangles)), median: median(samples.map((s) => s.triangles)) },
        shadowTris: { peak: Math.max(...samples.map((s) => s.shadowTris)) },
        casters: peak.castersN,
        programs: Math.max(...samples.map((s) => s.programs)),
        textures: Math.max(...samples.map((s) => s.textures)),
        materials: Math.max(...samples.map((s) => s.materials)),
        groups: peak.groups,
        castersBy: peak.casters,
        js: noJs ? null : { total: r1(median(samples.map((s) => s.js.total))), update: r1(median(samples.map((s) => s.js.update))), render: r1(median(samples.map((s) => s.js.render))), peakTotal: r1(peak.js.total) },
        jsThrottled: throttled ? { total: r1(throttled.total), update: r1(throttled.update), render: r1(throttled.render) } : null,
        errors,
        samples,
      }
      rows.push(row)
      console.log(
        `${quality.padEnd(6)} ${scene.padEnd(9)} calls ${row.calls.peak}/${row.calls.median} (main ${row.mainCalls.peak}, shadow ${row.shadowCalls.peak}) tris ${row.triangles.peak} casters ${row.casters} prog ${row.programs} tex ${row.textures} mats ${row.materials}` +
          (row.js ? ` js ${row.js.total} (upd ${row.js.update} + render ${row.js.render})` : '') +
          (row.jsThrottled ? ` x${throttle}: ${row.jsThrottled.total} (upd ${row.jsThrottled.update} + render ${row.jsThrottled.render})` : '') +
          `\n           groups ${JSON.stringify(row.groups)} casters ${JSON.stringify(row.castersBy)}${errors.length ? ` ERRORS ${errors.length}` : ''}`,
      )
      await page.close()
    }
  }
} finally {
  await browser.close()
  server?.kill()
}

const md = [
  `# Cut-in per-frame cost: ${label}`,
  '',
  `Viewport ${VW}x${VH}, defender on horseback, beat midpoints; JS ms is the median over beats (1x) and the peak beat at ${throttle}x CPU throttle.`,
  '',
  '| tier | scene | calls peak | calls median | main peak | shadow peak | triangles peak | casters | programs | textures | materials | JS ms (update + render) | JS ms x' + throttle + ' |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.quality} | ${r.scene} | ${r.calls.peak} | ${r.calls.median} | ${r.mainCalls.peak} | ${r.shadowCalls.peak} | ${r.triangles.peak} | ${r.casters} | ${r.programs} | ${r.textures} | ${r.materials} | ${r.js ? `${r.js.total} (${r.js.update} + ${r.js.render})` : '-'} | ${r.jsThrottled ? `${r.jsThrottled.total} (${r.jsThrottled.update} + ${r.jsThrottled.render})` : '-'} |`,
  ),
  '',
  '## Draw-producing objects in view at the peak beat, by group',
  '',
  '| tier | scene | ' + ['hero', 'horse', 'ranks-inst', 'ranks-rig', 'ranks-horse', 'melee-inst', 'melee-rig', 'props', 'fx', 'stage'].join(' | ') + ' |',
  '|---|---|' + '---|'.repeat(10),
  ...rows.map((r) => `| ${r.quality} | ${r.scene} | ` + ['hero', 'horse', 'ranks-inst', 'ranks-rig', 'ranks-horse', 'melee-inst', 'melee-rig', 'props', 'fx', 'stage'].map((g) => r.groups[g] ?? 0).join(' | ') + ' |'),
  '',
]
writeFileSync(resolve(outDir, `cutin-frame-${label}.json`), JSON.stringify(rows, null, 2))
writeFileSync(resolve(outDir, `cutin-frame-${label}.md`), md.join('\n'))
console.log(`wrote ${resolve(outDir, `cutin-frame-${label}.md`)}`)
