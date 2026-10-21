import { describe, expect, it } from 'vitest'
import { phonemeLabel } from '../../../src/ui/lineEditor/phoneme'

describe('phonemeLabel', () => {
  it('shows VOICEVOX phonemes in lower case', () => {
    expect(phonemeLabel('k')).toBe('k')
    expect(phonemeLabel('ky')).toBe('ky')
    expect(phonemeLabel('a')).toBe('a')
    expect(phonemeLabel('N')).toBe('n')
    expect(phonemeLabel('U')).toBe('u')
    expect(phonemeLabel('cl')).toBe('cl')
  })
})
