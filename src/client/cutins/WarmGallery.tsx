// The warm-up gallery (docs/spec/51 "Performance: warm-up and reuse"): every officer figure, troop crowd and ground this battle
// can show, stood on the stage under the cut-in lights, so one compile pass and one hidden draw create their shader programs,
// upload their shared geometry and bake their crowds before the first turn. Never on screen.
import { useEffect, useMemo } from 'react'
import type { Object3D } from 'three'
import { buildCasterRig } from './casters'
import { createCrowd } from './crowd'
import { useDisposeWorld } from './dispose'
import type { GallerySpec } from './prep'
import { fitFigure } from './poseKit'
import { spawnTroop } from './scenes/formation'

/** formation.ts spawnFormation picks variants 0..2. */
const TROOP_VARIANTS = 3
import { Ground } from './stage/Ground'
import { PadLights, POINT_LIGHTS, Stage } from './stage/Stage'

const NO_CLEAR: { x: number; z: number; r: number }[] = []

export function WarmGallery({ spec, onMount }: { spec: GallerySpec; onMount?: () => void }) {
  const world = useMemo(() => {
    const rigs = spec.actors.map(({ actor, mounted }, i) => {
      const rig = buildCasterRig(actor, mounted)
      fitFigure(rig)
      rig.group.position.set(-5 + (i % 12) * 0.85, 0, -3 + Math.floor(i / 12) * 1.1)
      return rig
    })
    // every troop variant of every crowd kind as a compacted rig too: the scenes' hand-posed front ranks pick variants by seed,
    // and each variant's merged geometry (figures/compact.ts) is uploaded here rather than on the cut-in's first frame
    spec.crowds.forEach((c, i) => {
      for (let v = 0; v < TROOP_VARIANTS; v++) {
        const rig = spawnTroop(c.kind, c.palette, v)
        fitFigure(rig)
        rig.group.position.set(-5 + (i % 8) * 1.4 + v * 0.4, 0, -1.5 + Math.floor(i / 8) * 1.6)
        rigs.push(rig)
      }
    })
    const crowds = spec.crowds.map((c, i) =>
      createCrowd({ kind: c.kind, side: c.palette, count: 6, seed: 11 + i, frontRankFull: 1, variants: 2, detail: 'lo', castShadow: true, origin: [-5 + (i % 8) * 1.4, 0, 1 + Math.floor(i / 8) * 1.6] }),
    )
    return { rigs, crowds }
  }, [spec])
  useEffect(() => {
    onMount?.()
  }, [onMount])
  useDisposeWorld(world, () => {
    world.rigs.forEach((r) => r.dispose())
    world.crowds.forEach((c) => c.dispose())
  })
  return (
    <group>
      <Stage seed={1} focus={[0, 0]} />
      <PadLights n={POINT_LIGHTS} />
      {spec.grounds.map((g, i) => (
        <Ground key={g} kind={g} seed={3 + i} center={[-4 + i * 2.2, 4]} halfW={1} halfD={0.6} clear={NO_CLEAR} />
      ))}
      {world.rigs.map((r, i) => (
        <primitive key={`r${i}`} object={r.group as Object3D} />
      ))}
      {world.crowds.map((c, i) => (
        <primitive key={`c${i}`} object={c.group as Object3D} />
      ))}
    </group>
  )
}
