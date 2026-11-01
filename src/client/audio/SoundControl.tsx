// Volume panel in the sand-table skin: master / music / effects sliders and a mute slip. No native tooltips (aria-labels
// only) and no "OK" labels. `SoundButton` is the popover for the title and the battle top bar; `SoundPanel` is the body,
// also used inline on the cinema and audition pages.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { audio, type AudioStatus } from './index'
import { BATTLE_SCENE_CHOICES, ENEMY_SCENE_CHOICES, useCutinSettings } from '../cutins/settings'
import './audio.css'

export function useAudioStatus(): AudioStatus {
  return useSyncExternalStore(audio.subscribe, () => audio.status(), () => audio.status())
}

/** One line saying what the music is doing, for the panel. */
export function musicNote(s: AudioStatus): string {
  if (!s.manifestReady) return 'Music: checking files'
  if (s.trackCount === 0) return 'Music: files pending'
  if (s.ctx === 'none') return 'Music: touch the page to start'
  if (s.ctx !== 'running') return 'Music: paused by the browser'
  return `Music: ${s.trackCount} ${s.trackCount === 1 ? 'track' : 'tracks'} ready`
}

const ROWS = [
  { key: 'master', label: 'Master' },
  { key: 'music', label: 'Music' },
  { key: 'sfx', label: 'Effects' },
] as const

/** The two cut-in settings (docs/spec/51): what plays for my battles and what plays for the enemy's. */
export function SceneSettings() {
  const { battleScenes, enemyScenes, setBattleScenes, setEnemyScenes } = useCutinSettings()
  return (
    <div className="snd-scenes" data-testid="scene-settings">
      <div className="snd-group" role="group" aria-label="Battle scenes">
        <span className="snd-label">Battle scenes</span>
        {BATTLE_SCENE_CHOICES.map((c) => (
          <button key={c.value} type="button" className="snd-choice" aria-pressed={battleScenes === c.value} data-testid={`battle-scenes-${c.value}`} onClick={() => setBattleScenes(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="snd-group" role="group" aria-label="Enemy scenes">
        <span className="snd-label">Enemy scenes</span>
        {ENEMY_SCENE_CHOICES.map((c) => (
          <button key={c.value} type="button" className="snd-choice" aria-pressed={enemyScenes === c.value} data-testid={`enemy-scenes-${c.value}`} onClick={() => setEnemyScenes(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SoundPanel({ note = true, scenes = false }: { note?: boolean; scenes?: boolean }) {
  const s = useAudioStatus()
  const st = s.settings
  return (
    <div className="snd-panel" data-testid="sound-panel" data-sound-ui>
      {ROWS.map((r) => (
        <label key={r.key} className="snd-row">
          <span className="snd-label">{r.label}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(st[r.key] * 100)}
            aria-label={`${r.label} volume`}
            data-testid={`vol-${r.key}`}
            onChange={(e) => audio.setSettings({ [r.key]: Number(e.target.value) / 100 })}
          />
          <span className="snd-val">{Math.round(st[r.key] * 100)}</span>
        </label>
      ))}
      <div className="snd-foot">
        <button type="button" className="snd-mute" aria-pressed={st.muted} data-testid="sound-mute" onClick={() => audio.setSettings({ muted: !st.muted })}>
          {st.muted ? 'Unmute' : 'Mute'}
        </button>
        {note && (
          <span className="snd-note" data-testid="music-note">
            {musicNote(s)}
          </span>
        )}
      </div>
      {scenes && <SceneSettings />}
    </div>
  )
}

/** A "Sound" slip that opens the panel. `placement` says which way the popover opens. */
export function SoundButton({ placement = 'below', className = '' }: { placement?: 'below' | 'above'; className?: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const muted = useAudioStatus().settings.muted
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent): void => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <span ref={wrap} className={`snd-wrap ${className}`} data-sound-ui>
      <button type="button" className={`snd-btn${open ? ' on' : ''}`} aria-expanded={open} aria-haspopup="dialog" aria-label="Sound settings" data-testid="sound-btn" onClick={() => setOpen(!open)}>
        <span className="snd-full">{muted ? 'Sound off' : 'Sound'}</span>
        <span className="snd-icon" aria-hidden="true">
          {muted ? '×' : '♪'}
        </span>
      </button>
      {open && (
        <div className={`snd-pop ${placement}`} role="dialog" aria-label="Sound settings">
          <h3>Sound and scenes</h3>
          <SoundPanel scenes />
        </div>
      )}
    </span>
  )
}
