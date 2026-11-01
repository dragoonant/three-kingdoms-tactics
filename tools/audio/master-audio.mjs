#!/usr/bin/env node
// Step 2 of 2: master the raw FLACs from gen-music.mjs into game-ready OGG + M4A, measure them, and write the manifest.
//   head silence trimmed so bar 1 starts at 0.000 s -> loops cut to exactly bars x beats x 60 / bpm (10 ms declick at the seam)
//   -> loudnorm two-pass (-16 LUFS beds and charge, -14 jingles; effects peak -3 dBFS) -> OGG q5 + M4A 160k
//   -> tools/out/audio/report.json (LUFS, true peak, crest factor, length, tempo check) -> public/audio/manifest.json (+ candidates.json)
// Needs only ffmpeg. Instructions: docs/spec/60-audio.md section 7. Everything it says about sound is "not verified by ear".
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { estimateTempo, findFirstSound, findLastSound } from './dsp.mjs'
import {
  barSamples, CANDIDATE_LETTERS, checkFfmpeg, isMain, loadCueTable, loopSeconds, MASTER_HELP, parseMasterArgs, rawFileName,
  round3, run, SAMPLE_RATE, UsageError,
} from './lib.mjs'

const SR = SAMPLE_RATE
const TRUE_PEAK_LIMIT = -1.5 // the loudnorm ceiling; the spec's limit is -1 dBTP, the margin covers the lossy encode
const TRUE_PEAK_LIMIT_AFTER_ENCODE = -1.0 // the spec's limit, checked on the finished files
const JINGLE_TAIL_SEC = 0.25 // kept after the last audible sample of a jingle
const JINGLE_FADE_SEC = 0.25
const SFX_FADE_SEC = 0.06

// ---- measuring ------------------------------------------------------------------------------------------------------------------------

const num = (s) => (s === undefined || /inf/i.test(s) ? -Infinity : Number(s))

/** Integrated loudness, loudness range, true peak, sample peak, RMS, crest factor (peak - RMS, dB) and sample count of a file. */
export async function measureFile(ffmpeg, file) {
  const r = await run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet,astats=measure_perchannel=none', '-f', 'null', '-'])
  if (r.code !== 0) throw new Error(`could not measure ${file}: ${r.stderr.slice(-300)}`)
  const t = r.stderr
  const I = /Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+|-?inf)\s*LUFS/i.exec(t)
  const LRA = /Loudness range:[\s\S]*?LRA:\s*(-?[\d.]+)\s*LU/i.exec(t)
  const TP = /True peak:[\s\S]*?Peak:\s*(-?[\d.]+|-?inf)\s*dBFS/i.exec(t)
  const overall = t.slice(t.lastIndexOf('Overall'))
  const PK = /Peak level dB:\s*(-?[\d.]+|-?inf)/i.exec(overall)
  const RMS = /RMS level dB:\s*(-?[\d.]+|-?inf)/i.exec(overall)
  const N = /Number of samples:\s*(\d+)/i.exec(overall)
  if (!I || !TP || !PK || !RMS || !N) throw new Error(`could not read the loudness numbers for ${file}`)
  const peakDb = num(PK[1])
  const rmsDb = num(RMS[1])
  const r1 = (v) => Math.round(v * 10) / 10
  return {
    lufs: r1(num(I[1])),
    lra: r1(Number(LRA?.[1] ?? 0)),
    truePeakDb: r1(num(TP[1])),
    peakDb: r1(peakDb),
    rmsDb: r1(rmsDb),
    crestDb: r1(peakDb - rmsDb),
    samples: Number(N[1]),
  }
}

async function decodeMono(ffmpeg, file) {
  const r = await run(ffmpeg, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'])
  if (r.code !== 0) throw new Error(`could not decode ${file}: ${r.stderr.slice(-300)}`)
  const b = r.stdout
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)))
}

// ---- one file -------------------------------------------------------------------------------------------------------------------------

