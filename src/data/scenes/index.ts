// Story scenes. Content builders replace the individual .json files; this index stays as it is.
import prologue from './prologue.json'
import epilogue from './epilogue.json'
import daxingHill from './daxing-hill.json'
import qingzhou from './qingzhou.json'
import guangzong from './guangzong.json'
import hulaoGate from './hulao-gate.json'
import xuzhou from './xuzhou.json'
import xiapi from './xiapi.json'
import bowang from './bowang.json'
import changban from './changban.json'
import redCliffs from './red-cliffs.json'

export interface SceneLine {
  /** An officer id or 'narrator'. */
  speaker: string
  text: string
}
export interface SceneDef {
  pre: SceneLine[]
  post: SceneLine[]
  stub?: boolean
}

export const SCENES: Record<string, SceneDef> = {
  prologue: prologue as SceneDef,
  epilogue: epilogue as SceneDef,
  'daxing-hill': daxingHill as SceneDef,
  qingzhou: qingzhou as SceneDef,
  guangzong: guangzong as SceneDef,
  'hulao-gate': hulaoGate as SceneDef,
  xuzhou: xuzhou as SceneDef,
  xiapi: xiapi as SceneDef,
  bowang: bowang as SceneDef,
  changban: changban as SceneDef,
  'red-cliffs': redCliffs as SceneDef,
}

export function getScene(id: string): SceneDef | undefined {
  return SCENES[id]
}
