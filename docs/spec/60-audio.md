# 60 — Audio: the music brief and the adaptive music system (v0.1, 2026-11-01)

**Status:** the system is built and tested; **there are no audio files yet** (`public/audio/manifest.json` lists none). It stays silent, without errors, until files are added. Every claim about how the music *sounds* is **not verified by ear**: the owner judges audio on `sounds.html` (KB README rule 9).

**Owner decisions (do not re-ask):**
- 2026-10-17 (KB): a synthesised/procedural score was rejected ("the music sucks"). Music is **real generated or recorded audio files only**. No procedural score ships, not even as a fallback.
- 2026-11-01 (D21): during a cut-in a **high-energy charge layer plays over the battle music and is removed when the cut-in ends**. Style: a **full orchestral surge**, with strings, brass and war drums swelling together over the battle bed. The files come from the owner's **Audio Studio on his PC** (no CC0 placeholders).
- 2026-11-01: cut-ins are **full** for stratagems and chains and a **2–3 s short version** for normal attacks. The charge layer uses a shorter swell and release for the short kind.

Original music only, in an ancient-Chinese-flavoured palette. No imitation of any existing game's soundtrack, no melody quoted from one, and no prompt that names a game, studio, composer or franchise.

---

## 1. How the system works (what the files plug into)

Code is in `src/client/audio/`. Everything musical is scheduled on the audio clock (`AudioContext.currentTime`), never with `setTimeout`.

| Module | Job |
|---|---|
| `audioEngine.ts` | The one `AudioContext`; `master → music bus + sfx bus`. Unlock listeners (`pointerup`, `touchend`, `click`, `keydown`) stay for the whole session and retry `resume()` (iOS Safari). Suspends on a hidden tab. Volume settings (master, music, effects, mute) persist in `localStorage` (try/catch). |
| `manifest.ts` | Reads `public/audio/manifest.json`; validates it; resolves URLs under `import.meta.env.BASE_URL`. |
| `webGraph.ts` | Lazy fetch + decode with a cache. A file that 404s or will not decode is logged **once** and treated as silence. |
| `musicDirector.ts` | Pure scheduling (unit-tested with a fake clock): beds, the charge overlay, stingers. |
| `gameAudio.ts` / `moods.ts` | The game store picks the bed from the screen, the battle result and the commander's health. |
| `index.ts` | The facade, `audio` (see section 6). |

### Beds (one per mood, 2 s crossfades)
| Mood | When |
|---|---|
| `title` | title, how-to, briefing, new-campaign screens |
| `calm` | campaign story scenes and the pre-battle briefing (`scene`, `cbrief`) |
| `camp` | camp and deploy |
| `battle` | the battle screen |
| `tense` | battle, when your commander's troops fall below 35% of max (returns to `battle` above 50%) |
| `victory` | the end screen on a win; the campaign results and summary screens |
| `defeat` | the end screen on a loss; the campaign defeat screen |

A mood with no file falls back (first loadable wins): `tense → battle`, `camp → calm`, `calm → camp`, `title → calm`. `battle`, `victory` and `defeat` have no fallback, so a missing file is silence. A `victory`/`defeat` entry with role `stinger` plays **once** (no loop) and the bed under it fades out in 1 s; with role `bed` it loops.

### The charge overlay (the owner's request)
`audio.cutinStart(kind, sceneSeconds)` / `audio.cutinEnd()` / `audio.cutinSkip()`.

| Event | `full` (stratagems, chains) | `short` (normal attacks) |
|---|---|---|
| `cutinStart` | bed ducks **−6 dB over 0.3 s**; charge fades in **over 0.4 s** | duck as `full`; charge fades in **over 0.25 s** |
| `cutinEnd` | charge fades out **over 1.2 s**; the bed un-ducks over the same time | **0.8 s** |
| `cutinSkip` (player clicks through, or the review page jumps) | **0.5 s** fade-out and un-duck; also speeds up a fade already running | same |
| failsafe (no `cutinEnd` ever arrives) | fades out (as `cutinEnd`) after **max(scene seconds + 2 s, 12 s)**; each chain link refreshes the deadline | same |

