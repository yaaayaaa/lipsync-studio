import { useState } from 'react'
import { engineStatusLabel, useEngineStatus } from '../engine/useEngineStatus'
import { normalizeEngineUrl } from '../engineUrl'
import { errorMessage } from '../script/lineJobs'
import { useApp } from '../useApp'

/** VOICEVOX エンジンの URL と接続状態。URL が同じなら「再接続」で問い合わせ直す */
export function EngineSettingsPanel() {
  const { settings, saveSettings } = useApp()
  const { state, recheck } = useEngineStatus()
  const [draft, setDraft] = useState(settings.engineUrl)
  const [urlError, setUrlError] = useState<string | null>(null)

  const apply = () => {
    const url = normalizeEngineUrl(draft)
    if (!url) {
      setUrlError('http:// または https:// で始まる URL を入力してください')
      return
    }
    setUrlError(null)
    setDraft(url)
    if (url === settings.engineUrl) {
      recheck()
      return
    }
    saveSettings({ ...settings, engineUrl: url }).catch((e: unknown) =>
      setUrlError(`URL を保存できませんでした: ${errorMessage(e)}`),
    )
  }

  return (
    <section className="panel">
      <h2>VOICEVOX エンジン</h2>
      <form
        className="field engine-url"
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <span>URL</span>
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="VOICEVOX エンジンの URL" />
        <button type="submit">{normalizeEngineUrl(draft) === settings.engineUrl ? '再接続' : '変更'}</button>
      </form>
      {urlError && (
        <p className="notice error" role="alert">
          {urlError}
        </p>
      )}
      <p className={`engine-state ${state.status}`} role="status">
        状態：{engineStatusLabel(state)}
      </p>
      <p className="hint">
        既定は http://localhost:50021 です。別のパソコンのエンジンを使うときは、エンジン側で CORS の許可も必要です。
      </p>
    </section>
  )
}
