import { describe, expect, it, vi } from 'vitest'
import { SpeechCache, speakLine } from '../../../src/core/voicevox/speechCache'
import type { Speech } from '../../../src/core/voicevox/speechCache'
import { tuningFromQuery } from '../../../src/core/voicevox/tuning'
import type { AudioQuery } from '../../../src/core/voicevox/types'
import type { ScriptLine } from '../../../src/core/character/types'

const speech = (bytes: number): Speech => ({ wav: new ArrayBuffer(bytes), timeline: { segments: [], duration: 0 } })

function fakeSynth(bytes = 10) {
  return vi.fn(async (_text: string, _styleId: number, _speed: number) => speech(bytes))
}

const neverQuery = async (): Promise<Speech> => {
  throw new Error('unexpected query synthesis')
}

function textCache(synthesizeText: (text: string, styleId: number, speed: number) => Promise<Speech>, maxBytes?: number) {
  return new SpeechCache({ synthesizeText, synthesizeQuery: neverQuery }, maxBytes)
}

const tunedQuery = (pitch = 5): AudioQuery => ({
  accent_phrases: [
    {
      moras: [{ text: 'カ', consonant: 'k', consonant_length: 0.1, vowel: 'a', vowel_length: 0.1, pitch }],
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
  pauseLength: null,
  pauseLengthScale: 1,
  outputSamplingRate: 48000,
  outputStereo: false,
})

describe('SpeechCache', () => {
  it('synthesizes once for the same text, voice and speed', async () => {
    const synth = fakeSynth()
    const cache = textCache(synth)
    const first = await cache.speak('こんにちは', 3, 1)
    const second = await cache.speak('こんにちは', 3, 1)
    expect(second).toBe(first)
    expect(synth).toHaveBeenCalledTimes(1)
  })

  it('synthesizes again when the text, voice or speed differs', async () => {
    const synth = fakeSynth()
    const cache = textCache(synth)
    await cache.speak('こんにちは', 3, 1)
    await cache.speak('こんにちは。', 3, 1)
    await cache.speak('こんにちは', 1, 1)
    await cache.speak('こんにちは', 3, 1.5)
    expect(synth).toHaveBeenCalledTimes(4)
  })

  it('shares one synthesis between requests made while it is running', async () => {
    const synth = fakeSynth()
    const cache = textCache(synth)
    const [a, b] = await Promise.all([cache.speak('a', 3, 1), cache.speak('a', 3, 1)])
    expect(a).toBe(b)
    expect(synth).toHaveBeenCalledTimes(1)
  })

  it('does not remember failures', async () => {
    const synth = vi
      .fn<(text: string, styleId: number, speed: number) => Promise<Speech>>()
      .mockRejectedValueOnce(new Error('unreachable'))
      .mockResolvedValueOnce(speech(10))
    const cache = textCache(synth)
    await expect(cache.speak('a', 3, 1)).rejects.toThrow('unreachable')
    await expect(cache.speak('a', 3, 1)).resolves.toBeDefined()
    expect(synth).toHaveBeenCalledTimes(2)
  })

  it('drops the least recently used speech when over the size limit', async () => {
    const synth = fakeSynth(10)
    const cache = textCache(synth, 25)
    await cache.speak('a', 3, 1)
    await cache.speak('b', 3, 1)
    await cache.speak('a', 3, 1) // a を最近使ったことにする
    await cache.speak('c', 3, 1) // 30 バイトになるので、一番古い b を捨てる
    expect(synth).toHaveBeenCalledTimes(3)
    await cache.speak('a', 3, 1)
    await cache.speak('c', 3, 1)
    expect(synth).toHaveBeenCalledTimes(3)
    await cache.speak('b', 3, 1)
    expect(synth).toHaveBeenCalledTimes(4)
  })

  it('keeps a single speech larger than the limit until the next one arrives', async () => {
    const synth = fakeSynth(100)
    const cache = textCache(synth, 50)
    await cache.speak('a', 3, 1)
    await cache.speak('a', 3, 1)
    expect(synth).toHaveBeenCalledTimes(1)
  })
})

describe('SpeechCache.speakQuery', () => {
  it('synthesizes once for the same query and voice, again when a mora pitch changes by 0.01', async () => {
    const synthesizeQuery = vi.fn(async (_q: AudioQuery, _styleId: number) => speech(10))
    const cache = new SpeechCache({ synthesizeText: fakeSynth(), synthesizeQuery })
    const first = await cache.speakQuery(tunedQuery(5), 3)
    expect(await cache.speakQuery(tunedQuery(5), 3)).toBe(first)
    expect(synthesizeQuery).toHaveBeenCalledTimes(1)
    await cache.speakQuery(tunedQuery(5.01), 3)
    expect(synthesizeQuery).toHaveBeenCalledTimes(2)
    await cache.speakQuery(tunedQuery(5), 4)
    expect(synthesizeQuery).toHaveBeenCalledTimes(3)
  })

  it('shares the size limit and LRU with text speech', async () => {
    const synthesizeText = fakeSynth(10)
    const synthesizeQuery = vi.fn(async (_q: AudioQuery, _styleId: number) => speech(10))
    const cache = new SpeechCache({ synthesizeText, synthesizeQuery }, 25)
    await cache.speak('a', 3, 1)
    await cache.speakQuery(tunedQuery(), 3)
    await cache.speakQuery(tunedQuery(6), 3) // 30 バイトになるので、一番古い a を捨てる
    await cache.speak('a', 3, 1)
    expect(synthesizeText).toHaveBeenCalledTimes(2)
    await cache.speakQuery(tunedQuery(6), 3)
    expect(synthesizeQuery).toHaveBeenCalledTimes(2)
  })

  it('does not remember query failures', async () => {
    const synthesizeQuery = vi
      .fn<(q: AudioQuery, styleId: number) => Promise<Speech>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(speech(10))
    const cache = new SpeechCache({ synthesizeText: fakeSynth(), synthesizeQuery })
    await expect(cache.speakQuery(tunedQuery(), 3)).rejects.toThrow('down')
    await expect(cache.speakQuery(tunedQuery(), 3)).resolves.toBeDefined()
  })
})

describe('speakLine', () => {
  const baseLine = (over: Partial<ScriptLine> = {}): ScriptLine => ({ id: 'l1', text: 'カ', speedScale: 1, ...over }) as ScriptLine

  function setup() {
    const audioQuery = vi.fn(async (_text: string, _styleId: number) => tunedQuery())
    const synthesis = vi.fn(async (_q: AudioQuery, _styleId: number) => new ArrayBuffer(8))
    const moraData = vi.fn(async (phrases: AudioQuery['accent_phrases'], _styleId: number) =>
      phrases.map((p) => ({ ...p, moras: p.moras.map((m) => ({ ...m, pitch: m.pitch + 1 })) })),
    )
    const client = { audioQuery, synthesis, moraData }
    // forClient は VoicevoxClient 全体を取るが、テストでは使うメソッドだけを持つ偽物で足りる
    const cache = SpeechCache.forClient(client as never)
    return { client, cache, audioQuery, synthesis, moraData }
  }

  it('goes through text synthesis (audio_query) when the line has no tuning', async () => {
    const { client, cache, audioQuery } = setup()
    const result = await speakLine(cache, client, baseLine(), 3)
    expect(audioQuery).toHaveBeenCalledTimes(1)
    expect(result.tuning).toBeUndefined()
  })

  it('skips audio_query and returns no tuning when the voice matches', async () => {
    const { client, cache, audioQuery, synthesis } = setup()
    const tuning = tuningFromQuery(tunedQuery(), 'カ', 3)
    const result = await speakLine(cache, client, baseLine({ tuning }), 3)
    expect(audioQuery).not.toHaveBeenCalled()
    expect(synthesis).toHaveBeenCalledTimes(1)
    expect(result.tuning).toBeUndefined()
    expect(result.speech.timeline).toBeDefined()
  })

  it('returns a refreshed tuning when the voice differs', async () => {
    const { client, cache, audioQuery, moraData } = setup()
    const tuning = tuningFromQuery(tunedQuery(), 'カ', 3)
    const result = await speakLine(cache, client, baseLine({ tuning }), 4)
    expect(audioQuery).not.toHaveBeenCalled()
    expect(moraData).toHaveBeenCalledTimes(1)
    expect(result.tuning?.styleId).toBe(4)
    expect(result.tuning?.accentPhrases[0].moras[0].pitch).toBe(6)
  })

  it('ignores a stale tuning whose text differs from the line', async () => {
    const { client, cache, audioQuery, moraData } = setup()
    const tuning = tuningFromQuery(tunedQuery(), '古い文', 3)
    const result = await speakLine(cache, client, baseLine({ tuning }), 3)
    expect(audioQuery).toHaveBeenCalledTimes(1)
    expect(moraData).not.toHaveBeenCalled()
    expect(result.tuning).toBeUndefined()
  })
})
