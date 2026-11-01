export interface Cue {
  id: string
  kind: 'music' | 'sfx'
  role: 'bed' | 'charge' | 'stinger'
  mood?: string
  cue?: string
  bpm: number
  key?: string
  timesig?: string
  beatsPerBar: number
  bars?: number
  duration?: number
  seconds?: number
  keepSeconds?: number
  loop: boolean
  lufs?: number
  peakDb?: number
  seed: number
  prompt: string
  negative?: string
  note?: string
}
export interface CueTable {
  version: number
  musicExclusions: string
  candidates: number
  musicSteps: number
  sfxSteps: number
  cues: Cue[]
}
export interface GenOptions {
  help: boolean
  only: string[] | null
  dryRun: boolean
  force: boolean
  base: string
  candidates: 1 | 2
  limit: number | null
  timeoutMs: number
  pollMs: number
  out: string
}
export interface MasterOptions {
  help: boolean
  only: string[] | null
  ffmpeg: string
  audition: boolean
  picks: Record<string, 'a' | 'b'>
  prune: boolean
  seamFadeMs: number
  jobs: number
  dryRun: boolean
  out: string
  publicDir: string
}
export interface FakeOptions {
  help: boolean
  port: number
  delayMs: number
  ffmpeg: string
}
export const TOOL_DIR: string
export const REPO_ROOT: string
export const DEFAULT_BASE: string
export const DEFAULT_OUT: string
export const DEFAULT_PUBLIC: string
export const CUES_FILE: string
export const SAMPLE_RATE: number
export const CANDIDATE_LETTERS: string[]
export class UsageError extends Error {
  exitCode: number
}
export function barSeconds(bpm: number, beatsPerBar: number, bars: number): number
export function barSamples(bpm: number, beatsPerBar: number, bars: number, sr?: number): number
export function round3(s: number): number
export function candidateLetter(index: number): string
export function rawFileName(id: string, index: number): string
export function masteredBase(id: string, letter: string): string
export function validateCue(c: unknown): void
export function loadCueTable(file?: string): CueTable
export function loopSeconds(cue: Cue): number
export function selectOnly(only: string | undefined, cues: Cue[]): string[] | null
export function parseGenArgs(argv: string[], cues: Cue[], table?: Partial<CueTable>): GenOptions
export function parseMasterArgs(argv: string[], cues: Cue[]): MasterOptions
export function parseFakeArgs(argv: string[]): FakeOptions
export const GEN_HELP: string
export const MASTER_HELP: string
export const FAKE_HELP: string
export function buildJobBody(cue: Cue, table: Partial<CueTable>, candidates: number): Record<string, unknown>
export function run(cmd: string, args: string[], opts?: object): Promise<{ code: number; stdout: Buffer; stderr: string }>
export function checkFfmpeg(ffmpeg: string): Promise<{ version: string }>
export function sleep(ms: number): Promise<void>
export function isMain(metaUrl: string): boolean
