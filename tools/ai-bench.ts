// AI bench: plays headless Daxing Hill games between decider tiers and prints win rates.
// Usage: tsx tools/ai-bench.ts [--games 100] [--pairs normal:random,normal:greedy,...] [--seed0 5000] [--jobs 4]
//                              [--battle daxing-hill] [--budget 300] [--real-clock] [--quiet]
// A pair "A:B" plays N games with A as han and B as yellow, then N games with A as yellow and B as han, so each tier is
// seen from both seats. The default seeds (5000..) are a HOLDOUT set: tuning used seeds 1000..1199, never these.
// Tiers: random | easy | greedy | normal. ("easy" and "greedy" are the same bot.)
// Gate (exit code 1 on failure): normal beats random in at least 95% of games from each seat.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createBattle, legalActions, step, type Action, type BattleState } from '../src/engine'
import { decide } from '../src/ai/decider'
import { greedyAction } from '../src/ai/greedy'
import { checkInvariants, unitBudget } from './invariants'

type Player = 'random' | 'easy' | 'greedy' | 'normal'
const PLAYERS: Player[] = ['random', 'easy', 'greedy', 'normal']

interface SeatStats {
  decisions: number
  ms: number
  maxMs: number
  fallbacks: number
  truncated: number
  phases: number
  zeroPhases: number
  chains2: number
  chains3: number
  ignites: number
  sways: number
  swayTries: number
  illegal: number
  rejected: number
  invariants: number
}

interface GameResult {
  seed: number
  winner: string
  reason: string
  rounds: number
  han: SeatStats
  yellow: SeatStats
}

const blank = (): SeatStats => ({
  decisions: 0, ms: 0, maxMs: 0, fallbacks: 0, truncated: 0, phases: 0, zeroPhases: 0, chains2: 0, chains3: 0,
  ignites: 0, sways: 0, swayTries: 0, illegal: 0, rejected: 0, invariants: 0,
})

interface Config {
  battle: string
  budget: number
  realClock: boolean
}

function playGame(cfg: Config, seed: number, hanP: Player, yellowP: Player): GameResult {
  let s: BattleState = createBattle(cfg.battle, seed)
  const total = unitBudget(s)
  const seats: Record<string, SeatStats> = { han: blank(), yellow: blank() }
  const players: Record<string, Player> = { han: hanP, yellow: yellowP }
  let actionsThisPhase = 0
  let guard = 0
  const now = cfg.realClock ? undefined : (): number => 0
  while (!s.result && guard++ < 4000) {
    const side = s.side
    const seat = seats[side]!
    const p = players[side]!
    let action: Action
    const t0 = performance.now()
    if (p === 'greedy') action = greedyAction(s)
    else {
      const d = decide(s, { tier: p, seed: seed * 101 + (side === 'han' ? 1 : 2), budgetMs: cfg.budget, ...(now ? { now } : {}) })
      action = d.action
      if (d.fallback !== 'none') seat.fallbacks++
      if (d.truncated) seat.truncated++
    }
    const ms = performance.now() - t0
    seat.decisions++
    seat.ms += ms
    seat.maxMs = Math.max(seat.maxMs, ms)
    const legal = legalActions(s)
    const k = JSON.stringify(action)
    if (!legal.some((a) => JSON.stringify(a) === k)) seat.illegal++
    const r = step(s, action)
    if (!r.ok) {
      seat.rejected++
      // keep the game going so the bench terminates
      const e = step(s, { type: 'endPhase' })
      if (!e.ok) break
      s = e.state
      continue
    }
    if (action.type === 'endPhase') {
      seat.phases++
      if (actionsThisPhase === 0) seat.zeroPhases++
      actionsThisPhase = 0
    } else actionsThisPhase++
    const links = r.events.filter((e) => e.kind === 'chainLink').length
    if (links >= 1) seat.chains2++
    if (links >= 2) seat.chains3++
    for (const e of r.events) {
      if (e.kind === 'ignited') seat.ignites++
      if (e.kind === 'swayed') seat.sways++
      if (e.kind === 'swayed' || e.kind === 'swayFailed') seat.swayTries++
    }
    s = r.state
    seat.invariants += checkInvariants(s, total).length
  }
  return {
    seed,
    winner: s.result?.winner ?? 'none',
    reason: s.result?.reason ?? 'unfinished',
    rounds: s.round,
    han: seats.han!,
    yellow: seats.yellow!,
  }
}

