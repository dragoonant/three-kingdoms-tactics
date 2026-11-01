// Plays a chain of sample links through the in-game player (no engine battle behind it) and screenshots every step: a quick way
// to check the link-to-link hand-over, the seal interstitial and each scene in the real layer.
//
//   node tools/shoot-chain-sample.mjs --url http://localhost:5173/ --out <dir> --links C,R[,..] [--step 0.3] [--dump]
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt
}
const base = opt('url', 'http://localhost:5173/')
const out = resolve(opt('out', 'e2e-out/chain-sample'))
const links = opt('links', 'C,R').split(',')
const step = Number(opt('step', '0.3'))
const CHROMIUM = '/opt/pw-browsers/chromium'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {}),
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (m) => { if (m.text().startsWith('ActWorld')) console.log('LOG', m.text()) })
page.on('pageerror', (e) => console.log('PAGEERR', e.message))
await page.goto(`${base}?test=1&cutins=all`)
await page.waitForFunction(() => window.__app?.ready === true, undefined, { timeout: 120000 })
await page.evaluate(() => window.__game.begin())
await page.waitForFunction(() => window.__game.idle(), undefined, { timeout: 120000 })
await page.evaluate(() => window.__cutin.manual(true))
await page.evaluate((l) => window.__cutin.play(l.map((scene) => ({ scene }))), links)
await page.waitForFunction(() => window.__cutin.ready(), undefined, { timeout: 120000 })
let i = 0
while (await page.evaluate(() => window.__cutin.active())) {
  if (!(await page.evaluate(() => window.__cutin.ready()))) {
    await page.waitForFunction(() => window.__cutin.ready() || !window.__cutin.active(), undefined, { timeout: 120000 })
    continue
  }
  await page.evaluate((dt) => window.__cutin.step(dt), step)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const info = await page.evaluate(() => {
    const v = window.__cutin.view()
    return `${v.link}/${v.phase} t=${window.__cutin.time().toFixed(2)} scene=${v.scene?.id}`
  })
  if (args.includes('--dump')) {
    const n = await page.evaluate(() => {
      const r3f = window.__r3f
      let meshes = 0
      let visible = 0
      r3f?.scene.traverse((o) => {
        if (o.isMesh) {
          meshes++
          if (o.visible) visible++
        }
      })
      return { meshes, visible, children: r3f?.scene.children.length }
    })
    console.log(info, JSON.stringify(n))
  } else console.log(info)
  await page.screenshot({ path: resolve(out, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 })
  i++
  if (i > 200) break
}
await browser.close()
console.log(`${i} frames in ${out}`)
