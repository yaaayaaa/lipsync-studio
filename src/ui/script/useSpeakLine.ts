import { useCallback } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { speakLine } from '../../core/voicevox/speechCache'
import type { Speech } from '../../core/voicevox/speechCache'
import { useApp } from '../useApp'
import { saveRefreshedTuning } from './lineJobs'
import { useScriptLines } from './useScriptLines'

/** 行の作り込みを使って合成する。onRefreshed は声が変わって高さと長さを取り直したときに呼ぶ */
export type SpeakLine = (line: ScriptLine, styleId: number, onRefreshed?: (lineId: string) => void) => Promise<Speech>

/** 合成は SpeechCache を通す。声が変わって取り直した作り込みは、その行へ保存する */
export function useSpeakLine(): SpeakLine {
  const { speech, client } = useApp()
  const { update } = useScriptLines()
  return useCallback(
    async (line, styleId, onRefreshed) => {
      const { speech: spoken, tuning } = await speakLine(speech, client, line, styleId)
      const used = line.tuning
      if (tuning && used) {
        update((prev) => saveRefreshedTuning(prev, line.id, used, tuning))
        onRefreshed?.(line.id)
      }
      return spoken
    },
    [speech, client, update],
  )
}
