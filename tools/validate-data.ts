import { validateData, listBattleIds, ALL_OFFICERS, ALL_STRATAGEMS } from '../src/data'

const errors = validateData()
if (errors.length > 0) {
  console.error(`data validation FAILED (${errors.length} problems):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`data ok: ${ALL_OFFICERS.length} officers, ${ALL_STRATAGEMS.length} stratagems, battles: ${listBattleIds().join(', ')}`)
