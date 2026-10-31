import { describe, expect, it } from 'vitest'
import { newCampaign, makeRecord, MAX_CARRIED_STRATAGEMS } from '../../src/campaign'
import { ARC, getBattleDef } from '../../src/data'
import { createBattle, query } from '../../src/engine'
import {
  battleSeed,
  briefingKicker,
  buffChips,
  deployMarks,
  defaultPick,
  isGuestUnit,
  lyingInWait,
  normaliseLoadout,
  retreatText,
  slotEntry,
  statLine,
  timelineLabel,
  togglePick,
  toggleStratagem,
  trackerHeadline,
  trackerLines,
  windScheduleText,
} from '../../src/client/campaign/helpers'
import { GAME_DATA } from '../../src/data'

describe('C-OBJ the objective tracker shows the engine text and only derives the progress bar', () => {
  it('C-OBJ-1 every status of the proving ground maps to a line with the engine text and a 0..1 fraction where the engine has numbers', () => {
    const s = createBattle('proving-ground', 1)
    const st = query.objectives(s)
    const lines = trackerLines(st)
    expect(lines).toHaveLength(st.length)
    lines.forEach((l, i) => {
      expect(l.text).toBe(st[i]!.text)
      expect(l.side).toBe(st[i]!.side)
      if (st[i]!.current !== null && st[i]!.target !== null) {
        expect(l.progress).toBeGreaterThanOrEqual(0)
        expect(l.progress).toBeLessThanOrEqual(1)
        expect(l.progress).toBeCloseTo(st[i]!.current! / st[i]!.target!, 9)
      } else expect(l.progress).toBeNull()
    })
    expect(lines.some((l) => l.text.includes('Escaped 0 / 2'))).toBe(true)
    expect(trackerHeadline(lines)).toBe(lines.find((l) => l.side === 'win')!.text)
    expect(trackerHeadline([])).toBe('')
  })

  it('C-OBJ-2 the timeline preview labels carry round, phase and the engine text', () => {
    const s = createBattle('proving-ground', 1)
    const items = query.timelinePreview(s, 8)
    expect(items.length).toBeGreaterThan(2)
    for (const it of items) {
      const l = timelineLabel(it)
      expect(l.startsWith(`Round ${it.round}`)).toBe(true)
      expect(l.endsWith(it.text)).toBe(true)
    }
    expect(items.some((i) => i.kind === 'reinforcement')).toBe(true)
  })
})

describe('C-STATUS unit panel status lines', () => {
  it('C-STATUS-1 retreat threshold, ambush and guest tags come from the unit and the battle data', () => {
    const s = createBattle('proving-ground', 1)
    const lu = s.units.find((u) => u.id === 'lu-bu')!
    expect(retreatText(lu)).toBe('Retreats at 50%')
    expect(retreatText(s.units.find((u) => u.id === 'liu-bei')!)).toBeNull()
    // pg-marine is `ambush:3`; it lies in wait until a player unit is within 3 tiles or it is hurt
    const marine = s.units.find((u) => u.id === 'pg-marine')!
    expect(lyingInWait(s, marine)).toBe(true)
    expect(lyingInWait(s, { ...marine, troops: marine.troops - 10 })).toBe(false)
    const near = { ...s, units: s.units.map((u) => (u.id === 'liu-bei' ? { ...u, x: marine.x - 2, y: marine.y } : u)) }
    expect(lyingInWait(near, marine)).toBe(false)
    expect(lyingInWait(s, s.units.find((u) => u.id === 'xiahou-dun')!)).toBe(false)
    expect(isGuestUnit(s, s.units.find((u) => u.id === 'zou-jing')!)).toBe(true)
    expect(isGuestUnit(s, s.units.find((u) => u.id === 'liu-bei')!)).toBe(false)
  })

  it('C-STATUS-2 buff chips read as stat, amount and rounds left', () => {
    const s = createBattle('proving-ground', 1)
    const u = { ...s.units.find((x) => x.id === 'liu-bei')!, buffs: [{ id: 'x', stat: 'war' as const, amount: 10, until: s.round + 1, by: 'liu-bei' }] }
    expect(buffChips(s, u)).toEqual(['War +10 · 2 rounds'])
    expect(buffChips(s, { ...u, buffs: undefined })).toEqual([])
  })
})

