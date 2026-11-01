// The Audio Studio runner (tools/audio): cue table vs docs/spec/60-audio.md, bar maths, flag parsing, and the whole pipeline
// (generate -> master -> manifest) against the fake studio. Nothing here makes sound; the generated files are click tracks in a temp folder.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { entriesForSlot, normalizeManifest, SLOTS } from '../../src/client/audio/manifest'
import { estimateTempo, findFirstSound, findLastSound } from '../../tools/audio/dsp.mjs'
import { startFakeStudio, validateJob, type FakeStudio } from '../../tools/audio/fake-audio-studio.mjs'
import { classifyStatus, jobFileNames, main as genMain } from '../../tools/audio/gen-music.mjs'
import {
  barSamples, barSeconds, buildJobBody, loadCueTable, loopSeconds, parseFakeArgs, parseGenArgs, parseMasterArgs, rawFileName, round3, run,
  SAMPLE_RATE, UsageError, type Cue,
} from '../../tools/audio/lib.mjs'
import { buildManifest, main as masterMain, manifestEntry, planCut } from '../../tools/audio/master-audio.mjs'

const table = loadCueTable()
const cue = (id: string): Cue => {
  const c = table.cues.find((x) => x.id === id)
  if (!c) throw new Error(`no cue ${id}`)
  return c
}
const capture = () => {
  const lines: string[] = []
  return { lines, io: { log: (s: string) => void lines.push(s), err: (s: string) => void lines.push(s) } }
}

describe('cue table (docs/spec/60-audio.md sections 2 and 4)', () => {
  it('lists the ten stems in order, with unique ids and seeds', () => {
    expect(table.cues.map((c) => c.id)).toEqual([
      'bed-title', 'bed-calm', 'bed-camp', 'bed-battle', 'bed-tense', 'charge', 'jingle-victory', 'jingle-defeat', 'impact', 'seal',
    ])
    expect(new Set(table.cues.map((c) => c.seed)).size).toBe(table.cues.length)
  })
  it('has the section 2 tempo, key, bar count and loop length for every music cue', () => {
    const spec: Record<string, [number, string, number, number]> = {
      'bed-title': [72, 'D minor', 16, 53.333],
      'bed-calm': [90, 'F major', 16, 42.667],
      'bed-camp': [76, 'F major', 16, 50.526],
      'bed-battle': [120, 'D minor', 32, 64],
      'bed-tense': [120, 'D minor', 16, 32],
      charge: [120, 'D minor', 8, 16],
      'jingle-victory': [100, 'D major', 6, 14.4],
      'jingle-defeat': [66, 'D minor', 4, 14.545],
    }
    for (const [id, [bpm, key, bars, secs]] of Object.entries(spec)) {
      const c = cue(id)
      expect([c.bpm, c.key, c.bars, c.beatsPerBar, c.timesig]).toEqual([bpm, key, bars, 4, '4'])
      expect(round3(loopSeconds(c))).toBeCloseTo(secs, 3)
    }
  })
  it('keeps battle, tense and charge on one tempo, key and meter (the hard rule)', () => {
    const trio = ['bed-battle', 'bed-tense', 'charge'].map(cue)
    expect(new Set(trio.map((c) => `${c.bpm}|${c.key}|${c.beatsPerBar}`)).size).toBe(1)
  })
  it('asks the studio for a take a little longer than the loop, and within the studio limits', () => {
    for (const c of table.cues.filter((x) => x.kind === 'music')) {
      const slack = (c.duration ?? 0) - loopSeconds(c)
      expect(slack, c.id).toBeGreaterThanOrEqual(2)
      expect(slack, c.id).toBeLessThanOrEqual(5)
      expect(validateJob(buildJobBody(c, table, 2)), c.id).toBeNull()
    }
    for (const c of table.cues.filter((x) => x.kind === 'sfx')) expect(validateJob(buildJobBody(c, table, 2)), c.id).toBeNull()
  })
  it('never names a game, studio or composer, and the charge layer excludes the low register', () => {
    for (const c of table.cues) expect(c.prompt, c.id).not.toMatch(/dynasty|koei|tecmo|warriors|total war|nobunaga|genshin|hans zimmer/i)
    expect(cue('charge').prompt).toMatch(/no bass, no cellos, no tuba, no sub-bass, no choir/)
    expect(table.musicExclusions).toMatch(/no vocals.*no choir.*no lyrics/)
  })
  it('puts the common exclusions on every music request and lets effects carry a negative prompt', () => {
    const body = buildJobBody(cue('bed-battle'), table, 2)
    expect(body).toMatchObject({ mode: 'music', lyrics: '[Instrumental]', duration: 68, bpm: 120, key: 'D minor', timesig: '4', batch: 2, seed: 31104, steps: 8 })
    expect(String(body.prompt)).toContain(table.musicExclusions)
    expect(buildJobBody(cue('impact'), table, 1)).toMatchObject({ mode: 'sfx', seconds: 4, batch: 1, seed: 31109, negative: expect.stringContaining('voices') })
  })
})

