// `?test=1` campaign helpers, merged into window.__game. They use only the public stores and the engine's public API
// (`act`, the greedy bot); nothing here mutates an engine state.
//
//   newCampaign(seed?, ironOath?)  start a campaign exactly as the New campaign button does (saves, shows the prologue); returns the CampaignState
//   campaignState()                the live CampaignState (null before a campaign)
//   campaignReport()               the BattleReport of the last battle, or null
//   goTo(screen)                   jump to a campaign screen that has its data: 'title' | 'briefing' | 'camp' | 'deploy' | 'scene' | 'prologue' | 'results' | 'defeat' | 'summary'; returns false when it cannot
//   autoWin()                      play the current campaign battle at Instant speed with the utility AI (tier normal) on the player's side (the enemy
//                                  side is already the store's utility bot) until the battle ends; resolves 'won' | 'lost' | 'stalled'. It can lose:
//                                  it is a bot, and it never edits a state. Speed is restored afterwards.
//   autoLose()                     the same loop, but the player's side only ends its phase, so the battle is lost on the round limit or by the objective.
//   pickDeploy(ids)                set the optional deploy picks (needs the deploy screen)
//   campaignScreenData()           { screen, battleId, index } for assertions
import { decide } from '../../ai/decider'
import { greedyAction } from '../../ai/greedy'
import type { Action, BattleState } from '../../engine'
import { currentBattleId } from '../../campaign'
import { useCampaign } from '../store/campaign'
import { useGame } from '../store/game'
import { PLAYER_SIDE } from '../store/orders'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The player's side played by the same utility AI that plays the enemy (greedy if it ever throws). */
function botAction(state: BattleState, n: number): Action {
  try {
    return decide(state, { tier: 'normal', seed: state.seed + n, budgetMs: 150 }).action
  } catch {
    return greedyAction(state)
  }
}

async function autoPlay(mode: 'win' | 'lose'): Promise<'won' | 'lost' | 'stalled'> {
  const first = useGame.getState()
  if (first.screen !== 'battle') return 'stalled'
  const prev = first.speed
  first.setSpeed('instant')
  const t0 = Date.now()
  let n = 0
  while (Date.now() - t0 < 200_000) {
    const st = useGame.getState()
    if (st.screen !== 'battle') break
    if (!st.playing && !st.state.result && st.state.side === PLAYER_SIDE) {
      st.act(mode === 'win' ? botAction(st.state, n++) : { type: 'endPhase' })
    }
    await sleep(2)
  }
  useGame.getState().setSpeed(prev)
  const c = useCampaign.getState()
  if (useGame.getState().screen === 'battle') return 'stalled'
  return c.report?.won ? 'won' : 'lost'
}

export function installCampaignHook(): Record<string, unknown> {
  const c = (): ReturnType<typeof useCampaign.getState> => useCampaign.getState()
  const g = (): ReturnType<typeof useGame.getState> => useGame.getState()
  return {
    newCampaign: (seed = 1, ironOath = false) => c().startNew(ironOath, seed),
    campaignState: () => c().campaign,
    campaignReport: () => c().report,
    campaignScreenData: () => {
      const camp = c().campaign
      return { screen: g().screen, battleId: camp ? (currentBattleId(camp) ?? null) : null, index: camp?.battleIndex ?? null, mode: g().mode }
    },
    goTo: (screen: string): boolean => {
      const camp = c().campaign
      switch (screen) {
        case 'title':
          c().toTitle()
          return true
        case 'briefing':
        case 'cbrief':
          if (!camp) return false
          c().openBriefing()
          return true
        case 'camp':
          if (!camp) return false
          c().openCamp()
          return true
        case 'deploy':
          if (!camp) return false
          c().openDeploy()
          return true
        case 'scene': {
          const id = camp ? currentBattleId(camp) : undefined
          if (!id) return false
          c().startScene('pre', id)
          return true
        }
        case 'prologue':
          c().startScene('prologue', '')
          return true
        case 'results':
          if (!c().report || !camp) return false
          g().go('results')
          return true
        case 'defeat':
          if (!c().defeat) return false
          g().go('defeat')
          return true
        case 'summary':
          if (!camp) return false
          g().go('summary')
          return true
        default:
          return false
      }
    },
    pickDeploy: (ids: string[]) => {
      const cur = c().picks
      for (const id of cur) if (!ids.includes(id)) c().togglePick(id)
      for (const id of ids) if (!c().picks.includes(id)) c().togglePick(id)
    },
    autoWin: () => autoPlay('win'),
    autoLose: () => autoPlay('lose'),
  }
}