/** Work out where to cut: start sample, length in samples, and the fades. Pure, so the bar maths can be tested. */
export function planCut(cue, x, opts) {
  const first = findFirstSound(x, SR, -50)
  if (first < 0) throw new Error('the file is silent')
  const seam = Math.round((opts.seamFadeMs / 1000) * SR)
  if (cue.kind === 'sfx') {
    const start = Math.max(0, first - Math.round(0.002 * SR))
    const lastEnd = findLastSound(x, SR, -50)
    const natural = Math.max(Math.round(0.05 * SR), lastEnd - start + Math.round(0.02 * SR))
    const length = Math.min(Math.round(cue.keepSeconds * SR), natural, x.length - start)
    return { start, length, fadeIn: Math.round(0.001 * SR), fadeOut: Math.min(Math.round(SFX_FADE_SEC * SR), Math.floor(length / 2)), firstSound: first, padded: 0 }
  }
  const loopLen = barSamples(cue.bpm, cue.beatsPerBar, cue.bars, SR)
  if (cue.loop) {
    return { start: first, length: loopLen, fadeIn: seam, fadeOut: seam, firstSound: first, padded: Math.max(0, first + loopLen - x.length) }
  }
  // jingle: at least the nominal bars, then the natural ring-out up to the end of the take
  const lastEnd = findLastSound(x, SR, -55)
  const wanted = Math.max(loopLen, lastEnd - first + Math.round(JINGLE_TAIL_SEC * SR))
  const length = Math.min(wanted, x.length - first)
  return { start: first, length, fadeIn: seam, fadeOut: Math.round(JINGLE_FADE_SEC * SR), firstSound: first, padded: Math.max(0, loopLen - length) }
}

