// Map camera: fitted so the whole board sits inside the free part of the window; pan, rotate and zoom are the MapController's (touch and mouse, clamped).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { distFor } from './cameraModel'
import { frameCorners, panLimits, tileAt } from './frame'
import { tileX, tileZ, viewApi } from './layout'
import { MapController } from './mapController'

export interface Insets {
  left: number
  right: number
  top: number
  bottom: number
}

export type CamMode = 'title' | 'battle' | 'scene' | 'backdrop' | 'deploy'

/** Pixels of the window the HUD leaves for the board, per screen. Pure, so the framing is unit-tested. */
export function insetsFor(width: number, height: number, mode: CamMode): Insets {
  if (mode === 'title') {
    return width >= 800 ? { left: width * 0.34, right: 20, top: 30, bottom: 30 } : { left: 8, right: 8, top: height * 0.42, bottom: 20 }
  }
  if (mode === 'scene') return width >= 800 ? { left: 40, right: 40, top: 30, bottom: 250 } : { left: 8, right: 8, top: 40, bottom: Math.round(height * 0.42) }
  if (mode === 'backdrop') return { left: 20, right: 20, top: 20, bottom: 20 }
  if (mode === 'deploy') return width >= 800 ? { left: 20, right: 400, top: 80, bottom: 70 } : { left: 6, right: 6, top: 60, bottom: Math.round(height * 0.5) }
  // the unit card and the action slips are small: a 252 px column at the right and a slim bar (card + slips, about 130 px) at the foot of a phone
  if (width >= 800) return { left: 12, right: 276, top: 140, bottom: 160 }
  return { left: 6, right: 6, top: 156, bottom: Math.max(150, Math.round(height * 0.2)) }
}

const POLAR = 0.78 // radians from straight down

function projectedBounds(cam: PerspectiveCamera, dist: number, az: number, corners: [number, number, number][]): { minx: number; maxx: number; miny: number; maxy: number } {
  const dir = new Vector3(Math.sin(az) * Math.sin(POLAR), Math.cos(POLAR), Math.cos(az) * Math.sin(POLAR))
  cam.position.copy(dir).multiplyScalar(dist)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  let minx = Infinity
  let maxx = -Infinity
  let miny = Infinity
  let maxy = -Infinity
  const v = new Vector3()
  for (const c of corners) {
    v.set(c[0], c[1], c[2]).project(cam)
    minx = Math.min(minx, v.x)
    maxx = Math.max(maxx, v.x)
    miny = Math.min(miny, v.y)
    maxy = Math.max(maxy, v.y)
  }
  return { minx, maxx, miny, maxy }
}

/** Distance and pixel shift that place the board inside the inset rectangle. */
export function fitBoard(fov: number, w: number, h: number, ins: Insets, az: number, bw = 14, bh = 12): { dist: number; shiftX: number; shiftY: number } {
  const corners = frameCorners(bw, bh)
  const cam = new PerspectiveCamera(fov, w / h, 0.5, 200)
  const freeW = Math.max(120, w - ins.left - ins.right)
  const freeH = Math.max(120, h - ins.top - ins.bottom)
  let lo = 6
  let hi = 90
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    const b = projectedBounds(cam, mid, az, corners)
    const pw = ((b.maxx - b.minx) / 2) * w
    const ph = ((b.maxy - b.miny) / 2) * h
    if (pw <= freeW && ph <= freeH) hi = mid
    else lo = mid
  }
  const dist = hi
  const b = projectedBounds(cam, dist, az, corners)
  const cx = w / 2 + ((b.minx + b.maxx) / 2) * (w / 2)
  const cy = h / 2 - ((b.miny + b.maxy) / 2) * (h / 2)
  const wantX = ins.left + freeW / 2
  const wantY = ins.top + freeH / 2
  return { dist, shiftX: wantX - cx, shiftY: wantY - cy }
}

export function CameraRig({ mode, width, height, tops, unitPos }: { mode: CamMode; width: number; height: number; tops: (x: number, y: number) => number; unitPos: (id: string) => { x: number; y: number } | null }) {
  const { camera, size, gl } = useThree()
  const ctl = useMemo(() => new MapController(camera as PerspectiveCamera, gl.domElement), [camera, gl])

  useEffect(() => {
    ctl.attach()
    return () => ctl.detach()
  }, [ctl])

  // the highest surface at a world point: the camera never dips below it
  useEffect(() => {
    ctl.surface = (x, z) => {
      if (Math.abs(x) > width / 2 + 0.3 || Math.abs(z) > height / 2 + 0.3) return 0
      const t = tileAt(x, z, width, height)
      return tops(t.x, t.y)
    }
  }, [ctl, tops, width, height])

  // fit the board to the free part of the window (again on every resize); a new screen or a new board starts from the overview
  useEffect(() => {
    const cam = camera as PerspectiveCamera
    const ins = insetsFor(size.width, size.height, mode)
    const fit = fitBoard(cam.fov, size.width, size.height, ins, 0, width, height)
    const freeW = Math.max(120, size.width - ins.left - ins.right)
    const freeH = Math.max(120, size.height - ins.top - ins.bottom)
    ctl.interactive = mode === 'battle' || mode === 'deploy'
    ctl.autoRotate = mode === 'title' || mode === 'scene' || mode === 'backdrop'
    ctl.lim = panLimits(width, height)
    ctl.setFit({ overview: fit.dist, shiftX: fit.shiftX, shiftY: fit.shiftY, centreX: ins.left + freeW / 2 - size.width / 2, centreY: ins.top + freeH / 2 - size.height / 2 })
  }, [ctl, camera, size.width, size.height, mode, width, height])
  useEffect(() => {
    ctl.reset(false)
  }, [ctl, mode, width, height])

  useEffect(() => {
    const project = (x: number, y: number, z: number): { x: number; y: number } | null => {
      const cam = camera as PerspectiveCamera
      cam.updateMatrixWorld(true)
      const v = new Vector3(x, y, z).project(cam)
      const r = gl.domElement.getBoundingClientRect()
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
    }
    viewApi.tileToScreen = (x, y) => project(tileX(x), tops(x, y) + 0.1, tileZ(y))
    viewApi.unitToScreen = (id) => {
      const p = unitPos(id)
      return p ? project(tileX(p.x), tops(p.x, p.y) + 0.45, tileZ(p.y)) : null
    }
    viewApi.rotate = (dir) => ctl.rotateBy(dir)
    viewApi.reset = () => ctl.flyHome()
    viewApi.camera = () => {
      const v = ctl.view
      const c = camera.position
      return { x: c.x, y: c.y, z: c.z, tx: v.x, tz: v.z, az: v.az, zoom: v.zoom, tilt: v.tilt, dist: distFor(v.zoom, ctl.fit.overview), near: (camera as PerspectiveCamera).near }
    }
    viewApi.setView = (p) => ctl.setView(p)
    viewApi.focusUnit = (id, zoom = 1) => {
      const p = unitPos(id)
      if (p) ctl.flyTo(tileX(p.x), tileZ(p.y), zoom)
    }
  }, [camera, gl, ctl, tops, unitPos])

  useFrame((_, dt) => ctl.update(Math.min(dt, 0.1)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return
      if (e.key === 'q' || e.key === 'Q') viewApi.rotate(-1)
      if (e.key === 'e' || e.key === 'E') viewApi.rotate(1)
      if (e.key === 'r' || e.key === 'R' || e.key === 'Home') viewApi.reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}
