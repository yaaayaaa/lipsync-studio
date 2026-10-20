import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { useScriptLines } from '../script/useScriptLines'
import {
  applySnapshot,
  emptyHistory,
  finishGesture,
  gestureEntry,
  noGesture,
  noteGestureEdit,
  record,
  redo,
  sameSnapshot,
  snapshotOf,
  startGesture,
  undo,
} from './history'
import type { Gesture, History, HistoryAction, Snapshot } from './history'
import type { EditLine } from './useLineTuning'

/**
 * 1行編集の取り消しとやり直し。履歴は行ごとに、このページを開いている間だけ持つ（消された行の履歴は捨てる）。
 *
 * - ユーザーの編集はすべて editLine を通し、1回の editLine を1件として積む
 * - 続けて何度も変わる操作（つまみのドラッグ・文の入力から確定まで）は、beginGesture〜endGesture の間を1件にまとめる。
 *   操作は始めた側が token で持ち、その token でしか終わらない。積むのは操作の編集が変えた項目だけを戻す形
 * - 声の取り直しなど、ユーザーの編集でない書き込みは editLine を通さない（update を直に使う）ので積まれない。
 *   操作の途中に入っても、その項目は操作のものではないので、取り消しで巻き戻さない
 */
export function useLineHistory(lines: ScriptLine[] | null) {
  const { update, isExportLocked } = useScriptLines()

  // 最新の行。描画を待たずに続けて編集しても（確定の直後など）変わったかを正しく判断できるよう、
  // ここで変えたらすぐ入れる
  const latestLines = useRef(lines)
  useLayoutEffect(() => {
    latestLines.current = lines
  }, [lines])

  // 取り消しとやり直しはキーの連打でも描画を待たずに続けて効くよう、履歴は ref に置き、変えたら描画し直す
  const histories = useRef(new Map<string, History>())
  const [, changed] = useReducer((n: number) => n + 1, 0)
  const setHistory = useCallback((lineId: string, h: History) => {
    histories.current.set(lineId, h)
    changed()
  }, [])
  const historyOf = (lineId: string) => histories.current.get(lineId) ?? emptyHistory

  /** 行を書き換える（履歴には積まない） */
  const write = useCallback(
    (lineId: string, current: ScriptLine, next: ScriptLine, fn: (l: ScriptLine) => ScriptLine) => {
      latestLines.current = latestLines.current!.map((l) => (l === current ? next : l))
      update((prev) => prev.map((l) => (l.id === lineId ? fn(l) : l)))
    },
    [update],
  )

  /** 変わっていれば before を積む */
  const recordIfChanged = useCallback(
    (lineId: string, before: Snapshot, after: ScriptLine | undefined) => {
      if (!after || sameSnapshot(before, snapshotOf(after))) return
      setHistory(lineId, record(histories.current.get(lineId) ?? emptyHistory, before))
    },
    [setHistory],
  )

  const gestures = useRef(noGesture)
  // 操作ごとの後片付け（つまみの pointerup の待ち受けを外すなど）。操作がどう終わっても必ず呼ぶ
  const cleanups = useRef(new Map<number, () => void>())

  /** 終えた操作を、操作が変えた項目だけ戻す1件として積む */
  const close = useCallback(
    (g: Gesture | null) => {
      if (!g) return
      cleanups.current.get(g.token)?.()
      cleanups.current.delete(g.token)
      const after = latestLines.current?.find((l) => l.id === g.lineId)
      const entry = after ? gestureEntry(g, snapshotOf(after)) : null
      if (entry) setHistory(g.lineId, record(histories.current.get(g.lineId) ?? emptyHistory, entry))
    },
    [setHistory],
  )

  /** token の操作を終える。もう終わっている・別の操作に替わっていたら何もしない */
  const endGesture = useCallback(
    (token: number) => {
      const { state, ended } = finishGesture(gestures.current, token)
      gestures.current = state
      close(ended)
    },
    [close],
  )

  /** 途中の操作があれば終える（取り消しの前など） */
  const endCurrentGesture = useCallback(() => {
    const current = gestures.current.current
    if (current) endGesture(current.token)
  }, [endGesture])

  /**
   * ここから endGesture(token) までのこの行の変更を1件にまとめる。途中の操作は終える。
   * cleanup は操作が終わったとき（別の操作に替わったときも）に呼ぶ。行がなければ null
   */
  const beginGesture = useCallback(
    (lineId: string, cleanup?: () => void): number | null => {
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (!current) {
        cleanup?.()
        return null
      }
      const { state, token, ended } = startGesture(gestures.current, lineId, snapshotOf(current))
      gestures.current = state
      if (cleanup) cleanups.current.set(token, cleanup)
      close(ended)
      return token
    },
    [close],
  )

  /** 行の変更はすべてここを通す。変わったら true */
  const editLine = useCallback<EditLine>(
    (lineId, fn) => {
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (!current) return false
      const next = fn(current)
      if (next === current) return false
      write(lineId, current, next, fn)
      const g = gestures.current.current
      if (g?.lineId === lineId) {
        gestures.current = { ...gestures.current, current: noteGestureEdit(g, snapshotOf(current), snapshotOf(next)) }
      } else {
        recordIfChanged(lineId, snapshotOf(current), next)
      }
      return true
    },
    [write, recordIfChanged],
  )

  /** 取り消し・やり直し。書き出し中は何もしない。戻した状態は履歴に積まない */
  const step = useCallback(
    (lineId: string, action: HistoryAction) => {
      if (isExportLocked()) return
      endCurrentGesture()
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (!current) return
      const result = (action === 'undo' ? undo : redo)(histories.current.get(lineId) ?? emptyHistory, snapshotOf(current))
      if (!result) return
      setHistory(lineId, result.history)
      write(lineId, current, applySnapshot(current, result.snapshot), (l) => applySnapshot(l, result.snapshot))
    },
    [isExportLocked, endCurrentGesture, setHistory, write],
  )

  // 消された行の履歴は捨てる（同じ ID の行は二度と現れない）
  useEffect(() => {
    if (!lines) return
    const ids = new Set(lines.map((l) => l.id))
    for (const id of histories.current.keys()) if (!ids.has(id)) histories.current.delete(id)
    const g = gestures.current.current
    if (g && !ids.has(g.lineId)) endGesture(g.token)
  }, [lines, endGesture])

  return {
    editLine,
    beginGesture,
    endGesture,
    undo: useCallback((lineId: string) => step(lineId, 'undo'), [step]),
    redo: useCallback((lineId: string) => step(lineId, 'redo'), [step]),
    canUndo: (lineId: string | undefined) => lineId !== undefined && historyOf(lineId).past.length > 0,
    canRedo: (lineId: string | undefined) => lineId !== undefined && historyOf(lineId).future.length > 0,
  }
}