function fadeFilter(plan) {
  const parts = []
  if (plan.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${(plan.fadeIn / SR).toFixed(6)}`)
  if (plan.fadeOut > 0) parts.push(`afade=t=out:st=${((plan.length - plan.fadeOut) / SR).toFixed(6)}:d=${(plan.fadeOut / SR).toFixed(6)}`)
  return parts.join(',')
}

async function ff(ffmpeg, args) {
  const r = await run(ffmpeg, ['-hide_banner', '-nostats', '-y', ...args])
  if (r.code !== 0) throw new Error(`ffmpeg failed (${args.slice(-1)[0]}): ${r.stderr.slice(-400)}`)
  return r
}

/** Master one raw file. Returns the report entry. */
export async function masterOne({ ffmpeg, cue, letter, rawFile, workDir, publicDir, opts }) {
  mkdirSync(workDir, { recursive: true })
  const warnings = []
  const x = await decodeMono(ffmpeg, rawFile)
  const plan = planCut(cue, x, opts)
  const seg = path.join(workDir, 'seg.wav')
  const norm = path.join(workDir, 'norm.wav')
  const base = `${cue.id}-${letter}`

  // 1. cut: the first sound is sample 0, the length is exact (padded with silence if the take came back too short)
  await ff(ffmpeg, [
    '-i', rawFile, '-af',
    `aresample=${SR},atrim=start_sample=${plan.start}:end_sample=${plan.start + plan.length},asetpts=PTS-STARTPTS,apad=whole_len=${plan.length}`,
    '-ac', '2', '-c:a', 'pcm_f32le', seg,
  ])
  if (plan.padded > 0) warnings.push(`the take is ${(plan.padded / SR).toFixed(2)} s shorter than the loop; padded with silence. Regenerate with a longer duration`)

  // 2. level: loudnorm two-pass for music, peak normalise for effects
  let chain
  if (cue.kind === 'sfx') {
    const m = await measureFile(ffmpeg, seg)
    const gain = cue.peakDb - m.peakDb
    chain = `volume=${gain.toFixed(3)}dB`
  } else {
    const p1 = await ff(ffmpeg, ['-i', seg, '-af', `loudnorm=I=${cue.lufs}:TP=${TRUE_PEAK_LIMIT}:LRA=20:print_format=json`, '-f', 'null', '-'])
    const j = /\{[^{}]*"input_i"[^{}]*\}/.exec(p1.stderr)
    if (!j) throw new Error('loudnorm printed no measurement')
    const m = JSON.parse(j[0])
    chain =
      `loudnorm=I=${cue.lufs}:TP=${TRUE_PEAK_LIMIT}:LRA=20:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
      `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  }
  const fades = fadeFilter(plan)
  const fadeArgs = fades ? ['-af', fades] : []
  const ogg = path.join(publicDir, `${base}.ogg`)
  const m4a = path.join(publicDir, `${base}.m4a`)
  mkdirSync(publicDir, { recursive: true })

  // 3. write norm.wav, encode both formats from it with the same fades, and measure what was actually written (decoded OGG and M4A).
  //    Lossy coding can overshoot a peak by a dB or two (noise bursts especially), so trim the gain and encode again, up to twice.
  let extra = 0
  let mo
  let ma
  for (let attempt = 0; ; attempt++) {
    const trim = extra === 0 ? '' : `,volume=${extra.toFixed(3)}dB`
    await ff(ffmpeg, ['-i', seg, '-af', `${chain}${trim},aresample=${SR},apad=whole_len=${plan.length},atrim=end_sample=${plan.length}`, '-ar', String(SR), '-c:a', 'pcm_f32le', norm])
    await ff(ffmpeg, ['-i', norm, ...fadeArgs, '-c:a', 'libvorbis', '-q:a', '5', '-ar', String(SR), '-ac', '2', ogg])
    await ff(ffmpeg, ['-i', norm, ...fadeArgs, '-c:a', 'aac', '-b:a', '160k', '-ar', String(SR), '-ac', '2', '-movflags', '+faststart', m4a])
    mo = await measureFile(ffmpeg, ogg)
    ma = await measureFile(ffmpeg, m4a)
    const over = cue.kind === 'sfx' ? Math.max(mo.peakDb, ma.peakDb) - cue.peakDb : Math.max(mo.truePeakDb, ma.truePeakDb) - TRUE_PEAK_LIMIT_AFTER_ENCODE
    if (over <= 0.3 || attempt >= 2) break
    extra -= over + 0.1
  }
  if (extra !== 0) warnings.push(`gain trimmed by ${extra.toFixed(1)} dB after encoding to keep the peak in bounds`)

  const entry = {
    id: cue.id,
    candidate: letter,
    kind: cue.kind,
    role: cue.role,
    seed: cue.seed,
    prompt: cue.prompt,
    rawFile: path.basename(rawFile),
    rawSeconds: round3(x.length / SR),
    firstSoundSec: round3(plan.firstSound / SR),
    requestedBpm: cue.bpm,
    bars: cue.bars ?? null,
    beatsPerBar: cue.beatsPerBar,
    expectedSeconds: cue.kind === 'music' && cue.loop ? round3(loopSeconds(cue)) : null,
    seconds: round3(plan.length / SR),
    samples: plan.length,
    targetLufs: cue.kind === 'music' ? cue.lufs : null,
    targetPeakDb: cue.kind === 'sfx' ? cue.peakDb : null,
    lufs: mo.lufs,
    lra: mo.lra,
    truePeakDb: mo.truePeakDb,
    peakDb: mo.peakDb,
    rmsDb: mo.rmsDb,
    crestDb: mo.crestDb,
    ogg: { file: `${base}.ogg`, bytes: statSync(ogg).size, samples: mo.samples, seconds: round3(mo.samples / SR) },
    m4a: { file: `${base}.m4a`, bytes: statSync(m4a).size, samples: ma.samples, seconds: round3(ma.samples / SR), lufs: ma.lufs, truePeakDb: ma.truePeakDb },
    loopSeamFadeMs: cue.loop ? opts.seamFadeMs : null,
    notVerifiedByEar: true,
    warnings,
  }

  // 5. rough tempo check (the requested BPM is trusted; this only warns)
  if (cue.kind === 'music' && cue.bpm > 0) {
    const t = estimateTempo(x.subarray(plan.start), SR, cue.bpm)
    entry.detectedBpm = t.detectedBpm
    entry.tempoDriftPct = t.driftPct
    entry.tempoConfidence = t.confidence
    if (Math.abs(t.driftPct) > 2.5) warnings.push(`rough tempo check says ${t.detectedBpm} BPM vs requested ${cue.bpm}; check the grid by ear or time-stretch before trusting the loop`)
  }
  if (plan.firstSound / SR > 1) warnings.push(`the take starts ${(plan.firstSound / SR).toFixed(2)} s late; the lead-in was trimmed (check that bar 1 still lands on the downbeat)`)
  if (cue.kind === 'music' && Math.abs(mo.lufs - cue.lufs) > 1) warnings.push(`loudness ${mo.lufs} LUFS is more than 1 LU from the ${cue.lufs} target`)
  if (cue.kind === 'music' && mo.truePeakDb > -1) warnings.push(`true peak ${mo.truePeakDb} dBTP is above -1 after encoding`)
  if (cue.kind === 'sfx' && mo.peakDb > cue.peakDb + 1) warnings.push(`peak ${mo.peakDb} dBFS is above the ${cue.peakDb} target`)
  if (cue.id === 'impact' && mo.crestDb < 6) warnings.push(`crest factor ${mo.crestDb} dB is low for a hit (AI effects come back squashed); try another seed or layer it`)
  return entry
}

// ---- manifest, candidates, report -----------------------------------------------------------------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (file, obj) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`)
}

