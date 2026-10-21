import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Download, Play, Redo2, RotateCcw, Square, Undo2 } from 'lucide-react'
import { iconProps } from '../icons'
import { newId } from '../../core/id'
import { clampTail, effectiveTail } from '../../core/export/tail'
import { lineProblem } from '../../core/storage/db'
import { useApp } from '../useApp'
import { LineCharacterSelects, LineTextArea } from '../script/LineFields'
import { LinePreview } from '../script/LinePreview'
import { PROBLEM_LABELS, appendLine, errorMessage, isAbortError } from '../script/lineJobs'
import { dropTuning } from '../script/lineText'
import { clampSpeed } from '../script/speed'
import { useExportJob } from '../script/useExportJob'
import { useLinePlayback } from '../script/useLinePlayback'
import { useRenderLine } from '../script/useRenderLine'
import { useScriptLines } from '../script/useScriptLines'
import { useSpeakLine } from '../script/useSpeakLine'
import type { SpeakLine } from '../script/useSpeakLine'
import { GlobalParams } from './GlobalParams'
import { LineEditorDock } from './LineEditorDock'
import { LineEditorList } from './LineEditorList'
import { PhraseEditor } from './PhraseEditor'
import type { PhraseEditorKind } from './PhraseEditor'
import { TailLengthPanel } from './TailLengthPanel'
import { setGlobalParam } from './editTuning'
import { isTextEntry, shortcutAction } from './history'
import { isPlayShortcut, ownsSpace } from './playShortcut'
import { useLineHistory } from './useLineHistory'
import { usePhraseAsync } from './usePhraseAsync'
import { useLineTuning } from './useLineTuning'

const REFRESHED_NOTICE = '声が変わったので高さと長さを取り直しました'

type ExportState = { lineId: string } & (
  | { state: 'exporting'; progress: number }
  | { state: 'done' | 'error' | 'aborted'; message: string }
)

