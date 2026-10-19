import type { AudioQuery, Mora } from '../../src/core/voicevox/types'

export function mora(
  text: string,
  consonant: string | null,
  consonantLength: number | null,
  vowel: string,
  vowelLength: number,
): Mora {
  return { text, consonant, consonant_length: consonantLength, vowel, vowel_length: vowelLength, pitch: 5 }
}

/** 「こんにちは、」相当の手書き AudioQuery。pre 0.1・post 0.1・pause_mora 1つ。 */
export function konnichiwaQuery(overrides: Partial<AudioQuery> = {}): AudioQuery {
  return {
    accent_phrases: [
      {
        moras: [
          mora('コ', 'k', 0.06, 'o', 0.11),
          mora('ン', null, null, 'N', 0.09),
          mora('ニ', 'n', 0.05, 'i', 0.1),
          mora('チ', 'ch', 0.07, 'I', 0.08),
          mora('ワ', 'w', 0.04, 'a', 0.13),
        ],
        accent: 5,
        pause_mora: { text: '、', consonant: null, consonant_length: null, vowel: 'pau', vowel_length: 0.3, pitch: 0 },
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
    outputSamplingRate: 24000,
    outputStereo: false,
    ...overrides,
  }
}
