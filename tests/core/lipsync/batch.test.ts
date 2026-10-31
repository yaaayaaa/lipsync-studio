import { describe, expect, it } from 'vitest'
import { buildTimelines } from '../../../src/core/lipsync/batch'
import { blinkStarts } from '../../../src/core/lipsync/blink'
import { buildMouthTimeline } from '../../../src/core/lipsync/timeline'
import type { AudioQuery } from '../../../src/core/voicevox/types'

const query = (vowels: string[]): AudioQuery =>
  ({
    accent_phrases: [
      {
        moras: vowels.map((v) => ({ text: 'ア', consonant: null, consonant_length: null, vowel: v, vowel_length: 0.5, pitch: 5 })),
        accent: 1,
        pause_mora: null,
        is_interrogative: false,
      },
    ],
    speedScale: 1,
    pitchScale: 0,
    intonationScale: 1,
    volumeScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    outputSamplingRate: 24000,
    outputStereo: false,
    kana: '',
  }) as unknown as AudioQuery

describe('buildTimelines', () => {
  it('returns the same timeline as buildMouthTimeline and blinks seeded by id within the clip', () => {
    const q = query(Array(16).fill('a'))
    const [r] = buildTimelines([{ id: 'line-1', query: q }])
    const t = buildMouthTimeline(q)
    expect(r.segments).toEqual(t.segments)
    expect(r.duration).toBe(t.duration)
    expect(r.blinkStarts).toEqual(blinkStarts('line-1', Math.floor(t.duration * 30)))
    expect(r.blinkStarts.length).toBeGreaterThan(0)
  })

  it('keeps the request order and rejects duplicate ids and bad fps', () => {
    const rs = buildTimelines([
      { id: 'b', query: query(['i']) },
      { id: 'a', query: query(['o']) },
    ])
    expect(rs.map((r) => r.id)).toEqual(['b', 'a'])
    expect(rs[0].segments.map((s) => s.vowel)).toEqual(['closed', 'i', 'closed'])
    expect(() => buildTimelines([{ id: 'x', query: query(['a']) }, { id: 'x', query: query(['a']) }])).toThrow(/duplicate/)
    expect(() => buildTimelines([], 0)).toThrow(/fps/)
  })
})
