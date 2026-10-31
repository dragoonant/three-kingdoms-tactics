// Map camera: fitted so the whole 14x12 board sits inside the free part of the window, orbit/zoom/pan clamped.
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import { BOARD_H, BOARD_W, tileX, tileZ, viewApi } from './layout'

export interface Insets {
  left: number
  right: number
  top: number
  bottom: number
}

export function insetsFor(width: number, height: number, mode: 'title' | 'battle'): Insets {
  if (mode === 'title') {
    return width >= 800 ? { left: width * 0.34, right: 20, top: 30, bottom: 30 } : { left: 8, right: 8, top: height * 0.42, bottom: 20 }
  }
  if (width >= 800) return { left: 12, right: 312, top: 132, bottom: 196 }
  return { left: 6, right: 6, top: 118, bottom: Math.round(height * 0.4) }
}

const POLAR = 0.78 // radians from straight down
const CORNERS: [number, number, number][] = []
for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 1.5]) CORNERS.push([sx * (BOARD_W / 2 + 0.55), y, sz * (BOARD_H / 2 + 0.55)])

function projectedBounds(cam: PerspectiveCamera, dist: number, az: number): { minx: number; maxx: number; miny: number; maxy: number } {
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
  for (const c of CORNERS) {
    v.set(c[0], c[1], c[2]).project(cam)
    minx = Math.min(minx, v.x)
    maxx = Math.max(maxx, v.x)
    miny = Math.min(miny, v.y)
    maxy = Math.max(maxy, v.y)
  }
  return { minx, maxx, miny, maxy }
}

/** Distance and pixel shift that place the board inside the inset rectangle. */
export function fitBoard(fov: number, w: number, h: number, ins: Insets, az: number): { dist: number; shiftX: number; shiftY: number } {
  const cam = new PerspectiveCamera(fov, w / h, 0.5, 200)
  const freeW = Math.max(120, w - ins.left - ins.right)
  const freeH = Math.max(120, h - ins.top - ins.bottom)
  let lo = 6
  let hi = 90
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    const b = projectedBounds(cam, mid, az)
    const pw = ((b.maxx - b.minx) / 2) * w
    const ph = ((b.maxy - b.miny) / 2) * h
    if (pw <= freeW && ph <= freeH) hi = mid
    else lo = mid
  }
  const dist = hi
  const b = projectedBounds(cam, dist, az)
  const cx = w / 2 + ((b.minx + b.maxx) / 2) * (w / 2)
  const cy = h / 2 - ((b.miny + b.maxy) / 2) * (h / 2)
  const wantX = ins.left + freeW / 2
  const wantY = ins.top + freeH / 2
  return { dist, shiftX: wantX - cx, shiftY: wantY - cy }
}

export function CameraRig({ mode, tops, unitPos }: { mode: 'title' | 'battle'; tops: (x: number, y: number) => number; unitPos: (id: string) => { x: number; y: number } | null }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const { camera, size, gl } = useThree()
  const az = useRef(0)
  const dist0 = useRef(20)

  useEffect(() => {
    const cam = camera as PerspectiveCamera
    const ins = insetsFor(size.width, size.height, mode)
    const fit = fitBoard(cam.fov, size.width, size.height, ins, az.current)
    dist0.current = fit.dist
    const dir = new Vector3(Math.sin(az.current) * Math.sin(POLAR), Math.cos(POLAR), Math.cos(az.current) * Math.sin(POLAR))
    cam.position.copy(dir).multiplyScalar(fit.dist)
    cam.lookAt(0, 0, 0)
    cam.setViewOffset(size.width, size.height, -fit.shiftX, -fit.shiftY, size.width, size.height)
    cam.updateProjectionMatrix()
    const c = controls.current
    if (c) {
      c.target.set(0, 0, 0)
      c.minDistance = fit.dist * 0.5
      c.maxDistance = fit.dist * 1.35
      c.update()
    }
  }, [camera, size.width, size.height, mode])

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
    viewApi.rotate = (dir) => {
      const c = controls.current
      if (!c) return
      const off = camera.position.clone().sub(c.target)
      const a = (dir * Math.PI) / 8
      const cs = Math.cos(a)
      const sn = Math.sin(a)
      const x = off.x * cs + off.z * sn
      const z = -off.x * sn + off.z * cs
      camera.position.set(c.target.x + x, camera.position.y, c.target.z + z)
      c.update()
    }
  }, [camera, gl, tops, unitPos])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    // keep the pan target over the board
    const t = c.target
    const cx = Math.max(-5, Math.min(5, t.x))
    const cz = Math.max(-4.5, Math.min(4.5, t.z))
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x
      camera.position.z += cz - t.z
      t.x = cx
      t.z = cz
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return
      if (e.key === 'q' || e.key === 'Q') viewApi.rotate(-1)
      if (e.key === 'e' || e.key === 'E') viewApi.rotate(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enabled={mode === 'battle'}
      autoRotate={mode === 'title'}
      autoRotateSpeed={0.5}
      enableDamping
      dampingFactor={0.12}
      enablePan
      screenSpacePanning={false}
      minPolarAngle={0.25}
      maxPolarAngle={1.18}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
    />
  )
}
