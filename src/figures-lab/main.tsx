// Figure lab (docs/spec/31-hero-figures.md): turntables of every hero, officer-kit sample, troop and horse on a sand floor (no bases: PLAN D23)
// under lantern light. Views: front / three-quarter / silhouette (all black on light: the silhouette test) and a
// "board scale" layout that shows the figures about 60 px tall, as they are on the board.
//   ?test=1  sets window.__lab = { ready: true } after the first render
//   ?mode=front|threequarter|silhouette&rotate=0&scale=board&group=heroes|officers|troops|variants|horses|all
//   ?view=locomotion&gait=walk|run|trot|canter|gallop&t=<seconds>  side-on treadmill of a hero, infantry, archer and riders (locomotion.tsx)
//   ?view=crowds&scene=infantry|archers|cavalry|rebels|all|perf&cam=side|three|front&t=<seconds>  instanced troop formations of the cut-ins (crowds.tsx, docs/spec/52-crowds.md)
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { MeshBasicMaterial, Vector3, type Group as ThreeGroup } from 'three'
import { applyClip, drawBow, fallBack, gallop, idle, rest, swingOverhead, thrust, travel, type Clip } from '../client/figures/clips'
import { HERO_IDS, buildHeroRig } from '../client/figures/heroes'
import { buildBareHorse, HORSE_PRESETS } from '../client/figures/horse'
import { OFFICER_IDS, buildOfficer } from '../client/figures/officerKit'
import { buildTroopRig } from '../client/figures/troops'
import type { Rig, SidePalette, TroopKind } from '../client/figures/rig'
import { Locomotion } from './locomotion'
import { Crowds } from './crowds'

type Mode = 'front' | 'threequarter' | 'silhouette'
type GroupKey = 'heroes' | 'officers' | 'troops' | 'variants' | 'horses' | 'brothers' | 'all'

const Q = new URLSearchParams(window.location.search)
const modeParam = Q.get('mode')
const INITIAL_MODE: Mode = modeParam === 'silhouette' || modeParam === 'threequarter' ? modeParam : 'front'
const INITIAL_BOARD = Q.get('scale') === 'board' || modeParam === 'board'
const INITIAL_ROTATE = Q.get('rotate') !== '0'
const gp = Q.get('group')
const YAW = Q.get('yaw') !== null ? Number(Q.get('yaw')) : null
const ONLY = (Q.get('only') ?? '').split(',').filter(Boolean)
const CLIP = Q.get('clip')
const CLIP_P = Number(Q.get('p') ?? '0.5')
function previewClip(rig: Rig, t: number): Clip {
  switch (CLIP) {
    case 'rest': return rest()
    case 'drawBow': return drawBow(CLIP_P)
    case 'swing': return swingOverhead(CLIP_P)
    case 'thrust': return thrust(CLIP_P)
    case 'fall': return fallBack(CLIP_P)
    case 'walk': return travel(rig, t * 0.8)
    case 'gallop': return gallop(t * 3)
    default: return idle(t)
  }
}
const INITIAL_GROUP: GroupKey = gp === 'heroes' || gp === 'officers' || gp === 'troops' || gp === 'variants' || gp === 'horses' || gp === 'brothers' ? gp : 'all'

const NAMES: Record<string, string> = {
  'liu-bei': 'Liu Bei', 'guan-yu': 'Guan Yu', 'zhang-fei': 'Zhang Fei', 'zhao-yun': 'Zhao Yun', 'zhuge-liang': 'Zhuge Liang', 'lu-bu': 'Lu Bu', 'cao-cao': 'Cao Cao',
}
const pretty = (id: string): string => NAMES[id] ?? id.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ')

interface Item {
  key: string
  label: string
  sub?: string
  build: () => Rig | Obj
  row: number
  col: number
}
interface Obj {
  group: ThreeGroup
  dispose(): void
  rig?: Rig
}

const SAMPLE_OFFICERS = ['jian-yong', 'xiahou-dun', 'zhang-bao', 'gan-ning', 'zhou-yu', 'dian-wei', 'xiahou-yuan']
const KINDS: TroopKind[] = ['infantry', 'archer', 'cavalry', 'rebel']
const SIDES: SidePalette[] = ['han', 'yellow', 'cao', 'dong', 'lu']

