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

**Loudness:** beds **−16 LUFS integrated**, jingles **−14 LUFS** (one-shots, so a little hotter; change `lufs` in `tools/audio/music-cues.json`), true peak ≤ −1 dBTP. The charge layer as in section 3. `impact` and `seal`: peak about −3 dBFS (they ride the sfx bus; trim levels with `gainDb`). Fades in the file: no audible fade at the loop seam (a loop must not fade), only a **10 ms declick** at the start and end of a loop so a cut that is not on a zero crossing cannot click (`--seam-fade-ms 0` turns it off); jingles end in their own natural tail with a 250 ms fade-out.

**Loops in whole bars.** A loop is a whole number of bars of the stated BPM (section 2). Procedure:
1. Generate longer than needed, pick the take, and **trim to exactly N bars** at a zero crossing on a downbeat. Check the length: `bars × beatsPerBar × 60 / BPM` seconds (e.g. 32 bars at 120 BPM = 64.000 s).
2. **Verify the tempo and the grid** with a beat tracker or by importing into a DAW with a grid: the generator's `bpm` is a hint, not a guarantee. If it drifts, time-stretch to the exact BPM before trimming.
3. **Beat-align the loop start.** `loopStart` must fall on a beat (usually 0). The phase-lock maths counts beats from time 0 of each file, so the downbeat of bar 1 must be at 0.000 s in **both** the bed and the charge file. Trim leading silence, and for a generated file that begins with a pickup, start the loop after it and set `loopStart` to the first downbeat.
4. **Check the seam**: loop the trimmed file in an editor for a minute; no click, no flam, no tail from a decay that is cut off.
5. Set `loopEnd` to the end of the last bar in seconds (to 3 decimals). `loopEnd <= loopStart` means "play to the end of the file".

**Format:** deliver **OGG Vorbis (q5, about 160 kbps) as `file`** and **M4A (AAC, 160 kbps) as `alt`** for Safari. 44.1 kHz, stereo. Both encodings must be trimmed identically (AAC adds encoder delay of about 1,024 samples: use an encoder that writes the gapless/delay tags, or encode from the already-trimmed WAV and check the loop seam in Safari). The loader tries `file`, then `alt` if the first will not fetch or decode.

**Naming:** the ids in section 2 (lower-case, hyphens). The runner (section 7) writes the two candidates as `public/audio/<id>-a.ogg|.m4a` and `<id>-b.ogg|.m4a`; the manifest `id` is the cue id and `file` names the picked candidate. By hand, `<id>.ogg` with the manifest `id` equal to the file stem also works. The M4A decodes up to one AAC frame (23 ms) longer than the OGG; it is never shorter, and `loopEnd` (not the file length) bounds the loop.

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

## 7. Running it on the PC (the generation runner)

`tools/audio/` turns section 2 and 4 into files with two commands. It was tested end to end against a fake studio (`fake-audio-studio.mjs`, click tracks) and has **never been run against the real Audio Studio**: the first PC run is the real test, and the response shapes of `/api/jobs/<id>` are read leniently for that reason. Everything it produces is **not verified by ear**.

**Files:** `music-cues.json` (the cue table: ids, BPM, key, bars, generate duration, prompts, seeds, loudness targets; edit prompts and seeds here only), `gen-music.mjs` (talks to the studio), `master-audio.mjs` (ffmpeg only), `fake-audio-studio.mjs` (testing), `lib.mjs`/`dsp.mjs` (shared). Tests: `tests/unit/audio-runner.test.ts`.

**Prerequisites** on the PC ("evilaegis"):
1. The repo checked out with Node 22 (no `npm install` is needed to run the two scripts; they use only Node built-ins).
2. The Audio Studio running and listening on `http://localhost:7890` (check `http://localhost:7890/api/status` in a browser). Nothing else may be using the GPU: **announce the GPU work to the owner first** and never run two GPU jobs at once (KB rule 10). The runner waits if the studio reports other queued or running jobs.
3. ffmpeg with libvorbis and aac (`ffmpeg -version`). If it is not on PATH: `winget install Gyan.FFmpeg` and open a new shell, or pass `--ffmpeg <full path to ffmpeg.exe>` (or set the `FFMPEG` environment variable). The mastering step stops with that message when ffmpeg is missing.

