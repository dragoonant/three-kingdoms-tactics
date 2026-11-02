// The Roads to War store end to end, without a browser: new run -> prologue -> the Zhuo notice -> market -> road -> Daxing Hill ->
// deploy -> a real battle (greedy bot vs the random tier) -> report -> on, with autosave and Continue.
import { describe, expect, it } from 'vitest'
import { greedyAction } from '../../src/ai/greedy'
import { createMemoryStorage } from '../../src/campaign'
import { setBotTier, useGame } from '../../src/client/store/game'
import { setRunStorage, useRun, viewOf } from '../../src/client/run/store'
import { loadRun, RUN_SAVE_KEY } from '../../src/run'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const g = () => useGame.getState()
const r = () => useRun.getState()
const view = () => viewOf(r().run, r().slips, r().report)

async function play(): Promise<void> {
  g().setSpeed('instant')
  const t0 = Date.now()
  while (g().screen === 'battle' && Date.now() - t0 < 100_000) {
    const st = g()
    if (!st.playing && !st.state.result && st.state.side === 'han') {
      const res = st.act(greedyAction(st.state))
      if (!res.ok) st.act({ type: 'endPhase' })
    }
    await sleep(1)
  }
}

setBotTier('random')

describe('RL-FLOW the run flow', () => {
  it('[RL-SAVE-1] [RL-DEPLOY-3] new run to the first battle and back to the road, with autosave and Continue', async () => {
    const mem = createMemoryStorage()
    setRunStorage(mem)
    const s0 = r().startNew(5, false)
    expect(s0.phase).toBe('prologue')
    expect(g().screen).toBe('run')
    expect(view()).toBe('slips')
    expect(r().slips!.title).toBe('The Peach Garden')
    r().skipSlips()
    // the Zhuo notice: its slips first, then the choices
    expect(view()).toBe('slips')
    expect(r().slips!.key.startsWith('zhuo-notice')).toBe(true)
    r().skipSlips()
    expect(view()).toBe('stop')
    r().pick('estate')
    r().seal()
    expect(r().run!.soldiers).toBe(2400) // +600 from the estate, +300 volunteers (Renown 30)
    expect(view()).toBe('market')
    r().hire(0)
    expect(view()).toBe('road')
    expect(mem.getItem(RUN_SAVE_KEY)).not.toBeNull()
    r().travel(0, false)
    expect(r().run!.stop!.id).toBe('daxing-hill')
    r().skipSlips()
    r().pick('fight')
    r().seal()
    expect(view()).toBe('deploy')
    expect(r().picks[0]!.id).toBe('liu-bei')
    const rice0 = r().run!.rice
    r().sealDeploy()
    expect(g().screen).toBe('battle')
    expect(g().mode).toBe('run')
    expect(g().state.battleId).toBe('daxing-hill')
    expect(r().run!.rice).toBeLessThan(rice0)
    // a reload in the middle of the battle restarts it with the same seed
    const saved = loadRun(mem)
    expect(saved.ok && saved.state.phase).toBe('battle')
    await play()
    expect(g().screen).toBe('run')
    expect(view()).toBe('report')
    const rep = r().report!
    expect(rep.battleId).toBe('daxing-hill')
    if (rep.won) {
      expect(rep.officers.every((o) => o.mark !== 'none' || o.xp >= 20)).toBe(true)
      r().afterReport()
      expect(['market', 'road']).toContain(view())
      expect(r().run!.band.some((o) => o.rec.officerId === 'jian-yong')).toBe(true)
      // Continue picks the run up where it was saved
      useRun.setState({ run: null })
      expect(r().continueRun()).toBe(true)
      expect(['market', 'road']).toContain(view())
    } else {
      r().afterReport()
      expect(view()).toBe('end')
      expect(r().annals.length).toBe(1)
    }
  }, 120_000)
})
