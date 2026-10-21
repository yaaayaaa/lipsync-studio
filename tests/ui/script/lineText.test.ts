import { describe, expect, it } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import { applyTextChange, dropTuning, isTuned } from '../../../src/ui/script/lineText'

const tuning = (text: string): LineTuning => ({
  text,
  styleId: 3,
  accentPhrases: [],
  pitchScale: 0.05,
  intonationScale: 1.2,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
})

const line = (patch: Partial<ScriptLine> = {}): ScriptLine => ({
  id: 'l1',
  text: 'ずんだもんなのだ',
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1.3,
  ...patch,
})

describe('applyTextChange', () => {
  it('drops the tuning as soon as the text changes, and keeps the rest of the line', () => {
    const tuned = line({ tuning: tuning('ずんだもんなのだ'), tailSeconds: 1.5 })
    const next = applyTextChange(tuned, 'ずんだもん')
    expect(next).not.toHaveProperty('tuning')
    expect(next).toEqual({ ...dropTuning(tuned), text: 'ずんだもん' })
    expect(next.speedScale).toBe(1.3)
    expect(next.tailSeconds).toBe(1.5)
  })

  it('keeps the tuning when the text stays the one the tuning was made for', () => {
    const tuned = line({ tuning: tuning('ずんだもんなのだ') })
    expect(applyTextChange(tuned, 'ずんだもんなのだ').tuning).toBe(tuned.tuning)
  })

  it('just changes the text of a line without tuning', () => {
    expect(applyTextChange(line(), '別の文')).toEqual(line({ text: '別の文' }))
  })
})

describe('dropTuning', () => {
  it('removes only the tuning and keeps the speed and the rest of the line', () => {
    const dropped = dropTuning(line({ tuning: tuning('ずんだもんなのだ') }))
    expect(dropped).not.toHaveProperty('tuning')
    expect(dropped).toEqual(line())
  })
})

describe('isTuned', () => {
  it('is true only for a tuning made for the current text', () => {
    expect(isTuned(line())).toBe(false)
    expect(isTuned(line({ tuning: tuning('ずんだもんなのだ') }))).toBe(true)
    // 文を変えると捨てるようになる前に保存した行には、古い作り込みが残っていることがある
    expect(isTuned(line({ tuning: tuning('ずんだ') }))).toBe(false)
  })
})