/** The manifest.json entry (src/client/audio/manifest.ts TrackEntry) for one mastered candidate. */
export function manifestEntry(cue, letter, { asId = cue.id } = {}) {
  const base = `${cue.id}-${letter}`
  const e = {
    id: asId,
    file: `${base}.ogg`,
    alt: `${base}.m4a`,
    bpm: cue.bpm,
    beatsPerBar: cue.beatsPerBar,
    loopStart: 0,
    loopEnd: cue.kind === 'music' && cue.loop ? round3(loopSeconds(cue)) : 0,
    gainDb: 0,
    role: cue.role,
  }
  if (cue.mood) e.mood = cue.mood
  if (cue.cue) e.cue = cue.cue
  return e
}

/**
 * Merge the mastered cues into a manifest: entries that are not ours are kept, ours are rebuilt in cue-table order from `state`
 * (the candidates.json cues map). In audition mode the candidates that are not picked also appear, as `<id>-a` / `<id>-b`.
 */
export function buildManifest(existing, cues, state, { audition = false } = {}) {
  const ours = new Set(cues.flatMap((c) => [c.id, ...CANDIDATE_LETTERS.map((l) => `${c.id}-${l}`)]))
  const tracks = (Array.isArray(existing?.tracks) ? existing.tracks : []).filter((t) => !ours.has(t?.id))
  for (const cue of cues) {
    const s = state[cue.id]
    if (!s) continue
    const letters = Object.keys(s.candidates)
    if (letters.length === 0) continue
    const picked = letters.includes(s.picked) ? s.picked : letters[0]
    tracks.push(manifestEntry(cue, picked))
    if (audition) for (const l of letters) if (l !== picked) tracks.push(manifestEntry(cue, l, { asId: `${cue.id}-${l}` }))
  }
  return { version: 1, tracks }
}

// ---- main -----------------------------------------------------------------------------------------------------------------------------

async function pool(items, size, fn) {
  const queue = items.slice()
  const results = []
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) results.push(await fn(item))
  })
  await Promise.all(workers)
  return results
}

