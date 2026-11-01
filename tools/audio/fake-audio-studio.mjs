#!/usr/bin/env node
// A stand-in for the local Audio Studio (port 7890) so the runner can be exercised without the GPU PC.
// Same endpoints as docs/knowledge-base/local-ai-studios.md: GET /api/status, GET/POST /api/jobs, GET /api/jobs/<id>,
// POST /api/jobs/<id>/cancel, GET /files/<id>/<file>. The audio is a click track at the requested BPM (music) or a noise burst (sfx),
// made with ffmpeg. It is NOT music. Never commit its output.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { FAKE_HELP, isMain, parseFakeArgs, run, sleep, UsageError } from './lib.mjs'


/** Check a request the way the real studio's sanitize() does (ranges from the knowledge base); returns an error string or null. */
export function validateJob(b) {
  if (!b || typeof b !== 'object') return 'body must be a JSON object'
  const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
  if (typeof b.prompt !== 'string' || !b.prompt.trim()) return 'prompt is required'
  if (b.seed !== undefined && !Number.isInteger(b.seed)) return 'seed must be an integer'
  if (b.mode === 'music') {
    if (!inRange(b.duration ?? 60, 10, 240)) return 'duration must be 10-240'
    if (b.steps !== undefined && !inRange(b.steps, 1, 30)) return 'steps must be 1-30'
    if (b.bpm !== undefined && !inRange(b.bpm, 10, 300)) return 'bpm must be 10-300'
    if (b.timesig !== undefined && !['2', '3', '4', '6'].includes(String(b.timesig))) return 'timesig must be 2, 3, 4 or 6'
    if (b.batch !== undefined && !inRange(b.batch, 1, 2)) return 'batch must be 1-2'
    return null
  }
  if (b.mode === 'sfx') {
    if (!inRange(b.seconds ?? 10, 1, 47)) return 'seconds must be 1-47'
    if (b.steps !== undefined && !inRange(b.steps, 1, 100)) return 'steps must be 1-100'
    if (b.batch !== undefined && !inRange(b.batch, 1, 4)) return 'batch must be 1-4'
    return null
  }
  return `mode "${b.mode}" is not supported by the fake studio (music, sfx)`
}

/** Render one fake take with ffmpeg: `variant` 0 or 1 gives two different-sounding candidates. */
export async function renderFake(ffmpeg, body, variant, outFile) {
  const sr = 44100
  let expr
  let dur
  let head
  if (body.mode === 'sfx') {
    dur = body.seconds ?? 10
    head = 0.12 + 0.05 * variant
    const e = `0.9*(random(${(body.seed ?? 1) + variant})-0.5)*2*exp(-t*9)+0.5*sin(2*PI*${70 + 20 * variant}*t)*exp(-t*12)`
    expr = `${e}|${e}`
  } else {
    dur = body.duration ?? 60
    head = 0.3 - 0.12 * variant // a little silence before the first beat: the master has to trim it
    const p = 60 / (body.bpm ?? 120)
    const beat = `mod(t,${p})`
    const bar = `mod(t,${4 * p})`
    const tail = `min(1,exp(-(t-${Math.max(0, dur - 4)})*1.5))` // a natural ring-out in the last 4 s
    const click = `0.25*exp(-${beat}*30)*sin(2*PI*(${900 + 150 * variant}+300*lt(${bar},${p}))*t)`
    const tone = `0.2*sin(2*PI*${196 + 10 * variant}*t)+0.1*sin(2*PI*${392 + 20 * variant}*t)`
    const e = `${tail}*(${click}+${tone})`
    expr = `${e}|${e}`
  }
  const ms = Math.round(head * 1000)
  const args = [
    '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=${sr}:d=${dur}`,
    '-af', `adelay=${ms}|${ms}`, '-c:a', 'flac', outFile,
  ]
  const r = await run(ffmpeg, args)
  if (r.code !== 0) throw new Error(`ffmpeg failed making a fake take: ${r.stderr.slice(-300)}`)
}

/**
 * Start the fake studio. Returns { url, port, stats, close }. `stats` counts requests and the highest number of jobs running at once,
 * so a test can prove the runner never sends two GPU jobs at the same time.
 */
