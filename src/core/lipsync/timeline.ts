import type { Vowel } from '../character/types'
import type { AudioQuery, Mora } from '../voicevox/types'

/** エンジンの音声フレームレート（24000 Hz / 256 サンプル）。 */
export const ENGINE_FRAME_RATE = 93.75

/** エンジンの UPSPEAK_LENGTH。疑問形アクセント句の末尾に足されるモーラの長さ（秒、speedScale 適用前）。 */
export const UPSPEAK_LENGTH = 0.15

export interface MouthSegment {
  start: number
  end: number
  vowel: Vowel
}

export interface MouthTimeline {
  segments: MouthSegment[]
  duration: number
}

/** 無声化母音（A,I,U,E,O）は小文字の母音。N（ん）は n。cl・pau・sil などは closed。 */
export function vowelToMouth(vowel: string): Vowel {
  switch (vowel.toLowerCase()) {
    case 'a':
    case 'i':
    case 'u':
    case 'e':
    case 'o':
      return vowel.toLowerCase() as Vowel
    case 'n':
      return 'n'
    default:
      return 'closed'
  }
}

/** 偶数丸め。エンジンの np.round に合わせる（Math.round は .5 を切り上げるので使えない）。 */
function roundHalfToEven(x: number): number {
  const floor = Math.floor(x)
  const diff = x - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

function toFrames(seconds: number, speedScale: number): number {
  return roundHalfToEven((seconds / speedScale) * ENGINE_FRAME_RATE)
}

interface Run {
  frames: number
  vowel: Vowel
}

function silence(seconds: number, speedScale: number): Run {
  return { frames: toFrames(seconds, speedScale), vowel: 'closed' }
}

function moraRuns(mora: Mora, speedScale: number): Run[] {
  const vowel = vowelToMouth(mora.vowel)
  const runs: Run[] = []
  if (mora.consonant) {
    runs.push({ frames: toFrames(mora.consonant_length ?? 0, speedScale), vowel })
  }
  runs.push({ frames: toFrames(mora.vowel_length, speedScale), vowel })
  return runs
}

/**
 * VOICEVOX エンジン（tts_engine.py の _query_to_decoder_feature）と同じ順序で
 * pre → 各モーラ → pause_mora → post を音素単位でフレーム化し、口のタイムラインにする。
 * 疑問形アクセント句の末尾モーラ追加（upspeak）も含む。
 * pauseLength / pauseLengthScale は pause_mora にだけ効き、前後の無音には効かない。
 */
export function buildMouthTimeline(query: AudioQuery): MouthTimeline {
  const { speedScale } = query
  if (!(speedScale > 0)) {
    throw new Error(`speedScale must be positive, got ${speedScale}`)
  }
  const pauseScale = query.pauseLengthScale ?? 1

  const runs: Run[] = [silence(query.prePhonemeLength, speedScale)]
  for (const phrase of query.accent_phrases) {
    for (const mora of phrase.moras) runs.push(...moraRuns(mora, speedScale))
    const lastMora = phrase.moras.at(-1)
    // /synthesis は enable_interrogative_upspeak=true が既定。疑問形かつ末尾が有声のときだけ、
    // 末尾と同じ母音で UPSPEAK_LENGTH 秒のモーラが付く（pause_mora の前）。
    if (phrase.is_interrogative && lastMora && lastMora.pitch > 0) {
      runs.push({ frames: toFrames(UPSPEAK_LENGTH, speedScale), vowel: vowelToMouth(lastMora.vowel) })
    }
    if (phrase.pause_mora) {
      const base = query.pauseLength ?? phrase.pause_mora.vowel_length
      runs.push(silence(base * pauseScale, speedScale))
    }
  }
  runs.push(silence(query.postPhonemeLength, speedScale))

  // フレーム数の整数のまま連結・併合し、最後に秒へ変換する（境界の隙間・重なりを作らない）
  const merged: Run[] = []
  for (const run of runs) {
    if (run.frames <= 0) continue
    const last = merged.at(-1)
    if (last && last.vowel === run.vowel) last.frames += run.frames
    else merged.push({ ...run })
  }

  const segments: MouthSegment[] = []
  let cursor = 0
  for (const run of merged) {
    const end = cursor + run.frames
    segments.push({ start: cursor / ENGINE_FRAME_RATE, end: end / ENGINE_FRAME_RATE, vowel: run.vowel })
    cursor = end
  }
  return { segments, duration: cursor / ENGINE_FRAME_RATE }
}

/** t 秒の口。区間は start 含む・end 含まず。範囲外は closed。 */
export function mouthAt(timeline: MouthTimeline, t: number): Vowel {
  const { segments } = timeline
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const seg = segments[mid]!
    if (t < seg.start) hi = mid - 1
    else if (t >= seg.end) lo = mid + 1
    else return seg.vowel
  }
  return 'closed'
}
