// Manifest validation and URLs, settings persistence, mood choice and the demo cue sheet.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { busGains, DEFAULT_SETTINGS, loadSettings, parseSettings, saveSettings, SETTINGS_KEY, sliderToGain } from '../../src/client/audio/audioEngine'
import { CHARGE_DEMO, CueSheet } from '../../src/client/audio/demoScript'
import {
  audioUrl, candidatesForCharge, candidatesForMood, entriesForSlot, fetchManifest, normalizeManifest, resetWarnings, SLOTS, stingerFor, warnOnce,
  type Manifest,
} from '../../src/client/audio/manifest'
import { moodFor, TENSE_OFF, TENSE_ON } from '../../src/client/audio/moods'
import manifestJson from '../../public/audio/manifest.json'

const T = { bpm: 120, beatsPerBar: 4, loopStart: 0, loopEnd: 16, gainDb: 0 }

describe('manifest', () => {
  it('the shipped manifest is valid, keeps every entry, and every file it names is shipped', () => {
    const warns: string[] = []
    const m = normalizeManifest(manifestJson, (w) => warns.push(w))
    expect(warns).toEqual([])
    expect(m.tracks.length).toBe((manifestJson as { tracks: unknown[] }).tracks.length)
    for (const t of m.tracks) {
      expect(existsSync(resolve(__dirname, '../../public/audio', t.file)), t.file).toBe(true)
      if (t.alt) expect(existsSync(resolve(__dirname, '../../public/audio', t.alt)), t.alt).toBe(true)
    }
  })
  it('drops bad entries and duplicate ids, fills defaults, keeps good ones', () => {
    const warns: string[] = []
    const m = normalizeManifest(
      { tracks: [{ id: 'a', file: 'a.ogg', role: 'bed', mood: 'battle', bpm: 120 }, { id: 'a', file: 'x', role: 'bed' }, { id: 'b', role: 'bed' }, { id: 'c', file: 'c.ogg', role: 'nope' }, null, { id: 'd', file: 'd.ogg', role: 'charge', mood: 'weird', beatsPerBar: 0, gainDb: 'loud' }] },
      (w) => warns.push(w),
    )
    expect(m.tracks.map((t) => t.id)).toEqual(['a', 'd'])
    expect(m.tracks[0]).toMatchObject({ beatsPerBar: 4, loopStart: 0, loopEnd: 0, gainDb: 0, mood: 'battle' })
    expect(m.tracks[1]).toMatchObject({ beatsPerBar: 1, gainDb: 0 })
    expect(m.tracks[1]!.mood).toBeUndefined()
    expect(warns.length).toBe(3)
    expect(normalizeManifest('garbage')).toEqual({ version: 1, tracks: [] })
  })
  it('respects the Vite base path', () => {
    expect(audioUrl('battle.ogg', '/three-kingdoms-tactics/')).toBe('/three-kingdoms-tactics/audio/battle.ogg')
    expect(audioUrl('/battle.ogg', '/')).toBe('/audio/battle.ogg')
    expect(audioUrl('x.ogg', '/sub')).toBe('/sub/audio/x.ogg')
  })
  it('a 404 or a network error is an empty manifest, logged once', async () => {
    resetWarnings()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r404 = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch
    expect(await fetchManifest(r404, '/')).toEqual({ version: 1, tracks: [] })
    expect(await fetchManifest(r404, '/')).toEqual({ version: 1, tracks: [] })
    const boom = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await fetchManifest(boom, '/')).toEqual({ version: 1, tracks: [] })
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
  it('warnOnce logs a key once', () => {
    resetWarnings()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnOnce('k', 'one')
    warnOnce('k', 'two')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
  const m: Manifest = {
    version: 1,
    tracks: [
      { id: 'b', file: 'b', role: 'bed', mood: 'battle', ...T },
      { id: 'c-any', file: 'c1', role: 'charge', ...T },
      { id: 'c-battle', file: 'c2', role: 'charge', mood: 'battle', ...T },
      { id: 'v', file: 'v', role: 'stinger', mood: 'victory', ...T },
      { id: 'seal', file: 's', role: 'stinger', ...T },
    ],
  }
  it('picks candidates: mood fallbacks, tagged charge first, stingers by cue or id', () => {
    expect(candidatesForMood(m, 'tense').map((t) => t.id)).toEqual(['b'])
    expect(candidatesForMood(m, 'victory').map((t) => t.id)).toEqual(['v'])
    expect(candidatesForMood(m, 'title')).toEqual([])
    expect(candidatesForCharge(m, 'battle').map((t) => t.id)).toEqual(['c-battle', 'c-any'])
    expect(candidatesForCharge(m, null).map((t) => t.id)).toEqual(['c-any', 'c-battle'])
    expect(stingerFor(m, 'seal')?.id).toBe('seal')
    expect(stingerFor(m, 'impact')).toBeNull()
  })
  it('slots report what is filled', () => {
    const filled = SLOTS.filter((s) => entriesForSlot(m, s).length).map((s) => s.key)
    expect(filled).toEqual(['bed:victory', 'bed:battle', 'charge', 'stinger:seal'].sort((a, b) => filled.indexOf(a) - filled.indexOf(b)))
    expect(SLOTS.filter((s) => entriesForSlot({ version: 1, tracks: [] }, s).length)).toEqual([])
  })
})

describe('settings', () => {
  const mem = (): Storage => {
    const d = new Map<string, string>()
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) } as unknown as Storage
  }
  let store: Storage
  beforeEach(() => {
    store = mem()
  })
  it('round-trips through storage and clamps garbage', () => {
    saveSettings({ master: 0.5, music: 0.25, sfx: 1, muted: true }, store)
    expect(loadSettings(store)).toEqual({ master: 0.5, music: 0.25, sfx: 1, muted: true })
    expect(parseSettings('{"master":7,"music":-1,"sfx":"x"}')).toEqual({ master: 1, music: 0, sfx: DEFAULT_SETTINGS.sfx, muted: false })
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
  it('never throws when storage is blocked', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(DEFAULT_SETTINGS, bad)).not.toThrow()
    expect(SETTINGS_KEY).toContain('audio')
  })
  it('mute zeroes the master only; sliders are square-law', () => {
    expect(busGains({ master: 1, music: 0.5, sfx: 1, muted: true })).toEqual({ master: 0, music: 0.25, sfx: 1 })
    expect(busGains({ master: 0.5, music: 1, sfx: 0, muted: false }).master).toBeCloseTo(0.25)
    expect(sliderToGain(0)).toBe(0)
  })
})

describe('moodFor', () => {
  const base = { playerWon: null, commanderFrac: 1, previous: null } as const
  it('maps screens to beds', () => {
    const f = (screen: string, extra = {}) => moodFor({ ...base, screen, ...extra })
    expect(f('title')).toBe('title')
    expect(f('briefing')).toBe('title')
    expect(f('scene')).toBe('calm')
    expect(f('camp')).toBe('camp')
    expect(f('deploy')).toBe('camp')
    expect(f('battle')).toBe('battle')
    expect(f('results')).toBe('victory')
    expect(f('defeat')).toBe('defeat')
    expect(f('end', { playerWon: true })).toBe('victory')
    expect(f('end', { playerWon: false })).toBe('defeat')
  })
  it('turns tense when the commander is low, with hysteresis', () => {
    const f = (frac: number | null, previous: 'battle' | 'tense' | null) => moodFor({ screen: 'battle', playerWon: null, commanderFrac: frac, previous })
    expect(f(TENSE_ON + 0.01, 'battle')).toBe('battle')
    expect(f(TENSE_ON - 0.01, 'battle')).toBe('tense')
    expect(f(TENSE_OFF - 0.01, 'tense')).toBe('tense')
    expect(f(TENSE_OFF, 'tense')).toBe('battle')
    expect(f(null, 'tense')).toBe('battle')
  })
})

describe('CueSheet', () => {
  it('fires the demo steps once, in order, as the clock passes them', () => {
    const s = new CueSheet(CHARGE_DEMO)
    s.start(100)
    expect(s.poll(100).map((x) => x.label)).toEqual(['bed'])
    expect(s.poll(103.9)).toEqual([])
    expect(s.poll(104).map((x) => x.label)).toEqual(['cutinStart'])
    expect(s.poll(111).map((x) => x.label)).toEqual(['cutinEnd'])
    expect(s.running).toBe(true)
    expect(s.poll(130).map((x) => x.label)).toEqual(['done'])
    expect(s.running).toBe(false)
    expect(s.poll(200)).toEqual([])
  })
})
