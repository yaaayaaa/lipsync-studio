import { useState } from 'react'
import { errorMessage } from '../script/lineJobs'
import type { ChangePhrasesAsync, ComputePhrases } from './PhraseEditor'
import type { EditResult } from './useLineTuning'

/** 結果を入れられなかったときの知らせ */
const NOT_APPLIED: Record<Exclude<EditResult, 'applied'>, string> = {
  dropped: '内容が変わったため反映しませんでした',
  locked: '書き出し中のため反映しませんでした',
}

interface State {
  lineId: string
  busy: boolean
  error: string | null
}

/**
 * エンジンを呼ぶ句の変更（取り直し・読みの変更）の「取り直し中」と失敗の知らせ。
 * アクセント・高さ・長さは別々のパネルに置けるので、どのパネルからも同じ状態を見られるよう画面で持つ。
 * 行を変えたら前の行の知らせは見せない（前の行の取り直しが後から終わっても、今の行には出さない）
 */
export function usePhraseAsync(lineId: string | null, onChangeAsync: ChangePhrasesAsync) {
  const [state, setState] = useState<State | null>(null)

  /** 取り直しの間は編集欄を止める。行に入ったら true（失敗・入れなかったときは知らせて false） */
  const run = async (compute: ComputePhrases): Promise<boolean> => {
    if (lineId === null) return false
    const settle = (error: string | null) =>
      setState((cur) => (cur?.lineId === lineId ? { lineId, busy: false, error } : cur))
    setState({ lineId, busy: true, error: null })
    try {
      const result = await onChangeAsync(compute)
      settle(result === 'applied' ? null : NOT_APPLIED[result])
      return result === 'applied'
    } catch (e) {
      settle(errorMessage(e))
      return false
    }
  }

  const current = state?.lineId === lineId ? state : null
  return { busy: current?.busy ?? false, error: current?.error ?? null, run }
}