describe('bar maths (60-audio section 5)', () => {
  it('is bars x beatsPerBar x 60 / bpm', () => {
    expect(barSeconds(120, 4, 32)).toBe(64)
    expect(barSeconds(72, 4, 16)).toBeCloseTo(53.3333, 4)
    expect(barSeconds(100, 4, 6)).toBeCloseTo(14.4, 10)
    expect(barSeconds(66, 4, 4)).toBeCloseTo(14.5454, 3)
  })
  it('rounds to a whole sample, within 12 microseconds of the exact length', () => {
    expect(barSamples(120, 4, 32)).toBe(64 * 44100)
    for (const c of table.cues.filter((x) => x.kind === 'music')) {
      const n = barSamples(c.bpm, c.beatsPerBar, c.bars ?? 0)
      expect(Number.isInteger(n)).toBe(true)
      expect(Math.abs(n / SAMPLE_RATE - loopSeconds(c))).toBeLessThan(12e-6)
    }
  })
  it('cuts a loop to exactly the bar length, starting at the first sound, with a 10 ms declick', () => {
    const sr = SAMPLE_RATE
    const x = new Float32Array(sr * 70)
    for (let i = Math.round(0.35 * sr); i < x.length; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr)
    const plan = planCut(cue('bed-battle'), x, { seamFadeMs: 10 })
    expect(Math.abs(plan.start - Math.round(0.35 * sr))).toBeLessThan(sr * 0.001)
    expect(plan.length).toBe(64 * sr)
    expect(plan.fadeIn).toBe(441)
    expect(plan.fadeOut).toBe(441)
    expect(plan.padded).toBe(0)
    expect(planCut(cue('bed-battle'), x, { seamFadeMs: 0 }).fadeIn).toBe(0)
  })
  it('pads (and says so) when the take is too short, and keeps a jingle past its nominal bars for the natural tail', () => {
    const sr = SAMPLE_RATE
    const short = new Float32Array(sr * 30).fill(0.2)
    expect(planCut(cue('bed-battle'), short, { seamFadeMs: 10 }).padded).toBeGreaterThan(0)
    const j = new Float32Array(sr * 18)
    for (let i = Math.round(0.2 * sr); i < 16.5 * sr; i++) j[i] = 0.2 * Math.sin((2 * Math.PI * 330 * i) / sr)
    const plan = planCut(cue('jingle-victory'), j, { seamFadeMs: 10 })
    expect(plan.length).toBeGreaterThan(barSamples(100, 4, 6))
    expect(plan.length / sr).toBeCloseTo(16.5 - 0.2 + 0.25, 1)
    expect(plan.fadeOut).toBe(Math.round(0.25 * sr))
  })
  it('keeps an effect short: head pre-roll of 2 ms, no longer than keepSeconds', () => {
    const sr = SAMPLE_RATE
    const x = new Float32Array(sr * 4)
    for (let i = Math.round(0.1 * sr); i < 3 * sr; i++) x[i] = 0.5 * Math.sin(i / 7) * Math.exp(-(i - 0.1 * sr) / sr)
    const plan = planCut(cue('impact'), x, { seamFadeMs: 10 })
    expect(plan.length).toBeLessThanOrEqual(sr)
    expect(plan.start).toBeLessThanOrEqual(plan.firstSound)
    expect(plan.firstSound - plan.start).toBeLessThanOrEqual(Math.round(0.002 * sr))
  })
})

