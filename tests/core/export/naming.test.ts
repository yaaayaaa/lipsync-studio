import { describe, expect, it } from 'vitest'
import { creditText, lineFileName, singleFileName } from '../../../src/core/export/naming'

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

describe('singleFileName', () => {
  it('takes 10 title characters and the first 8 alphanumerics of the id', () => {
    expect(singleFileName('ずんだもんなのだ！ぼくは', '3f9a1c2e-1111-4222-8333-444455556666')).toBe('ずんだもんなのだ！ぼ_3f9a1c2e.mp4')
  })

  it('skips non-alphanumerics in the id before taking 8', () => {
    expect(singleFileName('a', '3f-9a-1c-2e-1111')).toBe('a_3f9a1c2e.mp4')
  })

  it('replaces forbidden characters and trims whitespace', () => {
    expect(singleFileName('  こんにちは/なのだ  ', 'abcdef012345')).toBe('こんにちは_なのだ_abcdef01.mp4')
  })
})

describe('creditText', () => {
  it('dedupes in order of appearance', () => {
    expect(creditText(['ずんだもん', '四国めたん', 'ずんだもん'])).toBe('VOICEVOX:ずんだもん、VOICEVOX:四国めたん')
  })
})
