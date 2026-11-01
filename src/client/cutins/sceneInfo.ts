// Static facts about each cut-in scene that the planner, the player and the scene builders all share (docs/spec/51).
// Pure data: no three, no React.
import type { SceneId } from './plan'

export interface SceneInfo {
  id: SceneId
  /** Review-page label and the title slip used when the stratagem has no name of its own. */
  title: string
  /** Full scenes are 3-7 s and play for stratagems and chains; short scenes are for normal attacks. */
  full: boolean
  duration: number
  /** Figures standing in the defender front rank: falls = max(1, round(damage / troops x this)). */
  front: number
  /** Defender figures that can fall in this scene (the whole formation); the crowd pass raises it. */
  defenders: number
  /** Seal glyph stamped at the end. */
  glyph: string
  /** Chain links 2+ skip the dive and start here (the end of the dive beat). */
  skipTo: number
  /** Non-final chain links end here (the start of the pull-out beat), freezing on the wide shot for the seal interstitial. */
  cutAt: number
  /** Story time the board result lands: the camera is rising out again. */
  resultAt: number
}

const info = (i: SceneInfo): SceneInfo => i

export const SCENE_INFO: Record<SceneId, SceneInfo> = {
  A: info({ id: 'A', title: 'Fire Arrows', full: true, duration: 7.0, front: 7, defenders: 7, glyph: '火', skipTo: 0.7, cutAt: 5.6, resultAt: 5.9 }),
  Ap: info({ id: 'Ap', title: 'Volley', full: true, duration: 7.0, front: 7, defenders: 7, glyph: '箭', skipTo: 0.7, cutAt: 5.6, resultAt: 5.9 }),
  B: info({ id: 'B', title: 'Thundering Charge', full: true, duration: 7.0, front: 7, defenders: 7, glyph: '衝', skipTo: 0.6, cutAt: 5.8, resultAt: 6.0 }),
  C: info({ id: 'C', title: 'Duel Strike', full: true, duration: 6.0, front: 7, defenders: 13, glyph: '斬', skipTo: 0.6, cutAt: 4.8, resultAt: 5.1 }),
  D: info({ id: 'D', title: 'Thunder Roar', full: true, duration: 6.0, front: 7, defenders: 7, glyph: '吼', skipTo: 0.6, cutAt: 5.0, resultAt: 5.2 }),
  R: info({ id: 'R', title: 'Ruse', full: true, duration: 3.0, front: 4, defenders: 4, glyph: '計', skipTo: 0.5, cutAt: 2.4, resultAt: 2.5 }),
  W: info({ id: 'W', title: 'Wind', full: true, duration: 3.0, front: 0, defenders: 0, glyph: '風', skipTo: 0.5, cutAt: 2.4, resultAt: 2.5 }),
  'S-melee': info({ id: 'S-melee', title: 'Melee', full: false, duration: 2.7, front: 5, defenders: 5, glyph: '擊', skipTo: 0.3, cutAt: 2.4, resultAt: 2.4 }),
  'S-cavalry': info({ id: 'S-cavalry', title: 'Cavalry', full: false, duration: 2.7, front: 5, defenders: 5, glyph: '騎', skipTo: 0.3, cutAt: 2.4, resultAt: 2.4 }),
  'S-archer': info({ id: 'S-archer', title: 'Archers', full: false, duration: 2.4, front: 5, defenders: 5, glyph: '射', skipTo: 0.3, cutAt: 2.1, resultAt: 2.1 }),
}

/** Links 2 and later play at about 60% of their length (docs/spec/51 "Chains"). */
export const CHAIN_COMPRESS = 0.6
/** The seal-stamp interstitial between links, seconds. */
export const INTERSTITIAL = 0.4
/** The board canvas shows through again over this many seconds at the very end. */
export const FADE_OUT = 0.35