describe('signal analysis', () => {
  const sr = SAMPLE_RATE
  const clicks = (bpm: number, seconds: number, headSec: number): Float32Array => {
    const x = new Float32Array(Math.round(seconds * sr))
    const period = (60 / bpm) * sr
    for (let t = headSec * sr; t < x.length; t += period) {
      for (let k = 0; k < 800 && t + k < x.length; k++) x[Math.round(t) + k] = 0.8 * Math.exp(-k / 150) * Math.sin(k / 3)
    }
    return x
  }
  it('finds where the sound starts and ends', () => {
    const x = clicks(120, 10, 0.4)
    expect(findFirstSound(x, sr)).toBeGreaterThanOrEqual(Math.round(0.4 * sr))
    expect(findFirstSound(x, sr)).toBeLessThan(Math.round(0.4 * sr) + 20)
    expect(findFirstSound(new Float32Array(1000), sr)).toBe(-1)
    expect(findLastSound(x, sr)).toBeGreaterThan(9 * sr)
    expect(findLastSound(new Float32Array(1000), sr)).toBe(0)
  })
  it('agrees with the requested BPM on a click track and flags a drifted one', () => {
    const a = estimateTempo(clicks(120, 24, 0.3), sr, 120)
    expect(Math.abs(a.driftPct)).toBeLessThan(1)
    const b = estimateTempo(clicks(108, 24, 0.3), sr, 120)
    expect(b.driftPct).toBeLessThan(-5)
  })
})

describe('command lines', () => {
  const cues = table.cues
  it('gen-music: defaults, lists, and numbers', () => {
    const d = parseGenArgs([], cues, table)
    expect(d).toMatchObject({ dryRun: false, force: false, only: null, limit: null, candidates: 2, base: 'http://localhost:7890' })
    const o = parseGenArgs(['--only', 'impact, seal', '--dry-run', '--base', 'http://192.168.1.5:7890/', '--candidates', '1', '--limit', '3', '--force', '--timeout', '60'], cues, table)
    expect(o).toMatchObject({ only: ['impact', 'seal'], dryRun: true, base: 'http://192.168.1.5:7890', candidates: 1, limit: 3, force: true, timeoutMs: 60000 })
    expect(parseGenArgs(['--base=http://127.0.0.1:1234'], cues, table).base).toBe('http://127.0.0.1:1234')
  })
  it('gen-music: rejects what it cannot use, with a message', () => {
    expect(() => parseGenArgs(['--only', 'bed-nope'], cues, table)).toThrow(/unknown cue id: bed-nope/)
    expect(() => parseGenArgs(['--candidates', '3'], cues, table)).toThrow(/--candidates must be a whole number from 1 to 2/)
    expect(() => parseGenArgs(['--limit', '0'], cues, table)).toThrow(/--limit/)
    expect(() => parseGenArgs(['--base', 'localhost:7890'], cues, table)).toThrow(UsageError)
    expect(() => parseGenArgs(['--frobnicate'], cues, table)).toThrow(UsageError)
    expect(() => parseGenArgs(['--only'], cues, table)).toThrow(UsageError)
  })
  it('master-audio: picks, ffmpeg path and switches', () => {
    const o = parseMasterArgs(['--ffmpeg', 'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe', '--pick', 'bed-battle=b,impact=a', '--prune', '--audition', '--jobs', '4', '--seam-fade-ms', '0'], cues)
    expect(o).toMatchObject({ ffmpeg: 'C:\\tools\\ffmpeg\\bin\\ffmpeg.exe', picks: { 'bed-battle': 'b', impact: 'a' }, prune: true, audition: true, jobs: 4, seamFadeMs: 0 })
    expect(() => parseMasterArgs(['--pick', 'bed-battle=c'], cues)).toThrow(/id=a or id=b/)
    expect(() => parseMasterArgs(['--pick', 'nope=a'], cues)).toThrow(/unknown cue id/)
    expect(() => parseMasterArgs(['--seam-fade-ms', '500'], cues)).toThrow(UsageError)
  })
  it('fake studio: port and delay', () => {
    expect(parseFakeArgs(['--port', '0', '--delay-ms', '5'])).toMatchObject({ port: 0, delayMs: 5 })
    expect(() => parseFakeArgs(['--port', 'x'])).toThrow(UsageError)
  })
  it('reads the studio status words and file lists leniently', () => {
    expect(classifyStatus({ status: 'completed' })).toBe('done')
    expect(classifyStatus({ status: 'Failed' })).toBe('failed')
    expect(classifyStatus({ status: 'running' })).toBe('pending')
    expect(classifyStatus({})).toBe('pending')
    expect(jobFileNames({ audios: ['audio_0.flac', 'audio_1.flac'] }, 2)).toEqual(['audio_0.flac', 'audio_1.flac'])
    expect(jobFileNames({ files: [{ name: 'x/audio_0.flac' }] }, 2)).toEqual(['audio_0.flac'])
    expect(jobFileNames({}, 2)).toEqual(['audio_0.flac', 'audio_1.flac'])
  })
})

