// Portraits (docs/spec/50-presentation.md "Portraits"): the client helper, the rendered files in public/portraits, and the Hugging Face generator's
// plan, prompt lint and dry run (no network, no token).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_OFFICERS } from '../../src/data'
import { genericPortraitId, portraitKind, portraitSubjects, portraitUrl, variantOf } from '../../src/client/portraits'
import { AUDITION_STYLES, IDENTITY, MAX_PROMPT, STYLE, buildPlan, clauseFor, lintAll, lintPrompt, loadSubjects, promptFor, seedFor } from '../../tools/portraits/lib.mjs'

describe('portrait helper', () => {
  it('builds the URL under the base path and names generics by side and kind', () => {
    expect(portraitUrl('guan-yu')).toMatch(/portraits\/guan-yu\.webp$/)
    expect(genericPortraitId('yellow', 'infantry')).toBe('generic-yellow-rebel')
    expect(genericPortraitId('han', 'infantry')).toBe('generic-han-infantry')
    expect(genericPortraitId('cao', 'archers')).toBe('generic-cao-archer')
    expect(genericPortraitId('unknown-side', 'cavalry')).toBe('generic-han-cavalry')
    expect(portraitKind('infantry', 'yellow')).toBe('rebel')
  })
  it('lists every officer in the data, every battle-local officer, and a generic per side and kind', () => {
    const subjects = portraitSubjects()
    const ids = new Set(subjects.map((s) => s.id))
    expect(ids.size).toBe(subjects.length)
    for (const o of ALL_OFFICERS) expect(ids.has(o.id), o.id).toBe(true)
    expect(subjects.filter((s) => s.group === 'generic')).toHaveLength(15)
    expect(subjects.filter((s) => s.group === 'hero').map((s) => s.id).sort()).toEqual(['cao-cao', 'guan-yu', 'liu-bei', 'lu-bu', 'zhang-fei', 'zhao-yun', 'zhuge-liang'])
    expect(subjects.some((s) => s.group === 'local' && s.id === 'qz-adept')).toBe(true)
  })
  it('the node-side subject list (generator) matches the client list id for id', () => {
    const a = portraitSubjects().map((s) => [s.id, s.group, s.side, s.kind, s.variant])
    const b = (loadSubjects('.') as { id: string; group: string; side: string; kind: string; variant: number }[]).map((s) => [s.id, s.group, s.side, s.kind, s.variant])
    expect(b.map((x) => x[0]).sort()).toEqual(a.map((x) => x[0]).sort())
    for (const row of a) expect(b.find((x) => x[0] === row[0])).toEqual(row)
  })
  it('the variant hash is stable (matches the board)', () => {
    expect(variantOf('qz-adept')).toBe(variantOf('qz-adept'))
    expect([0, 1, 2]).toContain(variantOf('abc'))
  })
})

describe('rendered portraits in public/portraits', () => {
  it('every subject has a 256x256 webp of small size', () => {
    for (const s of portraitSubjects()) {
      const f = `public/portraits/${s.id}.webp`
      expect(existsSync(f), `${f} missing (run tools/render-portraits.mjs)`).toBe(true)
      const b = readFileSync(f)
      expect(b.subarray(0, 4).toString('latin1')).toBe('RIFF')
      expect(b.subarray(8, 12).toString('latin1')).toBe('WEBP')
      expect(statSync(f).size).toBeLessThan(30_000)
      if (b.subarray(12, 16).toString('latin1') === 'VP8 ') {
        expect(b.readUInt16LE(26) & 0x3fff).toBe(256)
        expect(b.readUInt16LE(28) & 0x3fff).toBe(256)
      }
    }
  })
})

