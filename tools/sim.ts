// Headless random games with invariant checks after every step.
// Usage: tsx tools/sim.ts [games=200] [firstSeed=1] [battle=daxing-hill]
//        tsx tools/sim.ts --battle <id> [--games n] [--seed n]
//        tsx tools/sim.ts --all [--games n]      every registry battle, 50 games each, one summary line per battle
import { isDeepStrictEqual } from 'node:util'
import {
  EVENT_KINDS,
  createBattle,
  legalActions,
  replay,
  step,
  type Action,
  type BattleState,
  type GameEvent,
} from '../src/engine'
import { listBattleIds } from '../src/data'
import { checkInvariants, unitBudget } from './invariants'
import { chooseAction, makePolicyRng } from './policy'

interface Summary {
  battle: string
  failures: number
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const all = process.argv.includes('--all')
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--') && process.argv[process.argv.indexOf(a) - 1]?.startsWith('--') !== true)
  const games = Number(flag('games') ?? (all ? 50 : (positional[0] ?? 200)))
  const firstSeed = Number(flag('seed') ?? (all ? 1 : (positional[1] ?? 1)))
  if (all) {
    let failures = 0
    for (const id of listBattleIds()) failures += runBattle(id, games, firstSeed, true).failures
    console.log(`sim --all: battles=${listBattleIds().length} games=${games} each invariantFailures=${failures}`)
    if (failures > 0) process.exit(1)
    return
  }
  const battle = flag('battle') ?? positional[2] ?? 'daxing-hill'
  const r = runBattle(battle, games, firstSeed, false)
  if (r.failures > 0) process.exit(1)
}