/** 1行編集：行の一覧・セリフ・プレビュー・アクセント・高さ・長さ・数値・終端を、並べ替えられるパネルに置く */
export function LineEditorPage({ active }: { active: boolean }) {
  const { characters, settings } = useApp()
  const { lines, update, error: scriptError, editingLineId, openLineEditor, exportLocked } = useScriptLines()
  const locked = exportLocked

  const index = lines?.findIndex((l) => l.id === editingLineId) ?? -1
  const line = index >= 0 ? lines![index]! : null
  const character = characters.find((c) => c.id === line?.characterId)
  const styleId = character?.voice?.styleId ?? null
  const problem = line ? lineProblem(line, characters) : null

  const history = useLineHistory(lines)
  const { editLine, beginGesture, endGesture, undo, redo } = history
  const lineId = line?.id ?? null
  // 文の欄の操作（フォーカスから確定まで）の token
  const textGesture = useRef<number | null>(null)

  const tuning = useLineTuning({ line, styleId, locked, editLine })
  const { markRefreshed } = tuning

  // 声が変わって取り直したら、この画面にだけ知らせる
  const speakShared = useSpeakLine()
  const speak = useCallback<SpeakLine>((l, s) => speakShared(l, s, markRefreshed), [speakShared, markRefreshed])
  const playback = useLinePlayback(active, speak)
  const { exportSingle } = useRenderLine(speak)
  const job = useExportJob()

  // アクセント・高さ・長さは別々のパネルなので、取り直しの状態はここで持って3つに配る
  const phraseAsync = usePhraseAsync(lineId, tuning.changePhrases)

  // 結果の表示は、その行を開いている間だけ見せる
  const [playError, setPlayError] = useState<{ lineId: string; message: string } | null>(null)
  const [exportState, setExportState] = useState<ExportState | null>(null)

  // 別の行を開いたら、前の行の再生とプレビューは片付ける
  const { clearPreview } = playback
  useEffect(() => clearPreview(), [editingLineId, clearPreview])

  // Ctrl/Cmd+Z で取り消し、Ctrl/Cmd+Shift+Z と Ctrl+Y でやり直し。この画面を開いているときだけ。
  // 文の欄などで打っている最中はブラウザ標準の取り消しに任せる
  useEffect(() => {
    if (!active || lineId === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      const action = shortcutAction(e)
      if (!action || isTextEntry(e.target instanceof HTMLElement ? e.target : null)) return
      e.preventDefault()
      if (action === 'undo') undo(lineId)
      else redo(lineId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, lineId, undo, redo])

  const play = () => {
    if (!line) return
    const lineId = line.id
    setPlayError(null)
    playback.play(line, index + 1, 'preview', (message) => setPlayError({ lineId, message }))
  }
  const playing = playback.playing !== null && playback.playing.lineId === line?.id
  const canPlay = problem === null && !locked
  // 再生ボタン・停止ボタンと同じ条件で切り替える
  const togglePlayback = () => {
    if (playing) playback.stop()
    else if (canPlay) play()
  }

  // Space で再生と停止を切り替える（動画編集ソフトと同じ）。この画面を開いているときだけ。
  // 文の欄で打っている最中や、開いたドロップダウンの中では Space をそちらに任せる。
  // ボタンにフォーカスがあっても、Space はボタンを押さずに再生に使う（ボタンは Enter で押せる）
  const onSpace = useEffectEvent(togglePlayback)
  useEffect(() => {
    if (!active || lineId === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPlayShortcut(e)) return
      const target = e.target instanceof HTMLElement ? e.target : null
      if (isTextEntry(target) || ownsSpace(target)) return
      e.preventDefault()
      onSpace()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, lineId])

  if (!lines) {
    return (
      <div className="line-editor-page">
        <p className={scriptError ? 'app-message error' : 'app-message'}>{scriptError ?? 'セリフを読み込み中…'}</p>
      </div>
    )
  }

  const addLine = () => {
    const id = newId()
    update((prev) => appendLine(prev, characters, id))
    openLineEditor(id)
  }

  const exportLine = async () => {
    // アクセント句の取り直しを待つ間は始めない（結果が書き出しの途中に入らないように）
    if (!line || tuning.busy) return
    const lineId = line.id
    const signal = job.start()
    if (!signal) return
    playback.stop()
    setExportState({ lineId, state: 'exporting', progress: 0 })
    try {
      const r = await exportSingle(line, {
        signal,
        onProgress: (progress) => setExportState({ lineId, state: 'exporting', progress }),
        onRefreshed: markRefreshed,
      })
      setExportState({ lineId, state: 'done', message: `書き出しました：${r.fileName}` })
    } catch (e) {
      setExportState(
        isAbortError(e)
          ? { lineId, state: 'aborted', message: '書き出しを中止しました' }
          : { lineId, state: 'error', message: errorMessage(e) },
      )
    } finally {
      job.finish()
    }
  }

  const shownPlayError = playError && playError.lineId === line?.id ? playError.message : null
  const shownExport = exportState?.lineId === line?.id ? exportState : null
  const loading = playing && playback.playing!.loading
  // 合成中はプレビューの真ん中に出すので、下の一言は再生中だけ
  const caption = playing && !loading ? '再生中' : null
  const canTune = styleId !== null && line !== null && line.text.trim() !== ''

  // つまみのドラッグは、押してから離すまでを1件の履歴にまとめる（キーで動かしたときは1回ずつ）
  const startSliderGesture = (e: PointerEvent<HTMLElement>) => {
    const target = e.target
    if (!line || !(target instanceof HTMLInputElement) || target.type !== 'range') return
    // 文の欄にフォーカスがあれば、先に確定させる。押した後の既定の動作でフォーカスが外れるのを待つと、
    // 確定（作り込みを捨てる確認を含む）がつまみの操作に混ざってしまう
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused !== target && isTextEntry(focused)) focused.blur()
    const done = new AbortController()
    const token = beginGesture(line.id, () => done.abort())
    if (token === null) return
    // 確認の窓などで pointerup を取りこぼしても、待ち受けは次の操作が始まったときに外れる（cleanup）
    const finish = () => endGesture(token)
    window.addEventListener('pointerup', finish, { signal: done.signal })
    window.addEventListener('pointercancel', finish, { signal: done.signal })
  }

  const phraseEditor = (kind: PhraseEditorKind) =>
    line && (
      <PhraseEditor
        key={line.id}
        kind={kind}
        phrases={canTune ? (tuning.shown?.accentPhrases ?? null) : null}
        disabled={locked || !canTune}
        loadError={tuning.queryError}
        onRetry={tuning.retryQuery}
        onChange={(fn) => tuning.changeTuning((t) => ({ ...t, accentPhrases: fn(t.accentPhrases) }))}
        onChangeAsync={phraseAsync.run}
        busy={phraseAsync.busy}
        error={phraseAsync.error}
      />
    )

  /** 行がないときの各パネルの中身 */
  const noLine = <p className="hint">セリフ一覧の「行を追加」で行を作ると、ここで編集できます</p>

  const textPanel = line ? (
    <>
      {/* 打ち始めから確定（フォーカスを外す）までを1件の履歴にする。確定で作り込みを捨てたらそれも含む。
          作り込みと文が合っていない知らせのボタンは、押したら消えて blur が来ないので、操作にしない（1回ずつ積む） */}
      <div
        className="line-text-field"
        onFocus={(e) => {
          if (e.target instanceof HTMLTextAreaElement) textGesture.current = beginGesture(line.id)
        }}
        onBlur={() => {
          if (textGesture.current !== null) endGesture(textGesture.current)
          textGesture.current = null
        }}
      >
        <LineTextArea
          line={line}
          disabled={locked}
          label={`${index + 1}行目のセリフ`}
          rows={3}
          onEdit={(fn) => void editLine(line.id, fn)}
        />
      </div>
      <div className="line-controls">
        <LineCharacterSelects
          line={line}
          characters={characters}
          disabled={locked}
          onChange={(patch) => void editLine(line.id, (l) => ({ ...l, ...patch }))}
        />
      </div>
    </>
  ) : (
    noLine
  )

  const paramsPanel = (
    <GlobalParams
      speedScale={line?.speedScale ?? 1}
      values={tuning.shown}
      disabled={!line || locked}
      paramsDisabled={!canTune}
      status={
        tuning.stale
          ? '作り込みが文と合っていないため変えられません'
          : (tuning.error ?? tuning.queryError ?? (canTune && !tuning.shown ? '数値を取得中…' : null))
      }
      onSpeedChange={(v) => line && void editLine(line.id, (l) => ({ ...l, speedScale: clampSpeed(v) }))}
      onChange={(key, value) => tuning.changeTuning((t) => setGlobalParam(t, key, value))}
    />
  )

  const tailPanel = (
    <TailLengthPanel
      seconds={line ? effectiveTail(line, settings.export) : clampTail(settings.export.tailSeconds)}
      own={line?.tailSeconds !== undefined}
      disabled={!line || locked}
      onChange={(v) => line && void editLine(line.id, (l) => ({ ...l, tailSeconds: clampTail(v) }))}
      onReset={() =>
        line &&
        void editLine(line.id, (l) => {
          const { tailSeconds: _own, ...rest } = l
          return rest
        })
      }
    />
  )

  const previewPanel = (
    <>
      {scriptError && (
        <p className="notice error" role="alert">
          {scriptError}
        </p>
      )}
      {/* 開くと前の行か1行目が選ばれるので、行がないとき（一覧の「行を追加」で作る）以外は必ず中身がある */}
      {line ? (
        <>
          {problem && <p className="line-problem">{PROBLEM_LABELS[problem]}</p>}
          {tuning.refreshed && (
            <p className="notice" role="status">
              {REFRESHED_NOTICE}
            </p>
          )}
          <LinePreview
            frame={playback.preview}
            settings={settings.export}
            caption={caption}
            busy={loading}
            standalone={false}
            seek={{
              store: playback.position,
              enabled: (playing && !loading) || playback.canSeek(line),
              onSeek: (time) => playback.seek(line, time),
            }}
            controls={
              playing ? (
                <button
                  type="button"
                  className="transport-button"
                  aria-label={loading ? '合成中（押すと止める）' : '停止'}
                  title="停止（Space）"
                  onClick={playback.stop}
                >
                  <Square {...iconProps} size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  className="transport-button"
                  aria-label="再生"
                  title="再生（Space）"
                  disabled={!canPlay}
                  onClick={play}
                >
                  <Play {...iconProps} size={18} fill="currentColor" />
                </button>
              )
            }
          />
          <div className="line-editor-actions">
            {exportState?.state === 'exporting' ? (
              <button type="button" onClick={job.abort}>
                中止
              </button>
            ) : (
              <button
                type="button"
                disabled={problem !== null || locked || tuning.busy}
                onClick={() => void exportLine()}
              >
                <Download {...iconProps} />
                この行を書き出し
              </button>
            )}
            <span className="spacer" />
            <button
              type="button"
              disabled={!history.canUndo(line.id) || locked}
              aria-label="取り消し"
              title="取り消し（Ctrl/Cmd+Z）"
              onClick={() => undo(line.id)}
            >
              <Undo2 {...iconProps} />
            </button>
            <button
              type="button"
              disabled={!history.canRedo(line.id) || locked}
              aria-label="やり直し"
              title="やり直し（Ctrl/Cmd+Shift+Z、Ctrl+Y）"
              onClick={() => redo(line.id)}
            >
              <Redo2 {...iconProps} />
            </button>
            <button
              type="button"
              disabled={!line.tuning || locked}
              title="作り込みを捨てて、自動の状態に戻します"
              onClick={() => void editLine(line.id, dropTuning)}
            >
              <RotateCcw {...iconProps} />
              元に戻す
            </button>
          </div>
          {shownPlayError && (
            <p className="line-problem" role="alert">
              {shownPlayError}
            </p>
          )}
          {shownExport?.state === 'exporting' && (
            <p className="hint" role="status">
              書き出し中… <progress max={1} value={shownExport.progress} /> {Math.round(shownExport.progress * 100)}%
            </p>
          )}
          {shownExport && shownExport.state !== 'exporting' && (
            <p className={shownExport.state === 'error' ? 'line-problem' : 'hint'} role="status">
              {shownExport.message}
            </p>
          )}
        </>
      ) : (
        noLine
      )}
    </>
  )

  return (
    <div className="line-editor-page" onPointerDownCapture={startSliderGesture}>
      <LineEditorDock
        panels={{
          lines: (
            <LineEditorList
              lines={lines}
              selectedId={line?.id ?? null}
              locked={locked}
              onSelect={openLineEditor}
              onAdd={addLine}
            />
          ),
          text: textPanel,
          preview: previewPanel,
          accent: phraseEditor('accent'),
          pitch: phraseEditor('pitch'),
          length: phraseEditor('length'),
          params: paramsPanel,
          tail: tailPanel,
        }}
      />
    </div>
  )
}