**Commands** (PowerShell or cmd, from the repo root; no bash needed):
```
node tools/audio/gen-music.mjs --dry-run          # the plan and the exact requests; touches nothing
node tools/audio/gen-music.mjs                    # 10 cues, 2 candidates each; writes tools/out/audio/raw/<id>-a|b.flac
node tools/audio/master-audio.mjs --audition      # trims, cuts to bars, normalises, encodes, writes public/audio and the manifest
npm run audio:gen                                 # gen + master in one go (without --audition)
```
`gen-music.mjs` flags: `--only bed-battle,charge`, `--candidates 1|2`, `--limit n`, `--base <url>`, `--force` (regenerates and archives the old takes to `tools/out/audio/raw/archive/<time>/`), `--timeout <sec>`. Re-running it makes **zero requests** when every raw file already exists, so an interrupted run resumes where it stopped. `master-audio.mjs` flags: `--only`, `--ffmpeg <path>`, `--audition`, `--pick id=a|b,...`, `--prune`, `--seam-fade-ms`, `--jobs`, `--dry-run`. Ctrl-C during generation cancels the running studio job.

**Expected time (estimate, not measured on the real studio):** the KB measured about 11 s for a cold 30 s ACE-Step take and about 8 s for a warm 40 s one, and 5 s for two 6 s effects. With `batch: 2` and 16 to 68 s takes, plan for **roughly 5 to 10 minutes of GPU time** for all ten cues, plus a model switch between the music and effects jobs, and 1 to 2 minutes of ffmpeg for mastering (CPU only; it can run after the studio is stopped).

**What it does to each file** (section 5): trims the head silence so the first sound is at 0.000 s; cuts a loop to exactly `bars x beatsPerBar x 60 / bpm` seconds (rounded to the nearest sample) with a 10 ms declick; keeps a jingle's natural tail; loudnorm two-pass to the targets (−16 LUFS beds and the charge layer, −14 jingles; effects peak −3 dBFS); encodes OGG q5 and M4A 160k from the same normalised file; re-measures the **decoded OGG and M4A** and trims the gain and re-encodes if the lossy file overshoots the peak limit. It trusts the requested BPM and runs only a rough onset/autocorrelation check, which **warns** when it disagrees by more than 2.5 percent. `tools/out/audio/report.json` has, per file: LUFS, loudness range, true peak, sample peak, RMS, **crest factor**, length (samples and seconds), the first-sound offset, the tempo check, the seed and prompt, and every warning.

**Then, by ear:**
1. `master-audio.mjs --audition` lists the candidate that is not picked as an extra manifest track (`<id>-b`), so `npm run dev` then `http://localhost:5173/sounds.html` shows **both takes of every cue** as separate rows with Play/Stop, and the charge demo uses the picked one. (The `sounds.html` page reads only `manifest.json`; `public/audio/candidates.json` records the choice and the measurements per candidate and is not read by the game, because `normalizeManifest` keeps only the fields in `TrackEntry`.)
2. Listen: loop seams (does the battle bed repeat cleanly?), the charge layer over the battle bed (does it lock on the beat and leave the low end to the drums?), the two stingers, the jingles' endings. Compare each pair and choose.
3. Make the choice permanent and drop the losers: `node tools/audio/master-audio.mjs --pick bed-battle=b,impact=b --prune` (cues not named keep candidate `a`; `--prune` deletes every unpicked candidate file and rewrites the manifest without the audition rows). Do not commit audition mode: the unpicked files would ship to GitHub Pages (the budget in section 5 is about 5 MB).
4. Commit `public/audio/*.ogg`, `*.m4a`, `manifest.json` and `candidates.json`, plus the verification lines from `report.json` in the commit message or the delivery report, and the line "not verified by ear" until the owner has signed off. Raw FLACs and `tools/out/` stay out of the repo (they are git-ignored).
5. **Stop the Audio Studio and any ComfyUI it started** when finished (KB rule 17). Do not use `taskkill /F /IM node.exe`; it kills every studio.

If a cue sounds wrong, change its prompt or `seed` in `music-cues.json`, run `gen-music.mjs --only <id> --force` (the old takes are archived), then `master-audio.mjs --only <id>`. To compare against what the studio actually received, `tools/out/audio/raw/generation-log.json` stores the full request (prompt with exclusions, seed, bpm, key), the job id and the file names per cue.

**Trying it without the PC:** `node tools/audio/fake-audio-studio.mjs --port 7891`, then `node tools/audio/gen-music.mjs --base http://localhost:7891 --out tools/out/audio-fake` and `node tools/audio/master-audio.mjs --out tools/out/audio-fake --public tools/out/audio-fake/public`. The fake output is a click track, not music: **never copy it into `public/audio`**.

