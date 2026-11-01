// Hugging Face portrait generator (docs/spec/50-presentation.md "Portraits"): paints a head-and-shoulders portrait of every officer with
// FLUX.1-schnell through the Hugging Face inference router and writes public/portraits/<id>.webp (256x256), the same paths the rendered
// portraits use, so a generated one swaps in with no code change.
//
//   HF_TOKEN=... node tools/portraits/gen-hf.mjs --dry-run                 plan only: zero network, no token needed
//   HF_TOKEN=... node tools/portraits/gen-hf.mjs --only guan-yu,zhang-fei   exact ids (sample three, look, then batch)
//   HF_TOKEN=... node tools/portraits/gen-hf.mjs --audition [--only liu-bei] one subject in four style variants, contact sheet in tools/out
//   HF_TOKEN=... node tools/portraits/gen-hf.mjs --limit 10                 cap the paid calls of a run
//   HF_TOKEN=... node tools/portraits/gen-hf.mjs --force                    replace existing files (the old ones are archived first)
//   --out <dir>   write somewhere else (default public/portraits)
//
// The token is read from the HF_TOKEN environment variable only: never hard-coded, never printed. Without it a live run stops before any
// request. The prompt lint refuses to write the prompts file (tools/out/portraits-prompts.json) and refuses to run when a prompt is not clean.
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { AUDITION_STYLES, buildPlan, lintAll, loadSubjects, promptFor, STYLE } from './lib.mjs'

export const MODEL_URL = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell'
const OUT_DIR = 'tools/out'
const PX = 256

export function parseArgs(argv) {
  const flag = (n) => argv.includes(`--${n}`)
  const val = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
  }
  const limit = val('limit')
  return {
    dryRun: flag('dry-run'),
    force: flag('force'),
    audition: flag('audition'),
    only: (val('only') ?? '').split(',').filter(Boolean),
    limit: limit === undefined ? Infinity : Number(limit),
    out: val('out') ?? 'public/portraits',
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One text-to-image call; backs off on 429 and 503 (model loading). Returns the image bytes. */
async function generate(prompt, seed, token) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(MODEL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify({ inputs: prompt, parameters: { width: 512, height: 512, num_inference_steps: 4, seed } }),
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if (res.status === 429 || res.status === 503) {
      await sleep(Math.min(60_000, 2000 * 2 ** attempt))
      continue
    }
    throw new Error(`Hugging Face answered ${res.status} ${res.statusText}`)
  }
  throw new Error('Hugging Face kept answering 429/503; try again later')
}

/** Downscale to 256x256 webp in headless Chromium (no image library needed). The bottom 6% is cropped: the model tends to sign its work. */
async function toWebp(browser, bytes) {
  const page = await browser.newPage()
  try {
    const b64 = bytes.toString('base64')
    const url = await page.evaluate(
      async ([data, px]) => {
        const blob = await (await fetch(`data:application/octet-stream;base64,${data}`)).blob()
        const bmp = await createImageBitmap(blob)
        const c = document.createElement('canvas')
        c.width = c.height = px
        const ctx = c.getContext('2d')
        const sh = bmp.height * 0.94
        const side = Math.min(bmp.width, sh)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bmp, (bmp.width - side) / 2, 0, side, side, 0, 0, px, px)
        return c.toDataURL('image/webp', 0.82)
      },
      [b64, PX],
    )
    return Buffer.from(url.split(',')[1], 'base64')
  } finally {
    await page.close()
  }
}

async function openBrowser() {
  const require = createRequire(import.meta.url)
  const { chromium } = require('playwright')
  const exe = '/opt/pw-browsers/chromium'
  return chromium.launch(existsSync(exe) ? { executablePath: exe } : {})
}

