import { describe, expect, it, vi } from 'vitest'
import { VoicevoxError } from '../../../src/core/voicevox/client'
import {
  joinPhrases,
  kanaWithAccent,
  moraCount,
  refetchPhrases,
  replaceReading,
  setAccent,
  setMoraLength,
  setMoraPitch,
  setPauseLength,
  splitPhrase,
} from '../../../src/core/voicevox/phraseEdit'
import type { AccentPhrase, Mora } from '../../../src/core/voicevox/types'

const mora = (text: string, pitch = 5.5, consonant: string | null = 'k'): Mora => ({
  text,
  consonant,
  consonant_length: consonant === null ? null : 0.05,
  vowel: 'a',
  vowel_length: 0.1,
  pitch,
})

const pause = (len = 0.3): Mora => ({
  text: '、',
  consonant: null,
  consonant_length: null,
  vowel: 'pau',
  vowel_length: len,
  pitch: 0,
})

const phrase = (texts: string[], accent: number, patch: Partial<AccentPhrase> = {}): AccentPhrase => ({
  moras: texts.map((t) => mora(t)),
  accent,
  pause_mora: null,
  is_interrogative: false,
  ...patch,
})

/** ズンダモンデス、 / ヨロシク？ */
const sample = (): AccentPhrase[] => [
  phrase(['ズ', 'ン', 'ダ', 'モ', 'ン', 'デ', 'ス'], 3, { pause_mora: pause() }),
  phrase(['ヨ', 'ロ', 'シ', 'ク'], 3, { is_interrogative: true }),
]

const texts = (ps: AccentPhrase[]) => ps.flatMap((p) => p.moras.map((m) => m.text)).join('')

describe('setAccent', () => {
  it('rounds the accent into 1..mora count without touching the input', () => {
    const before = sample()
    expect(setAccent(before, 0, 5)[0]!.accent).toBe(5)
    expect(setAccent(before, 0, 0)[0]!.accent).toBe(1)
    expect(setAccent(before, 0, 99)[0]!.accent).toBe(7)
    expect(setAccent(before, 1, 2.6)[1]!.accent).toBe(3)
    expect(before).toEqual(sample())
  })

  it('ignores a non-number accent', () => {
    expect(setAccent(sample(), 0, Number.NaN)[0]!.accent).toBe(3)
  })
})

describe('splitPhrase / joinPhrases', () => {
  it('splits before moraIndex, keeping the pause and the question on the latter half', () => {
    const split = splitPhrase(sample(), 0, 3)
    expect(split).toHaveLength(3)
    expect(split[0]!.moras.map((m) => m.text)).toEqual(['ズ', 'ン', 'ダ'])
    expect(split[0]!.pause_mora).toBeNull()
    expect(split[0]!.accent).toBe(3)
    expect(split[1]!.moras.map((m) => m.text)).toEqual(['モ', 'ン', 'デ', 'ス'])
    expect(split[1]!.pause_mora).toEqual(pause())
    expect(split[1]!.accent).toBe(3)

    const q = splitPhrase(sample(), 1, 1)
    expect(q[1]!.is_interrogative).toBe(false)
    expect(q[2]!.is_interrogative).toBe(true)
    expect(q[1]!.accent).toBe(1)
  })

  it('rounds the accent into each half', () => {
    const split = splitPhrase(sample(), 0, 2)
    expect(split[0]!.accent).toBe(2)
    expect(split[1]!.accent).toBe(3)
  })

  it('leaves the phrases alone when the split point is at an end', () => {
    expect(splitPhrase(sample(), 0, 0)).toEqual(sample())
    expect(splitPhrase(sample(), 0, 7)).toEqual(sample())
  })

  it('round-trips: the moras stay the same and the pause sits on the right side', () => {
    const joined = joinPhrases(splitPhrase(sample(), 0, 3), 0)
    expect(joined).toHaveLength(2)
    expect(texts(joined)).toBe(texts(sample()))
    expect(joined[0]!.moras).toEqual(sample()[0]!.moras)
    expect(joined[0]!.pause_mora).toEqual(pause())
    expect(joined[0]!.accent).toBe(3)
  })

  it('takes the pause and the question from the later phrase and the accent from the earlier', () => {
    const joined = joinPhrases(sample(), 0)
    expect(joined).toHaveLength(1)
    expect(joined[0]!.moras).toHaveLength(11)
    expect(joined[0]!.pause_mora).toBeNull()
    expect(joined[0]!.is_interrogative).toBe(true)
    expect(joined[0]!.accent).toBe(3)
  })

  it('does nothing when there is no next phrase', () => {
    expect(joinPhrases(sample(), 1)).toEqual(sample())
  })
})