function items(group: GroupKey, board: boolean): Item[] {
  const out: Item[] = []
  const heroRow = (row: number): void => {
    HERO_IDS.forEach((id, i) => out.push({ key: `h-${id}`, label: pretty(id), sub: 'hero', build: () => buildHeroRig(id)!, row, col: i }))
  }
  const footRow = (row: number): void => {
    ;(['guan-yu', 'zhao-yun', 'lu-bu', 'cao-cao'] as const).forEach((id, i) =>
      out.push({ key: `f-${id}`, label: `${pretty(id)} (foot)`, sub: 'on foot', build: () => buildHeroRig(id, { mounted: false })!, row, col: i }),
    )
  }
  const officerRow = (row: number, ids: string[], perRow = 99): void => {
    ids.forEach((id, i) => out.push({ key: `o-${id}`, label: pretty(id), sub: 'officer kit', build: () => buildOfficer(id), row: row + Math.floor(i / perRow), col: i % perRow }))
  }
  const troopMatrix = (row: number): void => {
    KINDS.forEach((k, r) => SIDES.forEach((s, c) => out.push({ key: `t-${k}-${s}`, label: `${k}`, sub: s, build: () => buildTroopRig(k, s, c % 3), row: row + r, col: c })))
  }
  const variantRows = (row: number): void => {
    KINDS.forEach((k, r) =>
      [0, 1, 2].forEach((v) => {
        out.push({ key: `v-${k}-han-${v}`, label: k, sub: `han v${v}`, build: () => buildTroopRig(k, 'han', v), row: row + r, col: v })
        out.push({ key: `v-${k}-yellow-${v}`, label: k, sub: `yellow v${v}`, build: () => buildTroopRig(k, 'yellow', v), row: row + r, col: v + 3 })
      }),
    )
  }
  const horseRow = (row: number): void => {
    Object.keys(HORSE_PRESETS).forEach((k, i) => out.push({ key: `hs-${k}`, label: `${k} horse`, sub: 'mount', build: () => buildBareHorse(k), row, col: i }))
  }
  if (board) {
    heroRow(0)
    officerRow(1, SAMPLE_OFFICERS.slice(0, 4))
    KINDS.forEach((k, i) => out.push({ key: `bt-${k}`, label: k, sub: 'han', build: () => buildTroopRig(k, 'han', i), row: 1, col: 4 + i }))
    return out
  }
  switch (group) {
    case 'brothers':
      // Liu Bei, Guan Yu and Zhang Fei at their true relative scale (Guan Yu 1.15, Zhang Fei 1.07, Liu Bei 1), on foot and mounted
      ;(['liu-bei', 'guan-yu', 'zhang-fei'] as const).forEach((id, i) => out.push({ key: `b-${id}`, label: pretty(id), sub: 'on foot', build: () => buildHeroRig(id, { mounted: false })!, row: 0, col: i }))
      ;(['guan-yu'] as const).forEach((id, i) => out.push({ key: `bm-${id}`, label: `${pretty(id)} (mounted)`, sub: 'for scale', build: () => buildHeroRig(id)!, row: 0, col: 3 + i }))
      break
    case 'heroes':
      heroRow(0)
      footRow(1)
      break
    case 'officers':
      officerRow(0, [...OFFICER_IDS], 9)
      break
    case 'troops':
      troopMatrix(0)
      break
    case 'variants':
      variantRows(0)
      break
    case 'horses':
      horseRow(0)
      break
    default:
      heroRow(0)
      officerRow(1, SAMPLE_OFFICERS.slice(0, 4))
      KINDS.forEach((k, i) => out.push({ key: `bt-${k}`, label: k, sub: 'han', build: () => buildTroopRig(k, 'han', i), row: 1, col: 4 + i }))
      horseRow(2)
  }
  return out
}

function isRig(o: Rig | Obj): o is Rig {
  return 'joints' in o
}

interface Placed {
  item: Item
  obj: Rig | Obj
  x: number
  y: number
}