---

## 8. Where it is checked

- **By ear (owner), on `sounds.html`:** every manifest entry with Play/Stop; "no file yet" rows for empty slots; the **Charge overlay demo** (battle bed, cut-in start at 4 s, cut-in end 7 s later) with live gain meters for the bed and the charge layer and the phase-lock beat. The cinema page (`cinema.html`) plays the battle bed and lays the charge layer over each scene. **Nothing in this document has been verified by ear.**
- **By machine:** `tests/unit/audio-runner.test.ts` (the section 7 runner against the fake studio: bar-aligned lengths, loudness, manifest validity, idempotency, dry run), `tests/unit/audio-director.test.ts` (ramps, phase-lock maths, chains, failsafe, silence), `tests/unit/audio-support.test.ts` (manifest, settings, moods), `tests/e2e/audio.spec.ts` (pages load with 0 errors, the settings panel opens, and a real `AudioContext` run with a generated click track proves the duck, the lock and the release on the audio clock).

## Generated files (batch 1)

Generated 2026-11-01 on the owner's PC with the Audio Studio (ACE-Step 1.5 turbo for music, Stable Audio Open 1.0 for the two effects) through `tools/audio/gen-music.mjs` (its first run against the real studio; 10 jobs, 0 failures, about 3 minutes of GPU time, 66 s for the cold first job and 5 to 16 s each after) and `tools/audio/master-audio.mjs --audition` (ffmpeg 9.0.2). Both candidates of every cue are in `public/audio/` as `<id>-a` and `<id>-b` (OGG q5 plus M4A 160k); the manifest points every cue id at candidate **a**, and the `<id>-b` rows let `sounds.html` play the alternative. The two together are 9.7 MB of OGG and 12 MB of M4A, over the 5 MB budget in section 5; `master-audio.mjs --pick ... --prune` after the listening pass drops the losers. Raw FLAC masters stay in `tools/out/audio/raw/` (git-ignored). Seeds are those in `music-cues.json`; the studio returned both takes of a cue from the one seeded `batch: 2` job. Full numbers per file (LRA, sample peak, RMS, first-sound offset, tempo confidence) are in `tools/out/audio/report.json` and `public/audio/candidates.json`.

**Every row is not verified by ear.** Measured from the decoded OGG; lengths are the bar-exact loop lengths from section 2 (jingles and effects keep their tails or the `keepSeconds` window).

