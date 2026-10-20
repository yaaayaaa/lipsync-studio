import { describe, expect, it, vi } from 'vitest'
import type { LineTuning, ScriptLine } from '../../../src/core/character/types'
import type { AccentPhrase, AudioQuery } from '../../../src/core/voicevox/types'
import { GLOBAL_PARAM_RANGES, applyTuningEdit, ensureTuning, setGlobalParam } from '../../../src/ui/lineEditor/editTuning'

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

describe('applyTuningEdit', () => {
  const bump = (t: LineTuning) => ({ ...t, intonationScale: t.intonationScale + 1 })
  // origin は変更を始めたときに行が持っていた作り込み（なければ undefined）
  const edit = (base: LineTuning, origin: LineTuning | undefined) => ({ base, origin })

  it('edits the line\'s own tuning when it is still the one the edit started from', () => {
    const own = tuning('ずんだ', 3, { intonationScale: 0.5 })
    const next = applyTuningEdit(line({ tuning: own }), edit(own, own), bump)
    expect(next.tuning?.intonationScale).toBe(1.5)
  })

  // つまみを続けて動かすと、描画を待たずに次の変更が来る。行はもう新しい作り込みを持っている
  it('edits the line\'s newer same-voice tuning when an immediate edit started from an older state', () => {
    const own = tuning('ずんだ', 3, { intonationScale: 0.5 })
    const next = applyTuningEdit(line({ tuning: own }), edit(tuning('ずんだ', 3), undefined), bump)
    expect(next.tuning?.intonationScale).toBe(1.5)
  })

  it('creates the tuning from the base when the line has none', () => {
    const next = applyTuningEdit(line(), edit(tuning('ずんだ', 3), undefined), bump)
    expect(next.tuning).toEqual({ ...tuning('ずんだ', 3), intonationScale: 1 })
  })

  it('uses the base when the line still holds the other-voice tuning the base was refreshed from', () => {
    const old = tuning('ずんだ', 3)
    const base = tuning('ずんだ', 8, { intonationScale: 0.2 })
    const next = applyTuningEdit(line({ tuning: old }), edit(base, old), bump)
    expect(next.tuning).toEqual({ ...base, intonationScale: 1.2 })
  })

  // 古い声の base で始めた変更が、待つ間に新しい声で取り直された作り込みを上書きしない
  it('drops the edit when the line\'s tuning changed to another voice while waiting', () => {
    const base = tuning('ずんだ', 3)
    const current = line({ tuning: tuning('ずんだ', 8) })
    expect(applyTuningEdit(current, edit(base, base), bump)).toBe(current)
  })

  it('drops the edit when the base was made for a line without tuning but one was created meanwhile', () => {
    const current = line({ tuning: tuning('ずんだ', 3, { accentPhrases: [phrase(4)] }) })
    const base = tuning('ずんだ', 8)
    expect(applyTuningEdit(current, edit(base, undefined), bump)).toBe(current)
  })

  it('leaves the line untouched when fn returns null', () => {
    const own = tuning('ずんだ', 3)
    const current = line({ tuning: own })
    expect(applyTuningEdit(current, edit(own, own), () => null)).toBe(current)
    const bare = line()
    expect(applyTuningEdit(bare, edit(own, undefined), () => null)).toBe(bare)
  })

  it('drops the edit when the text changed while the base was being made', () => {
    const current = line({ text: 'ずんだもん' })
    expect(applyTuningEdit(current, edit(tuning('ずんだ', 3), undefined), bump)).toBe(current)
  })

  // 文を打ち替えて確定前（作り込みが古い）なら、捨てる確認を飛ばして作り直さない
  it('refuses to edit while the line holds a stale tuning that is not yet confirmed away', () => {
    const stale = tuning('ずんだ', 3)
    const current = line({ text: 'ずんだもん', tuning: stale })
    expect(applyTuningEdit(current, edit(tuning('ずんだもん', 3), stale), bump)).toBe(current)
  })
})

describe('applyTuningEdit after waiting for the engine', () => {
  const next = [phrase(6.5)]
  const setPhrases = (t: LineTuning) => ({ ...t, accentPhrases: next })

  it('applies the result when the line still holds the tuning it started from', () => {
    const own = tuning('ずんだ', 3)
    const result = applyTuningEdit(line({ tuning: own }), { base: own, origin: own, waited: true }, setPhrases)
    expect(result.tuning).toEqual({ ...own, accentPhrases: next })
  })

  it('applies the result to a line that still has no tuning', () => {
    const made = tuning('ずんだ', 3)
    const result = applyTuningEdit(line(), { base: made, origin: undefined, waited: true }, setPhrases)
    expect(result.tuning).toEqual({ ...made, accentPhrases: next })
  })

  // 待つ間に全体の数値を動かした・取り消した、など同じ声でも作り込みが入れ替わっていたら捨てる
  it('drops the result when the line\'s tuning was replaced while waiting, even for the same voice', () => {
    const own = tuning('ずんだ', 3)
    const current = line({ tuning: { ...own, intonationScale: 1.3 } })
    expect(applyTuningEdit(current, { base: own, origin: own, waited: true }, setPhrases)).toBe(current)
  })

  it('drops the result when a tuning was created while waiting', () => {
    const current = line({ tuning: tuning('ずんだ', 3) })
    expect(applyTuningEdit(current, { base: tuning('ずんだ', 3), origin: undefined, waited: true }, setPhrases)).toBe(current)
  })

  it('drops an old-voice result after the tuning was refreshed for the new voice', () => {
    const old = tuning('ずんだ', 3)
    const current = line({ tuning: tuning('ずんだ', 8) })
    expect(applyTuningEdit(current, { base: old, origin: old, waited: true }, setPhrases)).toBe(current)
  })
})
