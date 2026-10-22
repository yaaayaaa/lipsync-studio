import { describe, expect, it } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import { saveRefreshedTuning } from '../../../src/ui/script/lineJobs'

const tuning = (text: string, styleId: number, pitchScale = 0): LineTuning => ({
  text,
  styleId,
  accentPhrases: [],
  pitchScale,
  intonationScale: 1,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
})

const line = (id: string, t?: LineTuning): ScriptLine => ({
  id,
  text: t?.text ?? 'ずんだ',
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1,
  ...(t && { tuning: t }),
})

describe('saveRefreshedTuning', () => {
  const used = tuning('ずんだ', 3)
  const refreshed = tuning('ずんだ', 8)

  it('replaces the tuning when the line still has the tuning that was synthesized', () => {
    const lines = [{ ...line('a', used), characterId: 'c2' }, line('b', tuning('ずんだ', 3))]
    const next = saveRefreshedTuning(lines, 'a', used, refreshed)
    expect(next[0]).toEqual({ ...lines[0], tuning: refreshed })
    expect(next[1]).toBe(lines[1])
  })

  it('drops the refreshed value when the tuning was edited meanwhile, even with the same text', () => {
    const lines = [line('a', tuning('ずんだ', 3, 0.1))]
    expect(saveRefreshedTuning(lines, 'a', used, refreshed)).toBe(lines)
  })

  it('drops the refreshed value when the tuning was dropped for a text change', () => {
    const lines = [{ ...line('a'), text: '別の文' }]
    expect(saveRefreshedTuning(lines, 'a', used, refreshed)).toBe(lines)
  })

  it('drops the refreshed value when the line was removed', () => {
    const lines = [line('b', used)]
    expect(saveRefreshedTuning(lines, 'a', used, refreshed)).toBe(lines)
  })
})