describe('setMoraPitch / setMoraLength / setPauseLength', () => {
  it('clamps the pitch to 3.0..6.5', () => {
    expect(setMoraPitch(sample(), 0, 1, 7)[0]!.moras[1]!.pitch).toBe(6.5)
    expect(setMoraPitch(sample(), 0, 1, 1)[0]!.moras[1]!.pitch).toBe(3)
    expect(setMoraPitch(sample(), 0, 1, 4.2)[0]!.moras[1]!.pitch).toBe(4.2)
  })

  it('does not change an unvoiced mora (pitch 0)', () => {
    const ps = sample()
    ps[0]!.moras[6]!.pitch = 0
    expect(setMoraPitch(ps, 0, 6, 5)[0]!.moras[6]!.pitch).toBe(0)
  })

  it('clamps consonant and vowel lengths to 0..0.30', () => {
    expect(setMoraLength(sample(), 0, 0, 'vowel', 0.5)[0]!.moras[0]!.vowel_length).toBe(0.3)
    expect(setMoraLength(sample(), 0, 0, 'vowel', -1)[0]!.moras[0]!.vowel_length).toBe(0)
    expect(setMoraLength(sample(), 0, 0, 'consonant', 0.12)[0]!.moras[0]!.consonant_length).toBe(0.12)
    expect(setMoraLength(sample(), 0, 0, 'consonant', 9)[0]!.moras[0]!.consonant_length).toBe(0.3)
  })

  it('does not give a consonant length to a mora without a consonant', () => {
    const ps = sample()
    ps[0]!.moras[1] = mora('ン', 5.5, null)
    const next = setMoraLength(ps, 0, 1, 'consonant', 0.1)
    expect(next[0]!.moras[1]!.consonant_length).toBeNull()
  })

  it('clamps the pause after a phrase to 0..1.0 and ignores a phrase without a pause', () => {
    expect(setPauseLength(sample(), 0, 2)[0]!.pause_mora!.vowel_length).toBe(1)
    expect(setPauseLength(sample(), 0, 0.42)[0]!.pause_mora!.vowel_length).toBe(0.42)
    expect(setPauseLength(sample(), 1, 0.5)[1]!.pause_mora).toBeNull()
  })

  it('ignores non-number values', () => {
    expect(setMoraPitch(sample(), 0, 0, Number.NaN)).toEqual(sample())
    expect(setMoraLength(sample(), 0, 0, 'vowel', Number.NaN)).toEqual(sample())
    expect(setPauseLength(sample(), 0, Number.NaN)).toEqual(sample())
  })

  it('does not change the input', () => {
    const before = sample()
    setMoraPitch(before, 0, 0, 4)
    setMoraLength(before, 0, 0, 'vowel', 0.2)
    setPauseLength(before, 0, 0.1)
    expect(before).toEqual(sample())
  })
})

/** /mora_data のように全部の句の高さを 4.0、長さを 0.2 で返す */
function fakeEngine() {
  const moraData = vi.fn(async (phrases: AccentPhrase[], _styleId: number) =>
    phrases.map((p) => ({
      ...structuredClone(p),
      moras: p.moras.map((m) => ({ ...m, pitch: m.pitch === 0 ? 0 : 4, vowel_length: 0.2 })),
      pause_mora: p.pause_mora && { ...p.pause_mora, vowel_length: 0.5 },
    })),
  )
  const accentPhrases = vi.fn(async (_text: string, _styleId: number, _isKana: boolean): Promise<AccentPhrase[]> => [
    phrase(['ズ', 'ン', 'ダ'], 3, { moras: ['ズ', 'ン', 'ダ'].map((t) => mora(t, 6)) }),
    phrase(['モ', 'オ', 'ン'], 1, { moras: ['モ', 'オ', 'ン'].map((t) => mora(t, 6)) }),
  ])
  return { moraData, accentPhrases }
}

describe('refetchPhrases', () => {
  it('sends every phrase and replaces only the changed ones, keeping hand-tuned pitch elsewhere', async () => {
    const engine = fakeEngine()
    const ps = setMoraPitch(sample(), 1, 0, 6.2)
    const next = await refetchPhrases(engine, ps, [0], 3)
    expect(engine.moraData).toHaveBeenCalledWith(ps, 3)
    expect(next[0]!.moras.every((m) => m.pitch === 4 && m.vowel_length === 0.2)).toBe(true)
    expect(next[0]!.pause_mora!.vowel_length).toBe(0.5)
    expect(next[1]).toEqual(ps[1])
    expect(next[1]!.moras[0]!.pitch).toBe(6.2)
  })

  it('keeps the accent and the question from the edited phrases', async () => {
    const engine = {
      moraData: vi.fn(async (phrases: AccentPhrase[]) => phrases.map((p) => ({ ...p, accent: 1, is_interrogative: false }))),
    }
    const next = await refetchPhrases(engine, sample(), [1], 3)
    expect(next[1]!.accent).toBe(3)
    expect(next[1]!.is_interrogative).toBe(true)
  })

  it('rejects when the engine returns a different phrase layout', async () => {
    const engine = { moraData: vi.fn(async (phrases: AccentPhrase[]) => phrases.slice(1)) }
    await expect(refetchPhrases(engine, sample(), [0], 3)).rejects.toBeInstanceOf(VoicevoxError)
  })
})

