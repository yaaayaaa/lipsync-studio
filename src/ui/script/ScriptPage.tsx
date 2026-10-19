import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { iconProps } from '../icons'
import { prerenderMouthFrames } from '../../core/export/frames'
import { renderLineMp4 } from '../../core/export/encode'
import { exportLines, zipResults } from '../../core/export/exportAll'
import { creditText, lineFileName } from '../../core/export/naming'
import { newId } from '../../core/id'
import type { ScriptLine } from '../../core/character/types'
import { lineProblem } from '../../core/storage/db'
import { browserPlaybackEnv, startSamplePlayback } from '../character/samplePlayback'
import type { PlaybackHandle } from '../character/samplePlayback'
import { useApp } from '../useApp'
import { loadParsedPsd } from '../usePsd'
import { ExportSettingsPanel } from './ExportSettingsPanel'
import { LinePreview } from './LinePreview'
import type { PreviewFrame } from './LinePreview'
import { LineRow, SPEED_MAX, SPEED_MIN } from './LineRow'
import type { LineStatus, PlaybackMode } from './LineRow'
import { downloadBlob, errorMessage, isAbortError, resolveLine, synthesizeLine } from './lineJobs'
import { MouthFrameCache } from './mouthFrameCache'
import type { FramesLease } from './mouthFrameCache'

const SAVE_DEBOUNCE_MS = 300
const ZIP_NAME = 'zunda-lipsync.zip'

interface Playing {
  lineId: string
  mode: PlaybackMode
  loading: boolean
}

type Exporting =
  | { mode: 'one'; lineId: string }
  | { mode: 'all'; index: number; total: number; progress: number }

interface Rendered {
  fileName: string
  blob: Blob
  speakerName: string
}

function clampSpeed(v: number): number {
  return Number.isFinite(v) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, v)) : 1
}

