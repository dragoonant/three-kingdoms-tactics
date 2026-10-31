// Battle registry. Content builders replace the individual .json files; this index stays as it is.
import type { BattleDef } from '../types'
import daxingHill from './daxing-hill.json'
import qingzhou from './qingzhou.json'
import guangzong from './guangzong.json'
import hulaoGate from './hulao-gate.json'
import xuzhou from './xuzhou.json'
import xiapi from './xiapi.json'
import bowang from './bowang.json'
import changban from './changban.json'
import redCliffs from './red-cliffs.json'
import provingGround from './proving-ground.json'

export const BATTLE_REGISTRY: Record<string, BattleDef> = {
  'daxing-hill': daxingHill as unknown as BattleDef,
  qingzhou: qingzhou as unknown as BattleDef,
  guangzong: guangzong as unknown as BattleDef,
  'hulao-gate': hulaoGate as unknown as BattleDef,
  xuzhou: xuzhou as unknown as BattleDef,
  xiapi: xiapi as unknown as BattleDef,
  bowang: bowang as unknown as BattleDef,
  changban: changban as unknown as BattleDef,
  'red-cliffs': redCliffs as unknown as BattleDef,
  // Not part of the campaign arc: exercises every engine v2 mechanic (tests and sim).
  'proving-ground': provingGround as unknown as BattleDef,
}
