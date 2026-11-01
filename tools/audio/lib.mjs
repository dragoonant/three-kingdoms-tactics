// Shared pieces of the Audio Studio runner: paths, the cue table, bar maths, flag parsing, running ffmpeg.
// Node 22, no dependencies. Paths are built with node:path only, so this runs from a Windows shell as well.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..')
export const DEFAULT_BASE = 'http://localhost:7890'
export const DEFAULT_OUT = path.join(REPO_ROOT, 'tools', 'out', 'audio')
export const DEFAULT_PUBLIC = path.join(REPO_ROOT, 'public', 'audio')
export const CUES_FILE = path.join(TOOL_DIR, 'music-cues.json')
export const SAMPLE_RATE = 44100
export const CANDIDATE_LETTERS = ['a', 'b']

/** A bad command line or a missing tool: the message is for the person at the keyboard, the exit code is 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
    this.exitCode = 2
  }
}

// ---- bar maths (docs/spec/60-audio.md section 5) ------------------------------------------------------------------------------------------

/** Length in seconds of `bars` whole bars: bars x beatsPerBar x 60 / bpm. */
export function barSeconds(bpm, beatsPerBar, bars) {
  return (bars * beatsPerBar * 60) / bpm
}
/** The same, as a whole number of samples (rounded to the nearest sample, so the error is under 12 microseconds at 44.1 kHz). */
export function barSamples(bpm, beatsPerBar, bars, sr = SAMPLE_RATE) {
  return Math.round(barSeconds(bpm, beatsPerBar, bars) * sr)
}
export const round3 = (s) => Math.round(s * 1000) / 1000

/** Where raw and mastered files of one cue live: `<id>-a.flac`, `<id>-b.flac` and so on. */
export const candidateLetter = (index) => CANDIDATE_LETTERS[index] ?? String(index)
export const rawFileName = (id, index) => `${id}-${candidateLetter(index)}.flac`
export const masteredBase = (id, letter) => `${id}-${letter}`

// ---- the cue table --------------------------------------------------------------------------------------------------------------------

export function validateCue(c) {
  const where = `cue ${JSON.stringify(c?.id ?? c)}`
  if (!c || typeof c.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) throw new Error(`${where}: id must be lower-case with hyphens`)
  if (c.kind !== 'music' && c.kind !== 'sfx') throw new Error(`${where}: kind must be music or sfx`)
  if (!['bed', 'charge', 'stinger'].includes(c.role)) throw new Error(`${where}: bad role`)
  if (typeof c.prompt !== 'string' || c.prompt.length < 20) throw new Error(`${where}: needs a prompt`)
  if (!Number.isInteger(c.seed)) throw new Error(`${where}: needs an integer seed (it is recorded with the result)`)
  if (c.kind === 'music') {
    if (!(c.bpm >= 10 && c.bpm <= 300)) throw new Error(`${where}: bpm must be 10-300`)
    if (!Number.isInteger(c.bars) || c.bars < 1) throw new Error(`${where}: bars must be a whole number`)
    if (!(c.duration >= 10 && c.duration <= 240)) throw new Error(`${where}: duration must be 10-240 s`)
    if (!(typeof c.lufs === 'number')) throw new Error(`${where}: needs a lufs target`)
    if (barSeconds(c.bpm, c.beatsPerBar, c.bars) > c.duration) throw new Error(`${where}: generated duration is shorter than the loop`)
  } else {
    if (!(c.seconds >= 1 && c.seconds <= 47)) throw new Error(`${where}: seconds must be 1-47`)
    if (!(c.keepSeconds > 0 && c.keepSeconds <= c.seconds)) throw new Error(`${where}: keepSeconds must fit inside seconds`)
    if (!(typeof c.peakDb === 'number')) throw new Error(`${where}: needs a peakDb target`)
  }
}

export function loadCueTable(file = CUES_FILE) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  if (!doc || !Array.isArray(doc.cues)) throw new Error(`${file}: no "cues" array`)
  const seen = new Set()
  for (const c of doc.cues) {
    validateCue(c)
    if (seen.has(c.id)) throw new Error(`${file}: duplicate cue id ${c.id}`)
    seen.add(c.id)
  }
  return doc
}

/** Length the finished loop must have, in seconds (music loops only). */
export function loopSeconds(cue) {
  return cue.kind === 'music' ? barSeconds(cue.bpm, cue.beatsPerBar, cue.bars) : 0
}

// ---- command lines --------------------------------------------------------------------------------------------------------------------