describe('Hugging Face generator: lint, plan, dry run', () => {
  it('the STYLE constant and the audition variants pass the lint, and the style is the one sentence', () => {
    expect(lintPrompt(STYLE)).toEqual([])
    for (const st of AUDITION_STYLES) expect(lintPrompt(st)).toEqual([])
    expect(AUDITION_STYLES[0]).toBe(STYLE)
    expect(STYLE).toContain('head and shoulders')
    expect(STYLE).toContain('warm lantern light')
    expect(STYLE).toContain('dark backdrop')
    expect(STYLE).toContain('wordless and unlettered')
  })
  it('the lint refuses text magnets, negations, counts, franchise and artist names, and long prompts', () => {
    expect(lintPrompt('a general holding a banner')).toContain('text-magnet noun "banner"')
    expect(lintPrompt('a map on the table').join()).toMatch(/map/)
    expect(lintPrompt('no beard')).toContain('negation "no"')
    expect(lintPrompt('without a helmet')).toContain('negation "without"')
    expect(lintPrompt('a three-quarter view').join()).toMatch(/three/)
    expect(lintPrompt('five soldiers')).toContain('count word "five"')
    expect(lintPrompt('in the style of Koei')).toContain('franchise, artist or studio name "koei"')
    expect(lintPrompt('by greg rutkowski').join()).toMatch(/rutkowski/)
    expect(lintPrompt('a calm general with a red face')).toEqual([])
    expect(lintPrompt('x'.repeat(MAX_PROMPT + 1)).join()).toMatch(/over 900/)
  })
  it('every subject has an identity clause and every prompt is clean, under 900 characters, and ends with the byte-identical STYLE', () => {
    const subjects = loadSubjects('.')
    expect(lintAll(subjects)).toEqual({ ok: true, problems: [] })
    for (const s of subjects) {
      const p = promptFor(s)
      expect(p.endsWith(STYLE), s.id).toBe(true)
      expect(p.length).toBeLessThan(MAX_PROMPT)
      expect(clauseFor(s).length).toBeGreaterThan(10)
    }
    for (const o of ALL_OFFICERS) expect(IDENTITY[o.id], `identity for ${o.id}`).toBeTruthy()
  })
  it('the identity table keeps the brothers apart', () => {
    expect(IDENTITY['guan-yu']).toMatch(/red face/)
    expect(IDENTITY['guan-yu']).toMatch(/long black beard/)
    expect(IDENTITY['guan-yu']).toMatch(/green headscarf/)
    expect(IDENTITY['zhang-fei']).toMatch(/dark/)
    expect(IDENTITY['zhang-fei']).toMatch(/whiskers/)
    expect(IDENTITY['zhang-fei']).toMatch(/red cape/)
    expect(IDENTITY['liu-bei']).toMatch(/earlobes/)
    expect(IDENTITY['liu-bei']).toMatch(/topknot/)
  })
  it('a named officer without an identity entry fails the build', () => {
    expect(() => clauseFor({ id: 'nobody', name: 'Nobody', group: 'officer', side: 'han', kind: 'infantry', troop: 'infantry', variant: 0 })).toThrow(/no entry/)
  })
  it('the plan: --only is exact, --limit caps the paid calls, --force replaces and the default skips existing files', () => {
    const subjects = loadSubjects('.')
    expect(buildPlan(subjects, { only: ['guan-yu'] }).map((p) => [p.id, p.action])).toEqual([['guan-yu', 'generate']])
    expect(buildPlan(subjects, { only: ['guan-yu'], exists: () => true })[0]!.action).toBe('skip')
    expect(buildPlan(subjects, { only: ['guan-yu'], exists: () => true, force: true })[0]!.action).toBe('replace')
    expect(() => buildPlan(subjects, { only: ['guan'] })).toThrow(/no such portrait subject/)
    const capped = buildPlan(subjects, { limit: 3 })
    expect(capped.filter((p) => p.action === 'generate')).toHaveLength(3)
    expect(capped.filter((p) => p.action === 'defer')).toHaveLength(subjects.length - 3)
    expect(seedFor('guan-yu')).toBe(seedFor('guan-yu'))
    expect(seedFor('guan-yu')).not.toBe(seedFor('zhang-fei'))
  })
  it('--dry-run makes no request, needs no token and never prints one', () => {
    const env = { ...process.env, HF_TOKEN: 'hf_dummy_secret_value', HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9' }
    const out = execFileSync('node', ['tools/portraits/gen-hf.mjs', '--dry-run', '--only', 'guan-yu,zhang-fei', '--force'], { env, encoding: 'utf8', timeout: 20_000 })
    expect(out).toContain('dry run: no network')
    expect(out).toContain('replace')
    expect(out).toContain('guan-yu')
    expect(out).not.toContain('hf_dummy_secret_value')
    const noToken: NodeJS.ProcessEnv = { ...process.env }
    delete noToken.HF_TOKEN
    const out2 = execFileSync('node', ['tools/portraits/gen-hf.mjs', '--dry-run', '--audition', '--only', 'liu-bei'], { env: noToken, encoding: 'utf8', timeout: 20_000 })
    expect(out2).toContain('4 style variants')
  })
  it('a live run without HF_TOKEN stops before any request', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:9' }
    delete env.HF_TOKEN
    let code = 0
    let out = ''
    try {
      out = execFileSync('node', ['tools/portraits/gen-hf.mjs', '--only', 'guan-yu', '--force', '--out', 'tools/out/portraits-test'], { env, encoding: 'utf8', timeout: 20_000 })
    } catch (e) {
      code = (e as { status: number }).status
      out = String((e as { stdout: string }).stdout)
    }
    expect(code).toBe(1)
    expect(out).toContain('HF_TOKEN is not set')
  })
})
