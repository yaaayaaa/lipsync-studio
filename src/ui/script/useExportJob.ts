import { useCallback, useEffect, useRef } from 'react'
import { useScriptLines } from './useScriptLines'

/**
 * 書き出し1回分の取り消し口と、画面をまたいだ書き出しの占有（claimExport）。
 * 画面が外されたら、進行中の書き出しは中止して占有を返す。
 */
export function useExportJob() {
  const { claimExport } = useScriptLines()
  const abortRef = useRef<AbortController | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      releaseRef.current?.()
    },
    [],
  )

  /** どちらかの画面で書き出し中なら null */
  const start = useCallback((): AbortSignal | null => {
    const release = claimExport()
    if (!release) return null
    releaseRef.current = release
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }, [claimExport])

  const finish = useCallback(() => {
    abortRef.current = null
    releaseRef.current?.()
    releaseRef.current = null
  }, [])

  const abort = useCallback(() => abortRef.current?.abort(), [])

  return { start, finish, abort }
}