// ------------------------------------------------------------------ aggregation

interface DirectionReport {
  label: string
  a: Player
  b: Player
  aSeat: 'han' | 'yellow'
  games: number
  aWins: number
  bWins: number
  none: number
  rounds: number
  timeouts: number
  aStats: SeatStats
  bStats: SeatStats
}

function addInto(into: SeatStats, from: SeatStats): void {
  for (const k of Object.keys(into) as (keyof SeatStats)[]) {
    if (k === 'maxMs') into.maxMs = Math.max(into.maxMs, from.maxMs)
    else into[k] += from[k]
  }
}

function mergeDirection(into: DirectionReport, from: DirectionReport): void {
  into.games += from.games
  into.aWins += from.aWins
  into.bWins += from.bWins
  into.none += from.none
  into.rounds += from.rounds
  into.timeouts += from.timeouts
  addInto(into.aStats, from.aStats)
  addInto(into.bStats, from.bStats)
}

function runDirection(cfg: Config, a: Player, b: Player, aSeat: 'han' | 'yellow', seeds: number[]): DirectionReport {
  const rep: DirectionReport = {
    label: `${a}(${aSeat}) vs ${b}(${aSeat === 'han' ? 'yellow' : 'han'})`,
    a, b, aSeat, games: 0, aWins: 0, bWins: 0, none: 0, rounds: 0, timeouts: 0, aStats: blank(), bStats: blank(),
  }
  for (const seed of seeds) {
    const hanP = aSeat === 'han' ? a : b
    const yellowP = aSeat === 'han' ? b : a
    const g = playGame(cfg, seed, hanP, yellowP)
    rep.games++
    rep.rounds += g.rounds
    if (g.reason === 'timeout') rep.timeouts++
    if (g.winner === aSeat) rep.aWins++
    else if (g.winner === 'none') rep.none++
    else rep.bWins++
    addInto(rep.aStats, aSeat === 'han' ? g.han : g.yellow)
    addInto(rep.bStats, aSeat === 'han' ? g.yellow : g.han)
  }
  return rep
}