export async function startFakeStudio({ port = 0, delayMs = 300, ffmpeg = 'ffmpeg' } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fake-audio-studio-'))
  const jobs = new Map()
  const stats = { requests: 0, statusCalls: 0, posts: 0, rejected: 0, running: 0, maxConcurrent: 0, jobs: [] }
  let chain = Promise.resolve() // one GPU job at a time, in arrival order
  let counter = 0

  const processJob = (job) => {
    chain = chain.then(async () => {
      if (job.status === 'cancelled') return
      job.status = 'running'
      stats.running++
      stats.maxConcurrent = Math.max(stats.maxConcurrent, stats.running)
      try {
        await sleep(delayMs)
        const jobDir = path.join(dir, job.id)
        mkdirSync(jobDir, { recursive: true })
        const n = job.params.batch ?? 1
        const names = []
        for (let i = 0; i < n; i++) {
          const name = `audio_${i}.flac`
          await renderFake(ffmpeg, job.params, i, path.join(jobDir, name))
          names.push(name)
        }
        job.audios = names
        job.status = 'done'
      } catch (e) {
        job.status = 'error'
        job.error = e instanceof Error ? e.message : String(e)
      } finally {
        stats.running--
      }
    })
  }

  const send = (res, code, obj) => {
    const text = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
    res.end(text)
  }
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    })

  const server = http.createServer(async (req, res) => {
    stats.requests++
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        stats.statusCalls++
        return send(res, 200, { ok: true, fake: true, busy: stats.running > 0, queue: [...jobs.values()].filter((j) => j.status === 'queued').length })
      }
      if (req.method === 'GET' && url.pathname === '/api/jobs') {
        return send(res, 200, [...jobs.values()].map((j) => ({ id: j.id, status: j.status, mode: j.params.mode })))
      }
      if (req.method === 'POST' && url.pathname === '/api/jobs') {
        stats.posts++
        let body
        try {
          body = JSON.parse((await readBody(req)) || '{}')
        } catch {
          stats.rejected++
          return send(res, 400, { error: 'invalid JSON' })
        }
        const err = validateJob(body)
        if (err) {
          stats.rejected++
          return send(res, 400, { error: err })
        }
        const id = `fake${String(++counter).padStart(4, '0')}`
        const job = { id, status: 'queued', params: body, audios: [] }
        jobs.set(id, job)
        stats.jobs.push({ id, body })
        processJob(job)
        return send(res, 200, { id })
      }
      if (parts[0] === 'api' && parts[1] === 'jobs' && parts[2]) {
        const job = jobs.get(parts[2])
        if (!job) return send(res, 404, { error: 'no such job' })
        if (req.method === 'GET' && parts.length === 3) {
          return send(res, 200, { id: job.id, status: job.status, mode: job.params.mode, params: job.params, audios: job.audios, error: job.error })
        }
        if (req.method === 'POST' && parts[3] === 'cancel') {
          if (job.status === 'queued') job.status = 'cancelled'
          return send(res, 200, { id: job.id, status: job.status })
        }
      }
      if (req.method === 'GET' && parts[0] === 'files' && parts.length === 3) {
        const job = jobs.get(parts[1])
        const name = parts[2]
        if (!job || !/^audio_\d+\.flac$/.test(name ?? '') || !job.audios.includes(name)) return send(res, 404, { error: 'no such file' })
        const data = readFileSync(path.join(dir, job.id, name))
        res.writeHead(200, { 'content-type': 'audio/flac', 'content-length': data.length })
        return res.end(data)
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const actual = server.address().port
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    stats,
    close: async () => {
      await new Promise((r) => server.close(r))
      await chain.catch(() => {})
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

if (isMain(import.meta.url)) {
  try {
    const opts = parseFakeArgs(process.argv.slice(2))
    if (opts.help) {
      console.log(FAKE_HELP)
    } else {
      const s = await startFakeStudio(opts)
      console.log(`Fake Audio Studio listening on ${s.url} (delay ${opts.delayMs} ms per job). Point the runner at it with --base ${s.url}. Ctrl-C to stop.`)
      process.once('SIGINT', () => {
        void s.close().then(() => process.exit(0))
      })
    }
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`error: ${e.message}\n\n${FAKE_HELP}`)
      process.exitCode = e.exitCode
    } else throw e
  }
}