describe('C-DEPLOY deploy helpers', () => {
  it('C-DEPLOY-1 numbered markers label ambush posts and late arrivals', () => {
    const def = getBattleDef('proving-ground')!
    const marks = deployMarks(def, ['liu-bei', 'guan-yu', null, null, 'jian-yong', 'guan-ping'])
    expect(marks).toHaveLength(def.playerStarts!.length)
    expect(marks.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(marks[3]).toMatchObject({ kind: 'ambush', label: 'Ambush post', officer: null })
    expect(marks[5]).toMatchObject({ kind: 'late', label: 'Arrives round 3', officer: 'guan-ping' })
    // slot 4 is a held-back reinforcement (round 4) with its own entry tile
    expect(marks[4]).toMatchObject({ kind: 'late', label: 'Arrives round 4' })
    expect(slotEntry(def, 4)).toEqual({ x: 0, y: 9 })
    expect(slotEntry(def, 0)).toBeNull()
    expect(marks[0]).toMatchObject({ kind: 'start', label: '', officer: 'liu-bei' })
  })

  it('C-DEPLOY-2 default picks fill the free slots from the default line-up, then the rest of the roster', () => {
    const c = newCampaign(1, false)
    const def = getBattleDef(ARC[0]!)!
    expect(def.deploySlots).toBe(5)
    expect(defaultPick(c, def)).toEqual([])
    const roster = { ...c, roster: [...c.roster, makeRecord('jian-yong', 2), makeRecord('zhao-yun', 4)] }
    expect(defaultPick(roster, def)).toEqual(['jian-yong', 'zhao-yun'])
    const gone = { ...roster, roster: roster.roster.map((r) => (r.officerId === 'zhao-yun' ? { ...r, status: 'fallen' as const } : r)) }
    expect(defaultPick(gone, def)).toEqual(['jian-yong'])
  })

  it('C-DEPLOY-3 togglePick adds, removes and respects the free slots', () => {
    expect(togglePick([], 'a', 2)).toEqual(['a'])
    expect(togglePick(['a'], 'b', 2)).toEqual(['a', 'b'])
    expect(togglePick(['a', 'b'], 'c', 2)).toEqual(['a', 'b'])
    expect(togglePick(['a', 'b'], 'a', 2)).toEqual(['b'])
    expect(togglePick([], 'a', 0)).toEqual([])
  })
})

describe('C-CAMP stratagem loadout (choose 3)', () => {
  const rec = { ...makeRecord('liu-bei', 5), stratagems: ['a', 'b', 'c', 'd'] }
  it('C-CAMP-1 a loadout is kept to what the officer knows and topped up to three', () => {
    expect(normaliseLoadout(rec, undefined)).toEqual(['a', 'b', 'c'])
    expect(normaliseLoadout(rec, ['d', 'zzz', 'd'])).toEqual(['d', 'a', 'b'])
    expect(normaliseLoadout({ ...rec, stratagems: ['a', 'b'] }, ['b'])).toEqual(['b', 'a'])
    expect(MAX_CARRIED_STRATAGEMS).toBe(3)
  })
  it('C-CAMP-2 clicking a chip adds it (swapping out the oldest when full), or removes it but never the last one', () => {
    expect(toggleStratagem(['a', 'b', 'c'], rec.stratagems, 'd')).toEqual(['b', 'c', 'd'])
    expect(toggleStratagem(['a', 'b', 'c'], rec.stratagems, 'b')).toEqual(['a', 'c'])
    expect(toggleStratagem(['a'], rec.stratagems, 'a')).toEqual(['a'])
    expect(toggleStratagem(['a'], rec.stratagems, 'zzz')).toEqual(['a'])
    expect(toggleStratagem(['a', 'b'], rec.stratagems, 'c')).toEqual(['a', 'b', 'c'])
  })
  it('C-CAMP-3 the stat line is base plus bonus, capped at 100, with the bonus shown separately', () => {
    const r = { ...makeRecord('guan-yu', 3), statBonus: { war: 5, int: 0, lead: 2, cha: 1 } }
    const lines = statLine(GAME_DATA.officers['guan-yu'], r)
    expect(lines.map((l) => l.value)).toEqual([100, 75, 97, 86])
    expect(lines.map((l) => l.bonus)).toEqual([5, 0, 2, 1])
  })
})

describe('C-SEED and briefing text', () => {
  it('C-SEED-1 battle seeds are deterministic, positive and differ by battle and attempt', () => {
    expect(battleSeed(42, 0, 0)).toBe(battleSeed(42, 0, 0))
    expect(battleSeed(42, 0, 0)).not.toBe(battleSeed(42, 1, 0))
    expect(battleSeed(42, 0, 0)).not.toBe(battleSeed(42, 0, 1))
    expect(battleSeed(43, 0, 0)).not.toBe(battleSeed(42, 0, 0))
    for (let i = 0; i < 50; i++) expect(battleSeed(i * 977, i % 9, i % 4)).toBeGreaterThan(0)
  })
  it('C-BRIEF-1 wind schedule and kicker read from the battle data', () => {
    const def = getBattleDef('daxing-hill')!
    expect(windScheduleText(def)).toEqual(['Round 1: breeze toward east', 'Round 6: calm', 'Round 9: gale toward west', 'Round 12: breeze toward east'])
    expect(briefingKicker(def)).toBe('184 · Daxing Hill, Youzhou')
  })
})

import { surname } from '../../src/client/names'
describe('portrait seal initial', () => {
  it('uses the family name: first word of a Chinese name, last word of a titled invented name', () => {
    expect(surname('Liu Bei')).toBe('L')
    expect(surname('Zhuge Liang')).toBe('Z')
    expect(surname('Rebel Captain Gao*')).toBe('G')
  })
})
