import { describe, expect, it } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import { saveRefreshedTuning } from '../../../src/ui/script/lineJobs'

const tuning = (text: string, styleId: number): LineTuning => ({
  text,
  styleId,
  accentPhrases: [],
  pitchScale: 0,
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
  const refreshed = tuning('ずんだ', 8)

  it('replaces the tuning of the line it was refreshed for', () => {
    const lines = [line('a', tuning('ずんだ', 3)), line('b', tuning('ずんだ', 3))]
    const next = saveRefreshedTuning(lines, 'a', refreshed)
    expect(next[0]!.tuning).toBe(refreshed)
    expect(next[1]).toBe(lines[1])
  })

  it('drops the refreshed value when the tuned text has changed meanwhile', () => {
    const lines = [line('a', tuning('別の文', 3))]
    expect(saveRefreshedTuning(lines, 'a', refreshed)).toBe(lines)
  })

  it('drops the refreshed value when the tuning is gone or the line was removed', () => {
    const lines = [line('a')]
    expect(saveRefreshedTuning(lines, 'a', refreshed)).toBe(lines)
    expect(saveRefreshedTuning(lines, 'gone', refreshed)).toBe(lines)
  })
})
