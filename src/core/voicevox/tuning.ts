import type { LineTuning } from '../character/types'
import { VoicevoxError, prepareQuery } from './client'
import type { VoicevoxClient } from './client'
import type { AccentPhrase, AudioQuery } from './types'

/** /audio_query の結果から作り込みの初期値を作る。話速は ScriptLine 側に置くので持たない。 */
export function tuningFromQuery(query: AudioQuery, text: string, styleId: number): LineTuning {
  return {
    text,
    styleId,
    // 呼び出し側のクエリを書き換えても作り込みが変わらないよう、コピーして持つ。
    accentPhrases: structuredClone(query.accent_phrases),
    pitchScale: query.pitchScale,
    intonationScale: query.intonationScale,
    volumeScale: query.volumeScale,
    pauseLengthScale: query.pauseLengthScale ?? 1,
    prePhonemeLength: query.prePhonemeLength,
    postPhonemeLength: query.postPhonemeLength,
  }
}

/** 合成に使うクエリ。pauseLength（絶対値）は使わず、間は pauseLengthScale だけで決める。 */
export function queryFromTuning(tuning: LineTuning, speedScale: number): AudioQuery {
  return prepareQuery(
    {
      accent_phrases: tuning.accentPhrases,
      speedScale,
      pitchScale: tuning.pitchScale,
      intonationScale: tuning.intonationScale,
      volumeScale: tuning.volumeScale,
      prePhonemeLength: tuning.prePhonemeLength,
      postPhonemeLength: tuning.postPhonemeLength,
      pauseLength: null,
      pauseLengthScale: tuning.pauseLengthScale,
      outputSamplingRate: 0,
      outputStereo: false,
    },
    speedScale,
  )
}

export function isTuningStale(tuning: LineTuning, text: string): boolean {
  return tuning.text !== text
}

function mismatch(): VoicevoxError {
  return new VoicevoxError('invalid-response', 'VOICEVOX エンジンが返したアクセント句の構成が送ったものと異なります')
}

/**
 * /mora_data の結果から高さと長さ（句の後ろの無音を含む）を差し替える。`only` を渡すとその句だけ。
 * アクセント位置・句の区切り・疑問符は作り込みの内容なので元のまま残す。
 * 送ったものと句やモーラの数が合わなければ投げる。
 */
export function mergeMoraData(current: AccentPhrase[], fetched: AccentPhrase[], only?: readonly number[]): AccentPhrase[] {
  if (fetched.length !== current.length) throw mismatch()
  return current.map((phrase, i) => {
    if (only && !only.includes(i)) return structuredClone(phrase)
    const next = fetched[i]
    if (
      !Array.isArray(next?.moras) ||
      next.moras.length !== phrase.moras.length ||
      (next.pause_mora === null || next.pause_mora === undefined) !== (phrase.pause_mora === null)
    ) {
      throw mismatch()
    }
    return { ...structuredClone(phrase), moras: structuredClone(next.moras), pause_mora: structuredClone(next.pause_mora ?? null) }
  })
}

/** 作り込み済みの声と今の声が違えば、高さと長さだけをその声で取り直す。失敗は呼び出し側へ伝える。 */
export async function resolveTuning(
  client: Pick<VoicevoxClient, 'moraData'>,
  tuning: LineTuning,
  styleId: number,
): Promise<{ tuning: LineTuning; refreshed: boolean }> {
  if (tuning.styleId === styleId) return { tuning, refreshed: false }
  // 声が違うと高さも長さも変わるので、その声の値に差し替える。
  const fetched = await client.moraData(tuning.accentPhrases, styleId)
  return { tuning: { ...tuning, styleId, accentPhrases: mergeMoraData(tuning.accentPhrases, fetched) }, refreshed: true }
}
