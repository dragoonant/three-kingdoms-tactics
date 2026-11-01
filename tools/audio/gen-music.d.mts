export interface Io {
  log: (s: string) => void
  err: (s: string) => void
}
export function classifyStatus(job: unknown): 'done' | 'failed' | 'pending'
export function jobFileNames(job: unknown, expected: number): string[]
export function missingCandidates(rawDir: string, cue: { id: string }, candidates: number, force: boolean): number[]
export function main(argv: string[], io?: Io, hooks?: { current: { base: string; id: string } | null }): Promise<number>
