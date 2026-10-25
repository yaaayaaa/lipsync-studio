import { useEffect, useState } from 'react'
import { DEFAULT_EXPORT_SETTINGS } from '../core/character/types'
import { checkEncodeSupport } from '../core/export/encode'
import { useApp } from './useApp'

/** H.264 + AAC で書き出せない環境なら、上部に案内を出す。対応可否は解像度だけで決まるので、解像度を変えたら確かめ直す。 */
export function SupportBanner() {
  const { settings } = useApp()
  const { width, height } = settings.export
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    checkEncodeSupport({ ...DEFAULT_EXPORT_SETTINGS, width, height }).then(
      (support) => !cancelled && setReason(support.ok ? null : (support.reason ?? '')),
      (e: unknown) => !cancelled && setReason(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      cancelled = true
    }
  }, [width, height])

  if (reason === null) return null
  return (
    <div className="support-banner" role="alert">
      <p>このパソコンでは mp4 を書き出せません。アプリを最新版にするか、グラフィックドライバーを更新してください</p>
      {reason && <p className="detail">{reason}</p>}
    </div>
  )
}
