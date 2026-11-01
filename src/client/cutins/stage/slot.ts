// A world mounted in a hidden slot of the persistent cut-in canvas (prebuilt, or warming up) must not animate: every cut-in
// component reads the clock through useCutinFrame, which skips the callback unless its slot is the one on screen. Outside a
// slot (the review page, the capture tools) the context's default is "active", so nothing changes there.
import { useFrame, type RootState } from '@react-three/fiber'
import { createContext, useContext, type MutableRefObject } from 'react'

export const SlotContext = createContext<MutableRefObject<boolean>>({ current: true })

export function useCutinFrame(cb: (state: RootState, delta: number) => void): void {
  const active = useContext(SlotContext)
  useFrame((s, d) => {
    if (active.current) cb(s, d)
  })
}