function Figure({ p, rotate, yaw, silhouette }: { p: Placed; rotate: boolean; yaw: number; silhouette: boolean }) {
  const spin = useRef<ThreeGroup>(null)
  const phase = useMemo(() => (p.x * 1.7 + p.y) % 6, [p])
  const obj = p.obj
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (spin.current) spin.current.rotation.y = rotate ? t * 0.55 + phase * 0.3 : yaw
    if (isRig(obj)) applyClip(obj, previewClip(obj, rotate ? t + phase : 0.6))
  })
  return (
    <group position={[p.x, p.y, 0]}>
      {!silhouette && (
        // A strip of sand flush with the feet; neighbouring strips join into one continuous ground per row
        // (no bases anywhere: PLAN D23).
        <mesh position={[0, -0.01, 0]} receiveShadow>
          <boxGeometry args={[1.62, 0.02, 1.3]} />
          <meshStandardMaterial color="#cdb88c" roughness={0.95} />
        </mesh>
      )}
      <group ref={spin}>
        <primitive object={isRig(obj) ? obj.group : obj.group} />
      </group>
    </group>
  )
}

function CameraFit({ bounds, board, elevation }: { bounds: { minX: number; maxX: number; minY: number; maxY: number }; board: boolean; elevation: number }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    const cx = (bounds.minX + bounds.maxX) / 2
    const cy = (bounds.minY + bounds.maxY) / 2
    const w = bounds.maxX - bounds.minX
    const h = bounds.maxY - bounds.minY
    // 67 px per tile reproduces the 60 px tall hero of the board; otherwise fit the whole grid
    const fit = Math.min(size.width / w, size.height / h)
    const zoom = board ? 67 : fit
    const d = 30
    camera.position.set(cx, cy + Math.sin(elevation) * d, Math.cos(elevation) * d)
    camera.zoom = zoom
    camera.near = -100
    camera.far = 200
    camera.lookAt(cx, cy, 0)
    camera.updateProjectionMatrix()
    // labels project in useFrame: redraw (twice) so they land on the new camera even when the loop is on demand
    invalidate()
    const id = window.setTimeout(invalidate, 200)
    return () => window.clearTimeout(id)
  }, [bounds, board, elevation, camera, size, invalidate])
  return null
}