/** Returns the exit code: 0 ok, 1 something could not be mastered, 2 bad command line or no ffmpeg. */
export async function main(argv, io = { log: console.log, err: console.error }) {
  const table = loadCueTable()
  let opts
  try {
    opts = parseMasterArgs(argv, table.cues)
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`error: ${e.message}\n`)
      io.err(MASTER_HELP)
      return e.exitCode
    }
    throw e
  }
  if (opts.help) {
    io.log(MASTER_HELP)
    return 0
  }
  const rawDir = path.join(opts.out, 'raw')
  const selected = table.cues.filter((c) => !opts.only || opts.only.includes(c.id))
  const items = []
  const missing = []
  for (const cue of selected) {
    let any = false
    CANDIDATE_LETTERS.forEach((letter, i) => {
      const rawFile = path.join(rawDir, rawFileName(cue.id, i))
      if (existsSync(rawFile)) {
        items.push({ cue, letter, rawFile })
        any = true
      }
    })
    if (!any) missing.push(cue.id)
  }
  io.log(`Mastering ${items.length} raw file(s) for ${selected.length - missing.length} cue(s) from ${rawDir}`)
  if (missing.length) io.log(`  no raw file yet for: ${missing.join(', ')} (run gen-music.mjs first)`)
  if (opts.dryRun) {
    for (const it of items) io.log(`  ${it.cue.id}-${it.letter}: ${path.basename(it.rawFile)} -> ${it.cue.id}-${it.letter}.ogg / .m4a${it.cue.loop ? `, ${round3(loopSeconds(it.cue))} s loop` : ''}`)
    io.log('Dry run: nothing was written.')
    return 0
  }
  if (items.length === 0 && Object.keys(opts.picks).length === 0 && !opts.prune) {
    io.err('error: nothing to master. Run `node tools/audio/gen-music.mjs` first.')
    return 1
  }

  let ffver = null
  if (items.length) {
    try {
      ffver = (await checkFfmpeg(opts.ffmpeg)).version
    } catch (e) {
      if (e instanceof UsageError) {
        io.err(`error: ${e.message}`)
        return e.exitCode
      }
      throw e
    }
    io.log(`ffmpeg: ${ffver}`)
  }

  const reportFile = path.join(opts.out, 'report.json')
  const report = readJson(reportFile, { entries: {} })
  report.entries ??= {}
  let failed = 0
  await pool(items, opts.jobs, async (it) => {
    const key = `${it.cue.id}-${it.letter}`
    const workDir = path.join(opts.out, 'work', key)
    try {
      const entry = await masterOne({ ffmpeg: opts.ffmpeg, cue: it.cue, letter: it.letter, rawFile: it.rawFile, workDir, publicDir: opts.publicDir, opts })
      report.entries[key] = entry
      io.log(
        `  ${key.padEnd(18)} ${String(entry.seconds).padStart(7)} s  ${String(entry.lufs).padStart(6)} LUFS  ${String(entry.truePeakDb).padStart(5)} dBTP  crest ${String(entry.crestDb).padStart(4)} dB${entry.warnings.length ? `  (${entry.warnings.length} warning(s))` : ''}`,
      )
    } catch (e) {
      failed++
      io.err(`  FAILED ${key}: ${e instanceof Error ? e.message : e}`)
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })
  rmSync(path.join(opts.out, 'work'), { recursive: true, force: true })

  // candidates.json: what each cue offers and which one the manifest points at
  const candFile = path.join(opts.publicDir, 'candidates.json')
  const cands = readJson(candFile, { version: 1, cues: {} })
  cands.cues ??= {}
  for (const cue of selected) {
    const state = (cands.cues[cue.id] ??= { picked: 'a', candidates: {} })
    for (const letter of CANDIDATE_LETTERS) {
      const entry = report.entries[`${cue.id}-${letter}`]
      const here = existsSync(path.join(opts.publicDir, `${cue.id}-${letter}.ogg`))
      if (entry && here) {
        state.candidates[letter] = { file: entry.ogg.file, alt: entry.m4a.file, seed: entry.seed, seconds: entry.seconds, lufs: entry.lufs, truePeakDb: entry.truePeakDb, crestDb: entry.crestDb }
      } else if (!here) delete state.candidates[letter]
    }
    if (opts.picks[cue.id]) {
      if (!state.candidates[opts.picks[cue.id]]) io.err(`  warning: --pick ${cue.id}=${opts.picks[cue.id]} but there is no candidate ${opts.picks[cue.id]}; keeping ${state.picked}`)
      else state.picked = opts.picks[cue.id]
    }
    const letters = Object.keys(state.candidates)
    if (letters.length && !letters.includes(state.picked)) state.picked = letters[0]
    if (opts.prune) {
      for (const l of letters) {
        if (l === state.picked) continue
        for (const ext of ['ogg', 'm4a']) rmSync(path.join(opts.publicDir, `${cue.id}-${l}.${ext}`), { force: true })
        delete state.candidates[l]
        io.log(`  pruned ${cue.id}-${l}`)
      }
    }
    if (Object.keys(state.candidates).length === 0) delete cands.cues[cue.id]
  }
  cands.note =
    'Audition data for tools/audio/master-audio.mjs. The manifest points at "picked". Re-run master-audio.mjs with --pick <id>=b to switch and --prune to delete the other candidates before committing. Not read by the game.'
  writeJson(candFile, cands)

  const manifestFile = path.join(opts.publicDir, 'manifest.json')
  const manifest = buildManifest(readJson(manifestFile, { version: 1, tracks: [] }), table.cues, cands.cues, { audition: opts.audition })
  writeJson(manifestFile, manifest)

  report.version = 1
  report.updatedAt = new Date().toISOString()
  report.ffmpeg = ffver ?? report.ffmpeg
  report.note = 'Measured on the decoded OGG. Crest factor = sample peak minus RMS. Nothing here is verified by ear (owner judges on sounds.html).'
  writeJson(reportFile, report)

  io.log(`\nManifest: ${manifestFile} (${manifest.tracks.length} track(s))${opts.audition ? ' [audition mode: unpicked candidates listed too; do not commit]' : ''}`)
  io.log(`Report:   ${reportFile}`)
  for (const [k, e] of Object.entries(report.entries)) for (const w of e.warnings ?? []) io.log(`  warning ${k}: ${w}`)
  io.log('\nAll results are NOT VERIFIED BY EAR. Next: open sounds.html (npm run dev), listen, then pick with --pick and commit public/audio.')
  return failed ? 1 : 0
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (e) => {
      console.error(e instanceof Error ? e.stack : e)
      process.exitCode = 1
    },
  )
}