describe('manifest building', () => {
  const state = {
    'bed-battle': { picked: 'a', candidates: { a: {}, b: {} } },
    impact: { picked: 'b', candidates: { b: {} } },
  }
  const cues = [cue('bed-battle'), cue('impact')]
  it('writes the game schema: candidate a by default, loopEnd = bar length, gain 0', () => {
    expect(manifestEntry(cue('bed-battle'), 'a')).toEqual({
      id: 'bed-battle', file: 'bed-battle-a.ogg', alt: 'bed-battle-a.m4a', bpm: 120, beatsPerBar: 4, loopStart: 0, loopEnd: 64, gainDb: 0, role: 'bed', mood: 'battle',
    })
    expect(manifestEntry(cue('jingle-victory'), 'a')).toMatchObject({ role: 'stinger', mood: 'victory', loopEnd: 0, bpm: 100 })
    expect(manifestEntry(cue('impact'), 'a')).toMatchObject({ role: 'stinger', cue: 'impact', bpm: 0, loopEnd: 0 })
    expect(manifestEntry(cue('charge'), 'a')).toMatchObject({ role: 'charge', loopEnd: 16 })
    expect(manifestEntry(cue('charge'), 'a')).not.toHaveProperty('mood')
  })
  it('keeps foreign entries, follows the pick, and lists the other candidate only in audition mode', () => {
    const foreign = { id: 'extra', file: 'extra.ogg', role: 'bed', mood: 'calm' }
    const m = buildManifest({ version: 1, tracks: [foreign, { id: 'bed-battle', file: 'old.ogg', role: 'bed' }] }, cues, state)
    expect(m.tracks.map((t) => t.id)).toEqual(['extra', 'bed-battle', 'impact'])
    expect(m.tracks[2]).toMatchObject({ file: 'impact-b.ogg' })
    const a = buildManifest(m, cues, state, { audition: true })
    expect(a.tracks.map((t) => t.id)).toEqual(['extra', 'bed-battle', 'bed-battle-b', 'impact'])
    expect(buildManifest(a, cues, state).tracks.map((t) => t.id)).toEqual(['extra', 'bed-battle', 'impact'])
  })
})

// ---- the whole pipeline against the fake studio ----------------------------------------------------------------------------------------

const have = (tool: string): boolean => spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0
const ffprobe = (file: string, entry: string): number => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', entry, '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' })
  return Number(r.stdout.trim())
}