function parse(argv, options) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: false, strict: true }).values
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e))
  }
}
const intIn = (name, text, lo, hi) => {
  const n = Number(text)
  if (!Number.isInteger(n) || n < lo || n > hi) throw new UsageError(`--${name} must be a whole number from ${lo} to ${hi} (got "${text}")`)
  return n
}
const list = (text) => String(text).split(',').map((s) => s.trim()).filter(Boolean)

export function selectOnly(only, cues) {
  if (only === undefined) return null
  const ids = list(only)
  if (ids.length === 0) throw new UsageError('--only needs at least one cue id')
  const known = new Set(cues.map((c) => c.id))
  const bad = ids.filter((id) => !known.has(id))
  if (bad.length) throw new UsageError(`unknown cue id: ${bad.join(', ')}. Known ids: ${cues.map((c) => c.id).join(', ')}`)
  return ids
}

export const GEN_HELP = `Usage: node tools/audio/gen-music.mjs [options]

Asks the local Audio Studio (ACE-Step music, Stable Audio Open effects) for every cue in tools/audio/music-cues.json, one job at a time,
and saves the raw FLACs to tools/out/audio/raw/<id>-a.flac and <id>-b.flac. Cues whose raw files exist are skipped.

  --only <id,id>      only these cues
  --dry-run           print the plan and the request bodies; no network at all
  --base <url>        the studio address (default ${DEFAULT_BASE})
  --candidates 1|2    takes per cue (default 2: a and b)
  --limit <n>         generate at most n cues this run
  --force             regenerate even if raw files exist (the old files are archived first)
  --timeout <sec>     give up on one job after this long (default 900)
  --out <dir>         work folder (default tools/out/audio)
  --help
`