| Cue | Take | Seed | Length (s) | Bars | LUFS | True peak (dBTP) | Crest (dB) | BPM requested (rough check) | Target | Mastering warnings | By ear |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `bed-title` | a | 31101 | 53.333 | 16 | -17.6 | -6.5 | 23.1 | 72 (rough check 68.2, drift -5.3%) | -16 LUFS | rough tempo check says 68.2 BPM vs requested 72; check the grid by ear or time-stretch before trusting the loop; loudness -17.6 LUFS is more than 1 LU from the -16 target | not verified by ear |
| `bed-title` | b | 31101 | 53.333 | 16 | -16.6 | -1.0 | 26.7 | 72 (rough check 75.0, drift +4.2%) | -16 LUFS | rough tempo check says 75 BPM vs requested 72; check the grid by ear or time-stretch before trusting the loop | not verified by ear |
| `bed-calm` | a | 31102 | 42.667 | 16 | -15.9 | -1.4 | 17.8 | 90 (rough check 89.9, drift -0.2%) | -16 LUFS | the take starts 1.03 s late; the lead-in was trimmed (check that bar 1 still lands on the downbeat) | not verified by ear |
| `bed-calm` | b | 31102 | 42.667 | 16 | -16.2 | -1.2 | 18.5 | 90 (rough check 90.0, drift +0.0%) | -16 LUFS | the take starts 1.03 s late; the lead-in was trimmed (check that bar 1 still lands on the downbeat) | not verified by ear |
| `bed-camp` | a | 31103 | 50.526 | 16 | -16.0 | -1.3 | 15.7 | 76 (rough check 76.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `bed-camp` | b | 31103 | 50.526 | 16 | -15.9 | -1.2 | 15.8 | 76 (rough check 76.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `bed-battle` | a | 31104 | 64.000 | 32 | -16.0 | -3.0 | 16.6 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `bed-battle` | b | 31104 | 64.000 | 32 | -18.0 | -2.9 | 17.8 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS | gain trimmed by -2.1 dB after encoding to keep the peak in bounds; loudness -18 LUFS is more than 1 LU from the -16 target | not verified by ear |
| `bed-tense` | a | 31105 | 32.000 | 16 | -18.9 | -3.6 | 16.5 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS | gain trimmed by -2.9 dB after encoding to keep the peak in bounds; loudness -18.9 LUFS is more than 1 LU from the -16 target | not verified by ear |
| `bed-tense` | b | 31105 | 32.000 | 16 | -15.8 | -2.0 | 15.2 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `charge` | a | 31106 | 16.000 | 8 | -16.5 | -3.2 | 14.7 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `charge` | b | 31106 | 16.000 | 8 | -16.2 | -2.6 | 16.1 | 120 (rough check 120.0, drift +0.0%) | -16 LUFS |  | not verified by ear |
| `jingle-victory` | a | 31107 | 14.400 | 6 | -14.0 | -1.3 | 16.5 | 100 (rough check 100.0, drift +0.0%) | -14 LUFS |  | not verified by ear |
| `jingle-victory` | b | 31107 | 14.400 | 6 | -14.0 | -2.3 | 15.5 | 100 (rough check 100.0, drift +0.0%) | -14 LUFS |  | not verified by ear |
| `jingle-defeat` | a | 31108 | 14.545 | 4 | -14.1 | -1.4 | 20.4 | 66 (rough check 62.6, drift -5.2%) | -14 LUFS | rough tempo check says 62.6 BPM vs requested 66; check the grid by ear or time-stretch before trusting the loop | not verified by ear |
| `jingle-defeat` | b | 31108 | 14.545 | 4 | -13.9 | -1.7 | 22.4 | 66 (rough check 66.7, drift +1.0%) | -14 LUFS |  | not verified by ear |
| `impact` | a | 31109 | 1.000 | – | -11.7 | -2.9 | 6.7 | – | peak -3 dBFS |  | not verified by ear |
| `impact` | b | 31109 | 1.000 | – | -12.0 | -3.0 | 6.4 | – | peak -3 dBFS |  | not verified by ear |
| `seal` | a | 31110 | 0.600 | – | -22.2 | -2.8 | 20.7 | – | peak -3 dBFS |  | not verified by ear |
| `seal` | b | 31110 | 0.600 | – | -19.8 | -6.0 | 18.8 | – | peak -3 dBFS | gain trimmed by -3.2 dB after encoding to keep the peak in bounds | not verified by ear |

Things to listen for first (from the numbers, not the sound): `bed-title-a` sits 1.6 LU under target with a −6.5 dBTP peak and the tempo check reads 68 BPM, so its grid may be off; `bed-tense-a` and `bed-battle-b` were pulled down after encoding to keep the peak in bounds and land 2 to 3 LU quiet, so if they are picked raise `gainDb` by ear; `bed-calm` both takes started 1.03 s late and were trimmed, so check bar 1 lands on the downbeat; `jingle-defeat-a` reads 62.6 BPM against 66 (a tail-only one-shot, so only the feel matters); `seal-b` was trimmed −3.2 dB. The two effects have crest factors of 6.4 to 6.7 dB (`impact`) and 18.8 to 20.7 dB (`seal`).

Checked by machine on 2026-11-01 (dev server, `sounds.html`): all 20 manifest entries fetch and decode in Chromium at the lengths above; every slot shows 2 files; the charge overlay demo with the real `bed-battle-a` and `charge-a` files ducks the bed to a level of 0.501 (−6 dB) at cut-in start, brings the charge layer to 1.0 phase-locked on a downbeat (`beatInBar` 0), and returns the bed to 1.0 with the layer idle after cut-in end; 0 console errors, 0 failed audio requests. `npm run typecheck` and `npm run build` pass. `npm test` has 3 failures on this PC that predate the batch and are outside it: two in `tests/unit/portraits.test.ts` (the Hugging Face generator's dry run prints nothing here) and one in `tests/unit/audio-runner.test.ts` (the fake studio's `impact` effect masters to −5.5 dBFS against the −3 dBFS target; the real `impact` takes land at −2.9 and −3.0 dBTP). Nothing here is verified by ear.

## Revision log
- v0.1 2026-11-01: first brief and system.
- v0.2 2026-11-01: section 7 (the generation runner); section 5 aligned with it (jingles −14 LUFS, 10 ms loop declick, M4A 160 kbps, `<id>-a|b` candidate names); the old section 7 is now section 8.
- v0.3 2026-11-01: "Generated files (batch 1)": the first real run, 10 cues x 2 takes, measurements, not verified by ear.