- **Phase-lock.** If the bed and the charge layer have the same `bpm` and `beatsPerBar`, the layer starts on the **next beat of the bed's loop** (computed from the bed's start time on the audio clock, 50 ms lookahead). It is entered at the **same bar position** as the bed: if the lock beat is the 4th beat of a bar, the layer starts 3 beats into its own file. The duck and the fade-in both begin on that beat. A different tempo means "start immediately". So the two files **must share BPM, beats per bar and a beat-aligned loop start** (see section 5).
- **Chains.** A `cutinStart` while the layer is already up changes nothing but the failsafe deadline: one voice, no restart. A link that starts inside the previous link's fade-out swells the *same* voice back up. Call `cutinEnd()` once, after the last link.
- **Silence rules.** No charge file (or it fails to decode) → no voice **and no duck**, so the bed is never dipped for nothing. A `cutinEnd` that arrives while the file is still loading cancels the start.
- **Result jingles.** `setMood('victory'|'defeat')` takes the charge layer down in 0.5 s.
- **Stingers** (`impact`, `seal`) go on the sfx bus, at most one per cue every 0.15 s and 6 at once. A stinger that is not decoded yet is skipped (late is worse than never) and the load starts for next time. The charge layer, the stingers and the other beds are preloaded when the battle bed starts.

---

## 2. The stems to produce

Ten files minimum. Same key and BPM across `battle`, `tense` and `charge` is the one hard rule; everything else can be re-tuned by ear.

| Id | Role / mood | BPM | Key | Meter | Length | Loop |
|---|---|---|---|---|---|---|
| `bed-title` | bed / `title` | 72 | D minor | 4/4 | 16 bars = 53.33 s | yes |
| `bed-calm` | bed / `calm` | 90 | F major | 4/4 | 16 bars = 42.67 s | yes |
| `bed-camp` | bed / `camp` | 76 | F major | 4/4 | 16 bars = 50.53 s | yes |
| `bed-battle` | bed / `battle` | **120** | **D minor** | 4/4 | 32 bars = 64 s | yes |
| `bed-tense` | bed / `tense` | **120** | **D minor** | 4/4 | 16 bars = 32 s | yes |
| `charge` | charge | **120** | **D minor** | 4/4 | 8 bars = 16 s | yes |
| `jingle-victory` | stinger / `victory` | 100 | D major | 4/4 | 6 bars = 14.4 s + natural tail | no |
| `jingle-defeat` | stinger / `defeat` | 66 | D minor | 4/4 | 4 bars = 14.5 s + natural tail | no |
| `impact` | stinger, cue `impact` | – | – | – | about 1 s | no |
| `seal` | stinger, cue `seal` | – | – | – | about 0.6 s | no |

`bed-tense` shares the battle tempo and key so the charge layer locks onto it too, and so a `battle → tense` crossfade stays on the beat grid.

### Palette
- **Beds:** ancient-Chinese-flavoured: guzheng, pipa, erhu, dizi and xiao flutes, bronze bells, low frame drums, sparse suona. Pentatonic melodic material (D minor pentatonic: D F G A C; F major pentatonic for calm and camp). Title is solemn and broad; calm is gentle and spacious; camp is warm and domestic (fire, tea, quiet strings); battle is driving war drums with plucked ostinato and low brass-like drones; tense strips the melody, keeps the drums and adds tremolo strings and a held bell.
- **Charge layer:** see section 3.

---

## 3. The charge overlay layer: the full orchestral surge

**Purpose:** when a cut-in dives into the sand table, the player should feel the army *charge*. The layer sits on top of the **ducked** battle bed (−6 dB) and must lift it without muddying it. It is a **layer**, not a track: it never carries a tune of its own that could clash with whatever the bed is playing.