/** 保存済みの行を読み込み、変更のたびに（300ms まとめて）保存する。 */
function useScript() {
  const { store } = useApp()
  const [lines, setLines] = useState<ScriptLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = useRef(false)
  const latest = useRef<ScriptLine[] | null>(null)

  useEffect(() => {
    let cancelled = false
    store.loadScript().then(
      (loaded) => !cancelled && setLines(loaded),
      (e: unknown) => !cancelled && setError(`セリフを読み込めませんでした: ${errorMessage(e)}`),
    )
    return () => {
      cancelled = true
    }
  }, [store])

  const save = useCallback(
    (toSave: ScriptLine[]) => {
      dirty.current = false
      store.saveScript(toSave).then(
        () => setError(null),
        (e: unknown) => setError(`セリフを保存できませんでした: ${errorMessage(e)}`),
      )
    },
    [store],
  )

  useEffect(() => {
    latest.current = lines
    if (!lines || !dirty.current) return
    const timer = setTimeout(() => save(lines), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [lines, save])

  // 画面を離れるときに、待っている保存を捨てない
  useEffect(
    () => () => {
      if (dirty.current && latest.current) save(latest.current)
    },
    [save],
  )

  const update = useCallback((fn: (prev: ScriptLine[]) => ScriptLine[]) => {
    dirty.current = true
    setLines((prev) => (prev ? fn(prev) : prev))
  }, [])

  return { lines, update, error }
}

export function ScriptPage({ active }: { active: boolean }) {
  const { client, characters, settings, store } = useApp()
  const { lines, update, error: scriptError } = useScript()

  const cache = useMemo(
    () =>
      new MouthFrameCache(async (character, expression) => {
        const { tree, psdSize } = await loadParsedPsd(store, character.id)
        const frames = await prerenderMouthFrames(tree, expression.visibility, character, psdSize)
        return { frames, psdSize }
      }),
    [store],
  )
  useEffect(() => () => cache.dispose(), [cache])

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

  const [playing, setPlaying] = useState<Playing | null>(null)
  const [preview, setPreview] = useState<PreviewFrame | null>(null)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  // 表示中のプレビューの画像は、次のプレビューまで閉じさせない
  const previewLease = useRef<FramesLease | null>(null)

  const stopPlayback = useCallback(() => {
    playbackRef.current?.cancel()
    playbackRef.current = null
    setPlaying(null)
  }, [])

  // 別のタブへ移ったら音を止める（後始末と表示の更新は handle.done の側で行う）
  useEffect(() => {
    if (!active) playbackRef.current?.cancel()
  }, [active])

  useEffect(
    () => () => {
      playbackRef.current?.cancel()
      previewLease.current?.release()
    },
    [],
  )

  const play = (line: ScriptLine, index: number, mode: PlaybackMode) => {
    stopPlayback()
    setStatus(line.id, null)
    let ready
    try {
      ready = resolveLine(line, characters, mode === 'listen')
    } catch (e) {
      setStatus(line.id, { state: 'error', message: errorMessage(e) })
      return
    }
    const { character, expression } = ready

    let lease: FramesLease | null = null
    if (mode === 'preview') {
      previewLease.current?.release()
      lease = cache.acquire(character, expression)
      previewLease.current = lease
      setPreview(null)
    }
    const isCurrent = () => playbackRef.current === handle

    const handle = startSamplePlayback(
      async () => {
        const [prepared, sample] = await Promise.all([
          lease?.frames,
          synthesizeLine(client, line, character.voice.styleId),
        ])
        if (prepared && isCurrent()) setPreview({ lineNumber: index + 1, prepared, vowel: 'closed' })
        return sample
      },
      browserPlaybackEnv,
      {
        onPlaying: () => isCurrent() && setPlaying({ lineId: line.id, mode, loading: false }),
        onMouth: (vowel) => {
          if (mode === 'preview' && isCurrent()) {
            setPreview((prev) => (prev && prev.vowel !== vowel ? { ...prev, vowel } : prev))
          }
        },
      },
    )
    playbackRef.current = handle
    setPlaying({ lineId: line.id, mode, loading: true })
    handle.done
      .catch((e: unknown) => {
        if (isCurrent()) setStatus(line.id, { state: 'error', message: errorMessage(e) })
      })
      .finally(() => {
        if (!isCurrent()) return
        playbackRef.current = null
        setPlaying(null)
        setPreview((prev) => prev && { ...prev, vowel: 'closed' })
      })
  }

  // ---- 書き出し ----

  const [exporting, setExporting] = useState<Exporting | null>(null)
  const [exportMessage, setExportMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [credit, setCredit] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  /** 1行分：合成と口の画像の用意を並行し、mp4 にする。 */
  const renderLine = async (
    line: ScriptLine,
    index: number,
    signal: AbortSignal,
    onProgress: (ratio: number) => void,
  ): Promise<Rendered> => {
    const { character, expression } = resolveLine(line, characters)
    const lease = cache.acquire(character, expression)
    try {
      const [{ frames, psdSize }, { wav, timeline }] = await Promise.all([
        lease.frames,
        synthesizeLine(client, line, character.voice.styleId),
      ])
      const blob = await renderLineMp4({ wav, timeline, frames, psdSize, settings: settings.export, onProgress, signal })
      return { fileName: lineFileName(index, character.name, line.text), blob, speakerName: character.voice.speakerName }
    } finally {
      lease.release()
    }
  }

  const beginExport = (state: Exporting) => {
    stopPlayback()
    const controller = new AbortController()
    abortRef.current = controller
    setExporting(state)
    setExportMessage(null)
    setCredit(null)
    return controller.signal
  }

  const endExport = () => {
    abortRef.current = null
    setExporting(null)
  }

  const exportOne = async (line: ScriptLine, index: number) => {
    const signal = beginExport({ mode: 'one', lineId: line.id })
    setStatus(line.id, { state: 'exporting', progress: 0 })
    try {
      const r = await renderLine(line, index, signal, (progress) => setStatus(line.id, { state: 'exporting', progress }))
      downloadBlob(r.blob, r.fileName)
      setStatus(line.id, { state: 'done', fileName: r.fileName })
      setCredit(creditText([r.speakerName]))
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
          const r = await renderLine(line, index, signal, (progress) => {
            setExporting({ mode: 'all', index, total, progress })
            setStatus(line.id, { state: 'exporting', progress })
          })
          speakers.set(line.id, r.speakerName)
          return r
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

  const addLine = () =>
    update((prev) => {
      const last = prev.at(-1)
      const character = characters.find((c) => c.id === last?.characterId) ?? characters[0]
      const expressionId =
        last && character?.id === last.characterId ? last.expressionId : (character?.expressions[0]?.id ?? null)
      return [
        ...prev,
        { id: newId(), text: '', characterId: character?.id ?? null, expressionId, speedScale: 1.0 },
      ]
    })

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

  const [copied, setCopied] = useState(false)
  const copyCredit = async () => {
    if (!credit) return
    try {
      await navigator.clipboard.writeText(credit)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setExportMessage({ text: `コピーできませんでした: ${errorMessage(e)}`, error: true })
    }
  }

  if (!lines) {
    return (
      <div className="script-page">
        <p className={scriptError ? 'app-message error' : 'app-message'}>{scriptError ?? 'セリフを読み込み中…'}</p>
      </div>
    )
  }

  const locked = exporting !== null
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
          {locked ? (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              中止
            </button>
          ) : (
            <button type="button" className="primary" disabled={lines.length === 0} onClick={() => void exportAll(lines)}>
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
              onMove={(delta) => moveLine(index, delta)}
              onRemove={() => removeLine(line.id)}
              onPlay={(mode) => play(line, index, mode)}
              onStop={stopPlayback}
              onExport={() => void exportOne(line, index)}
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
          <section className="panel">
            <h2>クレジット</h2>
            <p className="hint">動画の概要欄などに、使った声のクレジットを書いてください。</p>
            <div className="field">
              <input type="text" readOnly value={credit} aria-label="クレジット" onFocus={(e) => e.target.select()} />
              <button type="button" onClick={() => void copyCredit()}>
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}
