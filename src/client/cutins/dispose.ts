// Disposing a world's rigs when it unmounts. `rig.dispose()` detaches the figure from its parent, so it must not run in the
// simulated unmount that React StrictMode (the game in dev) performs straight after mounting. The disposal is therefore
// deferred a tick and cancelled if the effect mounts again for the same world.
import { useEffect } from 'react'

export function useDisposeWorld(world: object, dispose: () => void): void {
  useEffect(() => {
    let alive = true
    ;(world as { __alive?: boolean }).__alive = true
    return () => {
      alive = false
      ;(world as { __alive?: boolean }).__alive = false
      setTimeout(() => {
        if (!alive && !(world as { __alive?: boolean }).__alive) dispose()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world])
}