export async function main(argv = process.argv.slice(2), env = process.env, log = console.log) {
  const opts = parseArgs(argv)
  const subjects = loadSubjects('.')
  const lint = lintAll(subjects)
  if (!lint.ok) {
    log(`prompt lint failed (${lint.problems.length}); nothing written:`)
    for (const [where, v] of lint.problems.slice(0, 40)) log(`  ${where}: ${v}`)
    return 1
  }
  const exists = (id) => existsSync(join(opts.out, `${id}.webp`))
  let plan
  try {
    plan = buildPlan(subjects, { only: opts.only, limit: opts.limit, force: opts.force, exists })
  } catch (e) {
    log(String(e.message))
    return 1
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'portraits-prompts.json'), JSON.stringify({ style: STYLE, prompts: plan.map((p) => ({ id: p.id, seed: p.seed, prompt: p.prompt })) }, null, 2))

  if (opts.audition) {
    const id = opts.only[0] ?? 'guan-yu'
    const subject = subjects.find((s) => s.id === id)
    if (!subject) {
      log(`--audition: no portrait subject ${id}`)
      return 1
    }
    const prompts = AUDITION_STYLES.map((st) => promptFor(subject, st))
    log(`audition for ${id}: ${prompts.length} style variants${opts.dryRun ? ' (dry run, no network)' : ''}`)
    prompts.forEach((p, i) => log(`  [${i}] ${p.length} chars: ${p}`))
    if (opts.dryRun) return 0
    const token = env.HF_TOKEN
    if (!token) {
      log('HF_TOKEN is not set; set it in the environment to generate (use --dry-run to see the plan).')
      return 1
    }
    const dir = join(OUT_DIR, 'portraits-audition')
    mkdirSync(dir, { recursive: true })
    const browser = await openBrowser()
    try {
      const files = []
      for (const [i, p] of prompts.entries()) {
        const webp = await toWebp(browser, await generate(p, plan[0]?.seed ?? 1, token))
        const f = `${id}-style${i}.webp`
        writeFileSync(join(dir, f), webp)
        files.push(f)
        log(`  wrote ${join(dir, f)}`)
      }
      writeFileSync(
        join(dir, 'contact.html'),
        `<!doctype html><meta charset="utf-8"><title>Audition ${id}</title><body style="margin:0;background:#14100d;color:#efe6d2;font:14px sans-serif;display:flex;gap:12px;padding:12px">${files.map((f, i) => `<figure style="margin:0"><img src="${f}" width="256" height="256"><figcaption>style ${i}</figcaption></figure>`).join('')}</body>`,
      )
      log(`contact sheet: ${join(dir, 'contact.html')}`)
    } finally {
      await browser.close()
    }
    return 0
  }

  const counts = { generate: 0, replace: 0, skip: 0, defer: 0 }
  for (const p of plan) {
    counts[p.action] += 1
    log(`${p.action.padEnd(8)} ${p.id.padEnd(26)} seed ${String(p.seed).padStart(10)}  ${p.prompt.length} chars`)
  }
  log(`plan: ${counts.generate} to generate, ${counts.replace} to replace (archived first), ${counts.skip} already present, ${counts.defer} deferred by --limit`)
  if (plan[0]) log(`first prompt:\n  ${plan[0].prompt}`)
  log(`STYLE (byte-identical on every prompt):\n  ${STYLE}`)
  if (opts.dryRun) {
    log('dry run: no network, no files written except tools/out/portraits-prompts.json')
    return 0
  }
  const todo = plan.filter((p) => p.action === 'generate' || p.action === 'replace')
  if (todo.length === 0) return 0
  const token = env.HF_TOKEN
  if (!token) {
    log('HF_TOKEN is not set; set it in the environment to generate (use --dry-run to see the plan).')
    return 1
  }
  mkdirSync(opts.out, { recursive: true })
  const archive = join(OUT_DIR, 'portraits-archive', new Date().toISOString().replace(/[:.]/g, '-'))
  const browser = await openBrowser()
  let done = 0
  try {
    for (const p of todo) {
      const target = join(opts.out, p.file)
      if (p.action === 'replace' && existsSync(target)) {
        mkdirSync(archive, { recursive: true })
        copyFileSync(target, join(archive, p.file))
      }
      const webp = await toWebp(browser, await generate(p.prompt, p.seed, token))
      writeFileSync(target, webp)
      done += 1
      log(`wrote ${target} (${webp.length} B) [${done}/${todo.length}]`)
    }
  } finally {
    await browser.close()
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      // never print the token: only the message
      console.error(String(e?.message ?? e))
      process.exit(1)
    },
  )
}
