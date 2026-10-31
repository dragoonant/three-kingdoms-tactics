// Pure game engine: no DOM, no React, no three.js imports. Public API per docs/spec/00-architecture.md.

export const ENGINE_VERSION = '0.2.0'

export { makeGrid, inBounds } from './board'
export { createBattle, createBattleFromDef } from './create'
export { legalActions } from './legal'
export { step } from './step'
export { query } from './query'
export { replay } from './replay'
export { seedRng, nextFloat } from './rng'
export { arcOf, facingToward, manhattan, FACINGS, DIRS } from './geometry'
export { windFactor } from './fire'
export type * from './types'
export { EVENT_KINDS } from './types'