export function parseGenArgs(argv, cues, table = {}) {
  const v = parse(argv, {
    only: { type: 'string' },
    'dry-run': { type: 'boolean' },
    base: { type: 'string' },
    candidates: { type: 'string' },
    limit: { type: 'string' },
    force: { type: 'boolean' },
    timeout: { type: 'string' },
    'poll-ms': { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  })
  let base = (v.base ?? process.env.AUDIO_STUDIO_URL ?? DEFAULT_BASE).replace(/\/+$/, '')
  try {
    const u = new URL(base)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('not http')
  } catch {
    throw new UsageError(`--base must be an http(s) URL such as ${DEFAULT_BASE} (got "${base}")`)
  }
  const candidates = v.candidates === undefined ? (table.candidates ?? 2) : intIn('candidates', v.candidates, 1, 2)
  return {
    help: v.help === true,
    only: selectOnly(v.only, cues),
    dryRun: v['dry-run'] === true,
    force: v.force === true,
    base,
    candidates,
    limit: v.limit === undefined ? null : intIn('limit', v.limit, 1, 1000),
    timeoutMs: (v.timeout === undefined ? 900 : intIn('timeout', v.timeout, 10, 86400)) * 1000,
    pollMs: v['poll-ms'] === undefined ? 2000 : intIn('poll-ms', v['poll-ms'], 1, 60000),
    out: path.resolve(v.out ?? DEFAULT_OUT),
  }
}

export const MASTER_HELP = `Usage: node tools/audio/master-audio.mjs [options]

Masters the raw FLACs in tools/out/audio/raw: trims the head to the first sound, cuts loops to whole bars, normalises loudness,
writes OGG (q5) and M4A (160k) to public/audio/<id>-a|b.*, a report to tools/out/audio/report.json and the manifest.

  --only <id,id>      only these cues
  --ffmpeg <path>     ffmpeg executable (default: ffmpeg on PATH, or the FFMPEG environment variable)
  --audition          also list candidate b as an extra manifest track (<id>-b) so sounds.html can play both; do not commit that
  --pick <id=a|b,..>  choose the candidate that goes in the game (remembered in public/audio/candidates.json)
  --prune             delete the candidate files that were not picked (use after --pick, before committing)
  --seam-fade-ms <n>  declick fade at the start and end of a loop (default 10; 0 = none)
  --jobs <n>          files mastered at once (default 2)
  --dry-run           print what would be mastered; write nothing
  --out <dir>         work folder (default tools/out/audio)
  --public <dir>      where the files and manifest go (default public/audio)
  --help
`

export function parseMasterArgs(argv, cues) {
  const v = parse(argv, {
    only: { type: 'string' },
    ffmpeg: { type: 'string' },
    audition: { type: 'boolean' },
    pick: { type: 'string' },
    prune: { type: 'boolean' },
    'seam-fade-ms': { type: 'string' },
    jobs: { type: 'string' },
    'dry-run': { type: 'boolean' },
    out: { type: 'string' },
    public: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  })
  const picks = {}
  if (v.pick !== undefined) {
    const known = new Set(cues.map((c) => c.id))
    for (const pair of list(v.pick)) {
      const m = /^([a-z0-9-]+)=([ab])$/.exec(pair)
      if (!m) throw new UsageError(`--pick takes id=a or id=b pairs, comma separated (got "${pair}")`)
      if (!known.has(m[1])) throw new UsageError(`--pick: unknown cue id ${m[1]}`)
      picks[m[1]] = m[2]
    }
  }
  return {
    help: v.help === true,
    only: selectOnly(v.only, cues),
    ffmpeg: v.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
    audition: v.audition === true,
    picks,
    prune: v.prune === true,
    seamFadeMs: v['seam-fade-ms'] === undefined ? 10 : intIn('seam-fade-ms', v['seam-fade-ms'], 0, 100),
    jobs: v.jobs === undefined ? 2 : intIn('jobs', v.jobs, 1, 16),
    dryRun: v['dry-run'] === true,
    out: path.resolve(v.out ?? DEFAULT_OUT),
    publicDir: path.resolve(v.public ?? DEFAULT_PUBLIC),
  }
}

export const FAKE_HELP = `Usage: node tools/audio/fake-audio-studio.mjs [--port 7890] [--delay-ms 300] [--ffmpeg <path>]

A stand-in for the Audio Studio API (POST /api/jobs, GET /api/jobs/<id>, GET /files/<id>/<file>, GET /api/status) that answers with a
generated click track at the requested BPM. For testing the runner only: its output is not music and must never be committed.
`

export function parseFakeArgs(argv) {
  const v = parse(argv, {
    port: { type: 'string' },
    'delay-ms': { type: 'string' },
    ffmpeg: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  })
  return {
    help: v.help === true,
    port: v.port === undefined ? 7890 : intIn('port', v.port, 0, 65535),
    delayMs: v['delay-ms'] === undefined ? 300 : intIn('delay-ms', v['delay-ms'], 0, 600000),
    ffmpeg: v.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
  }
}

// ---- requests to the studio -----------------------------------------------------------------------------------------------------------

/** The POST /api/jobs body for one cue (fields as the studio's sanitize() expects them, docs/knowledge-base/local-ai-studios.md). */
export function buildJobBody(cue, table, candidates) {
  if (cue.kind === 'sfx') {
    return {
      mode: 'sfx',
      prompt: cue.prompt,
      negative: cue.negative ?? '',
      seconds: cue.seconds,
      steps: table.sfxSteps ?? 50,
      batch: candidates,
      seed: cue.seed,
    }
  }
  const excl = table.musicExclusions ? `, ${table.musicExclusions}` : ''
  return {
    mode: 'music',
    prompt: `${cue.prompt}${excl}`,
    lyrics: '[Instrumental]',
    duration: cue.duration,
    steps: table.musicSteps ?? 8,
    bpm: cue.bpm,
    key: cue.key,
    timesig: cue.timesig ?? '4',
    batch: candidates,
    seed: cue.seed,
  }
}

// ---- processes ------------------------------------------------------------------------------------------------------------------------

/** Run a program and collect its output. Resolves with { code, stdout: Buffer, stderr: string }; rejects only when it cannot be started. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...opts })
    const out = []
    const err = []
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => err.push(d))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') }))
  })
}

/** Make sure ffmpeg runs and has the encoders the mastering needs; the error says how to fix it on Windows. */
export async function checkFfmpeg(ffmpeg) {
  const hint = `Install ffmpeg (for example: winget install Gyan.FFmpeg), open a new shell so it is on PATH, or pass --ffmpeg <full path to ffmpeg.exe>.`
  let ver
  try {
    ver = await run(ffmpeg, ['-hide_banner', '-version'])
  } catch (e) {
    if (e && e.code === 'ENOENT') throw new UsageError(`ffmpeg was not found ("${ffmpeg}"). ${hint}`)
    throw new UsageError(`ffmpeg could not be started ("${ffmpeg}"): ${e instanceof Error ? e.message : e}. ${hint}`)
  }
  if (ver.code !== 0) throw new UsageError(`"${ffmpeg} -version" failed. ${hint}`)
  const enc = await run(ffmpeg, ['-hide_banner', '-encoders'])
  const missing = ['libvorbis', 'aac'].filter((n) => !new RegExp(`\\s${n}\\s`).test(enc.stdout.toString('utf8')))
  if (missing.length) throw new UsageError(`this ffmpeg has no ${missing.join(' / ')} encoder. Use a full build (the Gyan.FFmpeg or BtbN builds have both).`)
  return { version: (ver.stdout.toString('utf8').split('\n')[0] ?? '').trim() }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** True when this module file was started directly with `node file.mjs` (not imported). Works with Windows paths. */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false
  return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(metaUrl))
}