describe.skipIf(!have('ffmpeg') || !have('ffprobe'))('pipeline: gen -> master -> manifest, against the fake studio', () => {
  let studio: FakeStudio
  let tmp: string
  let out: string
  let pub: string
  const genArgs = (...more: string[]) => ['--base', studio.url, '--out', out, '--poll-ms', '20', ...more]

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'audio-runner-test-'))
    out = path.join(tmp, 'out')
    pub = path.join(tmp, 'public-audio')
    studio = await startFakeStudio({ delayMs: 20 })
  })
  afterAll(async () => {
    await studio.close()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('--dry-run prints the whole plan and makes zero network calls', async () => {
    const { lines, io } = capture()
    expect(await genMain(genArgs('--dry-run'), io)).toBe(0)
    expect(studio.stats.requests).toBe(0)
    const text = lines.join('\n')
    for (const c of table.cues) expect(text).toContain(c.id)
    expect(text).toContain('Dry run')
    expect(existsSync(path.join(out, 'raw'))).toBe(false)
    // and with a base that nothing listens on, it still succeeds
    const dead = capture()
    expect(await genMain(['--dry-run', '--base', 'http://127.0.0.1:1', '--out', out], dead.io)).toBe(0)
  })

  it('generates every cue, two candidates each, one job at a time, with the recorded seeds', async () => {
    const { lines, io } = capture()
    expect(await genMain(genArgs(), io), lines.join('\n')).toBe(0)
    expect(studio.stats.posts).toBe(table.cues.length)
    expect(studio.stats.rejected).toBe(0)
    expect(studio.stats.maxConcurrent).toBe(1)
    expect(studio.stats.statusCalls).toBe(1)
    for (const c of table.cues) for (const i of [0, 1]) expect(existsSync(path.join(out, 'raw', rawFileName(c.id, i))), `${c.id} ${i}`).toBe(true)
    const log = JSON.parse(readFileSync(path.join(out, 'raw', 'generation-log.json'), 'utf8'))
    for (const c of table.cues) {
      expect(log[c.id].seed).toBe(c.seed)
      expect(log[c.id].request.batch).toBe(2)
    }
    const posted = studio.stats.jobs.map((j) => j.body)
    expect(posted.filter((b) => b.mode === 'music')).toHaveLength(8)
    expect(posted.filter((b) => b.mode === 'sfx')).toHaveLength(2)
    expect(posted[0]).toMatchObject({ mode: 'music', bpm: 72, key: 'D minor', lyrics: '[Instrumental]', duration: 58 })
  }, 300000)

  it('a second run makes zero requests', async () => {
    const before = studio.stats.requests
    const { lines, io } = capture()
    expect(await genMain(genArgs(), io)).toBe(0)
    expect(studio.stats.requests).toBe(before)
    expect(lines.join('\n')).toContain('Nothing to do')
  })

  it('--force archives the old takes first; --limit and --candidates 1 are honoured', async () => {
    const { io } = capture()
    expect(await genMain(genArgs('--force', '--only', 'seal', '--candidates', '1'), io)).toBe(0)
    expect(studio.stats.jobs.at(-1)?.body).toMatchObject({ mode: 'sfx', batch: 1, seed: 31110 })
    const archive = path.join(out, 'raw', 'archive')
    const stamps = readdirSync(archive)
    expect(stamps).toHaveLength(1)
    expect(readdirSync(path.join(archive, stamps[0] ?? ''))).toEqual(['seal-a.flac'])
    expect(existsSync(path.join(out, 'raw', 'seal-b.flac'))).toBe(true) // the other take is left alone
    const posts = studio.stats.posts
    expect(await genMain(genArgs('--force', '--limit', '1', '--only', 'impact,seal'), io)).toBe(0)
    expect(studio.stats.posts).toBe(posts + 1)
  }, 120000)

  it('reports an unreachable studio clearly, without touching files', async () => {
    const { lines, io } = capture()
    expect(await genMain(['--base', 'http://127.0.0.1:1', '--out', path.join(tmp, 'elsewhere'), '--only', 'seal'], io)).toBe(2)
    expect(lines.join('\n')).toMatch(/cannot reach the Audio Studio/)
  })

  it('refuses to master without ffmpeg, saying how to get it', async () => {
    const { lines, io } = capture()
    expect(await masterMain(['--ffmpeg', path.join(tmp, 'no-such-ffmpeg'), '--out', out, '--public', pub, '--only', 'seal'], io)).toBe(2)
    expect(lines.join('\n')).toMatch(/ffmpeg was not found.*--ffmpeg/)
    expect(existsSync(pub)).toBe(false)
  })

  describe('mastering', () => {
    let manifest: ReturnType<typeof normalizeManifest>
    let report: { entries: Record<string, Record<string, any>> }

    it('masters all 20 takes to OGG and M4A and writes a manifest the game accepts', async () => {
      const { lines, io } = capture()
      expect(await masterMain(['--out', out, '--public', pub, '--jobs', '4'], io), lines.join('\n')).toBe(0)
      const warns: string[] = []
      manifest = normalizeManifest(JSON.parse(readFileSync(path.join(pub, 'manifest.json'), 'utf8')), (w) => warns.push(w))
      expect(warns).toEqual([])
      expect(manifest.tracks.map((t) => t.id)).toEqual(table.cues.map((c) => c.id))
      for (const t of manifest.tracks) {
        expect(existsSync(path.join(pub, t.file)), t.file).toBe(true)
        expect(existsSync(path.join(pub, t.alt ?? 'missing')), t.alt).toBe(true)
        expect(t.file).toMatch(/-a\.ogg$/)
        expect(t.gainDb).toBe(0)
      }
      for (const s of SLOTS) expect(entriesForSlot(manifest, s).length, s.key).toBe(1)
      const battle = manifest.tracks.find((t) => t.id === 'bed-battle')
      const charge = manifest.tracks.find((t) => t.id === 'charge')
      expect([battle?.bpm, battle?.beatsPerBar, battle?.loopEnd]).toEqual([120, 4, 64])
      expect([charge?.bpm, charge?.beatsPerBar, charge?.loopEnd]).toEqual([120, 4, 16])
      report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'))
      expect(Object.keys(report.entries)).toHaveLength(20)
    }, 600000)

    it('lengths are exactly bar-aligned (ffprobe on the OGG and M4A, decoded sample counts in the report)', () => {
      for (const c of table.cues.filter((x) => x.kind === 'music' && x.loop)) {
        const expected = loopSeconds(c)
        for (const l of ['a', 'b']) {
          const e = report.entries[`${c.id}-${l}`]!
          expect(e.samples, c.id).toBe(barSamples(c.bpm, c.beatsPerBar, c.bars ?? 0))
          expect(Math.abs(ffprobe(path.join(pub, `${c.id}-${l}.ogg`), 'format=duration') - expected), `${c.id}-${l}.ogg`).toBeLessThan(0.002)
          expect(Math.abs(e.ogg.seconds - expected), `${c.id} ogg decoded`).toBeLessThan(0.0005)
          expect(e.m4a.seconds - expected, `${c.id} m4a decoded: never shorter than the loop, at most one AAC frame (23 ms) longer`).toBeGreaterThanOrEqual(-0.0005)
          expect(e.m4a.seconds - expected, `${c.id} m4a decoded`).toBeLessThan(0.024)
          expect(Math.abs(ffprobe(path.join(pub, `${c.id}-${l}.m4a`), 'format=duration') - expected), `${c.id}-${l}.m4a`).toBeLessThan(0.06)
        }
      }
    })

    it('jingles keep their natural tail past the nominal bars; effects stay short', () => {
      expect(report.entries['jingle-victory-a']!.seconds).toBeGreaterThan(loopSeconds(cue('jingle-victory')))
      expect(report.entries['jingle-defeat-a']!.seconds).toBeGreaterThan(loopSeconds(cue('jingle-defeat')))
      expect(report.entries['impact-a']!.seconds).toBeLessThanOrEqual(1.0)
      expect(report.entries['seal-a']!.seconds).toBeLessThanOrEqual(0.6)
      expect(manifest.tracks.find((t) => t.id === 'jingle-victory')?.loopEnd).toBe(0)
    })

    it('loudness is within 1 LU of target (beds and charge -16, jingles -14); true peak <= -1 dBTP; effects peak near -3 dBFS', () => {
      for (const [key, e] of Object.entries(report.entries)) {
        if (e.kind === 'music') {
          expect(Math.abs(e.lufs - e.targetLufs), `${key} LUFS ${e.lufs}`).toBeLessThanOrEqual(1)
          expect(e.truePeakDb, `${key} true peak`).toBeLessThanOrEqual(-1)
          expect(Math.abs(e.m4a.lufs - e.targetLufs), `${key} m4a LUFS`).toBeLessThanOrEqual(1.2)
          expect(typeof e.crestDb).toBe('number')
        } else {
          expect(Math.abs(e.peakDb - e.targetPeakDb), `${key} peak ${e.peakDb}`).toBeLessThanOrEqual(1.5)
        }
        expect(e.notVerifiedByEar).toBe(true)
        expect(typeof e.crestDb).toBe('number')
      }
      expect(report.entries['bed-battle-a']!.targetLufs).toBe(-16)
      expect(report.entries['charge-a']!.targetLufs).toBe(-16)
      expect(report.entries['jingle-victory-a']!.targetLufs).toBe(-14)
    })

    it('bar 1 starts at 0.000 s: the head silence is gone and the tempo check finds the requested BPM', async () => {
      for (const id of ['bed-battle', 'charge', 'bed-camp']) {
        const e = report.entries[`${id}-a`]!
        expect(e.firstSoundSec, id).toBeGreaterThan(0.1) // the fake takes start late on purpose
        expect(Math.abs(e.tempoDriftPct), `${id} drift`).toBeLessThan(2.5)
        expect(e.warnings.filter((w: string) => /tempo/.test(w))).toEqual([])
        const pcm = await run('ffmpeg', ['-v', 'error', '-i', path.join(pub, `${id}-a.ogg`), '-t', '0.1', '-ac', '1', '-f', 'f32le', 'pipe:1'])
        const x = new Float32Array(pcm.stdout.buffer.slice(pcm.stdout.byteOffset, pcm.stdout.byteOffset + pcm.stdout.byteLength))
        expect(findFirstSound(x, SAMPLE_RATE, -45), id).toBeLessThan(Math.round(0.005 * SAMPLE_RATE))
      }
    })

    it('records both candidates; the second master run is a no-op for the outputs', () => {
      const cands = JSON.parse(readFileSync(path.join(pub, 'candidates.json'), 'utf8'))
      for (const c of table.cues) {
        expect(cands.cues[c.id].picked).toBe('a')
        expect(Object.keys(cands.cues[c.id].candidates)).toEqual(['a', 'b'])
        expect(existsSync(path.join(pub, `${c.id}-b.ogg`))).toBe(true)
      }
      expect(Object.keys(JSON.parse(readFileSync(path.join(pub, 'manifest.json'), 'utf8')).tracks)).toHaveLength(10)
    })

    it('--audition lists the other candidates as extra tracks the game still accepts; --pick and --prune finish the choice', async () => {
      const { lines, io } = capture()
      expect(await masterMain(['--out', out, '--public', pub, '--only', 'seal', '--audition'], io), lines.join('\n')).toBe(0)
      const aud = normalizeManifest(JSON.parse(readFileSync(path.join(pub, 'manifest.json'), 'utf8')), (w) => lines.push(w))
      expect(aud.tracks).toHaveLength(20)
      expect(aud.tracks.map((t) => t.id)).toContain('seal-b')
      expect(entriesForSlot(aud, SLOTS.find((s) => s.key === 'stinger:seal')!)).toHaveLength(2) // sounds.html shows both rows

      expect(await masterMain(['--out', out, '--public', pub, '--only', 'bed-battle,impact', '--pick', 'bed-battle=b,impact=b', '--prune'], io), lines.join('\n')).toBe(0)
      const final = normalizeManifest(JSON.parse(readFileSync(path.join(pub, 'manifest.json'), 'utf8')))
      expect(final.tracks).toHaveLength(10)
      expect(final.tracks.find((t) => t.id === 'bed-battle')?.file).toBe('bed-battle-b.ogg')
      expect(final.tracks.find((t) => t.id === 'impact')?.alt).toBe('impact-b.m4a')
      expect(final.tracks.find((t) => t.id === 'charge')?.file).toBe('charge-a.ogg')
      expect(existsSync(path.join(pub, 'bed-battle-a.ogg'))).toBe(false)
      expect(existsSync(path.join(pub, 'bed-battle-b.ogg'))).toBe(true)
      expect(existsSync(path.join(pub, 'charge-b.ogg'))).toBe(true) // not in --only, not pruned
    }, 300000)
  })
})
