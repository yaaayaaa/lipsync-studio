import { useCallback, useState } from 'react'
import { Plus } from 'lucide-react'
import { iconProps } from '../icons'
import { exportLines, zipResults } from '../../core/export/exportAll'
import { creditText, lineFileName } from '../../core/export/naming'
import { newId } from '../../core/id'
import type { ScriptLine } from '../../core/character/types'
import { lineProblem } from '../../core/storage/db'
import { useApp } from '../useApp'
import { CreditPanel } from './CreditPanel'
import { ExportSettingsPanel } from './ExportSettingsPanel'
import { LinePreview } from './LinePreview'
import { LineRow } from './LineRow'
import type { LineStatus } from './LineRow'
import { appendLine, downloadBlob, errorMessage, isAbortError } from './lineJobs'
import { clampSpeed } from './speed'
import { useLinePlayback } from './useLinePlayback'
import type { PlaybackMode } from './useLinePlayback'
import { useExportJob } from './useExportJob'
import { useRenderLine } from './useRenderLine'
import { useScriptLines } from './useScriptLines'
import { useSpeakLine } from './useSpeakLine'

const ZIP_NAME = 'zunda-lipsync.zip'

type Exporting =
  | { mode: 'one'; lineId: string }
  | { mode: 'all'; index: number; total: number; progress: number }

