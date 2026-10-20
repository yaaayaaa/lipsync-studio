import { useCallback } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { renderLineMp4 } from '../../core/export/encode'
import { creditText, singleFileName } from '../../core/export/naming'
import { newId } from '../../core/id'
import { useApp } from '../useApp'
import { downloadBlob, resolveLine } from './lineJobs'
import { useScriptLines } from './useScriptLines'
import type { SpeakLine } from './useSpeakLine'

export interface RenderedLine {
  blob: Blob
  characterName: string
  speakerName: string
}

export interface RenderOptions {
  signal: AbortSignal
  onProgress(ratio: number): void
  /** 声が変わって高さと長さを取り直したとき */
  onRefreshed?(lineId: string): void
}

/** 1行分：合成と口の画像の用意を並行し、mp4 にする。書き出しの設定は呼んだ時点のもの */
export function useRenderLine(speak: SpeakLine) {
  const { characters, settings } = useApp()
  const { frameCache } = useScriptLines()
  const exportSettings = settings.export

  const render = useCallback(
    async (line: ScriptLine, { signal, onProgress, onRefreshed }: RenderOptions): Promise<RenderedLine> => {
      const { character, expression } = resolveLine(line, characters)
      const lease = frameCache.acquire(character, expression)
      try {
        const [{ frames, psdSize }, { wav, timeline }] = await Promise.all([
          lease.frames,
          speak(line, character.voice.styleId, onRefreshed),
        ])
        const blob = await renderLineMp4({ wav, timeline, frames, psdSize, settings: exportSettings, onProgress, signal })
        return { blob, characterName: character.name, speakerName: character.voice.speakerName }
      } finally {
        lease.release()
      }
    },
    [characters, frameCache, exportSettings, speak],
  )

  /** 1行を mp4 にしてダウンロードさせる。ファイル名の ID は書き出すたびに作る */
  const exportSingle = useCallback(
    async (line: ScriptLine, options: RenderOptions): Promise<{ fileName: string; credit: string }> => {
      const r = await render(line, options)
      const fileName = singleFileName(line.text, newId())
      downloadBlob(r.blob, fileName)
      return { fileName, credit: creditText([r.speakerName]) }
    },
    [render],
  )

  return { render, exportSingle }
}
