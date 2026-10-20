import { describe, expect, it, vi } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import type { AccentPhrase, AudioQuery } from '../../../src/core/voicevox/types'
import { GLOBAL_PARAM_RANGES, ensureTuning, setGlobalParam } from '../../../src/ui/lineEditor/editTuning'

const phrase = (pitch: number): AccentPhrase => ({
  moras: [{ text: 'ズ', consonant: 'z', consonant_length: 0.05, vowel: 'u', vowel_length: 0.1, pitch }],
  accent: 1,
  pause_mora: null,
})

const query = (text: string, pitch = 5.5): AudioQuery => ({
  accent_phrases: [phrase(pitch)],
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  pauseLength: null,
  pauseLengthScale: 1,
  outputSamplingRate: 24000,
  outputStereo: false,
  kana: text,
})

const tuning = (text: string, styleId: number, patch: Partial<LineTuning> = {}): LineTuning => ({
  text,
  styleId,
  accentPhrases: [phrase(5.0)],
  pitchScale: 0.05,
  intonationScale: 0,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  ...patch,
})

const line = (patch: Partial<ScriptLine> = {}): ScriptLine => ({
  id: 'l1',
  text: 'ずんだ',
  characterId: 'c1',
  expressionId: 'e1',
  speedScale: 1.2,
  ...patch,
})

function fakeClient() {
  const audioQuery = vi.fn(async (text: string, _styleId: number) => query(text))
  const moraData = vi.fn(async (phrases: AccentPhrase[], _styleId: number) => phrases.map(() => phrase(6.0)))
  return { client: { audioQuery, moraData }, audioQuery, moraData }
}

describe('GLOBAL_PARAM_RANGES', () => {
  it('uses the VOICEVOX editor ranges and the Japanese labels', () => {
    expect(GLOBAL_PARAM_RANGES.pitchScale).toEqual({ min: -0.15, max: 0.15, step: 0.01, label: '音高' })
    expect(GLOBAL_PARAM_RANGES.intonationScale).toEqual({ min: 0, max: 2, step: 0.01, label: '抑揚' })
    expect(GLOBAL_PARAM_RANGES.volumeScale).toEqual({ min: 0, max: 2, step: 0.01, label: '音量' })
    expect(GLOBAL_PARAM_RANGES.pauseLengthScale).toEqual({ min: 0, max: 2, step: 0.01, label: '間の倍率' })
    expect(GLOBAL_PARAM_RANGES.prePhonemeLength).toEqual({ min: 0, max: 1.5, step: 0.01, label: '開始の無音' })
    expect(GLOBAL_PARAM_RANGES.postPhonemeLength).toEqual({ min: 0, max: 1.5, step: 0.01, label: '終了の無音' })
    expect(GLOBAL_PARAM_RANGES.speedScale).toMatchObject({ min: 0.5, max: 2, label: '話速' })
  })
})

describe('setGlobalParam', () => {
  const base = tuning('ずんだ', 3)

  it('sets the value inside the range without touching anything else', () => {
    const next = setGlobalParam(base, 'intonationScale', 1.5)
    expect(next).toEqual({ ...base, intonationScale: 1.5 })
    expect(base.intonationScale).toBe(0)
  })

  it('clamps values outside the range', () => {
    expect(setGlobalParam(base, 'pitchScale', 0.5).pitchScale).toBe(0.15)
    expect(setGlobalParam(base, 'pitchScale', -1).pitchScale).toBe(-0.15)
    expect(setGlobalParam(base, 'postPhonemeLength', 9).postPhonemeLength).toBe(1.5)
    expect(setGlobalParam(base, 'volumeScale', -0.1).volumeScale).toBe(0)
  })

  it('keeps the current value when given NaN or infinity', () => {
    expect(setGlobalParam(base, 'pitchScale', Number.NaN)).toEqual(base)
    expect(setGlobalParam(base, 'intonationScale', Number.POSITIVE_INFINITY)).toEqual(base)
  })
})

describe('ensureTuning', () => {
  it('builds the tuning from /audio_query when the line has none', async () => {
    const { client, audioQuery, moraData } = fakeClient()
    const t = await ensureTuning(client, line(), 3)
    expect(audioQuery).toHaveBeenCalledWith('ずんだ', 3)
    expect(moraData).not.toHaveBeenCalled()
    expect(t).toMatchObject({ text: 'ずんだ', styleId: 3, intonationScale: 1, accentPhrases: [phrase(5.5)] })
    expect(t).not.toHaveProperty('speedScale')
  })

  it('keeps an up-to-date tuning without calling /audio_query', async () => {
    const { client, audioQuery, moraData } = fakeClient()
    const current = tuning('ずんだ', 3)
    expect(await ensureTuning(client, line({ tuning: current }), 3)).toBe(current)
    expect(audioQuery).not.toHaveBeenCalled()
    expect(moraData).not.toHaveBeenCalled()
  })

  it('refetches pitch and length for a new voice but keeps the global values', async () => {
    const { client, audioQuery, moraData } = fakeClient()
    const t = await ensureTuning(client, line({ tuning: tuning('ずんだ', 3) }), 8)
    expect(audioQuery).not.toHaveBeenCalled()
    expect(moraData).toHaveBeenCalledWith([phrase(5.0)], 8)
    expect(t).toMatchObject({ styleId: 8, intonationScale: 0, pitchScale: 0.05, accentPhrases: [phrase(6.0)] })
  })

  it('rebuilds a stale tuning (the text changed) from /audio_query', async () => {
    const { client, audioQuery } = fakeClient()
    const t = await ensureTuning(client, line({ text: 'ずんだもん', tuning: tuning('ずんだ', 3) }), 3)
    expect(audioQuery).toHaveBeenCalledWith('ずんだもん', 3)
    expect(t).toMatchObject({ text: 'ずんだもん', styleId: 3, intonationScale: 1, pitchScale: 0 })
  })

  it('passes engine failures to the caller', async () => {
    const { client, audioQuery } = fakeClient()
    audioQuery.mockRejectedValueOnce(new Error('つながりません'))
    await expect(ensureTuning(client, line(), 3)).rejects.toThrow('つながりません')
  })
})