function runBattle(battle: string, games: number, firstSeed: number, brief: boolean): Summary {
  const kinds = new Set<string>(EVENT_KINDS)

  const winners: Record<string, number> = {}
  const reasons: Record<string, number> = {}
  const chains: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  const counts: Record<string, number> = {}
  const bump = (k: string, n = 1): void => {
    counts[k] = (counts[k] ?? 0) + n
  }
  let totalRounds = 0
  let maxActions = 0
  let failures = 0
  const failureSamples: string[] = []
  const fail = (m: string): void => {
    failures++
    if (failureSamples.length < 12) failureSamples.push(m)
  }

  for (let g = 0; g < games; g++) {
    const seed = firstSeed + g
    const rnd = makePolicyRng(seed * 7919)
    let s = createBattle(battle, seed)
    const total = unitBudget(s)
    const log: Action[] = []
    const inv0 = checkInvariants(s, total)
    for (const m of inv0) fail(`seed ${seed} initial: ${m}`)
    tally(s.opening, kinds, bump, chains, fail, seed)
    let guard = 0
    while (!s.result && guard++ < 5000) {
      const legal = legalActions(s)
      const action = chooseAction(s, rnd, legal)
      const before = guard % 11 === 0 ? JSON.stringify(s) : null
      // sample: every legal action must be accepted by step
      if (guard % 7 === 0) {
        for (const a of legal) {
          const r = step(s, a)
          if (!r.ok) fail(`seed ${seed}: legal action rejected ${JSON.stringify(a)} -> ${r.code} ${r.message}`)
        }
      }
      const r = step(s, action)
      if (!r.ok) {
        fail(`seed ${seed}: chosen legal action rejected ${JSON.stringify(action)} -> ${r.code} ${r.message}`)
        break
      }
      if (before !== null && JSON.stringify(s) !== before) fail(`seed ${seed}: step mutated its input`)
      log.push(action)
      tally(r.events, kinds, bump, chains, fail, seed)
      s = r.state
      for (const m of checkInvariants(s, total)) fail(`seed ${seed} step ${log.length}: ${m}`)
    }
    if (!s.result) fail(`seed ${seed}: no result after ${guard} steps`)
    else {
      winners[s.result.winner] = (winners[s.result.winner] ?? 0) + 1
      reasons[s.result.reason] = (reasons[s.result.reason] ?? 0) + 1
    }
    totalRounds += s.round
    maxActions = Math.max(maxActions, log.length)
    const rep = replay(battle, seed, log)
    if (!isDeepStrictEqual(rep, s)) fail(`seed ${seed}: replay differs from live state`)
  }

  const chainStr = [1, 2, 3, 4].map((k) => `${k}:${chains[k]}`).join(' ')
  const win = Object.entries(winners).map(([k, v]) => `${k}=${v}`).join(' ')
  const v2Keys = ['retreated', 'escaped', 'reinforced', 'terrainChanged', 'timelineMessage', 'buffed', 'provoked', 'objectiveProgress']
  const v2 = brief ? ` v2[${v2Keys.map((k) => `${k}=${counts[k] ?? 0}`).join(' ')}]` : ''
  console.log(
    `sim${brief ? `[${battle}]` : ''}: games=${games} winners[${win}] reasons[${Object.entries(reasons).map(([k, v]) => `${k}=${v}`).join(' ')}] avgRounds=${(totalRounds / games).toFixed(2)} ` +
      `chains[${chainStr}] sways=${counts.swayed ?? 0}/${(counts.swayed ?? 0) + (counts.swayFailed ?? 0)} fires=${counts.ignited ?? 0}+${counts.fireSpread ?? 0}spread ` +
      `maxActions=${maxActions}${v2} invariantFailures=${failures}`,
  )
  if (brief) {
    for (const m of failureSamples) console.log(`  FAIL ${m}`)
    return { battle, failures }
  }
  const expected = [
    'attacked', 'countered', 'routed', 'damaged', 'stratagem', 'chainLink', 'bondedLink', 'sawThrough', 'confused', 'recovered',
    'ignited', 'fireSpread', 'burnedOut', 'fireDamage', 'healed', 'swayed', 'swayFailed', 'windChanged', 'dash', 'undo',
    'rallyHeal', 'villageHeal', 'chain2', 'chain3', 'chain4', 'timeout', 'commanderWin',
    'retreated', 'escaped', 'reinforced', 'terrainChanged', 'timelineMessage', 'buffed', 'buffExpired', 'provoked', 'objectiveProgress',
  ]
  const never = expected.filter((k) => !counts[k])
  console.log(`sim: counts ${expected.map((k) => `${k}=${counts[k] ?? 0}`).join(' ')}`)
  console.log(`sim: never-happened [${never.join(', ')}]`)
  for (const m of failureSamples) console.log(`  FAIL ${m}`)
  return { battle, failures }
}

function tally(
  events: GameEvent[],
  kinds: Set<string>,
  bump: (k: string, n?: number) => void,
  chains: Record<number, number>,
  fail: (m: string) => void,
  seed: number,
): void {
  let cur = 0
  const flush = (): void => {
    if (cur > 0) {
      chains[cur] = (chains[cur] ?? 0) + 1
      if (cur >= 2) bump(`chain${cur}`)
    }
    cur = 0
  }
  for (const e of events) {
    if (!kinds.has(e.kind)) fail(`seed ${seed}: unknown event kind ${e.kind}`)
    bump(e.kind)
    switch (e.kind) {
      case 'stratagem':
        flush()
        cur = 1
        break
      case 'chainLink':
        cur++
        if (e.bond) bump('bondedLink')
        break
      case 'damaged':
        if (e.source === 'fire') bump('fireDamage')
        if (!(e.amount > 0)) fail(`seed ${seed}: non-positive damage event`)
        if (e.troopsBefore - e.amount !== e.troopsAfter) fail(`seed ${seed}: damage event arithmetic`)
        break
      case 'moved':
        if (e.dash) bump('dash')
        if (e.undo) bump('undo')
        break
      case 'healed':
        bump(e.source === 'rally' ? 'rallyHeal' : 'villageHeal')
        break
      case 'battleEnded':
        if (e.reason === 'timeout') bump('timeout')
        if (e.reason === 'commander') bump('commanderWin')
        break
      default:
        break
    }
  }
  flush()
}

void main()