describe('moraCount', () => {
  // 本物のエンジン（0.25.2）の /accent_phrases?is_kana=true が返したモーラ数と照らした
  it.each([
    ['ズンダモン', 5],
    ['キャット', 3],
    ['ズンダモオン', 6],
    ['ヴァイオリン', 5],
    ['ウォッチ', 3],
    ['クヮ', 1],
    ['ティー', 2],
    ['ニョ', 1],
    ['', 0],
  ])('%s has %i moras', (reading, n) => {
    expect(moraCount(reading)).toBe(n)
  })
})

describe('kanaWithAccent', () => {
  const p = (accent: number, patch: Partial<AccentPhrase> = {}) => phrase(['ズ', 'ン', 'ダ', 'モ', 'ン'], accent, patch)

  it('puts the accent mark after the accent mora', () => {
    expect(kanaWithAccent(p(3), 'ズンダモン')).toBe("ズンダ'モン")
  })

  it('puts the mark at the end when the accent is past the last mora', () => {
    expect(kanaWithAccent(p(5), 'ズンダ')).toBe("ズンダ'")
  })

  it('counts a contracted sound (キャ) as one mora', () => {
    expect(kanaWithAccent(p(2), 'キャット')).toBe("キャッ'ト")
    expect(kanaWithAccent(p(1), 'キャット')).toBe("キャ'ット")
  })

  it('appends ？ for a question', () => {
    expect(kanaWithAccent(p(3, { is_interrogative: true }), 'ズンダモン')).toBe("ズンダ'モン？")
  })

  it('reads hiragana as katakana and drops spaces and marks', () => {
    expect(kanaWithAccent(p(3), ' ずんだ もん ')).toBe("ズンダ'モン")
    expect(kanaWithAccent(p(3), "ズン'ダ/モン？")).toBe("ズンダ'モン")
  })

  // エンジンのかな表記は「ー」を受け付けないので、前のモーラの母音に直して送る
  it('spells a long vowel mark as the previous vowel', () => {
    expect(kanaWithAccent(p(1), 'ギューニュー')).toBe("ギュ'ウニュウ")
    expect(kanaWithAccent(p(2), 'ティー')).toBe("ティイ'")
    expect(kanaWithAccent(p(1), 'カーテン')).toBe("カ'アテン")
  })
})

describe('replaceReading', () => {
  it('replaces the phrase with every phrase the engine returns and refetches them in context', async () => {
    const engine = fakeEngine()
    const before = sample()
    const next = await replaceReading(engine, before, 0, 'ズンダモオン', 3)
    expect(engine.accentPhrases).toHaveBeenCalledWith("ズンダ'モオン", 3, true)
    expect(next).toHaveLength(3)
    expect(texts(next)).toBe('ズンダモオンヨロシク')
    // 差し替えた句だけ取り直す
    expect(next[0]!.moras.every((m) => m.pitch === 4)).toBe(true)
    expect(next[1]!.moras.every((m) => m.pitch === 4)).toBe(true)
    expect(next[2]).toEqual(before[1])
    // 元の句の後ろの無音は、差し替えた最後の句に残す
    expect(next[0]!.pause_mora).toBeNull()
    expect(next[1]!.pause_mora!.text).toBe('、')
    expect(engine.moraData.mock.calls[0]![0]).toHaveLength(3)
  })

  it('rejects with the engine error and leaves the phrases as they were', async () => {
    const before = sample()
    const error = new VoicevoxError('http', 'VOICEVOX エンジンがエラーを返しました (400): 判別できない読み仮名があります', 400)
    const engine = { ...fakeEngine(), accentPhrases: vi.fn(async () => Promise.reject(error)) }
    await expect(replaceReading(engine, before, 0, 'ABC', 3)).rejects.toBe(error)
    expect(before).toEqual(sample())
    expect(engine.moraData).not.toHaveBeenCalled()
  })

  it('rejects an empty reading without calling the engine', async () => {
    const engine = fakeEngine()
    await expect(replaceReading(engine, sample(), 0, '  ', 3)).rejects.toThrow('読み')
    expect(engine.accentPhrases).not.toHaveBeenCalled()
  })
})
