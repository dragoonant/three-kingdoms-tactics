// Audition page: every manifest entry with play/stop, "no file yet" rows for empty slots, and the charge overlay demo with
// live gain meters. Music is judged by ear here (KB rule 9); this page only makes that possible. Not verified by ear.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { audio } from '../client/audio'
import { CHARGE_DEMO, CueSheet } from '../client/audio/demoScript'
import { entriesForSlot, gainToDb, SLOTS, type TrackEntry } from '../client/audio/manifest'
import { SoundPanel, useAudioStatus } from '../client/audio/SoundControl'
import '../client/theme.css'
import './sounds.css'

const db = (g: number): string => (g <= 1e-4 ? '-inf dB' : `${gainToDb(g).toFixed(1)} dB`)

function Meter({ label, value, testid }: { label: string; value: number; testid: string }) {
  // 0 dB is full scale on the bar; -30 dB and below is empty.
  const pct = value <= 1e-4 ? 0 : Math.max(0, Math.min(100, ((gainToDb(value) + 30) / 30) * 100))
  return (
    <div className="meter" data-testid={testid}>
      <span className="m-label">{label}</span>
      <span className="m-track">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="m-val">{db(value)}</span>
    </div>
  )
}

function Demo() {
  const sheet = useRef(new CueSheet(CHARGE_DEMO))
  const raf = useRef(0)
  const [, setTick] = useState(0)
  const [step, setStep] = useState('idle')
  const [running, setRunning] = useState(false)
  const status = useAudioStatus()

  const loop = useCallback(() => {
    const now = audio.now()
    for (const s of sheet.current.poll(now)) {
      setStep(s.label)
      if (s.label === 'bed') audio.setMood('battle')
      else if (s.label === 'cutinStart') audio.cutinStart('full', 7)
      else if (s.label === 'cutinEnd') audio.cutinEnd()
    }
    setTick((n) => n + 1)
    if (sheet.current.running) raf.current = requestAnimationFrame(loop)
    else setRunning(false)
  }, [])

  const start = (): void => {
    cancelAnimationFrame(raf.current)
    audio.silence()
    sheet.current.start(audio.now())
    setRunning(true)
    setStep('starting')
    raf.current = requestAnimationFrame(loop)
  }
  const stop = (): void => {
    cancelAnimationFrame(raf.current)
    sheet.current.stop()
    audio.silence()
    setRunning(false)
    setStep('stopped')
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // Meters keep moving while the fades run out after the sheet ends.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100)
    return () => clearInterval(id)
  }, [])

  const lv = audio.levels()
  const dbg = audio.debug()
  const elapsed = sheet.current.elapsed(audio.now())
  return (
    <section className="card" data-testid="demo">
      <h2>
        Charge overlay demo<small>battle bed, cut-in start at 4 s, cut-in end 7 s later</small>
      </h2>
      <div className="demo-btns">
        <button type="button" className="slip" onClick={start} data-testid="demo-start">
          Charge overlay demo
        </button>
        <button type="button" className="slip" onClick={stop} disabled={!running && lv.bed + lv.charge < 1e-3} data-testid="demo-stop">
          Stop
        </button>
        <span className="demo-step" data-testid="demo-step">
          {running ? `${elapsed.toFixed(1)} s · ${step}` : step}
        </span>
      </div>
      <Meter label="Bed" value={lv.bed} testid="meter-bed" />
      <Meter label="Charge" value={lv.charge} testid="meter-charge" />
      <p className="note" data-testid="demo-state">
        {dbg ? `charge: ${dbg.charge}${dbg.ducked ? ', bed ducked' : ''}${dbg.lock ? `, locked to beat ${dbg.lock.beatIndex} (bar position ${dbg.lock.beatInBar + 1})` : ''}` : 'audio is not running yet (touch the page)'}
      </p>
      {status.trackCount === 0 && <p className="note warn">Nothing will sound until the files exist: the manifest is empty, so the meters stay at zero.</p>}
    </section>
  )
}

function Row({ t, fail, playing, onPlay, onStop }: { t: TrackEntry; fail: boolean; playing: boolean; onPlay: () => void; onStop: () => void }) {
  const loop = t.loopEnd > t.loopStart ? `${t.loopStart.toFixed(2)}–${t.loopEnd.toFixed(2)} s` : 'whole file'
  const bar = t.bpm > 0 && t.loopEnd > t.loopStart ? ((t.loopEnd - t.loopStart) / ((60 / t.bpm) * t.beatsPerBar)).toFixed(1) : null
  return (
    <tr data-testid={`track-${t.id}`}>
      <td>
        <b>{t.id}</b>
      </td>
      <td>{t.role + (t.mood ? ` · ${t.mood}` : '') + (t.cue ? ` · ${t.cue}` : '')}</td>
      <td>{t.file}</td>
      <td>{t.bpm > 0 ? `${t.bpm} BPM, ${t.beatsPerBar}/4` : '–'}</td>
      <td>{loop + (bar ? `, ${bar} bars` : '')}</td>
      <td>{t.gainDb.toFixed(1)} dB</td>
      <td className="act">
        {playing ? (
          <button type="button" className="slip small" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" className="slip small" onClick={onPlay}>
            Play
          </button>
        )}
        {fail && <span className="bad">file missing or undecodable</span>}
      </td>
    </tr>
  )
}

function Page() {
  const status = useAudioStatus()
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const tracks = audio.manifest.tracks
  const playing = audio.auditioning()
  const play = async (t: TrackEntry): Promise<void> => {
    const ok = await audio.audition(t)
    setFailed((f) => {
      const n = new Set(f)
      if (ok) n.delete(t.id)
      else n.add(t.id)
      return n
    })
  }
  return (
    <div className="page">
      <header className="head">
        <h1>
          Sound Audition<small>music, charge layer and stingers</small>
        </h1>
        <span className="stamp">Not verified by ear</span>
      </header>
      <main className="cols">
        <div className="col">
          <section className="card">
            <h2>
              Volume<small>saved in this browser</small>
            </h2>
            <SoundPanel />
            <p className="note" data-testid="ctx-state">
              Audio context: {status.ctx === 'none' ? 'not started (touch the page)' : status.ctx}
            </p>
          </section>
          <Demo />
        </div>
        <div className="col wide">
          <section className="card">
            <h2>
              Slots<small>what a full score fills</small>
            </h2>
            <ul className="slots" data-testid="slots">
              {SLOTS.map((s) => {
                const n = entriesForSlot(audio.manifest, s).length
                return (
                  <li key={s.key} className={n ? 'have' : 'none'} data-testid={`slot-${s.key}`}>
                    <span>{s.label}</span>
                    <em>{n ? `${n} ${n === 1 ? 'file' : 'files'}` : 'no file yet'}</em>
                  </li>
                )
              })}
            </ul>
          </section>
          <section className="card">
            <h2>
              Manifest entries<small>{status.manifestReady ? `${tracks.length} listed` : 'loading'}</small>
            </h2>
            {tracks.length === 0 ? (
              <p className="note" data-testid="no-tracks">
                The manifest is empty: no file yet. Add entries to public/audio/manifest.json (see docs/spec/60-audio.md).
              </p>
            ) : (
              <div className="scroll">
                <table data-testid="tracks">
                  <thead>
                    <tr>
                      <th>Id</th>
                      <th>Role</th>
                      <th>File</th>
                      <th>Tempo</th>
                      <th>Loop</th>
                      <th>Gain</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((t) => (
                      <Row key={t.id} t={t} fail={failed.has(t.id)} playing={playing.includes(t.id)} onPlay={() => void play(t)} onStop={() => audio.stopAudition(t.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Page />)
