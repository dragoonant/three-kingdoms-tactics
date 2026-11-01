#!/usr/bin/env node
// Step 1 of 2: ask the local Audio Studio for every cue in music-cues.json and save the raw FLACs.
// One GPU job at a time, fixed seeds, two candidates (a and b) per cue, idempotent (existing raw files are skipped).
// Step 2 is master-audio.mjs. Instructions: docs/spec/60-audio.md section 7.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildJobBody, GEN_HELP, isMain, loadCueTable, parseGenArgs, rawFileName, sleep, UsageError,
} from './lib.mjs'

const DONE = ['done', 'completed', 'complete', 'succeeded', 'success', 'finished', 'ready']
const FAILED = ['error', 'failed', 'failure', 'cancelled', 'canceled']

/** 'done' | 'failed' | 'pending' from whatever status word the studio uses. */
export function classifyStatus(job) {
  const s = String(job?.status ?? job?.state ?? '').toLowerCase()
  if (DONE.includes(s)) return 'done'
  if (FAILED.includes(s)) return 'failed'
  return 'pending'
}

/** The file names a finished job lists (strings or {name|file|filename} objects), or audio_0.. as a fallback. */
export function jobFileNames(job, expected) {
  for (const key of ['audios', 'files', 'outputs', 'audio', 'results']) {
    const v = job?.[key]
    if (Array.isArray(v) && v.length) {
      const names = v
        .map((e) => (typeof e === 'string' ? e : (e?.name ?? e?.file ?? e?.filename ?? '')))
        .map((s) => String(s).split(/[\\/]/).pop())
        .filter(Boolean)
      if (names.length) return names
    }
  }
  return Array.from({ length: expected }, (_, i) => `audio_${i}.flac`)
}

/** Which candidate indexes of a cue still need a raw file. */
export function missingCandidates(rawDir, cue, candidates, force) {
  const out = []
  for (let i = 0; i < candidates; i++) if (force || !existsSync(path.join(rawDir, rawFileName(cue.id, i)))) out.push(i)
  return out
}

