import { describe, expect, it } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import { applyTextChange, dropTuning, hasStaleTuning, restoreTunedText } from '../../../src/ui/script/lineText'

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
  it('changes only the text and keeps the tuning until the text is committed', () => {
    const tuned = line({ tuning: tuning('ずんだもんなのだ') })
    const next = applyTextChange(tuned, 'ずんだもん')
    expect(next.text).toBe('ずんだもん')
    expect(next.tuning).toBe(tuned.tuning)
    expect(next.speedScale).toBe(1.3)
  })
})

// 文の確定で作り込みを捨てる確認を出すのは、これが true のときだけ
describe('hasStaleTuning', () => {
  it('needs no confirmation for a line without tuning', () => {
    const plain = line({ text: '別の文' })
    expect(hasStaleTuning(plain)).toBe(false)
  })

  it('needs no confirmation when the text is back to the tuned text', () => {
    const tuned = line({ tuning: tuning('ずんだもんなのだ') })
    expect(hasStaleTuning(tuned)).toBe(false)
  })

  it('asks for confirmation when the text differs from the tuned text', () => {
    const tuned = line({ text: 'ずんだもん', tuning: tuning('ずんだもんなのだ') })
    expect(hasStaleTuning(tuned)).toBe(true)
  })
})

describe('dropTuning', () => {
  it('removes only the tuning and keeps the speed and the rest of the line', () => {
    const tuned = line({ text: 'ずんだもん', tuning: tuning('ずんだもんなのだ') })
    const dropped = dropTuning(tuned)
    expect(dropped).not.toHaveProperty('tuning')
    expect(dropped).toEqual({ id: 'l1', text: 'ずんだもん', characterId: 'c1', expressionId: 'e1', speedScale: 1.3 })
  })
})

describe('restoreTunedText', () => {
  it('puts back the text the tuning was made for and keeps the tuning', () => {
    const t = tuning('ずんだもんなのだ')
    const next = restoreTunedText(line({ text: 'ずんだもん', tuning: t }))
    expect(next.text).toBe('ずんだもんなのだ')
    expect(next.tuning).toBe(t)
  })

  it('returns the line itself when there is nothing to restore', () => {
    const plain = line()
    expect(restoreTunedText(plain)).toBe(plain)
    const tuned = line({ tuning: tuning('ずんだもんなのだ') })
    expect(restoreTunedText(tuned)).toBe(tuned)
  })
})
