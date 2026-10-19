import { describe, expect, it } from 'vitest'
import { creditText, lineFileName } from '../../../src/core/export/naming'

describe('lineFileName', () => {
  it('zero-pads the index, replaces forbidden characters, then takes 10 characters', () => {
    expect(lineFileName(0, 'ずんだもん', 'こんにちは/ずんだもん\nなのだ')).toBe('001_ずんだもん_こんにちは_ずんだも.mp4')
  })

  it('replaces every Windows-forbidden character in the character name too', () => {
    expect(lineFileName(11, 'a:b', '*?"<>|\\x')).toBe('012_a_b________x.mp4')
  })

  it('trims surrounding whitespace', () => {
    expect(lineFileName(0, ' ずんだもん ', '  こんにちは  ')).toBe('001_ずんだもん_こんにちは.mp4')
  })
})

describe('creditText', () => {
  it('dedupes in order of appearance', () => {
    expect(creditText(['ずんだもん', '四国めたん', 'ずんだもん'])).toBe('VOICEVOX:ずんだもん、VOICEVOX:四国めたん')
  })
})
