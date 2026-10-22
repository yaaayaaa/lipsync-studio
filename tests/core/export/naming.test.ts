import { describe, expect, it } from 'vitest'
import { creditText, singleFileName } from '../../../src/core/export/naming'

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
