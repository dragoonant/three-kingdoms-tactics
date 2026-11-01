// A tiny cue sheet that fires its steps once as a clock passes them. The audition page's "Charge overlay demo" runs one on
// the audio clock: battle bed at 0 s, cut-in start at 4 s, cut-in end 7 s later.
export interface DemoStep {
  at: number
  label: string
}
export const CHARGE_DEMO: readonly DemoStep[] = [
  { at: 0, label: 'bed' },
  { at: 4, label: 'cutinStart' },
  { at: 11, label: 'cutinEnd' },
  { at: 16, label: 'done' },
]

export class CueSheet {
  private t0: number | null = null
  private next = 0
  constructor(private readonly steps: readonly DemoStep[]) {}
  start(now: number): void {
    this.t0 = now
    this.next = 0
  }
  stop(): void {
    this.t0 = null
  }
  get running(): boolean {
    return this.t0 !== null && this.next < this.steps.length
  }
  elapsed(now: number): number {
    return this.t0 === null ? 0 : now - this.t0
  }
  /** Steps whose time has come since the last poll, in order. */
  poll(now: number): DemoStep[] {
    if (this.t0 === null) return []
    const out: DemoStep[] = []
    while (this.next < this.steps.length && now - this.t0 >= this.steps[this.next]!.at) out.push(this.steps[this.next++]!)
    return out
  }
}
