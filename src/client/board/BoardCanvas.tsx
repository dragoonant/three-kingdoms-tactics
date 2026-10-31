import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three'
import { getBattleDef } from '../../data'
import { query } from '../../engine'
import { useGame, TEST_MODE } from '../store/game'
import { canControl } from '../store/orders'
import { CameraRig } from './CameraRig'
import { BeatFx, Flames, Floaters, Incense, Marks, Pennant, Smoke, useBurnTiles, windVector } from './Effects'
import { Figure } from './Figure'
import { BOARD_H, BOARD_W, BRIDGE_TOP, COLORS, TOP, tileX, tileZ } from './layout'
import { computeMarks } from './marks'
import { Stage } from './Stage'
import { Terrain } from './Terrain'

const BRIDGES = getBattleDef('daxing-hill')?.bridges ?? []

const Q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
const AA = Q.get('aa') !== '0'
const SHADOWS = Q.get('shadows') !== '0'

export function BoardCanvas() {
  const scene = useGame((s) => s.scene)
  const state = useGame((s) => s.state)
  const ui = useGame((s) => s.ui)
  const playing = useGame((s) => s.playing)
  const screen = useGame((s) => s.screen)
  const beat = useGame((s) => s.beat)
  const floaters = useGame((s) => s.floaters)
  const clickTile = useGame((s) => s.clickTile)
  const hoverTile = useGame((s) => s.hoverTile)

  const tops = useCallback(
    (x: number, y: number): number => {
      if (BRIDGES.some((b) => b.x === x && b.y === y)) return BRIDGE_TOP
      const t = scene.terrain[y * BOARD_W + x]
      return t ? TOP[t] : 0
    },
    [scene.terrain],
  )
  const unitPos = useCallback((id: string) => scene.units.find((u) => u.id === id) ?? null, [scene.units])

  const interactive = screen === 'battle' && !playing
  const marks = useMemo(() => computeMarks(state, ui, interactive), [state, ui, interactive])
  const burnTiles = useBurnTiles(scene.burning, BOARD_W)
  const sel = state.units.find((u) => u.id === ui.selectedId)
  const targetIds = useMemo(() => {
    if (!interactive || !sel || !canControl(state, sel)) return new Set<string>()
    if (ui.mode === 'attack') return new Set(query.attackTargets(state, sel.id))
    if (ui.mode === 'sway') return new Set(query.swayTargets(state, sel.id))
    return new Set<string>()
  }, [interactive, sel, state, ui.mode])
  const actableIds = useMemo(
    () => new Set(interactive ? state.units.filter((u) => canControl(state, u)).map((u) => u.id) : []),
    [interactive, state],
  )

  const wv = windVector(scene.wind)
  const flameEmit = useMemo(() => burnTiles.map((p): [number, number, number] => [tileX(p.x), tops(p.x, p.y) + 0.35, tileZ(p.y)]), [burnTiles, tops])
  const onHover = useCallback((x: number, y: number) => hoverTile(x, y), [hoverTile])
  const onLeave = useCallback(() => hoverTile(0, null), [hoverTile])

  useEffect(() => {
    if (!TEST_MODE) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => (window.__app = { ready: true })))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <Canvas
      shadows={SHADOWS ? { type: PCFShadowMap } : false}
      dpr={[1, 1.5]}
      camera={{ fov: 36, near: 0.5, far: 140, position: [0, 14, 14] }}
      gl={{ antialias: AA, preserveDrawingBuffer: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
      style={{ position: 'fixed', inset: 0, background: COLORS.night }}
      onPointerMissed={() => {
        const st = useGame.getState()
        if (!st.playing && st.screen === 'battle') st.cancel()
      }}
    >
      <color attach="background" args={[COLORS.night]} />
      <fog attach="fog" args={[COLORS.night, 34, 80]} />
      <Stage />
      <Terrain terrain={scene.terrain} bridges={BRIDGES} onHover={onHover} onPick={clickTile} onLeave={onLeave} />
      {scene.units.map((u) => (
        <Figure
          key={u.id}
          unit={u}
          top={tops(u.x, u.y)}
          tops={tops}
          actable={actableIds.has(u.id)}
          selected={interactive && ui.selectedId === u.id}
          targeted={targetIds.has(u.id)}
          onPick={clickTile}
          onHover={onHover}
          onLeave={onLeave}
        />
      ))}
      <Marks marks={marks} tops={tops} />
      <Flames tiles={burnTiles} tops={tops} />
      <Smoke emitters={flameEmit} drift={[wv[0] * 0.8, wv[1] * 0.8]} color="#2a2420" size={0.9} rise={1.8} per={3} opacity={0.4} />
      <Pennant wind={scene.wind} position={[-BOARD_W / 2 - 0.95, 0, BOARD_H / 2 + 0.9]} />
      <Incense position={[BOARD_W / 2 + 1.0, -0.08, BOARD_H / 2 + 0.95]} wind={scene.wind} />
      <BeatFx beat={beat} tops={tops} />
      <Floaters items={floaters} tops={tops} />
      <CameraRig mode={screen === 'title' ? 'title' : 'battle'} tops={tops} unitPos={unitPos} />
    </Canvas>
  )
}
