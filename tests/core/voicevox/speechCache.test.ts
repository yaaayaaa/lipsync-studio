import { describe, expect, it, vi } from 'vitest'
import { SpeechCache } from '../../../src/core/voicevox/speechCache'
import type { Speech } from '../../../src/core/voicevox/speechCache'

const speech = (bytes: number): Speech => ({ wav: new ArrayBuffer(bytes), timeline: { segments: [], duration: 0 } })

function fakeSynth(bytes = 10) {
  return vi.fn(async (_text: string, _styleId: number, _speed: number) => speech(bytes))
}

describe('SpeechCache', () => {
  it('synthesizes once for the same text, voice and speed', async () => {
    const synth = fakeSynth()
    const cache = new SpeechCache(synth)
    const first = await cache.speak('こんにちは', 3, 1)
    const second = await cache.speak('こんにちは', 3, 1)
    expect(second).toBe(first)
    expect(synth).toHaveBeenCalledTimes(1)
  })

  it('synthesizes again when the text, voice or speed differs', async () => {
    const synth = fakeSynth()
    const cache = new SpeechCache(synth)
    await cache.speak('こんにちは', 3, 1)
    await cache.speak('こんにちは。', 3, 1)
    await cache.speak('こんにちは', 1, 1)
    await cache.speak('こんにちは', 3, 1.5)
    expect(synth).toHaveBeenCalledTimes(4)
  })

  it('shares one synthesis between requests made while it is running', async () => {
    const synth = fakeSynth()
    const cache = new SpeechCache(synth)
    const [a, b] = await Promise.all([cache.speak('a', 3, 1), cache.speak('a', 3, 1)])
    expect(a).toBe(b)
    expect(synth).toHaveBeenCalledTimes(1)
  })

  it('does not remember failures', async () => {
    const synth = vi
      .fn<(text: string, styleId: number, speed: number) => Promise<Speech>>()
      .mockRejectedValueOnce(new Error('unreachable'))
      .mockResolvedValueOnce(speech(10))
    const cache = new SpeechCache(synth)
    await expect(cache.speak('a', 3, 1)).rejects.toThrow('unreachable')
    await expect(cache.speak('a', 3, 1)).resolves.toBeDefined()
    expect(synth).toHaveBeenCalledTimes(2)
  })

  it('drops the least recently used speech when over the size limit', async () => {
    const synth = fakeSynth(10)
    const cache = new SpeechCache(synth, 25)
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
    const cache = new SpeechCache(synth, 50)
    await cache.speak('a', 3, 1)
    await cache.speak('a', 3, 1)
    expect(synth).toHaveBeenCalledTimes(1)
  })
})
