import { describe, expect, it } from 'vitest'
import { ENGINE_FRAME_RATE, buildMouthTimeline, mouthAt, vowelToMouth } from '../../../src/core/lipsync/timeline'
import { konnichiwaQuery } from '../../fixtures/audioQuery'

const f = (sec: number) => Math.round(sec * ENGINE_FRAME_RATE)

describe('vowelToMouth', () => {
  it.each([
    ['a', 'a'], ['i', 'i'], ['u', 'u'], ['e', 'e'], ['o', 'o'],
    ['A', 'a'], ['I', 'i'], ['U', 'u'], ['E', 'e'], ['O', 'o'],
    ['N', 'n'], ['cl', 'closed'], ['pau', 'closed'], ['sil', 'closed'], ['', 'closed'],
  ])('%s -> %s', (v, expected) => {
    expect(vowelToMouth(v)).toBe(expected)
  })
})

describe('buildMouthTimeline', () => {
  it('starts with a closed segment of the pre-phoneme length in frames', () => {
    const tl = buildMouthTimeline(konnichiwaQuery())
    expect(tl.segments[0]).toEqual({ start: 0, end: f(0.1) / ENGINE_FRAME_RATE, vowel: 'closed' })
  })

  it('maps consonants to the mouth of their mora vowel and merges equal neighbours', () => {
    const tl = buildMouthTimeline(konnichiwaQuery())
    // pre(closed) k+o(o) N(n) n+i(i) ch+I(i, merged) w+a(a) pau+post(closed, merged)
    expect(tl.segments.map((s) => s.vowel)).toEqual(['closed', 'o', 'n', 'i', 'a', 'closed'])
    const i = tl.segments[3]!
    expect(i.end - i.start).toBeCloseTo((f(0.05) + f(0.1) + f(0.07) + f(0.08)) / ENGINE_FRAME_RATE, 10)
  })

  it.each([1, 2])('duration equals summed per-phoneme frames at speedScale %d', (speed) => {
    const tl = buildMouthTimeline(konnichiwaQuery({ speedScale: speed }))
    const lens = [0.1, 0.06, 0.11, 0.09, 0.05, 0.1, 0.07, 0.08, 0.04, 0.13, 0.3, 0.1]
    const frames = lens.reduce((sum, l) => sum + Math.round((l / speed) * ENGINE_FRAME_RATE), 0)
    expect(tl.duration).toBe(frames / ENGINE_FRAME_RATE)
    expect(tl.segments.at(-1)!.end).toBe(tl.duration)
  })

  it('rounds half to even per phoneme (0.5 frame -> 0, 1.5 -> 2, 2.5 -> 2)', () => {
    const q = konnichiwaQuery({ prePhonemeLength: 0.5 / ENGINE_FRAME_RATE, postPhonemeLength: 2.5 / ENGINE_FRAME_RATE })
    q.accent_phrases[0]!.moras = [{ text: 'ア', consonant: null, consonant_length: null, vowel: 'a', vowel_length: 1.5 / ENGINE_FRAME_RATE, pitch: 5 }]
    q.accent_phrases[0]!.pause_mora = null
    const tl = buildMouthTimeline(q)
    expect(tl.segments).toEqual([
      { start: 0, end: 2 / ENGINE_FRAME_RATE, vowel: 'a' },
      { start: 2 / ENGINE_FRAME_RATE, end: 4 / ENGINE_FRAME_RATE, vowel: 'closed' },
    ])
  })

  it('uses pauseLength * pauseLengthScale for the pause mora, then divides by speedScale', () => {
    const tl = buildMouthTimeline(konnichiwaQuery({ pauseLength: 0.5, pauseLengthScale: 2, speedScale: 2 }))
    const last = tl.segments.at(-1)!
    expect(last.vowel).toBe('closed')
    expect(last.end - last.start).toBe((f(1.0 / 2) + f(0.1 / 2)) / ENGINE_FRAME_RATE)
  })

  it('scales vowel_length by pauseLengthScale when pauseLength is null, defaulting scale to 1', () => {
    const q = konnichiwaQuery({ pauseLengthScale: undefined })
    const a = buildMouthTimeline(q)
    const b = buildMouthTimeline(konnichiwaQuery({ pauseLengthScale: 0.5 }))
    expect(a.duration - b.duration).toBeCloseTo((f(0.3) - f(0.15)) / ENGINE_FRAME_RATE, 10)
  })

  it('does not apply pauseLengthScale to pre/post silence', () => {
    const a = buildMouthTimeline(konnichiwaQuery({ pauseLengthScale: 1 }))
    const b = buildMouthTimeline(konnichiwaQuery({ pauseLengthScale: 2 }))
    expect(b.duration - a.duration).toBeCloseTo(f(0.6) / ENGINE_FRAME_RATE - f(0.3) / ENGINE_FRAME_RATE, 10)
  })

  it('has no gaps or overlaps between segments', () => {
    for (const speed of [0.5, 1, 1.3, 2]) {
      const { segments } = buildMouthTimeline(konnichiwaQuery({ speedScale: speed }))
      for (let i = 0; i < segments.length - 1; i++) {
        expect(segments[i]!.end).toBe(segments[i + 1]!.start)
      }
    }
  })

  it('returns an empty timeline for a zero-length query', () => {
    const tl = buildMouthTimeline(konnichiwaQuery({ accent_phrases: [], prePhonemeLength: 0, postPhonemeLength: 0 }))
    expect(tl).toEqual({ segments: [], duration: 0 })
  })

  it('rejects a non-positive speedScale', () => {
    expect(() => buildMouthTimeline(konnichiwaQuery({ speedScale: 0 }))).toThrow(/speedScale/)
  })
})