// ------------------------------------------------------------------ CLI

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : def
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`)

function parsePairs(spec: string): [Player, Player][] {
  return spec.split(',').map((p) => {
    const [a, b] = p.split(':') as [Player, Player]
    if (!PLAYERS.includes(a) || !PLAYERS.includes(b)) throw new Error(`bad pair ${p}; players: ${PLAYERS.join(', ')}`)
    return [a, b]
  })
}

function runChild(jobs: number, shard: number, args: string[]): Promise<DirectionReport[]> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(import.meta.url)
    const p = spawn(process.execPath, ['--import', 'tsx', script, ...args, '--child', String(shard), '--jobs', String(jobs)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let out = ''
    p.stdout.on('data', (d: Buffer) => (out += d.toString()))
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`bench shard ${shard} exited ${code}`))
      try {
        resolve(JSON.parse(out) as DirectionReport[])
      } catch (e) {
        reject(e as Error)
      }
    })
  })
}

const pct = (n: number, d: number): string => (d === 0 ? '-' : `${((100 * n) / d).toFixed(0)}%`)
const f1 = (n: number): string => n.toFixed(1)

function printTable(reps: DirectionReport[]): void {
  const head = ['match', 'games', 'A wins', 'B wins', 'A rate', 'rounds', 'timeout', 'dec ms (A)', 'max ms', 'fallbk', 'trunc', 'zero-act (A)', 'chain>=2/g (A)', 'chain>=3/g', 'ignite/g', 'sway/g', 'illegal', 'inv']
  const rows = reps.map((r) => {
    const A = r.aStats
    const B = r.bStats
    const g = Math.max(1, r.games)
    return [
      r.label, String(r.games), String(r.aWins), String(r.bWins), pct(r.aWins, r.games), f1(r.rounds / g), String(r.timeouts),
      A.decisions ? f1(A.ms / A.decisions) : '-', f1(Math.max(A.maxMs, B.maxMs)), String(A.fallbacks + B.fallbacks),
      String(A.truncated + B.truncated), `${A.zeroPhases}/${A.phases}`, f1(A.chains2 / g), f1(A.chains3 / g),
      f1((A.ignites + B.ignites) / g), f1((A.sways + B.sways) / g), String(A.illegal + B.illegal + A.rejected + B.rejected),
      String(A.invariants + B.invariants),
    ]
  })
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)))
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ')
  console.log(line(head))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const r of rows) console.log(line(r))
}

async function main(): Promise<void> {
  const games = Number(arg('games', '100'))
  const seed0 = Number(arg('seed0', '5000'))
  const jobs = Number(arg('jobs', '1'))
  const cfg: Config = { battle: arg('battle', 'daxing-hill'), budget: Number(arg('budget', '300')), realClock: flag('real-clock') }
  const pairs = parsePairs(arg('pairs', 'normal:random,normal:greedy,greedy:greedy,normal:normal'))
  const child = arg('child', '')
  const seeds = Array.from({ length: games }, (_, i) => seed0 + i)

  if (child !== '') {
    const shard = Number(child)
    const mine = seeds.filter((_, i) => i % jobs === shard)
    const out: DirectionReport[] = []
    for (const [a, b] of pairs) {
      out.push(runDirection(cfg, a, b, 'han', mine))
      if (a !== b) out.push(runDirection(cfg, a, b, 'yellow', mine))
    }
    process.stdout.write(JSON.stringify(out))
    return
  }

  let reps: DirectionReport[]
  const t0 = Date.now()
  if (jobs > 1) {
    const passthru = process.argv.slice(2).filter((_, i, all) => !(all[i] === '--jobs' || all[i - 1] === '--jobs'))
    const shards = await Promise.all(Array.from({ length: jobs }, (_, k) => runChild(jobs, k, passthru)))
    reps = shards[0]!
    for (const sh of shards.slice(1)) sh.forEach((r, i) => mergeDirection(reps[i]!, r))
  } else {
    reps = []
    for (const [a, b] of pairs) {
      reps.push(runDirection(cfg, a, b, 'han', seeds))
      if (a !== b) reps.push(runDirection(cfg, a, b, 'yellow', seeds))
    }
  }
  console.log(`ai-bench: battle=${cfg.battle} games/direction=${games} seeds=${seed0}..${seed0 + games - 1} budget=${cfg.budget}ms clock=${cfg.realClock ? 'real' : 'frozen'} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`)
  printTable(reps)

  // Gate: normal beats random >= 95% from each seat.
  let failed = false
  for (const r of reps) {
    if (r.a === 'normal' && r.b === 'random') {
      const rate = r.aWins / Math.max(1, r.games)
      const ok = rate >= 0.95
      console.log(`gate: normal(${r.aSeat}) vs random: ${(rate * 100).toFixed(1)}% ${ok ? 'PASS' : 'FAIL'} (need >= 95%)`)
      if (!ok) failed = true
    }
  }
  const bad = reps.reduce((n, r) => n + r.aStats.illegal + r.bStats.illegal + r.aStats.rejected + r.bStats.rejected + r.aStats.invariants + r.bStats.invariants, 0)
  if (bad > 0) {
    console.log(`gate: ${bad} illegal/rejected actions or invariant failures FAIL`)
    failed = true
  }
  if (failed) process.exit(1)
}

void main()
