import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ScriptLine } from '../../core/character/types'
import { prerenderMouthFrames } from '../../core/export/frames'
import { useApp } from '../useApp'
import { loadParsedPsd } from '../usePsd'
import { errorMessage } from './lineJobs'
import { MouthFrameCache } from './mouthFrameCache'
import { ScriptContext } from './useScriptLines'
import type { ScriptContextValue } from './useScriptLines'

const SAVE_DEBOUNCE_MS = 300

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

/**
 * セリフの行と口の画像を、「セリフ」と「1行編集」の両方の画面で共有する。AppProvider の内側に置く。
 * タブの切り替えは App が持つので、1行編集を開くときは onOpenLineEditor でタブを移してもらう。
 */
export function ScriptProvider({ onOpenLineEditor, children }: { onOpenLineEditor(): void; children: ReactNode }) {
  const { store } = useApp()
  const { lines, update, error } = useScript()

  const frameCache = useMemo(
    () =>
      new MouthFrameCache(async (character, expression) => {
        const { tree, psdSize } = await loadParsedPsd(store, character.id)
        const frames = await prerenderMouthFrames(tree, expression.visibility, character, psdSize)
        return { frames, psdSize }
      }),
    [store],
  )
  useEffect(() => () => frameCache.dispose(), [frameCache])

  const [openedLineId, setOpenedLineId] = useState<string | null>(null)
  // 開いている行が消されたら未選択にする（覚えている ID は残るが、同じ ID の行は二度と現れない）
  const editingLineId = openedLineId !== null && lines?.some((l) => l.id === openedLineId) ? openedLineId : null

  const openLineEditor = useCallback(
    (lineId: string) => {
      setOpenedLineId(lineId)
      onOpenLineEditor()
    },
    [onOpenLineEditor],
  )

  const value = useMemo<ScriptContextValue>(
    () => ({ lines, error, update, frameCache, editingLineId, openLineEditor }),
    [lines, error, update, frameCache, editingLineId, openLineEditor],
  )
  return <ScriptContext.Provider value={value}>{children}</ScriptContext.Provider>
}
