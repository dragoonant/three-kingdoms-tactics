import { Canvas } from '@react-three/fiber'
import { useCallback, useEffect, useMemo } from 'react'
import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace } from 'three'
import { getBattleDef } from '../../data'
import { exitTiles, query } from '../../engine'
import { useCampaign } from '../store/campaign'
import { useGame, TEST_MODE, type Screen } from '../store/game'
import { canControl } from '../store/orders'
import { CameraRig, type CamMode } from './CameraRig'
import { DeployMarkers } from './DeployMarkers'
import { BeatFx, Flames, Floaters, Incense, Marks, Pennant, Smoke, TerrainChangeFx, useBurnTiles, windVector } from './Effects'
import { Figure } from './Figure'
import { isTap } from './gesture'
import { COLORS, sideColour, tileX, tileZ } from './layout'
import { computeMarks } from './marks'
import { Stage } from './Stage'
import { Terrain } from './Terrain'
import { gateIsOpenFor, tileTop } from './terrainModel'

const NO_BRIDGES: { x: number; y: number }[] = []

function camMode(screen: Screen): CamMode {
  switch (screen) {
    case 'battle':
    case 'end':
      return 'battle'
    case 'title':
    case 'howto':
      return 'title'
    case 'scene':
      return 'scene'
    case 'deploy':
      return 'deploy'
    default:
      return 'backdrop'
  }
}

const Q = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
const AA = Q.get('aa') !== '0'
const SHADOWS = Q.get('shadows') !== '0'

export function BoardCanvas() {
  const scene = useGame((s) => s.scene)
  const state = useGame((s) => s.state)
  const ui = useGame((s) => s.ui)
  const playing = useGame((s) => s.playing)
  const cutinPaused = useGame((s) => s.cutinPaused)
  const screen = useGame((s) => s.screen)
  const beat = useGame((s) => s.beat)
  const floaters = useGame((s) => s.floaters)
  const clickTile = useGame((s) => s.clickTile)
  const hoverTile = useGame((s) => s.hoverTile)

  const W = scene.width
  const H = scene.height
  const bridges = useMemo(() => getBattleDef(state.battleId)?.bridges ?? NO_BRIDGES, [state.battleId])
  const exits = useMemo(() => exitTiles(state), [state])
  const grid = useMemo(() => ({ terrain: scene.terrain, width: W, height: H }), [scene.terrain, W, H])
  const tops = useCallback((x: number, y: number): number => tileTop(grid, bridges, x, y), [grid, bridges])
  const deployMarks = useCampaign((c) => c.deployMarkers)
  const gateColour = sideColour(state.gateOwner ?? 'han')
  const gateOpen = gateIsOpenFor(state.gateOwner, 'han')
  const fx = beat?.fx
  const arriving = fx && fx.t === 'arrive' && !scene.units.some((u) => u.id === fx.unit) ? fx.vis : null
  const unitPos = useCallback((id: string) => scene.units.find((u) => u.id === id) ?? null, [scene.units])

  const interactive = screen === 'battle' && !playing
  const marks = useMemo(() => computeMarks(state, ui, interactive), [state, ui, interactive])
  const burnTiles = useBurnTiles(scene.burning, W)
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
  // a camera drag or pinch ends in a click too: only a tap (moved < 8 px, one finger) selects or acts
  const pick = useCallback((x: number, y: number) => {
    if (isTap()) clickTile(x, y)
  }, [clickTile])
  const onHover = useCallback((x: number, y: number) => hoverTile(x, y), [hoverTile])
  const onLeave = useCallback(() => hoverTile(0, null), [hoverTile])

  useEffect(() => {
    if (!TEST_MODE) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => (window.__app = { ready: true })))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <Canvas
      // a cut-in covers the board: it stops drawing until the result lands, so only one WebGL scene is busy at a time
      frameloop={cutinPaused ? 'never' : 'always'}
      shadows={SHADOWS ? { type: PCFShadowMap } : false}
      dpr={[1, 1.5]}
      camera={{ fov: 36, near: 0.5, far: 140, position: [0, 14, 14] }}
      gl={{ antialias: AA, preserveDrawingBuffer: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
      style={{ position: 'fixed', inset: 0, background: COLORS.night }}
      onPointerMissed={() => {
        const st = useGame.getState()
        if (isTap() && !st.playing && st.screen === 'battle') st.cancel()
      }}
    >
      <color attach="background" args={[COLORS.night]} />
      <fog attach="fog" args={[COLORS.night, 36, 84]} />
      <Stage width={W} height={H} />
      <Terrain
        terrain={scene.terrain}
        width={W}
        height={H}
        bridges={bridges}
        exits={exits}
        gateColour={gateColour}
        gateOpen={gateOpen}
        onHover={onHover}
        onPick={pick}
        onLeave={onLeave}
      />
      <TerrainChangeFx terrain={scene.terrain} width={W} tops={tops} />
      {arriving && (
        <Figure
          key={`arriving-${arriving.id}`}
          unit={arriving}
          top={tops(arriving.x, arriving.y)}
          tops={tops}
          actable={false}
          selected={false}
          targeted={false}
          onPick={pick}
          onHover={onHover}
          onLeave={onLeave}
        />
      )}
      {scene.units.map((u) => (
        <Figure
          key={u.id}
          unit={u}
          top={tops(u.x, u.y)}
          tops={tops}
          actable={actableIds.has(u.id)}
          selected={interactive && ui.selectedId === u.id}
          targeted={targetIds.has(u.id)}
          onPick={pick}
          onHover={onHover}
          onLeave={onLeave}
        />
      ))}
      <Marks marks={marks} tops={tops} />
      <Flames tiles={burnTiles} tops={tops} />
      <Smoke emitters={flameEmit} drift={[wv[0] * 0.8, wv[1] * 0.8]} color="#2a2420" size={0.9} rise={1.8} per={3} opacity={0.4} />
      <Pennant wind={scene.wind} position={[-W / 2 - 0.95, 0, H / 2 + 0.9]} />
      <Incense position={[W / 2 + 1.0, -0.08, H / 2 + 0.95]} wind={scene.wind} />
      {screen === 'deploy' && <DeployMarkers marks={deployMarks} tops={tops} />}
      <BeatFx beat={beat} tops={tops} />
      <Floaters items={floaters} tops={tops} />
      <CameraRig mode={camMode(screen)} width={W} height={H} tops={tops} unitPos={unitPos} />
    </Canvas>
  )
}
