import { describe, expect, it, vi } from 'vitest'
import { VoicevoxError } from '../../../src/core/voicevox/client'
import {
  isTuningStale,
  queryFromTuning,
  resolveTuning,
  tuningFromQuery,
} from '../../../src/core/voicevox/tuning'
import type { AccentPhrase, AudioQuery, Mora } from '../../../src/core/voicevox/types'

const mora = (text: string, pitch: number, len = 0.1): Mora => ({
  text,
  consonant: 'k',
  consonant_length: len,
  vowel: 'a',
  vowel_length: len,
  pitch,
})

const phrases = (pitch = 5): AccentPhrase[] => [
  { moras: [mora('カ', pitch), mora('キ', pitch)], accent: 2, pause_mora: mora('、', 0, 0.3), is_interrogative: false },
  { moras: [mora('ク', pitch)], accent: 1, pause_mora: null, is_interrogative: true },
]

const query = (): AudioQuery => ({
  accent_phrases: phrases(),
  speedScale: 1,
  pitchScale: 0.05,
  intonationScale: 1.2,
  volumeScale: 0.9,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.2,
  pauseLength: null,
  pauseLengthScale: 1.1,
  outputSamplingRate: 24000,
  outputStereo: true,
})

describe('tuning', () => {
  it('round-trips a query into a synthesis query', () => {
    const q = query()
    const t = tuningFromQuery(q, 'テスト', 3)
    const out = queryFromTuning(t, 1.5)
    expect(out.accent_phrases).toEqual(q.accent_phrases)
    expect(out.pitchScale).toBe(0.05)
    expect(out.intonationScale).toBe(1.2)
    expect(out.volumeScale).toBe(0.9)
    expect(out.pauseLengthScale).toBe(1.1)
    expect(out.prePhonemeLength).toBe(0.1)
    expect(out.postPhonemeLength).toBe(0.2)
    expect(out.speedScale).toBe(1.5)
    expect(out.outputSamplingRate).toBe(48000)
    expect(out.outputStereo).toBe(false)
    expect(out.pauseLength).toBeNull()
    expect(t).toMatchObject({ text: 'テスト', styleId: 3 })
  })

  it('does not alias the query or the produced query', () => {
    const q = query()
    const t = tuningFromQuery(q, 'a', 1)
    q.accent_phrases[0].accent = 9
    expect(t.accentPhrases[0].accent).toBe(2)
    const out = queryFromTuning(t, 1)
    out.accent_phrases[0].moras[0].pitch = 99
    expect(t.accentPhrases[0].moras[0].pitch).toBe(5)
  })

  it('keeps the voice when styleId matches', async () => {
    const moraData = vi.fn()
    const t = tuningFromQuery(query(), 'a', 3)
    const r = await resolveTuning({ moraData }, t, 3)
    expect(moraData).not.toHaveBeenCalled()
    expect(r).toEqual({ tuning: t, refreshed: false })
  })

  it('refetches pitch and length for a different voice, keeping the rest', async () => {
    const moraData = vi.fn().mockResolvedValue(phrases(4.2).map((p) => ({ ...p, accent: 7 })))
    const t = tuningFromQuery(query(), 'a', 3)
    const r = await resolveTuning({ moraData }, t, 8)
    expect(moraData).toHaveBeenCalledTimes(1)
    expect(moraData.mock.calls[0][1]).toBe(8)
    expect(r.refreshed).toBe(true)
    expect(r.tuning.styleId).toBe(8)
    expect(r.tuning.pitchScale).toBe(0.05)
    expect(r.tuning.accentPhrases[0].moras[0].pitch).toBe(4.2)
    expect(r.tuning.accentPhrases[0].accent).toBe(2)
    expect(r.tuning.accentPhrases[0].pause_mora?.vowel_length).toBe(0.3)
    expect(r.tuning.accentPhrases[1].pause_mora).toBeNull()
    expect(r.tuning.accentPhrases[1].is_interrogative).toBe(true)
    expect(t.styleId).toBe(3)
    expect(t.accentPhrases[0].moras[0].pitch).toBe(5)
  })

  it('rejects when the engine fails', async () => {
    const moraData = vi.fn().mockRejectedValue(new VoicevoxError('unreachable', 'x'))
    await expect(resolveTuning({ moraData }, tuningFromQuery(query(), 'a', 3), 8)).rejects.toThrow('x')
  })

  it('throws invalid-response when counts differ', async () => {
    const t = tuningFromQuery(query(), 'a', 3)
    for (const bad of [phrases().slice(0, 1), phrases().map((p) => ({ ...p, moras: p.moras.slice(1) }))]) {
      const err = await resolveTuning({ moraData: vi.fn().mockResolvedValue(bad) }, t, 8).catch((e) => e)
      expect(err).toBeInstanceOf(VoicevoxError)
      expect(err.kind).toBe('invalid-response')
    }
  })

  it('detects a stale text', () => {
    const t = tuningFromQuery(query(), 'あいう', 1)
    expect(isTuningStale(t, 'あいう')).toBe(false)
    expect(isTuningStale(t, 'あいえ')).toBe(true)
  })
})