describe('interrogative upspeak', () => {
  // konnichiwaQuery の末尾モーラ（ワ, a）は pitch 5 > 0
  const interrogative = (speedScale: number) => {
    const q = konnichiwaQuery({ speedScale })
    q.accent_phrases[0]!.is_interrogative = true
    return q
  }

  it.each([1, 2])('adds a 0.15s mora with the last vowel mouth at speedScale %d', (speed) => {
    const base = buildMouthTimeline(konnichiwaQuery({ speedScale: speed }))
    const tl = buildMouthTimeline(interrogative(speed))
    const added = Math.round((0.15 / speed) * ENGINE_FRAME_RATE)
    expect(tl.duration).toBe(base.duration + added / ENGINE_FRAME_RATE)
    // ワ(a) の直後に a が延びる。pause 以降は変わらない
    const a = tl.segments.find((s) => s.vowel === 'a')!
    const baseA = base.segments.find((s) => s.vowel === 'a')!
    expect(a.end - a.start).toBeCloseTo(baseA.end - baseA.start + added / ENGINE_FRAME_RATE, 10)
  })

  it('adds nothing when the last mora is unvoiced (pitch 0)', () => {
    const q = interrogative(1)
    q.accent_phrases[0]!.moras.at(-1)!.pitch = 0
    expect(buildMouthTimeline(q).duration).toBe(buildMouthTimeline(konnichiwaQuery()).duration)
  })

  it('adds nothing when the phrase is not interrogative', () => {
    const q = konnichiwaQuery()
    q.accent_phrases[0]!.is_interrogative = false
    expect(buildMouthTimeline(q).duration).toBe(buildMouthTimeline(konnichiwaQuery()).duration)
  })

  it('adds nothing for a phrase without moras', () => {
    const q = konnichiwaQuery()
    q.accent_phrases.push({ moras: [], accent: 1, pause_mora: null, is_interrogative: true })
    expect(buildMouthTimeline(q).duration).toBe(buildMouthTimeline(konnichiwaQuery()).duration)
  })

  it('repeats the ん mouth when the phrase ends with N', () => {
    const q = interrogative(1)
    q.accent_phrases[0]!.moras = [
      { text: 'ン', consonant: null, consonant_length: null, vowel: 'N', vowel_length: 0.1, pitch: 5 },
    ]
    const tl = buildMouthTimeline(q)
    expect(tl.segments.map((s) => s.vowel)).toEqual(['closed', 'n', 'closed'])
    const n = tl.segments[1]!
    expect(n.end - n.start).toBeCloseTo((f(0.1) + f(0.15)) / ENGINE_FRAME_RATE)
  })
})

describe('mouthAt', () => {
  it('returns closed outside the range', () => {
    const tl = buildMouthTimeline(konnichiwaQuery())
    expect(mouthAt(tl, -1)).toBe('closed')
    expect(mouthAt(tl, tl.duration + 1)).toBe('closed')
    expect(mouthAt(tl, tl.duration)).toBe('closed')
  })

  it('finds the segment with start inclusive and end exclusive', () => {
    const tl = buildMouthTimeline(konnichiwaQuery())
    const o = tl.segments[1]!
    expect(mouthAt(tl, o.start)).toBe('o')
    expect(mouthAt(tl, (o.start + o.end) / 2)).toBe('o')
    expect(mouthAt(tl, o.end)).toBe(tl.segments[2]!.vowel)
  })
})
