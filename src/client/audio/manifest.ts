// The audio manifest (docs/spec/60-audio.md). `public/audio/manifest.json` lists the real recorded/generated files; it is
// empty until the owner's Audio Studio produces them. Everything here is pure (no Web Audio, no DOM) except `fetchManifest`.
export type TrackRole = 'bed' | 'charge' | 'stinger'
export type Mood = 'calm' | 'battle' | 'tense' | 'victory' | 'defeat' | 'camp' | 'title'
export type StingerCue = 'impact' | 'seal'

export const MOODS: readonly Mood[] = ['title', 'camp', 'calm', 'battle', 'tense', 'victory', 'defeat']

export interface TrackEntry {
  id: string
  /** Path under `audio/` (e.g. `battle.ogg`). */
  file: string
  /** Optional fallback tried when `file` fails to fetch or decode (M4A/AAC for Safari). */
  alt?: string
  bpm: number
  beatsPerBar: number
  /** Loop region in seconds inside the file. `loopEnd <= loopStart` means "to the end of the file". */
  loopStart: number
  loopEnd: number
  gainDb: number
  role: TrackRole
  mood?: Mood
  /** For role 'stinger' without a mood: which game cue plays it. */
  cue?: StingerCue
}

export interface Manifest {
  version: 1
  tracks: TrackEntry[]
}

export const EMPTY_MANIFEST: Manifest = { version: 1, tracks: [] }

/** The slots a complete score fills; the audition page shows "no file yet" for any slot with nothing in the manifest. */
export interface Slot {
  key: string
  label: string
  role: TrackRole
  mood?: Mood
  cue?: StingerCue
}
export const SLOTS: readonly Slot[] = [
  ...MOODS.map((m): Slot => ({ key: `bed:${m}`, label: `Bed: ${m}`, role: 'bed', mood: m })),
  { key: 'charge', label: 'Charge overlay layer', role: 'charge' },
  { key: 'stinger:impact', label: 'Stinger: impact', role: 'stinger', cue: 'impact' },
  { key: 'stinger:seal', label: 'Stinger: seal', role: 'stinger', cue: 'seal' },
]

const ROLES: readonly string[] = ['bed', 'charge', 'stinger']
const CUES: readonly string[] = ['impact', 'seal']

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Validate untrusted JSON. Bad entries are dropped (never thrown on); `warn` hears why. */
export function normalizeManifest(raw: unknown, warn: (msg: string) => void = () => {}): Manifest {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { tracks?: unknown }).tracks) ? ((raw as { tracks: unknown[] }).tracks) : null
  if (!list) {
    if (raw !== undefined) warn('audio manifest has no "tracks" array; treating it as empty')
    return { version: 1, tracks: [] }
  }
  const out: TrackEntry[] = []
  const seen = new Set<string>()
  for (const r of list) {
    const o = r as Record<string, unknown> | null
    if (!o || typeof o !== 'object') continue
    const id = typeof o.id === 'string' ? o.id : ''
    const file = typeof o.file === 'string' ? o.file : ''
    const role = typeof o.role === 'string' && ROLES.includes(o.role) ? (o.role as TrackRole) : null
    if (!id || !file || !role) {
      warn(`audio manifest entry ignored (needs id, file and role): ${JSON.stringify(r).slice(0, 80)}`)
      continue
    }
    if (seen.has(id)) {
      warn(`audio manifest: duplicate id "${id}" ignored`)
      continue
    }
    seen.add(id)
    const t: TrackEntry = {
      id,
      file,
      bpm: Math.max(0, num(o.bpm, 0)),
      beatsPerBar: Math.max(1, Math.round(num(o.beatsPerBar, 4))),
      loopStart: Math.max(0, num(o.loopStart, 0)),
      loopEnd: Math.max(0, num(o.loopEnd, 0)),
      gainDb: num(o.gainDb, 0),
      role,
    }
    if (typeof o.alt === 'string' && o.alt) t.alt = o.alt
    if (typeof o.mood === 'string' && (MOODS as readonly string[]).includes(o.mood)) t.mood = o.mood as Mood
    if (typeof o.cue === 'string' && CUES.includes(o.cue)) t.cue = o.cue as StingerCue
    out.push(t)
  }
  return { version: 1, tracks: out }
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20)
export const gainToDb = (g: number): number => (g <= 1e-6 ? -Infinity : 20 * Math.log10(g))

/** Bed fallbacks when a mood has no file of its own (first loadable wins). Victory and defeat have none: silence is correct. */
export const MOOD_FALLBACK: Record<Mood, readonly Mood[]> = {
  title: ['title', 'calm'],
  camp: ['camp', 'calm'],
  calm: ['calm', 'camp'],
  battle: ['battle'],
  tense: ['tense', 'battle'],
  victory: ['victory'],
  defeat: ['defeat'],
}

/** Candidate tracks for a mood, best first. Beds and (for victory/defeat) stingers tagged with the mood are both accepted. */
export function candidatesForMood(m: Manifest, mood: Mood): TrackEntry[] {
  const out: TrackEntry[] = []
  for (const mm of MOOD_FALLBACK[mood]) {
    for (const t of m.tracks) if (t.mood === mm && (t.role === 'bed' || t.role === 'stinger') && !out.includes(t)) out.push(t)
  }
  return out
}

/** The charge layer: one tagged for this mood, then an untagged one, then any. */
export function candidatesForCharge(m: Manifest, mood: Mood | null): TrackEntry[] {
  const all = m.tracks.filter((t) => t.role === 'charge')
  const rank = (t: TrackEntry): number => (mood && t.mood === mood ? 0 : t.mood === undefined ? 1 : 2)
  return all.slice().sort((a, b) => rank(a) - rank(b))
}

export function stingerFor(m: Manifest, cue: StingerCue): TrackEntry | null {
  return m.tracks.find((t) => t.role === 'stinger' && (t.cue === cue || (t.cue === undefined && t.mood === undefined && t.id === cue))) ?? null
}

/** Which manifest entries fill a slot. */
export function entriesForSlot(m: Manifest, s: Slot): TrackEntry[] {
  if (s.role === 'bed') return m.tracks.filter((t) => t.mood === s.mood && (t.role === 'bed' || t.role === 'stinger'))
  if (s.role === 'charge') return m.tracks.filter((t) => t.role === 'charge')
  return m.tracks.filter((t) => t.role === 'stinger' && !t.mood && (t.cue === s.cue || t.id === s.cue))
}

/** Audio files live under `<base>audio/`. `base` is Vite's BASE_URL (a sub-path on Pages). */
export function audioUrl(file: string, base: string = import.meta.env.BASE_URL ?? '/'): string {
  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}audio/${file.replace(/^\/+/, '')}`
}

const warned = new Set<string>()
/** Log a problem once per key (a missing file must not spam the console on every retrigger). */
export function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[audio] ${msg}`)
}
export function resetWarnings(): void {
  warned.clear()
}

export async function fetchManifest(fetchFn: typeof fetch = fetch, base?: string): Promise<Manifest> {
  try {
    const res = await fetchFn(audioUrl('manifest.json', base))
    if (!res.ok) {
      warnOnce('manifest', `manifest.json not found (${res.status}); music is silent`)
      return { version: 1, tracks: [] }
    }
    return normalizeManifest(await res.json(), (m) => warnOnce(`manifest:${m}`, m))
  } catch {
    warnOnce('manifest', 'manifest.json could not be read; music is silent')
    return { version: 1, tracks: [] }
  }
}
