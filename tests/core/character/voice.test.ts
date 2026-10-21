import { describe, expect, it } from 'vitest'
import { lineVoice } from '../../../src/core/character/voice'

const zunda = { styleId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル' }
const metan = { styleId: 2, speakerName: '四国めたん', styleName: 'ノーマル' }

describe('lineVoice', () => {
  it("uses the line's own voice over the character's", () => {
    expect(lineVoice({ voice: metan }, { voice: zunda })).toBe(metan)
  })

  it("falls back to the character's voice", () => {
    expect(lineVoice({}, { voice: zunda })).toBe(zunda)
  })

  it('has no voice when neither has one or the character is missing', () => {
    expect(lineVoice({}, { voice: null })).toBeNull()
    expect(lineVoice({}, undefined)).toBeNull()
    expect(lineVoice({ voice: metan }, undefined)).toBe(metan)
  })
})
