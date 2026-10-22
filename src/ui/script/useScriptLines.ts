import { createContext, useContext } from 'react'
import type { ScriptLine } from '../../core/character/types'
import type { MouthFrameCache } from './mouthFrameCache'

export interface ScriptContextValue {
  /** 読み込み中は null */
  lines: ScriptLine[] | null
  /** 読み込み・保存の失敗 */
  error: string | null
  /** 画面にはすぐ反映し、300ms まとめて保存する */
  update(fn: (prev: ScriptLine[]) => ScriptLine[]): void
  /** 口の画像。行を開き直しても同じものを使い回す */
  frameCache: MouthFrameCache
  /** 1行編集で開いている行。消された行は未選択（null）として扱う */
  editingLineId: string | null
  /** 1行編集のタブへ切り替えて、その行を開く */
  openLineEditor(lineId: string): void
  /** どちらかの画面で書き出し中。その間はどちらの画面でも行の編集と再生・書き出しを止める */
  exportLocked: boolean
  /** 今この瞬間に書き出し中か。非同期の結果を入れる直前の確認に使う（exportLocked は次の描画まで古いことがある） */
  isExportLocked(): boolean
  /** 書き出しを始める。もう誰かが書き出し中なら null。終わったら返ってきた関数を必ず呼ぶ */
  claimExport(): (() => void) | null
}

/** 値は ScriptProvider（ScriptContext.tsx）が入れる。 */
export const ScriptContext = createContext<ScriptContextValue | null>(null)

export function useScriptLines(): ScriptContextValue {
  const value = useContext(ScriptContext)
  if (!value) throw new Error('useScriptLines must be used inside <ScriptProvider>')
  return value
}
