// Figure lab "Portrait" view (docs/spec/50-presentation.md "Portraits"): a head-and-shoulders bust of any officer's rig, three-quarter view, framed on
// the face under a warm lantern key light, composed over a silk-and-ink backdrop in the sand-table palette into a 256x256 webp. It is the page the
// offline tool tools/render-portraits.mjs drives; open it by hand to look at one:
//   figure-lab.html?view=portrait&id=guan-yu        (the bust on its backdrop, 512 px)
//   figure-lab.html?view=portrait&sheet=1           (a contact sheet of every subject)
// window.__portrait = { ready, subjects(), render(id) -> data URL (webp), sheet() -> data URL }.
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { buildHeroRig } from '../client/figures/heroes'
import { buildOfficer } from '../client/figures/officerKit'
import type { Rig } from '../client/figures/rig'
import { buildTroopRig } from '../client/figures/troops'
import { PORTRAIT_PX, portraitSubjects, type PortraitSubject } from '../client/portraits'

const SIDE_TINT: Record<string, string> = { han: '#2f6b5e', yellow: '#d4a72c', cao: '#34495e', dong: '#6b1f2a', lu: '#5b2c6f', court: '#5d5a52' }
const SS = 2 // supersampling of the WebGL canvas
const YAW = 0.5 // radians the bust turns away from the camera (three-quarter view)

function build(s: PortraitSubject): Rig {
  if (s.group === 'hero') return buildHeroRig(s.id, { mounted: false })!
  if (s.group === 'officer') return buildOfficer(s.id, { type: s.kind, side: s.side, mounted: false })
  return buildTroopRig(s.kind, s.side, s.variant)
}

/** Silk-and-ink backdrop: ink at the edges, a warm lantern glow behind the head, faint silk threads, and a band of the side's colour at the foot. */
function backdrop(ctx: CanvasRenderingContext2D, side: string, px: number): void {
  const g = ctx.createRadialGradient(px * 0.38, px * 0.3, px * 0.04, px * 0.5, px * 0.5, px * 0.78)
  g.addColorStop(0, '#5a3d24')
  g.addColorStop(0.45, '#2c1d13')
  g.addColorStop(1, '#120d0a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, px, px)
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#efe6d2'
  for (let x = 0; x < px; x += 4) ctx.fillRect(x, 0, 1, px)
  ctx.globalAlpha = 0.03
  for (let y = 0; y < px; y += 4) ctx.fillRect(0, y, px, 1)
  ctx.globalAlpha = 1
  const band = ctx.createLinearGradient(0, px * 0.72, 0, px)
  band.addColorStop(0, 'rgba(0,0,0,0)')
  band.addColorStop(1, (SIDE_TINT[side] ?? '#2f6b5e') + 'cc')
  ctx.fillStyle = band
  ctx.fillRect(0, px * 0.72, px, px * 0.28)
}

function vignette(ctx: CanvasRenderingContext2D, px: number): void {
  const v = ctx.createRadialGradient(px / 2, px * 0.46, px * 0.3, px / 2, px / 2, px * 0.75)
  v.addColorStop(0, 'rgba(10,6,4,0)')
  v.addColorStop(1, 'rgba(10,6,4,0.55)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, px, px)
}

export function startPortraits(): void {
  const subjects = portraitSubjects()
  const px = PORTRAIT_PX
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(px * SS, px * SS, false)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  scene.add(new AmbientLight('#8a7088', 0.9))
  scene.add(new HemisphereLight('#a08a78', '#2a1a10', 0.5))
  const key = new DirectionalLight('#ffcf90', 4.2) // the lantern, upper left and in front
  key.position.set(-2.2, 2.4, 3.2)
  scene.add(key)
  const fill = new DirectionalLight('#8fa4c8', 0.7)
  fill.position.set(3, 0.6, 2)
  scene.add(fill)
  const rim = new DirectionalLight('#ffb070', 1.6) // warm edge light from behind
  rim.position.set(2.6, 1.8, -2.4)
  scene.add(rim)
  const cam = new PerspectiveCamera(22, 1, 0.1, 30)

  let current: Rig | null = null
  const hide = (o: Object3D | undefined): void => {
    if (o) o.visible = false
  }

  function show(s: PortraitSubject): void {
    if (current) {
      scene.remove(current.group)
      current.dispose()
    }
    const rig = build(s)
    current = rig
    for (const j of ['weapon', 'offhand', 'handL', 'handR'] as const) hide(rig.joints[j])
    rig.group.rotation.y = YAW
    scene.add(rig.group)
    rig.group.updateMatrixWorld(true)
    // frame the head: the head sphere is 0.36 across (D.headR 0.18) at 0.14 above the head joint, times the body scale (the brothers differ in height);
    // the face sits in the upper middle and the shoulders fill the foot. A tall hat or plume may crop, which suits a bust.
    const hp = rig.joints.head.getWorldPosition(new Vector3())
    const k = rig.joints.head.getWorldScale(new Vector3()).y
    const view = 0.78 * k
    const cx = hp.x
    const cy = hp.y + 0.14 * k - 0.055 * k
    const dist = view / 2 / Math.tan((cam.fov * Math.PI) / 360)
    cam.position.set(cx, cy + view * 0.03, hp.z + dist)
    cam.lookAt(cx, cy, hp.z)
    cam.updateProjectionMatrix()
    renderer.render(scene, cam)
  }

  const out = document.createElement('canvas')
  out.width = out.height = px

  function compose(s: PortraitSubject, target: CanvasRenderingContext2D, ox: number, oy: number, size: number): void {
    show(s)
    const tmp = document.createElement('canvas')
    tmp.width = tmp.height = px
    const t = tmp.getContext('2d')!
    backdrop(t, s.side, px)
    t.imageSmoothingQuality = 'high'
    t.drawImage(renderer.domElement, 0, 0, px, px)
    vignette(t, px)
    target.drawImage(tmp, ox, oy, size, size)
  }

  const api = {
    ready: true,
    subjects: () => subjects,
    render(id: string): string {
      const s = subjects.find((x) => x.id === id)
      if (!s) throw new Error(`no portrait subject ${id}`)
      const ctx = out.getContext('2d')!
      ctx.clearRect(0, 0, px, px)
      compose(s, ctx, 0, 0, px)
      return out.toDataURL('image/webp', 0.82)
    },
    sheet(): string {
      const cols = 12
      const cell = 128
      const rows = Math.ceil(subjects.length / cols)
      const sheet = document.createElement('canvas')
      sheet.width = cols * cell
      sheet.height = rows * cell
      const ctx = sheet.getContext('2d')!
      ctx.fillStyle = '#14100d'
      ctx.fillRect(0, 0, sheet.width, sheet.height)
      subjects.forEach((s, i) => compose(s, ctx, (i % cols) * cell, Math.floor(i / cols) * cell, cell))
      return sheet.toDataURL('image/png')
    },
  }
  ;(window as unknown as { __portrait: typeof api }).__portrait = api

  const q = new URLSearchParams(window.location.search)
  document.body.style.cssText = 'margin:0;background:#14100d;display:grid;place-items:center;min-height:100vh'
  const img = document.createElement('img')
  img.style.cssText = 'max-width:100vw;max-height:100vh;image-rendering:auto'
  document.getElementById('root')!.replaceWith(img)
  if (q.get('sheet') === '1') img.src = api.sheet()
  else img.src = api.render(q.get('id') ?? 'guan-yu')
}
