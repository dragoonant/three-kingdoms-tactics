// The cut-in hitch probe (`?perf=1`, docs/spec/51 "Performance: warm-up and reuse"). Off by default: every call is a no-op
// unless the page was opened with ?perf=1. It records, per cut-in sequence:
//   - marks (performance.now) at the trigger, the layer mount, the renderer creation, the world build and the first frames;
//   - the time and length of every drawn frame, and the renderer's program / geometry / texture counts after it;
//   - the long main-thread tasks (PerformanceObserver "longtask") in the first second;
//   - how many WebGL contexts the page has created so far (getContext is wrapped at load).
// tools/perf/cutin-hitch.mjs reads it through window.__perf. No three or React in here.

export const PERF = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('perf') === '1'
  } catch {
    return false
  }
})()

/** `&perfsync=1`: drain the GPU after the first frame (a 1-pixel readback), to time the GPU work too. Off by default: the
 * readback is itself a main-thread stall that would show up as a long task. Without it the first frame counts as shown when
 * the next frame starts (the player draws one frame per animation frame, and Chrome holds animation frames back while the
 * GPU is busy). */
const SYNC = (() => {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('perfsync') === '1'
  } catch {
    return false
  }
})()

export interface InfoSnap {
  programs: number
  geometries: number
  textures: number
  calls: number
}
interface RendererLike {
  info: { programs: unknown[] | null; memory: { geometries: number; textures: number }; render: { calls: number } }
}

export interface FrameRec {
  /** Start of the draw, ms since the trigger. */
  at: number
  /** Main-thread length of the draw, ms. */
  dur: number
  link: number
  info: InfoSnap | null
}

export interface PerfRecord {
  n: number
  kind: string
  scenes: string[]
  enemy: boolean
  trigger: number
  marks: { name: string; at: number; dur?: number }[]
  frames: FrameRec[]
  longTasks: { at: number; dur: number }[]
  contextsBefore: number
  contextsAfter: number | null
  infoBefore: InfoSnap | null
  infoAfter: InfoSnap | null
  /** Time from the trigger to the end of the first frame, including the GPU drain (a 1-pixel readback in perf mode). */
  firstFrame: number | null
}

const records: PerfRecord[] = []
let cur: PerfRecord | null = null
let contexts = 0
const longTasks: { start: number; dur: number }[] = []
let renderer: RendererLike | null = null
let link = 0
let poolFn: (() => Record<string, number>) | null = null
const extraMarks: { name: string; at: number; dur?: number }[] = []

if (PERF && typeof window !== 'undefined') {
  // count WebGL contexts: the first getContext('webgl*') on a canvas creates one
  const seen = new WeakSet<object>()
  const orig = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, o?: unknown) => unknown
  ;(HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, id: string, o?: unknown) {
    const c = orig.call(this, id, o)
    if (c && /webgl/.test(id) && !seen.has(c as object)) {
      seen.add(c as object)
      contexts++
    }
    return c
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ start: e.startTime, dur: e.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* no longtask support */
  }
}

export function snapInfo(r: RendererLike | null = renderer): InfoSnap | null {
  if (!r) return null
  return { programs: r.info.programs?.length ?? 0, geometries: r.info.memory.geometries, textures: r.info.memory.textures, calls: r.info.render.calls }
}

function close(): void {
  if (!cur) return
  const c = cur
  c.contextsAfter = contexts
  c.infoAfter = snapInfo()
  c.longTasks = longTasks.filter((l) => l.start >= c.trigger - 5 && l.start < c.trigger + 1000).map((l) => ({ at: l.start - c.trigger, dur: l.dur }))
  cur = null
}

export const perf = {
  /** A cut-in sequence starts (player.start). */
  trigger(kind: string, scenes: string[], enemy: boolean): void {
    if (!PERF) return
    close()
    const now = performance.now()
    cur = { n: records.length, kind, scenes, enemy, trigger: now, marks: [], frames: [], longTasks: [], contextsBefore: contexts, contextsAfter: null, infoBefore: snapInfo(), infoAfter: null, firstFrame: null }
    records.push(cur)
  },
  /** The sequence is over (finished or cancelled): take the after-numbers once the layer has had a frame to settle. */
  end(): void {
    if (!PERF || !cur) return
    const c = cur
    // a frame later: the world's disposal (deferred a tick) has run
    setTimeout(() => {
      if (cur === c) close()
    }, 50)
  },
  mark(name: string): void {
    if (!PERF) return
    const at = performance.now()
    if (cur) cur.marks.push({ name, at: at - cur.trigger })
    else extraMarks.push({ name, at })
  },
  /** Time a synchronous piece of work. */
  measure<T>(name: string, fn: () => T): T {
    if (!PERF) return fn()
    const t0 = performance.now()
    try {
      return fn()
    } finally {
      const t1 = performance.now()
      if (cur) cur.marks.push({ name, at: t0 - cur.trigger, dur: t1 - t0 })
      else extraMarks.push({ name, at: t0, dur: t1 - t0 })
    }
  },
  link(i: number): void {
    if (!PERF) return
    link = i
    perf.mark(`link-${i}`)
  },
  /** The warm pool's size (set by the cut-in layer). */
  pool(fn: () => Record<string, number>): void {
    if (!PERF) return
    poolFn = fn
  },
  setRenderer(r: RendererLike | null): void {
    if (!PERF) return
    renderer = r
  },
  /** A cut-in frame was drawn: `t0` is when the draw started. `drain` forces the GPU to finish (first frame only). */
  frame(t0: number, drain?: () => void): void {
    if (!PERF || !cur) return
    const c = cur
    if (c.firstFrame === null && drain && SYNC) {
      const d0 = performance.now()
      drain()
      c.marks.push({ name: 'gpu-drain', at: d0 - c.trigger, dur: performance.now() - d0 })
      c.firstFrame = performance.now() - c.trigger
    }
    c.frames.push({ at: t0 - c.trigger, dur: performance.now() - t0, link, info: c.frames.length < 3 || c.frames.length % 10 === 0 ? snapInfo() : null })
    if (c.frames.length === 1 && !SYNC && typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        if (c.firstFrame === null) c.firstFrame = performance.now() - c.trigger
      })
    }
  },
  get active(): boolean {
    return PERF
  },
}

if (PERF && typeof window !== 'undefined') {
  ;(window as unknown as { __perf: unknown }).__perf = {
    records: () => {
      return records.map((r) => ({ ...r }))
    },
    current: () => cur,
    contexts: () => contexts,
    info: () => snapInfo(),
    pool: () => poolFn?.() ?? null,
    /** The cut-in canvas's drawing buffer: size, MSAA samples and an estimate of its bytes (colour + depth/stencil + resolve). */
    canvas: () => {
      const gl = (renderer as unknown as { getContext?: () => WebGL2RenderingContext } | null)?.getContext?.()
      if (!gl) return null
      const w = gl.drawingBufferWidth
      const h = gl.drawingBufferHeight
      const samples = Math.max(1, gl.getParameter(gl.SAMPLES) as number)
      return { w, h, samples, bytes: w * h * (samples * 8 + 4) }
    },
    marks: () => extraMarks.slice(),
    longTasks: () => longTasks.slice(),
    clear: () => {
      records.length = 0
      cur = null
    },
  }
}
