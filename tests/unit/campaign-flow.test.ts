// The campaign flow store end to end, without a browser: title -> prologue -> briefing -> deploy -> battle -> results -> camp -> battle 2,
// saves and Continue, defeat and retry. The battle is played with the utility AI on both sides through the public store actions.
import { describe, expect, it } from 'vitest'
import { decide } from '../../src/ai/decider'
import { createMemoryStorage, loadCampaign, SAVE_KEY, PREBATTLE_KEY } from '../../src/campaign'
import { setCampaignStorage, useCampaign } from '../../src/client/store/campaign'
import { useGame } from '../../src/client/store/game'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const g = () => useGame.getState()
const c = () => useCampaign.getState()

async function play(mode: 'win' | 'lose'): Promise<void> {
  g().setSpeed('instant')
  let n = 0
  const t0 = Date.now()
  while (g().screen === 'battle' && Date.now() - t0 < 100_000) {
    const st = g()
    if (!st.playing && !st.state.result && st.state.side === 'han') {
      st.act(mode === 'win' ? decide(st.state, { tier: 'normal', seed: st.state.seed + n++, budgetMs: 60 }).action : { type: 'endPhase' })
    }
    await sleep(1)
  }
}

describe('C-FLOW the campaign flow', () => {
  it('C-FLOW-1 title to results to camp to battle 2, with autosave and Continue', async () => {
    const mem = createMemoryStorage()
    setCampaignStorage(mem)
    // new campaign: the prologue scene plays over the table, Skip scene goes to the briefing
    const camp0 = c().startNew(false, 5)
    expect(camp0.battleIndex).toBe(0)
    expect(g().screen).toBe('scene')
    expect(c().scene?.kind).toBe('prologue')
    expect(c().scene!.lines.length).toBeGreaterThan(0)
    expect(mem.getItem(SAVE_KEY)).not.toBeNull()
    expect(mem.getItem(PREBATTLE_KEY)).not.toBeNull()
    c().skipScene()
    expect(g().screen).toBe('cbrief')
    expect(g().state.battleId).toBe('daxing-hill')
    // briefing -> pre-battle scene -> deploy: the three required officers are locked in, two places stay free
    c().afterBriefing()
    expect(g().screen).toBe('scene')
    expect(c().scene?.kind).toBe('pre')
    c().skipScene()
    expect(g().screen).toBe('deploy')
    expect(c().deployMarkers.map((m) => [m.n, m.officer !== null])).toEqual([[1, true], [2, true], [3, true], [4, false], [5, false]])
    expect(g().state.units.filter((u) => u.side === 'han').map((u) => u.id).sort()).toEqual(['guan-yu', 'jian-yong', 'liu-bei', 'zhang-fei', 'zou-jing'])
    // seal the orders: the campaign battle starts on the campaign's own deploy list
    c().seal()
    expect(g().screen).toBe('battle')
    expect(g().mode).toBe('campaign')
    await play('win')
    expect(c().report?.won).toBe(true)
    // post-battle scene, then results (autosaved already)
    expect(g().screen).toBe('scene')
    expect(c().scene?.kind).toBe('post')
    const saved = loadCampaign(mem)
    expect(saved.ok && saved.state.battleIndex).toBe(1)
    c().skipScene()
    expect(g().screen).toBe('results')
    const r = c().report!
    expect(r.xp.length).toBeGreaterThan(0)
    expect(r.xp.every((x) => x.gained >= 20)).toBe(true)
    expect(r.joined).toEqual(['jian-yong'])
    expect(c().campaign!.provisions).toBe(r.provisions.total)
    // camp: roster, provisions, drill one officer
    c().afterResults()
    expect(g().screen).toBe('camp')
    const before = c().campaign!
    const xp0 = before.roster.find((x) => x.officerId === 'guan-yu')!.xp
    c().drill('guan-yu')
    const after = c().campaign!
    expect(after.provisions).toBe(before.provisions - 60)
    expect(after.camp.drilled).toEqual(['guan-yu'])
    expect(after.roster.find((x) => x.officerId === 'guan-yu')!.xp).toBe((xp0 + 50) % 100)
    c().drill('guan-yu')
    expect(c().campNote).toBe('Already drilled in this camp')
    // Continue resumes at the camp with the spending kept
    g().go('title')
    useCampaign.setState({ campaign: null })
    expect(c().continueSave()).toBe(true)
    expect(g().screen).toBe('camp')
    expect(c().campaign!.provisions).toBe(after.provisions)
    // to the field -> briefing 2 -> deploy 2: the board is the battle-2 map
    c().openBriefing()
    expect(g().state.battleId).toBe('qingzhou')
    c().afterBriefing()
    if (g().screen === 'scene') c().skipScene()
    expect(g().screen).toBe('deploy')
    c().seal()
    expect(g().state.battleId).toBe('qingzhou')
    expect(g().scene.width).toBe(g().state.grid.width)
    expect(g().state.grid.width).toBe(10)
    expect(g().state.grid.height).toBe(8)
  }, 150_000)

  it('C-FLOW-2 a defeat offers Retry, which restores the pre-camp snapshot and changes the battle seed', async () => {
    const mem = createMemoryStorage()
    setCampaignStorage(mem)
    c().startNew(false, 9)
    c().skipScene()
    c().afterBriefing()
    if (g().screen === 'scene') c().skipScene()
    c().seal()
    await play('win')
    c().skipScene()
    c().afterResults()
    expect(g().screen).toBe('camp')
    const snapshot = c().campaign!
    c().drill('liu-bei')
    expect(c().campaign!.provisions).toBe(snapshot.provisions - 60)
    c().openBriefing()
    c().afterBriefing()
    if (g().screen === 'scene') c().skipScene()
    const seed1 = g().seed
    c().seal()
    await play('lose')
    expect(g().screen).toBe('defeat')
    expect(c().defeat?.battleId).toBe('qingzhou')
    expect(c().retry()).toBe(true)
    expect(g().screen).toBe('camp')
    expect(c().campaign!.provisions).toBe(snapshot.provisions)
    expect(c().campaign!.camp.drilled).toEqual([])
    expect(c().attempt).toBe(1)
    c().openBriefing()
    c().afterBriefing()
    if (g().screen === 'scene') c().skipScene()
    c().seal()
    expect(g().seed).not.toBe(seed1)
  }, 200_000)

  it('C-FLOW-3 without storage the campaign still runs and nothing throws', () => {
    setCampaignStorage(null)
    expect(() => c().startNew(true, 3)).not.toThrow()
    expect(c().campaign!.ironOath).toBe(true)
    expect(g().screen).toBe('scene')
    c().skipScene()
    c().afterBriefing()
    if (g().screen === 'scene') c().skipScene()
    expect(g().screen).toBe('deploy')
    expect(c().continueSave()).toBe(false)
    expect(c().storageOk).toBe(false)
  })
})