export function ScriptPage({ active }: { active: boolean }) {
  const { characters, settings } = useApp()
  const { lines, update, error: scriptError, openLineEditor, exportLocked } = useScriptLines()
  const speak = useSpeakLine()
  const { render, exportSingle } = useRenderLine(speak)

  const [statuses, setStatuses] = useState<Record<string, LineStatus>>({})
  const setStatus = useCallback((lineId: string, status: LineStatus | null) => {
    setStatuses((prev) => {
      const next = { ...prev }
      if (status) next[lineId] = status
      else delete next[lineId]
      return next
    })
  }, [])

  // ---- 試聴・プレビュー ----

  const { playing, preview, play: startPlay, stop: stopPlayback } = useLinePlayback(active, speak)

  const play = (line: ScriptLine, index: number, mode: PlaybackMode) => {
    setStatus(line.id, null)
    startPlay(line, index + 1, mode, (message) => setStatus(line.id, { state: 'error', message }))
  }

  // ---- 書き出し ----

  const [exporting, setExporting] = useState<Exporting | null>(null)
  const [exportMessage, setExportMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [credit, setCredit] = useState<string | null>(null)
  const job = useExportJob()

  /** もう書き出し中（1行編集の画面を含む）なら null */
  const beginExport = (state: Exporting): AbortSignal | null => {
    const signal = job.start()
    if (!signal) return null
    stopPlayback()
    setExporting(state)
    setExportMessage(null)
    setCredit(null)
    return signal
  }

  const endExport = () => {
    job.finish()
    setExporting(null)
  }

  const exportOne = async (line: ScriptLine) => {
    const signal = beginExport({ mode: 'one', lineId: line.id })
    if (!signal) return
    setStatus(line.id, { state: 'exporting', progress: 0 })
    try {
      const r = await exportSingle(line, {
        signal,
        onProgress: (progress) => setStatus(line.id, { state: 'exporting', progress }),
      })
      setStatus(line.id, { state: 'done', fileName: r.fileName })
      setCredit(r.credit)
    } catch (e) {
      if (isAbortError(e)) {
        setStatus(line.id, null)
        setExportMessage({ text: '書き出しを中止しました', error: false })
      } else {
        setStatus(line.id, { state: 'error', message: errorMessage(e) })
      }
    } finally {
      endExport()
    }
  }

  const exportAll = async (snapshot: ScriptLine[]) => {
    const total = snapshot.length
    const signal = beginExport({ mode: 'all', index: 0, total, progress: 0 })
    if (!signal) return
    setStatuses({})
    const speakers = new Map<string, string>()
    let currentLineId: string | null = null
    try {
      const results = await exportLines(
        snapshot,
        async (line, index) => {
          currentLineId = line.id
          setExporting({ mode: 'all', index, total, progress: 0 })
          setStatus(line.id, { state: 'exporting', progress: 0 })
          const r = await render(line, {
            signal,
            onProgress: (progress) => {
              setExporting({ mode: 'all', index, total, progress })
              setStatus(line.id, { state: 'exporting', progress })
            },
          })
          speakers.set(line.id, r.speakerName)
          return { fileName: lineFileName(index, r.characterName, line.text), blob: r.blob }
        },
        (r) => setStatus(r.lineId, r.ok ? { state: 'done', fileName: r.fileName } : { state: 'error', message: r.error }),
      )
      const succeeded = results.filter((r) => r.ok)
      const failed = total - succeeded.length
      if (succeeded.length > 0) {
        downloadBlob(await zipResults(results), ZIP_NAME)
        setCredit(creditText(succeeded.map((r) => speakers.get(r.lineId)!)))
      }
      setExportMessage({
        text:
          failed === 0
            ? `${total} 行を書き出し、${ZIP_NAME} にまとめました`
            : succeeded.length === 0
              ? `すべての行で書き出しに失敗しました（理由は各行に表示しています）`
              : `${succeeded.length} 行を ${ZIP_NAME} にまとめました。${failed} 行は失敗しました（理由は各行に表示しています）`,
        error: failed > 0,
      })
    } catch (e) {
      if (currentLineId) setStatus(currentLineId, null)
      setExportMessage(
        isAbortError(e)
          ? { text: '書き出しを中止しました', error: false }
          : { text: `書き出せませんでした: ${errorMessage(e)}`, error: true },
      )
    } finally {
      endExport()
    }
  }

  // ---- 行の編集 ----

  const addLine = () => {
    const id = newId()
    update((prev) => appendLine(prev, characters, id))
  }

  const editLine = (id: string, fn: (line: ScriptLine) => ScriptLine) =>
    update((prev) => prev.map((l) => (l.id === id ? fn(l) : l)))

  const changeLine = (id: string, patch: Partial<ScriptLine>) =>
    update((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, ...patch, ...(patch.speedScale !== undefined && { speedScale: clampSpeed(patch.speedScale) }) } : l,
      ),
    )

  const moveLine = (index: number, delta: -1 | 1) =>
    update((prev) => {
      const target = index + delta
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })

  const removeLine = (id: string) => {
    if (playing?.lineId === id) stopPlayback()
    setStatus(id, null)
    update((prev) => prev.filter((l) => l.id !== id))
  }

  if (!lines) {
    return (
      <div className="script-page">
        <p className={scriptError ? 'app-message error' : 'app-message'}>{scriptError ?? 'セリフを読み込み中…'}</p>
      </div>
    )
  }

  // 1行編集の画面での書き出し中も止める
  const locked = exportLocked
  const previewCaption =
    playing?.mode === 'preview' ? (playing.loading ? '合成中…' : `${preview?.lineNumber ?? ''}行目を再生中`) : null

  return (
    <div className="script-page">
      <section className="column script-column">
        <div className="script-toolbar">
          <h2>セリフ</h2>
          <span className="script-count">{lines.length} 行</span>
          <span className="spacer" />
          {exporting?.mode === 'all' ? (
            <span className="export-progress" role="status">
              全行を書き出し中… {exporting.index + 1}/{exporting.total} 行目（{Math.round(exporting.progress * 100)}%）
              <progress max={exporting.total} value={exporting.index + exporting.progress} />
            </span>
          ) : null}
          {exporting ? (
            <button type="button" onClick={job.abort}>
              中止
            </button>
          ) : (
            <button type="button" className="primary" disabled={locked || lines.length === 0} onClick={() => void exportAll(lines)}>
              全行を書き出す
            </button>
          )}
        </div>
        {scriptError && (
          <p className="notice error" role="alert">
            {scriptError}
          </p>
        )}
        {exportMessage && (
          <p className={`notice${exportMessage.error ? ' error' : ''}`} role="status">
            {exportMessage.text}
          </p>
        )}
        {characters.length === 0 && (
          <p className="notice">まだキャラがいません。「キャラ設定」で PSD からキャラを追加してください。</p>
        )}
        <ol className="line-list">
          {lines.map((line, index) => (
            <LineRow
              key={line.id}
              line={line}
              index={index}
              count={lines.length}
              characters={characters}
              problem={lineProblem(line, characters)}
              status={statuses[line.id]}
              playing={playing?.lineId === line.id ? { mode: playing.mode, loading: playing.loading } : null}
              locked={locked}
              onChange={(patch) => changeLine(line.id, patch)}
              onEdit={(fn) => editLine(line.id, fn)}
              onMove={(delta) => moveLine(index, delta)}
              onRemove={() => removeLine(line.id)}
              onPlay={(mode) => play(line, index, mode)}
              onStop={stopPlayback}
              onExport={() => void exportOne(line)}
              onOpenEditor={() => openLineEditor(line.id)}
            />
          ))}
        </ol>
        <button type="button" className="add-line" disabled={locked} onClick={addLine}>
          <Plus {...iconProps} />
          行を追加
        </button>
      </section>
      <aside className="column panel-column script-side">
        <LinePreview frame={preview} settings={settings.export} caption={previewCaption} />
        <ExportSettingsPanel disabled={locked} />
        {credit && (
          <CreditPanel credit={credit} onError={(text) => setExportMessage({ text, error: true })} />
        )}
      </aside>
    </div>
  )
}
