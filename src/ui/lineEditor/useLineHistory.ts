import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { useScriptLines } from '../script/useScriptLines'
import { applySnapshot, emptyHistory, record, redo, sameSnapshot, snapshotOf, undo } from './history'
import type { History, HistoryAction, Snapshot } from './history'
import type { EditLine } from './useLineTuning'

/**
 * 1行編集の取り消しとやり直し。履歴は行ごとに、このページを開いている間だけ持つ（消された行の履歴は捨てる）。
 *
 * - ユーザーの編集はすべて editLine を通し、1回の editLine を1件として積む
 * - 続けて何度も変わる操作（つまみのドラッグ・文の入力）は、beginGesture〜endGesture の間を1件にまとめる。
 *   始めたときの状態を覚えておき、終わったときに変わっていれば積む
 * - 声の取り直しなど、ユーザーの編集でない書き込みは editLine を通さない（update を直に使う）ので積まれない
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

  const gesture = useRef<{ lineId: string; before: Snapshot } | null>(null)

  /** まとめていた操作を終え、変わっていれば1件として積む */
  const endGesture = useCallback(() => {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    recordIfChanged(g.lineId, g.before, latestLines.current?.find((l) => l.id === g.lineId))
  }, [recordIfChanged])

  /** ここから endGesture までの変更を1件にまとめる */
  const beginGesture = useCallback(
    (lineId: string) => {
      endGesture()
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (current) gesture.current = { lineId, before: snapshotOf(current) }
    },
    [endGesture],
  )

  /** 行の変更はすべてここを通す。変わったら true */
  const editLine = useCallback<EditLine>(
    (lineId, fn) => {
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (!current) return false
      const next = fn(current)
      if (next === current) return false
      write(lineId, current, next, fn)
      if (gesture.current?.lineId !== lineId) recordIfChanged(lineId, snapshotOf(current), next)
      return true
    },
    [write, recordIfChanged],
  )

  /** 取り消し・やり直し。書き出し中は何もしない。戻した状態は履歴に積まない */
  const step = useCallback(
    (lineId: string, action: HistoryAction) => {
      if (isExportLocked()) return
      endGesture()
      const current = latestLines.current?.find((l) => l.id === lineId)
      if (!current) return
      const result = (action === 'undo' ? undo : redo)(histories.current.get(lineId) ?? emptyHistory, snapshotOf(current))
      if (!result) return
      setHistory(lineId, result.history)
      write(lineId, current, applySnapshot(current, result.snapshot), (l) => applySnapshot(l, result.snapshot))
    },
    [isExportLocked, endGesture, setHistory, write],
  )

  // 消された行の履歴は捨てる（同じ ID の行は二度と現れない）
  useEffect(() => {
    if (!lines) return
    const ids = new Set(lines.map((l) => l.id))
    for (const id of histories.current.keys()) if (!ids.has(id)) histories.current.delete(id)
    if (gesture.current && !ids.has(gesture.current.lineId)) gesture.current = null
  }, [lines])

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
