import { useState } from 'react'
import { exportLines, zipResults } from '../../core/export/exportAll'
import { lineFileName } from '../../core/export/naming'
import { useApp } from '../useApp'
import { downloadBlob, errorMessage, isAbortError } from '../script/lineJobs'
import { useExportJob } from '../script/useExportJob'
import { useRenderLine } from '../script/useRenderLine'
import { useScriptLines } from '../script/useScriptLines'
import type { SpeakLine } from '../script/useSpeakLine'
import { BULK_FILE_NAMES, bulkSummary, planBulkExport } from './bulkExportPlan'
import type { BulkMode } from './bulkExportPlan'

export type BulkExportState =
  | { state: 'idle' }
  /** 今 position 番目（書き出す行の中で 0 から）の行を書いている。lineNumber は台本の中の行番号（1 から） */
  | { state: 'exporting'; mode: BulkMode; position: number; total: number; lineNumber: number; progress: number }
  | { state: 'done' | 'aborted' | 'error'; message: string }

/**
 * 台本のまとめて書き出し。書き出せる行だけを台本の順に、1本の mp4 につなぐか、行ごとの mp4 を zip にする。
 * 書き出しの占有は1行の書き出しと共通なので、どちらかが動いている間はもう片方は始まらない
 */
export function useBulkExport(speak: SpeakLine, onStart: () => void) {
  const { characters } = useApp()
  const { lines } = useScriptLines()
  const { render, renderJoined } = useRenderLine(speak)
  const job = useExportJob()
  const [status, setStatus] = useState<BulkExportState>({ state: 'idle' })

  const plan = lines ? planBulkExport(lines, characters) : null
  const canExport = plan !== null && plan.targets.length > 0

  const start = async (mode: BulkMode) => {
    if (!plan || plan.targets.length === 0) return
    const signal = job.start()
    if (!signal) return
    onStart()
    // 始めた時点の台本を書き出す（書き出しの間は編集を止めているが、念のため写しを持つ）
    const { targets, skipped } = plan
    const skippedIndexes = skipped.map((s) => s.index)
    const total = targets.length
    // 1本につなぐときは途中で止まると全体が失敗になるので、どの行で止まったかを知らせに使う
    let lineNumber = targets[0]!.index + 1
    const progress = (position: number, ratio: number) => {
      lineNumber = targets[position]!.index + 1
      setStatus({ state: 'exporting', mode, position, total, lineNumber, progress: ratio })
    }
    progress(0, 0)
    try {
      if (mode === 'joined') {
        const blob = await renderJoined(
          targets.map((t) => t.line),
          { signal, onProgress: progress },
        )
        downloadBlob(blob, BULK_FILE_NAMES.joined)
        setStatus({ state: 'done', message: bulkSummary(mode, total, skippedIndexes) })
      } else {
        const results = await exportLines(
          targets.map((t) => t.line),
          async (line, position) => {
            progress(position, 0)
            const r = await render(line, { signal, onProgress: (ratio) => progress(position, ratio) })
            return { fileName: lineFileName(targets[position]!.index, r.characterName, line.text), blob: r.blob }
          },
        )
        const failed = results.flatMap((r, position) =>
          r.ok ? [] : [{ index: targets[position]!.index, error: r.error }],
        )
        const written = total - failed.length
        if (written > 0) downloadBlob(await zipResults(results), BULK_FILE_NAMES.zip)
        setStatus({
          state: written > 0 ? 'done' : 'error',
          message: bulkSummary(mode, written, skippedIndexes, failed),
        })
      }
    } catch (e) {
      setStatus(
        isAbortError(e)
          ? { state: 'aborted', message: '書き出しを中止しました' }
          : {
              state: 'error',
              message: mode === 'joined' ? `${lineNumber}行目で止まりました：${errorMessage(e)}` : errorMessage(e),
            },
      )
    } finally {
      job.finish()
    }
  }

  return { status, canExport, start, abort: job.abort }
}
