import { Settings } from 'lucide-react'
import { useEngineStatus } from './engine/useEngineStatus'
import { iconProps } from './icons'
import { useApp } from './useApp'

/**
 * エンジンにつながらないときだけ、どの画面にいても気づけるよう上部に案内を出す。
 * URL は設定画面で変えるので、ここには設定画面への案内だけを置く。
 */
export function EngineBanner({ onOpenSettings }: { onOpenSettings(): void }) {
  const { settings } = useApp()
  const { state, recheck } = useEngineStatus()
  if (state.status !== 'error') return null

  return (
    <div className="engine-banner" role="alert">
      <div className="engine-message">
        <p>VOICEVOX に接続できません（URL: {settings.engineUrl}）。VOICEVOX が起動しているか確認してください</p>
        <p className="detail">
          URL が正しいか確認してください。別のパソコンのエンジンなら、そのパソコンで VOICEVOX のエンジンを --host
          0.0.0.0 を付けて起動してください。
        </p>
      </div>
      <div className="engine-actions">
        <button type="button" onClick={recheck}>
          再接続
        </button>
        <button type="button" onClick={onOpenSettings}>
          <Settings {...iconProps} />
          設定を開く
        </button>
      </div>
    </div>
  )
}
