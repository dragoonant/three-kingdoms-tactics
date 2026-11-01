export function validateJob(body: unknown): string | null
export function renderFake(ffmpeg: string, body: Record<string, unknown>, variant: number, outFile: string): Promise<void>
export interface FakeStudio {
  url: string
  port: number
  stats: { requests: number; statusCalls: number; posts: number; rejected: number; running: number; maxConcurrent: number; jobs: { id: string; body: Record<string, unknown> }[] }
  close: () => Promise<void>
}
export function startFakeStudio(o?: { port?: number; delayMs?: number; ffmpeg?: string }): Promise<FakeStudio>
