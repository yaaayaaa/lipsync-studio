import type { LineTuning, ScriptLine } from '../../core/character/types'
import type { VoicevoxClient } from '../../core/voicevox/client'
import { isTuningStale, resolveTuning, tuningFromQuery } from '../../core/voicevox/tuning'
import { SPEED_MAX, SPEED_MIN, SPEED_STEP } from '../script/speed'

/** 作り込み（tuning）に入る全体の数値。話速は行の値（ScriptLine.speedScale）なので含まない */
export type GlobalParam =
  | 'pitchScale'
  | 'intonationScale'
  | 'volumeScale'
  | 'pauseLengthScale'
  | 'prePhonemeLength'
  | 'postPhonemeLength'

export interface ParamRange {
  min: number
  max: number
  step: number
  label: string
}

/** 範囲は VOICEVOX エディタに合わせる。話速だけは「セリフ」の一覧と同じ範囲・刻みにそろえる */
export const GLOBAL_PARAM_RANGES: Record<GlobalParam | 'speedScale', ParamRange> = {
  speedScale: { min: SPEED_MIN, max: SPEED_MAX, step: SPEED_STEP, label: '話速' },
  pitchScale: { min: -0.15, max: 0.15, step: 0.01, label: '音高' },
  intonationScale: { min: 0, max: 2, step: 0.01, label: '抑揚' },
  volumeScale: { min: 0, max: 2, step: 0.01, label: '音量' },
  pauseLengthScale: { min: 0, max: 2, step: 0.01, label: '間の倍率' },
  prePhonemeLength: { min: 0, max: 1.5, step: 0.01, label: '開始の無音' },
  postPhonemeLength: { min: 0, max: 1.5, step: 0.01, label: '終了の無音' },
}

/** 範囲に丸めて1つだけ変える。数でない値は無視して今の値を残す */
export function setGlobalParam(t: LineTuning, key: GlobalParam, value: number): LineTuning {
  if (!Number.isFinite(value)) return t
  const { min, max } = GLOBAL_PARAM_RANGES[key]
  return { ...t, [key]: Math.min(max, Math.max(min, value)) }
}

/** 今の文に合う作り込み。古い（文が違う）ものは使わない */
export function usableTuning(line: ScriptLine | null): LineTuning | null {
  return line?.tuning && !isTuningStale(line.tuning, line.text) ? line.tuning : null
}

/**
 * 行の作り込みを1つ変える。base は変更の元にした作り込み（ない行では /audio_query から作ったもの）。
 * - 元にしたときから文が変わっていたら変えない（作るのにエンジンを待つ間に打ち替えた）
 * - 行に古い（文が違う）作り込みが残っていたら変えない。捨てるかどうかは文の確定で確認するので、
 *   ここで黙って作り直すと確認を飛ばして作り込みが消える
 * - 行の作り込みが同じ声のものならそれを、違えば base を元に fn を当てる。fn が null なら変えない
 */
export function applyTuningEdit(
  current: ScriptLine,
  base: LineTuning,
  fn: (t: LineTuning) => LineTuning | null,
): ScriptLine {
  if (current.text !== base.text) return current
  if (current.tuning && isTuningStale(current.tuning, current.text)) return current
  const own = usableTuning(current)
  const next = fn(own && own.styleId === base.styleId ? own : base)
  return next ? { ...current, tuning: next } : current
}

/**
 * 編集に使う作り込み。今の文と合っていれば（声が違えば高さと長さを取り直して）それを、
 * なければ・古ければ /audio_query の結果から作る。失敗は呼び出し側へ伝える。
 */
export async function ensureTuning(
  client: Pick<VoicevoxClient, 'audioQuery' | 'moraData'>,
  line: ScriptLine,
  styleId: number,
): Promise<LineTuning> {
  if (line.tuning && !isTuningStale(line.tuning, line.text)) {
    return (await resolveTuning(client, line.tuning, styleId)).tuning
  }
  return tuningFromQuery(await client.audioQuery(line.text, styleId), line.text, styleId)
}
