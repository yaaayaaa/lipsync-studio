import { useEffect, useState } from 'react'
import { DEFAULT_EXPORT_SETTINGS } from '../core/character/types'
import { checkEncodeSupport } from '../core/export/encode'
import type { EncodeSupport } from '../core/export/encode'
import { encodeSupportMessage } from './supportMessage'
import { useApp } from './useApp'

/** H.264 + AAC で書き出せない環境なら、上部に案内を出す。対応可否は解像度だけで決まるので、解像度を変えたら確かめ直す。 */
export function SupportBanner() {
  const { settings } = useApp()
  const { width, height } = settings.export
  // null は書き出せる（または確かめている途中）
  const [problem, setProblem] = useState<EncodeSupport | null>(null)

  useEffect(() => {
    let cancelled = false
    checkEncodeSupport({ ...DEFAULT_EXPORT_SETTINGS, width, height }).then(
      (support) => !cancelled && setProblem(support.ok ? null : support),
      (e: unknown) => !cancelled && setProblem({ ok: false, reason: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [width, height])

  if (problem === null) return null
  return (
    <div className="support-banner" role="alert">
      <p>{encodeSupportMessage(problem, { width, height })}</p>
      {problem.reason && <p className="detail">{problem.reason}</p>}
    </div>
  )
}