/** Projects each figure's name label (plain HTML outside the canvas) onto the screen every frame. */
function Labels({ placed, refs }: { placed: Placed[]; refs: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    placed.forEach((p, i) => {
      const el = refs.current[i]
      if (!el) return
      v.set(p.x, p.y - 0.2, 0.7).project(camera)
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px) translate(-50%, 0)`
      el.style.opacity = '1'
    })
  })
  return null
}

function Silhouette({ on }: { on: boolean }) {
  const { scene, gl } = useThree()
  useEffect(() => {
    const m = new MeshBasicMaterial({ color: '#000000' })
    scene.overrideMaterial = on ? m : null
    gl.setClearColor(on ? '#ebe5d4' : '#14100d')
    return () => {
      scene.overrideMaterial = null
      m.dispose()
    }
  }, [on, scene, gl])
  return null
}

function Ready() {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    ;(window as unknown as { __lab?: { ready: boolean } }).__lab = { ready: true }
  })
  return null
}

function Lab(): ReactNode {
  const [mode, setMode] = useState<Mode>(INITIAL_MODE)
  const [rotate, setRotate] = useState(INITIAL_ROTATE)
  const [board, setBoard] = useState(INITIAL_BOARD)
  const [group, setGroup] = useState<GroupKey>(INITIAL_GROUP)

  const placed = useMemo<Placed[]>(() => {
    let list = items(group, board)
    if (ONLY.length) {
      list = list.filter((it) => ONLY.some((o) => it.key === o || it.key.endsWith(`-${o}`)))
      list.forEach((it, i) => {
        it.row = 0
        it.col = i
      })
    }
    const spacing = board ? 1.25 : 1.6
    const rowH = board ? 2.6 : group === 'troops' || group === 'variants' ? 2.55 : 2.9
    return list.map((item) => ({ item, obj: item.build(), x: item.col * spacing, y: -item.row * rowH }))
  }, [group, board])
  useEffect(() => () => placed.forEach((p) => (isRig(p.obj) ? p.obj.dispose() : p.obj.dispose())), [placed])

  const bounds = useMemo(() => {
    const xs = placed.map((p) => p.x)
    const ys = placed.map((p) => p.y)
    return { minX: Math.min(...xs) - 0.95, maxX: Math.max(...xs) + 0.95, minY: Math.min(...ys) - 0.55, maxY: Math.max(...ys) + (board ? 2.6 : 2.7) }
  }, [placed, board])

  const silhouette = mode === 'silhouette'
  const labelRefs = useRef<(HTMLDivElement | null)[]>([])
  const yaw = YAW ?? (mode === 'threequarter' ? 0.62 : 0)
  const elevation = board ? 0.5 : mode === 'threequarter' ? 0.32 : 0.28

  return (
    <div style={{ position: 'fixed', inset: 0, background: silhouette ? '#ebe5d4' : '#14100d' }}>
      <style>{CSS}</style>
      <Canvas
        orthographic
        dpr={board ? 1 : [1, 1.5]}
        frameloop={rotate ? 'always' : 'demand'}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 0, 30], zoom: 60, near: -100, far: 200 }}
        onCreated={({ gl }) => gl.setClearColor(silhouette ? '#ebe5d4' : '#14100d')}
      >
        <CameraFit bounds={bounds} board={board} elevation={elevation} />
        <Silhouette on={silhouette} />
        <ambientLight intensity={0.85} color="#ffe2b8" />
        <directionalLight position={[-6, 9, 12]} intensity={2.3} color="#ffd9a0" />
        <directionalLight position={[8, 4, -8]} intensity={0.9} color="#9fb4d6" />
        <pointLight position={[0, 3, 6]} intensity={14} color="#f2b45a" distance={40} />
        {!silhouette &&
          [...new Set(placed.map((p) => p.y))].map((y) => (
            <mesh key={y} position={[(bounds.minX + bounds.maxX) / 2, y - 0.14, 0]}>
              <boxGeometry args={[bounds.maxX - bounds.minX, 0.1, 1.9]} />
              <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
            </mesh>
          ))}
        {placed.map((p) => (
          <Figure key={p.item.key} p={p} rotate={rotate} yaw={yaw} silhouette={silhouette} />
        ))}
        <Labels placed={placed} refs={labelRefs} />
        <Ready />
      </Canvas>
      {!silhouette && !board && (
        <div className="lab-labels">
          {placed.map((p, i) => (
            <div key={p.item.key} className="lab-label" ref={(el) => { labelRefs.current[i] = el }} style={{ opacity: 0 }}>
              <b>{p.item.label}</b>
              {p.item.sub && <i>{p.item.sub}</i>}
            </div>
          ))}
        </div>
      )}
      <div className="lab-bar">
        <span className="lab-title">Figure Lab</span>
        <button className={rotate ? 'on' : ''} onClick={() => setRotate(!rotate)}>
          Rotate {rotate ? 'on' : 'off'}
        </button>
        {(['front', 'threequarter', 'silhouette'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'threequarter' ? 'Three-quarter' : m === 'front' ? 'Front' : 'Silhouette'}
          </button>
        ))}
        <button className={board ? 'on' : ''} onClick={() => setBoard(!board)}>
          Board scale
        </button>
        {!board &&
          (['all', 'heroes', 'brothers', 'officers', 'troops', 'variants', 'horses'] as GroupKey[]).map((g) => (
            <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
      </div>
    </div>
  )
}

const CSS = `
.lab-bar{position:fixed;left:12px;top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font:500 13px 'Alegreya Sans',system-ui,sans-serif;z-index:20}
.lab-title{font:400 22px 'Ma Shan Zheng','STKaiti','KaiTi',serif;color:#efe6d2;margin-right:10px;text-shadow:0 1px 4px #000}
.lab-bar button{background:#3a1410;color:#efe6d2;border:1px solid #a07a3a;padding:4px 10px;border-radius:2px;cursor:pointer;font:inherit}
.lab-bar button.on{background:#a07a3a;color:#1b1a17}
.lab-labels{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:10}
.lab-label{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;white-space:nowrap;text-shadow:0 1px 3px #000;pointer-events:none}
.lab-label b{font:400 20px 'Ma Shan Zheng','STKaiti','KaiTi',serif;color:#f4e7d0;letter-spacing:.02em}
.lab-label i{font:500 11px 'Alegreya Sans',system-ui,sans-serif;color:#c9b27c;font-style:normal;text-transform:uppercase;letter-spacing:.08em}
`

createRoot(document.getElementById('root')!).render(Q.get('view') === 'locomotion' ? <Locomotion /> : Q.get('view') === 'crowds' ? <Crowds /> : <Lab />)

