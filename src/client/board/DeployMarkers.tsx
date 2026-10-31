// Numbered start tiles on the sand for the deploy screen: a lantern ring on the tile and a numbered bamboo disc above it.
import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { DoubleSide, MeshBasicMaterial, RingGeometry } from 'three'
import type { DeployMark } from '../store/campaign'
import { COLORS, tileX, tileZ } from './layout'

const ring = new RingGeometry(0.34, 0.45, 32).rotateX(-Math.PI / 2)

export function DeployMarkers({ marks, tops }: { marks: DeployMark[]; tops: (x: number, y: number) => number }) {
  const mat = useMemo(() => new MeshBasicMaterial({ color: COLORS.lantern, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }), [])
  return (
    <group>
      {marks.map((m) => (
        <group key={`${m.n}-${m.x}-${m.y}`} position={[tileX(m.x), tops(m.x, m.y) + 0.04, tileZ(m.y)]}>
          <mesh geometry={ring} material={mat} raycast={() => null} renderOrder={5} />
          <Html position={[0, 0.95, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`deploy-mark ${m.kind}${m.officer ? ' filled' : ''}`} data-testid={`deploy-mark-${m.n}`}>
              <b>{m.n}</b>
              {m.label && <span>{m.label}</span>}
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}