async function http(base, method, route, { body, timeoutMs = 30000, raw = false } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${method} ${route} -> HTTP ${res.status} ${text.slice(0, 300)}`)
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : await res.json().catch(() => ({}))
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

/** Best effort: is some other job queued or running on the studio? (One GPU job at a time.) */
async function studioBusy(base) {
  try {
    const r = await http(base, 'GET', '/api/jobs', { timeoutMs: 10000 })
    const jobs = Array.isArray(r) ? r : Array.isArray(r?.jobs) ? r.jobs : []
    return jobs.filter((j) => ['queued', 'pending', 'running', 'processing'].includes(String(j?.status ?? '').toLowerCase())).length
  } catch {
    return 0
  }
}

/** Run one job to completion and return the saved bytes of its files. Cancels the job when it times out. */
async function runJob(base, body, opts, io, hooks) {
  const created = await http(base, 'POST', '/api/jobs', { body })
  const id = created?.id ?? created?.jobId
  if (!id) throw new Error(`the studio did not return a job id: ${JSON.stringify(created).slice(0, 200)}`)
  hooks.current = { base, id }
  const t0 = Date.now()
  let wait = opts.pollMs
  let job = {}
  try {
    for (;;) {
      await sleep(wait)
      wait = Math.min(Math.round(wait * 1.5), 10000)
      job = await http(base, 'GET', `/api/jobs/${encodeURIComponent(id)}`)
      const state = classifyStatus(job)
      if (state === 'done') break
      if (state === 'failed') throw new Error(`job ${id} ${job.status}: ${String(job.error ?? job.message ?? '').slice(0, 300)}`)
      if (Date.now() - t0 > opts.timeoutMs) {
        await http(base, 'POST', `/api/jobs/${encodeURIComponent(id)}/cancel`, { body: {}, timeoutMs: 10000 }).catch(() => {})
        throw new Error(`job ${id} did not finish within ${Math.round(opts.timeoutMs / 1000)} s (cancelled)`)
      }
    }
  } finally {
    hooks.current = null
  }
  const names = jobFileNames(job, body.batch)
  const files = []
  for (const name of names.slice(0, body.batch)) {
    const data = await http(base, 'GET', `/files/${encodeURIComponent(id)}/${encodeURIComponent(name)}`, { raw: true, timeoutMs: 120000 })
    files.push({ name, data })
  }
  io.log(`    job ${id} done in ${Math.round((Date.now() - t0) / 1000)} s, ${files.length} file(s)`)
  return { id, seconds: (Date.now() - t0) / 1000, files }
}

/**
 * The generator. `io` is { log, err } so tests can capture the output; `hooks.current` lets the CLI cancel a running job on Ctrl-C.
 * Returns the exit code: 0 ok (or nothing to do), 1 some cue failed, 2 bad command line or the studio cannot be reached.
 */
export async function main(argv, io = { log: console.log, err: console.error }, hooks = { current: null }) {
  const table = loadCueTable()
  let opts
  try {
    opts = parseGenArgs(argv, table.cues, table)
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`error: ${e.message}\n`)
      io.err(GEN_HELP)
      return e.exitCode
    }
    throw e
  }
  if (opts.help) {
    io.log(GEN_HELP)
    return 0
  }
  const rawDir = path.join(opts.out, 'raw')
  const logFile = path.join(rawDir, 'generation-log.json')
  const selected = table.cues.filter((c) => !opts.only || opts.only.includes(c.id))

  let work = selected.map((cue) => ({ cue, need: missingCandidates(rawDir, cue, opts.candidates, opts.force) })).filter((w) => w.need.length > 0)
  const skipped = selected.length - work.length
  if (opts.limit !== null) work = work.slice(0, opts.limit)

  io.log(`Audio Studio runner: ${selected.length} cue(s) selected, ${work.length} to generate, ${skipped} already have raw files${opts.force ? ' (force: regenerating)' : ''}.`)
  for (const w of work) {
    const body = buildJobBody(w.cue, table, opts.candidates)
    const len = w.cue.kind === 'music' ? `${w.cue.duration} s` : `${w.cue.seconds} s`
    io.log(`  ${w.cue.id.padEnd(15)} ${w.cue.kind.padEnd(5)} ${len.padStart(6)}  seed ${w.cue.seed}  -> ${w.need.map((i) => rawFileName(w.cue.id, i)).join(', ')}`)
    if (opts.dryRun) io.log(`      request: ${JSON.stringify(body)}`)
  }
  if (opts.dryRun) {
    io.log(`\nDry run: nothing was sent to ${opts.base}. Raw files would go to ${rawDir}.`)
    return 0
  }
  if (work.length === 0) {
    io.log('Nothing to do. (Use --force to regenerate, or --only <id> --force for one cue.)')
    return 0
  }

  io.log(`\nGPU WORK STARTS: ${work.length} job(s) on ${opts.base}, one at a time. Tell the owner before running this and stop the studio afterwards.`)
  try {
    const st = await http(opts.base, 'GET', '/api/status', { timeoutMs: 10000 })
    io.log(`Studio status: ${JSON.stringify(st).slice(0, 300)}`)
  } catch (e) {
    io.err(`error: cannot reach the Audio Studio at ${opts.base} (${e instanceof Error ? e.message : e}).`)
    io.err('Start it on the PC (it listens on port 7890) or pass --base <url>.')
    return 2
  }

  mkdirSync(rawDir, { recursive: true })
  const log = readJson(logFile, {})
  let failures = 0
  let consecutive = 0
  let generated = 0
  for (const w of work) {
    const { cue } = w
    io.log(`\n[${generated + failures + 1}/${work.length}] ${cue.id}: ${cue.prompt.slice(0, 80)}...`)
    try {
      for (let waited = 0; ; waited++) {
        const busy = await studioBusy(opts.base)
        if (busy === 0) break
        if (waited === 0) io.log(`    the studio has ${busy} other job(s) queued or running; waiting (never two GPU jobs at once)`)
        if (waited * 5000 > opts.timeoutMs) throw new Error('the studio stayed busy with other jobs')
        await sleep(5000)
      }
      const body = buildJobBody(cue, table, opts.candidates)
      const job = await runJob(opts.base, body, opts, io, hooks)
      const archived = []
      const saved = []
      const archiveDir = path.join(rawDir, 'archive', stamp())
      job.files.forEach((f, i) => {
        if (!w.need.includes(i)) return // keep the take that is already there
        const target = path.join(rawDir, rawFileName(cue.id, i))
        const tmp = `${target}.part`
        if (f.data.length < 1024) throw new Error(`${f.name} is only ${f.data.length} bytes`)
        if (f.data.subarray(0, 4).toString('latin1') !== 'fLaC') io.log(`    note: ${f.name} does not start with the FLAC marker; ffmpeg will sniff the real format`)
        writeFileSync(tmp, f.data)
        if (existsSync(target)) {
          mkdirSync(archiveDir, { recursive: true })
          renameSync(target, path.join(archiveDir, rawFileName(cue.id, i)))
          archived.push(rawFileName(cue.id, i))
        }
        renameSync(tmp, target)
        saved.push(rawFileName(cue.id, i))
      })
      if (job.files.length < opts.candidates) io.log(`    warning: asked for ${opts.candidates} candidate(s), got ${job.files.length}`)
      if (archived.length) io.log(`    archived ${archived.length} older file(s) to ${path.relative(process.cwd(), archiveDir) || archiveDir}`)
      log[cue.id] = {
        seed: cue.seed,
        jobId: job.id,
        studioFiles: job.files.map((f) => f.name),
        files: saved,
        seconds: Math.round(job.seconds * 10) / 10,
        finishedAt: new Date().toISOString(),
        base: opts.base,
        request: body,
      }
      writeFileSync(logFile, `${JSON.stringify(log, null, 2)}\n`)
      generated++
      consecutive = 0
      io.log(`    saved ${saved.join(', ')}`)
    } catch (e) {
      failures++
      consecutive++
      io.err(`    FAILED ${cue.id}: ${e instanceof Error ? e.message : e}`)
      if (consecutive >= 2) {
        io.err('Two cues failed in a row; stopping so the GPU is not hammered. Fix the studio and run again (finished cues are skipped).')
        break
      }
    }
  }
  io.log(`\nGenerated ${generated} cue(s), ${failures} failure(s). Raw files: ${rawDir}`)
  io.log('Next: node tools/audio/master-audio.mjs   (and stop the Audio Studio when you are done with it)')
  return failures ? 1 : 0
}

if (isMain(import.meta.url)) {
  const hooks = { current: null }
  process.once('SIGINT', async () => {
    const cur = hooks.current
    if (cur) {
      console.error(`\nInterrupted: cancelling job ${cur.id} on the studio...`)
      await http(cur.base, 'POST', `/api/jobs/${encodeURIComponent(cur.id)}/cancel`, { body: {}, timeoutMs: 5000 }).catch(() => {})
    }
    process.exit(130)
  })
  main(process.argv.slice(2), { log: console.log, err: console.error }, hooks).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(e instanceof Error ? e.stack : e)
      process.exitCode = 1
    },
  )
}
