import { useEffect, useState } from 'react'
import { normalizeEngineUrl } from './engineUrl'
import { useApp } from './useApp'

const CHECK_INTERVAL_MS = 30_000

type EngineState = { status: 'checking' } | { status: 'ok'; version: string } | { status: 'error' }

/** 起動時と30秒ごとにエンジンへ /version を問い合わせ、つながらなければ上部に案内を出す。 */
export function EngineBanner() {
  const { client, settings, saveSettings } = useApp()
  const [state, setState] = useState<EngineState>({ status: 'checking' })
  const [draft, setDraft] = useState(settings.engineUrl)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const check = () =>
      client.version().then(
        (version) => !cancelled && setState({ status: 'ok', version }),
        () => !cancelled && setState({ status: 'error' }),
      )
    void check()
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client, attempt])

  const apply = () => {
    const url = normalizeEngineUrl(draft)
    if (!url) {
      setUrlError('http:// または https:// で始まる URL を入力してください')
      return
    }
    setUrlError(null)
    setDraft(url)
    if (url === settings.engineUrl) {
      setAttempt((n) => n + 1)
      return
    }
    setState({ status: 'checking' })
    saveSettings({ ...settings, engineUrl: url }).catch((e: unknown) =>
      setUrlError(`URL を保存できませんでした: ${e instanceof Error ? e.message : String(e)}`),
    )
  }

  return (
    <div className={`engine-banner${state.status === 'error' ? ' error' : ''}`} role="status">
      {state.status === 'error' ? (
        <div className="engine-message">
          <p>
            VOICEVOX に接続できません（URL: {settings.engineUrl}）。VOICEVOX が起動しているか確認してください
          </p>
          <p className="detail">
            URL が正しいか、別のパソコンのエンジンなら CORS の許可（エンジンの設定）も確認してください。
          </p>
        </div>
      ) : (
        <span className="engine-status">
          VOICEVOX エンジン：{state.status === 'ok' ? `接続済み（${state.version}）` : '確認中…'}
        </span>
      )}
      <form
        className="engine-url"
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <label>
          <span>URL</span>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="VOICEVOX エンジンの URL" />
        </label>
        <button type="submit">{normalizeEngineUrl(draft) === settings.engineUrl ? '再接続' : '変更'}</button>
      </form>
      {urlError && <p className="url-error">{urlError}</p>}
    </div>
  )
}
