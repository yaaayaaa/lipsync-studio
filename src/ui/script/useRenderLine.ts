import { useCallback } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { renderLineMp4, renderSegmentsMp4 } from '../../core/export/encode'
import type { LineSegment } from '../../core/export/encode'
import { effectiveTail } from '../../core/export/tail'
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

export interface JoinedOptions {
  signal: AbortSignal
  /** index 番目の行（渡した配列の中の位置）の、その行の中での進み具合 */
  onProgress(index: number, ratio: number): void
}

/** 1行分：合成と口の画像の用意を並行し、mp4 にする。書き出しの設定は呼んだ時点のもの */
export function useRenderLine(speak: SpeakLine) {
  const { characters, settings } = useApp()
  const { frameCache } = useScriptLines()
  const exportSettings = settings.export

  /** 1行分の素材（合成と口の画像）を並行して用意する。release は書き終えたら必ず呼ぶ */
  const loadSegment = useCallback(
    async (line: ScriptLine, onRefreshed?: (lineId: string) => void) => {
      const { character, expression, voice } = resolveLine(line, characters)
      const lease = frameCache.acquire(character, expression)
      try {
        const [{ frames, psdSize }, { wav, timeline }] = await Promise.all([
          lease.frames,
          speak(line, voice.styleId, onRefreshed),
        ])
        const segment: LineSegment = {
          wav,
          timeline,
          frames,
          psdSize,
          tailSeconds: effectiveTail(line, exportSettings),
          blinkSeed: line.id,
        }
        return {
          segment,
          release: () => lease.release(),
          characterName: character.name,
          speakerName: voice.speakerName,
        }
      } catch (e) {
        lease.release()
        throw e
      }
    },
    [characters, frameCache, exportSettings, speak],
  )

  const render = useCallback(
    async (line: ScriptLine, { signal, onProgress, onRefreshed }: RenderOptions): Promise<RenderedLine> => {
      const { segment, release, characterName, speakerName } = await loadSegment(line, onRefreshed)
      try {
        const blob = await renderLineMp4({ ...segment, settings: exportSettings, onProgress, signal })
        return { blob, characterName, speakerName }
      } finally {
        release()
      }
    },
    [loadSegment, exportSettings],
  )

  /** 何行かを続けて1本の mp4 にする。行は1つずつ合成して書き込む（全部を先に合成して持たない） */
  const renderJoined = useCallback(
    (lines: ScriptLine[], { signal, onProgress }: JoinedOptions): Promise<Blob> =>
      renderSegmentsMp4({
        settings: exportSettings,
        count: lines.length,
        load: (index) => loadSegment(lines[index]!),
        onProgress,
        signal,
      }),
    [loadSegment, exportSettings],
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

  return { render, renderJoined, exportSingle }
}