**Instruments (orchestral surge):** strings, brass and war drums swelling together.
- **War drums own the low end.** Deep taiko-style drums on a driving pattern (steady eighths with accents on beats 1 and 3, a fill into bar 5), plus a snare-like rim roll that rises. The low register (below about 150 Hz) belongs to the drums alone. **No bass, no cellos, no contrabass, no tuba, no sub-bass synth.**
- **Strings in a mid-high register** (violas, violins, from about 200 Hz up): fast spiccato/staccato sixteenth-note **ostinato** on a two-chord figure, with crescendo swells.
- **Brass in a mid-high register** (horns and trumpets, optionally a suona doubling the top line): rising fanfare-like calls and sustained swells built on long notes and fifths. Rising lines, not a hummable theme.
- **Harmony:** D minor only, using the notes D, F, G, A, C (so it sits inside the bed's pentatonic). No chromatic runs and no major third: nothing that could grind against the bed's melody. Root and fifth do most of the work.
- **No voices, no choir, no lyrics.** No cymbal washes that smear (short crashes on bar 1 only).

**Shape (planned for the fades):** the engine fades the layer in over 0.4 s and out over 1.2 s (0.25 s and 0.8 s for short cut-ins), so the arrangement must already work as a sustained plateau:
1. **A 1-bar swell-in.** Bar 1 of the file is a rising bar (drum roll and string crescendo into a brass stab) landing on the downbeat of bar 2. When the layer enters on a downbeat it starts here; mid-bar entries land inside the drive and need no pickup.
2. **Bars 2–8: constant drive.** Same intensity; no breakdown, no quiet bars, so a chain of cut-ins, which holds the layer for 20 s or more, never sags.
3. **The loop wraps** from bar 8 back to bar 1 without a gap or a click (a drum fill into the bar-1 swell is expected and wanted).
4. **A 2-bar release (optional extra, not wired yet).** If the Audio Studio can make it, also produce `charge-tail`: a 2-bar (4 s) one-shot with falling brass, a timpani/taiko roll decaying and a bell, to be played at `cutinEnd` so the fade lands musically. The director does not play it yet; keep it out of the manifest until a later change wires it (the manifest would list it as `role: 'stinger'` with `id: 'charge-tail'`). Until then the 1.2 s fade is the release.

**Mix:** master the layer at about **−16 LUFS integrated measured alone** (the same as a bed), true peak ≤ −1 dBTP. A bed ducked by 6 dB sits near −22 LUFS, so bed plus layer sums to about −15 LUFS: a lift of roughly +1 LU, not a wall. Set `gainDb` in the manifest to trade this by ear (the sensible range is −6 to +2 dB; start at 0).

---

## 4. Audio Studio jobs: per-cue prompts

For the owner's PC session. Music uses the Audio Studio's `mode: 'music'` (ACE-Step); stingers use `mode: 'sfx'`. Music job fields: `prompt` (a style line), `lyrics: '[Instrumental]'`, `duration` (10–240 s), `bpm`, `key`, `timesig: '4'`, `steps` (start at the default 8), `batch: 2`, `seed` (record it). Generate each **2–4 s longer than the loop length** so it can be trimmed to exact bars (section 5). Describe the mechanism and state exclusions (KB audio lessons); never name a game, studio or composer.

Common exclusions, appended to every music prompt: `instrumental, no vocals, no choir, no lyrics, no electronic synth, no modern drum kit, no pop beat`.

| Id | duration | bpm | key | Prompt (style line) |
|---|---|---|---|---|
| `bed-title` | 58 | 72 | D minor | `slow solemn ancient Chinese instrumental, guzheng arpeggios over a low frame drum pulse, erhu carrying a broad lyrical pentatonic theme, soft bronze bell on the downbeat, distant xiao flute, wide reverb like a great hall at night, noble and a little sad, D minor pentatonic` |
| `bed-calm` | 46 | 90 | F major | `gentle spacious ancient Chinese instrumental for a quiet story scene, dizi flute and plucked pipa playing a simple pentatonic phrase, soft guzheng, light hand percussion, warm and reflective, slow harmonic movement, F major pentatonic` |
| `bed-camp` | 54 | 76 | F major | `warm quiet ancient Chinese camp-at-night instrumental, soft bowed erhu, plucked guzheng, a slow wooden percussion pulse like a crackling fire, relaxed and homely, steady and unhurried, F major pentatonic` |
| `bed-battle` | 68 | 120 | D minor | `driving ancient Chinese war music for a tactical battle, deep taiko-style war drums playing a steady rolling pattern, plucked pipa and guzheng ostinato, low sustained horn-like drone, short suona calls every four bars, determined and rhythmic but with open space for a layer on top, steady energy not a climax, D minor pentatonic` |
| `bed-tense` | 36 | 120 | D minor | `tense ancient Chinese battle music, the melody stripped back, steady low war drums, tremolo strings holding a bare D minor drone, a single bronze bell on beat one of every other bar, rising unease, urgent but restrained, D minor pentatonic` |
| `charge` | 20 | 120 | D minor | `full orchestral surge for a cavalry charge, layer only: fast driving spiccato string ostinato in the mid-high register, rising brass fanfare swells with horns and trumpets, a suona doubling the top line, deep taiko-style war drums carrying all the low end with steady eighth notes and accents on one and three, a snare roll swelling in the first bar, relentless and heroic, rising lines with no hummable melody, no bass, no cellos, no tuba, no sub-bass, no choir, D minor` |
| `jingle-victory` | 18 | 100 | D major | `short triumphant ancient Chinese victory fanfare, suona and bright brass-like horns over rolling war drums and bronze bells, rising pentatonic line resolving to a held D major chord with a natural ring-out, proud and warm` |
| `jingle-defeat` | 18 | 66 | D minor | `short sorrowful ancient Chinese defeat lament, a slow solo erhu phrase over a low drum heartbeat and a single bronze bell, falling pentatonic line settling on a held D minor note that fades into silence` |

SFX prompts (`mode: 'sfx'`, about 1 s; then measure crest factor and trim):
- `impact`: `a single deep war-drum strike with a short bronze gong shimmer, dry, punchy, one hit, tail under one second`
- `seal`: `a heavy wooden seal stamped onto a bamboo slip, one dull thud with a very short bright bell, dry, tail under half a second`

Gate before a file enters the repo: generate two takes (`batch: 2`), keep the better, record the seed and the prompt in the delivery report, and run the checks in section 5. **Do not put the unmastered masters in the repo** (KB: masters never enter the repo).

---

## 5. Mastering, loop points and format

**Loudness:** beds and jingles **−16 LUFS integrated**, true peak ≤ −1 dBTP. The charge layer as in section 3. `impact` and `seal`: peak about −3 dBFS (they ride the sfx bus; trim levels with `gainDb`). Fades in the file: none at the loop seam (a loop must not fade); jingles end in their own natural tail.

**Loops in whole bars.** A loop is a whole number of bars of the stated BPM (section 2). Procedure:
1. Generate longer than needed, pick the take, and **trim to exactly N bars** at a zero crossing on a downbeat. Check the length: `bars × beatsPerBar × 60 / BPM` seconds (e.g. 32 bars at 120 BPM = 64.000 s).
2. **Verify the tempo and the grid** with a beat tracker or by importing into a DAW with a grid: the generator's `bpm` is a hint, not a guarantee. If it drifts, time-stretch to the exact BPM before trimming.
3. **Beat-align the loop start.** `loopStart` must fall on a beat (usually 0). The phase-lock maths counts beats from time 0 of each file, so the downbeat of bar 1 must be at 0.000 s in **both** the bed and the charge file. Trim leading silence, and for a generated file that begins with a pickup, start the loop after it and set `loopStart` to the first downbeat.
4. **Check the seam**: loop the trimmed file in an editor for a minute; no click, no flam, no tail from a decay that is cut off.
5. Set `loopEnd` to the end of the last bar in seconds (to 3 decimals). `loopEnd <= loopStart` means "play to the end of the file".

**Format:** deliver **OGG Vorbis (q5, about 160 kbps) as `file`** and **M4A (AAC, 192 kbps) as `alt`** for Safari. 44.1 kHz, stereo. Both encodings must be trimmed identically (AAC adds encoder delay of about 1,024 samples: use an encoder that writes the gapless/delay tags, or encode from the already-trimmed WAV and check the loop seam in Safari). The loader tries `file`, then `alt` if the first will not fetch or decode.

**Naming:** `public/audio/<id>.ogg` and `public/audio/<id>.m4a`, with the ids in section 2 (lower-case, hyphens). The manifest `id` equals the file stem.

**Size budget:** about 5 MB for the whole score (OGG), since it ships to GitHub Pages. Beds are fetched lazily, when the mood is first needed.

**Verification report (every delivery):** for each file, the measured LUFS, true peak, length, BPM, the bar count, and the loop seam check; and the line **"not verified by ear"** until the owner has listened on `sounds.html`.

---

## 6. Adding the files (API)

1. Put `<id>.ogg` (and `<id>.m4a`) in `public/audio/`.
2. Add an entry to `public/audio/manifest.json`. Nothing else changes; the music appears.

```json
{
  "version": 1,
  "tracks": [
    { "id": "bed-battle", "file": "bed-battle.ogg", "alt": "bed-battle.m4a", "bpm": 120, "beatsPerBar": 4, "loopStart": 0, "loopEnd": 64.0, "gainDb": 0, "role": "bed", "mood": "battle" },
    { "id": "bed-tense",  "file": "bed-tense.ogg",  "alt": "bed-tense.m4a",  "bpm": 120, "beatsPerBar": 4, "loopStart": 0, "loopEnd": 32.0, "gainDb": 0, "role": "bed", "mood": "tense" },
    { "id": "charge",     "file": "charge.ogg",     "alt": "charge.m4a",     "bpm": 120, "beatsPerBar": 4, "loopStart": 0, "loopEnd": 16.0, "gainDb": 0, "role": "charge" },
    { "id": "jingle-victory", "file": "jingle-victory.ogg", "bpm": 100, "beatsPerBar": 4, "loopStart": 0, "loopEnd": 0, "gainDb": 0, "role": "stinger", "mood": "victory" },
    { "id": "impact", "file": "impact.ogg", "bpm": 0, "beatsPerBar": 4, "loopStart": 0, "loopEnd": 0, "gainDb": -3, "role": "stinger", "cue": "impact" }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | unique |
| `file`, `alt` | path under `audio/` (relative to the Vite base path); `alt` is tried if `file` fails |
| `bpm`, `beatsPerBar` | the beat grid; both must match between the battle bed and the charge layer for the phase-lock (otherwise the layer starts at once) |
| `loopStart`, `loopEnd` | loop region in seconds; `loopEnd <= loopStart` = to the end of the file |
| `gainDb` | trim for this file (dB); the charge layer's own trim is applied on top of the −6 dB duck |
| `role` | `bed` (looping, one per mood), `charge` (the cut-in layer), `stinger` (one-shot) |
| `mood` | `title`, `camp`, `calm`, `battle`, `tense`, `victory`, `defeat`. For a `charge` entry it says which bed it was written for (preferred when several exist) |
| `cue` | for a stinger without a mood: `impact` or `seal` (an id of `impact`/`seal` also works) |

Invalid entries are dropped with a one-time console warning; a 404 or a decode failure is logged once and is silence.

**Calling it from the game** (the in-game cut-in integration is a later change; the cinema page already uses it):

```ts
import { audio } from '@/client/audio'
audio.setMood('battle')               // done automatically from the store by bindGameAudio()
audio.cutinStart('full', 7)           // 'full' (stratagem/chain) or 'short' (normal attack); scene seconds size the failsafe
audio.cutinEnd()                      // the last link finished
audio.cutinSkip()                     // the player clicked through
audio.impact(); audio.seal()          // stingers, rate-limited
```

Calls made before the first user gesture (when no `AudioContext` may exist) are remembered and applied when audio unlocks.

---

## 7. Where it is checked

- **By ear (owner), on `sounds.html`:** every manifest entry with Play/Stop; "no file yet" rows for empty slots; the **Charge overlay demo** (battle bed, cut-in start at 4 s, cut-in end 7 s later) with live gain meters for the bed and the charge layer and the phase-lock beat. The cinema page (`cinema.html`) plays the battle bed and lays the charge layer over each scene. **Nothing in this document has been verified by ear.**
- **By machine:** `tests/unit/audio-director.test.ts` (ramps, phase-lock maths, chains, failsafe, silence), `tests/unit/audio-support.test.ts` (manifest, settings, moods), `tests/e2e/audio.spec.ts` (pages load with 0 errors, the settings panel opens, and a real `AudioContext` run with a generated click track proves the duck, the lock and the release on the audio clock).

## Revision log
- v0.1 2026-11-01: first brief and system.
