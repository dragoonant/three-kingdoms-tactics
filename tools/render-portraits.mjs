// Renders the officer portraits from our own 3D figures (docs/spec/50-presentation.md "Portraits"): head-and-shoulders, three-quarter view,
// warm lantern key light on a silk-and-ink backdrop, 256x256 webp at public/portraits/<officerId>.webp, plus generic-<side>-<kind>.webp.
//   npm run build && node tools/render-portraits.mjs [--only guan-yu,liu-bei] [--out public/portraits] [--sheet e2e-out/portraits-sheet.png]
// It drives the figure lab page (?view=portrait, src/figures-lab/portrait.ts). It uses a server already answering on PW_PORT (the dev server at /,
// or `vite preview` at /three-kingdoms-tactics/) and otherwise starts `vite preview` itself. Chromium comes from /opt/pw-browsers/chromium when present.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const only = opt('only', '')
  .split(',')
  .filter(Boolean)
const OUT = opt('out', 'public/portraits')
const SHEET = opt('sheet', 'e2e-out/portraits-sheet.png')
const PORT = Number(process.env.PW_PORT ?? 5691)
const BASES = [`http://localhost:${PORT}/`, `http://localhost:${PORT}/three-kingdoms-tactics/`]

const answers = async (base) => fetch(`${base}figure-lab.html`).then((r) => r.ok).catch(() => false)
let base = null
let server = null
for (const b of BASES) if (!base && (await answers(b))) base = b
if (!base) {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  base = BASES[1]
  for (let i = 0; i < 60 && !(await answers(base)); i++) await new Promise((r) => setTimeout(r, 500))
}

mkdirSync(OUT, { recursive: true })
mkdirSync(dirname(SHEET), { recursive: true })
const exe = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ...(existsSync(exe) ? { executablePath: exe } : {}),
})
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}figure-lab.html?view=portrait&id=guan-yu`)
  await page.waitForFunction(() => window.__portrait?.ready === true, undefined, { timeout: 120_000 })
  const subjects = await page.evaluate(() => window.__portrait.subjects())
  const todo = only.length ? subjects.filter((s) => only.includes(s.id)) : subjects
  let bytes = 0
  for (const s of todo) {
    const url = await page.evaluate((id) => window.__portrait.render(id), s.id)
    const buf = Buffer.from(url.split(',')[1], 'base64')
    writeFileSync(`${OUT}/${s.id}.webp`, buf)
    bytes += buf.length
  }
  console.log(`wrote ${todo.length} portraits to ${OUT} (${(bytes / 1024).toFixed(0)} KB, avg ${todo.length ? Math.round(bytes / todo.length) : 0} B)`)
  if (!only.length) {
    const sheet = await page.evaluate(() => window.__portrait.sheet())
    writeFileSync(SHEET, Buffer.from(sheet.split(',')[1], 'base64'))
    console.log(`contact sheet: ${SHEET}`)
  }
  if (errors.length) console.log(`ERRORS: ${errors.join(' | ')}`)
} finally {
  await browser.close()
  server?.kill()
}
